import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight, Send, Paperclip, Users, Megaphone,
  MessageCircle, MoreHorizontal, CheckCheck, X, File as FileIcon,
  Reply, Trash2, Archive, ArchiveX, CornerUpRight,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/messages/$conversationId")({ component: Page });

interface Msg {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string | null;
  sender_role: string | null;
  content: string | null;
  created_at: string;
  metadata?: { reply_to?: { id: string; content: string; sender_name: string } } | null;
}

interface Participant {
  user_id: string;
  role: string;
  archived: boolean;
  profiles: { full_name: string | null; role: string | null } | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "مدير",
  teacher: "معلم",
  parent: "ولي أمر",
  student: "طالب",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-500/15 text-red-700",
  teacher: "bg-blue-500/15 text-blue-700",
  parent: "bg-green-500/15 text-green-700",
  student: "bg-violet-500/15 text-violet-700",
};

function getInitials(name: string | null) {
  if (!name) return "؟";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return parts[0][0] + parts[1][0];
  return parts[0].slice(0, 2);
}

function AvatarCircle({ name, role, size = "md" }: { name: string | null; role?: string | null; size?: "sm" | "md" }) {
  const colorMap: Record<string, string> = {
    admin: "bg-red-100 text-red-700",
    teacher: "bg-blue-100 text-blue-700",
    parent: "bg-green-100 text-green-700",
    student: "bg-violet-100 text-violet-700",
  };
  const bg = role ? (colorMap[role] ?? "bg-primary/10 text-primary") : "bg-primary/10 text-primary";
  const sz = size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs";
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-semibold shrink-0 ${bg}`}>
      {getInitials(name)}
    </div>
  );
}

function Page() {
  const { user, loading, profile } = useAuth();
  const { conversationId } = Route.useParams();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  return (
    <Chat conversationId={conversationId} userId={user.id} myRole={profile?.role ?? null} myName={profile?.full_name ?? null} />
  );
}

function Chat({ conversationId, userId, myRole, myName }: {
  conversationId: string; userId: string; myRole: string | null; myName: string | null;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [showParticipants, setShowParticipants] = useState(false);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [hoveredMsg, setHoveredMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: conv } = useQuery({
    queryKey: ["conv", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase.from("conversations").select("*").eq("id", conversationId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: participants } = useQuery({
    queryKey: ["conv-participants", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversation_participants")
        .select("user_id, role, archived, profiles:user_id(full_name, role)")
        .eq("conversation_id", conversationId);
      if (error) throw error;
      return (data ?? []) as Participant[];
    },
  });

  const myParticipant = (participants ?? []).find(p => p.user_id === userId);
  const isArchived = myParticipant?.archived ?? false;

  const { data: messages } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
  });

  // Mark as read
  useEffect(() => {
    supabase.from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .then(() => qc.invalidateQueries({ queryKey: ["conversations", userId] }));
  }, [conversationId, userId, messages?.length, qc]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase.channel(`messages:${conversationId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, () => qc.invalidateQueries({ queryKey: ["messages", conversationId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, qc]);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages?.length]);

  const send = useMutation({
    mutationFn: async (payload: { content: string; attachment?: File }) => {
      const metadata = replyTo ? {
        reply_to: {
          id: replyTo.id,
          content: replyTo.content?.slice(0, 120) ?? "",
          sender_name: replyTo.sender_name ?? "مستخدم",
        },
      } : undefined;

      const { data: msg, error } = await supabase.from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: userId,
          sender_name: myName,
          sender_role: myRole,
          content: payload.content || null,
          metadata: metadata ?? null,
        })
        .select().single();
      if (error) throw error;
      if (payload.attachment) {
        const path = `${userId}/${msg.id}-${payload.attachment.name}`;
        const { error: uErr } = await supabase.storage.from("message-attachments").upload(path, payload.attachment);
        if (uErr) throw uErr;
        const { data: pub } = supabase.storage.from("message-attachments").getPublicUrl(path);
        await supabase.from("message_attachments").insert({
          message_id: msg.id,
          file_url: pub.publicUrl,
          file_name: payload.attachment.name,
          file_type: payload.attachment.type,
          file_size: payload.attachment.size,
        });
      }
      return msg;
    },
    onSuccess: () => {
      setText("");
      setAttachFile(null);
      setReplyTo(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations", userId] });
      setTimeout(() => inputRef.current?.focus(), 50);
    },
    onError: (e: any) => toast.error(e.message ?? "فشل إرسال الرسالة"),
  });

  const deleteMsg = useMutation({
    mutationFn: async (msgId: string) => {
      const { error } = await supabase.from("messages").delete().eq("id", msgId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف الرسالة");
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const archiveMutation = useMutation({
    mutationFn: async (archive: boolean) => {
      const { error } = await supabase.from("conversation_participants")
        .update({ archived: archive })
        .eq("conversation_id", conversationId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: (_, archive) => {
      toast.success(archive ? "تمت الأرشفة" : "تم إلغاء الأرشفة");
      qc.invalidateQueries({ queryKey: ["conversations", userId] });
      qc.invalidateQueries({ queryKey: ["conv-participants", conversationId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() && !attachFile) return;
    send.mutate({ content: text.trim(), attachment: attachFile ?? undefined });
  };

  const isGroup = conv?.type === "group" || conv?.type === "announcement";
  const convTitle = conv?.title ?? (conv?.type === "direct" ? "محادثة فردية" : "محادثة");

  // Group messages by date
  const groupedMessages = (messages ?? []).reduce<{ date: string; msgs: Msg[] }[]>((acc, msg) => {
    const date = new Date(msg.created_at).toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    if (!acc.length || acc[acc.length - 1].date !== date) acc.push({ date, msgs: [] });
    acc[acc.length - 1].msgs.push(msg);
    return acc;
  }, []);

  const ConvIcon = conv?.type === "announcement" ? Megaphone : conv?.type === "group" ? Users : MessageCircle;

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b mb-0 bg-background">
        <Button asChild variant="ghost" size="icon" className="shrink-0">
          <Link to="/messages"><ArrowRight size={18} /></Link>
        </Button>

        <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
          conv?.type === "announcement" ? "bg-amber-100 text-amber-700" :
          conv?.type === "group" ? "bg-violet-100 text-violet-700" :
          "bg-blue-100 text-blue-700"
        }`}>
          <ConvIcon size={17} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate text-sm flex items-center gap-2">
            {convTitle}
            {isArchived && (
              <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-muted-foreground">مؤرشف</Badge>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            {conv?.type === "announcement" && "إعلان · "}
            {conv?.type === "group" && "مجموعة · "}
            {(participants ?? []).length > 0 && (
              <span>{(participants ?? []).length} مشارك</span>
            )}
          </div>
        </div>

        {/* Archive toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          title={isArchived ? "إلغاء الأرشفة" : "أرشفة المحادثة"}
          onClick={() => archiveMutation.mutate(!isArchived)}
          disabled={archiveMutation.isPending}
        >
          {isArchived ? <ArchiveX size={17} className="text-primary" /> : <Archive size={17} className="text-muted-foreground" />}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={() => setShowParticipants(!showParticipants)}
          title="المشاركون"
        >
          <MoreHorizontal size={18} />
        </Button>
      </div>

      {/* Participants panel */}
      {showParticipants && (
        <div className="border-b bg-muted/30 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground">المشاركون ({(participants ?? []).length})</span>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setShowParticipants(false)}>
              <X size={12} />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(participants ?? []).map(p => {
              const name = (p.profiles as any)?.full_name ?? "مستخدم";
              const role = (p.profiles as any)?.role ?? "unknown";
              return (
                <div key={p.user_id} className="flex items-center gap-1.5 bg-background border rounded-full px-2.5 py-1">
                  <AvatarCircle name={name} role={role} size="sm" />
                  <span className="text-xs font-medium">{name}</span>
                  <Badge variant="outline" className={`text-[9px] h-4 px-1 ${ROLE_COLORS[role] ?? ""} border-transparent`}>
                    {ROLE_LABELS[role] ?? role}
                  </Badge>
                  {p.user_id === userId && <span className="text-[9px] text-muted-foreground">(أنت)</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-4 space-y-4">
        {(messages ?? []).length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <div className={`h-16 w-16 rounded-2xl flex items-center justify-center mb-4 ${
              conv?.type === "announcement" ? "bg-amber-100 text-amber-600" :
              conv?.type === "group" ? "bg-violet-100 text-violet-600" :
              "bg-blue-100 text-blue-600"
            }`}>
              <ConvIcon size={30} />
            </div>
            <p className="font-medium text-sm">لا توجد رسائل بعد</p>
            <p className="text-xs mt-1">ابدأ المحادثة بكتابة رسالتك أدناه</p>
          </div>
        )}

        {groupedMessages.map(({ date, msgs }) => (
          <div key={date}>
            {/* Date separator */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[11px] text-muted-foreground bg-background px-2 py-0.5 rounded-full border shrink-0">{date}</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div className="space-y-1">
              {msgs.map((m, idx) => {
                const mine = m.sender_id === userId;
                const prevMsg = idx > 0 ? msgs[idx - 1] : null;
                const showSender = isGroup && !mine && (!prevMsg || prevMsg.sender_id !== m.sender_id);
                const senderName = m.sender_name ?? "مستخدم";
                const senderRole = m.sender_role;
                const timeStr = new Date(m.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
                const replyData = m.metadata?.reply_to;
                const canDelete = mine || myRole === "admin";

                return (
                  <div
                    key={m.id}
                    className={`flex items-end gap-2 group ${mine ? "flex-row-reverse" : "flex-row"}`}
                    onMouseEnter={() => setHoveredMsg(m.id)}
                    onMouseLeave={() => setHoveredMsg(null)}
                  >
                    {/* Avatar — shown for others in groups */}
                    {!mine && isGroup ? (
                      <div className="mb-1 shrink-0">
                        {showSender ? (
                          <AvatarCircle name={senderName} role={senderRole} size="sm" />
                        ) : (
                          <div className="w-7" />
                        )}
                      </div>
                    ) : null}

                    <div className={`flex flex-col max-w-[72%] ${mine ? "items-end" : "items-start"}`}>
                      {/* Sender name for groups */}
                      {showSender && (
                        <div className="flex items-center gap-1.5 mb-1 px-1">
                          <span className="text-xs font-semibold">{senderName}</span>
                          {senderRole && (
                            <Badge variant="outline" className={`text-[9px] h-4 px-1 ${ROLE_COLORS[senderRole] ?? ""} border-transparent`}>
                              {ROLE_LABELS[senderRole] ?? senderRole}
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* Bubble */}
                      <div className={`rounded-2xl px-3.5 py-2.5 relative ${
                        mine
                          ? "bg-primary text-primary-foreground rounded-bl-2xl rounded-br-sm"
                          : "bg-muted text-foreground rounded-br-2xl rounded-bl-sm"
                      }`}>
                        {/* Reply preview */}
                        {replyData && (
                          <div className={`mb-2 rounded-lg px-2.5 py-1.5 border-r-2 ${
                            mine
                              ? "bg-primary-foreground/10 border-primary-foreground/40"
                              : "bg-background/60 border-primary"
                          }`}>
                            <div className="flex items-center gap-1 mb-0.5">
                              <CornerUpRight size={10} className={mine ? "text-primary-foreground/60" : "text-primary"} />
                              <span className={`text-[10px] font-semibold ${mine ? "text-primary-foreground/70" : "text-primary"}`}>
                                {replyData.sender_name}
                              </span>
                            </div>
                            <p className={`text-[11px] truncate ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                              {replyData.content || "رسالة محذوفة"}
                            </p>
                          </div>
                        )}

                        {m.content && (
                          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{m.content}</p>
                        )}
                        <div className={`flex items-center gap-1 mt-1 ${mine ? "justify-end" : "justify-start"}`}>
                          <span className={`text-[10px] ${mine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                            {timeStr}
                          </span>
                          {mine && <CheckCheck size={12} className="text-primary-foreground/60" />}
                        </div>
                      </div>
                    </div>

                    {/* Action buttons (reply / delete) */}
                    <div className={`flex items-center gap-0.5 mb-1 transition-opacity ${
                      hoveredMsg === m.id ? "opacity-100" : "opacity-0"
                    } ${mine ? "flex-row-reverse" : "flex-row"}`}>
                      <button
                        onClick={() => { setReplyTo(m); setTimeout(() => inputRef.current?.focus(), 50); }}
                        className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="رد"
                      >
                        <Reply size={13} />
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => {
                            if (confirm("هل تريد حذف هذه الرسالة؟")) {
                              deleteMsg.mutate(m.id);
                            }
                          }}
                          className="p-1.5 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="حذف"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Reply preview bar */}
      {replyTo && (
        <div className="mx-3 mb-2 flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-3 py-2">
          <CornerUpRight size={14} className="text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold text-primary">{replyTo.sender_name ?? "مستخدم"}</div>
            <p className="text-xs text-muted-foreground truncate">{replyTo.content}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => setReplyTo(null)}>
            <X size={11} />
          </Button>
        </div>
      )}

      {/* Attachment preview */}
      {attachFile && (
        <div className="mx-3 mb-2 flex items-center gap-2 bg-muted rounded-lg px-3 py-2 border">
          <FileIcon size={16} className="text-primary shrink-0" />
          <span className="text-xs flex-1 truncate">{attachFile.name}</span>
          <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => { setAttachFile(null); if (fileRef.current) fileRef.current.value = ""; }}>
            <X size={12} />
          </Button>
        </div>
      )}

      {/* Input bar */}
      <div className="border-t bg-background pt-3">
        <form onSubmit={onSubmit} className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            id="att-file"
            onChange={(e) => setAttachFile(e.target.files?.[0] ?? null)}
          />
          <label htmlFor="att-file" title="إرفاق ملف">
            <div className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted cursor-pointer transition-colors">
              <Paperclip size={17} className="text-muted-foreground" />
            </div>
          </label>

          <Input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={replyTo ? `رد على ${replyTo.sender_name ?? "مستخدم"}...` : "اكتب رسالتك..."}
            className="flex-1 rounded-full bg-muted border-0 focus-visible:ring-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(e); }
              if (e.key === "Escape" && replyTo) setReplyTo(null);
            }}
          />

          <Button
            type="submit"
            size="icon"
            disabled={send.isPending || (!text.trim() && !attachFile)}
            className="rounded-full h-9 w-9 shrink-0"
          >
            {send.isPending
              ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              : <Send size={16} />
            }
          </Button>
        </form>
      </div>
    </div>
  );
}
