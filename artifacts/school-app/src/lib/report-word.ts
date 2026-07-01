export interface WordReportOptions {
  title: string;
  subtitle?: string;
  metaRows?: { label: string; value: string }[];
  headers: string[];
  rows: (string | number | null)[][];
  sumColIndexes?: number[];
  totalColIndex?: number;
  fileName?: string;
}

export function exportWord(opts: WordReportOptions) {
  const { title, subtitle, metaRows, headers, rows, sumColIndexes = [], totalColIndex, fileName } = opts;

  const metaHtml = metaRows
    ? `<table class="meta-table"><tbody>
        ${metaRows.map(r => `<tr><td class="meta-label">${r.label}</td><td class="meta-value">${r.value}</td></tr>`).join("")}
      </tbody></table>`
    : "";

  const headerHtml = headers.map(h => `<th>${h}</th>`).join("");

  const rowsHtml = rows.map(row =>
    `<tr>${row.map((cell, i) => {
      let cls = "";
      if (sumColIndexes.includes(i)) cls = "sum-col";
      if (totalColIndex === i) cls = "total-col";
      return `<td class="${cls}">${cell ?? ""}</td>`;
    }).join("")}</tr>`
  ).join("");

  const html = `
<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-com:office:word'
      xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset="UTF-8">
<!--[if gte mso 9]>
<xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml>
<![endif]-->
<style>
  @page { margin: 1.5cm; size: A4 landscape; }
  body {
    direction: rtl;
    font-family: "Arial", "Tahoma", sans-serif;
    font-size: 12pt;
    color: #1a1a1a;
  }
  h1 {
    text-align: center;
    font-size: 16pt;
    margin-bottom: 4px;
    color: #1e3a5f;
  }
  .subtitle {
    text-align: center;
    font-size: 11pt;
    color: #444;
    margin-bottom: 12px;
  }
  .meta-table {
    width: auto;
    margin: 0 auto 14px auto;
    border: none;
  }
  .meta-table td { border: none; padding: 2px 10px; font-size: 11pt; }
  .meta-label { font-weight: bold; color: #555; }
  .meta-value { color: #1a1a1a; }
  table.grades-table {
    border-collapse: collapse;
    width: 100%;
    margin-top: 8px;
  }
  table.grades-table th {
    background-color: #1e3a5f;
    color: white;
    border: 1px solid #1e3a5f;
    padding: 7px 6px;
    text-align: center;
    font-size: 11pt;
    font-weight: bold;
  }
  table.grades-table td {
    border: 1px solid #aaa;
    padding: 6px 5px;
    text-align: center;
    font-size: 11pt;
  }
  table.grades-table tr:nth-child(even) td { background-color: #f5f8ff; }
  .sum-col { background-color: #dbeafe !important; font-weight: bold; color: #1e40af; }
  .total-col { background-color: #fef9c3 !important; font-weight: bold; color: #854d0e; }
  .name-col { text-align: right !important; padding-right: 10px !important; }
  .footer-note {
    margin-top: 16px;
    text-align: left;
    font-size: 10pt;
    color: #777;
  }
</style>
</head>
<body>
  <h1>${title}</h1>
  ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ""}
  ${metaHtml}
  <table class="grades-table">
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <p class="footer-note">تاريخ التصدير: ${new Date().toLocaleString("ar-EG")}</p>
</body>
</html>`;

  const blob = new Blob(["\ufeff", html], {
    type: "application/msword;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(fileName ?? title).replace(/[\\/:*?"<>|]/g, "_")}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
