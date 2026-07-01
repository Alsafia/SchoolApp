import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, type ReactNode } from "react";
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, School,
  CalendarDays, ClipboardCheck, FileText, CreditCard,
  MessageSquare, BarChart3, Settings, LogOut, Bell, Menu, X,
  Building2, ChevronDown, TrendingDown,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useBranch } from "@/hooks/use-branch";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const nav = [
  { to: "/", label: "لوحة التحكم", icon: LayoutDashboard },
  { to: "/students", label: "الطلاب", icon: GraduationCap },
  { to: "/teachers", label: "المعلمون", icon: Users },
  { to: "/branches", label: "الفروع", icon: Building2 },
  { to: "/classes", label: "الصفوف والشعب", icon: School },
  { to: "/subjects", label: "المواد الدراسية", icon: BookOpen },
  { to: "/schedule", label: " الجداول الدراسية", icon: CalendarDays },
  { to: "/attendance", label: "الحضور والغياب", icon: ClipboardCheck },
  { to: "/exams", label: " الامتحانات والدرجات", icon: FileText },
  { to: "/student-grades", label: "الكنترول ", icon: GraduationCap },
  { to: "/payments", label: "الرسوم ", icon: CreditCard },
  { to: "/expenses", label: "المصروفات", icon: TrendingDown },
  { to: "/messages", label: "الرسائل", icon: MessageSquare },
  { to: "/reports", label: "التقارير", icon: BarChart3 },
  { to: "/settings", label: "الإعدادات", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { profile, signOut } = useAuth();
  const { branches, selectedBranch, setSelectedBranch } = useBranch();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  const currentLabel =
    nav.find((n) => n.to === pathname || (n.to !== "/" && pathname.startsWith(n.to)))?.label ?? "";

  const selectedBranchName = selectedBranch
    ? (branches.find((b) => b.id === selectedBranch)?.name ?? "الفرع")
    : "جميع الفروع";

  const isAdmin = profile?.role === "admin";

  const SidebarBody = (
    <>
      <div className="p-5 border-b border-sidebar-border flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-primary flex items-center justify-center font-bold text-primary-foreground">
            م
          </div>
          <div className="min-w-0">
            <div className="font-bold truncate">مدرستي</div>
            <div className="text-xs opacity-70 truncate">نظام إدارة المدرسة</div>
          </div>
        </div>
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-2 rounded-md hover:bg-sidebar-accent"
          aria-label="إغلاق القائمة"
        >
          <X size={18} />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {nav.map((item) => {
          const active = pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "hover:bg-sidebar-accent/60"
              }`}
            >
              <Icon size={18} className="shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="h-9 w-9 shrink-0 rounded-full bg-sidebar-accent flex items-center justify-center font-semibold">
            {profile?.full_name?.[0] ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{profile?.full_name ?? "مستخدم"}</div>
            <div className="text-xs opacity-70 truncate">{roleLabel(profile?.role)}</div>
          </div>
          <button
            onClick={handleSignOut}
            title="تسجيل الخروج"
            className="p-2 rounded-md hover:bg-sidebar-accent shrink-0"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 bg-sidebar text-sidebar-foreground flex-col">
        {SidebarBody}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 right-0 w-72 max-w-[85vw] bg-sidebar text-sidebar-foreground flex flex-col shadow-2xl animate-in slide-in-from-right">
            {SidebarBody}
          </aside>
        </div>
      )}

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b bg-card flex items-center justify-between px-4 sm:px-6 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -mr-2 rounded-md hover:bg-muted"
              aria-label="فتح القائمة"
            >
              <Menu size={20} />
            </button>
            <div className="text-sm text-muted-foreground truncate">{currentLabel}</div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Branch selector — admin sees all, others see their branch */}
            {branches.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/40 hover:bg-muted text-sm font-medium transition-colors max-w-[180px] truncate">
                    <Building2 size={14} className="shrink-0 text-primary" />
                    <span className="truncate">{selectedBranchName}</span>
                    <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {isAdmin && (
                    <>
                      <DropdownMenuItem
                        onClick={() => setSelectedBranch(null)}
                        className={!selectedBranch ? "bg-primary/5 text-primary font-medium" : ""}
                      >
                        جميع الفروع
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {branches.map((b) => (
                    <DropdownMenuItem
                      key={b.id}
                      onClick={() => setSelectedBranch(b.id)}
                      className={selectedBranch === b.id ? "bg-primary/5 text-primary font-medium" : ""}
                    >
                      <Building2 size={13} className="ml-2 shrink-0" />
                      {b.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <Button variant="ghost" size="icon" className="shrink-0">
              <Bell size={18} />
            </Button>
          </div>
        </header>
        <div className="flex-1 p-4 sm:p-6 overflow-auto min-w-0">{children}</div>
      </main>
    </div>
  );
}

function roleLabel(r?: string) {
  switch (r) {
    case "admin": return "مدير";
    case "teacher": return "معلم";
    case "parent": return "ولي أمر";
    case "student": return "طالب";
    default: return "—";
  }
}
