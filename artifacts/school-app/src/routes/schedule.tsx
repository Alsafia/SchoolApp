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
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Plus, Trash2, Clock, CalendarDays, School, BookOpen,
  Users, GraduationCap, Timer, Loader2, Pencil, FileDown,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/schedule")({ component: Page });

// ─── Constants ─────────────────────────────────────────────────────────────────

const DAYS = [
  { v: 0, label: "الأحد",    short: "أحد",    color: "bg-violet-50 border-violet-200 text-violet-800",    head: "bg-violet-100",  print: "#ede9fe" },
  { v: 1, label: "الإثنين",  short: "الإثنين", color: "bg-blue-50 border-blue-200 text-blue-800",          head: "bg-blue-100",    print: "#dbeafe" },
  { v: 2, label: "الثلاثاء", short: "الثلاثاء", color: "bg-emerald-50 border-emerald-200 text-emerald-800", head: "bg-emerald-100", print: "#d1fae5" },
  { v: 3, label: "الأربعاء", short: "الأربعاء", color: "bg-amber-50 border-amber-200 text-amber-800",      head: "bg-amber-100",   print: "#fef3c7" },
  { v: 4, label: "الخميس",   short: "الخميس",  color: "bg-rose-50 border-rose-200 text-rose-800",          head: "bg-rose-100",    print: "#ffe4e6" },
];

const SUBJECT_COLORS = [
  "bg-blue-100 text-blue-900 border-blue-200",
  "bg-emerald-100 text-emerald-900 border-emerald-200",
  "bg-violet-100 text-violet-900 border-violet-200",
  "bg-amber-100 text-amber-900 border-amber-200",
  "bg-rose-100 text-rose-900 border-rose-200",
  "bg-cyan-100 text-cyan-900 border-cyan-200",
  "bg-indigo-100 text-indigo-900 border-indigo-200",
  "bg-orange-100 text-orange-900 border-orange-200",
];

const SUBJECT_PRINT_COLORS = [
  "#dbeafe", "#d1fae5", "#ede9fe", "#fef3c7", "#ffe4e6",
  "#cffafe", "#e0e7ff", "#ffedd5",
];

const DEFAULT_DURATION = 45;
const START_TIME = "08:00";
const MAX_PERIODS = 8;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function getPeriodTimes(periodNum: number, duration: number) {
  const start = addMinutes(START_TIME, (periodNum - 1) * duration);
  const end   = addMinutes(START_TIME,  periodNum      * duration);
  return { start, end };
}

// ─── PDF Print ─────────────────────────────────────────────────────────────────

const COLOR_FORCE = "-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;";

