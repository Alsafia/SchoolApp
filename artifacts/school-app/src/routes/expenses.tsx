import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Wallet, Plus, Pencil, Trash2, Search, Filter, X, FileSpreadsheet,
  Printer, TrendingDown, CalendarDays, Tag, AlertCircle, Save, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { printReport } from "@/lib/report-print";
import { exportExcel } from "@/lib/report-excel";

export const Route = createFileRoute("/expenses")({ component: Page });

// ─── Types ────────────────────────────────────────────────────────────────────
interface Expense {
  id: string;
  title: string;
  amount: number;
  category: string;
  date: string;
  description: string | null;
  paid_by: string | null;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES: Record<string, string> = {
  salaries:      "رواتب",
  maintenance:   "صيانة",
  utilities:     "فواتير (كهرباء/ماء)",
  stationery:    "قرطاسية ومستلزمات",
  transportation:"نقل ومواصلات",
  cleaning:      "نظافة",
  food:          "مأكولات ومشروبات",
  furniture:     "أثاث ومعدات",
  other:         "أخرى",
};

const CAT_COLORS: Record<string, string> = {
  salaries:      "bg-blue-100 text-blue-700 border-blue-200",
  maintenance:   "bg-orange-100 text-orange-700 border-orange-200",
  utilities:     "bg-yellow-100 text-yellow-700 border-yellow-200",
  stationery:    "bg-purple-100 text-purple-700 border-purple-200",
  transportation:"bg-cyan-100 text-cyan-700 border-cyan-200",
  cleaning:      "bg-teal-100 text-teal-700 border-teal-200",
  food:          "bg-green-100 text-green-700 border-green-200",
  furniture:     "bg-rose-100 text-rose-700 border-rose-200",
  other:         "bg-gray-100 text-gray-700 border-gray-200",
};

const formatCurrency = (n: number) =>
  `${n.toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ر.ي`;

const fmtDate = (s: string) => new Date(s).toLocaleDateString("ar-EG");

const today = new Date().toISOString().slice(0, 10);
const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

const EMPTY_FORM = {
  title: "",
  amount: "",
  category: "other",
  date: today,
  description: "",
  paid_by: "",
};

// ─── Route + Page ─────────────────────────────────────────────────────────────
function Page() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  return <AppShell><ExpensesView /></AppShell>;
}

