import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Receipt } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, LineChart, Line,
} from "recharts";
import {
  BarChart3, GraduationCap, Users, School, CreditCard, TrendingUp,
  TrendingDown, Printer, Download, FileSpreadsheet, Filter, X,
  ChevronLeft, ChevronRight, AlertCircle, BookOpen, ClipboardCheck,
  Wallet, CalendarDays, UserCheck, UserX, Clock, Info,
} from "lucide-react";
import { toast } from "sonner";
import { printReport } from "@/lib/report-print";
import { exportExcel } from "@/lib/report-excel";

export const Route = createFileRoute("/reports")({ component: Page });

// ─── Types ────────────────────────────────────────────────────────────────────
interface Student {
  id: string; full_name: string; gender: "male" | "female";
  class_id: string | null; status: "active" | "withdrawn" | "graduated";
  parent_phone: string | null; created_at: string;
  classes?: { name: string; section: string | null } | null;
}
interface Teacher {
  id: string; full_name: string; email: string | null; phone: string | null;
  specialization: string | null; qualification: string | null;
  hire_date: string | null; status: "active" | "inactive"; created_at: string;
}
interface Fee {
  id: string; student_id: string; academic_year: string;
  total_amount: number; paid_amount: number; last_payment_at: string | null;
  students?: { full_name: string; class_id: string | null; classes?: { name: string; section: string | null } | null } | null;
}
interface Payment {
  id: string; student_fee_id: string; amount: number;
  method: string | null; paid_at: string; created_by_name: string | null;
  student_fees?: { academic_year: string; students?: { full_name: string } | null } | null;
}
interface AttendanceRow {
  student_id: string; class_id: string; date: string;
  status: "present" | "absent" | "late" | "excused";
  students?: { full_name: string } | null;
  classes?: { name: string; section: string | null } | null;
}
interface ClassInfo { id: string; name: string; section: string | null; }

// ─── Constants ────────────────────────────────────────────────────────────────
const TABS = [
  { id: "dashboard", label: "لوحة المؤشرات", icon: BarChart3 },
  { id: "students", label: "تقارير الطلاب", icon: GraduationCap },
  { id: "financial", label: "التقارير المالية", icon: CreditCard },
  { id: "teachers", label: "المعلمون", icon: Users },
  { id: "charts", label: "الرسوم البيانية", icon: TrendingUp },
] as const;
type TabId = typeof TABS[number]["id"];

const STUDENT_REPORTS = [
  { id: "all", label: "جميع الطلاب" },
  { id: "active", label: "الطلاب النشطون" },
  { id: "withdrawn", label: "الطلاب المنقطعون" },
  { id: "graduated", label: "الطلاب المتخرجون" },
  { id: "new", label: "الطلاب الجدد" },
  { id: "attendance", label: "تقرير الحضور والغياب" },
  { id: "late", label: "تقرير التأخر الصباحي" },
] as const;

const FINANCIAL_REPORTS = [
  { id: "fees", label: "الرسوم الدراسية" },
  { id: "payments", label: " سجل المدفوعات" },
  { id: "arrears", label: "المتأخرات" },
  { id: "fully_paid", label: "المدفوع بالكامل" },
  { id: "daily_cash", label: "الصندوق اليومي" },
] as const;
// واجهة شاشة التقارير والإحصائيات
const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316"];
const PAGE_SIZE = 25;

const formatCurrency = (n: number) =>
  `${n.toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ر.ي`;
const pct = (a: number, b: number) =>
  b === 0 ? "0%" : `${((a / b) * 100).toFixed(1)}%`;
const fmtDate = (s: string) => new Date(s).toLocaleDateString("ar-EG");
const GENDER: Record<string, string> = { male: "ذكر", female: "أنثى" };
const STATUS_STUDENT: Record<string, string> = { active: "نشط", withdrawn: "منقطع", graduated: "متخرج" };
const ATT_STATUS: Record<string, string> = { present: "حاضر", absent: "غائب", late: "متأخر", excused: "بعذر" };
const ATT_COLOR: Record<string, string> = {
  present: "bg-green-100 text-green-700",
  absent: "bg-red-100 text-red-700",
  late: "bg-amber-100 text-amber-700",
  excused: "bg-blue-100 text-blue-700",
};
const PAYMENT_METHOD: Record<string, string> = {
  cash: "نقداً", transfer: "تحويل", bank: "بنك", online: "إلكتروني", check: "شيك",
};

// ─── School info singleton ID ──────────────────────────────────────────────────
const SCHOOL_INFO_ID = "00000000-0000-0000-0000-000000000001";

// ─── Route + Page ─────────────────────────────────────────────────────────────
function Page() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  return <AppShell><ReportsView /></AppShell>;
}

// ─── Filters state ────────────────────────────────────────────────────────────
interface Filters {
  academicYear: string;
  classId: string;
  status: string;
  dateFrom: string;
  dateTo: string;
}
const today = new Date().toISOString().slice(0, 10);
const firstDayMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
const defaultFilters: Filters = {
  academicYear: "all",
  classId: "all",
  status: "all",
  dateFrom: firstDayMonth,
  dateTo: today,
};

// ─── Main View ────────────────────────────────────────────────────────────────
function ReportsView() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [studentReport, setStudentReport] = useState("all");
  const [financialReport, setFinancialReport] = useState("fees");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const setFilter = (k: keyof Filters, v: string) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };
  const clearFilters = () => { setFilters(defaultFilters); setPage(1); };

  // ── School info ──
  const { data: schoolInfo } = useQuery({
    queryKey: ["school-info"],
    queryFn: async () => {
      const { data } = await supabase
        .from("school_info")
        .select("name_ar,name_en,desc_ar,desc_en,logo_url")
        .eq("id", SCHOOL_INFO_ID)
        .maybeSingle();
      return data as { name_ar: string; name_en: string; desc_ar: string; desc_en: string; logo_url: string } | null;
    },
  });

  const schoolOpts = {
    schoolNameAr: schoolInfo?.name_ar || "نظام إدارة المدارس الأهلية",
    schoolNameEn: schoolInfo?.name_en || "School Management System",
    schoolDescAr: schoolInfo?.desc_ar || "",
    schoolDescEn: schoolInfo?.desc_en || "",
    schoolLogoUrl: schoolInfo?.logo_url || "",
  };

  // ── Classes list for filter ──
  const { data: classes } = useQuery({
    queryKey: ["classes-list"],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id,section,name").order("grade_level");
      return (data ?? []) as ClassInfo[];
    },
  });

  // ── Academic years from fees ──
  const { data: academicYears } = useQuery({
    queryKey: ["academic-years"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_fees")
        .select("academic_year");

      if (error) throw error;

      const years = (data ?? [])
        .map((r: any) => r.academic_year)
        .filter(Boolean);

      return Array.from(new Set(years)) as string[];
    },
  });
  // تعليق

