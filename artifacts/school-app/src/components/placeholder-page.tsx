import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";

function makePlaceholder(title: string, desc: string) {
  return function Page() {
    const { user, loading } = useAuth();
    if (loading) return null;
    if (!user) return <Navigate to="/auth" />;
    return (
      <AppShell>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-muted-foreground mt-1">{desc}</p>
          </div>
          <Card className="p-12 text-center">
            <div className="text-muted-foreground">هذه الوحدة قيد التطوير وستُبنى في المراحل القادمة.</div>
          </Card>
        </div>
      </AppShell>
    );
  };
}

export { makePlaceholder };
