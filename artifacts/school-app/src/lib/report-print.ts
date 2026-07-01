export interface PrintReportOptions {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number)[][];
  totals?: { label: string; value: string }[];
  filters?: { label: string; value: string }[];
  recordCount?: number;
  schoolNameAr?: string;
  schoolNameEn?: string;
  schoolDescAr?: string;
  schoolDescEn?: string;
  schoolLogoUrl?: string;
  academicYear?: string;
  branch?: string;
}

export function printReport(opts: PrintReportOptions) {
  const {
    title,
    subtitle,
    headers,
    rows,
    totals,
    filters,
    recordCount,
    schoolNameAr = "نظام إدارة المدرسة",
    schoolNameEn = "School Management System",
    schoolDescAr = "",
    schoolDescEn = "",
    schoolLogoUrl = "",
    academicYear = "",
    branch = "",
  } = opts;

  const now = new Date();
  const dateStrAr = now.toLocaleDateString("ar-EG", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });
  const dateStrShort = now.toLocaleDateString("ar-EG", {
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const timeStr = now.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });

  const logoHtml = schoolLogoUrl
    ? `<img src="${schoolLogoUrl}" alt="شعار المدرسة" style="width:72px;height:72px;object-fit:contain;border-radius:10px;" />`
    : `<div style="width:72px;height:72px;background:#1d4ed8;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:30px;font-weight:900;">${schoolNameAr.trim()[0] ?? "م"}</div>`;

  const filtersHtml = filters && filters.length > 0
    ? `<div class="filters-bar">
        <span class="filters-label">فلاتر التقرير:</span>
        ${filters.map(f => `<span class="filter-chip"><b>${f.label}:</b> ${f.value}</span>`).join("")}
       </div>`
    : "";

  const totalsHtml = totals && totals.length > 0
    ? `<div class="summary-box">
        <div class="summary-title">الملخص الإجمالي</div>
        <div class="summary-grid">
          ${totals.map(t => `<div class="summary-item"><span class="summary-key">${t.label}</span><span class="summary-val">${t.value}</span></div>`).join("")}
        </div>
       </div>`
    : "";

  const docTitle = `${title} - ${dateStrShort}`;

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${docTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      font-family: 'Cairo', 'Segoe UI', Arial, sans-serif;
      direction: rtl;
      background: #fff;
      color: #111827;
      font-size: 13px;
      line-height: 1.6;
    }
    @page { size: A4; margin: 15mm 12mm 15mm 12mm; }
    .page { max-width: 210mm; margin: 0 auto; padding: 0; }

    /* ── Header 3-column ── */
    .report-header {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 12px;
      border-bottom: 3px solid #1d4ed8;
      padding-bottom: 14px;
      margin-bottom: 16px;
    }
    .hdr-ar {
      text-align: right;
    }
    .hdr-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .hdr-en {
      text-align: left;
      direction: ltr;
    }
    .school-name-ar {
      font-size: 18px;
      font-weight: 800;
      color: #1e3a8a;
      line-height: 1.3;
    }
    .school-desc-ar {
      font-size: 10.5px;
      color: #4b5563;
      margin-top: 3px;
      line-height: 1.5;
    }
    .school-name-en {
      font-size: 14px;
      font-weight: 700;
      color: #1e3a8a;
      line-height: 1.3;
    }
    .school-desc-en {
      font-size: 10px;
      color: #4b5563;
      margin-top: 3px;
      line-height: 1.5;
    }
    .hdr-meta {
      font-size: 10px;
      color: #6b7280;
      margin-top: 6px;
      line-height: 1.8;
    }

    /* ── Report Title ── */
    .report-title-section {
      text-align: center;
      margin-bottom: 14px;
      padding: 10px;
      background: linear-gradient(135deg, #eff6ff, #dbeafe);
      border-radius: 8px;
      border: 1px solid #bfdbfe;
    }
    .report-main-title { font-size: 17px; font-weight: 800; color: #1e40af; }
    .report-subtitle { font-size: 12px; color: #3b82f6; margin-top: 3px; }
    .report-datetime { font-size: 11px; color: #6b7280; margin-top: 4px; }

    /* ── Filters bar ── */
    .filters-bar {
      display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
      margin-bottom: 12px; padding: 8px 10px;
      background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 11px;
    }
    .filters-label { font-weight: 700; color: #374151; margin-left: 4px; }
    .filter-chip { background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 20px; font-size: 10px; }

    /* ── Table ── */
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11.5px; }
    thead tr { background: #1d4ed8; color: #fff; }
    th { padding: 9px 10px; text-align: right; font-weight: 700; font-size: 12px; white-space: nowrap; }
    td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; vertical-align: middle; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    .no-data { text-align: center; color: #9ca3af; padding: 30px; font-size: 13px; }

    /* ── Summary box ── */
    .summary-box {
      margin-top: 16px; padding: 12px 16px;
      background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px;
    }
    .summary-title {
      font-size: 13px; font-weight: 800; color: #0369a1;
      margin-bottom: 10px; border-bottom: 1px solid #bae6fd; padding-bottom: 6px;
    }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    .summary-item { display: flex; flex-direction: column; gap: 2px; }
    .summary-key { font-size: 10px; color: #6b7280; }
    .summary-val { font-size: 14px; font-weight: 800; color: #1e40af; }

    /* ── Record badge ── */
    .record-badge {
      display: inline-block; background: #dbeafe; color: #1e40af;
      font-size: 11px; font-weight: 700; padding: 3px 10px;
      border-radius: 20px; margin-bottom: 8px;
    }

    /* ── Footer ── */
    .report-footer {
      margin-top: 20px; padding-top: 10px; border-top: 2px solid #e5e7eb;
      display: flex; justify-content: space-between; align-items: center;
      font-size: 10px; color: #9ca3af;
    }
    .footer-center { text-align: center; font-style: italic; }

    @media print {
      .no-print { display: none !important; }
      .page { padding: 0; }
      body { font-size: 11px; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; page-break-after: auto; }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="report-header">
    <!-- RIGHT: Arabic info -->
    <div class="hdr-ar">
      <div class="school-name-ar">${schoolNameAr}</div>
      ${schoolDescAr ? `<div class="school-desc-ar">${schoolDescAr}</div>` : ""}
    </div>

    <!-- CENTER: Logo -->
    <div class="hdr-center">
      ${logoHtml}
      ${academicYear ? `<div style="font-size:10px;color:#6b7280;margin-top:4px;">العام: ${academicYear}</div>` : ""}
      ${branch ? `<div style="font-size:10px;color:#6b7280;">الفرع: ${branch}</div>` : ""}
    </div>

    <!-- LEFT: English info + date -->
    <div class="hdr-en">
      <div class="school-name-en">${schoolNameEn}</div>
      ${schoolDescEn ? `<div class="school-desc-en">${schoolDescEn}</div>` : ""}
      <div class="hdr-meta">
        <div>${dateStrAr}</div>
        <div>الوقت: ${timeStr}</div>
      </div>
    </div>
  </div>

  <!-- Title section -->
  <div class="report-title-section">
    <div class="report-main-title">${title}</div>
    ${subtitle ? `<div class="report-subtitle">${subtitle}</div>` : ""}
    <div class="report-datetime">تاريخ الإصدار: ${dateStrAr} — الساعة ${timeStr}</div>
  </div>

  ${filtersHtml}

  ${recordCount !== undefined ? `<div class="record-badge">إجمالي السجلات: ${recordCount}</div>` : ""}

  <!-- Table -->
  <table>
    <thead>
      <tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${rows.length === 0
        ? `<tr><td colspan="${headers.length}" class="no-data">لا توجد بيانات مطابقة للفلاتر المحددة</td></tr>`
        : rows.map(row => `<tr>${row.map(cell => `<td>${cell ?? "—"}</td>`).join("")}</tr>`).join("")
      }
    </tbody>
  </table>

  ${totalsHtml}

  <!-- Footer -->
  <div class="report-footer">
    <span>${schoolNameAr}</span>
    <span class="footer-center">تم إنشاء هذا التقرير بواسطة نظام إدارة المدرسة</span>
    <span>طباعة: ${dateStrShort}</span>
  </div>

</div>

<script>
  window.onload = function() {
    setTimeout(function() { window.print(); }, 800);
  };
</script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=900,height=700,scrollbars=yes");
  if (!w) {
    alert("الرجاء السماح للنافذة المنبثقة في إعدادات المتصفح ثم حاول مجدداً");
    return;
  }
  w.document.write(html);
  w.document.close();
}
