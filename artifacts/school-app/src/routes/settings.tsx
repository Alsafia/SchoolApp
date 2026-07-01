import { toast } from "sonner";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Upload, Trash2, Save, Database, Download, RotateCcw, Plus, Bell,
  Palette, Building2, Users, SlidersHorizontal, Globe, User,
  AlertTriangle, CheckCircle2, Info,
} from "lucide-react";

export const Route = createFileRoute("/settings")({ component: Page });

const DAYS = [
  { v: "sat", label: "السبت" },
  { v: "sun", label: "الأحد" },
  { v: "mon", label: "الإثنين" },
  { v: "tue", label: "الثلاثاء" },
  { v: "wed", label: "الأربعاء" },
  { v: "thu", label: "الخميس" },
  { v: "fri", label: "الجمعة" },
];

// Generate academic year options (e.g. 2024/2025)
const ACADEMIC_YEARS = Array.from({ length: 8 }, (_, i) => {
  const y = 2022 + i;
  return { v: `${y}/${y + 1}`, label: `${y}/${y + 1}` };
});

function Page() {
  const { user, loading, hasRole } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  if (!hasRole("admin")) {
    return (
      <AppShell>
        <Card className="p-12 text-center max-w-md mx-auto mt-16">
          <AlertTriangle className="mx-auto mb-4 text-amber-500" size={40} />
          <div className="text-lg font-semibold">غير مصرح</div>
          <p className="text-muted-foreground mt-2">هذه الشاشة مخصصة للمدير فقط</p>
        </Card>
      </AppShell>
    );
  }
  return (
    <AppShell>
      <SettingsView userId={user.id} />
    </AppShell>
  );
}

function SettingsView({ userId }: { userId: string }) {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">إعدادات النظام</h1>
        <p className="text-muted-foreground mt-1">إدارة شاملة لإعدادات المدرسة والنظام</p>
      </div>

      <Tabs defaultValue="school" className="space-y-4">
        <TabsList className="flex-wrap h-auto justify-start gap-1 p-1.5 bg-muted/60 rounded-xl border">
          <TabsTrigger value="school" className="gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-3 py-2 text-sm font-medium transition-all">
            <Building2 size={14} className="text-blue-600" /> بيانات المدرسة
          </TabsTrigger>
          <TabsTrigger value="general" className="gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-3 py-2 text-sm font-medium transition-all">
            <SlidersHorizontal size={14} className="text-violet-600" /> الإعدادات العامة
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-3 py-2 text-sm font-medium transition-all">
            <Users size={14} className="text-green-600" /> المستخدمون
          </TabsTrigger>
          <TabsTrigger value="notify" className="gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-3 py-2 text-sm font-medium transition-all">
            <Bell size={14} className="text-amber-600" /> الإشعارات
          </TabsTrigger>
          <TabsTrigger value="backup" className="gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-3 py-2 text-sm font-medium transition-all">
            <Database size={14} className="text-cyan-600" /> النسخ الاحتياطي
          </TabsTrigger>
          <TabsTrigger value="system" className="gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-3 py-2 text-sm font-medium transition-all">
            <Globe size={14} className="text-teal-600" /> النظام
          </TabsTrigger>
          <TabsTrigger value="theme" className="gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-3 py-2 text-sm font-medium transition-all">
            <Palette size={14} className="text-pink-600" /> المظهر
          </TabsTrigger>
          <TabsTrigger value="account" className="gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-3 py-2 text-sm font-medium transition-all">
            <User size={14} className="text-orange-600" /> الحساب
          </TabsTrigger>
        </TabsList>

        <TabsContent value="school"><SchoolTab /></TabsContent>
        <TabsContent value="general"><GeneralTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="notify"><NotifyTab /></TabsContent>
        <TabsContent value="backup"><BackupTab /></TabsContent>
        <TabsContent value="system"><SystemTab /></TabsContent>
        <TabsContent value="theme"><ThemeTab /></TabsContent>
        <TabsContent value="account"><AccountTab userId={userId} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Settings hook ──────────────────────────────────────────────────────────
function useSettings<T extends Record<string, any>>(section: string, defaults: T) {
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["settings", section],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("value")
        .eq("section", section)
        .maybeSingle();

      if (error) {
        if (error.code === "42P01") return defaults;
        throw error;
      }

      return (data?.value as T) ?? defaults;
    },
  });

  const save = useMutation({
    mutationFn: async (value: T) => {
      const { error } = await supabase
        .from("settings")
        .upsert(
          { section, value },
          { onConflict: "section" }
        );

      if (error) throw error;
    },

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", section] });
    },
  });

  return {
    data: data ?? defaults,
    isLoading,
    error,
    save,
  };
}

