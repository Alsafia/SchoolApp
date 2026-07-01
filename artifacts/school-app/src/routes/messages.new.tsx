import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  ArrowRight, Search, MessageCircle, Users, Megaphone, Check, UserCheck,
  School, BookOpen, GraduationCap, Briefcase, ChevronDown, ChevronUp,
  Paperclip, X, FileText, Image, Archive, AlertTriangle, Info,
  Send, Loader2,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/messages/new")({ component: Page });

const ROLE_LABELS: Record<string, string> = {
  admin: "مدير",
  teacher: "معلم",
  parent: "ولي أمر",
  student: "طالب",
  accountant: "محاسب",
  receptionist: "موظف استقبال",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-700 border-red-200",
  teacher: "bg-blue-100 text-blue-700 border-blue-200",
  parent: "bg-green-100 text-green-700 border-green-200",
  student: "bg-violet-100 text-violet-700 border-violet-200",
  accountant: "bg-amber-100 text-amber-700 border-amber-200",
  receptionist: "bg-cyan-100 text-cyan-700 border-cyan-200",
};
const ROLE_BG: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  teacher: "bg-blue-100 text-blue-700",
  parent: "bg-green-100 text-green-700",
  student: "bg-violet-100 text-violet-700",
  accountant: "bg-amber-100 text-amber-700",
  receptionist: "bg-cyan-100 text-cyan-700",
};

function getInitials(name: string | null) {
  if (!name) return "؟";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return parts[0][0] + parts[1][0];
  return parts[0].slice(0, 2);
}

const MSG_TYPES = [
  { value: "direct",    label: "فردية",           icon: MessageCircle, color: "text-blue-600 bg-blue-50 border-blue-200", desc: "خاصة مع شخص واحد" },
  { value: "group",     label: "جماعية",           icon: Users,         color: "text-violet-600 bg-violet-50 border-violet-200", desc: "محادثة متعددة الأطراف" },
  { value: "announcement", label: "إعلان",         icon: Megaphone,     color: "text-amber-600 bg-amber-50 border-amber-200", desc: "بث لمجموعة كبيرة" },
  { value: "circular",  label: "تعميم إداري",      icon: Briefcase,     color: "text-rose-600 bg-rose-50 border-rose-200", desc: "تعميم رسمي" },
  { value: "financial", label: "إشعار مالي",       icon: AlertTriangle, color: "text-orange-600 bg-orange-50 border-orange-200", desc: "متعلق بالرسوم والمدفوعات" },
  { value: "academic",  label: "إشعار أكاديمي",    icon: BookOpen,      color: "text-teal-600 bg-teal-50 border-teal-200", desc: "نتائج أو امتحانات" },
] as const;

type MsgType = typeof MSG_TYPES[number]["value"];

const PRIORITY_OPTS = [
  { value: "normal",  label: "عادية",  color: "text-muted-foreground", icon: Info },
  { value: "high",    label: "مهمة",   color: "text-amber-600",        icon: AlertTriangle },
  { value: "urgent",  label: "عاجلة",  color: "text-destructive",      icon: AlertTriangle },
] as const;

type Priority = typeof PRIORITY_OPTS[number]["value"];

const ACCEPT_TYPES = ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.zip,.rar,.7z";
const FILE_ICONS: Record<string, React.ElementType> = {
  pdf: FileText, doc: FileText, docx: FileText,
  xls: FileText, xlsx: FileText,
  jpg: Image, jpeg: Image, png: Image, gif: Image, webp: Image,
  zip: Archive, rar: Archive, "7z": Archive,
};
function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return FILE_ICONS[ext] ?? Paperclip;
}
function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Page() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  return <NewConv userId={user.id} />;
}

