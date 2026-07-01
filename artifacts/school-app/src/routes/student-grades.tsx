import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  GraduationCap, Save, FileText, BookOpen, School,
  Users, BarChart3, Loader2, RefreshCw, FileSpreadsheet, Printer,
} from "lucide-react";
import { toast } from "sonner";
import { exportWord } from "@/lib/report-word";
import { exportExcel } from "@/lib/report-excel";

const SEMESTER_LABEL: Record<number, string> = { 1: "الفصل الأول", 2: "الفصل الثاني" };

export const Route = createFileRoute("/student-grades")({ component: Page });

function Page() {
  const { user, loading, hasRole } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  return (
    <AppShell>
      <StudentGradesView
        canEdit={hasRole("admin", "teacher")}
        isAdmin={hasRole("admin")}
      />
    </AppShell>
  );
}

interface PhaseGrades {
  mid1: string;
  final1: string;
  mid2: string;
  final2: string;
}

function num(v: string): number | null {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}
function sum(...vals: (string | null | undefined)[]): number | null {
  const nums = vals.map(v => num(v ?? "")).filter((n): n is number => n !== null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0);
}
function fmt(n: number | null): string {
  if (n === null) return "—";
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

const MAX_PER_PHASE = 25;

// Stable empty-array sentinels — prevents useEffect infinite loops
// caused by `= []` destructuring defaults creating new references each render
const EMPTY_STUDENTS: any[] = [];
const EMPTY_GRADES: any[] = [];

function StudentGradesView({ canEdit, isAdmin }: { canEdit: boolean; isAdmin: boolean }) {
  const [stageId, setStageId] = useState("__all__");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [yearId, setYearId] = useState("");
  const [printDialogOpen, setPrintDialogOpen] = useState(false);

  /* ── Lookups ── */
  const { data: stages = [] } = useQuery({
    queryKey: ["stages-list"],
    queryFn: async () => {
      const { data } = await supabase.from("stages").select("id, name, stage_level").order("stage_level");
      return data ?? [];
    },
  });

  const { data: allClasses = [] } = useQuery({
    queryKey: ["classes-list-full"],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, name, section, grade_level, stage_id").order("grade_level");
      return data ?? [];
    },
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects-by-class", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data } = await supabase
        .from("subjects")
        .select("id, name")
        .eq("class_id", classId)
        .order("name");
      return data ?? [];
    },
  });

  const { data: academicYears = [] } = useQuery({
    queryKey: ["academic-years-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_years")
        .select("id, code, name")
        .order("created_at", { ascending: false });

      console.log("DATA:", data, "ERROR:", error);

      return data ?? [];
    },
  });


  
  /* Auto-select current year */
  useEffect(() => {
    if (academicYears.length === 0) return;
    if (yearId) return;

    setYearId(academicYears[0].id);
  }, [academicYears]);


  
  const filteredClasses = useMemo(() =>
    stageId === "__all__"
      ? allClasses
      : (allClasses as any[]).filter(c => c.stage_id === stageId),
    [allClasses, stageId]
  );

  const selectedClass = (allClasses as any[]).find(c => c.id === classId);
  const selectedSubject = (subjects as any[]).find(s => s.id === subjectId);
  const selectedYear = (academicYears as any[]).find(y => y.id === yearId);

  const ready = !!(classId && subjectId && yearId);

  /* ── Students in class ── */
  const { data: rawStudents, isLoading: loadingStudents } = useQuery({
    queryKey: ["students-for-grades", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data: enrollments } = await supabase
        .from("student_enrollments")
        .select("student_id, students(id, full_name, status)")
        .eq("class_id", classId)
        .eq("is_current", true);
      if (!enrollments) return EMPTY_STUDENTS;
      return (enrollments as any[])
        .map(e => e.students)
        .filter((s: any) => s && s.status === "active")
        .sort((a: any, b: any) => a.full_name.localeCompare(b.full_name, "ar"));
    },
  });
  const students = rawStudents ?? EMPTY_STUDENTS;

  /* ── Existing grades ── */
  const { data: rawGrades, isLoading: loadingGrades } = useQuery({
    queryKey: ["student-grades", classId, subjectId, yearId],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_grades")
        .select("student_id, mid1, final1, mid2, final2")
        .eq("class_id", classId)
        .eq("subject_id", subjectId)
        .eq("academic_year_id", yearId);
      if (error) {
        if (error.message.includes("does not exist") || error.code === "42P01") return EMPTY_GRADES;
        throw error;
      }
      return data ?? EMPTY_GRADES;
    },
  });
  // rawGrades is undefined while disabled/loading → use stable sentinel (not inline [])
  const existingGrades = rawGrades ?? EMPTY_GRADES;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="text-primary" size={26} />
             الكنترول ودرجات الطلاب
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            نظام تقييم متعدد المراحل — إدخال ومتابعة درجات الطلاب لكل مادة خلال العام الدراسي
          </p>
        </div>
        <Button
          className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white shadow"
          onClick={() => setPrintDialogOpen(true)}
        >
          <Printer size={16} /> طباعة النتائج
        </Button>
      </div>

      {/* Filters */}
      <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
        {/* Row 1: Stage + Class */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <School size={12} /> المرحلة الدراسية
            </label>
            <Select value={stageId} onValueChange={v => { setStageId(v); setClassId(""); }}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="جميع المراحل" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">جميع المراحل</SelectItem>
                {(stages as any[]).map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <School size={12} /> الصف الدراسي
            </label>
            <Select value={classId} onValueChange={v => { setClassId(v); setSubjectId(""); }}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="اختر الصف..." />
              </SelectTrigger>
              <SelectContent>
                {(filteredClasses as any[]).map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{c.section ? ` / ${c.section}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 2: Subject + Academic Year */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <BookOpen size={12} /> المادة الدراسية
            </label>
            <Select value={subjectId} onValueChange={setSubjectId} disabled={!classId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder={classId ? "اختر المادة..." : "اختر الصف أولاً"} />
              </SelectTrigger>
              <SelectContent>
                {(subjects as any[]).map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <BarChart3 size={12} /> العام الدراسي
            </label>
            <Select value={yearId} onValueChange={setYearId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="اختر العام..." />
              </SelectTrigger>
              <SelectContent>
                {(academicYears as any[]).map((y: any) => (
                  <SelectItem key={y.id} value={String(y.id)}>{y.code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Info bar */}
      {ready && selectedClass && selectedSubject && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="gap-1">
            <School size={11} /> {selectedClass.name}{selectedClass.section ? ` / ${selectedClass.section}` : ""}
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <BookOpen size={11} /> {selectedSubject.name}
          </Badge>
          {selectedYear && (
            <Badge variant="secondary" className="gap-1">
              <BarChart3 size={11} /> {selectedYear.name}
            </Badge>
          )}
          {loadingStudents || loadingGrades ? (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" /> جارٍ التحميل...
            </span>
          ) : (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Users size={12} /> {(students as any[]).length} طالب
            </span>
          )}
        </div>
      )}

      {/* Table */}
      {!ready ? (
        <div className="rounded-xl border bg-card p-16 text-center text-muted-foreground">
          <GraduationCap size={48} className="mx-auto mb-3 opacity-20" />
          <p className="text-lg font-medium">اختر الصف والمادة والعام الدراسي</p>
          <p className="text-sm mt-1">لعرض درجات الطلاب وإدخالها</p>
        </div>
      ) : (loadingStudents || loadingGrades) ? (
        <div className="rounded-xl border bg-card p-16 text-center text-muted-foreground">
          <Loader2 size={32} className="mx-auto mb-3 animate-spin opacity-40" />
          <p>جارٍ تحميل البيانات...</p>
        </div>
      ) : (students as any[]).length === 0 ? (
        <div className="rounded-xl border bg-card p-16 text-center text-muted-foreground">
          <Users size={48} className="mx-auto mb-3 opacity-20" />
          <p className="text-lg font-medium">لا يوجد طلاب في هذا الصف</p>
        </div>
      ) : (
        <GradesTable
          students={students as any[]}
          existingGrades={existingGrades as any[]}
          classId={classId}
          subjectId={subjectId}
          yearId={yearId}
          className={`${selectedClass?.name ?? ""}${selectedClass?.section ? ` / ${selectedClass.section}` : ""}`}
          subjectName={selectedSubject?.name ?? ""}
          yearName={selectedYear?.name ?? ""}
          canEdit={canEdit}
        />
      )}

      {/* SQL Migration Note */}
      <SQLMigrationNote />

      {/* Print Results Dialog */}
      {printDialogOpen && (
        <PrintResultsDialog
          stages={stages as any[]}
          allClasses={allClasses as any[]}
          academicYears={academicYears as any[]}
          defaultStageId={stageId !== "__all__" ? stageId : ""}
          defaultClassId={classId}
          defaultYearId={yearId}
          onClose={() => setPrintDialogOpen(false)}
        />
      )}
    </div>
  );
}

interface GradesTableProps {
  students: any[];
  existingGrades: any[];
  classId: string;
  subjectId: string;
  yearId: string;
  className: string;
  subjectName: string;
  yearName: string;
  canEdit: boolean;
}

function GradesTable({ students, existingGrades, classId, subjectId, yearId, className, subjectName, yearName, canEdit }: GradesTableProps) {
  const qc = useQueryClient();

  /* Build initial grades map from existing data */
  const buildInitial = (): Record<string, PhaseGrades> => {
    const map: Record<string, PhaseGrades> = {};
    for (const g of existingGrades) {
      map[g.student_id] = {
        mid1: g.mid1 !== null && g.mid1 !== undefined ? String(g.mid1) : "",
        final1: g.final1 !== null && g.final1 !== undefined ? String(g.final1) : "",
        mid2: g.mid2 !== null && g.mid2 !== undefined ? String(g.mid2) : "",
        final2: g.final2 !== null && g.final2 !== undefined ? String(g.final2) : "",
      };
    }
    return map;
  };

const [grades, setGrades] = useState<Record<string, PhaseGrades>>(() => buildInitial());
const [dirty, setDirty] = useState(false);

/* Reset when data changes */
useEffect(() => {
  setGrades(buildInitial());
  setDirty(false);
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [existingGrades]);


  
  function setGrade(studentId: string, phase: keyof PhaseGrades, value: string) {
    const current = grades[studentId] ?? { mid1: "", final1: "", mid2: "", final2: "" };
    setGrades(prev => ({ ...prev, [studentId]: { ...current, [phase]: value } }));
    setDirty(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      const rows = students.map(s => {
        const g = grades[s.id] ?? { mid1: "", final1: "", mid2: "", final2: "" };
        return {
          student_id: s.id,
          subject_id: subjectId,
          class_id: classId,
          academic_year_id: yearId,
          mid1: num(g.mid1),
          final1: num(g.final1),
          mid2: num(g.mid2),
          final2: num(g.final2),
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
      setDirty(false);
    },
    onError: (e: any) => toast.error(`فشل الحفظ: ${e.message}`),
  });

  /* Stats */
  const stats = useMemo(() => {
    const totals = students.map(s => {
      const g = grades[s.id] ?? {};
      return sum(g.mid1, g.final1, g.mid2, g.final2);
    }).filter((n): n is number => n !== null);
    if (totals.length === 0) return null;
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    return {
      count: totals.length,
      avg,
      highest: Math.max(...totals),
      lowest: Math.min(...totals),
      passing: totals.filter(n => n >= 50).length,
    };
  }, [grades, students]);

  /* Word Export */
  function handleExportWord() {
    const headers = ["#", "اسم الطالب", "المحصلة الأولى", "نهاية الفصل الأول", "مجموع الفصل الأول", "المحصلة الثانية", "نهاية الفصل الثاني", "مجموع الفصل الثاني", "المجموع النهائي"];
    const rows = students.map((s, i) => {
      const g = grades[s.id] ?? {};
      const t1 = sum(g.mid1, g.final1);
      const t2 = sum(g.mid2, g.final2);
      const total = sum(g.mid1, g.final1, g.mid2, g.final2);
      return [
        i + 1,
        s.full_name,
        fmt(num(g.mid1 ?? "")),
        fmt(num(g.final1 ?? "")),
        fmt(t1),
        fmt(num(g.mid2 ?? "")),
        fmt(num(g.final2 ?? "")),
        fmt(t2),
        fmt(total),
      ];
    });
    exportWord({
      title: `كشف درجات الصف ${className}`,
      subtitle: `المادة: ${subjectName}`,
      metaRows: [
        { label: "الصف", value: className },
        { label: "المادة", value: subjectName },
        { label: "العام الدراسي", value: yearName },
      ],
      headers,
      rows,
      sumColIndexes: [4, 7],
      totalColIndex: 8,
      fileName: `كشف درجات الصف ${className} - ${subjectName} - ${yearName}`,
    });
  }

  /* Excel Export */
  function handleExportExcel() {
    const headers = ["#", "اسم الطالب", "المحصلة الأولى", "نهاية الفصل الأول", "مجموع الفصل الأول", "المحصلة الثانية", "نهاية الفصل الثاني", "مجموع الفصل الثاني", "المجموع النهائي"];
    const rows = students.map((s, i) => {
      const g = grades[s.id] ?? {};
      const t1 = sum(g.mid1, g.final1);
      const t2 = sum(g.mid2, g.final2);
      const total = sum(g.mid1, g.final1, g.mid2, g.final2);
      return [
        i + 1,
        s.full_name,
        num(g.mid1 ?? "") ?? "",
        num(g.final1 ?? "") ?? "",
        t1 ?? "",
        num(g.mid2 ?? "") ?? "",
        num(g.final2 ?? "") ?? "",
        t2 ?? "",
        total ?? "",
      ];
    });
    const totalsArr = stats ? [
      { label: "عدد الطلاب المُقيَّمين", value: stats.count },
      { label: "المتوسط العام", value: stats.avg.toFixed(1) },
      { label: "أعلى مجموع", value: stats.highest },
      { label: "أدنى مجموع", value: stats.lowest },
    ] : [];
    exportExcel({
      title: `كشف درجات الصف ${className} - ${subjectName} - ${yearName}`,
      headers,
      rows,
      totals: totalsArr,
      fileName: `كشف درجات الصف ${className} - ${subjectName} - ${yearName}`,
    });
  }

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "الطلاب المُقيَّمون", value: `${stats.count} / ${students.length}`, color: "text-primary" },
            { label: "المتوسط العام", value: fmt(stats.avg), color: "text-blue-600" },
            { label: "أعلى مجموع", value: fmt(stats.highest), color: "text-emerald-600" },
            { label: "نسبة النجاح", value: `${Math.round((stats.passing / stats.count) * 100)}%`, color: "text-amber-600" },
          ].map(s => (
            <div key={s.label} className="rounded-lg border bg-card p-3 text-center">
              <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Action bar */}
      <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
        <div className="flex items-center justify-between gap-3 p-3 border-b bg-muted/30 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-blue-700 border-blue-300 hover:bg-blue-50"
              onClick={handleExportWord}
            >
              <FileText size={14} /> تصدير Word
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
              onClick={handleExportExcel}
            >
              <FileSpreadsheet size={14} /> تصدير Excel
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <RefreshCw size={11} /> يوجد تغييرات غير محفوظة
              </span>
            )}
            {canEdit && (
              <Button
                size="sm"
                className="gap-2"
                onClick={() => save.mutate()}
                disabled={save.isPending || !dirty}
              >
                {save.isPending
                  ? <><Loader2 size={13} className="animate-spin" /> جارٍ الحفظ...</>
                  : <><Save size={13} /> حفظ الدرجات</>}
              </Button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="px-3 py-2.5 text-center font-semibold border-l border-slate-600 w-10" rowSpan={2}>#</th>
                <th className="px-4 py-2.5 text-right font-semibold border-l border-slate-600 min-w-[180px]" rowSpan={2}>اسم الطالب</th>
                <th className="px-2 py-1.5 text-center font-semibold border-l border-slate-600" colSpan={3}>الفصل الأول</th>
                <th className="px-2 py-1.5 text-center font-semibold border-l border-slate-600" colSpan={3}>الفصل الثاني</th>
                <th className="px-3 py-2.5 text-center font-semibold bg-amber-700" rowSpan={2}>المجموع<br/>النهائي</th>
              </tr>
              <tr className="bg-slate-700 text-white text-xs">
                <th className="px-2 py-1.5 border-l border-slate-600 text-center font-medium">المحصلة الأولى<br/><span className="opacity-60">/ {20}</span></th>
                <th className="px-2 py-1.5 border-l border-slate-600 text-center font-medium">نهاية الفصل الأول<br/><span className="opacity-60">/ {30}</span></th>
                <th className="px-2 py-1.5 border-l border-slate-600 text-center font-semibold text-blue-300">مجموع<br/>الفصل الأول</th>
                <th className="px-2 py-1.5 border-l border-slate-600 text-center font-medium">المحصلة الثانية<br/><span className="opacity-60">/ {20}</span></th>
                <th className="px-2 py-1.5 border-l border-slate-600 text-center font-medium">نهاية الفصل الثاني<br/><span className="opacity-60">/ {30}</span></th>
                <th className="px-2 py-1.5 border-l border-slate-600 text-center font-semibold text-blue-300">مجموع<br/>الفصل الثاني</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s: any, i: number) => {
                const g = grades[s.id] ?? { mid1: "", final1: "", mid2: "", final2: "" };
                const t1 = sum(g.mid1, g.final1);
                const t2 = sum(g.mid2, g.final2);
                const total = sum(g.mid1, g.final1, g.mid2, g.final2);
                const totalPct = total !== null ? (total / (MAX_PER_PHASE * 4)) * 100 : null;
                const isFailing = totalPct !== null && totalPct < 50;
                const isEven = i % 2 === 0;

                return (
                  <tr
                    key={s.id}
                    className={`border-b transition-colors hover:bg-primary/5 ${
                      isFailing ? "bg-red-50/50" : isEven ? "bg-white" : "bg-slate-50/50"
                    }`}
                  >
                    <td className="px-3 py-2 text-center text-xs text-muted-foreground font-mono border-l">
                      {i + 1}
                    </td>
                    <td className="px-4 py-2 font-medium text-sm border-l">
                      {s.full_name}
                      {isFailing && total !== null && (
                        <span className="mr-2 text-[10px] text-red-500 font-normal">راسب</span>
                      )}
                    </td>

                    {/* Mid1 */}
                    <td className="px-2 py-1.5 border-l">
                      <GradeInput
                        value={g.mid1}
               max={20}
                readOnly={!canEdit}
                        onChange={v => setGrade(s.id, "mid1", v)}
                      />
                    </td>

                    {/* Final1 */}
                    <td className="px-2 py-1.5 border-l">
                      <GradeInput
                        value={g.final1}
                        max={30}
                        readOnly={!canEdit}
                        onChange={v => setGrade(s.id, "final1", v)}
                      />
                    </td>

                    {/* Term 1 Total */}
                    <td className="px-2 py-1.5 border-l text-center">
                      <span className={`inline-block min-w-[2rem] rounded px-2 py-0.5 text-sm font-bold ${
                        t1 !== null ? "bg-blue-100 text-blue-800" : "text-muted-foreground"
                      }`}>
                        {fmt(t1)}
                      </span>
                    </td>

                    {/* Mid2 */}
                    <td className="px-2 py-1.5 border-l">
                      <GradeInput
                        value={g.mid2}
                        max={20}
                        readOnly={!canEdit}
                        onChange={v => setGrade(s.id, "mid2", v)}
                      />
                    </td>

                    {/* Final2 */}
                    <td className="px-2 py-1.5 border-l">
                      <GradeInput
                        value={g.final2}
                      max={30}
                        readOnly={!canEdit}
                        onChange={v => setGrade(s.id, "final2", v)}
                      />
                    </td>

                    {/* Term 2 Total */}
                    <td className="px-2 py-1.5 border-l text-center">
                      <span className={`inline-block min-w-[2rem] rounded px-2 py-0.5 text-sm font-bold ${
                        t2 !== null ? "bg-blue-100 text-blue-800" : "text-muted-foreground"
                      }`}>
                        {fmt(t2)}
                      </span>
                    </td>

                    {/* Grand Total */}
                    <td className="px-3 py-1.5 text-center">
                      <span className={`inline-block min-w-[2.5rem] rounded-md px-2 py-1 text-sm font-black ${
                        total === null ? "text-muted-foreground" :
                        isFailing ? "bg-red-100 text-red-700" :
                        totalPct !== null && totalPct >= 85 ? "bg-emerald-100 text-emerald-700" :
                        "bg-amber-100 text-amber-800"
                      }`}>
                        {fmt(total)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {canEdit && (
          <div className="p-3 border-t bg-muted/20 flex justify-end">
            <Button
              size="sm"
              className="gap-2 min-w-[130px]"
              onClick={() => save.mutate()}
              disabled={save.isPending || !dirty}
            >
              {save.isPending
                ? <><Loader2 size={13} className="animate-spin" /> جارٍ الحفظ...</>
                : <><Save size={13} /> حفظ الدرجات</>}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function GradeInput({ value, max, readOnly, onChange }: {
  value: string;
  max: number;
  readOnly: boolean;
  onChange: (v: string) => void;
}) {
  const n = parseFloat(value);
  const isOver = !isNaN(n) && n > max;
  const isWeak = !isNaN(n) && (n / max) * 100 < 50;

  return (
    <Input
      type="number"
      min={0}
      max={max}
      step="0.5"
      value={value}
      readOnly={readOnly}
      onChange={e => {
        const v = e.target.value;
        if (v === "" || (parseFloat(v) >= 0 && parseFloat(v) <= max)) {
          onChange(v);
        }
      }}
      placeholder="—"
      className={`w-16 h-8 text-center text-sm font-semibold px-1 ${
        readOnly ? "bg-muted cursor-default" :
        isOver ? "border-red-400 bg-red-50 text-red-700" :
        isWeak && value !== "" ? "border-amber-300 bg-amber-50 text-amber-800" :
        value !== "" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : ""
      }`}
    />
  );
}

// ─── Print Results Dialog ─────────────────────────────────────────────────────
interface PrintResultsDialogProps {
  stages: any[];
  allClasses: any[];
  academicYears: any[];
  defaultStageId: string;
  defaultClassId: string;
  defaultYearId: string;
  onClose: () => void;
}

function PrintResultsDialog({
  stages, allClasses, academicYears,
  defaultStageId, defaultClassId, defaultYearId, onClose
}: PrintResultsDialogProps) {
  const [stageId, setStageId] = useState(defaultStageId);
  const [classId, setClassId] = useState(defaultClassId);
  const [semester, setSemester] = useState<1 | 2>(1);
  const [yearId, setYearId] = useState(defaultYearId || (academicYears[0]?.id ?? ""));
  const [isPrinting, setIsPrinting] = useState(false);

  const filteredClasses = useMemo(
    () => stageId ? allClasses.filter(c => c.stage_id === stageId) : allClasses,
    [allClasses, stageId]
  );

  const selectedClass = allClasses.find(c => c.id === classId);
  const selectedYear = academicYears.find(y => y.id === yearId);
  const selectedStage = stages.find(s => s.id === stageId);

  const ready = !!(classId && yearId);

  async function handlePrint() {
    if (!ready) return;
    setIsPrinting(true);
    try {
      // 1. Fetch students
      const { data: enrollments } = await supabase
        .from("student_enrollments")
        .select("student_id, students(id, full_name, status)")
        .eq("class_id", classId)
        .eq("is_current", true);

      const students = (enrollments ?? [])
        .map((e: any) => e.students)
        .filter((s: any) => s && s.status === "active")
        .sort((a: any, b: any) => a.full_name.localeCompare(b.full_name, "ar"));

      if (students.length === 0) {
        toast.error("لا يوجد طلاب في هذا الصف");
        return;
      }

      // 2. Fetch subjects for the class
      const { data: subjects } = await supabase
        .from("subjects")
        .select("id, name")
        .eq("class_id", classId)
        .order("name");

      // 3. Fetch ALL grades for this class + year (flat query, no nested joins)
      const { data: gradesRaw } = await supabase
        .from("student_grades")
        .select("student_id, subject_id, mid1, final1, mid2, final2")
        .eq("class_id", classId)
        .eq("academic_year_id", yearId);

      // Build a map: studentId -> subjectId -> grades
      const gradesMap: Record<string, Record<string, any>> = {};
      for (const g of (gradesRaw ?? [])) {
        if (!gradesMap[g.student_id]) gradesMap[g.student_id] = {};
        gradesMap[g.student_id][g.subject_id] = g;
      }

      // 4. Build print HTML
      const className = `${selectedClass?.name ?? ""}${selectedClass?.section ? ` / ${selectedClass.section}` : ""}`;
      const semesterLabel = SEMESTER_LABEL[semester];
      const yearLabel = selectedYear?.name ?? selectedYear?.code ?? "";
      const stageLabel = selectedStage?.name ?? "";

      const passMark = 50; // percentage

      const rows = students.map((s: any, idx: number) => {
        const sGrades = gradesMap[s.id] ?? {};
        const subjectResults = (subjects ?? []).map((sub: any) => {
          const g = sGrades[sub.id];
          if (!g) return { name: sub.name, mid: null, final: null, total: null };
          const mid = semester === 1 ? (g.mid1 ?? null) : (g.mid2 ?? null);
          const fin = semester === 1 ? (g.final1 ?? null) : (g.final2 ?? null);
          const total = (mid !== null && fin !== null) ? mid + fin : (mid ?? fin ?? null);
          return { name: sub.name, mid, final: fin, total };
        });

        const totalScore = subjectResults.reduce((sum: number, r) => sum + (r.total ?? 0), 0);
        const maxScore = subjectResults.length * 50;
        const pct = maxScore > 0 ? (totalScore / maxScore) * 100 : null;
        const passed = pct !== null && pct >= passMark;

        return { student: s, results: subjectResults, totalScore, maxScore, pct, passed, idx };
      });

      // ── A3 HTML Template ──────────────────────────────────────────────
      const subjectHeaders = (subjects ?? []).map((sub: any) =>
        `<th class="sub-h" colspan="3">${sub.name}</th>`
      ).join("") + `<th class="total-h" colspan="2">المجموع الكلي</th><th class="status-h">الحكم</th>`;

      const subHeaderSub = (subjects ?? []).map((_: any) =>
        `<th class="sub-sh">م.أولى</th><th class="sub-sh">نهاية</th><th class="sub-sh">مجموع</th>`
      ).join("") + `<th class="sub-sh">المجموع</th><th class="sub-sh">%</th><th class="sub-sh">النتيجة</th>`;

      const studentRows = rows.map(r => {
        const cells = r.results.map((res: any) => {
          const fmtN = (v: number | null) => v !== null ? (v % 1 === 0 ? String(v) : v.toFixed(1)) : "—";
          const totalCell = res.total !== null
            ? `<td class="grade-total">${fmtN(res.total)}</td>`
            : `<td class="grade-empty">—</td>`;
          return `<td class="grade">${fmtN(res.mid)}</td><td class="grade">${fmtN(res.final)}</td>${totalCell}`;
        }).join("");

        const pctText = r.pct !== null ? `${Math.round(r.pct)}%` : "—";
        const statusClass = r.passed ? "passed" : "failed";
        const statusText = r.passed ? "ناجح" : "راسب";

        return `
          <tr class="student-row">
            <td class="seq">${r.idx + 1}</td>
            <td class="name">${r.student.full_name}</td>
            ${cells}
            <td class="grade-total">${r.totalScore > 0 ? r.totalScore.toFixed(1) : "—"}</td>
            <td class="grade-pct">${pctText}</td>
            <td class="status ${statusClass}">${statusText}</td>
          </tr>`;
      }).join("");

      const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8" />
  <title>نتائج الطلاب — ${className}</title>
  <style>
    @page { size: A3 landscape; margin: 15mm 10mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; font-size: 10px; color: #111; background: #fff; direction: rtl; }
    
    .page { page-break-after: always; padding-bottom: 10mm; }
    .page:last-child { page-break-after: avoid; }

    /* ── Header ── */
    .header { text-align: center; border-bottom: 3px solid #1e3a5f; padding-bottom: 8px; margin-bottom: 10px; }
    .header .school-name { font-size: 18px; font-weight: 800; color: #1e3a5f; letter-spacing: 1px; }
    .header .doc-title { font-size: 14px; font-weight: 700; color: #c0392b; margin-top: 2px; }
    .header .meta { display: flex; justify-content: center; gap: 24px; margin-top: 6px; font-size: 11px; color: #444; }
    .header .meta span { background: #f0f4f8; padding: 2px 10px; border-radius: 12px; border: 1px solid #d0d8e4; }
    .header .meta strong { color: #1e3a5f; }

    /* ── Table ── */
    table { width: 100%; border-collapse: collapse; font-size: 9px; }
    th, td { border: 1px solid #bbb; text-align: center; padding: 3px 2px; vertical-align: middle; }

    th.seq-h, td.seq { width: 22px; background: #1e3a5f; color: #fff; font-weight: 700; }
    th.name-h, td.name { text-align: right; padding-right: 6px; font-weight: 600; min-width: 100px; max-width: 130px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    th.sub-h { background: #1e3a5f; color: #fff; font-weight: 700; font-size: 9px; }
    th.sub-sh { background: #2c5282; color: #cce; font-size: 8px; font-weight: 600; }

    th.total-h { background: #7b341e; color: #fff; font-weight: 700; }
    th.status-h { background: #276749; color: #fff; font-weight: 700; width: 36px; }

    td.grade { background: #f8fafc; }
    td.grade-total { background: #ebf4ff; font-weight: 700; color: #1a365d; }
    td.grade-pct { background: #f0fff4; font-weight: 600; color: #276749; }
    td.grade-empty { color: #aaa; }

    .student-row:nth-child(even) td { background-color: #f9f9fb; }
    .student-row:nth-child(even) td.grade-total { background: #dbeafe; }
    .student-row:nth-child(even) td.grade-pct { background: #dcfce7; }

    td.status { font-weight: 800; font-size: 10px; }
    td.passed { color: #065f46; background: #d1fae5; }
    td.failed { color: #991b1b; background: #fee2e2; }

    td.seq, td.name, td.grade, td.grade-total, td.grade-pct, td.status, td.grade-empty {
      border-color: #ccc;
    }

    /* ── Footer ── */
    .footer { margin-top: 10px; display: flex; justify-content: space-between; font-size: 9px; color: #666; border-top: 1px solid #ddd; padding-top: 6px; }
    .stats-bar { display: flex; gap: 16px; margin-top: 8px; flex-wrap: wrap; }
    .stat { background: #f0f4f8; border: 1px solid #d0d8e4; border-radius: 8px; padding: 4px 10px; font-size: 9px; }
    .stat strong { color: #1e3a5f; font-size: 11px; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="school-name">نظام إدارة المدرسة</div>
      <div class="doc-title">كشف نتائج الطلاب</div>
      <div class="meta">
        <span><strong>المرحلة:</strong> ${stageLabel || "—"}</span>
        <span><strong>الصف:</strong> ${className}</span>
        <span><strong>الفصل الدراسي:</strong> ${semesterLabel}</span>
        <span><strong>العام الدراسي:</strong> ${yearLabel}</span>
        <span><strong>عدد الطلاب:</strong> ${students.length}</span>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="seq-h" rowspan="2">#</th>
          <th class="name-h" rowspan="2">اسم الطالب</th>
          ${subjectHeaders}
        </tr>
        <tr>
          ${subHeaderSub}
        </tr>
      </thead>
      <tbody>
        ${studentRows}
      </tbody>
    </table>

    <div class="stats-bar">
      ${(() => {
        const passed = rows.filter(r => r.passed).length;
        const avg = rows.length > 0
          ? rows.reduce((s, r) => s + (r.pct ?? 0), 0) / rows.filter(r => r.pct !== null).length
          : 0;
        return `
          <div class="stat">عدد الطلاب: <strong>${rows.length}</strong></div>
          <div class="stat">الناجحون: <strong style="color:#065f46">${passed}</strong></div>
          <div class="stat">الراسبون: <strong style="color:#991b1b">${rows.length - passed}</strong></div>
          <div class="stat">نسبة النجاح: <strong>${rows.length > 0 ? Math.round((passed / rows.length) * 100) : 0}%</strong></div>
          <div class="stat">متوسط الدرجات: <strong>${isNaN(avg) ? "—" : avg.toFixed(1) + "%"}</strong></div>
        `;
      })()}
    </div>

    <div class="footer">
      <span>تاريخ الطباعة: ${new Date().toLocaleDateString("ar-EG")}</span>
      <span>نظام إدارة المدرسة — سري وللاستخدام الداخلي فقط</span>
    </div>
  </div>
</body>
</html>`;

      const win = window.open("", "_blank", "width=1400,height=900");
      if (!win) { toast.error("يرجى السماح بالنوافذ المنبثقة في المتصفح"); return; }
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); }, 600);
    } catch (e: any) {
      toast.error(`حدث خطأ أثناء الطباعة: ${e.message}`);
    } finally {
      setIsPrinting(false);
    }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Printer size={18} className="text-emerald-700" /> طباعة النتائج
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <p className="text-sm text-muted-foreground">
            اختر المرحلة والصف والفصل الدراسي لطباعة كشف النتائج الاحترافي لجميع الطلاب على ورقة A3.
          </p>

          {/* Row 1: Stage + Class */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm flex items-center gap-1"><School size={13} /> المرحلة الدراسية</Label>
              <Select value={stageId} onValueChange={v => { setStageId(v); setClassId(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر المرحلة..." />
                </SelectTrigger>
                <SelectContent>
                  {stages.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm flex items-center gap-1"><School size={13} /> الصف الدراسي <span className="text-destructive">*</span></Label>
              <Select value={classId} onValueChange={setClassId} disabled={filteredClasses.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الصف..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredClasses.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.section ? ` / ${c.section}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: Semester + Year */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">الفصل الدراسي <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-2 gap-2">
                {([1, 2] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSemester(s)}
                    className={`py-2 px-2 rounded-lg border text-xs font-semibold transition-all ${
                      semester === s
                        ? "bg-emerald-700 border-emerald-700 text-white shadow-sm"
                        : "bg-background border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {SEMESTER_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm flex items-center gap-1"><BarChart3 size={13} /> العام الدراسي <span className="text-destructive">*</span></Label>
              <Select value={yearId} onValueChange={setYearId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر العام..." />
                </SelectTrigger>
                <SelectContent>
                  {academicYears.map((y: any) => (
                    <SelectItem key={y.id} value={y.id}>{y.name || y.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview summary */}
          
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            className="gap-2 bg-emerald-700 hover:bg-emerald-800"
            onClick={handlePrint}
            disabled={!ready || isPrinting}
          >
            {isPrinting ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
            {isPrinting ? "جارٍ التحميل..." : "طباعة النتائج A3"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SQLMigrationNote() {
  const [show, setShow] = useState(false);
  const sql = `-- ============================================================
-- Migration: إنشاء جدول درجات الطلاب المتعدد المراحل
-- نفّذ هذا الكود في Supabase → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.student_grades (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id       UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  class_id         UUID NOT NULL REFERENCES public.classes(id)  ON DELETE CASCADE,
  academic_year_id UUID REFERENCES public.academic_years(id),
  mid1             NUMERIC(6,2),   -- المحصلة الأولى   (نصف الفصل الأول)
  final1           NUMERIC(6,2),   -- نهاية الفصل الأول
  mid2             NUMERIC(6,2),   -- المحصلة الثانية  (نصف الفصل الثاني)
  final2           NUMERIC(6,2),   -- نهاية الفصل الثاني
  max_marks        NUMERIC(6,2)    DEFAULT 100,
  created_at       TIMESTAMPTZ     DEFAULT now(),
  updated_at       TIMESTAMPTZ     DEFAULT now(),
  UNIQUE (student_id, subject_id, academic_year_id)
);

-- تمكين Row Level Security
ALTER TABLE public.student_grades ENABLE ROW LEVEL SECURITY;

-- السماح للمستخدمين المصادق عليهم بالقراءة والكتابة
CREATE POLICY "authenticated_full_access"
  ON public.student_grades
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- فهرس للأداء
CREATE INDEX IF NOT EXISTS idx_student_grades_class_subject_year
  ON public.student_grades (class_id, subject_id, academic_year_id);

-- تحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_student_grades_updated_at
  BEFORE UPDATE ON public.student_grades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();`;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center justify-between">
        <div>


          </div>

      </div>

    </div>
  );
}