function printSchedule(
  className: string,
  schedules: any[],
  periodRows: { startTime: string; endTime: string; periodNum: number }[],
  subjectList: any[],
  schoolInfo: any,
) {
  const subjectPrintColor = (sid: string) => {
    const idx = subjectList.findIndex((s: any) => s?.id === sid);
    return SUBJECT_PRINT_COLORS[idx >= 0 ? idx % SUBJECT_PRINT_COLORS.length : 0] ?? "#f3f4f6";
  };

  // lookup[day][startTime] = schedule entry
  const lookup: Record<number, Record<string, any>> = {};
  schedules.forEach(s => {
    if (!lookup[s.day_of_week]) lookup[s.day_of_week] = {};
    lookup[s.day_of_week][s.start_time?.slice(0, 5)] = s;
  });

  const tableRows = periodRows.map(({ startTime, endTime, periodNum }) => {
    const cells = DAYS.map(d => {
      const cell = lookup[d.v]?.[startTime];
      if (!cell) {
        return `<td style="border:1px solid #d1d5db;padding:8px 6px;background:#fafafa;${COLOR_FORCE}"></td>`;
      }
      const bg = subjectPrintColor(cell.subject_id);
      return `<td style="border:1px solid #d1d5db;padding:8px 10px;background:${bg};${COLOR_FORCE}vertical-align:top;">
        <div style="font-weight:700;font-size:11pt;color:#111;">${cell.subjects?.name ?? "—"}</div>
        ${cell.teachers?.full_name
          ? `<div style="font-size:9pt;color:#444;margin-top:4px;">&#128100; ${cell.teachers.full_name}</div>`
          : ""}
        <div style="font-size:8pt;color:#666;margin-top:4px;direction:ltr;font-family:monospace;">${startTime} &ndash; ${endTime}</div>
      </td>`;
    }).join("");

    return `<tr>
      <td style="border:1px solid #d1d5db;background:#f3f4f6;${COLOR_FORCE}padding:8px 6px;text-align:center;white-space:nowrap;vertical-align:middle;">
        <div style="font-size:14pt;font-weight:800;color:#1e3a5f;">${periodNum}</div>
        <div style="font-size:8pt;color:#555;font-family:monospace;direction:ltr;">${startTime}</div>
        <div style="font-size:8pt;color:#555;font-family:monospace;direction:ltr;">${endTime}</div>
      </td>
      ${cells}
    </tr>`;
  }).join("");

  const dayHeaders = DAYS.map(d =>
    `<th style="border:1px solid #d1d5db;padding:10px 14px;background:${d.print};${COLOR_FORCE}font-size:12pt;font-weight:800;text-align:center;">${d.label}</th>`
  ).join("");

  // Subject legend
  const legendItems = subjectList
    .filter(Boolean)
    .map((s: any, i: number) => {
      const bg = SUBJECT_PRINT_COLORS[i % SUBJECT_PRINT_COLORS.length];
      return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;border:1px solid #ddd;background:${bg};${COLOR_FORCE}font-size:9pt;margin:2px 4px;">${s?.name ?? ""}</span>`;
    }).join("");

  // School info header
  const schoolName  = schoolInfo?.name_ar  || schoolInfo?.name_en  || "نظام إدارة المدرسة";
  const logoUrl     = schoolInfo?.logo_url  || "";
  const phone       = schoolInfo?.phone     || "";
  const address     = schoolInfo?.address   || "";
  const licenseNum  = schoolInfo?.license_number || "";

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="شعار المدرسة" style="height:70px;width:70px;object-fit:contain;border-radius:8px;" />`
    : `<div style="height:70px;width:70px;background:#1e3a5f;${COLOR_FORCE}border-radius:8px;display:flex;align-items:center;justify-content:center;">
         <span style="color:#fff;font-size:24pt;font-weight:800;">&#127979;</span>
       </div>`;

  const metaItems = [
    phone    && `&#128222; ${phone}`,
    address  && `&#128205; ${address}`,
    licenseNum && `&#128196; رقم الترخيص: ${licenseNum}`,
  ].filter(Boolean).join("&nbsp;&nbsp;|&nbsp;&nbsp;");

  const printDate = new Date().toLocaleDateString("ar-SA", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title> جدول الحصص  &mdash; ${schoolName} &mdash; ${className}</title>
  <style>
    *, *::before, *::after {
      margin: 0; padding: 0; box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    html, body {
      font-family: "Segoe UI", Arial, sans-serif;
      direction: rtl;
      color: #111;
      font-size: 11pt;
      background: #fff;
    }
    @page {
      size: A4 landscape;
      margin: 12mm 10mm;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
    body { padding: 10mm 12mm; }

    /* ── Header ── */
    .header {
      display: flex;
      align-items: center;
      gap: 16px;
      border-bottom: 3px solid #1e3a5f;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .header-info { flex: 1; }
    .school-name {
      font-size: 18pt;
      font-weight: 800;
      color: #1e3a5f;
      margin-bottom: 4px;
    }
    .school-meta { font-size: 9pt; color: #555; margin-bottom: 6px; }
    .doc-title {
      font-size: 13pt;
      font-weight: 700;
      color: #374151;
    }
    .class-badge {
      display: inline-block;
      background: #1e3a5f;
      ${COLOR_FORCE}
      color: #fff;
      padding: 2px 12px;
      border-radius: 20px;
      font-size: 10pt;
      font-weight: 700;
      margin-right: 8px;
    }
    .date-badge {
      display: inline-block;
      background: #f3f4f6;
      ${COLOR_FORCE}
      color: #374151;
      padding: 2px 12px;
      border-radius: 20px;
      font-size: 9pt;
    }

    /* ── Table ── */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
    }
    th {
      border: 1px solid #d1d5db;
      padding: 10px;
      text-align: center;
      font-weight: 800;
      font-size: 12pt;
    }
    td { border: 1px solid #d1d5db; }

    /* ── Footer ── */
    .footer {
      border-top: 1px solid #e5e7eb;
      padding-top: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8.5pt;
      color: #777;
    }
    .legend { margin-bottom: 10px; }
    .legend-title { font-size: 9pt; font-weight: 700; color: #555; margin-bottom: 4px; }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    ${logoHtml}
    <div class="header-info">
      <div class="school-name">${schoolName}</div>
      ${metaItems ? `<div class="school-meta">${metaItems}</div>` : ""}
      <div class="doc-title">
         جدول الحصص الأسبوعي 
        <span class="class-badge">${className}</span>
        <span class="date-badge">${printDate}</span>
      </div>
    </div>
    <div style="text-align:center;font-size:9pt;color:#555;white-space:nowrap;">
      <div style="font-size:22pt;font-weight:800;color:#1e3a5f;">${schedules.length}</div>
      <div>حصة يومياً</div>
      <div style="margin-top:4px;">${periodRows.length} فترة</div>
    </div>
  </div>

  <!-- Timetable -->
  <table>
    <thead>
      <tr>
        <th style="border:1px solid #d1d5db;background:#1e3a5f;${COLOR_FORCE}color:#fff;width:72px;font-size:11pt;">الحصة</th>
        ${dayHeaders}
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  <!-- Legend -->
  ${subjectList.length > 0 ? `
  <div class="legend">
    <div class="legend-title">&#128218; المواد الدراسية:</div>
    ${legendItems}
  </div>` : ""}

  <!-- Footer -->
  <div class="footer">
    <span>${schoolName}</span>
    <span>${className} &nbsp;|&nbsp; ${schedules.length} حصة يومياً</span>
    <span>طُبع بتاريخ: ${printDate}</span>
  </div>

</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) { toast.error("يرجى السماح بالنوافذ المنبثقة"); return; }
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 700);
}

// ─── Page ──────────────────────────────────────────────────────────────────────

function Page() {
  const { user, loading, hasRole } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  return (
    <AppShell>
      <ScheduleView canEdit={hasRole("admin")} />
    </AppShell>
  );
}

// ─── Schedule View ─────────────────────────────────────────────────────────────

function ScheduleView({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [stageId,  setStageId]  = useState("");
  const [classId,  setClassId]  = useState("");
  const [addOpen,  setAddOpen]  = useState(false);
  const [editing,  setEditing]  = useState<any | null>(null);

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

  const { data: schoolInfo } = useQuery({
    queryKey: ["school-info"],
    queryFn: async () => {
      const { data } = await supabase
        .from("school_info")
        .select("name_ar, name_en, logo_url, phone, address, license_number")
        .eq("id", "00000000-0000-0000-0000-000000000001")
        .maybeSingle();
      return data ?? null;
    },
  });

  const { data: schedules = [], isLoading: loadingSchedules } = useQuery({
    queryKey: ["schedules", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedules")
        .select("*, subjects(name, id), teachers(full_name, id)")
        .eq("class_id", classId)
        .order("day_of_week")
        .order("start_time");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف الحصة");
      qc.invalidateQueries({ queryKey: ["schedules"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filteredClasses = useMemo(
    () => stageId ? (allClasses ?? []).filter((c: any) => c.stage_id === stageId) : (allClasses ?? []),
    [allClasses, stageId]
  );

  const selectedClass = (allClasses ?? []).find((c: any) => c.id === classId);
  const className = selectedClass
    ? `${selectedClass.name}${selectedClass.section ? ` / ${selectedClass.section}` : ""}`
    : "";

  // Build subject→color + subject list for legend / PDF
  const { subjectColorMap, subjectList } = useMemo(() => {
    const map: Record<string, string> = {};
    const list: any[] = [];
    let i = 0;
    for (const s of schedules) {
      const sid = s.subject_id;
      if (sid && !map[sid]) {
        map[sid] = SUBJECT_COLORS[i++ % SUBJECT_COLORS.length];
        list.push(s.subjects);
      }
    }
    return { subjectColorMap: map, subjectList: list };
  }, [schedules]);

  // Build timetable grid rows from unique start_times (sorted)
  const { periodRows, lookup } = useMemo(() => {
    const startTimeSet = new Set<string>();
    const endTimeMap: Record<string, string> = {};
    schedules.forEach((s: any) => {
      const st = s.start_time?.slice(0, 5);
      const et = s.end_time?.slice(0, 5);
      if (st) { startTimeSet.add(st); endTimeMap[st] = et ?? ""; }
    });
    const sorted = Array.from(startTimeSet).sort();
    const rows = sorted.map((st, idx) => ({
      startTime: st,
      endTime: endTimeMap[st],
      periodNum: idx + 1,
    }));

    // lookup[dayOfWeek][startTime] = schedule entry
    const lkp: Record<number, Record<string, any>> = {};
    schedules.forEach((s: any) => {
      const st = s.start_time?.slice(0, 5);
      if (!lkp[s.day_of_week]) lkp[s.day_of_week] = {};
      if (st) lkp[s.day_of_week][st] = s;
    });
    return { periodRows: rows, lookup: lkp };
  }, [schedules]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="text-primary" size={26} />
            الجداول الدراسية
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            بناء وعرض الجدول الأسبوعي لكل صف
          </p>
        </div>

        <div className="flex gap-2">
          {classId && schedules.length > 0 && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => printSchedule(className, schedules, periodRows, subjectList, schoolInfo)}
            >
              <FileDown size={15} /> تصدير PDF
            </Button>
          )}
          {canEdit && classId && (
            <Button className="gap-2 shadow" onClick={() => setAddOpen(true)}>
              <Plus size={16} /> حصة جديدة
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <School size={15} className="text-primary" />
          <span className="text-sm font-semibold">اختيار الصف</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">المرحلة الدراسية</Label>
            <Select
              value={stageId || "__all"}
              onValueChange={v => { setStageId(v === "__all" ? "" : v); setClassId(""); }}
            >
              <SelectTrigger className="h-9">
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
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">الصف الدراسي</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="اختر الصف..." />
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
        </div>

        {selectedClass && schedules.length > 0 && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t flex-wrap">
            <Badge variant="secondary" className="gap-1">
              <GraduationCap size={11} />
              {className}
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <Clock size={11} /> {schedules.length} حصة أسبوعياً
            </Badge>
          </div>
        )}
      </Card>

      {/* Body */}
      {!classId ? (
        <Card className="p-16 text-center text-muted-foreground">
          <CalendarDays className="mx-auto mb-3 opacity-20" size={52} />
          <p className="text-lg font-medium">اختر الصف الدراسي</p>
          <p className="text-sm mt-1 opacity-70">لعرض الجدول الأسبوعي وإدارة الحصص</p>
        </Card>
      ) : loadingSchedules ? (
        <Card className="p-16 text-center text-muted-foreground">
          <Loader2 className="mx-auto mb-3 animate-spin opacity-40" size={36} />
          <p>جارٍ تحميل الجدول...</p>
        </Card>
      ) : schedules.length === 0 ? (
        <Card className="p-16 text-center text-muted-foreground">
          <CalendarDays className="mx-auto mb-3 opacity-20" size={52} />
          <p className="text-lg font-medium">لا توجد حصص بعد</p>
          {canEdit && (
            <Button className="mt-4 gap-2" onClick={() => setAddOpen(true)}>
              <Plus size={15} /> إضافة أول حصة
            </Button>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" dir="rtl">
              <thead>
                <tr>
                  <th className="bg-muted/60 border border-border px-3 py-3 text-center font-bold text-muted-foreground w-[80px] whitespace-nowrap">
                    الحصة
                  </th>
                  {DAYS.map(d => (
                    <th key={d.v} className={`border border-border px-3 py-3 text-center font-bold ${d.head}`}>
                      {d.label}
                      <div className="text-xs font-normal text-muted-foreground mt-0.5">
                        {Object.keys(lookup[d.v] ?? {}).length} حصص
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periodRows.map(({ startTime, endTime, periodNum }) => (
                  <tr key={startTime} className="hover:bg-muted/10 transition-colors">
                    {/* Period number + time */}
                    <td className="border border-border bg-muted/40 text-center py-2 px-1">
                      <div className="text-base font-bold text-foreground">{periodNum}</div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5" dir="ltr">
                        {startTime}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono" dir="ltr">
                        {endTime}
                      </div>
                    </td>

                    {/* Day cells */}
                    {DAYS.map(d => {
                      const cell = lookup[d.v]?.[startTime];
                      if (!cell) {
                        return (
                          <td key={d.v} className="border border-border py-2 px-2 text-center align-middle">
                            {canEdit && (
                              <button
                                onClick={() => setAddOpen(true)}
                                className="opacity-0 hover:opacity-100 group-hover:opacity-100 text-xs text-muted-foreground hover:text-primary transition-opacity"
                                title="إضافة حصة"
                              >
                                —
                              </button>
                            )}
                            {!canEdit && <span className="text-xs text-muted-foreground opacity-30">—</span>}
                          </td>
                        );
                      }
                      const colorClass = subjectColorMap[cell.subject_id] ?? SUBJECT_COLORS[0];
                      return (
                        <td key={d.v} className="border border-border p-1.5 align-top">
                          <div className={`rounded-lg border px-2.5 py-2 relative group h-full ${colorClass}`}>
                            <div className="font-semibold text-sm leading-tight">
                              {cell.subjects?.name ?? "—"}
                            </div>
                            {cell.teachers?.full_name && (
                              <div className="flex items-center gap-1 mt-1 text-xs opacity-70">
                                <Users size={9} />
                                {cell.teachers.full_name}
                              </div>
                            )}
                            <div className="flex items-center gap-1 mt-1 text-[10px] font-mono opacity-60" dir="ltr">
                              <Clock size={8} />
                              {startTime} – {endTime}
                            </div>

                            {/* Action buttons on hover */}
                            {canEdit && (
                              <div className="absolute top-1 left-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                                <button
                                  onClick={() => setEditing(cell)}
                                  className="p-1 rounded bg-white/70 hover:bg-blue-100 transition-colors"
                                  title="تعديل"
                                >
                                  <Pencil size={10} className="text-blue-600" />
                                </button>
                                <button
                                  onClick={() => del.mutate(cell.id)}
                                  disabled={del.isPending}
                                  className="p-1 rounded bg-white/70 hover:bg-red-100 transition-colors"
                                  title="حذف"
                                >
                                  <Trash2 size={10} className="text-destructive" />
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Subject legend */}
          {subjectList.length > 0 && (
            <div className="p-3 border-t bg-muted/20 flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground font-medium ml-1">المواد:</span>
              {subjectList.map((s: any, i: number) => s && (
                <span
                  key={s.id ?? i}
                  className={`px-2.5 py-0.5 rounded-full border text-xs font-medium ${SUBJECT_COLORS[i % SUBJECT_COLORS.length]}`}
                >
                  {s.name}
                </span>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Add Dialog */}
      {addOpen && (
        <AddScheduleDialog
          classId={classId}
          schedules={schedules}
          onClose={() => setAddOpen(false)}
        />
      )}

      {/* Edit Dialog */}
      {editing && (
        <EditScheduleDialog
          entry={editing}
          classId={classId}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ─── Add Schedule Dialog ───────────────────────────────────────────────────────
// One entry at a time: period slot → subject → teacher → Add

function AddScheduleDialog({
  classId,
  schedules,
  onClose,
}: {
  classId: string;
  schedules: any[];
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const [day,        setDay]        = useState("0");
  const [duration,   setDuration]   = useState(DEFAULT_DURATION);
  const [periodNum,  setPeriodNum]  = useState<string>("");
  const [subjectId,  setSubjectId]  = useState("");
  const [teacherId,  setTeacherId]  = useState("");

  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects-by-class-sched", classId],
    queryFn: async () => {
      const { data } = await supabase.from("subjects").select("id, name").eq("class_id", classId).order("name");
      return data ?? [];
    },
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["teachers-list"],
    queryFn: async () => {
      const { data } = await supabase.from("teachers").select("id, full_name").eq("status", "active").order("full_name");
      return data ?? [];
    },
  });

  // Used start_times and subject_ids for selected day
  const { usedStartTimes, usedSubjectIds } = useMemo(() => {
    const daySchedules = schedules.filter((s: any) => s.day_of_week === Number(day));
    return {
      usedStartTimes:  new Set(daySchedules.map((s: any) => s.start_time?.slice(0, 5))),
      usedSubjectIds:  new Set(daySchedules.map((s: any) => s.subject_id)),
    };
  }, [schedules, day]);

  // Available periods: 1..MAX_PERIODS, hiding those whose start_time is already used
  const availablePeriods = useMemo(() => {
    return Array.from({ length: MAX_PERIODS }, (_, i) => {
      const num = i + 1;
      const { start } = getPeriodTimes(num, duration);
      return { num, start, used: usedStartTimes.has(start) };
    }).filter(p => !p.used);
  }, [duration, usedStartTimes]);

  // Available subjects: exclude those already in this day
  const availableSubjects = useMemo(
    () => (subjects as any[]).filter((s: any) => !usedSubjectIds.has(s.id)),
    [subjects, usedSubjectIds]
  );

  // Computed times for selected period
  const times = periodNum
    ? getPeriodTimes(Number(periodNum), duration)
    : null;

  const add = useMutation({
    mutationFn: async () => {
      if (!periodNum) throw new Error("يرجى اختيار الفترة الدراسية");
      if (!subjectId)  throw new Error("يرجى اختيار المادة");

      const { start, end } = getPeriodTimes(Number(periodNum), duration);

      // Server-side conflict check
      const existingConflict = schedules.some(
        (s: any) =>
          s.day_of_week === Number(day) &&
          s.start_time?.slice(0, 5) === start
      );
      if (existingConflict)
        throw new Error(`الفترة ${periodNum} مستخدمة مسبقاً في هذا اليوم`);

      const { error } = await supabase.from("schedules").insert({
        class_id:        classId,
        day_of_week:     Number(day),
        subject_id:      subjectId,
        teacher_id:      teacherId || null,
        start_time:      start,
        end_time:        end,
        period_duration: duration,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تمت إضافة الحصة ✓");
      qc.invalidateQueries({ queryKey: ["schedules"] });
      // Reset form but keep dialog open for next entry
      setPeriodNum("");
      setSubjectId("");
      setTeacherId("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const allPeriodsUsed = availablePeriods.length === 0;

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <CalendarDays size={18} className="text-primary" />
            إضافة حصة للجدول
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* Row 1: Day + Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm flex items-center gap-1.5">
                <CalendarDays size={13} className="text-primary" /> اليوم
              </Label>
              <Select value={day} onValueChange={v => { setDay(v); setPeriodNum(""); setSubjectId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAYS.map(d => (
                    <SelectItem key={d.v} value={String(d.v)}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm flex items-center gap-1.5">
                <Timer size={13} className="text-primary" /> مدة الحصة (دقيقة)
              </Label>
              <Input
                type="number"
                min={10} max={120} step={5}
                value={duration}
                onChange={e => {
                  const v = Number(e.target.value);
                  if (v >= 10 && v <= 120) { setDuration(v); setPeriodNum(""); }
                }}
                className="text-center font-semibold"
              />
            </div>
          </div>

          {/* Row 2: Period selector */}
          <div className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1.5">
              <Clock size={13} className="text-primary" /> الفترة الدراسية
              <span className="text-destructive">*</span>
            </Label>
            {allPeriodsUsed ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                جميع الفترات مستخدمة لهذا اليوم
              </div>
            ) : (
              <Select value={periodNum} onValueChange={setPeriodNum}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الفترة..." />
                </SelectTrigger>
                <SelectContent>
                  {availablePeriods.map(p => (
                    <SelectItem key={p.num} value={String(p.num)}>
                      <span className="font-semibold ml-1">حصة {p.num}</span>
                      <span className="text-muted-foreground text-xs mr-2 font-mono" dir="ltr">
                        {p.start} ← {getPeriodTimes(p.num, duration).end}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Time preview for selected period */}
          {times && (
            <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-4 py-2.5">
              <Clock size={14} className="text-primary shrink-0" />
              <span className="text-sm">
                وقت الحصة {periodNum}:
                <span className="font-mono font-bold text-primary mx-2" dir="ltr">
                  {times.start} – {times.end}
                </span>
                ({duration} دقيقة)
              </span>
            </div>
          )}

          {/* Row 3: Subject */}
          <div className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1.5">
              <BookOpen size={13} className="text-primary" /> المادة الدراسية
              <span className="text-destructive">*</span>
            </Label>
            {availableSubjects.length === 0 ? (
              <div className="rounded-lg border border-muted px-4 py-3 text-sm text-muted-foreground">
                لا توجد مواد متاحة لهذا اليوم
              </div>
            ) : (
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر المادة..." />
                </SelectTrigger>
                <SelectContent>
                  {availableSubjects.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Row 4: Teacher */}
          <div className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1.5">
              <Users size={13} className="text-primary" /> المعلم
            </Label>
            <Select value={teacherId} onValueChange={setTeacherId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر المعلم (اختياري)..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">بدون معلم</SelectItem>
                {(teachers as any[]).map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
          <Button
            onClick={() => add.mutate()}
            disabled={add.isPending || !periodNum || !subjectId || allPeriodsUsed}
            className="gap-2 min-w-[120px]"
          >
            {add.isPending
              ? <><Loader2 size={14} className="animate-spin" /> جارٍ الحفظ...</>
              : <><Plus size={14} /> إضافة الحصة</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Schedule Dialog ─────────────────────────────────────────────────────

function EditScheduleDialog({
  entry,
  classId,
  onClose,
}: {
  entry: any;
  classId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [subjectId, setSubjectId] = useState(entry.subject_id ?? "");
  const [teacherId, setTeacherId] = useState(entry.teacher_id ?? "");

  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects-by-class-sched", classId],
    queryFn: async () => {
      const { data } = await supabase.from("subjects").select("id, name").eq("class_id", classId).order("name");
      return data ?? [];
    },
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["teachers-list"],
    queryFn: async () => {
      const { data } = await supabase.from("teachers").select("id, full_name").eq("status", "active").order("full_name");
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!subjectId) throw new Error("يرجى اختيار المادة");
      const { error } = await supabase.from("schedules")
        .update({
          subject_id: subjectId,
          teacher_id: teacherId && teacherId !== "__none" ? teacherId : null,
        })
        .eq("id", entry.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث الحصة ✓");
      qc.invalidateQueries({ queryKey: ["schedules"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const dayLabel = DAYS.find(d => d.v === entry.day_of_week)?.label ?? "";

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Pencil size={16} className="text-primary" />
            تعديل الحصة
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Info badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary">{dayLabel}</Badge>
            <Badge variant="outline" className="font-mono" dir="ltr">
              {entry.start_time?.slice(0, 5)} – {entry.end_time?.slice(0, 5)}
            </Badge>
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1.5">
              <BookOpen size={13} className="text-primary" /> المادة الدراسية
            </Label>
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger><SelectValue placeholder="اختر المادة..." /></SelectTrigger>
              <SelectContent>
                {(subjects as any[]).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Teacher */}
          <div className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1.5">
              <Users size={13} className="text-primary" /> المعلم
            </Label>
            <Select value={teacherId || "__none"} onValueChange={v => setTeacherId(v === "__none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="اختر المعلم..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">بدون معلم</SelectItem>
                {(teachers as any[]).map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !subjectId}
            className="gap-2 min-w-[100px]"
          >
            {save.isPending
              ? <><Loader2 size={14} className="animate-spin" /> جارٍ...</>
              : "حفظ التعديل"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}