function NewConv({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Form state ────────────────────────────────────────────────
  const [msgType, setMsgType]   = useState<MsgType>("direct");
  const [title, setTitle]       = useState("");
  const [body, setBody]         = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [files, setFiles]       = useState<File[]>([]);

  // ── Recipient selection ───────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ]               = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [showGroupPicker, setShowGroupPicker] = useState(false);

  // ── Data queries ──────────────────────────────────────────────
  const { data: users, isLoading } = useQuery({
    queryKey: ["profiles-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .neq("id", userId)
        .order("role")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: classes } = useQuery({
    queryKey: ["classes-list-msg"],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, name, section").order("grade_level");
      return data ?? [];
    },
  });

  const { data: studentsByClass } = useQuery({
    queryKey: ["students-by-class-msg"],
    enabled: showGroupPicker,
    queryFn: async () => {
      const { data } = await supabase.from("students").select("id, full_name, class_id").eq("status", "active");
      return data ?? [];
    },
  });

  // ── Derived ───────────────────────────────────────────────────
  const roleGroups = useMemo(() => ({
    teacher: (users ?? []).filter(u => u.role === "teacher"),
    parent:  (users ?? []).filter(u => u.role === "parent"),
    student: (users ?? []).filter(u => u.role === "student"),
    admin:   (users ?? []).filter(u => u.role === "admin"),
    staff:   (users ?? []).filter(u => ["accountant", "receptionist"].includes(u.role)),
  }), [users]);

  const filtered = useMemo(() => {
    return (users ?? []).filter(u => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (q && !(u.full_name ?? "").toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [users, q, roleFilter]);

  const selectedUsers = useMemo(
    () => (users ?? []).filter(u => selected.has(u.id)),
    [users, selected],
  );

  // ── Handlers ──────────────────────────────────────────────────
  function toggleUser(id: string) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      if (msgType === "direct") next.clear();
      next.add(id);
    }
    setSelected(next);
  }

  function handleTypeChange(t: MsgType) {
    setMsgType(t);
    if (t === "direct") setSelected(new Set());
    setTitle("");
  }

  function selectGroup(ids: string[]) {
    const next = new Set(selected);
    ids.forEach(id => next.add(id));
    setSelected(next);
    setShowGroupPicker(false);
    toast.info(`تمت إضافة ${ids.length} مستخدم`);
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const newFiles = Array.from(e.target.files ?? []);
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...newFiles.filter(f => !names.has(f.name))];
    });
    e.target.value = "";
  }

  // ── Submit ────────────────────────────────────────────────────
  const create = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      if (ids.length === 0) throw new Error("اختر مستخدماً واحداً على الأقل");
      if (msgType === "direct" && ids.length !== 1) throw new Error("المحادثة الفردية تتطلب مستخدماً واحداً فقط");
      if (msgType !== "direct" && !title.trim()) throw new Error("أدخل عنوان الرسالة");
      if (!body.trim()) throw new Error("اكتب نص الرسالة");

      const DB_TYPE_MAP: Record<MsgType, "direct" | "group" | "announcement"> = {
        direct:    "direct",
        group:     "group",
        announcement: "announcement",
        circular:  "announcement",
        financial: "announcement",
        academic:  "announcement",
      };
      const dbType = DB_TYPE_MAP[msgType];

      const { data: conv, error } = await supabase
        .from("conversations")
        .insert({ type: dbType, title: title.trim() || null, created_by: userId })
        .select().single();
      if (error) throw error;

      const participants = [userId, ...ids].map(uid => ({
        conversation_id: conv.id,
        user_id: uid,
        role: uid === userId ? "owner" : "member",
      }));
      const { error: pErr } = await supabase.from("conversation_participants").insert(participants);
      if (pErr) throw pErr;

      const { error: mErr } = await supabase.from("messages").insert({
        conversation_id: conv.id,
        sender_id: userId,
        content: body.trim(),
        metadata: { priority, msg_type: msgType },
      });
      if (mErr) throw mErr;

      return conv;
    },
    onSuccess: (conv) => {
      toast.success("تم إرسال الرسالة بنجاح ✓");
      navigate({ to: "/messages/$conversationId", params: { conversationId: conv.id } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const canSend = selected.size > 0 && body.trim().length > 0 && (msgType === "direct" || !!title.trim());
  const typeCfg = MSG_TYPES.find(t => t.value === msgType)!;
  const priorityCfg = PRIORITY_OPTS.find(p => p.value === priority)!;

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/messages" })}>
          <ArrowRight size={18} />
        </Button>
        <div>
          <h1 className="text-xl font-bold">رسالة جديدة</h1>
          <p className="text-sm text-muted-foreground">إنشاء رسالة أو إعلان أو إشعار</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* ── RIGHT COLUMN: Recipients ────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Message type */}
          <Card className="p-4 space-y-3">
            <Label className="font-semibold text-sm">نوع الرسالة</Label>
            <div className="grid grid-cols-2 gap-2">
              {MSG_TYPES.map(ct => {
                const Icon = ct.icon;
                return (
                  <button
                    key={ct.value}
                    onClick={() => handleTypeChange(ct.value)}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border-2 text-right transition-all text-sm ${
                      msgType === ct.value
                        ? `${ct.color} shadow-sm`
                        : "border-border hover:bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    <Icon size={15} className="shrink-0" />
                    <span className="font-medium text-xs">{ct.label}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Quick group selection */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-semibold text-sm">المستلمون</Label>
              <button
                onClick={() => setShowGroupPicker(!showGroupPicker)}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                اختيار جماعي
                {showGroupPicker ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </div>

            {/* Group bulk-select */}
            {showGroupPicker && (
              <div className="space-y-2 p-3 rounded-lg bg-muted/30 border">
                <p className="text-xs text-muted-foreground font-medium mb-2">تحديد مجموعة دفعة واحدة</p>
                <div className="grid grid-cols-1 gap-1.5">
                  <GroupBtn
                    icon={GraduationCap}
                    label={`جميع الطلاب (${roleGroups.student.length})`}
                    onClick={() => selectGroup(roleGroups.student.map(u => u.id))}
                  />
                  <GroupBtn
                    icon={Users}
                    label={`جميع المعلمين (${roleGroups.teacher.length})`}
                    onClick={() => selectGroup(roleGroups.teacher.map(u => u.id))}
                  />
                  <GroupBtn
                    icon={Users}
                    label={`جميع أولياء الأمور (${roleGroups.parent.length})`}
                    onClick={() => selectGroup(roleGroups.parent.map(u => u.id))}
                  />
                  <GroupBtn
                    icon={Briefcase}
                    label={`الموظفون (${roleGroups.staff.length + roleGroups.admin.length})`}
                    onClick={() => selectGroup([...roleGroups.staff, ...roleGroups.admin].map(u => u.id))}
                  />
                  {/* Per-class selection */}
                  {(classes ?? []).length > 0 && (
                    <>
                      <Separator className="my-1" />
                      <p className="text-[10px] text-muted-foreground">حسب الصف</p>
                      {(classes ?? []).map(cls => {
                        const classStudents = (studentsByClass ?? [])
                          .filter(s => s.class_id === cls.id)
                          .map(s => s.id);
                        return (
                          <GroupBtn
                            key={cls.id}
                            icon={School}
                            label={`${cls.name}${cls.section ? ` / ${cls.section}` : ""} (${classStudents.length})`}
                            onClick={() => selectGroup(classStudents)}
                          />
                        );
                      })}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Search & filter */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ابحث بالاسم..."
                className="pr-9 h-8 text-sm"
              />
            </div>

            <div className="flex gap-1 flex-wrap">
              {[
                { value: "all",   label: "الكل" },
                { value: "teacher", label: "معلمون" },
                { value: "parent",  label: "أولياء" },
                { value: "student", label: "طلاب" },
                { value: "admin",   label: "مدراء" },
              ].map(rf => (
                <button
                  key={rf.value}
                  onClick={() => setRoleFilter(rf.value)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                    roleFilter === rf.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  {rf.label}
                </button>
              ))}
            </div>

            {/* User list */}
            <div className="border rounded-lg overflow-hidden max-h-60 overflow-y-auto divide-y">
              {isLoading && <div className="p-4 text-center text-sm text-muted-foreground">جاري التحميل...</div>}
              {!isLoading && filtered.length === 0 && <div className="p-4 text-center text-sm text-muted-foreground">لا يوجد مستخدمون</div>}
              {filtered.map((u: any) => {
                const isSel = selected.has(u.id);
                return (
                  <button
                    key={u.id}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-right transition-colors ${isSel ? "bg-primary/5" : "hover:bg-muted/40"}`}
                    onClick={() => toggleUser(u.id)}
                  >
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 ${ROLE_BG[u.role] ?? "bg-muted"}`}>
                      {getInitials(u.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{u.full_name ?? "—"}</div>
                      <div className={`text-[10px] ${ROLE_COLORS[u.role]?.split(" ")[1] ?? "text-muted-foreground"}`}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </div>
                    </div>
                    <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${isSel ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                      {isSel && <Check size={9} className="text-primary-foreground" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected chips */}
            {selected.size > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1 border-t">
                <span className="text-[10px] text-muted-foreground w-full">المستلمون المختارون ({selected.size}):</span>
                {selectedUsers.slice(0, 8).map(u => (
                  <button
                    key={u.id}
                    onClick={() => toggleUser(u.id)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium hover:opacity-80 transition-colors ${ROLE_COLORS[u.role] ?? "bg-muted border-border"}`}
                  >
                    {u.full_name ?? "—"} ×
                  </button>
                ))}
                {selectedUsers.length > 8 && (
                  <span className="text-[10px] text-muted-foreground px-2 py-0.5 border rounded-full">
                    +{selectedUsers.length - 8} آخرون
                  </span>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* ── LEFT COLUMN: Message compose ────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">
          <Card className="p-4 space-y-4">
            {/* Title */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">
                عنوان الرسالة {msgType !== "direct" && <span className="text-destructive">*</span>}
              </Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  msgType === "direct" ? "عنوان اختياري للرسالة الفردية" :
                  msgType === "announcement" ? "مثال: إعلان موعد الاجتماع الفصلي" :
                  msgType === "circular" ? "مثال: تعميم بشأن تعديل الدوام" :
                  msgType === "financial" ? "مثال: تنبيه بموعد سداد الرسوم" :
                  msgType === "academic" ? "مثال: نتائج الاختبار النصفي" :
                  "مثال: مجموعة أولياء أمور الصف الثالث"
                }
              />
            </div>

            {/* Body */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">نص الرسالة <span className="text-destructive">*</span></Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="اكتب رسالتك هنا..."
                rows={7}
                className="resize-none"
              />
              <div className="text-[10px] text-muted-foreground text-left">{body.length} حرف</div>
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">الأولوية</Label>
              <div className="flex gap-2">
                {PRIORITY_OPTS.map(p => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.value}
                      onClick={() => setPriority(p.value)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm font-medium transition-all ${
                        priority === p.value
                          ? `${p.color} border-current bg-current/5`
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <Icon size={13} />
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Attachments */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">المرفقات</Label>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Paperclip size={12} /> إضافة ملف
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept={ACCEPT_TYPES}
                  className="hidden"
                  onChange={handleFiles}
                />
              </div>
              {files.length === 0 ? (
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed rounded-lg p-4 text-center text-xs text-muted-foreground cursor-pointer hover:bg-muted/30 transition-colors"
                >
                  <Paperclip className="mx-auto mb-1.5 opacity-40" size={20} />
                  <p>اسحب الملفات هنا أو انقر للاختيار</p>
                  <p className="mt-0.5 opacity-70">PDF، Word، Excel، صور، ملفات مضغوطة</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {files.map((f, i) => {
                    const Icon = fileIcon(f.name);
                    return (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/30 text-sm">
                        <Icon size={14} className="text-muted-foreground shrink-0" />
                        <span className="flex-1 truncate text-xs">{f.name}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{fileSize(f.size)}</span>
                        <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                          <X size={13} />
                        </button>
                      </div>
                    );
                  })}
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <Paperclip size={11} /> إضافة ملف آخر
                  </button>
                </div>
              )}
            </div>
          </Card>

          {/* Summary + Send */}
          <Card className={`p-4 border-2 transition-colors ${canSend ? "border-primary/30 bg-primary/3" : "border-border"}`}>
            <div className="flex items-start justify-between mb-3">
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <typeCfg.icon size={15} className="text-muted-foreground" />
                  <span className="font-medium">{typeCfg.label}</span>
                  <span className={`text-xs font-medium ${priorityCfg.color}`}>• {priorityCfg.label}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {selected.size === 0 ? "لم يُختر مستلم بعد" : `${selected.size} ${selected.size === 1 ? "مستلم" : "مستلمين"}`}
                  {files.length > 0 && ` • ${files.length} مرفق`}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => navigate({ to: "/messages" })}
              >
                إلغاء
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={() => create.mutate()}
                disabled={create.isPending || !canSend}
              >
                {create.isPending ? (
                  <><Loader2 size={15} className="animate-spin" /> جارٍ الإرسال...</>
                ) : (
                  <><Send size={15} /> إرسال الرسالة</>
                )}
              </Button>
            </div>
            {!canSend && (
              <p className="text-[11px] text-muted-foreground mt-2 text-center">
                {selected.size === 0 ? "⬅ اختر مستلماً من القائمة على اليمين" :
                 !body.trim() ? "⬇ اكتب نص الرسالة" :
                 "⬇ أدخل عنوان الرسالة"}
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function GroupBtn({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background hover:bg-muted/60 text-right text-xs transition-colors"
    >
      <Icon size={13} className="text-muted-foreground shrink-0" />
      <span className="flex-1 text-right">{label}</span>
      <Users size={11} className="text-primary shrink-0" />
    </button>
  );
}
