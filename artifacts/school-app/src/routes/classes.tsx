import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
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
import { Plus, Trash2, Pencil, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";

export const Route = createFileRoute("/classes")({ component: Page });
const SECTION_OPTIONS = ["A", "B", "C", "D", "E", "F", "G", "H"];

interface StageRow { id: string; name: string; }
interface ClassRow {
  id: string;
  name: string;
  section: string | null;
  grade_level: number | null;
  stage_id: string | null;
  stages: { name: string } | null;
  student_enrollments?: { count: number }[];
}

function Page() {
  const { user, loading, hasRole } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  return (
    <AppShell>
      <ClassesView canEdit={hasRole("admin")} />
    </AppShell>
  );
}

function ClassesView({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClassRow | null>(null);

  const { data: stages } = useQuery({
    queryKey: ["stages-list"],
    queryFn: async () => {
      const { data } = await supabase.from("stages").select("id, name, grade_level").order("grade_level");
      return (data ?? []) as StageRow[];
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, section, grade_level, stage_id")
        .order("grade_level",{ ascending: true});
      if (error) throw error;
      return data as ClassRow[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("classes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحذف بنجاح");
      qc.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">الصفوف والشعب</h1>
          <p className="text-muted-foreground mt-1">إدارة الصفوف الدراسية والشعب</p>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="ml-2" size={16} /> صف جديد</Button>
            </DialogTrigger>
            <ClassFormDialog stages={stages ?? []} onClose={() => setOpen(false)} />
          </Dialog>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">
          خطأ في تحميل البيانات: {(error as any).message}
        </div>
      )}

      <Card className="p-4">
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الصف</TableHead>
                <TableHead>الشعبة</TableHead>
                <TableHead>المرحلة الدراسية</TableHead>
                <TableHead>المستوى</TableHead>
                <TableHead>التسجيلات</TableHead>
                {canEdit && <TableHead className="w-24">إجراءات</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    جاري التحميل...
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && !error && (data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    <BookOpen className="mx-auto mb-2 opacity-40" size={32} />
                    لا توجد صفوف بعد
                  </TableCell>
                </TableRow>
              )}
              {(data ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.section ?? "—"}</TableCell>
                  <TableCell>
                    {c.stages?.name ? (
                      <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary text-xs">
                        {c.stages.name}
                      </Badge>
                    ) : "—"}
                  </TableCell>
                  <TableCell>{c.grade_level ?? "—"}</TableCell>
                  <TableCell>{c.student_enrollments?.[0]?.count ?? 0}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(c)} title="تعديل">
                          <Pencil size={16} className="text-primary" />
                        </Button>
                        <ConfirmDelete
                          itemName={`${c.name}${c.section ? ` / ${c.section}` : ""}`}
                          description={
                            <>سيتم حذف الصف <strong className="mx-1 text-foreground">«{c.name}{c.section ? ` / ${c.section}` : ""}»</strong> نهائياً. تأكد أنه لا يوجد طلاب مسجلون به.</>
                          }
                          onConfirm={() => del.mutateAsync(c.id)}
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
          <ClassFormDialog stages={stages ?? []} row={editing} onClose={() => setEditing(null)} />
        </Dialog>
      )}
    </div>
  );
}

function ClassFormDialog({
  stages, row, onClose,
}: {
  stages: StageRow[];
  row?: ClassRow;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!row;
  const [form, setForm] = useState({
    name: row?.name ?? "",
    section: row?.section ?? "",
    grade_level: row?.grade_level != null ? String(row.grade_level) : "",
    stage_id: row?.stage_id ?? "",
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("اسم الصف مطلوب");
      const payload = {
        name: form.name.trim(),
        section: form.section || null,
        grade_level: form.grade_level ? Number(form.grade_level) : null,
        stage_id: form.stage_id || null,
      };
      if (isEdit && row) {
        const { error } = await supabase.from("classes").update(payload).eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("classes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "تم تحديث الصف ✓" : "تم إضافة الصف ✓");
      qc.invalidateQueries({ queryKey: ["classes"] });
      qc.invalidateQueries({ queryKey: ["classes-list"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{isEdit ? "تعديل بيانات الصف" : "إضافة صف جديد"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>اسم الصف <span className="text-destructive">*</span></Label>
          <Input
            placeholder="مثال: الصف الأول الابتدائي"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label>المرحلة الدراسية</Label>
          <Select value={form.stage_id} onValueChange={(v) => setForm({ ...form, stage_id: v })}>
            <SelectTrigger><SelectValue placeholder="اختر المرحلة" /></SelectTrigger>
            <SelectContent>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>الشعبة</Label>
            <Select value={form.section} onValueChange={(v) => setForm({ ...form, section: v })}>
              <SelectTrigger><SelectValue placeholder="اختر الشعبة" /></SelectTrigger>
              <SelectContent>
                {SECTION_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>المستوى (رقم)</Label>
            <Input
              type="number"
              min={1}
              placeholder="1"
              value={form.grade_level}
              onChange={(e) => setForm({ ...form, grade_level: e.target.value })}
            />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>إلغاء</Button>
        <Button onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending}>
          {save.isPending ? "جارٍ الحفظ..." : isEdit ? "حفظ التعديلات" : "حفظ"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}