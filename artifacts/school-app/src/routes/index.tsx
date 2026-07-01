import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GraduationCap, Users, School, ClipboardCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { user, loading } = useAuth();
  if (loading) return <FullLoader />;
  if (!user) return <Navigate to="/auth" />;

  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}

function FullLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="h-10 w-10 mx-auto rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <p className="mt-4 text-muted-foreground text-sm">جاري التحميل...</p>
      </div>
    </div>
  );
}

function useCount(table: string) {
  return useQuery({
    queryKey: ["count", table],
    queryFn: async () => {
      const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
      if (error) return 0;
      return count ?? 0;
    },
  });
}

function Dashboard() {
  const students = useCount("students");
  const teachers = useCount("teachers");
  const classes = useCount("classes");

  const stats = [
    { label: "إجمالي الطلاب", value: students.data ?? "—", icon: GraduationCap, color: "bg-blue-500" },
    { label: "إجمالي المعلمين", value: teachers.data ?? "—", icon: Users, color: "bg-emerald-500" },
    { label: "الصفوف الدراسية", value: classes.data ?? "—", icon: School, color: "bg-violet-500" },
    { label: "نسبة الحضور اليوم", value: "—", icon: ClipboardCheck, color: "bg-amber-500" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">لوحة التحكم</h1>
        <p className="text-muted-foreground mt-1">نظرة عامة على أحوال المدرسة</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">{s.label}</div>
                  <div className="text-3xl font-bold mt-2">{s.value}</div>
                </div>
                <div className={`${s.color} h-12 w-12 rounded-xl flex items-center justify-center text-white`}>
                  <s.icon size={22} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">آخر النشاطات</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">لا توجد نشاطات بعد.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">إشعارات</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">لا توجد إشعارات.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
