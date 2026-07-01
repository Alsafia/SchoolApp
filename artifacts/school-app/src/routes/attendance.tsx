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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Check, X, Clock, Save, FileCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/attendance")({ component: Page });

type Status = "present" | "absent" | "late" | "excused";

function Page() {
  const { user, loading, hasRole } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  return (
    <AppShell>
      <AttendanceView canEdit={hasRole("admin", "teacher")} />
    </AppShell>
  );
}

function AttendanceView({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [stageId, setStageId] = useState("");
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(today);
  const [marks, setMarks] = useState<Record<string, Status>>({});

  const { data: stages } = useQuery({
    queryKey: ["stages"],
    queryFn: async () => {
      const { data } = await supabase.from("stages").select("id, name, stage_level").order("stage_level");
      return data ?? [];
    },
  });

  const { data: allClasses } = useQuery({
    queryKey: ["classes-list"],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, name, section, stage_id").order("grade_level");
      return data ?? [];
    },
  });

  const filteredClasses = useMemo(
    () => stageId ? (allClasses ?? []).filter((c: any) => c.stage_id === stageId) : (allClasses ?? []),
    [allClasses, stageId]
  );

  const { data: students } = useQuery({
    queryKey: ["students-by-class", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(`
          id,
          full_name,
          status,
          student_enrollments!inner(
            class_id,
            is_current
          )
        `)
        .eq("student_enrollments.class_id", classId)
        .eq("student_enrollments.is_current", true)
        .eq("status", "active")
        .order("full_name");

      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: existing } = useQuery({
    queryKey: ["attendance", classId, date],
    enabled: !!classId && !!date,
    queryFn: async () => {
      const { data } = await supabase.from("attendance")
        .select("student_id, status").eq("class_id", classId).eq("date", date);
      return data ?? [];
    },
  });

  useEffect(() => {
    const m: Record<string, Status> = {};
    (existing ?? []).forEach((r: any) => { m[r.student_id] = r.status; });
    setMarks(m);
  }, [existing]);

  const save = useMutation({
    mutationFn: async () => {
      const rows = (students ?? []).map((s: any) => ({
        student_id: s.id,
        class_id: classId,
        date,
        status: marks[s.id] ?? "present",
      }));
      const { error } = await supabase.from("attendance").upsert(rows, { onConflict: "student_id,date" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ سجل الحضور بنجاح ✓");
      qc.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (e: any) => toast.error("فشل الحفظ: " + e.message),
  });

  const counts = useMemo(() => {
    const list = students ?? [];
    const c = { present: 0, absent: 0, late: 0, excused: 0 };
    list.forEach((s: any) => {
      const v = marks[s.id] ?? "present";
      c[v]++;
    });
    return c;
  }, [students, marks]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">الحضور والغياب</h1>
        <p className="text-muted-foreground mt-1">تسجيل حضور الطلاب اليومي</p>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Stage filter */}
          <div className="space-y-1.5">
            <Label>المرحلة الدراسية</Label>
            <Select
              value={stageId}
              onValueChange={v => {
                setStageId(v === "__all" ? "" : v);
                setClassId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="كل المراحل" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">كل المراحل</SelectItem>
                {(stages ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Class filter */}
          <div className="space-y-1.5">
            <Label>الصف</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر الصف" />
              </SelectTrigger>
              <SelectContent>
                {filteredClasses.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{c.section ? ` / ${c.section}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label>التاريخ</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {/* Save button */}
          {canEdit && classId && (students?.length ?? 0) > 0 && (
            <div className="flex items-end">
              <Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="ml-2" size={16} />
                {save.isPending ? "جارٍ الحفظ..." : "حفظ السجل"}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {classId && (students?.length ?? 0) > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="حاضر"  value={counts.present}  color="success" />
            <StatCard label="غائب"  value={counts.absent}   color="destructive" />
            <StatCard label="متأخر" value={counts.late}     color="warning" />
            <StatCard label="مستأذن"  value={counts.excused}  color="primary" />
          </div>

          <Card className="divide-y">
            {(students ?? []).map((s: any, i: number) => {
              const status = marks[s.id] ?? "present";
              return (
                <div key={s.id} className="flex items-center justify-between p-3 hover:bg-muted/30">
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground text-sm w-6">{i + 1}</span>
                    <span className="font-medium">{s.full_name}</span>
                    <StatusBadge status={status} />
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <StatusBtn icon={Check}     label="حاضر"  active={status === "present"} onClick={() => setMarks({ ...marks, [s.id]: "present" })} className="text-success" />
                      <StatusBtn icon={X}         label="غائب"  active={status === "absent"}  onClick={() => setMarks({ ...marks, [s.id]: "absent" })}  className="text-destructive" />
                      <StatusBtn icon={Clock}     label="متأخر" active={status === "late"}    onClick={() => setMarks({ ...marks, [s.id]: "late" })}    className="text-warning" />
                      <StatusBtn icon={FileCheck} label="مستأذن"  active={status === "excused"} onClick={() => setMarks({ ...marks, [s.id]: "excused" })} className="text-primary" />
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        </>
      )}

      {classId && students?.length === 0 && (
        <Card className="p-12 text-center text-muted-foreground">
          <ClipboardCheck className="mx-auto mb-3 opacity-40" size={40} />
          لا يوجد طلاب في هذا الصف
        </Card>
      )}
    </div>
  );
}

function StatusBtn({ icon: Icon, label, active, onClick, className }: any) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`p-2 rounded-lg border transition ${active ? "bg-accent border-primary " + className : "hover:bg-muted border-transparent"}`}
    >
      <Icon size={16} className={active ? className : "text-muted-foreground"} />
    </button>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const map = {
    present: { label: "حاضر",  className: "bg-success/15 text-success border-success/30" },
    absent:  { label: "غائب",  className: "bg-destructive/15 text-destructive border-destructive/30" },
    late:    { label: "متأخر", className: "bg-warning/15 text-warning border-warning/30" },
    excused: { label: "مستأذن",  className: "bg-primary/15 text-primary border-primary/30" },
  } as const;
  const v = map[status];
  return <Badge variant="outline" className={v.className}>{v.label}</Badge>;
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 text-${color}`}>{value}</div>
    </Card>
  );
}