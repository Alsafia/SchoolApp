import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, MessageSquarePlus, Megaphone, Users, MessageCircle, Clock, Archive } from "lucide-react";

export const Route = createFileRoute("/messages/")({ component: Page });

interface ConvRow {
  id: string;
  type: "direct" | "group" | "announcement";
  title: string | null;
  last_message_at: string | null;
  last_read_at: string;
}

const TYPE_CONFIG = {
  direct:       { label: "فردية",  icon: MessageCircle, color: "bg-blue-500/10 text-blue-600" },
  group:        { label: "مجموعة", icon: Users,         color: "bg-violet-500/10 text-violet-600" },
  announcement: { label: "إعلان",  icon: Megaphone,     color: "bg-amber-500/10 text-amber-600" },
};

function Page() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "direct" | "group" | "announcement">("all");
  const [showArchived, setShowArchived] = useState(false);

  if (!user) return null;

  const userId = user.id;

  return <Inner q={q} setQ={setQ} typeFilter={typeFilter} setTypeFilter={setTypeFilter}
    showArchived={showArchived} setShowArchived={setShowArchived}
    onNew={() => navigate({ to: "/messages/new" })} userId={userId} />;
}

function Inner({
  q, setQ, typeFilter, setTypeFilter, showArchived, setShowArchived, onNew, userId,
}: {
  q: string; setQ: (v: string) => void;
  typeFilter: string; setTypeFilter: (v: any) => void;
  showArchived: boolean; setShowArchived: (v: boolean) => void;
  onNew: () => void; userId: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["conversations", userId, showArchived],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversation_participants")
        .select("last_read_at, archived, conversations:conversation_id(id, type, title, last_message_at)")
        .eq("user_id", userId)
        .eq("archived", showArchived);
      if (error) throw error;
      const rows = (data ?? []).map((r: any) => ({
        id: r.conversations?.id,
        type: r.conversations?.type,
        title: r.conversations?.title,
        last_message_at: r.conversations?.last_message_at,
        last_read_at: r.last_read_at,
      })).filter(r => r.id) as ConvRow[];
      rows.sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""));
      return rows;
    },
  });

  const filtered = useMemo(
    () => (data ?? []).filter(c => {
      if (typeFilter !== "all" && c.type !== typeFilter) return false;
      if (q && !(c.title ?? "").toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    }),
    [data, q, typeFilter],
  );

  const unreadCount = useMemo(
    () => (data ?? []).filter(c => c.last_message_at && c.last_read_at && new Date(c.last_message_at) > new Date(c.last_read_at)).length,
    [data],
  );

  function formatTime(iso: string | null) {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "أمس";
    if (diffDays < 7) return d.toLocaleDateString("ar-EG", { weekday: "short" });
    return d.toLocaleDateString("ar-EG", { day: "numeric", month: "short" });
  }

  function getInitials(title: string | null, type: string) {
    if (!title) return type === "direct" ? "م" : type === "group" ? "ج" : "إ";
    return title.trim().slice(0, 2);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4 pb-4 border-b">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {showArchived ? "الأرشيف" : "الرسائل"}
            {!showArchived && unreadCount > 0 && (
              <Badge className="h-5 px-1.5 text-[11px] rounded-full">{unreadCount}</Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {showArchived ? "المحادثات المؤرشفة" : "تواصل مع المعلمين وأولياء الأمور والطلاب"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showArchived ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setShowArchived(!showArchived)}
          >
            <Archive size={14} />
            {showArchived ? "الرسائل النشطة" : "الأرشيف"}
          </Button>
          {!showArchived && (
            <Button onClick={onNew} className="gap-2">
              <MessageSquarePlus size={16} />
              محادثة جديدة
            </Button>
          )}
        </div>
      </div>

      <div className="relative mb-3">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث في المحادثات..." className="pr-10" />
      </div>

      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        {(["all", "direct", "group", "announcement"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              typeFilter === t
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            {t === "all" ? "الكل" : TYPE_CONFIG[t].label}
            {t !== "all" && (
              <span className="mr-1 opacity-70">
                ({(data ?? []).filter(c => c.type === t).length})
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto rounded-xl border bg-card divide-y">
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
            <span className="text-sm">جاري التحميل...</span>
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <MessageSquarePlus className="mb-3 opacity-30" size={40} />
            <p className="font-medium text-sm">لا توجد محادثات</p>
            <p className="text-xs mt-1">ابدأ محادثة جديدة من الزر أعلاه</p>
          </div>
        )}
        {filtered.map(c => {
          const unread = c.last_message_at && c.last_read_at && new Date(c.last_message_at) > new Date(c.last_read_at);
          const cfg = TYPE_CONFIG[c.type] ?? TYPE_CONFIG.direct;
          const Icon = cfg.icon;
          const displayName = c.title ?? (c.type === "direct" ? "محادثة فردية" : c.type === "group" ? "مجموعة" : "إعلان");

          return (
            <Link
              key={c.id}
              to="/messages/$conversationId"
              params={{ conversationId: c.id }}
              className={`flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors ${unread ? "bg-primary/3" : ""}`}
            >
              <div className={`h-11 w-11 rounded-full flex items-center justify-center shrink-0 font-semibold text-sm ${cfg.color}`}>
                {c.type === "direct"
                  ? getInitials(c.title, c.type)
                  : <Icon size={18} />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={`truncate text-sm ${unread ? "font-bold" : "font-medium"}`}>
                    {displayName}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock size={11} />
                    {formatTime(c.last_message_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className={`text-[10px] h-4 px-1.5 shrink-0 ${cfg.color} border-transparent`}>
                    {cfg.label}
                  </Badge>
                  {!c.last_message_at && (
                    <span className="text-xs text-muted-foreground truncate">لا توجد رسائل بعد</span>
                  )}
                  {unread && (
                    <span className="w-2 h-2 rounded-full bg-primary shrink-0 mr-auto" />
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
