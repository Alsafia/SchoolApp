import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState, useMemo, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Search, Trash2, Pencil, GraduationCap,
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle,
  MapPin, ChevronLeft, ChevronRight, Printer,
} from "lucide-react";

import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { SearchableSelect, type SelectOption } from "@/components/searchable-select";

function printRtl(title: string, headers: string[], rows: string[][]) {
  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${title}</title><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,sans-serif;direction:rtl;padding:15mm;color:#111;font-size:10pt}
    h1{font-size:16pt;font-weight:bold;margin-bottom:6px}
    .meta{color:#777;font-size:9pt;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #ddd}
    table{width:100%;border-collapse:collapse}
    th{background:#1d4ed8;color:#fff;padding:8px 10px;text-align:right;font-size:10pt;font-weight:bold}
    td{padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:9.5pt}
    tr:nth-child(even){background:#f8fafc}
    @media print{body{padding:8mm}}
  </style></head><body>
  <h1>${title}</h1>
  <div class="meta">تاريخ الطباعة: ${new Date().toLocaleDateString('ar-YE')} &nbsp;|&nbsp; الإجمالي: ${rows.length} سجل</div>
  <table>
    <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c || '—'}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { alert('يرجى السماح بالنوافذ المنبثقة'); return; }
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 500);
}

export const Route = createFileRoute("/students")({ component: Page });

// ── Types ────────────────────────────────────────────────────────────────────
interface ClassRow {
  id: string;
  name: string;
  section: string | null;
  stage_id: string | null;
}

interface StageRow { id: string; name: string; }

interface Student {
  id: string;
  full_name: string;
  national_id: string | null;
  gender: "male" | "female";
  date_of_birth: string | null;
  status: "active" | "graduated" | "withdrawn";
  province_id: string | null;
  district_id: string | null;
  area_id:     string | null;
  village_id:  string | null;
  guardian_id: string | null;
  created_at:  string;
  guardians: { full_name: string; phone: string | null } | null;
  provinces: { name: string } | null;
  student_enrollments: {
    class_id: string;
    is_current: boolean;
    classes: { name: string; section: string | null } | null;
  }[];
}

const STATUS_OPTIONS = [
  { value: "all",       label: "كل الحالات" },
  { value: "active",    label: "نشط" },
  { value: "withdrawn", label: "منقطع" },
  { value: "graduated", label: "متخرج" },
];
const STATUS_LABELS: Record<string, string> = {
  active: "نشط", withdrawn: "منقطع", graduated: "متخرج",
};
const STATUS_COLORS: Record<string, string> = {
  active:    "bg-success/15 text-success border-success/30",
  withdrawn: "bg-destructive/15 text-destructive border-destructive/30",
  graduated: "bg-blue-100 text-blue-700 border-blue-200",
};
const GENDER_LABELS: Record<string, string> = { male: "ذكر", female: "أنثى" };

// ── Page ─────────────────────────────────────────────────────────────────────
function Page() {
  const { user, loading, hasRole } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  return (
    <AppShell>
      <StudentsView canEdit={hasRole("admin", "teacher")} />
    </AppShell>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────
function StudentsView({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("__all__");
  const [classFilter, setClassFilter] = useState("__all__");
  const [statusFilter, setStatusFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [provinceFilter, setProvinceFilter] = useState("__all__");
  const [openAdd, setOpenAdd] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);

  const { data: allStudents, isLoading, error: studentsError } = useQuery({
    queryKey: ["students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(`
          *,
          guardians(full_name, phone),
          provinces(name),
          student_enrollments!student_enrollments_student_id_fkey (
            class_id,
            is_current,
            classes (
              name,
              section
            )
          )
        `)
        .order("full_name", { ascending: true });

      if (error) throw error;
      return data as Student[];
    },
  });

  const { data: classes } = useQuery({
    queryKey: ["classes-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("id, name, section, stage_id, grade_level")
        .order("grade_level");
      return (data ?? []) as ClassRow[];
    },
  });

  const { data: stages } = useQuery({
    queryKey: ["stages-list"],
    queryFn: async () => {
      const { data } = await supabase.from("stages").select("id, name, stage_level").order("stage_level");
      return (data ?? []) as StageRow[];
    },
  });

  const { data: provinces } = useQuery({
    queryKey: ["provinces-list"],
    queryFn: async () => {
      const { data } = await supabase.from("provinces").select("id, name").order("name");
      return (data ?? []) as SelectOption[];
    },
  });

  // Classes filtered by selected stage (for the class filter dropdown)
  const classesForFilter = useMemo(
    () => stageFilter === "__all__"
      ? (classes ?? [])
      : (classes ?? []).filter((c) => c.stage_id === stageFilter),
    [classes, stageFilter],
  );

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("students").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحذف بنجاح");
      qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const currentEnrollment = (s: Student) =>
    s.student_enrollments?.find((e) => e.is_current) ?? s.student_enrollments?.[0] ?? null;

  const filtered = useMemo(() => {
    return (allStudents ?? []).filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (genderFilter !== "all" && s.gender !== genderFilter) return false;
      if (provinceFilter !== "__all__" && s.province_id !== provinceFilter) return false;
      if (stageFilter !== "__all__" || classFilter !== "__all__") {
        const enr = currentEnrollment(s);
        if (classFilter !== "__all__") {
          if (!enr || enr.class_id !== classFilter) return false;
        } else if (stageFilter !== "__all__") {
          // filter by stage via the class's stage_id
          const cls = (classes ?? []).find(c => c.id === enr?.class_id);
          if (!cls || cls.stage_id !== stageFilter) return false;
        }
      }
      if (search && !s.full_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [allStudents, stageFilter, classFilter, statusFilter, genderFilter, provinceFilter, search, classes]);

  const counts = useMemo(() => ({
    total:     (allStudents ?? []).length,
    active:    (allStudents ?? []).filter(s => s.status === "active").length,
    withdrawn: (allStudents ?? []).filter(s => s.status === "withdrawn").length,
    graduated: (allStudents ?? []).filter(s => s.status === "graduated").length,
  }), [allStudents]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">الطلاب</h1>
          <p className="text-muted-foreground mt-1">إدارة بيانات الطلاب وتسجيلهم</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => {
            const headers = ["الاسم", "الجنس", "الصف", "المحافظة", "هاتف ولي الأمر", "الحالة"];
            const rows = filtered.map(s => {
              const enr = currentEnrollment(s);
              return [
                s.full_name,
                GENDER_LABELS[s.gender] ?? s.gender,
                enr?.classes ? `${enr.classes.name}${enr.classes.section ? ` / ${enr.classes.section}` : ""}` : "",
                s.provinces?.name ?? "",
                s.guardians?.phone ?? "",
                STATUS_LABELS[s.status] ?? s.status,
              ];
            });
            printRtl("قائمة الطلاب", headers, rows);
          }}>
            <Printer className="ml-2" size={16} /> طباعة
          </Button>
          {canEdit && (
            <>
              <Button variant="outline" onClick={() => setOpenImport(true)}>
                <FileSpreadsheet className="ml-2" size={16} /> استيراد Excel
              </Button>
              <Button onClick={() => setOpenAdd(true)}>
                <Plus className="ml-2" size={16} /> طالب جديد
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Error display */}
      {studentsError && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">
          خطأ في تحميل بيانات الطلاب: {(studentsError as any).message}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "إجمالي الطلاب", value: counts.total,     color: "text-foreground" },
          { label: "نشط",           value: counts.active,    color: "text-success" },
          { label: "منقطع",         value: counts.withdrawn, color: "text-destructive" },
          { label: "متخرج",         value: counts.graduated, color: "text-blue-600" },
        ].map((s) => (
          <Card key={s.label} className="p-3 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم..." className="pr-9" />
          </div>
          <Select value={provinceFilter} onValueChange={setProvinceFilter}>
            {/* تجريب زيدون */}
            <div className="flex gap-2 items-center">

              {/* المرحلة */}
              <Select
                value={stageFilter}
                onValueChange={(v) => {
                  setStageFilter(v);
                  setClassFilter("__all__");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="المرحلة الدراسية" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="__all__">كل المراحل</SelectItem>

                  {(stages ?? []).map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* الصفوف */}
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="كل الصفوف" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="__all__">كل الصفوف</SelectItem>

                  {classesForFilter.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.section ? ` / ${c.section}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* الحالة */}
              

            </div>
            {/* اخر الكود تجريب زيدون  */}
            
            
            </Select>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="الحالة" /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={genderFilter} onValueChange={setGenderFilter}>
              <SelectTrigger className="w-28"><SelectValue placeholder="الجنس" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الجنسان</SelectItem>
                <SelectItem value="male">ذكر</SelectItem>
                <SelectItem value="female">أنثى</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <span className="font-semibold text-sm">
            {filtered.length} طالب{" "}
            {filtered.length !== (allStudents ?? []).length
              ? `(من ${(allStudents ?? []).length})`
              : ""}
          </span>
        </div>
        <div className="overflow-x-auto">
          <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[190px]">الطالب</TableHead>
                <TableHead className="w-[70px]">المحافظة</TableHead>
                <TableHead className="w-[50px]">الصف</TableHead>
                <TableHead className="w-[40px]">الجنس</TableHead>
                <TableHead className="w-[80px]">هاتف ولي الأمر</TableHead>
                <TableHead className="w-[50px]">الحالة</TableHead>
                {canEdit && <TableHead className="w-24"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    <GraduationCap className="mx-auto mb-2 opacity-30" size={32} />
                    جاري التحميل...
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    <GraduationCap className="mx-auto mb-2 opacity-30" size={32} />
                    لا يوجد طلاب مطابقون
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((s) => {
                const enr = currentEnrollment(s);
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm shrink-0">
                          {s.full_name[0]}
                        </div>
                        <div className="font-medium text-sm">{s.full_name}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.provinces?.name
                        ? <span className="flex items-center gap-1">
                            <MapPin size={12} className="text-primary/60" />
                            {s.provinces.name}
                          </span>
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {enr?.classes
                        ? `${enr.classes.name}${enr.classes.section ? ` / ${enr.classes.section}` : ""}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{GENDER_LABELS[s.gender] ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground" dir="ltr">
                      {s.guardians?.phone ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_COLORS[s.status] ?? ""}>
                        {STATUS_LABELS[s.status] ?? s.status}
                      </Badge>
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => setEditing(s)}>
                            <Pencil size={14} />
                          </Button>
                          <ConfirmDelete
                            onConfirm={() => del.mutate(s.id)}
                            trigger={
                              <Button size="icon" variant="ghost">
                                <Trash2 size={14} className="text-destructive" />
                              </Button>
                            }
                          />
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {openAdd && (
        <AddStudentWizard classes={classes ?? []} stages={stages ?? []} onClose={() => setOpenAdd(false)} />
      )}
      {editing && (
        <EditStudentDialog student={editing} classes={classes ?? []} onClose={() => setEditing(null)} />
      )}
      {openImport && (
        <BulkImportDialog classes={classes ?? []} onClose={() => setOpenImport(false)} />
      )}
    </div>
  );
}

// ── Location hook ─────────────────────────────────────────────────────────────
interface LocationState {
  province_id: string;
  district_id: string;
  area_id:     string;
  village_id:  string;
}

function useLocationData(loc: LocationState) {
  const { data: provinces } = useQuery({
    queryKey: ["provinces-list"],
    queryFn: async () => {
      const { data } = await supabase.from("provinces").select("id, name").order("name");
      return (data ?? []) as SelectOption[];
    },
  });
  const { data: districts, isLoading: loadingDistricts } = useQuery({
    queryKey: ["districts-by-province", loc.province_id],
    enabled: !!loc.province_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("districts").select("id, name")
        .eq("province_id", loc.province_id).order("name");
      return (data ?? []) as SelectOption[];
    },
  });
  const { data: areas, isLoading: loadingAreas } = useQuery({
    queryKey: ["areas-by-district", loc.district_id],
    enabled: !!loc.district_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("areas").select("id, name")
        .eq("district_id", loc.district_id).order("name");
      return (data ?? []) as SelectOption[];
    },
  });
  return { provinces, districts, areas, loadingDistricts, loadingAreas };
}

// ── Add Student Wizard ────────────────────────────────────────────────────────
interface Step1Data {
  full_name:     string;
  gender:        "male" | "female";
  date_of_birth: string;
  stage_id:      string;
  class_id:      string;
}

function AddStudentWizard({ classes, stages, onClose }: {
  classes: ClassRow[];
  stages: StageRow[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);

  const [step1, setStep1] = useState<Step1Data>({
    full_name: "", gender: "male", date_of_birth: "", stage_id: "", class_id: "",
  });

  const [guardianName, setGuardianName]   = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [loc, setLocState] = useState<LocationState>({
    province_id: "", district_id: "", area_id: "", village_id: "",
  });
  const setLoc = (patch: Partial<LocationState>) =>
    setLocState((p) => ({ ...p, ...patch }));

  const [villageSearch, setVillageSearch] = useState("");

  // Fetch stages directly inside the wizard to guarantee fresh data
  const { data: stagesData } = useQuery({
    queryKey: ["stages-list"],
    queryFn: async () => {
      const { data } = await supabase.from("stages").select("id, name,stage_level").order("stage_level");
      return (data ?? []) as StageRow[];
    },
  });
  // Use fetched data; fall back to prop if query is still loading
  const resolvedStages = stagesData && stagesData.length > 0 ? stagesData : stages;

  const filteredClasses = useMemo(
    () => step1.stage_id ? classes.filter((c) => c.stage_id === step1.stage_id) : classes,
    [classes, step1.stage_id],
  );

  const { provinces, districts, areas, loadingDistricts, loadingAreas } = useLocationData(loc);

  const { data: villages, isLoading: loadingVillages } = useQuery({
    queryKey: ["villages-search", loc.area_id, villageSearch],
    enabled: !!loc.area_id && villageSearch.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("villages").select("id, name")
        .eq("area_id", loc.area_id)
        .ilike("name", `%${villageSearch}%`)
        .limit(20);
      return (data ?? []) as SelectOption[];
    },
  });

  function goNext() {
    if (!step1.full_name.trim()) { toast.error("الاسم الكامل مطلوب"); return; }
    if (!step1.class_id) { toast.error("الصف الدراسي مطلوب"); return; }
    setStep(2);
  }

  const save = useMutation({
    mutationFn: async () => {
      // 1. Insert guardian
      let guardian_id: string | null = null;
      if (guardianName.trim()) {
        const { data: g, error: gErr } = await supabase
          .from("guardians")
          .insert({ full_name: guardianName.trim(), phone: guardianPhone.trim() || null, relationship: "guardian" })
          .select("id").single();
        if (gErr) throw gErr;
        guardian_id = g.id;
      }

      // 2. Insert student
      const { data: student, error: sErr } = await supabase
        .from("students")
        .insert({
          full_name:     step1.full_name.trim(),
          gender:        step1.gender,
          date_of_birth: step1.date_of_birth || null,
          status:        "active",
          guardian_id,
          province_id:   loc.province_id || null,
          district_id:   loc.district_id || null,
          area_id:       loc.area_id     || null,
          village_id:    loc.village_id  || null,
        })
        .select("id").single();
      if (sErr) throw sErr;

      // 3. Get current academic year
      const { data: yearData } = await supabase
        .from("academic_years").select("id").eq("is_current", true).maybeSingle();

      // 4. Insert enrollment
      const { error: eErr } = await supabase
        .from("student_enrollments")
        .insert({
          student_id:       student.id,
          class_id:         step1.class_id,
          start_date:       new Date().toISOString().split("T")[0],
          is_current:       true,
          academic_year_id: yearData?.id ?? null,
        });
      if (eErr) throw eErr;
    },
    onSuccess: () => {
      toast.success("تمت إضافة الطالب وتسجيله بنجاح");
      qc.invalidateQueries({ queryKey: ["students"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap size={18} className="text-primary" />
            إضافة طالب جديد
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-3 mb-1">
          {[
            { n: 1, label: "البيانات الأساسية" },
            { n: 2, label: "ولي الأمر والموقع" },
          ].map(({ n, label }, i) => (
            <div key={n} className="flex items-center gap-2">
              {i > 0 && <div className="h-px w-8 bg-border" />}
              <div className="flex items-center gap-1.5">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  step === n
                    ? "bg-primary text-primary-foreground"
                    : step > n
                    ? "bg-success/80 text-white"
                    : "bg-muted text-muted-foreground"
                }`}>{n}</div>
                <span className={`text-sm ${step === n ? "font-semibold" : "text-muted-foreground"}`}>
                  {label}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Step 1: البيانات الأساسية ── */}
        {step === 1 && (
          <div className="space-y-4 pt-1">
            {/* الاسم الكامل + الجنس */}

            <div className="grid grid-cols-[4fr_1fr] gap-3 items-end">
              <div className="space-y-1.5">
                <Label>الاسم الكامل <span className="text-destructive">*</span></Label>
                <Input
                  value={step1.full_name}
                  onChange={(e) => setStep1((p) => ({ ...p, full_name: e.target.value }))}
                  placeholder="أدخل الاسم الكامل للطالب"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>الجنس <span className="text-destructive">*</span></Label>
                <Select
                  value={step1.gender}
                  onValueChange={(v) => setStep1((p) => ({ ...p, gender: v as "male" | "female" }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">ذكر</SelectItem>
                    <SelectItem value="female">أنثى</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* تاريخ الميلاد + المرحلة + الصف */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>تاريخ الميلاد</Label>
                <Input
                  type="date"
                  value={step1.date_of_birth}
                  onChange={(e) => setStep1((p) => ({ ...p, date_of_birth: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>المرحلة الدراسية</Label>
                <Select
                  value={step1.stage_id}
                  onValueChange={(v) => setStep1((p) => ({ ...p, stage_id: v, class_id: "" }))}
                >
                  <SelectTrigger><SelectValue placeholder="اختر المرحلة" /></SelectTrigger>
                  <SelectContent>
                    {resolvedStages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>الصف الدراسي <span className="text-destructive">*</span></Label>
                <Select
                  value={step1.class_id}
                  onValueChange={(v) => setStep1((p) => ({ ...p, class_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={
                      step1.stage_id && filteredClasses.length === 0
                        ? "لا يوجد صفوف"
                        : "اختر الصف"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredClasses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}{c.section ? ` / ${c.section}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            


            <div className="flex justify-end pt-1">
              <Button onClick={goNext}>
                التالي <ChevronLeft size={16} className="mr-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: ولي الأمر + الموقع ── */}
        {step === 2 && (
          <div className="space-y-4 pt-1">
            {/* ولي الأمر */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                بيانات ولي الأمر
              </p>
              <div className="grid grid-cols-[7fr_3fr] gap-3">
                <div className="space-y-1.5">
                  <Label>اسم ولي الأمر</Label>
                  <Input
                    value={guardianName}
                    onChange={(e) => setGuardianName(e.target.value)}
                    placeholder="الاسم الكامل"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>هاتف ولي الأمر</Label>
                  <Input
                    value={guardianPhone}
                    onChange={(e) => setGuardianPhone(e.target.value)}
                    placeholder="7xxxxxxxx"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>

            {/* الموقع الجغرافي */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <MapPin size={13} className="text-primary" /> الموقع الجغرافي
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>المحافظة</Label>
                  <Select value={loc.province_id}
                    onValueChange={(v) => setLoc({ province_id: v, district_id: "", area_id: "", village_id: "" })}>
                    <SelectTrigger><SelectValue placeholder="اختر المحافظة" /></SelectTrigger>
                    <SelectContent>
                      {(provinces ?? []).map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>المديرية</Label>
                  <Select value={loc.district_id}
                    onValueChange={(v) => setLoc({ district_id: v, area_id: "", village_id: "" })}
                    disabled={!loc.province_id || loadingDistricts}>
                    <SelectTrigger>
                      <SelectValue placeholder={!loc.province_id ? "اختر المحافظة أولاً" : "اختر المديرية"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(districts ?? []).map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>العزلة / المنطقة</Label>
                  <Select value={loc.area_id}
                    onValueChange={(v) => setLoc({ area_id: v, village_id: "" })}
                    disabled={!loc.district_id || loadingAreas}>
                    <SelectTrigger>
                      <SelectValue placeholder={!loc.district_id ? "اختر المديرية أولاً" : "اختر العزلة"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(areas ?? []).map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>القرية / الحارة</Label>
                  <SearchableSelect
                    value={loc.village_id}
                    onChange={(v) => setLoc({ village_id: v })}
                    options={villages ?? []}
                    placeholder={loc.area_id ? "اكتب للبحث عن القرية" : "اختر عزلة أولاً"}
                    searchPlaceholder="اكتب اسم القرية (حرفان على الأقل)..."
                    disabled={!loc.area_id}
                    isLoading={loadingVillages}
                    onSearchChange={setVillageSearch}
                    emptyMessage={villageSearch.length < 2 ? "اكتب حرفين على الأقل للبحث" : "لا توجد قرى مطابقة"}
                  />
                </div>
              </div>

              {loc.province_id && (
                <div className="mt-3 p-2.5 rounded-lg bg-primary/5 border border-primary/10 text-xs text-muted-foreground flex items-center gap-1.5">
                  <MapPin size={11} className="text-primary shrink-0" />
                  <span>
                    {[
                      (provinces ?? []).find(p => p.id === loc.province_id)?.name,
                      (districts ?? []).find(d => d.id === loc.district_id)?.name,
                      (areas ?? []).find(a => a.id === loc.area_id)?.name,
                      (villages ?? []).find(v => v.id === loc.village_id)?.name,
                    ].filter(Boolean).join(" ← ")}
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-between pt-1">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronRight size={16} className="ml-1" /> السابق
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose}>إلغاء</Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending}>
                  {save.isPending ? "جارٍ الحفظ..." : "إضافة الطالب"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Student Dialog ───────────────────────────────────────────────────────
function EditStudentDialog({
  student, classes, onClose,
}: { student: Student; classes: ClassRow[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    full_name:      student.full_name,
    gender:         student.gender,
    date_of_birth:  student.date_of_birth ?? "",
    status:         student.status,
    guardian_name:  student.guardians?.full_name ?? "",
    guardian_phone: student.guardians?.phone ?? "",
  });
  const [loc, setLocState] = useState<LocationState>({
    province_id: student.province_id ?? "",
    district_id: student.district_id ?? "",
    area_id:     student.area_id     ?? "",
    village_id:  student.village_id  ?? "",
  });
  const setLoc = (patch: Partial<LocationState>) => setLocState(p => ({ ...p, ...patch }));
  const [villageSearch, setVillageSearch] = useState("");

  const { provinces, districts, areas, loadingDistricts, loadingAreas } = useLocationData(loc);
  const { data: villages, isLoading: loadingVillages } = useQuery({
    queryKey: ["villages-search-edit", loc.area_id, villageSearch, student.village_id],
    enabled: !!loc.area_id && (villageSearch.length >= 2 || !!student.village_id),
    queryFn: async () => {
      let q = supabase.from("villages").select("id, name").eq("area_id", loc.area_id);
      if (villageSearch.length >= 2) q = q.ilike("name", `%${villageSearch}%`);
      else if (student.village_id) q = q.eq("id", student.village_id);
      const { data } = await q.limit(20);
      return (data ?? []) as SelectOption[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("students").update({
        full_name:     form.full_name.trim(),
        gender:        form.gender,
        date_of_birth: form.date_of_birth || null,
        status:        form.status,
        province_id:   loc.province_id || null,
        district_id:   loc.district_id || null,
        area_id:       loc.area_id     || null,
        village_id:    loc.village_id  || null,
      }).eq("id", student.id);
      if (error) throw error;

      if (student.guardian_id) {
        await supabase.from("guardians").update({
          full_name: form.guardian_name.trim(),
          phone:     form.guardian_phone.trim() || null,
        }).eq("id", student.guardian_id);
      }
    },
    onSuccess: () => {
      toast.success("تم حفظ التعديلات");
      qc.invalidateQueries({ queryKey: ["students"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil size={16} className="text-primary" /> تعديل بيانات الطالب
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-[1fr_148px] gap-3 items-end">
            <div className="space-y-1.5">
              <Label>الاسم الكامل</Label>
              <Input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>الجنس</Label>
              <Select value={form.gender} onValueChange={v => setForm(p => ({ ...p, gender: v as "male" | "female" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">ذكر</SelectItem>
                  <SelectItem value="female">أنثى</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>تاريخ الميلاد</Label>
              <Input type="date" value={form.date_of_birth} onChange={e => setForm(p => ({ ...p, date_of_birth: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>الحالة</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v as Student["status"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="withdrawn">منقطع</SelectItem>
                  <SelectItem value="graduated">متخرج</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {student.guardian_id && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>اسم ولي الأمر</Label>
                <Input value={form.guardian_name} onChange={e => setForm(p => ({ ...p, guardian_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>هاتف ولي الأمر</Label>
                <Input value={form.guardian_phone} dir="ltr" onChange={e => setForm(p => ({ ...p, guardian_phone: e.target.value }))} />
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <MapPin size={13} className="text-primary" /> الموقع الجغرافي
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>المحافظة</Label>
                <Select value={loc.province_id}
                  onValueChange={v => setLoc({ province_id: v, district_id: "", area_id: "", village_id: "" })}>
                  <SelectTrigger><SelectValue placeholder="اختر المحافظة" /></SelectTrigger>
                  <SelectContent>
                    {(provinces ?? []).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>المديرية</Label>
                <Select value={loc.district_id}
                  onValueChange={v => setLoc({ district_id: v, area_id: "", village_id: "" })}
                  disabled={!loc.province_id || loadingDistricts}>
                  <SelectTrigger><SelectValue placeholder={!loc.province_id ? "اختر المحافظة أولاً" : "اختر المديرية"} /></SelectTrigger>
                  <SelectContent>
                    {(districts ?? []).map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>العزلة / المنطقة</Label>
                <Select value={loc.area_id}
                  onValueChange={v => setLoc({ area_id: v, village_id: "" })}
                  disabled={!loc.district_id || loadingAreas}>
                  <SelectTrigger><SelectValue placeholder={!loc.district_id ? "اختر المديرية أولاً" : "اختر العزلة"} /></SelectTrigger>
                  <SelectContent>
                    {(areas ?? []).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>القرية / الحارة</Label>
                <SearchableSelect
                  value={loc.village_id}
                  onChange={v => setLoc({ village_id: v })}
                  options={villages ?? []}
                  placeholder={loc.area_id ? "اكتب للبحث" : "اختر عزلة أولاً"}
                  searchPlaceholder="اكتب اسم القرية..."
                  disabled={!loc.area_id}
                  isLoading={loadingVillages}
                  onSearchChange={setVillageSearch}
                  emptyMessage={villageSearch.length < 2 ? "اكتب حرفين على الأقل" : "لا توجد قرى مطابقة"}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "جارٍ الحفظ..." : "حفظ التعديلات"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Bulk Import Dialog ────────────────────────────────────────────────────────
interface ImportRow {
  full_name:     string;
  gender:        string;
  date_of_birth: string;
  parent_phone:  string;
  class_name:    string;
  _error?: string;
  _ok?: boolean;
}

function BulkImportDialog({ classes, onClose }: { classes: ClassRow[]; onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  function downloadTemplate() {
    const headers = ["full_name", "gender", "date_of_birth", "parent_phone", "class_name"];
    const example = ["محمد أحمد علي", "male", "2010-01-15", "0771234567", "الصف الأول"];
    const csv = [headers, example].map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "students_template.csv";
    a.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const xlsx = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = xlsx.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data: string[][] = xlsx.utils.sheet_to_json(ws, { header: 1, raw: false }) as string[][];
      if (data.length < 2) { toast.error("الملف فارغ"); return; }
      const headers = (data[0] ?? []).map((h: string) => String(h).trim().toLowerCase());
      const parsed: ImportRow[] = [];
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.every((c: string) => !c)) continue;
        const get = (key: string) => { const idx = headers.indexOf(key); return idx >= 0 ? String(row[idx] ?? "").trim() : ""; };
        const r: ImportRow = {
          full_name: get("full_name"), gender: get("gender"),
          date_of_birth: get("date_of_birth"), parent_phone: get("parent_phone"),
          class_name: get("class_name"),
        };
        if (!r.full_name) r._error = "الاسم مطلوب";
        else if (r.gender && !["male", "female"].includes(r.gender)) r._error = "الجنس: male أو female";
        else r._ok = true;
        parsed.push(r);
      }
      setRows(parsed);
    } catch (err: any) {
      toast.error("فشل قراءة الملف: " + (err.message ?? ""));
    }
  }

  async function runImport() {
    const valid = rows.filter(r => r._ok);
    if (valid.length === 0) { toast.error("لا توجد صفوف صالحة"); return; }
    setImporting(true);
    let success = 0;
    const errors: string[] = [];

    const { data: yearData } = await supabase
      .from("academic_years").select("id").eq("is_current", true).maybeSingle();

    for (const r of valid) {
      try {
        // Find matching class
        const classObj = classes.find(c =>
          c.name.trim() === r.class_name.trim() ||
          (c.name + (c.section ? ` / ${c.section}` : "")).trim() === r.class_name.trim()
        );

        // Insert guardian if phone provided
        let guardian_id: string | null = null;
        if (r.parent_phone.trim()) {
          const guardianPayload: Record<string, string | null> = {
            full_name: r.full_name,
            phone: r.parent_phone.trim(),
          };
          const { data: g, error: gErr } = await supabase
            .from("guardians")
            .insert(guardianPayload)
            .select("id")
            .single();
          if (gErr) {
            // Try without optional fields if first attempt fails
            const { data: g2, error: gErr2 } = await supabase
              .from("guardians")
              .insert({ full_name: r.full_name, phone: r.parent_phone.trim() })
              .select("id")
              .single();
            if (gErr2) {
              errors.push(`${r.full_name}: فشل إنشاء ولي الأمر - ${gErr2.message}`);
            } else {
              guardian_id = g2?.id ?? null;
            }
          } else {
            guardian_id = g?.id ?? null;
          }
        }

        // Insert student
        const { data: student, error: sErr } = await supabase
          .from("students")
          .insert({
            full_name: r.full_name,
            gender: (["male", "female"].includes(r.gender) ? r.gender : "male") as "male" | "female",
            date_of_birth: r.date_of_birth || null,
            status: "active",
            guardian_id,
          })
          .select("id")
          .single();

        if (sErr) {
          errors.push(`${r.full_name}: ${sErr.message}`);
          continue;
        }

        // Insert enrollment if class found
        if (classObj && student) {
          const { error: eErr } = await supabase.from("student_enrollments").insert({
            student_id: student.id,
            class_id: classObj.id,
            start_date: new Date().toISOString().split("T")[0],
            is_current: true,
            academic_year_id: yearData?.id ?? null,
          });
          if (eErr) {
            errors.push(`${r.full_name}: فشل تسجيل الصف - ${eErr.message}`);
          }
        }

        success++;
      } catch (err: any) {
        errors.push(`${r.full_name}: ${err?.message ?? "خطأ غير معروف"}`);
      }
    }

    setImporting(false);
    qc.invalidateQueries({ queryKey: ["students"] });

    if (success > 0) {
      toast.success(`تم استيراد ${success} طالب بنجاح${errors.length > 0 ? ` (فشل ${errors.length})` : ""}`);
    }
    if (errors.length > 0) {
      setImportErrors(errors);
      console.error("Import errors:", errors);
    }
    if (success > 0 && errors.length === 0) onClose();
  }

  const validCount = rows.filter(r => r._ok).length;
  const errorCount = rows.filter(r => r._error).length;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-primary" />
            استيراد الطلاب من Excel / CSV
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
            <p className="font-semibold mb-1">أعمدة الملف المطلوبة:</p>
            <p>full_name · gender (male/female) · date_of_birth (YYYY-MM-DD) · parent_phone · class_name</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}><Upload size={14} className="ml-1.5" /> تحميل نموذج</Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><FileSpreadsheet size={14} className="ml-1.5" /> اختيار ملف</Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.ods,.odf,.ots" className="hidden" onChange={handleFile} />
          </div>
          {rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <span className="flex items-center gap-1 text-success"><CheckCircle2 size={14} /> {validCount} صالح للاستيراد</span>
                {errorCount > 0 && <span className="flex items-center gap-1 text-destructive"><AlertCircle size={14} /> {errorCount} سجل يحتوي خطأ</span>}
              </div>
              <div className="border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead><TableHead>الاسم</TableHead>
                      <TableHead>الجنس</TableHead><TableHead>الصف</TableHead><TableHead>الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 20).map((r, i) => (
                      <TableRow key={i} className={r._error ? "bg-destructive/5" : ""}>
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-sm font-medium">{r.full_name || <span className="text-destructive text-xs">{r._error}</span>}</TableCell>
                        <TableCell className="text-xs">{r.gender === "male" ? "ذكر" : r.gender === "female" ? "أنثى" : r.gender}</TableCell>
                        <TableCell className="text-xs">{r.class_name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${r._ok ? "text-success border-success/30" : "text-destructive border-destructive/30"}`}>
                            {r._ok ? "✓ صالح" : r._error}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* DB errors after import attempt */}
          {importErrors.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1 max-h-36 overflow-y-auto">
              <p className="text-xs font-bold text-destructive flex items-center gap-1">
                <AlertCircle size={13} /> أخطاء الحفظ في قاعدة البيانات ({importErrors.length}):
              </p>
              {importErrors.map((e, i) => (
                <p key={i} className="text-xs text-destructive/80 pr-4">• {e}</p>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
          <Button
            onClick={runImport}
            disabled={validCount === 0 || importing}
            className="gap-2"
          >
            {importing
              ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> جارٍ الاستيراد...</>
              : `استيراد ${validCount} طالب`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
