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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, BookOpen, Pencil, Printer, GraduationCap, School } from "lucide-react";
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
  <div class="meta">تاريخ الطباعة: ${new Date().toLocaleDateString('ar-YE')} &nbsp;|&nbsp; الإجمالي: ${rows.length} مادة</div>
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

export const Route = createFileRoute("/subjects")({ component: Page });

interface Stage { id: string; name: string; stage_level: number }
interface ClassRow { id: string; name: string; section: string | null; grade_level: number | null; stage_id: string | null }
interface Subject {
  id: string;
  name: string;
  code: string | null;
  credit_hours: number | null;
  teacher_id: string | null;
  class_id: string | null;
  teachers?: { full_name: string } | null;
}

function Page() {
  const { user, loading, hasRole } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  return (
    <AppShell>
      <SubjectsView canEdit={hasRole("admin")} />
    </AppShell>
  );
}

function SubjectsView({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [stageId, setStageId] = useState("");
  const [classId, setClassId] = useState("");
  const [openAdd, setOpenAdd] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);

  const { data: stages = [] } = useQuery<Stage[]>({
    queryKey: ["stages-list"],
    queryFn: async () => {
      const { data } = await supabase.from("stages").select("id, name, stage_level").order("stage_level");
      return (data ?? []) as Stage[];
    },
  });

  const { data: allClasses = [] } = useQuery<ClassRow[]>({
    queryKey: ["classes-list"],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, name, section, grade_level, stage_id").order("grade_level");
      return (data ?? []) as ClassRow[];
    },
  });

  const filteredClasses = useMemo(
    () => stageId ? allClasses.filter(c => c.stage_id === stageId) : allClasses,
    [allClasses, stageId]
  );

  const { data: teachers = [] } = useQuery({
    queryKey: ["teachers-list"],
    queryFn: async () => {
      const { data } = await supabase.from("teachers").select("id, full_name").eq("status", "active");
      return (data ?? []) as { id: string; full_name: string }[];
    },
  });

  const { data: subjects = [], isLoading } = useQuery<Subject[]>({
    queryKey: ["subjects", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("*, teachers(full_name)")
        .eq("class_id", classId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Subject[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subjects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحذف بنجاح");
      qc.invalidateQueries({ queryKey: ["subjects", classId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const selectedClass = allClasses.find(c => c.id === classId);
  const selectedStage = stages.find(s => s.id === stageId);
  const ready = !!classId;

  const printLabel = selectedClass
    ? `مواد ${selectedClass.name}${selectedClass.section ? ` / ${selectedClass.section}` : ""}${selectedStage ? ` — ${selectedStage.name}` : ""}`
    : "المواد الدراسية";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">المواد الدراسية</h1>
          <p className="text-muted-foreground mt-1">إدارة مواد كل صف دراسي</p>
        </div>
        <div className="flex gap-2">
          {ready && (
            <Button variant="outline" onClick={() => {
              const headers = ["المادة", "الرمز", "الساعات", "المعلم المسؤول"];
              const rows = subjects.map(s => [
                s.name,
                s.code ?? "",
                s.credit_hours != null ? String(s.credit_hours) : "",
                s.teachers?.full_name ?? "",
              ]);
              printRtl(printLabel, headers, rows);
            }}>
              <Printer className="ml-2" size={16} /> طباعة
            </Button>
          )}
          {canEdit && ready && (
            <Button onClick={() => setOpenAdd(true)}>
              <Plus className="ml-2" size={16} /> مادة جديدة
            </Button>
          )}
        </div>
      </div>

      {/* Stage & Class filters */}
      <Card className="p-4">
        <div className="flex gap-4">
          <div className="space-y-1.5">
       <div className="w-40 space-y-1.5">

            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <GraduationCap size={15} className="text-primary" /> المرحلة الدراسية
            </Label>
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
          </div></div>

          <div className="space-y-1.5">
       <div className="w-44 space-y-1.5">

            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <School size={15} className="text-primary" /> الصف الدراسي
            </Label>
            <Select
              value={classId}
              onValueChange={setClassId}
              disabled={filteredClasses.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={stageId ? "اختر الصف..." : "اختر المرحلة أولاً"} />
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
        </div></div>

        {/* Selected context badge */}
        {selectedClass && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {selectedStage && (
              <Badge variant="outline" className="bg-blue-50 border-blue-200 text-blue-700 text-xs">
                <GraduationCap size={11} className="ml-1" /> {selectedStage.name}
              </Badge>
            )}
            <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary text-xs">
              <School size={11} className="ml-1" />
              {selectedClass.name}{selectedClass.section ? ` / ${selectedClass.section}` : ""}
            </Badge>
            <span className="text-xs text-muted-foreground">
              — {subjects.length} مادة
            </span>
          </div>
        )}
      </Card>

      {/* Empty state when no class selected */}
      {!ready && (
        <Card className="p-12 text-center text-muted-foreground">
          <BookOpen className="mx-auto mb-3 opacity-30" size={40} />
          <p className="font-medium">اختر المرحلة والصف لعرض المواد</p>
          <p className="text-sm mt-1">يتم عرض مواد كل صف بشكل منفصل لسهولة الإدارة</p>
        </Card>
      )}

      {/* Subjects table */}
      {ready && (
        <Card className="p-4">
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المادة</TableHead>
                  <TableHead>الرمز</TableHead>
                  <TableHead>الساعات</TableHead>
                  <TableHead>المعلم</TableHead>
                  {canEdit && <TableHead className="w-24">إجراءات</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell>
                  </TableRow>
                )}
                {!isLoading && subjects.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      <BookOpen className="mx-auto mb-2 opacity-40" size={32} />
                      <p>لا توجد مواد لهذا الصف بعد</p>
                      {canEdit && (
                        <Button className="mt-3" size="sm" onClick={() => setOpenAdd(true)}>
                          <Plus size={14} className="ml-1" /> أضف مادة الآن
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )}
                {subjects.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell dir="ltr" className="text-right">{s.code ?? "—"}</TableCell>
                    <TableCell>{s.credit_hours ?? "—"}</TableCell>
                    <TableCell>{s.teachers?.full_name ?? "—"}</TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setEditing(s)} title="تعديل">
                            <Pencil size={16} className="text-primary" />
                          </Button>
                          <ConfirmDelete
                            itemName={s.name}
                            description={<>سيتم حذف المادة <strong className="mx-1 text-foreground">«{s.name}»</strong> نهائياً. هل تريد المتابعة؟</>}
                            onConfirm={() => del.mutateAsync(s.id)}
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
      )}

      {/* Add dialog */}
      {openAdd && (
        <Dialog open onOpenChange={(o) => !o && setOpenAdd(false)}>
          <SubjectFormDialog
            teachers={teachers}
            classId={classId}
            onClose={() => setOpenAdd(false)}
            onSaved={() => qc.invalidateQueries({ queryKey: ["subjects", classId] })}
          />
        </Dialog>
      )}

      {/* Edit dialog */}
      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <SubjectFormDialog
            teachers={teachers}
            classId={classId}
            subject={editing}
            onClose={() => setEditing(null)}
            onSaved={() => qc.invalidateQueries({ queryKey: ["subjects", classId] })}
          />
        </Dialog>
      )}
    </div>
  );
}

interface FormDialogProps {
  teachers: { id: string; full_name: string }[];
  classId: string;
  subject?: Subject;
  onClose: () => void;
  onSaved: () => void;
}

function SubjectFormDialog({ teachers, classId, subject, onClose, onSaved }: FormDialogProps) {
  const isEdit = !!subject;
  const [form, setForm] = useState({
    name: subject?.name ?? "",
    code: subject?.code ?? "",
    credit_hours: subject?.credit_hours != null ? String(subject.credit_hours) : "",
    teacher_id: subject?.teacher_id ?? "",
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("اسم المادة مطلوب");
      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || null,
        credit_hours: form.credit_hours ? Number(form.credit_hours) : null,
        teacher_id: form.teacher_id || null,
        class_id: classId,
      };
      if (isEdit && subject) {
        const { error } = await supabase.from("subjects").update(payload).eq("id", subject.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("subjects").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "تم تحديث المادة ✓" : "تم إضافة المادة ✓");
      onSaved();
      onClose();
    },
    onError: (e: any) => toast.error("فشل الحفظ: " + e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{isEdit ? "تعديل بيانات المادة" : "إضافة مادة جديدة"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>اسم المادة *</Label>
          <Input
            placeholder="الرياضيات"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>الرمز</Label>
            <Input
              dir="ltr"
              placeholder="MATH101"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>عدد الساعات</Label>
            <Input
              type="number"
              min={1}
              value={form.credit_hours}
              onChange={(e) => setForm({ ...form, credit_hours: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>المعلم المسؤول</Label>
          <Select
            value={form.teacher_id}
            onValueChange={(v) => setForm({ ...form, teacher_id: v })}
          >
            <SelectTrigger><SelectValue placeholder="اختر معلماً (اختياري)" /></SelectTrigger>
            <SelectContent>
              {teachers.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>إلغاء</Button>
        <Button
          onClick={() => save.mutate()}
          disabled={!form.name.trim() || save.isPending}
        >
          {save.isPending ? "جارٍ الحفظ..." : isEdit ? "حفظ التعديلات" : "حفظ"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}