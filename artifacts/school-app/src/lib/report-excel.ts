import * as XLSX from "xlsx";

export interface ExcelReportOptions {
  title: string;
  headers: string[];
  rows: (string | number | null)[][];
  totals?: { label: string; value: string | number }[];
  sheetName?: string;
  fileName?: string;
}

export function exportExcel(opts: ExcelReportOptions) {
  const { title, headers, rows, totals, sheetName = "تقرير" } = opts;

  const nowStr = new Date().toLocaleString("ar-EG");

  const data: (string | number | null)[][] = [];

  data.push([title]);
  data.push([`تاريخ التصدير: ${nowStr}`]);
  data.push([]);
  data.push(headers);

  for (const row of rows) {
    data.push(row);
  }

  if (totals && totals.length > 0) {
    data.push([]);
    data.push(["الملخص"]);
    for (const t of totals) {
      data.push([t.label, t.value]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(data);

  ws["!cols"] = headers.map(() => ({ wch: 22 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));

  const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, "-");
  const nameSource = opts.fileName ?? title;
  const safeTitle = nameSource.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
  XLSX.writeFile(wb, `${safeTitle}.xlsx`);
}
