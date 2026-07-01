import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Plus, FileText, GraduationCap, Save, Search, Filter, X,
  CalendarDays, BookOpen, BarChart3, Printer, ClipboardList,
  Users, Loader2, School, ChevronLeft, Lock, Pencil, Trash2, AlertCircle,
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { printReport } from "@/lib/report-print";
import { exportExcel } from "@/lib/report-excel";

export const Route = createFileRoute("/exams")({ component: Page });

// ─── Only midterm & final ─────────────────────────────────────────────────────
const EXAM_TYPE_MAP: Record<string, { label: string; color: string; bg: string }> = {
  midterm: { label: "نصفي",  color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  final:   { label: "نهائي", color: "text-red-700",   bg: "bg-red-50 border-red-200" },
};

const SEMESTER_LABEL: Record<number, string> = { 1: "الفصل الأول", 2: "الفصل الثاني" };

// Stable empty-array sentinels — prevents useEffect infinite loops
// caused by `= []` destructuring defaults creating new references each render
const EMPTY_STUDENTS: any[] = [];
const EMPTY_GRADES: any[] = [];

// grade field mapping: (exam_type, semester) → column in student_grades
type GradeField = "mid1" | "final1" | "mid2" | "final2";
function getGradeField(examType: string, semester: number): GradeField {
  if (examType === "midterm" && semester === 1) return "mid1";
  if (examType === "final"   && semester === 1) return "final1";
  if (examType === "midterm" && semester === 2) return "mid2";
  return "final2"; // final + semester 2
}

const GRADE_FIELD_LABEL: Record<GradeField, string> = {
  mid1:   "المحصلة الأولى",
  final1: "نهاية الفصل الأول",
  mid2:   "المحصلة الثانية",
  final2: "نهاية الفصل الثاني",
};

const GRADE_FIELD_MAX: Record<GradeField, number> = {
  mid1: 20, final1: 30, mid2: 20, final2: 30,
};

function gradeLabel(pct: number) {
  if (pct >= 95) return { text: "ممتاز+", color: "text-emerald-600" };
  if (pct >= 85) return { text: "ممتاز",  color: "text-emerald-500" };
  if (pct >= 75) return { text: "جيد جداً", color: "text-blue-600" };
  if (pct >= 65) return { text: "جيد",    color: "text-blue-500" };
  if (pct >= 50) return { text: "مقبول",  color: "text-amber-600" };
  return { text: "راسب", color: "text-red-600" };
}

function Page() {
  const { user, loading, hasRole } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  return (
    <AppShell>
      <ExamsView canEdit={hasRole("admin", "teacher")} />
    </AppShell>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────
function ExamsView({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [gradingExam, setGradingExam] = useState<any | null>(null);
  const [editingExam, setEditingExam] = useState<any | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [semesterFilter, setSemesterFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const deleteExam = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("exams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف الامتحان بنجاح");
      qc.invalidateQueries({ queryKey: ["exams"] });
      setDeleteConfirmId(null);
    },
    onError: (e: any) => toast.error(`فشل الحذف: ${e.message}`),
  });

  const { data: exams, isLoading } = useQuery({
    queryKey: ["exams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("*, subjects(name), classes(name, section)")
        .order("exam_date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: classes } = useQuery({
    queryKey: ["classes-list"],
    queryFn: async () => (await supabase.from("classes").select("id, section, name").order("grade_level")).data ?? [],
  });

  const filtered = useMemo(() => (exams ?? []).filter(e => {
    if (classFilter !== "all" && e.class_id !== classFilter) return false;
    if (typeFilter !== "all" && e.exam_type !== typeFilter) return false;
    if (semesterFilter !== "all" && String(e.semester) !== semesterFilter) return false;
    if (search && !e.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [exams, classFilter, typeFilter, semesterFilter, search]);

  const summary = useMemo(() => {
    const counts: Record<string, number> = { midterm: 0, final: 0 };
    for (const e of (exams ?? [])) {
      if (e.exam_type === "midterm") counts.midterm++;
      if (e.exam_type === "final") counts.final++;
    }
    return counts;
  }, [exams]);

  const activeFilters = [
    classFilter !== "all", typeFilter !== "all", semesterFilter !== "all", !!search,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setClassFilter("all"); setTypeFilter("all"); setSemesterFilter("all"); setSearch("");
  };

  const handlePrintList = () => {
    printReport({
      title: "قائمة الامتحانات",
      headers: ["#", "عنوان الامتحان", "المادة", "الصف", "الفصل", "النوع", "حقل الدرجة", "التاريخ"],
      rows: filtered.map((e, i) => {
        const gf = e.exam_type && e.semester ? getGradeField(e.exam_type, e.semester) : null;
        return [
          i + 1,
          e.title,
          e.subjects?.name ?? "—",
          e.classes ? `${e.classes.name}${e.classes.section ? ` / ${e.classes.section}` : ""}` : "—",
          e.semester ? SEMESTER_LABEL[e.semester] : "—",
          EXAM_TYPE_MAP[e.exam_type]?.label ?? e.exam_type,
          gf ? GRADE_FIELD_LABEL[gf] : "—",
          e.exam_date ? new Date(e.exam_date).toLocaleDateString("ar-EG") : "—",
        ];
      }),
      recordCount: filtered.length,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="text-primary" size={26} />
            الامتحانات والدرجات
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">إنشاء امتحانات مرتبطة بسياق تربوي محدد وإدخال الدرجات ذكياً</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-2" onClick={handlePrintList}>
            <Printer size={14} /> طباعة القائمة
          </Button>
          <Link to="/student-grades">
            <Button variant="outline" size="sm" className="gap-2 text-primary border-primary/40 hover:bg-primary/5">
              <GraduationCap size={14} /> درجات الطلاب
            </Button>
          </Link>
          {canEdit && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus size={16} /> امتحان جديد
                </Button>
              </DialogTrigger>
              <AddExamDialog onClose={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["exams"] }); }} />
            </Dialog>
          )}
        </div>
      </div>

      {/* Summary cards — only midterm & final */}
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(EXAM_TYPE_MAP).map(([key, { label, color, bg }]) => {
          const count = summary[key] ?? 0;
          const isActive = typeFilter === key;
          return (
            <Card
              key={key}
              onClick={() => setTypeFilter(isActive ? "all" : key)}
              className={`p-4 cursor-pointer transition-all border-2 select-none hover:shadow-md ${
                isActive ? "border-primary shadow-sm scale-[1.01]" : "border-transparent hover:border-border"
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${bg}`}>
                <ClipboardList size={18} className={color} />
              </div>
              <div className="text-2xl font-bold">{count}</div>
              <div className={`text-xs font-medium mt-0.5 ${color}`}>{label}</div>
            </Card>
          );
        })}
      </div>

      {/* Filter Bar */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-primary" />
            <span className="text-sm font-semibold">تصفية الامتحانات</span>
            {activeFilters > 0 && (
              <Badge variant="secondary" className="text-xs">{activeFilters} فلاتر نشطة</Badge>
            )}
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            {showFilters ? "إخفاء الفلاتر ▲" : "إظهار الفلاتر ▼"}
          </button>
        </div>
        <div className="relative max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
          <Input
            className="pr-9"
            placeholder="بحث باسم الامتحان..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
            <div className="space-y-1.5">
              <Label className="text-xs">الصف</Label>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger><SelectValue placeholder="كل الصفوف" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الصفوف</SelectItem>
                  {(classes ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}{c.section ? ` / ${c.section}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">نوع الامتحان</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {Object.entries(EXAM_TYPE_MAP).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الفصل الدراسي</Label>
              <Select value={semesterFilter} onValueChange={setSemesterFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="1">الفصل الأول</SelectItem>
                  <SelectItem value="2">الفصل الثاني</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        {activeFilters > 0 && (
          <div className="mt-3 flex items-center justify-between pt-3 border-t">
            <Badge variant="outline" className="text-xs gap-1">
              <BarChart3 size={10} /> {filtered.length} امتحان
            </Badge>
            <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={clearFilters}>
              <X size={11} /> مسح الفلاتر
            </Button>
          </div>
        )}
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-8 text-center">#</TableHead>
                <TableHead>عنوان الامتحان</TableHead>
                <TableHead>المادة</TableHead>
                <TableHead>الصف</TableHead>
                <TableHead>الفصل</TableHead>
                <TableHead className="text-center">النوع</TableHead>
                <TableHead className="text-center">حقل الدرجة</TableHead>
                <TableHead className="text-center">التاريخ</TableHead>
                <TableHead className="w-36 text-center">إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    <Loader2 className="mx-auto mb-2 animate-spin opacity-40" size={28} />
                    جاري التحميل...
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-14 text-muted-foreground">
                    <FileText className="mx-auto mb-3 opacity-30" size={40} />
                    <p className="font-medium">لا توجد امتحانات</p>
                    <p className="text-xs mt-1 opacity-70">أنشئ امتحاناً جديداً أو غيّر معايير التصفية</p>
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((e: any, idx: number) => {
                const typeInfo = EXAM_TYPE_MAP[e.exam_type] ?? { label: e.exam_type, color: "text-muted-foreground", bg: "bg-muted" };
                const gf: GradeField | null = e.exam_type && e.semester ? getGradeField(e.exam_type, e.semester) : null;
                return (
                  <TableRow key={e.id} className="hover:bg-muted/20 transition-colors">
                    <TableCell className="text-center text-muted-foreground text-xs">{idx + 1}</TableCell>
                    <TableCell><span className="font-semibold text-sm">{e.title}</span></TableCell>
                    <TableCell>
                      {e.subjects?.name
                        ? <span className="text-sm px-2 py-0.5 rounded-md bg-muted">{e.subjects.name}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {e.classes
                        ? <span className="text-sm">{e.classes.name}{e.classes.section ? ` / ${e.classes.section}` : ""}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {e.semester ? SEMESTER_LABEL[e.semester] : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full border ${typeInfo.bg} ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {gf ? (
                        <span className="text-xs font-medium text-primary bg-primary/8 px-2 py-0.5 rounded">
                          {GRADE_FIELD_LABEL[gf]}
                        </span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground whitespace-nowrap">
                      {e.exam_date ? new Date(e.exam_date).toLocaleDateString("ar-EG") : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setGradingExam(e)}
                          className="gap-1.5 h-8 text-xs hover:bg-primary hover:text-primary-foreground transition-colors"
                        >
                          <GraduationCap size={13} /> {canEdit ? "إدخال الدرجات" : "عرض الدرجات"}
                        </Button>
                        {canEdit && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingExam(e)}
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10"
                              title="تعديل"
                            >
                              <Pencil size={13} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleteConfirmId(e.id)}
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              title="حذف"
                            >
                              <Trash2 size={13} />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {!isLoading && filtered.length > 0 && (
          <div className="px-4 py-2.5 border-t bg-muted/20 text-xs text-muted-foreground flex items-center justify-between">
            <span>إجمالي: <strong>{filtered.length}</strong> امتحان</span>
            <span>إجمالي في النظام: <strong>{(exams ?? []).length}</strong></span>
          </div>
        )}
      </Card>

      {gradingExam && (
        <ExamGradesDialog exam={gradingExam} canEdit={canEdit} onClose={() => setGradingExam(null)} />
      )}

      {editingExam && (
        <EditExamDialog
          exam={editingExam}
          onClose={() => { setEditingExam(null); qc.invalidateQueries({ queryKey: ["exams"] }); }}
        />
      )}

      <AlertDialog open={!!deleteConfirmId} onOpenChange={v => !v && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle size={18} /> تأكيد الحذف
            </AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذا الامتحان؟ سيتم حذف بيانات الامتحان نهائياً ولا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteConfirmId && deleteExam.mutate(deleteConfirmId)}
              disabled={deleteExam.isPending}
            >
              {deleteExam.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {deleteExam.isPending ? "جارٍ الحذف..." : "حذف نهائي"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Add Exam Dialog — Cascading Filters ─────────────────────────────────────
function AddExamDialog({ onClose }: { onClose: () => void }) {
  const [stageId, setStageId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [examType, setExamType] = useState<"midterm" | "final">("midterm");
  const [semester, setSemester] = useState<1 | 2>(1);
  const [title, setTitle] = useState("");
  const [examDate, setExamDate] = useState("");
  const [yearId, setYearId] = useState("");

  // Derived
  const gradeField = getGradeField(examType, semester);

  // Lookups
  const { data: stages = [] } = useQuery({
    queryKey: ["stages-list"],
    queryFn: async () => (await supabase.from("stages").select("id, name, stage_level").order("stage_level")).data ?? [],
  });

  const { data: allClasses = [] } = useQuery({
    queryKey: ["classes-list-full"],
    queryFn: async () => (await supabase.from("classes").select("id, name, section, stage_id").order("grade_level")).data ?? [],
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects-by-class", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data } = await supabase.from("subjects").select("id, name").eq("class_id", classId).order("name");
      return data ?? [];
    },
  });

  const { data: academicYears = [] } = useQuery({
    queryKey: ["academic-years-list"],
    queryFn: async () => (await supabase.from("academic_years").select("id, code, name").order("created_at", { ascending: false })).data ?? [],
  });

  // Auto-select current year
  useEffect(() => {
    if (!yearId && (academicYears as any[]).length > 0) {
      setYearId((academicYears as any[])[0].id);
    }
  }, [academicYears, yearId]);

  const filteredClasses = useMemo(
    () => stageId ? (allClasses as any[]).filter(c => c.stage_id === stageId) : (allClasses as any[]),
    [allClasses, stageId]
  );

  const selectedClass = (allClasses as any[]).find(c => c.id === classId);
  const selectedSubject = (subjects as any[]).find(s => s.id === subjectId);

  // Auto-generate title when context is complete
  useEffect(() => {
    if (selectedSubject && classId && examType && semester) {
      const typeLabel = EXAM_TYPE_MAP[examType].label;
      const semLabel = SEMESTER_LABEL[semester];
      setTitle(`امتحان ${typeLabel} ${semLabel} - ${selectedSubject.name}`);
    }
  }, [subjectId, examType, semester, selectedSubject, classId]);

  const add = useMutation({
    mutationFn: async () => {
      if (!classId) throw new Error("اختر الصف الدراسي");
      if (!subjectId) throw new Error("اختر المادة الدراسية");
      if (!title.trim()) throw new Error("أدخل عنوان الامتحان");

      // ── Duplicate prevention ──────────────────────────────────────────
      const dupQuery = supabase
        .from("exams")
        .select("id, title")
        .eq("class_id", classId)
        .eq("subject_id", subjectId)
        .eq("exam_type", examType)
        .eq("semester", semester);
      if (yearId) dupQuery.eq("academic_year_id", yearId);
      const { data: dup } = await dupQuery.maybeSingle();
      if (dup) {
        throw new Error(`يوجد امتحان مشابه بالفعل: "${dup.title}"\nلا يمكن إنشاء امتحان مكرر لنفس الصف والمادة والنوع والفصل.`);
      }

      const { error } = await supabase.from("exams").insert({
        title: title.trim(),
        subject_id: subjectId,
        class_id: classId,
        exam_type: examType,
        semester,
        academic_year_id: yearId || null,
        exam_date: examDate || null,
        total_marks: GRADE_FIELD_MAX[gradeField],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم إنشاء الامتحان بنجاح ✓");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const contextReady = !!(classId && subjectId);

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-lg">
          <ClipboardList size={18} className="text-primary" /> إنشاء امتحان جديد
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-5 py-1">

        {/* Step 1 — Cascading filters */}
        <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">الخطوة 1 — تحديد السياق التربوي</p>

          {/* Stage */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm">
              <School size={13} className="text-primary" /> المرحلة الدراسية <span className="text-destructive">*</span>
            </Label>
            <Select value={stageId} onValueChange={v => { setStageId(v); setClassId(""); setSubjectId(""); }}>
              <SelectTrigger><SelectValue placeholder="اختر المرحلة..." /></SelectTrigger>
              <SelectContent>
                {(stages as any[]).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Stage → Class */}
          <div className="flex items-center gap-2">
            <ChevronLeft size={14} className="text-muted-foreground shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <BookOpen size={13} className="text-primary" /> الصف الدراسي <span className="text-destructive">*</span>
              </Label>
              <Select
                value={classId}
                onValueChange={v => { setClassId(v); setSubjectId(""); }}
                disabled={!stageId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={stageId ? "اختر الصف..." : "اختر المرحلة أولاً"} />
                </SelectTrigger>
                <SelectContent>
                  {filteredClasses.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}{c.section ? ` / ${c.section}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Class → Subject */}
          <div className="flex items-center gap-2">
            <ChevronLeft size={14} className="text-muted-foreground shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <BookOpen size={13} className="text-primary" /> المادة الدراسية <span className="text-destructive">*</span>
              </Label>
              <Select value={subjectId} onValueChange={setSubjectId} disabled={!classId}>
                <SelectTrigger>
                  <SelectValue placeholder={classId ? "اختر المادة..." : "اختر الصف أولاً"} />
                </SelectTrigger>
                <SelectContent>
                  {(subjects as any[]).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Step 2 — Exam type & semester */}
        <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">الخطوة 2 — نوع الامتحان والفصل</p>

          <div className="grid grid-cols-2 gap-3">
            {/* Exam type */}
            <div className="space-y-1.5">
              <Label className="text-sm">نوع الامتحان <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(EXAM_TYPE_MAP).map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setExamType(k as "midterm" | "final")}
                    className={`py-2.5 px-3 rounded-lg border text-sm font-semibold transition-all ${
                      examType === k
                        ? `${v.bg} ${v.color} border-current shadow-sm`
                        : "bg-background border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Semester */}
            <div className="space-y-1.5">
              <Label className="text-sm">الفصل الدراسي <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-2 gap-2">
                {([1, 2] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSemester(s)}
                    className={`py-2.5 px-2 rounded-lg border text-xs font-semibold transition-all ${
                      semester === s
                        ? "bg-primary/10 border-primary text-primary shadow-sm"
                        : "bg-background border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {SEMESTER_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Grade field result — visual indicator */}
          <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 flex items-center gap-3">
            <GraduationCap size={16} className="text-primary shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">سيتم إدخال الدرجات في حقل:</p>
              <p className="font-bold text-primary">{GRADE_FIELD_LABEL[gradeField]}</p>
            </div>
            <div className="mr-auto text-xs text-muted-foreground">
              الدرجة العظمى: <strong className="text-foreground">{GRADE_FIELD_MAX[gradeField]}</strong>
            </div>
          </div>

          {/* Disabled fields indicator */}
          
  
          </div>

        {/* Step 3 — Details */}
        <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">الخطوة 3 — تفاصيل الامتحان</p>

          <div className="space-y-1.5">
            <Label className="text-sm">عنوان الامتحان <span className="text-destructive">*</span></Label>
            <Input
              placeholder="مثال: امتحان نصفي الفصل الأول - رياضيات"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm flex items-center gap-1"><CalendarDays size={12} /> تاريخ الامتحان</Label>
              <Input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm flex items-center gap-1"><BarChart3 size={12} /> العام الدراسي</Label>
              <Select value={yearId} onValueChange={setYearId}>
                <SelectTrigger><SelectValue placeholder="اختر العام..." /></SelectTrigger>
                <SelectContent>
                  {(academicYears as any[]).map((y: any) => (
                    <SelectItem key={y.id} value={y.id}>{y.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>إلغاء</Button>
        <Button
          onClick={() => add.mutate()}
          disabled={!contextReady || !title.trim() || add.isPending}
          className="gap-2"
        >
          {add.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          {add.isPending ? "جارٍ الحفظ..." : "إنشاء الامتحان"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Edit Exam Dialog ─────────────────────────────────────────────────────────
function EditExamDialog({ exam, onClose }: { exam: any; onClose: () => void }) {
  const [title, setTitle] = useState(exam.title ?? "");
  const [examDate, setExamDate] = useState(exam.exam_date ?? "");
  const [yearId, setYearId] = useState(exam.academic_year_id ?? "");

  const { data: academicYears = [] } = useQuery({
    queryKey: ["academic-years-list"],
    queryFn: async () => (await supabase.from("academic_years").select("id, code, name").order("created_at", { ascending: false })).data ?? [],
  });

  const typeInfo = EXAM_TYPE_MAP[exam.exam_type] ?? { label: exam.exam_type, color: "text-muted-foreground", bg: "bg-muted" };
  const gradeField: GradeField = exam.exam_type && exam.semester ? getGradeField(exam.exam_type, exam.semester) : "mid1";

  const update = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("أدخل عنوان الامتحان");
      const { error } = await supabase.from("exams").update({
        title: title.trim(),
        exam_date: examDate || null,
        academic_year_id: yearId || null,
      }).eq("id", exam.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تعديل الامتحان بنجاح ✓");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Pencil size={18} className="text-primary" /> تعديل الامتحان
          </DialogTitle>
        </DialogHeader>

        {/* Read-only context */}
        <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${typeInfo.bg} ${typeInfo.color}`}>
              {typeInfo.label}
            </span>
            {exam.semester && (
              <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{SEMESTER_LABEL[exam.semester]}</span>
            )}
            {exam.subjects?.name && (
              <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{exam.subjects.name}</span>
            )}
            {exam.classes && (
              <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                {exam.classes.name}{exam.classes.section ? ` / ${exam.classes.section}` : ""}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <GraduationCap size={11} />
            حقل الدرجة: <strong>{GRADE_FIELD_LABEL[gradeField]}</strong> — الدرجة العظمى: <strong>{GRADE_FIELD_MAX[gradeField]}</strong>
          </p>
        </div>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-sm">عنوان الامتحان <span className="text-destructive">*</span></Label>
            <Input
              placeholder="مثال: امتحان نصفي الفصل الأول - رياضيات"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm flex items-center gap-1"><CalendarDays size={12} /> تاريخ الامتحان</Label>
              <Input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm flex items-center gap-1"><BarChart3 size={12} /> العام الدراسي</Label>
              <Select value={yearId} onValueChange={setYearId}>
                <SelectTrigger><SelectValue placeholder="اختر العام..." /></SelectTrigger>
                <SelectContent>
                  {(academicYears as any[]).map((y: any) => (
                    <SelectItem key={y.id} value={y.id}>{y.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            onClick={() => update.mutate()}
            disabled={!title.trim() || update.isPending}
            className="gap-2"
          >
            {update.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {update.isPending ? "جارٍ الحفظ..." : "حفظ التعديلات"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Exam Grades Dialog — saves to student_grades with field lock ──────────────
function ExamGradesDialog({ exam, canEdit, onClose }: { exam: any; canEdit: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  // Determine which grade field this exam targets
  const gradeField: GradeField = exam.exam_type && exam.semester
    ? getGradeField(exam.exam_type, exam.semester)
    : "mid1";

  const maxMark = GRADE_FIELD_MAX[gradeField];
  const typeInfo = EXAM_TYPE_MAP[exam.exam_type] ?? { label: exam.exam_type, color: "text-muted-foreground", bg: "bg-muted" };

  // Grade state — keyed by student_id, value is string
  const [grades, setGrades] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  // Load students — use stable sentinel to avoid creating new [] on each render
  const { data: rawStudents, isLoading: loadingStudents } = useQuery({
    queryKey: ["students-for-exam", exam.class_id],
    queryFn: async () => {
      const { data: enrollments } = await supabase
        .from("student_enrollments")
        .select("student_id, students(id, full_name, status)")
        .eq("class_id", exam.class_id)
        .eq("is_current", true);
      if (!enrollments) return EMPTY_STUDENTS;
      return (enrollments as any[])
        .map(e => e.students)
        .filter((s: any) => s && s.status === "active")
        .sort((a: any, b: any) => a.full_name.localeCompare(b.full_name, "ar"));
    },
  });
  const students = rawStudents ?? EMPTY_STUDENTS;

  // Load existing student_grades — stable sentinel prevents useEffect loop
  const { data: rawGrades, isLoading: loadingGrades } = useQuery({
    queryKey: ["student-grades-for-exam", exam.class_id, exam.subject_id, exam.academic_year_id],
    enabled: !!(exam.class_id && exam.subject_id && exam.academic_year_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_grades")
        .select("student_id, mid1, final1, mid2, final2")
        .eq("class_id", exam.class_id)
        .eq("subject_id", exam.subject_id)
        .eq("academic_year_id", exam.academic_year_id);
      if (error) {
        if (error.code === "42P01") return EMPTY_GRADES;
        throw error;
      }
      return data ?? EMPTY_GRADES;
    },
  });
  // rawGrades is undefined while loading/disabled → use stable sentinel (not inline [])
  const existingGrades = rawGrades ?? EMPTY_GRADES;

  // Sync form state when server data arrives or gradeField changes.
  // existingGrades is now a stable reference, so this effect won't loop.
  useEffect(() => {
    const m: Record<string, string> = {};
    for (const row of existingGrades) {
      const v = (row as any)[gradeField];
      if (v !== null && v !== undefined) m[(row as any).student_id] = String(v);
    }
    setGrades(m);
    setDirty(false);
  }, [existingGrades, gradeField]);

  const save = useMutation({
    mutationFn: async () => {
      if (!exam.academic_year_id) throw new Error("الامتحان غير مرتبط بعام دراسي، يرجى تعديله أولاً");
      const rows = (students as any[]).map((s: any) => {
        // Get existing full row if available
        const existing = (existingGrades as any[]).find((g: any) => g.student_id === s.id) ?? {};
        const val = grades[s.id];
        return {
          student_id: s.id,
          subject_id: exam.subject_id,
          class_id: exam.class_id,
          academic_year_id: exam.academic_year_id,
          mid1:   gradeField === "mid1"   ? (val !== undefined && val !== "" ? Number(val) : null) : (existing.mid1   ?? null),
          final1: gradeField === "final1" ? (val !== undefined && val !== "" ? Number(val) : null) : (existing.final1 ?? null),
          mid2:   gradeField === "mid2"   ? (val !== undefined && val !== "" ? Number(val) : null) : (existing.mid2   ?? null),
          final2: gradeField === "final2" ? (val !== undefined && val !== "" ? Number(val) : null) : (existing.final2 ?? null),
        };
      });
      const { error } = await supabase
        .from("student_grades")
        .upsert(rows, { onConflict: "student_id,subject_id,academic_year_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ الدرجات بنجاح ✓");
      qc.invalidateQueries({ queryKey: ["student-grades"] });
      qc.invalidateQueries({ queryKey: ["student-grades-for-exam"] });
      setDirty(false);
    },
    onError: (e: any) => toast.error(`فشل الحفظ: ${e.message}`),
  });

  const filteredStudents = useMemo(
    () => (students as any[]).filter((s: any) => !search || s.full_name.includes(search)),
    [students, search]
  );

  const gradedCount = Object.values(grades).filter(v => v !== "").length;
  const totalStudents = (students as any[]).length;
  const progressPct = totalStudents > 0 ? Math.round((gradedCount / totalStudents) * 100) : 0;

  const stats = useMemo(() => {
    const nums = Object.values(grades).filter(v => v !== "").map(Number);
    if (nums.length === 0) return null;
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    const passing = nums.filter(n => (n / maxMark) * 100 >= 50).length;
    return {
      avg, highest: Math.max(...nums), lowest: Math.min(...nums),
      passing, total: nums.length,
    };
  }, [grades, maxMark]);

  const handlePrintGrades = () => {
    const rows = (students as any[]).map((s: any, i: number) => {
      const val = grades[s.id] ?? "";
      const n = val !== "" ? Number(val) : null;
      const pct = n !== null ? Math.round((n / maxMark) * 100) : null;
      const gl = pct !== null ? gradeLabel(pct) : null;
      return [i + 1, s.full_name, n !== null ? n : "—", maxMark, pct !== null ? `${pct}%` : "—", gl?.text ?? "—"];
    });
    printReport({
      title: `كشف درجات - ${exam.title}`,
      subtitle: [
        exam.subjects?.name && `المادة: ${exam.subjects.name}`,
        exam.classes && `الصف: ${exam.classes.name}${exam.classes.section ? ` / ${exam.classes.section}` : ""}`,
        `حقل الدرجة: ${GRADE_FIELD_LABEL[gradeField]}`,
        `الدرجة العظمى: ${maxMark}`,
        exam.semester ? `الفصل: ${SEMESTER_LABEL[exam.semester]}` : null,
      ].filter(Boolean).join("  |  "),
      headers: ["#", "اسم الطالب", "الدرجة", "من", "النسبة", "التقدير"],
      rows,
      totals: stats ? [
        { label: "المتوسط", value: `${stats.avg.toFixed(1)} / ${maxMark}` },
        { label: "نسبة النجاح", value: `${Math.round((stats.passing / stats.total) * 100)}%` },
        { label: "أعلى درجة", value: String(stats.highest) },
        { label: "أدنى درجة", value: String(stats.lowest) },
      ] : [],
      recordCount: totalStudents,
    });
  };

  const handleExportExcel = () => {
    const rows = (students as any[]).map((s: any, i: number) => {
      const val = grades[s.id] ?? "";
      const n = val !== "" ? Number(val) : null;
      const pct = n !== null ? Math.round((n / maxMark) * 100) : null;
      const gl = pct !== null ? gradeLabel(pct) : null;
      return [i + 1, s.full_name, n ?? "", maxMark, pct !== null ? `${pct}%` : "", gl?.text ?? ""];
    });
    exportExcel({
      title: exam.title,
      headers: ["#", "اسم الطالب", "الدرجة", "من", "النسبة", "التقدير"],
      rows,
      totals: stats ? [
        { label: "المتوسط", value: stats.avg.toFixed(1) },
        { label: "نسبة النجاح", value: `${Math.round((stats.passing / stats.total) * 100)}%` },
        { label: "أعلى درجة", value: stats.highest },
        { label: "أدنى درجة", value: stats.lowest },
      ] : [],
      fileName: exam.title,
    });
  };

  const isLoading = loadingStudents || loadingGrades;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden">

        {/* Header */}
        <div className="p-5 border-b bg-gradient-to-l from-primary/5 to-transparent">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold truncate">{exam.title}</h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border ${typeInfo.bg} ${typeInfo.color}`}>
                  {typeInfo.label}
                </span>
                {exam.semester && (
                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{SEMESTER_LABEL[exam.semester]}</span>
                )}
                {exam.subjects?.name && (
                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{exam.subjects.name}</span>
                )}
                {exam.classes && (
                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                    {exam.classes.name}{exam.classes.section ? ` / ${exam.classes.section}` : ""}
                  </span>
                )}
              </div>
            </div>
            {/* Active grade field indicator */}
            <div className="text-left shrink-0">
              <div className="text-xs text-muted-foreground mb-0.5">حقل الدرجة</div>
              <div className="font-bold text-primary text-sm">{GRADE_FIELD_LABEL[gradeField]}</div>
              <div className="text-xs text-muted-foreground">من {maxMark}</div>
            </div>
          </div>

          {/* Disabled fields */}
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock size={11} />
            <span>حقول معطّلة:</span>
            {(["mid1", "final1", "mid2", "final2"] as GradeField[])
              .filter(f => f !== gradeField)
              .map(f => (
                <span key={f} className="bg-muted px-1.5 py-0.5 rounded text-[10px]">{GRADE_FIELD_LABEL[f]}</span>
              ))}
          </div>
        </div>

        {/* Stats bar */}
        {stats && (
          <div className="grid grid-cols-4 divide-x divide-x-reverse border-b bg-muted/30 text-center">
            <div className="py-2.5 px-3">
              <div className="text-base font-bold text-primary">{stats.avg.toFixed(1)}</div>
              <div className="text-[10px] text-muted-foreground">المتوسط</div>
            </div>
            <div className="py-2.5 px-3">
              <div className="text-base font-bold text-emerald-600">
                {Math.round((stats.passing / stats.total) * 100)}%
              </div>
              <div className="text-[10px] text-muted-foreground">نسبة النجاح</div>
            </div>
            <div className="py-2.5 px-3">
              <div className="text-base font-bold text-blue-600">{stats.highest}</div>
              <div className="text-[10px] text-muted-foreground">أعلى درجة</div>
            </div>
            <div className="py-2.5 px-3">
              <div className="text-base font-bold text-red-500">{stats.lowest}</div>
              <div className="text-[10px] text-muted-foreground">أدنى درجة</div>
            </div>
          </div>
        )}

        {/* Progress */}
        <div className="px-5 py-3 border-b">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <Users size={13} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                تم إدخال <strong className="text-foreground">{gradedCount}</strong> من <strong className="text-foreground">{totalStudents}</strong> طالب
              </span>
            </div>
            <span className="text-xs font-bold text-primary">{progressPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 bg-gradient-to-l from-primary to-primary/70"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} />
            <Input
              className="pr-9 h-8 text-sm"
              placeholder="بحث عن طالب..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Students list */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-10 text-center text-muted-foreground">
              <Loader2 size={24} className="mx-auto mb-2 animate-spin opacity-40" />
              <p className="text-sm">جارٍ تحميل البيانات...</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">
              {search ? "لا يوجد طالب بهذا الاسم" : "لا يوجد طلاب في هذا الصف"}
            </div>
          ) : (
            <div className="divide-y">
              {filteredStudents.map((s: any, i: number) => {
                const val = grades[s.id] ?? "";
                const n = val !== "" ? Number(val) : null;
                const pct = n !== null ? Math.round((n / maxMark) * 100) : null;
                const gl = pct !== null ? gradeLabel(pct) : null;
                const isWeak = pct !== null && pct < 50;

                return (
                  <div
                    key={s.id}
                    className={`flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/20 ${
                      isWeak ? "bg-red-50/40" : val !== "" ? "bg-emerald-50/20" : ""
                    }`}
                  >
                    <span className="text-muted-foreground text-xs font-mono w-6 text-left shrink-0">{i + 1}</span>
                    <span className="flex-1 font-medium text-sm truncate">{s.full_name}</span>
                    {gl && (
                      <span className={`text-xs font-bold w-14 text-center shrink-0 ${gl.color}`}>{gl.text}</span>
                    )}
                    {pct !== null ? (
                      <span className={`text-xs w-10 text-center shrink-0 font-semibold ${gl?.color}`}>{pct}%</span>
                    ) : (
                      <span className="text-xs w-10 text-center shrink-0 text-muted-foreground">—</span>
                    )}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Input
                        type="number"
                        max={maxMark}
                        min={0}
                        className={`w-20 h-9 text-center font-bold text-sm ${
                          isWeak ? "border-red-300 bg-red-50 focus-visible:ring-red-400" :
                          val !== "" ? "border-emerald-300 bg-emerald-50 focus-visible:ring-emerald-400" : ""
                        }`}
                        placeholder="—"
                        value={val}
                        readOnly={!canEdit}
                        onChange={e => {
                          if (!canEdit) return;
                          const v = e.target.value;
                          if (v === "" || (Number(v) >= 0 && Number(v) <= maxMark)) {
                            setGrades(prev => ({ ...prev, [s.id]: v }));
                            setDirty(true);
                          }
                        }}
                      />
                      <span className="text-xs text-muted-foreground shrink-0">/ {maxMark}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t bg-muted/20 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={handlePrintGrades}>
              <Printer size={14} /> PDF
            </Button>
            <Button variant="outline" size="sm" className="gap-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50" onClick={handleExportExcel}>
              <FileText size={14} /> Excel
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-xs text-amber-600">يوجد تغييرات غير محفوظة</span>
            )}
            <Button variant="outline" onClick={onClose}>إغلاق</Button>
            {canEdit && (
              <Button
                onClick={() => save.mutate()}
                disabled={save.isPending || !dirty}
                className="gap-2 min-w-[130px]"
              >
                {save.isPending
                  ? <><Loader2 size={14} className="animate-spin" /> جارٍ الحفظ...</>
                  : <><Save size={14} /> حفظ الدرجات</>}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