//  وهذا هل هو صحيح اعتقد غلط انا الان ابني نظام انا وصديقي الان اراجع بعده وقمت بتعديل جداول قاعدة البيانات

 // const { data: academicYears } = useQuery({
//  queryKey: ["academic-years"],
 // queryFn: async () => {
//  const { data } = await supabase.from("student_fees").select("academic_year").order("academic_year", { ascending: false });
//  return Array.from(new Set((data ?? []).map((r: any) => r.academic_year))) as string[];
 // },
 // });

 // وكاتبلي تعليق
  // ── Academic years from fees ──


  // ── Students Tab query (original — with enrollment + class join) ──
  const { data: students, isLoading: studentsLoading } = useQuery({
    queryKey: ["report-students", filters.classId, filters.status, filters.academicYear],
    queryFn: async () => {
      let q = supabase
        .from("students")
        .select(`*,
          student_enrollments!student_enrollments_student_id_fkey(
            class_id,
            is_current,
            classes(name, section)
          )
        `)
        .order("full_name");

      if (filters.status !== "all") {
        q = q.eq("status", filters.status);
      }

      const { data, error } = await q;
      if (error) throw error;

      let rows = (data ?? []).map((s: any) => {
        const enrollments: any[] = s.student_enrollments ?? [];
        const currentEnroll = enrollments.find((e: any) => e.is_current) ?? enrollments[0] ?? null;
        return { ...s, classes: currentEnroll?.classes ?? null };
      }) as Student[];

      if (filters.classId !== "all") {
        rows = rows.filter((s: any) =>
          (s.student_enrollments ?? []).some((e: any) => e.class_id === filters.classId)
        );
      }

      return rows;
    },
  });

  // ── Financial Tab helpers — independent from Students Tab ──
  // All students (no filters) for fee name lookup
  const { data: allStudents } = useQuery({
    queryKey: ["report-all-students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name");
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string }[];
    },
  });

  // All enrollments (no filters) for fee class lookup
  const { data: allEnrollments } = useQuery({
    queryKey: ["report-enrollments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_enrollments")
        .select("student_id, class_id, is_current");
      if (error) throw error;
      return (data ?? []) as { student_id: string; class_id: string; is_current: boolean }[];
    },
  });



  // ── Teachers ──
  const { data: teachers, isLoading: teachersLoading } = useQuery({
    queryKey: ["report-teachers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teachers").select("*").order("full_name");
      if (error) throw error;
      return (data ?? []) as Teacher[];
    },
  });

  // ── Fees (simple query, no nested joins) ──
  const { data: rawFees, isLoading: feesLoading } = useQuery({
    queryKey: ["report-fees", filters.academicYear],
    queryFn: async () => {
      let q = supabase
        .from("student_fees")
        .select("id, student_id, academic_year, total_amount, paid_amount, created_at")
        .order("academic_year", { ascending: false });
      if (filters.academicYear !== "all") {
        q = q.eq("academic_year", filters.academicYear);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // ── Fees joined with student name + class info client-side ──
  const fees = useMemo((): Fee[] => {
    const studentMap = new Map((allStudents ?? []).map((s) => [s.id, s]));
    const classMap   = new Map((classes ?? []).map((c) => [c.id, c]));
    const enrollMap  = new Map<string, string>();
    for (const e of allEnrollments ?? []) {
      if (!enrollMap.has(e.student_id) || e.is_current) {
        enrollMap.set(e.student_id, e.class_id);
      }
    }

    let rows = (rawFees ?? []).map((f: any) => {
      const student = studentMap.get(f.student_id) ?? null;
      const classId = enrollMap.get(f.student_id) ?? null;
      const cls     = classId ? (classMap.get(classId) ?? null) : null;
      return { ...f, students: student, _class: cls };
    }) as any[];

    if (filters.classId !== "all") {
      rows = rows.filter((f: any) => enrollMap.get(f.student_id) === filters.classId);
    }

    return rows as Fee[];
  }, [rawFees, allStudents, allEnrollments, classes, filters.classId]);

  // ── Payments — single query with student name + academic year ──
  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ["report-payments", filters.dateFrom, filters.dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, fee_id, amount, method, paid_at, notes, student_fees(academic_year, student_id, students(full_name))")
        .gte("paid_at", filters.dateFrom)
        .lte("paid_at", filters.dateTo + "T23:59:59")
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Payment[];
    },
  });

  // ── Attendance (for reports + charts) ──
  const { data: attendance, isLoading: attendanceLoading } = useQuery({
    queryKey: ["report-attendance", filters.classId, filters.dateFrom, filters.dateTo],
    queryFn: async () => {
      let q = supabase
        .from("attendance")
        .select("*, students(full_name), classes(name, section)")
        .gte("date", filters.dateFrom)
        .lte("date", filters.dateTo)
        .order("date", { ascending: false });
      if (filters.classId !== "all") q = q.eq("class_id", filters.classId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AttendanceRow[];
    },
  });

  // ─── Dashboard summary calculations ──────────────────────────────────────
  const totalStudents = students?.length ?? 0;
  const activeStudents = useMemo(() => (students ?? []).filter((s) => s.status === "active").length, [students]);
  const withdrawnStudents = useMemo(() => (students ?? []).filter((s) => s.status === "withdrawn").length, [students]);
  const activeTeachers = useMemo(() => (teachers ?? []).filter((t) => t.status === "active").length, [teachers]);
  const totalFees = useMemo(() => (fees ?? []).reduce((a, f) => a + f.total_amount, 0), [fees]);
  const totalPaid = useMemo(() => (fees ?? []).reduce((a, f) => a + f.paid_amount, 0), [fees]);
  const totalRemaining = totalFees - totalPaid;
  const collectionPct = totalFees > 0 ? ((totalPaid / totalFees) * 100).toFixed(1) : "0";

  // ─── Students by class for charts ─────────────────────────────────────────
  const studentsByClass = useMemo(() => {
    const map: Record<string, { name: string; total: number; active: number }> = {};
    for (const s of students ?? []) {
      const cn = (s.classes as any)?.name ?? "غير محدد";
      if (!map[cn]) map[cn] = { name: cn, total: 0, active: 0 };
      map[cn].total++;
      if (s.status === "active") map[cn].active++;
    }
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 12);
  }, [students]);

  // ─── Monthly payments for charts ──────────────────────────────────────────
  const monthlyPayments = useMemo(() => {
    const map: Record<string, { month: string; amount: number; count: number }> = {};
    for (const p of payments ?? []) {
      const m = p.paid_at.slice(0, 7);
      const label = new Date(m + "-01").toLocaleDateString("ar-EG", { year: "numeric", month: "short" });
      if (!map[m]) map[m] = { month: label, amount: 0, count: 0 };
      map[m].amount += p.amount;
      map[m].count++;
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [payments]);

  // ─── Attendance for charts ────────────────────────────────────────────────
  const attendancePieData = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const r of attendance ?? []) c[r.status]++;
    return [
      { name: "حاضر", value: c.present, color: "#22c55e" },
      { name: "غائب", value: c.absent, color: "#ef4444" },
      { name: "متأخر", value: c.late, color: "#f59e0b" },
      { name: "مستأذن", value: c.excused, color: "#3b82f6" },
    ].filter((d) => d.value > 0);
  }, [attendance]);

  // ─── Filtered data per report ──────────────────────────────────────────────
  const filteredStudents = useMemo(() => {
    let rows = students ?? [];
    if (studentReport === "active") rows = rows.filter((s) => s.status === "active");
    else if (studentReport === "withdrawn") rows = rows.filter((s) => s.status === "withdrawn");
    else if (studentReport === "graduated") rows = rows.filter((s) => s.status === "graduated");
    else if (studentReport === "new") {
      const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 3);
      rows = rows.filter((s) => new Date(s.created_at) >= cutoff);
    }
    return rows;
  }, [students, studentReport]);

  const filteredAttendance = useMemo(() => {
    if (studentReport === "attendance") return attendance ?? [];
    if (studentReport === "late") return (attendance ?? []).filter((a) => a.status === "late");
    return attendance ?? [];
  }, [attendance, studentReport]);

  const filteredFees = useMemo(() => {
    let rows = fees ?? [];
    if (financialReport === "arrears") rows = rows.filter((f) => f.paid_amount < f.total_amount);
    else if (financialReport === "fully_paid") rows = rows.filter((f) => f.paid_amount >= f.total_amount);
    return rows;
  }, [fees, financialReport]);

  // ─── Daily cash ───────────────────────────────────────────────────────────
  const dailyCash = useMemo(() => {
    const map: Record<string, { date: string; amount: number; count: number }> = {};
    for (const p of payments ?? []) {
      const d = p.paid_at.slice(0, 10);
      if (!map[d]) map[d] = { date: d, amount: 0, count: 0 };
      map[d].amount += p.amount;
      map[d].count++;
    }
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a)).map(([, v]) => v);
  }, [payments]);

  // ─── Active filter count ──────────────────────────────────────────────────
  const activeFilters = [
    filters.academicYear !== "all",
    filters.classId !== "all",
    filters.status !== "all",
    filters.dateFrom !== firstDayMonth || filters.dateTo !== today,
  ].filter(Boolean).length;

  // ─── Export handlers ──────────────────────────────────────────────────────
  function handlePrintStudents() {
    const isAtt = studentReport === "attendance" || studentReport === "late";
    if (isAtt) {
      printReport({
        ...schoolOpts,
        title: STUDENT_REPORTS.find((r) => r.id === studentReport)?.label ?? "تقرير الحضور",
        headers: ["#", "الطالب", "الصف", "التاريخ", "الحالة"],
        rows: filteredAttendance.map((r, i) => [
          i + 1, (r.students as any)?.full_name ?? "—",
          `${(r.classes as any)?.name ?? "—"}${(r.classes as any)?.section ? " / " + (r.classes as any).section : ""}`,
          fmtDate(r.date), ATT_STATUS[r.status] ?? r.status,
        ]),
        filters: buildFilterChips(),
        recordCount: filteredAttendance.length,
        academicYear: filters.academicYear !== "all" ? filters.academicYear : undefined,
      });
    } else {
      printReport({
        ...schoolOpts,
        title: STUDENT_REPORTS.find((r) => r.id === studentReport)?.label ?? "تقرير الطلاب",
        headers: ["#", "اسم الطالب", "الجنس", "الصف", "الشعبة", "رقم ولي الأمر", "الحالة"],
        rows: filteredStudents.map((s, i) => [
          i + 1, s.full_name, GENDER[s.gender] ?? s.gender,
          (s.classes as any)?.name ?? "—",
          (s.gender as any)?.section ?? "—",
          s.parent_phone ?? "—",
          STATUS_STUDENT[s.status] ?? s.status,
        ]),
        filters: buildFilterChips(),
        recordCount: filteredStudents.length,
        academicYear: filters.academicYear !== "all" ? filters.academicYear : undefined,
      });
    }
  }

  function handleExcelStudents() {
    const isAtt = studentReport === "attendance" || studentReport === "late";
    if (isAtt) {
      exportExcel({
        title: STUDENT_REPORTS.find((r) => r.id === studentReport)?.label ?? "تقرير الحضور",
        headers: ["#", "الطالب", "الصف", "التاريخ", "الحالة"],
        rows: filteredAttendance.map((r, i) => [
          i + 1, (r.students as any)?.full_name ?? "—",
          `${(r.classes as any)?.name ?? ""}${(r.classes as any)?.section ? " / " + (r.classes as any).section : ""}`,
          r.date, ATT_STATUS[r.status] ?? r.status,
        ]),
      });
    } else {
      exportExcel({
        title: STUDENT_REPORTS.find((r) => r.id === studentReport)?.label ?? "تقرير الطلاب",
        headers: ["#", "اسم الطالب", "الجنس", "الصف", "الشعبة", "رقم ولي الأمر", "الحالة", "تاريخ التسجيل"],
        rows: filteredStudents.map((s, i) => [
          i + 1, s.full_name, GENDER[s.gender] ?? s.gender,
          (s.classes as any)?.name ?? "—",
          (s.classes as any)?.section ?? "—",
          s.parent_phone ?? "—" ,
          STATUS_STUDENT[s.status] ?? s.status,
          fmtDate(s.created_at),
        ]),
      });
    }
    toast.success("تم تصدير ملف Excel بنجاح");
  }

  function handlePrintFinancial() {
    const rptLabel = FINANCIAL_REPORTS.find((r) => r.id === financialReport)?.label ?? "تقرير مالي";
    if (financialReport === "payments" || financialReport === "daily_cash") {
      const rows = financialReport === "daily_cash"
        ? dailyCash.map((d, i) => [i + 1, fmtDate(d.date), d.count, formatCurrency(d.amount)])
        : payments?.map((p, i) => [
            i + 1,
            (p.student_fees as any)?.students?.full_name ?? "—",
            (p.student_fees as any)?.academic_year ?? "—",
            PAYMENT_METHOD[p.method ?? ""] ?? p.method ?? "—",
            formatCurrency(p.amount),
            fmtDate(p.paid_at),
          ]) ?? [];
      const hdrs = financialReport === "daily_cash"
        ? ["#", "التاريخ", "عدد الدفعات", "الإجمالي"]
        : ["#", "الطالب", "العام الدراسي", "طريقة الدفع", "المبلغ", "التاريخ"];
      printReport({
        ...schoolOpts,
        title: rptLabel,
        headers: hdrs,
        rows: rows as (string | number)[][],
        totals: [{ label: "الإجمالي الكلي", value: formatCurrency((payments ?? []).reduce((a, p) => a + p.amount, 0)) }],
        filters: buildFilterChips(),
        recordCount: rows.length,
        academicYear: filters.academicYear !== "all" ? filters.academicYear : undefined,
      });
    } else {
      printReport({
        ...schoolOpts,
        title: rptLabel,
        headers: ["#", "الطالب", "الصف", "العام الدراسي", "المستحق", "المدفوع", "المتبقي", "نسبة التحصيل"],
        rows: filteredFees.map((f, i) => [
          i + 1,
          (f.students as any)?.full_name ?? "—",
          `${(f as any)._class?.name ?? "—"}${(f as any)._class?.section ? " / " + (f as any)._class.section : ""}`,
          f.academic_year,
          formatCurrency(f.total_amount),
          formatCurrency(f.paid_amount),
          formatCurrency(f.total_amount - f.paid_amount),
          pct(f.paid_amount, f.total_amount),
        ]),
        totals: [
          { label: "إجمالي المستحق", value: formatCurrency(filteredFees.reduce((a, f) => a + f.total_amount, 0)) },
          { label: "إجمالي المحصل", value: formatCurrency(filteredFees.reduce((a, f) => a + f.paid_amount, 0)) },
          { label: "إجمالي المتبقي", value: formatCurrency(filteredFees.reduce((a, f) => a + (f.total_amount - f.paid_amount), 0)) },
          { label: "نسبة التحصيل", value: pct(filteredFees.reduce((a, f) => a + f.paid_amount, 0), filteredFees.reduce((a, f) => a + f.total_amount, 0)) },
        ],
        filters: buildFilterChips(),
        recordCount: filteredFees.length,
        academicYear: filters.academicYear !== "all" ? filters.academicYear : undefined,
      });
    }
  }

  function handleExcelFinancial() {
    const rptLabel = FINANCIAL_REPORTS.find((r) => r.id === financialReport)?.label ?? "تقرير مالي";
    if (financialReport === "payments") {
      exportExcel({
        title: rptLabel,
        headers: ["#", "الطالب", "العام الدراسي", "طريقة الدفع", "المبلغ", "التاريخ"],
        rows: (payments ?? []).map((p, i) => [
          i + 1,
          (p.student_fees as any)?.students?.full_name ?? "—",
          (p.student_fees as any)?.academic_year ?? "—",
          PAYMENT_METHOD[p.method ?? ""] ?? p.method ?? "—",
          p.amount,
          p.paid_at.slice(0, 10),
        ]),
        totals: [{ label: "الإجمالي الكلي", value: (payments ?? []).reduce((a, p) => a + p.amount, 0) }],
      });
    } else if (financialReport === "daily_cash") {
      exportExcel({
        title: rptLabel,
        headers: ["#", "التاريخ", "عدد الدفعات", "الإجمالي"],
        rows: dailyCash.map((d, i) => [i + 1, d.date, d.count, d.amount]),
        totals: [{ label: "الإجمالي", value: dailyCash.reduce((a, d) => a + d.amount, 0) }],
      });
    } else {
      exportExcel({
        title: rptLabel,
        headers: ["#", "الطالب", "الصف", "العام الدراسي", "المستحق", "المدفوع", "المتبقي", "نسبة التحصيل"],
        rows: filteredFees.map((f, i) => [
          i + 1,
          (f.students as any)?.full_name ?? "—",
          `${(f as any)._class?.name ?? ""}${(f as any)._class?.section ? "/" + (f as any)._class.section : ""}`,
          f.academic_year,
          f.total_amount,
          f.paid_amount,
          f.total_amount - f.paid_amount,
          pct(f.paid_amount, f.total_amount),
        ]),
        totals: [
          { label: "إجمالي المستحق", value: filteredFees.reduce((a, f) => a + f.total_amount, 0) },
          { label: "إجمالي المحصل", value: filteredFees.reduce((a, f) => a + f.paid_amount, 0) },
          { label: "إجمالي المتبقي", value: filteredFees.reduce((a, f) => a + (f.total_amount - f.paid_amount), 0) },
        ],
      });
    }
    toast.success("تم تصدير ملف Excel بنجاح");
  }

  function handlePrintTeachers() {
    printReport({
      ...schoolOpts,
      title: "كشف المعلمين",
      headers: ["#", "الاسم", "التخصص", "المؤهل", "الهاتف", "تاريخ التعيين", "الحالة"],
      rows: (teachers ?? []).map((t, i) => [
        i + 1, t.full_name, t.specialization ?? "—", t.qualification ?? "—",
        t.phone ?? "—", t.hire_date ? fmtDate(t.hire_date) : "—",
        t.status === "active" ? "نشط" : "غير نشط",
      ]),
      recordCount: teachers?.length ?? 0,
    });
  }

  function handleExcelTeachers() {
    exportExcel({
      title: "كشف المعلمين",
      headers: ["#", "الاسم", "التخصص", "المؤهل", "الهاتف", "تاريخ التعيين", "الحالة"],
      rows: (teachers ?? []).map((t, i) => [
        i + 1, t.full_name, t.specialization ?? "—", t.qualification ?? "—",
        t.phone ?? "—", t.hire_date ?? "—",
        t.status === "active" ? "نشط" : "غير نشط",
      ]),
    });
    toast.success("تم تصدير ملف Excel بنجاح");
  }

  function buildFilterChips() {
    const chips: { label: string; value: string }[] = [];
    if (filters.academicYear !== "all") chips.push({ label: "العام الدراسي", value: filters.academicYear });
    if (filters.classId !== "all") {
      const cls = (classes ?? []).find((c) => c.id === filters.classId);
      chips.push({ label: "الصف", value: cls ? `${cls.name}${cls.section ? " / " + cls.section : ""}` : filters.classId });
    }
    if (filters.status !== "all") chips.push({ label: "الحالة", value: STATUS_STUDENT[filters.status] ?? filters.status });
    chips.push({ label: "الفترة", value: `${filters.dateFrom} → ${filters.dateTo}` });
    return chips;
  }

  return (
    <div className="space-y-5">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="text-primary" size={24} /> التقارير والإحصائيات
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">تقارير شاملة وإحصائيات تفصيلية لنظام إدارة المدرسة</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters((v) => !v)}
          className="gap-2"
        >
          <Filter size={14} />
          الفلاتر
          {activeFilters > 0 && (
            <Badge className="h-4 w-4 p-0 flex items-center justify-center text-[10px]">{activeFilters}</Badge>
          )}
        </Button>
      </div>

      {/* ── Filters panel ── */}
      {showFilters && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-sm flex items-center gap-2"><Filter size={14} className="text-primary" /> فلاتر التقارير</span>
            {activeFilters > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={clearFilters}>
                <X size={11} /> مسح الكل
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">العام الدراسي</Label>
              <Select value={filters.academicYear} onValueChange={(v) => setFilter("academicYear", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأعوام</SelectItem>
                  {(academicYears ?? []).map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الصف</Label>
              <Select value={filters.classId} onValueChange={(v) => setFilter("classId", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الصفوف</SelectItem>
                  {(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.section ? ` / ${c.section}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">حالة الطالب</Label>
              <Select value={filters.status} onValueChange={(v) => setFilter("status", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="withdrawn">منقطع</SelectItem>
                  <SelectItem value="graduated">متخرج</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">من تاريخ</Label>
              <Input type="date" className="h-8 text-xs" value={filters.dateFrom} onChange={(e) => setFilter("dateFrom", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">إلى تاريخ</Label>
              <Input type="date" className="h-8 text-xs" value={filters.dateTo} onChange={(e) => setFilter("dateTo", e.target.value)} />
            </div>
          </div>
        </Card>
      )}

      {/* ── Tab navigation ── */}
      <div className="flex gap-1 overflow-x-auto pb-1 border-b">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setPage(1); }}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap rounded-t-lg border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}
      {activeTab === "dashboard" && (
        <DashboardTab
          totalStudents={totalStudents}
          activeStudents={activeStudents}
          withdrawnStudents={withdrawnStudents}
          totalTeachers={teachers?.length ?? 0}
          activeTeachers={activeTeachers}
          totalClasses={classes?.length ?? 0}
          totalFees={totalFees}
          totalPaid={totalPaid}
          totalRemaining={totalRemaining}
          collectionPct={collectionPct}
          studentsByClass={studentsByClass}
          monthlyPayments={monthlyPayments}
          attendancePieData={attendancePieData}
        />
      )}

      {activeTab === "students" && (
        <StudentsTab
          reports={STUDENT_REPORTS as any}
          selectedReport={studentReport}
          onSelectReport={(r: string) => { setStudentReport(r); setPage(1); }}
          students={filteredStudents}
          attendance={filteredAttendance}
          isLoading={studentsLoading || attendanceLoading}
          page={page}
          setPage={setPage}
          onPrint={handlePrintStudents}
          onExcel={handleExcelStudents}
        />
      )}

      {activeTab === "financial" && (
        <FinancialTab
          reports={FINANCIAL_REPORTS as any}
          selectedReport={financialReport}
          onSelectReport={(r: string) => { setFinancialReport(r); setPage(1); }}
          fees={filteredFees}
          payments={payments ?? []}
          dailyCash={dailyCash}
          isLoading={feesLoading || paymentsLoading}
          totalFees={totalFees}
          totalPaid={totalPaid}
          totalRemaining={totalRemaining}
          collectionPct={collectionPct}
          page={page}
          setPage={setPage}
          onPrint={handlePrintFinancial}
          onExcel={handleExcelFinancial}
        />
      )}

      {activeTab === "teachers" && (
        <TeachersTab
          teachers={teachers ?? []}
          isLoading={teachersLoading}
          page={page}
          setPage={setPage}
          onPrint={handlePrintTeachers}
          onExcel={handleExcelTeachers}
        />
      )}

      {activeTab === "charts" && (
        <ChartsTab
          studentsByClass={studentsByClass}
          monthlyPayments={monthlyPayments}
          attendancePieData={attendancePieData}
          totalFees={totalFees}
          totalPaid={totalPaid}
          totalRemaining={totalRemaining}
        />
      )}
    </div>
  );
}

// ─── Dashboard Tab ─────────────────────────────────────────────────────────────
function DashboardTab({ totalStudents, activeStudents, withdrawnStudents, totalTeachers, activeTeachers, totalClasses, totalFees, totalPaid, totalRemaining, collectionPct, studentsByClass, monthlyPayments, attendancePieData }: any) {
  return (
    <div className="space-y-6">
      {/* Row 1: Student cards */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2"><GraduationCap size={14} /> إحصائيات الطلاب</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="إجمالي الطلاب" value={totalStudents} icon={GraduationCap} color="blue" />
          <SummaryCard label="الطلاب النشطون" value={activeStudents} icon={UserCheck} color="green" />
          <SummaryCard label="المنقطعون" value={withdrawnStudents} icon={UserX} color="red" />
          <SummaryCard label="الصفوف الدراسية" value={totalClasses} icon={School} color="violet" />
        </div>
      </div>

      {/* Row 2: Staff cards */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2"><Users size={14} /> إحصائيات الكادر</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="إجمالي المعلمين" value={totalTeachers} icon={Users} color="amber" />
          <SummaryCard label="المعلمون النشطون" value={activeTeachers} icon={UserCheck} color="green" />
          <SummaryCard label="غير نشط" value={totalTeachers - activeTeachers} icon={UserX} color="gray" />
          <SummaryCard label="المواد الدراسية" value="—" icon={BookOpen} color="blue" />
        </div>
      </div>

      {/* Row 3: Financial cards */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2"><Wallet size={14} /> الإحصائيات المالية</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="إجمالي الرسوم" value={totalFees > 0 ? formatCurrency(totalFees) : "—"} icon={CreditCard} color="blue" small />
          <SummaryCard label="المحصّل" value={totalPaid > 0 ? formatCurrency(totalPaid) : "—"} icon={TrendingUp} color="green" small />
          <SummaryCard label="المتأخرات" value={totalRemaining > 0 ? formatCurrency(totalRemaining) : "—"} icon={TrendingDown} color="red" small />
          <SummaryCard label="نسبة التحصيل" value={`${collectionPct}%`} icon={BarChart3} color="violet" small />
        </div>
      </div>

      {/* Row 4: Mini charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {studentsByClass.length > 0 && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">الطلاب حسب الصف</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={studentsByClass} margin={{ right: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} name="إجمالي" />
                <Bar dataKey="active" fill="#22c55e" radius={[4, 4, 0, 0]} name="نشط" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {attendancePieData.length > 0 && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">الحضور والغياب (الفترة المحددة)</h3>
            <div className="flex items-center justify-between">
              <ResponsiveContainer width="60%" height={180}>
                <PieChart>
                  <Pie data={attendancePieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value">
                    {attendancePieData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => v} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {attendancePieData.map((d: any) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ background: d.color }} />
                    <span>{d.name}: <strong>{d.value}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {monthlyPayments.length > 0 && (
          <Card className="p-4 lg:col-span-2">
            <h3 className="text-sm font-semibold mb-3">الإيرادات الشهرية (خلال الفترة)</h3>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={monthlyPayments} margin={{ right: 0, left: 0 }}>
                <defs>
                  <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => v.toLocaleString()} />
                <Tooltip formatter={(v: any) => formatCurrency(v)} />
                <Area type="monotone" dataKey="amount" stroke="#3b82f6" fill="url(#grad1)" name="المدفوعات" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Students Tab ─────────────────────────────────────────────────────────────
function StudentsTab({ reports, selectedReport, onSelectReport, students, attendance, isLoading, page, setPage, onPrint, onExcel }: any) {
  const isAttReport = selectedReport === "attendance" || selectedReport === "late";
  const data = isAttReport ? attendance : students;
  const paginated = usePagination(data, page, PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Sub-report selector */}
      <div className="flex flex-wrap gap-2">
        {reports.map((r: any) => (
          <button key={r.id} onClick={() => onSelectReport(r.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${selectedReport === r.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted text-muted-foreground"}`}>
            {r.label}
          </button>
        ))}
      </div>

      <ReportTable
        title={reports.find((r: any) => r.id === selectedReport)?.label ?? ""}
        isLoading={isLoading}
        total={data.length}
        page={page}
        setPage={setPage}
        onPrint={onPrint}
        onExcel={onExcel}
      >
        {isAttReport ? (
          <AttendanceTable rows={paginated as AttendanceRow[]} />
        ) : (
          <StudentsTableContent rows={paginated as Student[]} />
        )}
      </ReportTable>
    </div>
  );
}

function StudentsTableContent({ rows }: { rows: Student[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead>اسم الطالب</TableHead>
          <TableHead>الجنس</TableHead>
          <TableHead>الصف</TableHead>
          <TableHead>الشعبة</TableHead>
          <TableHead>رقم ولي الأمر</TableHead>
          <TableHead>الحالة</TableHead>
          <TableHead>تاريخ التسجيل</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground"><AlertCircle className="mx-auto mb-2 opacity-30" size={28} />لا توجد بيانات</TableCell></TableRow>
        ) : rows.map((s, i) => (
          <TableRow key={s.id}>
            <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
            <TableCell className="font-medium">{s.full_name}</TableCell>
            <TableCell>{GENDER[s.gender] ?? s.gender}</TableCell>
            <TableCell>{(s.classes as any)?.name ?? "—"}</TableCell>
            <TableCell>{(s.classes as any)?.section ?? "—"}</TableCell>
            <TableCell dir="ltr" className="text-xs text-muted-foreground">{s.parent_phone ?? "—"}</TableCell>
            <TableCell>
              <Badge variant="outline" className={s.status === "active" ? "bg-green-50 text-green-700 border-green-200" : s.status === "withdrawn" ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}>
                {STATUS_STUDENT[s.status]}
              </Badge>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">{fmtDate(s.created_at)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AttendanceTable({ rows }: { rows: AttendanceRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead>الطالب</TableHead>
          <TableHead>الصف</TableHead>
          <TableHead>التاريخ</TableHead>
          <TableHead>الحالة</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground"><AlertCircle className="mx-auto mb-2 opacity-30" size={28} />لا توجد بيانات</TableCell></TableRow>
        ) : rows.map((r, i) => (
          <TableRow key={`${r.student_id}-${r.date}`}>
            <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
            <TableCell className="font-medium">{(r.students as any)?.full_name ?? "—"}</TableCell>
            <TableCell>{(r.classes as any)?.name ?? "—"}{(r.classes as any)?.section ? ` / ${(r.classes as any).section}` : ""}</TableCell>
            <TableCell className="text-sm">{fmtDate(r.date)}</TableCell>
            <TableCell>
              <Badge variant="outline" className={ATT_COLOR[r.status]}>
                {ATT_STATUS[r.status] ?? r.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── Financial Tab ─────────────────────────────────────────────────────────────
function FinancialTab({ reports, selectedReport, onSelectReport, fees, payments, dailyCash, isLoading, totalFees, totalPaid, totalRemaining, collectionPct, page, setPage, onPrint, onExcel }: any) {
  const paymentsRef = useRef<{ handlePrint: () => void } | null>(null);

  const data = selectedReport === "payments" ? payments
    : selectedReport === "daily_cash" ? dailyCash
    : fees;
  const paginated = usePagination(data, page, PAGE_SIZE);

  const handlePrintRouted = () => {
    if (selectedReport === "payments" && paymentsRef.current) {
      paymentsRef.current.handlePrint();
    } else {
      onPrint();
    }
  };

  const fTotal = fees.reduce((a: number, f: Fee) => a + f.total_amount, 0);
  const fPaid = fees.reduce((a: number, f: Fee) => a + f.paid_amount, 0);
  const fRemaining = fTotal - fPaid;

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="إجمالي المستحق" value={fTotal > 0 ? formatCurrency(fTotal) : "—"} color="text-blue-600" />
        <MiniStat label="إجمالي المحصّل" value={fPaid > 0 ? formatCurrency(fPaid) : "—"} color="text-green-600" />
        <MiniStat label="إجمالي المتبقي" value={fRemaining > 0 ? formatCurrency(fRemaining) : "—"} color="text-red-600" />
        <MiniStat label="نسبة التحصيل" value={`${collectionPct}%`} color="text-violet-600" />
      </div>

      {/* Progress bar */}
      {fTotal > 0 && (
        <Card className="p-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>نسبة التحصيل</span>
            <span className="font-semibold text-primary">{collectionPct}%</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all"
              style={{ width: `${Math.min(parseFloat(collectionPct), 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>{formatCurrency(fPaid)} محصّل</span>
            <span>{formatCurrency(fRemaining)} متبقي</span>
          </div>
        </Card>
      )}









      {/* Sub-report selector */}
      <div className="flex flex-wrap gap-2">
        {reports.map((r: any) => (
          <button key={r.id} onClick={() => onSelectReport(r.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${selectedReport === r.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted text-muted-foreground"}`}>
            {r.label}
          </button>
        ))}
      </div>

      <ReportTable
        title={reports.find((r: any) => r.id === selectedReport)?.label ?? ""}
        isLoading={isLoading}
        total={data.length}
        page={page}
        setPage={setPage}
        onPrint={handlePrintRouted}
        onExcel={onExcel}
      >
        {selectedReport === "payments" && <PaymentsTableContent printRef={paymentsRef} />}
        {selectedReport === "daily_cash" && <DailyCashTable rows={paginated as { date: string; amount: number; count: number }[]} />}
        {(selectedReport === "fees" || selectedReport === "arrears" || selectedReport === "fully_paid") && (
          <FeesTableContent rows={paginated as Fee[]} />
        )}
      </ReportTable>
    </div>
  );
}

function FeesTableContent({ rows }: { rows: Fee[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead>الطالب</TableHead>
          <TableHead>الصف</TableHead>
          <TableHead>العام الدراسي</TableHead>
          <TableHead>المستحق</TableHead>
          <TableHead>المدفوع</TableHead>
          <TableHead>المتبقي</TableHead>
          <TableHead>نسبة التحصيل</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground"><AlertCircle className="mx-auto mb-2 opacity-30" size={28} />لا توجد بيانات</TableCell></TableRow>
        ) : rows.map((f, i) => {
          const remaining = f.total_amount - f.paid_amount;
          const p = pct(f.paid_amount, f.total_amount);
          return (
            <TableRow key={f.id}>
              <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
              <TableCell className="font-medium">{(f.students as any)?.full_name ?? "—"}</TableCell>
              <TableCell className="text-sm">{(f as any)._class?.name ?? "—"}{(f as any)._class?.section ? ` / ${(f as any)._class.section}` : ""}</TableCell>
              <TableCell className="text-sm">{f.academic_year}</TableCell>
              <TableCell className="text-sm font-medium text-blue-700">{formatCurrency(f.total_amount)}</TableCell>
              <TableCell className="text-sm font-medium text-green-700">{formatCurrency(f.paid_amount)}</TableCell>
              <TableCell className={`text-sm font-medium ${remaining > 0 ? "text-red-600" : "text-green-600"}`}>{formatCurrency(remaining)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: p }} />
                  </div>
                  <span className="text-xs text-muted-foreground">{p}</span>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}



function PaymentsReportTable({ rows }: { rows: Payment[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead>الطالب</TableHead>
          <TableHead>العام الدراسي</TableHead>
          <TableHead>طريقة الدفع</TableHead>
          <TableHead>المبلغ</TableHead>
          <TableHead>التاريخ</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground"><AlertCircle className="mx-auto mb-2 opacity-30" size={28} />لا توجد مدفوعات في هذه الفترة</TableCell></TableRow>
        ) : rows.map((p, i) => (
          <TableRow key={p.id}>
            <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
            <TableCell className="font-medium">{(p.student_fees as any)?.students?.full_name ?? "—"}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{(p.student_fees as any)?.academic_year ?? "—"}</TableCell>
            <TableCell>
              <Badge variant="outline" className="text-xs">{PAYMENT_METHOD[p.method ?? ""] ?? p.method ?? "—"}</Badge>
            </TableCell>
            <TableCell className="font-semibold text-green-700">{formatCurrency(p.amount)}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{fmtDate(p.paid_at)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DailyCashTable({ rows }: { rows: { date: string; amount: number; count: number }[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead>التاريخ</TableHead>
          <TableHead>عدد الدفعات</TableHead>
          <TableHead>إجمالي اليوم</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground"><AlertCircle className="mx-auto mb-2 opacity-30" size={28} />لا توجد بيانات</TableCell></TableRow>
        ) : rows.map((d, i) => (
          <TableRow key={d.date}>
            <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
            <TableCell className="font-medium">{fmtDate(d.date)}</TableCell>
            <TableCell className="text-sm">{d.count} دفعة</TableCell>
            <TableCell className="font-semibold text-green-700">{formatCurrency(d.amount)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── Teachers Tab ──────────────────────────────────────────────────────────────
function TeachersTab({ teachers, isLoading, page, setPage, onPrint, onExcel }: any) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => (teachers as Teacher[]).filter((t: Teacher) =>
    !search || t.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (t.specialization ?? "").toLowerCase().includes(search.toLowerCase())
  ), [teachers, search]);
  const paginated = usePagination(filtered, page, PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="إجمالي المعلمين" value={teachers.length} color="text-blue-600" />
        <MiniStat label="نشط" value={(teachers as Teacher[]).filter((t: Teacher) => t.status === "active").length} color="text-green-600" />
        <MiniStat label="غير نشط" value={(teachers as Teacher[]).filter((t: Teacher) => t.status === "inactive").length} color="text-red-600" />
        <MiniStat label="مؤهل دكتوراه" value={(teachers as Teacher[]).filter((t: Teacher) => (t.qualification ?? "").includes("دكتوراه")).length} color="text-violet-600" />
      </div>

      <ReportTable
        title="كشف المعلمين"
        isLoading={isLoading}
        total={filtered.length}
        page={page}
        setPage={setPage}
        onPrint={onPrint}
        onExcel={onExcel}
        searchSlot={
          <div className="relative">
            <Input
              placeholder="بحث بالاسم أو التخصص..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="h-8 text-sm pr-3 w-48"
            />
          </div>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>الاسم</TableHead>
              <TableHead>التخصص / المادة</TableHead>
              <TableHead>المؤهل العلمي</TableHead>
              <TableHead>رقم الهاتف</TableHead>
              <TableHead>تاريخ التعيين</TableHead>
              <TableHead>الحالة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
            ) : paginated.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground"><AlertCircle className="mx-auto mb-2 opacity-30" size={28} />لا يوجد معلمون</TableCell></TableRow>
            ) : paginated.map((t: Teacher, i: number) => (
              <TableRow key={t.id}>
                <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                <TableCell className="font-medium">{t.full_name}</TableCell>
                <TableCell>{t.specialization ? <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">{t.specialization}</Badge> : "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{t.qualification ?? "—"}</TableCell>
                <TableCell dir="ltr" className="text-xs text-muted-foreground">{t.phone ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{t.hire_date ? fmtDate(t.hire_date) : "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={t.status === "active" ? "bg-green-50 text-green-700 border-green-200" : "bg-muted text-muted-foreground"}>
                    {t.status === "active" ? "نشط" : "غير نشط"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ReportTable>
    </div>
  );
}

// ─── Charts Tab ────────────────────────────────────────────────────────────────
function ChartsTab({ studentsByClass, monthlyPayments, attendancePieData, totalFees, totalPaid, totalRemaining }: any) {
  const collectionData = [
    { name: "محصّل", value: totalPaid, color: "#22c55e" },
    { name: "متبقي", value: totalRemaining, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  const noData = studentsByClass.length === 0 && monthlyPayments.length === 0 && attendancePieData.length === 0;

  if (noData) {
    return (
      <Card className="p-16 text-center text-muted-foreground">
        <BarChart3 className="mx-auto mb-4 opacity-30" size={48} />
        <p className="font-medium">لا توجد بيانات كافية لعرض الرسوم البيانية</p>
        <p className="text-sm mt-1">قم بإضافة طلاب ومدفوعات وسجلات حضور أولاً</p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Students by class */}
      {studentsByClass.length > 0 && (
        <Card className="p-5 lg:col-span-2">
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2"><GraduationCap size={16} className="text-primary" /> عدد الطلاب حسب الصف</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={studentsByClass} margin={{ right: 10, left: -10, top: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: "Cairo, sans-serif" }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any, n: string) => [v, n === "total" ? "الإجمالي" : n === "active" ? "نشط" : n]} />
              <Legend formatter={(v) => v === "total" ? "إجمالي الطلاب" : v === "active" ? "النشطون" : v} />
              <Bar dataKey="total" fill="#3b82f6" radius={[5, 5, 0, 0]} name="total" />
              <Bar dataKey="active" fill="#22c55e" radius={[5, 5, 0, 0]} name="active" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Monthly payments */}
      {monthlyPayments.length > 0 && (
        <Card className="p-5 lg:col-span-2">
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-green-600" /> الإيرادات الشهرية</h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={monthlyPayments} margin={{ right: 10, left: 10, top: 5 }}>
              <defs>
                <linearGradient id="grad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fontFamily: "Cairo, sans-serif" }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
              <Tooltip formatter={(v: any) => [formatCurrency(v), "المدفوعات"]} />
              <Area type="monotone" dataKey="amount" stroke="#22c55e" fill="url(#grad2)" strokeWidth={2.5} dot={{ fill: "#22c55e", r: 4 }} name="amount" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Attendance pie */}
      {attendancePieData.length > 0 && (
        <Card className="p-5">
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2"><ClipboardCheck size={16} className="text-amber-600" /> نسبة الحضور والغياب</h3>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width="55%" height={200}>
              <PieChart>
                <Pie data={attendancePieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {attendancePieData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v: any) => v + " سجل"} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              {attendancePieData.map((d: any) => (
                <div key={d.name} className="flex items-center gap-3">
                  <div className="h-3.5 w-3.5 rounded-sm shrink-0" style={{ background: d.color }} />
                  <span className="text-sm">{d.name}</span>
                  <span className="text-sm font-bold">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Collection rate pie */}
      {collectionData.length > 0 && (
        <Card className="p-5">
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2"><Wallet size={16} className="text-blue-600" /> نسبة التحصيل المالي</h3>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width="55%" height={200}>
              <PieChart>
                <Pie data={collectionData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {collectionData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v: any) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              {collectionData.map((d) => (
                <div key={d.name} className="flex items-center gap-3">
                  <div className="h-3.5 w-3.5 rounded-sm shrink-0" style={{ background: d.color }} />
                  <span className="text-sm">{d.name}</span>
                  <span className="text-sm font-bold">{formatCurrency(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Monthly bar (count) */}
      {monthlyPayments.length > 0 && (
        <Card className="p-5 lg:col-span-2">
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2"><CalendarDays size={16} className="text-violet-600" /> عدد دفعات الرسوم شهرياً</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={monthlyPayments} margin={{ right: 10, left: -10, top: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fontFamily: "Cairo, sans-serif" }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: any) => [v + " دفعة", "عدد الدفعات"]} />
              <Line type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2.5} dot={{ fill: "#8b5cf6", r: 4 }} name="count" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}

// ─── Shared Components ─────────────────────────────────────────────────────────
function SummaryCard({ label, value, icon: Icon, color, small }: { label: string; value: any; icon: any; color: string; small?: boolean }) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    red: "bg-red-100 text-red-600",
    amber: "bg-amber-100 text-amber-600",
    violet: "bg-violet-100 text-violet-600",
    gray: "bg-gray-100 text-gray-500",
  };
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground leading-tight">{label}</span>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${colorMap[color] ?? colorMap.blue}`}>
          <Icon size={15} />
        </div>
      </div>
      <div className={`font-bold ${small ? "text-lg" : "text-2xl"} text-foreground`}>{value}</div>
    </Card>
  );
}

function MiniStat({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold mt-0.5 ${color}`}>{value}</div>
    </Card>
  );
}

function ReportTable({ title, isLoading, total, page, setPage, onPrint, onExcel, children, searchSlot }: any) {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm">{title}</span>
          <Badge variant="secondary" className="text-xs">{total} سجل</Badge>
          {isLoading && <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
        </div>
        <div className="flex items-center gap-2">
          {searchSlot}
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onPrint}>
            <Printer size={13} /> طباعة PDF
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onExcel}>
            <FileSpreadsheet size={13} /> Excel
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">{children}</div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
          <span className="text-xs text-muted-foreground">صفحة {page} من {totalPages} ({total} سجل)</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage((p: number) => p - 1)}>
              <ChevronRight size={14} />
            </Button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4));
              const pageNum = start + i;
              return (
                <button key={pageNum} onClick={() => setPage(pageNum)}
                  className={`h-7 w-7 rounded-md text-xs font-medium transition-colors ${pageNum === page ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}>
                  {pageNum}
                </button>
              );
            })}
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage((p: number) => p + 1)}>
              <ChevronLeft size={14} />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Hooks ─────────────────────────────────────────────────────────────────────
function usePagination<T>(data: T[], page: number, pageSize: number): T[] {
  return useMemo(() => {
    const start = (page - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, page, pageSize]);
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
const PAYMENT_METHODS: Record<string, string> = {
  cash: "نقدي",
  transfer: "تحويل بنكي",
  wallet: "محفظة إلكترونية",
};
function PaymentsTableContent({ printRef }: { printRef?: React.MutableRefObject<{ handlePrint: () => void } | null> } = {}) {
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

  const handlePrint = () => {
    const rows = filtered.map((p, i) => [
      i + 1,
      (p.student_fees as any)?.students?.full_name ?? "—",
      (p.student_fees as any)?.academic_year ?? "—",
      `${Number(p.amount).toLocaleString()} ر.ي`,
      PAYMENT_METHODS[p.method] ?? p.method ?? "—",
      new Date(p.paid_at).toLocaleDateString("ar-EG"),
      p.created_by_name ?? "—",
    ]);
    printReport({
      title: "سجل المدفوعات",
      headers: ["#", "الطالب", "العام الدراسي", "المبلغ", "طريقة الدفع", "تاريخ الدفع", "بواسطة"],
      rows,
      recordCount: filtered.length,
      filters: [
        { label: "من", value: new Date(dateFrom).toLocaleDateString("ar-EG") },
        { label: "إلى", value: new Date(dateTo).toLocaleDateString("ar-EG") },
        ...(methodFilter !== "all" ? [{ label: "طريقة الدفع", value: PAYMENT_METHODS[methodFilter] ?? methodFilter }] : []),
      ],
      totals: [{ label: "إجمالي المحصّل", value: `${total.toLocaleString()} ر.ي` }],
    });
  };

  if (printRef) printRef.current = { handlePrint };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col gap-3">
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
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={filtered.length === 0} className="gap-2">
              <Printer size={15} />
              طباعة PDF ({filtered.length})
            </Button>
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
}//1545