/** Nhập/kiểm tra ngày tháng dạng dd/mm/yyyy (và dd/mm/yyyy HH:mm). Dữ liệu lưu vẫn là yyyy-mm-dd (hoặc yyyy-mm-ddTHH:mm). */

export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;

const pad = (n: number) => String(n).padStart(2, "0");
/** Ngày có thật trong lịch không (kể cả năm nhuận). */
export function isRealDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d) || y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "25/12/2026", "25-12-2026", "25.12.2026", "5/1/2026" → "2026-12-25"; sai ngày/tháng/năm hoặc chưa đủ → null. */
export function parseDMY(text: string): string | null {
  const m = /^\s*(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4})\s*$/.exec(text);
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  return isRealDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
}

/** "2026-12-25" → "25/12/2026" ("" nếu không phải ngày hợp lệ). */
export function toDMY(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m && isRealDate(+m[1], +m[2], +m[3]) ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Gõ chữ số thì tự chèn dấu "/": "25122026" → "25/12/2026" (bỏ mọi ký tự khác chữ số). */
export function maskDMY(text: string): string {
  const d = text.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "25/12/2026 14:30" → "2026-12-25T14:30"; sai hoặc chưa đủ → null. */
export function parseDMYHM(text: string): string | null {
  const m = /^\s*(.+?)\s+(\d{1,2})\s*:\s*(\d{2})\s*$/.exec(text);
  if (!m) return null;
  const date = parseDMY(m[1]);
  const h = +m[2], mi = +m[3];
  return date && h >= 0 && h <= 23 && mi >= 0 && mi <= 59 ? `${date}T${pad(h)}:${pad(mi)}` : null;
}

/** "2026-12-25T14:30" → "25/12/2026 14:30" ("" nếu không hợp lệ). */
export function toDMYHM(local: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(local ?? "");
  const d = m ? toDMY(m[1]) : "";
  return d && +m![2] <= 23 && +m![3] <= 59 ? `${d} ${m![2]}:${m![3]}` : "";
}

/** Mặt nạ cho "dd/mm/yyyy HH:mm" khi gõ chữ số liên tục: "251220261430" → "25/12/2026 14:30". */
export function maskDMYHM(text: string): string {
  const d = text.replace(/\D/g, "").slice(0, 12);
  const date = maskDMY(d.slice(0, 8));
  if (d.length <= 8) return date;
  const t = d.slice(8);
  return `${date} ${t.length <= 2 ? t : `${t.slice(0, 2)}:${t.slice(2)}`}`;
}
