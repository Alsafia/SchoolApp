import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Trash2, Phone, Pencil, BookOpen, Filter, X, Printer } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";

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

export const Route = createFileRoute("/teachers")({ component: Page });

interface Teacher {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  specialization: string | null;
  qualification: string | null;
  hire_date: string | null;
  status: "active" | "inactive";
  created_at: string;
}

function Page() {
  const { user, loading, hasRole } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  return (
    <AppShell>
      <TeachersView canEdit={hasRole("admin")} />
    </AppShell>
  );
}

function TeachersView({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [qualFilter, setQualFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["teachers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teachers")
        .select("*")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return data as Teacher[];
    },
  });

  const { data: subjects } = useQuery({
    queryKey: ["subjects-list"],
    queryFn: async () => {
      const { data } = await supabase.from("subjects").select("id, name").order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const qualifications = useMemo(
    () => Array.from(new Set((data ?? []).map(t => t.qualification).filter(Boolean))) as string[],
    [data]
  );

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("teachers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف المعلم بنجاح");
      qc.invalidateQueries({ queryKey: ["teachers"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = useMemo(() => (data ?? []).filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (qualFilter !== "all" && (t.qualification ?? "") !== qualFilter) return false;
    if (subjectFilter !== "all") {
      const spec = (t.specialization ?? "").toLowerCase();
      const subjectName = (subjects ?? []).find(s => s.id === subjectFilter)?.name ?? "";
      if (!spec.includes(subjectName.toLowerCase()) && spec !== subjectName.toLowerCase()) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (!t.full_name.toLowerCase().includes(q) && !(t.specialization ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [data, subjectFilter, qualFilter, statusFilter, search, subjects]);

  const activeFilters = [subjectFilter !== "all", qualFilter !== "all", statusFilter !== "all", !!search].filter(Boolean).length;

  const clearFilters = () => {
    setSubjectFilter("all");
    setQualFilter("all");
    setStatusFilter("all");
    setSearch("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">المعلمون</h1>
          <p className="text-muted-foreground mt-1">إدارة بيانات المعلمين والمؤهلات</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            const headers = ["الاسم", "التخصص / المادة", "المؤهل", "الهاتف", "تاريخ التعيين", "الحالة"];
            const rows = filtered.map(t => [
              t.full_name,
              t.specialization ?? "",
              t.qualification ?? "",
              t.phone ?? "",
              t.hire_date ?? "",
              t.status === "active" ? "نشط" : "غير نشط",
            ]);
            printRtl("قائمة المعلمين", headers, rows);
          }}>
            <Printer className="ml-2" size={16} /> طباعة
          </Button>
          {canEdit && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="ml-2" size={16} /> معلم جديد</Button>
              </DialogTrigger>
              <TeacherFormDialog onClose={() => setOpen(false)} />
            </Dialog>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={16} className="text-primary" />
          <span className="text-sm font-semibold">تصفية المعلمين</span>
          {activeFilters > 0 && (
            <Badge variant="secondary" className="text-xs">{activeFilters} فلاتر نشطة</Badge>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        
     <div className="space-y-1.5">
    <Label className="text-xs flex items-center gap-1"><BookOpen size={11} /> المادة الدراسية</Label>
            <Select value={subjectFilter} onValueChange={setSubjectFilter}>
              <SelectTrigger><SelectValue placeholder="كل المواد" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المواد</SelectItem>
                {(subjects ?? []).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3">

            <div className="space-y-1.5 flex-1">
              <Label className="text-xs">المؤهل العلمي</Label>
              <Select value={qualFilter} onValueChange={setQualFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="كل المؤهلات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المؤهلات</SelectItem>
                  {qualifications.map(q => (
                    <SelectItem key={q} value={q}>{q}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 flex-1">
              <Label className="text-xs">الحالة الوظيفية</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="inactive">غير نشط</SelectItem>
                </SelectContent>
              </Select>
            </div>

          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">بحث بالاسم</Label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
              <Input className="pr-9" placeholder="ابحث عن معلم..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </div>

        {activeFilters > 0 && (
          <div className="mt-3 flex items-center justify-between">
            <Badge variant="outline" className="text-xs">{filtered.length} معلم</Badge>
            <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={clearFilters}>
              <X size={11} /> مسح الفلاتر
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>التخصص / المادة</TableHead>
                <TableHead>المؤهل</TableHead>
                <TableHead>الهاتف</TableHead>
                <TableHead>تاريخ التعيين</TableHead>
                <TableHead>الحالة</TableHead>
                {canEdit && <TableHead className="w-24">إجراءات</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell></TableRow>}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    <BookOpen className="mx-auto mb-2 opacity-30" size={28} />
                    لا يوجد معلمون بهذه المعايير
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.full_name}</TableCell>
                  <TableCell>
                    {t.specialization ? (
                      <Badge variant="outline" className="text-xs bg-primary/5 border-primary/20 text-primary">
                        {t.specialization}
                      </Badge>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {t.qualification ? (
                      <span className="text-sm text-muted-foreground">{t.qualification}</span>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {t.phone ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground" dir="ltr">
                        <Phone size={12} /> {t.phone}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.hire_date ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={t.status === "active" ? "bg-success/15 text-success border-success/30" : "bg-muted text-muted-foreground"}>
                      {t.status === "active" ? "نشط" : "غير نشط"}
                    </Badge>
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(t)} title="تعديل">
                          <Pencil size={16} className="text-primary" />
                        </Button>
                        <ConfirmDelete
                          itemName={t.full_name}
                          description={<>سيتم حذف المعلم <strong className="mx-1 text-foreground">«{t.full_name}»</strong> نهائياً مع جميع بياناته المرتبطة (المواد، الجداول). هل تريد المتابعة؟</>}
                          onConfirm={() => del.mutateAsync(t.id)}
                          trigger={
                            <Button variant="ghost" size="icon" title="حذف">
                              <Trash2 size={16} className="text-destructive" />
                            </Button>
                          }
                        />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <TeacherFormDialog teacher={editing} onClose={() => setEditing(null)} />
        </Dialog>
      )}
    </div>
  );
}

function TeacherFormDialog({ teacher, onClose }: { teacher?: Teacher; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!teacher;
  const [form, setForm] = useState({
    full_name: teacher?.full_name ?? "",
    phone: teacher?.phone ?? "",
    specialization: teacher?.specialization ?? "",
    qualification: teacher?.qualification ?? "",
    hire_date: teacher?.hire_date ?? "",
    status: (teacher?.status ?? "active") as "active" | "inactive",
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        full_name: form.full_name,
        phone: form.phone || null,
        specialization: form.specialization || null,
        qualification: form.qualification || null,
        hire_date: form.hire_date || null,
        status: form.status,
      };
      if (isEdit && teacher) {
        const { error } = await supabase.from("teachers").update(payload).eq("id", teacher.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("teachers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "تم تحديث بيانات المعلم ✓" : "تم إضافة المعلم بنجاح ✓");
      qc.invalidateQueries({ queryKey: ["teachers"] });
      qc.invalidateQueries({ queryKey: ["count", "teachers"] });
      onClose();
    },
    onError: (e: any) => toast.error("فشل الحفظ: " + e.message),
  });

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{isEdit ? "تعديل بيانات المعلم" : "إضافة معلم جديد"}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label>الاسم الكامل *</Label>
          <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>رقم الهاتف</Label>
          <Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>التخصص / المادة</Label>
          <Input placeholder="رياضيات، علوم، لغة عربية..." value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>المؤهل العلمي</Label>
          <Input placeholder="بكالوريوس، ماجستير، دكتوراه..." value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>تاريخ التعيين</Label>
          <Input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label>الحالة</Label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">نشط</SelectItem>
              <SelectItem value="inactive">غير نشط</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>إلغاء</Button>
        <Button onClick={() => save.mutate()} disabled={!form.full_name || save.isPending}>
          {save.isPending ? "جارٍ الحفظ..." : isEdit ? "حفظ التعديلات" : "حفظ"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
