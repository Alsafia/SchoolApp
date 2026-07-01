import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/ui/number-input";
import {
  Search, CreditCard, Wallet, TrendingUp, AlertTriangle,
  Users, CheckCircle2, Receipt, Eye, Filter, X, CalendarDays,
  ArrowUpRight, CircleDollarSign, ChevronLeft, Plus, GraduationCap, FileText,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";

type PeriodFilter = "all" | "today" | "week" | "month" | "custom";

function getPeriodRange(period: PeriodFilter): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (period === "today") {
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    const to = new Date(now); to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  if (period === "week") {
    const from = new Date(now); from.setDate(now.getDate() - now.getDay()); from.setHours(0, 0, 0, 0);
    const to = new Date(now); to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  if (period === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now); to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  return { from: null, to: null };
}

export const Route = createFileRoute("/payments")({ component: Page });

const PAYMENT_METHODS: Record<string, string> = {
  cash: "نقدي",
  transfer: "تحويل بنكي",
  wallet: "محفظة إلكترونية",
};

interface ClassInfo { id: string; name: string; section: string | null; }

interface EnrollmentEntry {
  class_id: string;
  is_current: boolean;
  classes: ClassInfo | null;
}

interface StudentFee {
  id: string;
  student_id: string;
  academic_year: string;
  total_amount: number;
  paid_amount: number;
  last_payment_at: string | null;
  created_at: string;
  students: {
    id: string;
    full_name: string;
    student_enrollments: EnrollmentEntry[] | null;
  } | null;
}

function currentClass(s: StudentFee["students"]): ClassInfo | null {
  return s?.student_enrollments?.find(e => e.is_current)?.classes ?? null;
}

interface PaymentRow {
  id: string;
  student_fee_id: string;
  amount: number;
  method: string;
  paid_at: string;
  notes: string | null;
  created_by_name: string | null;
  student_fees: { students: { full_name: string } | null } | null;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  paid:    { label: "مكتمل",      className: "bg-success/15 text-success border-success/30" },
  partial: { label: "جزئي",       className: "bg-amber-500/15 text-amber-600 border-amber-400/30" },
  unpaid:  { label: "غير مدفوع",  className: "bg-muted text-muted-foreground" },
  overdue: { label: "متأخر",      className: "bg-destructive/15 text-destructive border-destructive/30" },
};

function statusOf(f: { total_amount: number; paid_amount: number; last_payment_at: string | null }): "paid" | "unpaid" | "partial" | "overdue" {
  if (f.total_amount <= 0) return "unpaid";
  if (f.paid_amount >= f.total_amount) return "paid";
  if (f.paid_amount <= 0) return "unpaid";
  return "partial";
}

function Page() {
  const { user, loading, hasRole } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  return (
    <AppShell>
      <PaymentsView canEdit={hasRole("admin")} />
    </AppShell>
  );
}

function PaymentsView({ canEdit }: { canEdit: boolean }) {
  const [classFilter, setClassFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [year, setYear] = useState("all");
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [openPay, setOpenPay] = useState<StudentFee | null>(null);
  const [openView, setOpenView] = useState<StudentFee | null>(null);
  const [openNewFee, setOpenNewFee] = useState(false);

  const { data: fees, isLoading } = useQuery({
    queryKey: ["student-fees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_fees")
        .select("*, students(id, full_name, student_enrollments(class_id, is_current, classes(id, name, section)))")
        .order("created_at", { ascending: false });




      if (error) throw error;
      return (data ?? []) as StudentFee[];
    },
  });

  const { data: classes } = useQuery({
    queryKey: ["classes-list"],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, name, section").order("grade_level");
      return (data ?? []) as ClassInfo[];
    },
  });

  const years = useMemo(() => Array.from(new Set((fees ?? []).map(f => f.academic_year).filter(Boolean))), [fees]);

  const filtered = useMemo(() => {
    const { from: rangeFrom, to: rangeTo } = period !== "custom" ? getPeriodRange(period) : {
      from: customFrom ? new Date(customFrom + "T00:00:00") : null,
      to: customTo ? new Date(customTo + "T23:59:59") : null,
    };

    return (fees ?? []).filter(f => {
      const s = f.students;
      if (classFilter !== "all" && !s?.student_enrollments?.some(e => e.is_current && e.class_id === classFilter)) return false;
      if (year !== "all" && f.academic_year !== year) return false;
      if (status !== "all" && statusOf(f) !== status) return false;
      if (search) {
        const name = (s?.full_name ?? "").toLowerCase();
        if (!name.includes(search.toLowerCase())) return false;
      }
      if (rangeFrom || rangeTo) {
        const ref = f.last_payment_at ? new Date(f.last_payment_at) : new Date((f as any).created_at);
        if (rangeFrom && ref < rangeFrom) return false;
        if (rangeTo && ref > rangeTo) return false;
      }
      return true;
    });
  }, [fees, classFilter, year, status, search, period, customFrom, customTo]);

  const totals = useMemo(() => {
    const total = filtered.reduce((a, f) => a + Number(f.total_amount || 0), 0);
    const paid = filtered.reduce((a, f) => a + Number(f.paid_amount || 0), 0);
    const remaining = total - paid;
    const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
    const paidCount = filtered.filter(f => statusOf(f) === "paid").length;
    const unpaidCount = filtered.filter(f => statusOf(f) === "unpaid" || statusOf(f) === "overdue").length;
    return { total, paid, remaining, pct, paidCount, unpaidCount };
  }, [filtered]);

  const fmt = (n: number) => n.toLocaleString("ar-EG", { maximumFractionDigits: 0 });

  const activeFilters = [classFilter !== "all", year !== "all", status !== "all", !!search, period !== "all"].filter(Boolean).length;
  const clearFilters = () => { setClassFilter("all"); setYear("all"); setStatus("all"); setSearch(""); setPeriod("all"); setCustomFrom(""); setCustomTo(""); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">الرسوم والمدفوعات</h1>
          <p className="text-muted-foreground mt-1">نظام مالي متكامل لإدارة رسوم الطلاب والدفعات</p>
        </div>
        {canEdit && (
          <Button onClick={() => setOpenNewFee(true)} className="gap-2">
            <Plus size={16} />
            رسوم جديدة
          </Button>
        )}
      </div>

      <Tabs defaultValue="fees" className="space-y-5">
        <TabsList className="h-10">
          <TabsTrigger value="fees" className="gap-2"><CircleDollarSign size={15} /> الرسوم</TabsTrigger>
          <TabsTrigger value="log" className="gap-2"><CalendarDays size={15} /> سجل المدفوعات</TabsTrigger>
        </TabsList>

        <TabsContent value="fees" className="space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <SummaryCard label="إجمالي الرسوم" value={fmt(totals.total)} sub="ريال" icon={<Wallet size={17} />} color="default" />
            <SummaryCard label="المحصّل" value={fmt(totals.paid)} sub="ريال" icon={<CheckCircle2 size={17} />} color="success" />
            <SummaryCard label="المتبقي" value={fmt(totals.remaining)} sub="ريال" icon={<AlertTriangle size={17} />} color="danger" />
            <SummaryCard label="نسبة التحصيل" value={`${totals.pct}%`} sub={`${filtered.length} سجل`} icon={<TrendingUp size={17} />} color="primary" progress={totals.pct} />
            <SummaryCard label="مكتمل السداد" value={String(totals.paidCount)} sub="طالب" icon={<Users size={17} />} color="success" />
            <SummaryCard label="لم يسددوا" value={String(totals.unpaidCount)} sub="طالب" icon={<Users size={17} />} color="danger" />
          </div>

          {/* Filters */}
          <Card className="p-4 space-y-4">
            {/* Period filter row */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Calendar size={14} className="text-primary" />
                <span className="text-xs font-semibold text-muted-foreground">الفترة الزمنية</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {([
                  { v: "all",   label: "الكل" },
                  { v: "today", label: "اليوم" },
                  { v: "week",  label: "هذا الأسبوع" },
                  { v: "month", label: "هذا الشهر" },
                  { v: "custom",label: "بين تاريخين" },
                ] as const).map(p => (
                  <button
                    key={p.v}
                    onClick={() => setPeriod(p.v)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      period === p.v
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {period === "custom" && (
                <div className="flex items-center gap-2 mt-2">
                  <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-8 text-xs w-36" />
                  <span className="text-xs text-muted-foreground">إلى</span>
                  <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-8 text-xs w-36" />
                </div>
              )}
            </div>

            {/* Standard filters */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Filter size={14} className="text-primary" />
                <span className="text-xs font-semibold text-muted-foreground">تصفية البيانات</span>
                {activeFilters > 0 && <Badge variant="secondary" className="text-xs">{activeFilters} فلاتر</Badge>}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">الصف الدراسي</Label>
                  <Select value={classFilter} onValueChange={setClassFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">الكل</SelectItem>
                      {(classes ?? []).map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}{c.section ? ` / ${c.section}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">السنة الدراسية</Label>
                  <Select value={year} onValueChange={setYear}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">الكل</SelectItem>
                      {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">الحالة المالية</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">الكل</SelectItem>
                      {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">اسم الطالب</Label>
                  <div className="relative">
                    <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} />
                    <Input className="pr-8" placeholder="ابحث عن طالب..." value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>

            {activeFilters > 0 && (
              <div className="flex items-center justify-between pt-1 border-t">
                <Badge variant="outline" className="text-xs">{filtered.length} سجل</Badge>
                <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={clearFilters}>
                  <X size={11} /> مسح الفلاتر
                </Button>
              </div>
            )}
          </Card>

          {/* Table */}
     الرسوم والمدفوعات تبويب الرسوم      <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs">#</TableHead>
                    <TableHead className="text-xs">اسم الطالب</TableHead>
                    <TableHead className="text-xs">الصف</TableHead>
                    <TableHead className="text-xs">العام الدراسي</TableHead>
                    <TableHead className="text-xs">الإجمالي</TableHead>
                    <TableHead className="text-xs">المدفوع</TableHead>
                    <TableHead className="text-xs">المتبقي</TableHead>
                    <TableHead className="text-xs">نسبة السداد</TableHead>
                    <TableHead className="text-xs">الحالة</TableHead>
                    <TableHead className="text-xs">آخر دفعة</TableHead>
                    <TableHead className="w-28 text-xs">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
                  )}
                  {!isLoading && filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-16 text-muted-foreground">
                        <CreditCard className="mx-auto mb-3 opacity-30" size={36} />
                        <p className="font-medium">لا توجد بيانات رسوم</p>
                        <p className="text-xs mt-1">
                          {(fees ?? []).length === 0
                            ? "اضغط «رسوم جديدة» لإضافة أول سجل رسوم"
                            : "جرّب تعديل معايير البحث"}
                        </p>
                        {canEdit && (fees ?? []).length === 0 && (
                          <Button className="mt-4 gap-2" onClick={() => setOpenNewFee(true)}>
                            <Plus size={15} /> رسوم جديدة
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map((f, idx) => {
                    const st = statusOf(f);
                    const total = Number(f.total_amount);
                    const paid = Number(f.paid_amount);
                    const remaining = total - paid;
                    const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
      const cls = f.students?.student_enrollments?.find(e => e.is_current)?.classes;
                    return (
                      <TableRow key={f.id} className="hover:bg-muted/20">
                        <TableCell className="text-muted-foreground text-xs font-mono">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">
                            {f.students?.id ? (
                              <Link to="/payments/$studentId" params={{ studentId: f.students.id }} className="text-primary hover:underline flex items-center gap-1 group">
                                {f.students.full_name}
                                <ChevronLeft size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                              </Link>
                            ) : f.students?.full_name ?? "—"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {cls ? `${cls.name}${cls.section ? ` / ${cls.section}` : ""}` : "—"}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{f.academic_year || "—"}</TableCell>
                        <TableCell className="font-medium text-sm">{fmt(total)}</TableCell>
                        <TableCell className="text-success font-medium text-sm">{fmt(paid)}</TableCell>
                        <TableCell className={`font-medium text-sm ${remaining > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {fmt(remaining)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[80px]">
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full ${pct >= 100 ? "bg-success" : pct >= 50 ? "bg-amber-500" : "bg-destructive"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold w-9 text-left">{pct}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${STATUS_CONFIG[st]?.className}`}>
                            {STATUS_CONFIG[st]?.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {f.last_payment_at ? new Date(f.last_payment_at).toLocaleDateString("ar-EG") : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setOpenView(f)} title="عرض">
                              <Eye size={14} />
                            </Button>
                            {st !== "paid" && canEdit && (
                              <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => setOpenPay(f)}>
                                <Receipt size={12} /> سداد
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="log">
          <PaymentLog />
        </TabsContent>
      </Tabs>

      {openNewFee && <NewFeeDialog onClose={() => setOpenNewFee(false)} classes={classes ?? []} />}
      {openPay && <PayDialog fee={openPay} onClose={() => setOpenPay(null)} />}
      {openView && <ViewDialog fee={openView} onClose={() => setOpenView(null)} />}
    </div>
  );
}

// ── New Fee Dialog ─────────────────────────────────────────────────────────────
const YEAR_PRESETS = (() => {
  const y = new Date().getFullYear();
  return [`${y - 1}/${y}`, `${y}/${y + 1}`, `${y + 1}/${y + 2}`];
})();

// ── Academic const { data: academicYears }─const { data: academicYears } = useQuery({
//  queryKey: ["academic-years"],
 // queryFn: async () => {
 //   const { data, error } = await supabase
//      .from("student_fees")
//      .select("academic_year");

//    if (error) throw error;

//    const years = (data ?? [])
 //     .map((r: any) => r.academic_year)
 //     .filter(Boolean);

 //   return Array.from(new Set(years)) as string[];
 // },
//});


function NewFeeDialog({ onClose, classes }: { onClose: () => void; classes: ClassInfo[] }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<"select" | "details">("select");
  const [classId, setClassId] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<{
    id: string; full_name: string; student_enrollments: any[];
  } | null>(null);
  const [academicYear, setAcademicYear] = useState(YEAR_PRESETS[1]);
  const [totalAmount, setTotalAmount] = useState("");
  const [notes, setNotes] = useState("");

  const { data: students, isLoading: loadingStudents } = useQuery({
    queryKey: ["students-for-fees", classId],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select(`
          id,
          full_name,
          student_enrollments!student_enrollments_student_id_fkey(
            class_id,
            is_current,
            classes(
              id,
              name,
              section
            )
          )
        `)
        .eq("status", "active")
        .order("full_name");

      return (data ?? []) as any[];
    },
  });

  const { data: existingFees } = useQuery({
    queryKey: ["existing-fees-check", selectedStudent?.id],
    enabled: !!selectedStudent?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("student_fees")
        .select("id, academic_year, total_amount, paid_amount")
        .eq("student_id", selectedStudent!.id)
        .order("academic_year", { ascending: false });
      return (data ?? []) as { id: string; academic_year: string; total_amount: number; paid_amount: number }[];
    },
  });

  const duplicateForYear = (existingFees ?? []).find(f => f.academic_year.trim() === academicYear.trim());

  const save = useMutation({
    mutationFn: async () => {
      if (!selectedStudent) throw new Error("اختر طالباً");
      const amount = Number(totalAmount);
      if (!amount || amount <= 0) throw new Error("أدخل مبلغاً صحيحاً");
      const { error } = await supabase.from("student_fees").insert({
        student_id: selectedStudent.id,
        academic_year: academicYear.trim(),
        total_amount: amount,
        paid_amount: 0,
        notes: notes.trim() || null,
      });
      if (error) {
        if (error.code === "23505") throw new Error("يوجد سجل رسوم لهذا الطالب في هذا العام مسبقاً");
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("تم إنشاء سجل الرسوم بنجاح ✓");
      qc.invalidateQueries({ queryKey: ["student-fees"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filteredStudents = useMemo(() => {
    return (students ?? []).filter(s => {
      if (search && !s.full_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (classId !== "all") {
        return s.student_enrollments?.some((e: any) => e.class_id === classId);
      }
      return true;
    });
  }, [students, search, classId]);

  const selectedCls = selectedStudent?.student_enrollments?.find((e: any) => e.is_current)?.classes
    ?? selectedStudent?.student_enrollments?.[0]?.classes
    ?? null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden gap-0">
        {/* Header */}
        <div className="bg-gradient-to-l from-primary/5 to-primary/10 border-b px-6 py-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center">
              <FileText size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-base">إنشاء سجل رسوم جديد</h2>
              <p className="text-xs text-muted-foreground">تحديد الطالب وإدخال بيانات الرسوم الدراسية</p>
            </div>
          </div>
          {/* Step indicator */}
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full ${step === "select" ? "bg-primary text-primary-foreground" : "bg-success/15 text-success"}`}>
              {step === "select" ? <span className="w-4 h-4 rounded-full bg-white/30 flex items-center justify-center text-[10px] font-bold">1</span> : <CheckCircle2 size={13} />}
              اختيار الطالب
            </div>
            <div className="flex-1 h-px bg-border" />
            <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full ${step === "details" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">2</span>
              بيانات الرسوم
            </div>
          </div>
        </div>

        <div className="p-6">
          {step === "select" ? (
            <div className="space-y-4">
              {/* Search + filter */}
              <div className="grid grid-cols-5 gap-3">
                <div className="col-span-2">
                  <Select value={classId} onValueChange={v => { setClassId(v); }}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="الصف" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">كل الصفوف</SelectItem>
                      {classes.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}{c.section ? ` / ${c.section}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-3 relative">
                  <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} />
                  <Input className="pr-8 h-9 text-sm" placeholder="ابحث باسم الطالب..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
              </div>

              {/* Student list */}
              <div className="border rounded-xl overflow-hidden divide-y bg-muted/20 max-h-64 overflow-y-auto">
                {loadingStudents && (
                  <div className="py-10 text-center text-muted-foreground text-sm">جارٍ التحميل...</div>
                )}
                {!loadingStudents && filteredStudents.length === 0 && (
                  <div className="py-10 text-center text-muted-foreground text-sm">
                    <GraduationCap className="mx-auto mb-2 opacity-30" size={28} />
                    لا يوجد طلاب مطابقون
                  </div>
                )}
                {filteredStudents.map(s => {
                  const cls = s.student_enrollments?.find((e: any) => e.is_current)?.classes
                    ?? s.student_enrollments?.[0]?.classes
                    ?? null;
                  const isSelected = selectedStudent?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelectedStudent(s)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-right transition-all ${
                        isSelected ? "bg-primary/10 border-r-4 border-primary" : "hover:bg-white/80"
                      }`}
                    >
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${isSelected ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                        {s.full_name[0]}
                      </div>
                      <div className="flex-1 min-w-0 text-right">
                        <div className="font-medium text-sm">{s.full_name}</div>
                        <div className="text-xs text-muted-foreground">
               {cls ? `${cls.name}${cls.section ? ` / ${cls.section}` : ""}` : "غير مسجل في أي صف"}
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 size={17} className="text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>

    {/* Selected student preview */}
              {selectedStudent && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm shrink-0">
                    {selectedStudent.full_name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-primary">{selectedStudent.full_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {selectedCls ? `${selectedCls.name}${selectedCls.section ? ` / ${selectedCls.section}` : ""}` : "—"}
                      {(existingFees ?? []).length > 0 && <span className="mr-2 text-amber-600 font-medium">· {(existingFees ?? []).length} سجل رسوم سابق</span>}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs bg-primary/10 border-primary/20 text-primary">محدد</Badge>
                </div>
              )}

              <div className="flex justify-between pt-1">
                <Button variant="outline" onClick={onClose}>إلغاء</Button>
                <Button onClick={() => setStep("details")} disabled={!selectedStudent} className="gap-2 min-w-28">
                  التالي <ChevronLeft size={14} />
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Student card */}
              <div className="rounded-xl border bg-gradient-to-l from-muted/30 to-muted/10 p-4 flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xl shrink-0 shadow-sm">
                  {selectedStudent?.full_name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base">{selectedStudent?.full_name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {selectedCls ? `${selectedCls.name}${selectedCls.section ? ` / ${selectedCls.section}` : ""}` : "—"}
                  </div>
                  {(existingFees ?? []).length > 0 && (
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                      {(existingFees ?? []).map(f => (
                        <span key={f.id} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${f.paid_amount >= f.total_amount ? "bg-success/15 text-success" : "bg-amber-100 text-amber-700"}`}>
                          {f.academic_year} · {f.paid_amount >= f.total_amount ? "مكتمل" : `متبقي: ${(Number(f.total_amount) - Number(f.paid_amount)).toLocaleString()}`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="text-xs shrink-0" onClick={() => setStep("select")}>
                  تغيير
                </Button>
              </div>

              {/* Fee form */}
              <div className="grid grid-cols-2 gap-4">
                {/* Academic Year */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">السنة الدراسية *</Label>
                  <Select value={academicYear} onValueChange={setAcademicYear}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {YEAR_PRESETS.map(y => <SelectItem key={y} value={y} dir="ltr">{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Total Amount */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">إجمالي الرسوم السنوية *</Label>
                  <div className="relative">
                    <NumberInput
                      value={totalAmount}
                      onChange={raw => setTotalAmount(raw)}
                      placeholder="0"
                      className="pl-10"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium pointer-events-none">ر.ي</span>
                  </div>
                  {/* Quick presets */}
                  <div className="flex gap-1.5 flex-wrap">
                    {[50000, 100000, 150000, 200000].map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setTotalAmount(String(v))}
                        className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                          totalAmount === String(v) ? "bg-primary/10 border-primary/30 text-primary font-semibold" : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {(v / 1000)}k
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-muted-foreground">ملاحظات (اختياري)</Label>
                <Textarea
                  rows={2}
                  placeholder="مثال: رسوم الفصل الأول فقط، تشمل الكتب..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="resize-none text-sm"
                />
              </div>

              {/* Duplicate warning */}
              {duplicateForYear && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={15} className="text-destructive" />
                    <p className="text-sm font-semibold text-destructive">يوجد سجل رسوم لهذا العام مسبقاً</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-white/60 rounded-lg p-2 text-center border">
                      <div className="text-muted-foreground mb-0.5">الإجمالي</div>
                      <div className="font-bold">{Number(duplicateForYear.total_amount).toLocaleString()}</div>
                    </div>
                    <div className="bg-success/10 rounded-lg p-2 text-center border border-success/20">
                      <div className="text-muted-foreground mb-0.5">المدفوع</div>
                      <div className="font-bold text-success">{Number(duplicateForYear.paid_amount).toLocaleString()}</div>
                    </div>
                    <div className="bg-destructive/10 rounded-lg p-2 text-center border border-destructive/20">
                      <div className="text-muted-foreground mb-0.5">المتبقي</div>
                      <div className="font-bold text-destructive">{(Number(duplicateForYear.total_amount) - Number(duplicateForYear.paid_amount)).toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Summary preview */}
              {!duplicateForYear && totalAmount && Number(totalAmount) > 0 && (
                <div className="rounded-xl border border-primary/20 bg-gradient-to-l from-primary/5 to-primary/10 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Receipt size={14} className="text-primary" />
                    <span className="text-xs font-semibold text-primary">ملخص سجل الرسوم</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">الطالب</span>
                      <span className="font-semibold">{selectedStudent?.full_name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">السنة الدراسية</span>
                      <span className="font-semibold" dir="ltr">{academicYear}</span>
                    </div>
                    <div className="border-t pt-2 flex justify-between items-center">
                      <span className="font-semibold text-muted-foreground">إجمالي الرسوم</span>
                      <span className="font-bold text-lg text-primary">{Number(totalAmount).toLocaleString("ar-EG")} <span className="text-xs font-normal">ر.ي</span></span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-1">
                <Button variant="outline" onClick={() => setStep("select")}>السابق</Button>
                <Button
                  onClick={() => save.mutate()}
                  disabled={save.isPending || !totalAmount || Number(totalAmount) <= 0 || !!duplicateForYear}
                  className="gap-2 min-w-36"
                >
                  {save.isPending ? (
                    <span className="flex items-center gap-2"><span className="animate-spin">⏳</span> جارٍ الحفظ...</span>
                  ) : (
                    <><Receipt size={15} /> إنشاء سجل الرسوم</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Pay Dialog ─────────────────────────────────────────────────────────────────
function SummaryCard({ label, value, sub, icon, color, progress }: {
  label: string; value: string; sub: string; icon: React.ReactNode;
  color: "default" | "success" | "danger" | "primary"; progress?: number;
}) {
  const colors = {
    default: { bg: "bg-muted", text: "text-foreground", icon: "text-muted-foreground" },
    success: { bg: "bg-success/10", text: "text-success", icon: "text-success" },
    danger:  { bg: "bg-destructive/10", text: "text-destructive", icon: "text-destructive" },
    primary: { bg: "bg-primary/10", text: "text-primary", icon: "text-primary" },
  }[color];

  return (
    <Card className="p-4 relative overflow-hidden">
      <div className={`inline-flex items-center justify-center h-8 w-8 rounded-lg mb-3 ${colors.bg}`}>
        <span className={colors.icon}>{icon}</span>
      </div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-xl font-bold ${colors.text}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
      {progress !== undefined && (
        <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full ${progress >= 80 ? "bg-success" : progress >= 50 ? "bg-amber-500" : "bg-destructive"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </Card>
  );
}

export function PayDialog({ fee, onClose }: { fee: StudentFee; onClose: () => void }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const remaining = Number(fee.total_amount) - Number(fee.paid_amount);
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("أدخل مبلغاً صحيحاً");
      if (amt > remaining) throw new Error("المبلغ يتجاوز المتبقي");

      const receiptNumber = `RC-${Date.now().toString().slice(-8)}`;
      const combinedNotes = [
        reference ? `رقم المرجع/السند: ${reference}` : null,
        `سند قبض: ${receiptNumber}`,
        notes || null,
      ].filter(Boolean).join("\n");

      const { error: pErr } = await supabase.from("payments").insert({
        student_fee_id: fee.id, amount: amt, method, paid_at: date,
        notes: combinedNotes, created_by: profile?.id ?? null, created_by_name: profile?.full_name ?? null,
      });
      if (pErr) throw pErr;
      const newPaid = Number(fee.paid_amount) + amt;
      const { error: fErr } = await supabase.from("student_fees").update({ paid_amount: newPaid, last_payment_at: date }).eq("id", fee.id);
      if (fErr) throw fErr;
      return { completed: newPaid >= Number(fee.total_amount), receiptNumber };
    },
    onSuccess: ({ completed, receiptNumber }) => {
      toast.success(
        completed ? `🎉 اكتمل السداد! سند قبض: ${receiptNumber}` : `تم تسجيل الدفعة ✓ سند: ${receiptNumber}`,
        { duration: 5000 }
      );
      qc.invalidateQueries({ queryKey: ["student-fees"] });
      qc.invalidateQueries({ queryKey: ["payments-log"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const pct = Number(fee.total_amount) > 0 ? Math.round((Number(fee.paid_amount) / Number(fee.total_amount)) * 100) : 0;
  const s = fee.students;
  const cls =
    s?.student_enrollments
      ?.find((e: any) => e.is_current)
      ?.classes ?? null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt size={18} className="text-primary" /> تسجيل دفعة جديدة
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-semibold">{s?.full_name ?? "—"}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {cls ? `${cls.name}${cls.section ? ` / ${cls.section}` : ""}` : ""}
                  {fee.academic_year ? ` • ${fee.academic_year}` : ""}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded-lg bg-background border p-2.5 text-center">
                <div className="text-[10px] text-muted-foreground mb-1">الإجمالي</div>
                <div className="font-bold text-sm">{Number(fee.total_amount).toLocaleString()}</div>
              </div>
              <div className="rounded-lg bg-success/10 border border-success/20 p-2.5 text-center">
                <div className="text-[10px] text-muted-foreground mb-1">المدفوع</div>
                <div className="font-bold text-sm text-success">{Number(fee.paid_amount).toLocaleString()}</div>
              </div>
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-center">
                <div className="text-[10px] text-muted-foreground mb-1">المتبقي</div>
                <div className="font-bold text-sm text-destructive">{remaining.toLocaleString()}</div>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>نسبة السداد</span>
                <span className="font-semibold">{pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-success" : pct >= 60 ? "bg-amber-500" : "bg-destructive"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>مبلغ الدفعة (ر.ي) *</Label>
              <NumberInput
                placeholder={`المتبقي: ${remaining.toLocaleString()}`}
                value={amount}
                onChange={(raw) => setAmount(raw)}
                className="text-sm"
              />
              <button
                className="text-xs text-primary hover:underline"
                onClick={() => setAmount(String(remaining))}
              >
                سداد كامل المتبقي ({remaining.toLocaleString()} ر.ي)
              </button>
            </div>
            <div className="space-y-1.5">
              <Label>طريقة الدفع</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>تاريخ الدفع</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>رقم المرجع / السند</Label>
              <Input placeholder="اختياري" dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>ملاحظات</Label>
            <Textarea rows={2} placeholder="ملاحظات اختيارية..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={() => save.mutate()} disabled={!amount || save.isPending} className="gap-2">
            <Receipt size={15} />
            {save.isPending ? "جارٍ التسجيل..." : "تسجيل الدفعة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── View Dialog ────────────────────────────────────────────────────────────────
function ViewDialog({ fee, onClose }: { fee: StudentFee; onClose: () => void }) {
  const { data: payments } = useQuery({
    queryKey: ["student-statement", fee.id],
    queryFn: async () => {
      const { data } = await supabase.from("payments").select("*").eq("student_fee_id", fee.id).order("paid_at", { ascending: false });
      return (data ?? []) as PaymentRow[];
    },
  });

  const s = fee.students;
  const cls = currentClass(s);
  const total = Number(fee.total_amount);
  const paid = Number(fee.paid_amount);
  const remaining = total - paid;
  const pct = total > 0 ? Math.round((paid / total) * 100) : 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpRight size={18} className="text-primary" />
            كشف حساب — {s?.full_name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="font-semibold mb-1">{s?.full_name ?? "—"}</div>
            <div className="text-xs text-muted-foreground">
              {cls ? `${cls.name}${cls.section ? ` / ${cls.section}` : ""}` : ""}
              {fee.academic_year ? ` • ${fee.academic_year}` : "gggggg"}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 mb-3">
              <div className="rounded-lg bg-background border p-2.5 text-center">
                <div className="text-[10px] text-muted-foreground mb-1">الإجمالي</div>
                <div className="font-bold text-sm">{total.toLocaleString()} <span className="text-[9px]">ر.ي</span></div>
              </div>
              <div className="rounded-lg bg-success/10 border border-success/20 p-2.5 text-center">
                <div className="text-[10px] text-muted-foreground mb-1">المدفوع</div>
                <div className="font-bold text-sm text-success">{paid.toLocaleString()} <span className="text-[9px]">ر.ي</span></div>
              </div>
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-center">
                <div className="text-[10px] text-muted-foreground mb-1">المتبقي</div>
                <div className="font-bold text-sm text-destructive">{remaining.toLocaleString()} <span className="text-[9px]">ر.ي</span></div>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>نسبة السداد</span>
                <span className="font-semibold">{pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full ${pct >= 100 ? "bg-success" : pct >= 60 ? "bg-amber-500" : "bg-destructive"}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">سجل الدفعات ({payments?.length ?? 0})</h3>
            {(payments ?? []).length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm border rounded-lg">
                <CreditCard className="mx-auto mb-2 opacity-30" size={24} />
                لا توجد دفعات مسجلة
              </div>
            ) : (
              <div className="divide-y border rounded-lg overflow-hidden">
                {(payments ?? []).map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 hover:bg-muted/30">
                    <div>
                      <div className="text-sm font-medium">{Number(p.amount).toLocaleString()} ر.ي</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {PAYMENT_METHODS[p.method] ?? p.method}
                        {p.created_by_name ? ` • بواسطة: ${p.created_by_name}` : ""}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground text-left">
                      {new Date(p.paid_at).toLocaleDateString("ar-EG")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Payment Log ────────────────────────────────────────────────────────────────
function PaymentLog() {
  const [dateFrom, setDateFrom] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [methodFilter, setMethodFilter] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["payments-log", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, student_fees(academic_year, students(full_name))")
        .gte("paid_at", dateFrom)
        .lte("paid_at", dateTo + "T23:59:59")
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PaymentRow[];
    },
  });

  const filtered = useMemo(() => (data ?? []).filter(p => methodFilter === "all" || p.method === methodFilter), [data, methodFilter]);
  const total = useMemo(() => filtered.reduce((a, p) => a + Number(p.amount), 0), [filtered]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">من تاريخ</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">إلى تاريخ</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">طريقة الدفع</Label>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {Object.entries(PAYMENT_METHODS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {filtered.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">عدد الدفعات</div>
            <div className="text-xl font-bold mt-1">{filtered.length}</div>
          </Card>
          <Card className="p-4 col-span-2">
            <div className="text-xs text-muted-foreground">إجمالي المحصّل</div>
            <div className="text-xl font-bold mt-1 text-success">{total.toLocaleString("ar-EG")} ر.ي</div>
          </Card>
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="text-xs">#</TableHead>
              <TableHead className="text-xs">الطالب</TableHead>
              <TableHead className="text-xs">العام الدراسي</TableHead>
              <TableHead className="text-xs">المبلغ</TableHead>
              <TableHead className="text-xs">طريقة الدفع</TableHead>
              <TableHead className="text-xs">تاريخ الدفع</TableHead>
              <TableHead className="text-xs">بواسطة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  <Receipt className="mx-auto mb-2 opacity-30" size={28} />
                  لا توجد مدفوعات في هذه الفترة
                </TableCell>
              </TableRow>
            )}
            {filtered.map((p, i) => (
              <TableRow key={p.id} className="hover:bg-muted/20">
                <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-medium text-sm">{(p.student_fees as any)?.students?.full_name ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{(p.student_fees as any)?.academic_year ?? "—"}</TableCell>
                <TableCell className="font-semibold text-success">{Number(p.amount).toLocaleString()} ر.ي</TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{PAYMENT_METHODS[p.method] ?? p.method}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(p.paid_at).toLocaleDateString("ar-EG")}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{p.created_by_name ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}