// ─── Helper components ──────────────────────────────────────────────────────
function Field({ label, value, onChange, dir, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void;
  dir?: "ltr" | "rtl"; placeholder?: string; type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} dir={dir} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function SaveBar({ onSave, isPending }: { onSave: () => void; isPending: boolean }) {
  return (
    <div className="flex justify-end pt-4 border-t mt-4">
      <Button onClick={onSave} disabled={isPending} className="min-w-28">
        {isPending ? (
          <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin ml-2" />جارٍ الحفظ...</>
        ) : (
          <><Save size={15} className="ml-1.5" />حفظ الإعدادات</>
        )}
      </Button>
    </div>
  );
}

function DbMissingAlert() {
  return (
    <Alert className="border-amber-200 bg-amber-50 text-amber-800 mb-4">
      <AlertTriangle size={16} />
      <AlertDescription className="text-sm">
        جدول الإعدادات غير موجود بعد. قم بتشغيل <code className="bg-amber-100 px-1 rounded">db/003_settings_branches.sql</code> في Supabase SQL Editor أولاً.
      </AlertDescription>
    </Alert>
  );
}

function ImageUploader({ label, url, onPick, onClear }: {
  label: string; url: string; onPick: (f: File) => void; onClear: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const displayUrl = url || null;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    onPick(f);
    e.target.value = "";
    setTimeout(() => setUploading(false), 1500);
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-4">
        <div className="h-24 w-24 rounded-xl border-2 border-dashed flex items-center justify-center bg-muted/30 overflow-hidden">
          {displayUrl ? (
            <img src={displayUrl} alt={label} className="h-full w-full object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <Upload className="text-muted-foreground" size={22} />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className="cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm hover:bg-muted transition-colors">
              <Upload size={14} /> {uploading ? "جارٍ الرفع..." : (displayUrl ? "تغيير الصورة" : "رفع صورة")}
            </span>
          </label>
          {displayUrl && (
            <button onClick={onClear}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm text-destructive hover:bg-destructive/5 transition-colors">
              <Trash2 size={14} /> حذف
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── School Tab ──────────────────────────────────────────────────────────────
const SCHOOL_INFO_ID = "00000000-0000-0000-0000-000000000001";

function SchoolTab() {
  const qc = useQueryClient();

  const defaults = {
    name_ar: "", name_en: "", desc_ar: "", desc_en: "",
    phone: "", email: "", address: "", website: "",
    logo_url: "", stamp_url: "",
    license_number: "", ministry_code: "",
  };

  const { data: dbData, isLoading, error } = useQuery({
    queryKey: ["school-info"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_info")
        .select("*")
        .eq("id", SCHOOL_INFO_ID)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
  });

  const [form, setForm] = useState(defaults);
  useEffect(() => { if (dbData) setForm({ ...defaults, ...dbData }); }, [dbData]);

  const save = useMutation({
    mutationFn: async (values: typeof defaults) => {
      const { error } = await supabase
        .from("school_info")
        .upsert({ id: SCHOOL_INFO_ID, ...values }, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["school-info"] });
      toast.success("تم حفظ بيانات المدرسة بنجاح");
    },
    onError: (err: any) => {
      toast.error("فشل الحفظ: " + (err?.message ?? "خطأ غير معروف"));
    },
  });

  function uploadFile(file: File, field: "logo_url" | "stamp_url") {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) return;
      setForm(f => ({ ...f, [field]: dataUrl }));
      toast.success("تم تحميل الصورة — اضغط حفظ لتأكيد التغييرات");
    };
    reader.readAsDataURL(file);
  }

  if (error?.message?.includes("42P01") || error?.code === "42P01") {
    return (
      <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm space-y-1">
        <p className="font-semibold">جدول school_info غير موجود بعد</p>
        <p>يرجى تنفيذ كود SQL الخاص بإنشاء الجدول في Supabase أولاً.</p>
      </div>
    );
  }

  return (
    <Card className="p-6 space-y-5">
      {isLoading && <div className="text-sm text-muted-foreground">جارٍ التحميل...</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="اسم المدرسة (عربي) *" value={form.name_ar} onChange={v => setForm({ ...form, name_ar: v })} placeholder="مدرسة النجاح" />
        <Field label="School Name (English)" value={form.name_en} onChange={v => setForm({ ...form, name_en: v })} dir="ltr" placeholder="Al-Najah School" />
        <div className="space-y-1.5">
          <Label>وصف المدرسة (عربي)</Label>
          <Textarea rows={3} value={form.desc_ar} placeholder="نبذة عن المدرسة..."
            onChange={(e) => setForm({ ...form, desc_ar: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>School Description (English)</Label>
          <Textarea rows={3} dir="ltr" value={form.desc_en} placeholder="Brief about the school..."
            onChange={(e) => setForm({ ...form, desc_en: e.target.value })} />
        </div>
        <Field label="رقم الهاتف" value={form.phone} onChange={v => setForm({ ...form, phone: v })} dir="ltr" placeholder="+967 X XXX XXXX" type="tel" />
        <Field label="البريد الإلكتروني" value={form.email} onChange={v => setForm({ ...form, email: v })} dir="ltr" type="email" placeholder="info@school.edu.ye" />
        <div className="md:col-span-2">
          <Field label="العنوان الكامل" value={form.address} onChange={v => setForm({ ...form, address: v })} placeholder="صنعاء، اليمن" />
        </div>
        <Field label="رابط الموقع الإلكتروني" value={form.website} onChange={v => setForm({ ...form, website: v })} dir="ltr" placeholder="https://school.edu.ye" />
        <Field label="رقم الرخصة / السجل" value={form.license_number} onChange={v => setForm({ ...form, license_number: v })} dir="ltr" placeholder="12345" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
        <ImageUploader label="شعار المدرسة (يظهر في رأس التقارير)" url={form.logo_url}
          onPick={(f) => uploadFile(f, "logo_url")}
          onClear={() => setForm({ ...form, logo_url: "" })} />
        <ImageUploader label="ختم المدرسة (يظهر في الوثائق الرسمية)" url={form.stamp_url}
          onPick={(f) => uploadFile(f, "stamp_url")}
          onClear={() => setForm({ ...form, stamp_url: "" })} />
      </div>

      <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs flex gap-2 items-start">
        <span className="font-bold shrink-0">ملاحظة:</span>
        <span>تُحفظ بيانات المدرسة في جدول <code className="bg-blue-100 px-1 rounded">school_info</code> وتظهر تلقائياً في رأس جميع التقارير المطبوعة.</span>
      </div>

      <SaveBar
        onSave={() => save.mutate(form)}
        isPending={save.isPending}
      />
    </Card>
  );
}

// ─── General Tab ─────────────────────────────────────────────────────────────
function GeneralTab() {
  const defaults = {
    academic_year: "2025/2026",
    school_start: "07:30",
    school_end: "14:00",
    periods_per_day: 7,
    period_duration: 45,
    break_duration: 20,
    study_days: ["sun", "mon", "tue", "wed", "thu"],
    currency: "YER",
    currency_symbol: "ر.ي",
    calendar: "gregorian" as "gregorian" | "hijri",
  };
  const { data, error, save } = useSettings("general", defaults);
  const [form, setForm] = useState(defaults);
  useEffect(() => setForm({ ...defaults, ...data }), [data]);

  const toggleDay = (d: string) =>
    setForm(f => ({ ...f, study_days: f.study_days.includes(d) ? f.study_days.filter(x => x !== d) : [...f.study_days, d] }));

  const CURRENCY_MAP: Record<string, string> = {
    YER: "ر.ي", SAR: "ر.س", USD: "$", EUR: "€", EGP: "ج.م", AED: "د.إ",
  };

  if (error?.message?.includes("42P01")) return <DbMissingAlert />;

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h3 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">السنة الدراسية</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>السنة الدراسية الحالية</Label>
            <Select value={form.academic_year} onValueChange={v => setForm({ ...form, academic_year: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ACADEMIC_YEARS.map(y => <SelectItem key={y.v} value={y.v}>{y.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>التقويم المستخدم</Label>
            <Select value={form.calendar} onValueChange={(v: any) => setForm({ ...form, calendar: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gregorian">ميلادي</SelectItem>
                <SelectItem value="hijri">هجري</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="border-t pt-5">
        <h3 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">أوقات الدوام</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label>بداية الدوام</Label>
            <Input type="time" value={form.school_start} onChange={(e) => setForm({ ...form, school_start: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>نهاية الدوام</Label>
            <Input type="time" value={form.school_end} onChange={(e) => setForm({ ...form, school_end: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>عدد الحصص اليومية</Label>
            <Input type="number" min="1" max="12" value={form.periods_per_day}
              onChange={(e) => setForm({ ...form, periods_per_day: Number(e.target.value) })} />
          </div>
          <div className="space-y-1.5">
            <Label>مدة الحصة (دقائق)</Label>
            <Input type="number" min="20" max="90" value={form.period_duration}
              onChange={(e) => setForm({ ...form, period_duration: Number(e.target.value) })} />
          </div>
        </div>
      </div>

      <div className="border-t pt-5">
        <h3 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">أيام الدراسة</h3>
        <div className="flex flex-wrap gap-3">
          {DAYS.map(d => (
            <label key={d.v} className={`flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border transition-colors ${
              form.study_days.includes(d.v) ? "bg-primary/10 border-primary text-primary" : "border-border hover:bg-muted"
            }`}>
              <Checkbox checked={form.study_days.includes(d.v)} onCheckedChange={() => toggleDay(d.v)}
                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
              <span className="text-sm font-medium">{d.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="border-t pt-5">
        <h3 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">العملة</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>العملة الافتراضية</Label>
            <Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v, currency_symbol: CURRENCY_MAP[v] ?? v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="YER">ريال يمني (ر.ي)</SelectItem>
                <SelectItem value="SAR">ريال سعودي (ر.س)</SelectItem>
                <SelectItem value="USD">دولار أمريكي ($)</SelectItem>
                <SelectItem value="EUR">يورو (€)</SelectItem>
                <SelectItem value="EGP">جنيه مصري (ج.م)</SelectItem>
                <SelectItem value="AED">درهم إماراتي (د.إ)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>رمز العملة المعروض</Label>
            <Input value={form.currency_symbol} onChange={e => setForm({ ...form, currency_symbol: e.target.value })} className="max-w-24" />
          </div>
        </div>
      </div>

      <SaveBar
        onSave={() =>
          save.mutate({
            section: "general",
            value: form
          })
        }
        isPending={save.isPending}
      />
    </Card>
  );
}

// ─── Users Tab ───────────────────────────────────────────────────────────────
function UsersTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: profiles, isLoading } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">المستخدمون والأدوار</h3>
          <p className="text-xs text-muted-foreground mt-1">عرض المستخدمين المسجلين وأدوارهم في النظام</p>
        </div>
        <Button onClick={() => setOpen(true)} size="sm">
          <Plus size={15} className="ml-1.5" /> تعيين دور
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>الاسم</TableHead>
              <TableHead>الدور</TableHead>
              <TableHead className="w-16">إجراء</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell>
              </TableRow>
            )}
            {!isLoading && (profiles ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">لا يوجد مستخدمون</TableCell>
              </TableRow>
            )}
            {(profiles ?? []).map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.full_name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={roleBadgeColor(p.role)}>{roleLabel(p.role)}</Badge>
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline"
                    onClick={async () => {
                      const next = prompt("الدور الجديد (admin/teacher/parent/student/accountant):", p.role);
                      if (!next || next === p.role) return;
                      const { error } = await supabase.from("profiles").update({ role: next }).eq("id", p.id);
                      if (error) { toast.error(error.message); return; }
                      qc.invalidateQueries({ queryKey: ["all-profiles"] });
                      toast.success("تم تحديث الدور");
                    }}>
                    تعديل
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {open && <AddRoleDialog onClose={() => setOpen(false)} profiles={profiles ?? []} />}
    </Card>
  );
}

function AddRoleDialog({ onClose, profiles }: { onClose: () => void; profiles: any[] }) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("teacher");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث الدور");
      qc.invalidateQueries({ queryKey: ["all-profiles"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>تعيين دور لمستخدم</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>المستخدم</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="اختر المستخدم..." /></SelectTrigger>
              <SelectContent>
                {profiles.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name ?? p.id} <span className="text-muted-foreground text-xs mr-2">({roleLabel(p.role)})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>الدور الجديد</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">مدير</SelectItem>
                <SelectItem value="teacher">معلم</SelectItem>
                <SelectItem value="parent">ولي أمر</SelectItem>
                <SelectItem value="student">طالب</SelectItem>
                <SelectItem value="accountant">محاسب</SelectItem>
                <SelectItem value="receptionist">موظف استقبال</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={() => save.mutate()} disabled={!userId || save.isPending}>
            {save.isPending ? "جارٍ الحفظ..." : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function roleLabel(r: string) {
  return ({ admin: "مدير", teacher: "معلم", accountant: "محاسب", receptionist: "موظف استقبال", parent: "ولي أمر", student: "طالب" } as any)[r] ?? r;
}

function roleBadgeColor(r: string) {
  const map: Record<string, string> = {
    admin: "bg-red-50 text-red-700 border-red-200",
    teacher: "bg-blue-50 text-blue-700 border-blue-200",
    parent: "bg-green-50 text-green-700 border-green-200",
    student: "bg-violet-50 text-violet-700 border-violet-200",
    accountant: "bg-amber-50 text-amber-700 border-amber-200",
    receptionist: "bg-cyan-50 text-cyan-700 border-cyan-200",
  };
  return map[r] ?? "";
}

// ─── Notify Tab ───────────────────────────────────────────────────────────────
function NotifyTab() {
  const defaults = {
    parents_enabled: true,
    absence: true,
    late_fees: true,
    exam_results: true,
    new_message: true,
    channel_sms: false,
    channel_whatsapp: false,
    channel_inapp: true,
    channel_email: false,
  };
  const { data, error, save } = useSettings("notify", defaults);
  const [form, setForm] = useState(defaults);
  useEffect(() => setForm({ ...defaults, ...data }), [data]);

  const SwitchRow = ({ label, desc, k }: { label: string; desc?: string; k: keyof typeof defaults }) => (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div>
        <Label className="cursor-pointer font-medium" htmlFor={k}>{label}</Label>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      <Switch id={k} checked={form[k] as boolean} onCheckedChange={(v) => setForm({ ...form, [k]: v })} />
    </div>
  );

  if (error?.message?.includes("42P01")) return <DbMissingAlert />;

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h3 className="font-semibold mb-1">أنواع الإشعارات</h3>
        <p className="text-xs text-muted-foreground mb-4">حدد الأحداث التي تُرسَل عنها إشعارات</p>
        <SwitchRow label="تفعيل إشعارات أولياء الأمور" desc="السماح بإرسال إشعارات لأولياء الأمور عموماً" k="parents_enabled" />
        <SwitchRow label="إشعارات الغياب" desc="إخطار ولي الأمر عند غياب الطالب" k="absence" />
        <SwitchRow label="إشعارات الرسوم المتأخرة" desc="تذكير بالمستحقات المالية" k="late_fees" />
        <SwitchRow label="إشعارات نتائج الاختبارات" desc="إخطار الطلاب وأولياء الأمور عند رصد الدرجات" k="exam_results" />
        <SwitchRow label="إشعارات الرسائل الجديدة" desc="إخطار عند استلام رسالة جديدة في النظام" k="new_message" />
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-1">قنوات الإرسال</h3>
        <p className="text-xs text-muted-foreground mb-4">الطرق المتاحة لإرسال الإشعارات</p>
        <SwitchRow label="إشعارات داخل التطبيق" desc="مُفعَّلة دائماً ومجانية" k="channel_inapp" />
        <SwitchRow label="بريد إلكتروني (Email)" desc="يتطلب إعداد خدمة SMTP" k="channel_email" />
        <SwitchRow label="رسائل SMS" desc="يتطلب الاشتراك في خدمة SMS" k="channel_sms" />
        <SwitchRow label="WhatsApp" desc="يتطلب الاشتراك في WhatsApp Business API" k="channel_whatsapp" />
      </Card>

      <SaveBar
        onSave={() =>
          save.mutate({
            section: "notify",
            value: form
          })
        }
        isPending={save.isPending}
      />
    </div>
  );
}

// ─── Backup Tab ───────────────────────────────────────────────────────────────
                  function BackupTab() {
                    const defaults = { auto: false, frequency: "weekly" as "daily" | "weekly" | "monthly" };
                    const { data, error, save } = useSettings("backup", defaults);
                    const [form, setForm] = useState(defaults);
                  useEffect(() => {
                    if (data && typeof data === "object") {
                      setForm({ ...defaults, ...data });
                    }
                  }, [data]);  

                    const { data: history, refetch, isLoading: histLoading } = useQuery({
                      queryKey: ["backups"],
                      queryFn: async () => {
                        const { data, error } = await supabase
                          .from("backups")
                          .select("*")
                          .order("created_at", { ascending: false })
                          .limit(20);
                        if (error) {
                          if (error.code === "42P01") return [];
                          throw error;
                        }
                        return data ?? [];
                      },
                    });

                    const createBackup = useMutation({
                      mutationFn: async () => {
                        const { error } = await supabase.from("backups").insert({ kind: "manual", size_bytes: 0, status: "completed" });
                        if (error) throw error;
                      },
                      onSuccess: () => { toast.success("تم إنشاء نسخة احتياطية ✓"); refetch(); },
                      onError: (e: any) => {
                        if (e.message?.includes("42P01")) {
                          toast.error("جدول النسخ الاحتياطية غير موجود — شغّل db/003_settings_branches.sql أولاً");
                        } else {
                          toast.error(e.message);
                        }
                      },
                    });

                    if (error?.message?.includes("42P01")) return <DbMissingAlert />;

                    return (
                      <div className="space-y-4">
                        <Card className="p-6 space-y-4">
                          <h3 className="font-semibold">النسخ الاحتياطي اليدوي</h3>
                          <div className="flex flex-wrap gap-2">
                            <Button onClick={() => createBackup.mutate()} disabled={createBackup.isPending}>
                              <Database size={15} className="ml-1.5" />
                              {createBackup.isPending ? "جارٍ الإنشاء..." : "إنشاء نسخة الآن"}
                            </Button>
                            <Button variant="outline"><Download size={15} className="ml-1.5" /> تحميل نسخة</Button>
                            <Button variant="outline"><RotateCcw size={15} className="ml-1.5" /> استعادة نسخة</Button>
                          </div>

                          <div className="pt-4 border-t space-y-4">
                            <h3 className="font-semibold">النسخ التلقائي</h3>
                            <div className="flex items-center justify-between p-3 rounded-lg border">
                              <div>
                                <Label className="font-medium">تفعيل النسخ التلقائي</Label>
                                <p className="text-xs text-muted-foreground mt-0.5">إنشاء نسخة احتياطية تلقائياً حسب الجدول المحدد</p>
                              </div>
                              <Switch checked={form.auto} onCheckedChange={(v) => setForm({ ...form, auto: v })} />
                            </div>
                            {form.auto && (
                              <div className="space-y-1.5 max-w-xs">
                                <Label>تكرار النسخ التلقائي</Label>
                                <Select value={form.frequency} onValueChange={(v: any) => setForm({ ...form, frequency: v })}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="daily">يومي</SelectItem>
                                    <SelectItem value="weekly">أسبوعي</SelectItem>
                                    <SelectItem value="monthly">شهري</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                        <Button
                    size="sm"
                    onClick={() =>
                      save.mutate({
                        section: "backup",
                        value: form
                      })
                    }
                    disabled={save.isPending}
                  >
                    <Save size={14} className="ml-1.5" />
                    حفظ إعدادات النسخ
                  </Button>    
                          </div>
                        </Card>

                        <Card className="p-0 overflow-hidden">
                          <div className="p-4 border-b">
                            <h3 className="font-semibold">سجل النسخ الاحتياطية</h3>
                          </div>
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead>التاريخ والوقت</TableHead>
                                <TableHead>الحجم</TableHead>
                                <TableHead>النوع</TableHead>
                                <TableHead>الحالة</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {histLoading && (
                                <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
                              )}
                              {!histLoading && (history ?? []).length === 0 && (
                                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">لا توجد نسخ احتياطية بعد</TableCell></TableRow>
                              )}
                              {(history ?? []).map((b: any) => (
                                <TableRow key={b.id}>
                                  <TableCell className="text-xs">{new Date(b.created_at).toLocaleString("ar-EG")}</TableCell>
                                  <TableCell className="text-sm">{b.size_bytes > 0 ? `${(b.size_bytes / 1024).toFixed(1)} KB` : "—"}</TableCell>
                                  <TableCell><Badge variant="outline">{b.kind === "auto" ? "تلقائي" : "يدوي"}</Badge></TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1">
                                      <CheckCircle2 size={11} />
                                      {b.status === "completed" ? "مكتمل" : b.status}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </Card>
                      </div>
                    );
                  }

// ─── System Tab ───────────────────────────────────────────────────────────────
function SystemTab() {
  const defaults = {
    language: "ar",
    timezone: "Asia/Aden",
    date_format: "dd/MM/yyyy",
    mode: "production" as "development" | "production",
    session_minutes: 60,
    auto_logout: true,
    maintenance_mode: false,
  };
  const { data, error, save } = useSettings("system", defaults);
  const [form, setForm] = useState(defaults);

  useEffect(() => {
    if (data && typeof data === "object") {
      setForm({ ...defaults, ...data });
    }
  }, [data]);

  if (error?.message?.includes("42P01")) return <DbMissingAlert />;

  return (
    <Card className="p-6 space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>اللغة الافتراضية</Label>
          <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ar">العربية (Arabic)</SelectItem>
              <SelectItem value="en">الإنجليزية (English)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>المنطقة الزمنية</Label>
          <Select value={form.timezone} onValueChange={(v) => setForm({ ...form, timezone: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Asia/Aden">اليمن — عدن / صنعاء (+03:00)</SelectItem>
              <SelectItem value="Asia/Riyadh">السعودية — الرياض (+03:00)</SelectItem>
              <SelectItem value="Asia/Dubai">الإمارات — دبي (+04:00)</SelectItem>
              <SelectItem value="Africa/Cairo">مصر — القاهرة (+02:00)</SelectItem>
              <SelectItem value="Asia/Baghdad">العراق — بغداد (+03:00)</SelectItem>
              <SelectItem value="Asia/Amman">الأردن — عمّان (+03:00)</SelectItem>
              <SelectItem value="Asia/Beirut">لبنان — بيروت (+02:00)</SelectItem>
              <SelectItem value="Africa/Tripoli">ليبيا — طرابلس (+02:00)</SelectItem>
              <SelectItem value="UTC">UTC +00:00</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>تنسيق التاريخ</Label>
          <Select value={form.date_format} onValueChange={(v) => setForm({ ...form, date_format: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="dd/MM/yyyy">31/12/2025 (يوم/شهر/سنة)</SelectItem>
              <SelectItem value="yyyy-MM-dd">2025-12-31 (ISO)</SelectItem>
              <SelectItem value="MM/dd/yyyy">12/31/2025 (شهر/يوم/سنة)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>وضع النظام</Label>
          <Select value={form.mode} onValueChange={(v: any) => setForm({ ...form, mode: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="production">إنتاج (Production)</SelectItem>
              <SelectItem value="development">تطوير (Development)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>مدة الجلسة (دقائق)</Label>
          <Input type="number" min="5" max="1440" value={form.session_minutes}
            onChange={(e) => setForm({ ...form, session_minutes: Number(e.target.value) })} />
          <p className="text-xs text-muted-foreground">بعد انتهاء المدة يتم تسجيل الخروج تلقائياً</p>
        </div>
      </div>

      <div className="space-y-3 pt-2 border-t">
        <div className="flex items-center justify-between p-3 rounded-lg border">
          <div>
            <Label className="font-medium" htmlFor="auto_logout">تسجيل خروج تلقائي</Label>
            <p className="text-xs text-muted-foreground mt-0.5">تسجيل الخروج عند انتهاء مدة الجلسة</p>
          </div>
          <Switch id="auto_logout" checked={form.auto_logout} onCheckedChange={(v) => setForm({ ...form, auto_logout: v })} />
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg border">
          <div>
            <Label className="font-medium" htmlFor="maintenance">وضع الصيانة</Label>
            <p className="text-xs text-muted-foreground mt-0.5">إيقاف الوصول مؤقتاً للمستخدمين غير المدراء</p>
          </div>
          <Switch id="maintenance" checked={form.maintenance_mode} onCheckedChange={(v) => setForm({ ...form, maintenance_mode: v })} />
        </div>
      </div>

      <SaveBar onSave={() => save.mutate(form)} isPending={save.isPending} />
    </Card>
  );
}

// ─── Theme Tab ────────────────────────────────────────────────────────────────
function ThemeTab() {
  const defaults = { primary_color: "#2563eb", mode: "light" as "light" | "dark", font_size: "medium" as "small" | "medium" | "large", logo_url: "" };
  const { data, error, save } = useSettings("theme", defaults);
  const [form, setForm] = useState(defaults);
  useEffect(() => setForm({ ...defaults, ...data }), [data]);

  const COLORS = [
    { v: "#2563eb", label: "أزرق" },
    { v: "#16a34a", label: "أخضر" },
    { v: "#dc2626", label: "أحمر" },
    { v: "#f59e0b", label: "برتقالي" },
    { v: "#8b5cf6", label: "بنفسجي" },
    { v: "#0891b2", label: "سماوي" },
    { v: "#db2777", label: "وردي" },
    { v: "#0f172a", label: "داكن" },
  ];

  function uploadLogo(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) return;
      setForm(f => ({ ...f, logo_url: dataUrl }));
      toast.success("تم تحميل الشعار — اضغط حفظ لتأكيد التغييرات");
    };
    reader.readAsDataURL(file);
  }

  if (error?.message?.includes("42P01")) return <DbMissingAlert />;

  return (
    <Card className="p-6 space-y-5">
      <div className="space-y-3">
        <Label className="font-semibold">اللون الأساسي للنظام</Label>
        <div className="flex flex-wrap gap-2">
          {COLORS.map(c => (
            <button key={c.v} onClick={() => setForm({ ...form, primary_color: c.v })}
              title={c.label}
              className={`h-10 w-10 rounded-xl border-2 transition-all ${
                form.primary_color === c.v ? "border-foreground ring-2 ring-offset-2 ring-foreground/20 scale-110" : "border-transparent hover:scale-105"
              }`}
              style={{ background: c.v }} />
          ))}
          <div className="flex items-center gap-2">
            <Input type="color" value={form.primary_color}
              onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
              className="h-10 w-14 p-1 cursor-pointer" title="لون مخصص" />
            <span className="text-xs text-muted-foreground">مخصص</span>
          </div>
        </div>
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
          <div className="h-6 w-6 rounded-full" style={{ background: form.primary_color }} />
          <span className="text-sm font-medium">اللون المختار: {form.primary_color}</span>
        </div>
      </div>

      <div className="space-y-3 border-t pt-4">
        <Label className="font-semibold">وضع العرض</Label>
        <div className="grid grid-cols-2 gap-2 max-w-xs">
          {(["light", "dark"] as const).map(m => (
            <button key={m} onClick={() => setForm({ ...form, mode: m })}
              className={`px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                form.mode === m ? "bg-primary text-primary-foreground border-primary shadow-sm" : "hover:bg-muted border-border"
              }`}>
              {m === "light" ? "☀️ نهاري" : "🌙 ليلي"}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Info size={12} /> وضع الليلي سيُطبَّق عند إضافة دعم الـ dark mode للمتصفح
        </p>
      </div>

      <div className="space-y-3 border-t pt-4">
        <Label className="font-semibold">حجم الخط</Label>
        <div className="flex gap-2">
          {([["small", "صغير"], ["medium", "متوسط"], ["large", "كبير"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setForm({ ...form, font_size: v })}
              className={`px-4 py-2 rounded-lg border text-sm transition-all ${
                form.font_size === v ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
              }`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="border-t pt-4">
        <ImageUploader label="شعار النظام (يظهر في أعلى الصفحة)"
          url={form.logo_url} onPick={uploadLogo} onClear={() => setForm({ ...form, logo_url: "" })} />
      </div>

      <SaveBar onSave={() => save.mutate(form)} isPending={save.isPending} />
    </Card>
  );
}

// ─── Account Tab ─────────────────────────────────────────────────────────────
function AccountTab({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({ full_name: "", phone: "", avatar_url: "" });
  useEffect(() => {
    if (profile) setForm({ full_name: profile.full_name ?? "", phone: profile.phone ?? "", avatar_url: profile.avatar_url ?? "" });
  }, [profile]);

  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState("");

  const saveProfile = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").update({ full_name: form.full_name, phone: form.phone }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم تحديث الملف الشخصي ✓"); qc.invalidateQueries({ queryKey: ["my-profile", userId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      if (passwords.next !== passwords.confirm) throw new Error("كلمتا المرور غير متطابقتين");
      if (passwords.next.length < 8) throw new Error("يجب أن تكون كلمة المرور 8 أحرف على الأقل");
      const { error } = await supabase.auth.updateUser({ password: passwords.next });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تغيير كلمة المرور ✓");
      setPasswords({ current: "", next: "", confirm: "" });
      setPwError("");
    },
    onError: (e: any) => { setPwError(e.message); toast.error(e.message); },
  });

  if (isLoading) return <Card className="p-8 text-center text-muted-foreground">جاري التحميل...</Card>;

  return (
    <div className="space-y-4">
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">معلومات الحساب الشخصي</h3>

        <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/40 border">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
            {form.full_name ? form.full_name.trim()[0] : "م"}
          </div>
          <div>
            <div className="font-semibold">{form.full_name || "—"}</div>
            <Badge variant="outline" className={roleBadgeColor(profile?.role ?? "")}>{roleLabel(profile?.role ?? "")}</Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="الاسم الكامل" value={form.full_name} onChange={v => setForm({ ...form, full_name: v })} placeholder="محمد أحمد" />
          <Field label="رقم الهاتف" value={form.phone} onChange={v => setForm({ ...form, phone: v })} dir="ltr" type="tel" placeholder="+967 7XX XXX XXX" />
        </div>

        <SaveBar onSave={() => saveProfile.mutate()} isPending={saveProfile.isPending} />
      </Card>

      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">تغيير كلمة المرور</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg">
          <div className="space-y-1.5 md:col-span-2">
            <Label>كلمة المرور الجديدة</Label>
            <Input type="password" value={passwords.next} onChange={e => setPasswords({ ...passwords, next: e.target.value })} placeholder="8 أحرف على الأقل" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>تأكيد كلمة المرور</Label>
            <Input type="password" value={passwords.confirm} onChange={e => setPasswords({ ...passwords, confirm: e.target.value })} placeholder="أعد إدخال كلمة المرور" />
          </div>
        </div>
        {pwError && (
          <p className="text-sm text-destructive flex items-center gap-1.5">
            <AlertTriangle size={14} /> {pwError}
          </p>
        )}
        <Button onClick={() => changePassword.mutate()} disabled={!passwords.next || !passwords.confirm || changePassword.isPending}>
          {changePassword.isPending ? "جارٍ التغيير..." : "تغيير كلمة المرور"}
        </Button>
      </Card>
    </div>
  );
}