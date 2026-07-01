import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Building2, Plus, Search, Pencil, Trash2, Phone, Mail,
  MapPin, Users, CheckCircle, XCircle, Filter, X,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";

export const Route = createFileRoute("/branches")({ component: Page });

interface Branch {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  manager_name: string | null;
  city: string | null;
  capacity: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

function Page() {
  const { user, loading, hasRole } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  if (!hasRole("admin")) {
    return (
      <AppShell>
        <Card className="p-12 text-center">
          <Building2 className="mx-auto mb-3 opacity-30" size={40} />
          <div className="text-lg font-semibold">غير مصرح</div>
          <p className="text-muted-foreground mt-2">هذه الشاشة مخصصة للمدير فقط</p>
        </Card>
      </AppShell>
    );
  }
  return (
    <AppShell>
      <BranchesView />
    </AppShell>
  );
}

function BranchesView() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Branch[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("branches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف الفرع بنجاح");
      qc.invalidateQueries({ queryKey: ["branches"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = useMemo(() => (data ?? []).filter(b => {
    if (statusFilter === "active" && !b.is_active) return false;
    if (statusFilter === "inactive" && b.is_active) return false;
    if (search) {
      const q = search.toLowerCase();
      return (b.name ?? "").toLowerCase().includes(q) ||
        (b.code ?? "").toLowerCase().includes(q) ||
        (b.city ?? "").toLowerCase().includes(q) ||
        (b.manager_name ?? "").toLowerCase().includes(q);
    }
    return true;
  }), [data, search, statusFilter]);

  const totalActive = useMemo(() => (data ?? []).filter(b => b.is_active).length, [data]);
  const totalInactive = useMemo(() => (data ?? []).filter(b => !b.is_active).length, [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="text-primary" size={24} /> الفروع
          </h1>
          <p className="text-muted-foreground mt-1">إدارة فروع المدرسة وبياناتها</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus size={16} /> فرع جديد
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">إجمالي الفروع</div>
          <div className="text-3xl font-bold mt-1">{(data ?? []).length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">نشطة</div>
          <div className="text-3xl font-bold mt-1 text-green-600">{totalActive}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">غير نشطة</div>
          <div className="text-3xl font-bold mt-1 text-muted-foreground">{totalInactive}</div>
        </Card>
      </div>

      {/* Filter bar */}
      <Card className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
            <Input className="pr-9" placeholder="ابحث بالاسم، الرمز، المدينة، المدير..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1.5">
            {["all", "active", "inactive"].map(f => (
              <button key={f} onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${statusFilter === f ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted text-muted-foreground"}`}>
                {f === "all" ? "الكل" : f === "active" ? "نشطة" : "غير نشطة"}
              </button>
            ))}
          </div>
          {(search || statusFilter !== "all") && (
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => { setSearch(""); setStatusFilter("all"); }}>
              <X size={11} /> مسح
            </Button>
          )}
        </div>
      </Card>

      {/* Cards grid (mobile) / Table (desktop) */}
      {isLoading ? (
        <Card className="p-12 text-center text-muted-foreground">جاري التحميل...</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-16 text-center text-muted-foreground">
          <Building2 className="mx-auto mb-4 opacity-30" size={48} />
          <p className="font-medium text-base">{(data ?? []).length === 0 ? "لا توجد فروع بعد" : "لا يوجد فروع مطابقة"}</p>
          {(data ?? []).length === 0 && (
            <Button className="mt-4 gap-2" onClick={() => setOpen(true)}>
              <Plus size={15} /> أضف أول فرع
            </Button>
          )}
        </Card>
      ) : (
        <>
          {/* Cards (mobile) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-4">
            {filtered.map(b => (
              <BranchCard key={b.id} branch={b}
                onEdit={() => setEditing(b)}
                onDelete={() => del.mutate(b.id)}
              />
            ))}
          </div>

          {/* Table (desktop) */}
          <Card className="hidden lg:block p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>اسم الفرع</TableHead>
                  <TableHead>الرمز</TableHead>
                  <TableHead>المدينة</TableHead>
                  <TableHead>المدير</TableHead>
                  <TableHead>الهاتف</TableHead>
                  <TableHead>الطاقة الاستيعابية</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="w-24">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((b, i) => (
                  <TableRow key={b.id}>
                    <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${b.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                          {b.name[0]}
                        </div>
                        <div>
                          <div className="font-medium">{b.name}</div>
                          {b.address && <div className="text-xs text-muted-foreground truncate max-w-40">{b.address}</div>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {b.code ? <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{b.code}</code> : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{b.city ?? "—"}</TableCell>
                    <TableCell className="text-sm">{b.manager_name ?? "—"}</TableCell>
                    <TableCell dir="ltr" className="text-xs text-muted-foreground">{b.phone ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {b.capacity ? (
                        <span className="flex items-center gap-1">
                          <Users size={12} className="text-muted-foreground" /> {b.capacity}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={b.is_active ? "bg-green-50 text-green-700 border-green-200" : "bg-muted text-muted-foreground"}>
                        {b.is_active ? "نشط" : "غير نشط"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(b)}>
                          <Pencil size={15} className="text-primary" />
                        </Button>
                        <ConfirmDelete
                          itemName={b.name}
                          description={<>سيتم حذف الفرع <strong>«{b.name}»</strong> نهائياً. هل تريد المتابعة؟</>}
                          onConfirm={() => del.mutateAsync(b.id)}
                          trigger={<Button variant="ghost" size="icon"><Trash2 size={15} className="text-destructive" /></Button>}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      {open && <BranchDialog onClose={() => setOpen(false)} />}
      {editing && <BranchDialog branch={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BranchCard({ branch: b, onEdit, onDelete }: { branch: Branch; onEdit: () => void; onDelete: () => void }) {
  return (
    <Card className={`p-4 space-y-3 ${!b.is_active ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 ${b.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
            {b.name[0]}
          </div>
          <div>
            <div className="font-semibold">{b.name}</div>
            {b.code && <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{b.code}</code>}
          </div>
        </div>
        <Badge variant="outline" className={b.is_active ? "bg-green-50 text-green-700 border-green-200" : "bg-muted text-muted-foreground"}>
          {b.is_active ? "نشط" : "متوقف"}
        </Badge>
      </div>

      <div className="space-y-1.5 text-xs text-muted-foreground">
        {b.city && <div className="flex items-center gap-1.5"><MapPin size={11} /> {b.city}{b.address ? ` - ${b.address}` : ""}</div>}
        {b.manager_name && <div className="flex items-center gap-1.5"><Users size={11} /> {b.manager_name}</div>}
        {b.phone && <div className="flex items-center gap-1.5" dir="ltr"><Phone size={11} /> {b.phone}</div>}
        {b.email && <div className="flex items-center gap-1.5" dir="ltr"><Mail size={11} /> {b.email}</div>}
        {b.capacity && <div className="flex items-center gap-1.5"><Users size={11} /> الطاقة: {b.capacity} طالب</div>}
      </div>

      <div className="flex gap-2 pt-1 border-t">
        <Button variant="outline" size="sm" className="flex-1 gap-1 h-8 text-xs" onClick={onEdit}>
          <Pencil size={12} /> تعديل
        </Button>
        <ConfirmDelete
          itemName={b.name}
          description={<>سيتم حذف الفرع <strong>«{b.name}»</strong> نهائياً. هل تريد المتابعة؟</>}
          onConfirm={async () => { onDelete(); }}
          trigger={
            <Button variant="outline" size="sm" className="flex-1 gap-1 h-8 text-xs text-destructive hover:text-destructive">
              <Trash2 size={12} /> حذف
            </Button>
          }
        />
      </div>
    </Card>
  );
}

function BranchDialog({ branch, onClose }: { branch?: Branch; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!branch;
  const [form, setForm] = useState({
    name: branch?.name ?? "",
    code: branch?.code ?? "",
    city: branch?.city ?? "",
    address: branch?.address ?? "",
    phone: branch?.phone ?? "",
    email: branch?.email ?? "",
    manager_name: branch?.manager_name ?? "",
    capacity: branch?.capacity ? String(branch.capacity) : "",
    notes: branch?.notes ?? "",
    is_active: branch?.is_active ?? true,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("اسم الفرع مطلوب");
      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || null,
        city: form.city.trim() || null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        manager_name: form.manager_name.trim() || null,
        capacity: form.capacity ? Number(form.capacity) : null,
        notes: form.notes.trim() || null,
        is_active: form.is_active,
      };
      if (isEdit && branch) {
        const { error } = await supabase.from("branches").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", branch.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("branches").insert(payload);
        if (error) {
          if (error.code === "23505") throw new Error("رمز الفرع مستخدم مسبقاً، اختر رمزاً آخر");
          throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "تم تحديث بيانات الفرع ✓" : "تم إنشاء الفرع بنجاح ✓");
      qc.invalidateQueries({ queryKey: ["branches"] });
      onClose();
    },
    onError: (e: any) => toast.error("فشل الحفظ: " + e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 size={18} className="text-primary" />
            {isEdit ? "تعديل بيانات الفرع" : "إضافة فرع جديد"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label>اسم الفرع *</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="مثال: فرع الرياض الرئيسي" />
          </div>

          <div className="space-y-1.5">
            <Label>رمز الفرع</Label>
            <Input dir="ltr" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="BR-01" />
            <p className="text-[11px] text-muted-foreground">رمز مختصر فريد لتعريف الفرع</p>
          </div>

          <div className="space-y-1.5">
            <Label>المدينة</Label>
            <Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="صنعاء، عدن، تعز..." />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>العنوان التفصيلي</Label>
            <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="الشارع، الحي، الحيّ..." />
          </div>

          <div className="space-y-1.5">
            <Label>رقم الهاتف</Label>
            <Input dir="ltr" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+967..." />
          </div>

          <div className="space-y-1.5">
            <Label>البريد الإلكتروني</Label>
            <Input dir="ltr" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="branch@school.edu" />
          </div>

          <div className="space-y-1.5">
            <Label>مدير الفرع</Label>
            <Input value={form.manager_name} onChange={e => setForm({ ...form, manager_name: e.target.value })} placeholder="اسم مدير الفرع" />
          </div>

          <div className="space-y-1.5">
            <Label>الطاقة الاستيعابية (طالب)</Label>
            <Input type="number" min="0" dir="ltr" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} placeholder="0" />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>ملاحظات</Label>
            <Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="ملاحظات إضافية عن الفرع..." />
          </div>

          <div className="md:col-span-2 flex items-center justify-between py-2 px-3 rounded-lg border bg-muted/30">
            <div>
              <Label htmlFor="branch-active">حالة الفرع</Label>
              <p className="text-xs text-muted-foreground mt-0.5">الفروع غير النشطة لا تظهر للمستخدمين</p>
            </div>
            <Switch
              id="branch-active"
              checked={form.is_active}
              onCheckedChange={v => setForm({ ...form, is_active: v })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending}>
            {save.isPending ? "جارٍ الحفظ..." : isEdit ? "حفظ التعديلات" : "إنشاء الفرع"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}