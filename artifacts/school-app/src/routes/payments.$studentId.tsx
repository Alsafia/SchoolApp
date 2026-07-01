import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Receipt, Wallet, CheckCircle2, AlertTriangle, Printer } from "lucide-react";
import { PayDialog } from "@/routes/payments";

export const Route = createFileRoute("/payments/$studentId")({ component: Page });

const METHOD_LABEL: Record<string, string> = {
  cash: "نقدي",
  transfer: "تحويل بنكي",
  cheque: "شيك",
  wallet: "محفظة إلكترونية",
  card: "شبكة",
};

function Page() {
  const { user, loading, hasRole } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  return (
    <AppShell>
      <StatementView canEdit={hasRole("admin")} />
    </AppShell>
  );
}

function StatementView({ canEdit }: { canEdit: boolean }) {
  const { studentId } = Route.useParams();
  const [payFee, setPayFee] = useState<any | null>(null);

  const { data: student } = useQuery({
    queryKey: ["student", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*, classes(name, section)")
        .eq("id", studentId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: fees } = useQuery({
    queryKey: ["student-statement", studentId, "fees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_fees")
        .select("*, students(id, full_name, student_number, stage, class_name, section)")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: payments } = useQuery({
    queryKey: ["student-statement", studentId, "payments"],
    queryFn: async () => {
      const feeIds = (fees ?? []).map((f: any) => f.id);
      if (feeIds.length === 0) return [];
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .in("student_fee_id", feeIds)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!fees,
  });

  const totalFees = (fees ?? []).reduce((a: number, f: any) => a + Number(f.total_amount || 0), 0);
  const totalPaid = (fees ?? []).reduce((a: number, f: any) => a + Number(f.paid_amount || 0), 0);
  const balance = totalFees - totalPaid;

  const firstUnpaid = (fees ?? []).find((f: any) => Number(f.paid_amount) < Number(f.total_amount));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/payments"><ArrowRight size={18} /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">كشف حساب الطالب</h1>
            <p className="text-muted-foreground mt-1">{student?.full_name ?? "..."}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer size={16} className="ml-2" /> طباعة
          </Button>
          {canEdit && firstUnpaid && (
            <Button onClick={() => setPayFee(firstUnpaid)}>
              <Receipt size={16} className="ml-2" /> تسجيل دفعة جديدة
            </Button>
          )}
        </div>
      </div>

      {/* بيانات الطالب */}
      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Info label="الاسم" value={student?.full_name} />
          <Info label="الرقم الدراسي" value={student?.student_number} />
          <Info label="المرحلة" value={student?.stage} />
          <Info label="الصف" value={student?.classes ? `${student.classes.name}${student.classes.section ? ` / ${student.classes.section}` : ""}` : student?.class_name} />
        </div>
      </Card>

      {/* الملخص المالي */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard icon={<Wallet size={20} />} label="إجمالي الرسوم" value={totalFees} tone="default" />
        <SummaryCard icon={<CheckCircle2 size={20} />} label="إجمالي المدفوع" value={totalPaid} tone="success" />
        <SummaryCard icon={<AlertTriangle size={20} />} label="الرصيد المتبقي" value={balance} tone={balance > 0 ? "danger" : "success"} />
      </div>

      {/* الرسوم المفروضة */}
      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b font-semibold">الرسوم المفروضة</div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>السنة الدراسية</TableHead>
                <TableHead>الإجمالي</TableHead>
                <TableHead>المدفوع</TableHead>
                <TableHead>المتبقي</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>ملاحظات</TableHead>
                {canEdit && <TableHead className="w-24">إجراءات</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(fees ?? []).length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">لا توجد رسوم</TableCell></TableRow>
              )}
              {(fees ?? []).map((f: any) => {
                const rem = Number(f.total_amount) - Number(f.paid_amount);
                const isPaid = rem <= 0;
                return (
                  <TableRow key={f.id}>
                    <TableCell>{f.academic_year}</TableCell>
                    <TableCell>{Number(f.total_amount).toLocaleString()}</TableCell>
                    <TableCell className="text-success">{Number(f.paid_amount).toLocaleString()}</TableCell>
                    <TableCell className={rem > 0 ? "text-destructive font-medium" : ""}>{rem.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={isPaid ? "bg-success/15 text-success border-success/30" : "bg-warning/15 text-warning border-warning/30"}>
                        {isPaid ? "مدفوع" : "متبقي"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{f.notes ?? "—"}</TableCell>
                    {canEdit && (
                      <TableCell>
                        {!isPaid && (
                          <Button size="sm" onClick={() => setPayFee(f)}>
                            <Receipt size={14} className="ml-1" /> سداد
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* سجل الدفعات وسندات القبض */}
      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b font-semibold">سجل الدفعات وسندات القبض</div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>التاريخ</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>طريقة الدفع</TableHead>
                <TableHead>سند القبض / المرجع</TableHead>
                <TableHead>المُسجِّل</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(payments ?? []).length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">لا توجد دفعات</TableCell></TableRow>
              )}
              {(payments ?? []).map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs">{new Date(p.paid_at).toLocaleDateString("ar-EG")}</TableCell>
                  <TableCell className="font-semibold text-success">{Number(p.amount).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{METHOD_LABEL[p.method] ?? p.method}</TableCell>
                  <TableCell className="text-xs whitespace-pre-line text-muted-foreground">{p.notes ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.created_by_name ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {payFee && <PayDialog fee={payFee} onClose={() => setPayFee(null)} />}
    </div>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="font-medium">{value ?? "—"}</div>
    </div>
  );
}

function SummaryCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "default" | "success" | "danger" }) {
  const tones = {
    default: "bg-muted text-foreground",
    success: "bg-success/10 text-success",
    danger: "bg-destructive/10 text-destructive",
  };
  return (
    <Card className="p-4">
      <div className={`inline-flex items-center justify-center h-10 w-10 rounded-lg mb-2 ${tones[tone]}`}>{icon}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value.toLocaleString()}</div>
    </Card>
  );
}
