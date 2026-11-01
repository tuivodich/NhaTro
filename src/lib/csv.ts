/** Xuất CSV (UTF-8 có BOM để Excel đọc đúng tiếng Việt). */
export function downloadCsv(name: string, rows: (string | number | undefined | null)[][]) {
  const cell = (v: string | number | undefined | null) => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob(["﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