// ─── Main View ────────────────────────────────────────────────────────────────
function ExpensesView() {
  const qc = useQueryClient();

  const [search, setSearch]             = useState("");
  const [catFilter, setCatFilter]       = useState("all");
  const [dateFrom, setDateFrom]         = useState(firstOfMonth);
  const [dateTo, setDateTo]             = useState(today);
  const [showFilters, setShowFilters]   = useState(false);

  const [dialogOpen, setDialogOpen]     = useState(false);
  const [editItem, setEditItem]         = useState<Expense | null>(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [deleting, setDeleting]         = useState<string | null>(null);

  const setField = (k: keyof typeof EMPTY_FORM, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const openAdd = () => {
    setEditItem(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (e: Expense) => {
    setEditItem(e);
    setForm({
      title: e.title,
      amount: String(e.amount),
      category: e.category,
      date: e.date,
      description: e.description ?? "",
      paid_by: e.paid_by ?? "",
    });
    setDialogOpen(true);
  };

  // ── Quick date presets ──
  const setQuickDate = (range: "today" | "week" | "month" | "all") => {
    if (range === "all") { setDateFrom("2020-01-01"); setDateTo(today); }
    else if (range === "today") { setDateFrom(today); setDateTo(today); }
    else if (range === "week") {
      const now = new Date();
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const mon = new Date(new Date().setDate(diff)).toISOString().slice(0, 10);
      setDateFrom(mon); setDateTo(today);
    } else { setDateFrom(firstOfMonth); setDateTo(today); }
  };

  // ── Data ──
  const { data: rawExpenses = [], isLoading } = useQuery({
    queryKey: ["expenses", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
  });

  const expenses = useMemo(() => {
    return rawExpenses.filter((e) => {
      if (catFilter !== "all" && e.category !== catFilter) return false;
      if (search && !e.title.toLowerCase().includes(search.toLowerCase()) &&
        !(e.description ?? "").toLowerCase().includes(search.toLowerCase()) &&
        !(e.paid_by ?? "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rawExpenses, catFilter, search]);

  const totalAmount = useMemo(() => expenses.reduce((a, e) => a + Number(e.amount), 0), [expenses]);

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of expenses) {
      map[e.category] = (map[e.category] ?? 0) + Number(e.amount);
    }
    return Object.entries(map)
      .map(([k, v]) => ({ key: k, label: CATEGORIES[k] ?? k, amount: v }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  // ── Save (Add / Edit) ──
  const save = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("أدخل اسم المصروف");
      const amount = parseFloat(form.amount);
      if (!form.amount || isNaN(amount) || amount <= 0) throw new Error("أدخل مبلغاً صحيحاً");
      if (!form.date) throw new Error("أدخل التاريخ");

      const payload = {
        title: form.title.trim(),
        amount,
        category: form.category,
        date: form.date,
        description: form.description.trim() || null,
        paid_by: form.paid_by.trim() || null,
      };

      if (editItem) {
        const { error } = await supabase.from("expenses").update(payload).eq("id", editItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("expenses").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editItem ? "تم تحديث المصروف" : "تمت إضافة المصروف");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setDialogOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteExpense = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف المصروف");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setDeleting(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Export ──
  const handlePrint = async () => {
    await printReport({
      title: "تقرير المصروفات",
      headers: ["#", "البند", "التصنيف", "المبلغ", "التاريخ", "المدفوع بواسطة", "الملاحظات"],
      rows: expenses.map((e, i) => [
        i + 1, e.title, CATEGORIES[e.category] ?? e.category,
        formatCurrency(Number(e.amount)), fmtDate(e.date),
        e.paid_by ?? "—", e.description ?? "—",
      ]),
      totals: [{ label: "إجمالي المصروفات", value: formatCurrency(totalAmount) }],
      recordCount: expenses.length,
    });
  };

  const handleExcel = () => {
    exportExcel({
      title: "تقرير المصروفات",
      headers: ["#", "البند", "التصنيف", "المبلغ", "التاريخ", "المدفوع بواسطة", "الملاحظات"],
      rows: expenses.map((e, i) => [
        i + 1, e.title, CATEGORIES[e.category] ?? e.category,
        Number(e.amount), e.date, e.paid_by ?? "—", e.description ?? "—",
      ]),
      totals: [{ label: "إجمالي المصروفات", value: totalAmount }],
    });
    toast.success("تم تصدير ملف Excel بنجاح");
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingDown className="text-red-500" size={24} /> المصروفات
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">إدارة وتتبع مصروفات المدرسة</p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus size={16} /> إضافة مصروف
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 col-span-2">
          <div className="text-xs text-muted-foreground">إجمالي المصروفات في الفترة</div>
          <div className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(totalAmount)}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{expenses.length} بند</div>
        </Card>
        {byCategory.slice(0, 2).map((c) => (
          <Card key={c.key} className="p-4">
            <div className="text-xs text-muted-foreground truncate">{c.label}</div>
            <div className="text-lg font-bold text-foreground mt-1">{formatCurrency(c.amount)}</div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground font-medium">تصفية سريعة:</span>
              {[
                { key: "today" as const, label: "اليوم" },
                { key: "week"  as const, label: "هذا الأسبوع" },
                { key: "month" as const, label: "هذا الشهر" },
                { key: "all"   as const, label: "الكل" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setQuickDate(key)}
                  className="px-3 py-1 rounded-full text-xs font-medium border border-border text-muted-foreground hover:bg-muted transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowFilters((v) => !v)}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Filter size={12} /> فلاتر إضافية {showFilters ? "▲" : "▼"}
            </button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1 border-t">
              <div className="space-y-1.5">
                <Label className="text-xs">من تاريخ</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">إلى تاريخ</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">التصنيف</Label>
                <Select value={catFilter} onValueChange={setCatFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل التصنيفات</SelectItem>
                    {Object.entries(CATEGORIES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">بحث</Label>
                <div className="relative">
                  <Search className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" size={12} />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="ابحث..."
                    className="h-8 text-xs pr-7"
                  />
                  {search && (
                    <button onClick={() => setSearch("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X size={11} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Category breakdown chips */}
      {byCategory.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {byCategory.map((c) => (
            <button
              key={c.key}
              onClick={() => setCatFilter(catFilter === c.key ? "all" : c.key)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                catFilter === c.key ? CAT_COLORS[c.key] ?? "bg-muted" : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              <Tag size={10} /> {c.label}: {formatCurrency(c.amount)}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">قائمة المصروفات</span>
            <Badge variant="secondary" className="text-xs">{expenses.length} سجل</Badge>
            {isLoading && <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handlePrint}>
              <Printer size={13} /> طباعة
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleExcel}>
              <FileSpreadsheet size={13} /> Excel
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>البند</TableHead>
                <TableHead>التصنيف</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>التاريخ</TableHead>
                <TableHead>المدفوع بواسطة</TableHead>
                <TableHead>الملاحظات</TableHead>
                <TableHead className="w-20">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
              ) : expenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-14 text-muted-foreground">
                    <TrendingDown className="mx-auto mb-3 opacity-30" size={40} />
                    <p className="font-medium">لا توجد مصروفات</p>
                    <p className="text-sm mt-1">ابدأ بإضافة مصروف جديد</p>
                  </TableCell>
                </TableRow>
              ) : (
                expenses.map((e, i) => (
                  <TableRow key={e.id} className="hover:bg-muted/30">
                    <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                    <TableCell className="font-medium">{e.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${CAT_COLORS[e.category] ?? ""}`}>
                        {CATEGORIES[e.category] ?? e.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold text-red-600">{formatCurrency(Number(e.amount))}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(e.date)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.paid_by ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{e.description ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(e)}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="تعديل"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setDeleting(e.id)}
                          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="حذف"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
              {expenses.length > 0 && (
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell colSpan={3} className="text-sm">الإجمالي</TableCell>
                  <TableCell className="text-red-600 font-bold">{formatCurrency(totalAmount)}</TableCell>
                  <TableCell colSpan={4} />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet size={18} /> {editItem ? "تعديل المصروف" : "إضافة مصروف جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>اسم المصروف / البند <span className="text-destructive">*</span></Label>
              <Input
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
                placeholder="مثال: فاتورة الكهرباء"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>المبلغ (ر.ي) <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setField("amount", e.target.value)}
                  placeholder="0"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label>التاريخ <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setField("date", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>التصنيف</Label>
              <Select value={form.category} onValueChange={(v) => setField("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORIES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>المدفوع بواسطة</Label>
              <Input
                value={form.paid_by}
                onChange={(e) => setField("paid_by", e.target.value)}
                placeholder="اسم الشخص أو الجهة"
              />
            </div>
            <div className="space-y-1.5">
              <Label>ملاحظات</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                placeholder="تفاصيل إضافية..."
                rows={3}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
              {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {editItem ? "حفظ التعديلات" : "إضافة المصروف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle size={18} /> تأكيد الحذف
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل أنت متأكد من حذف هذا المصروف؟ لا يمكن التراجع عن هذا الإجراء.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={() => deleting && deleteExpense.mutate(deleting)}
              disabled={deleteExpense.isPending}
              className="gap-2"
            >
              {deleteExpense.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              حذف المصروف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
