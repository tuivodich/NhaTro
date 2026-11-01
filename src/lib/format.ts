export function formatVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n || 0)) + " đ";
}

/** "2026-10-27" → "27/10/2026" (dữ liệu vẫn lưu yyyy-mm-dd). */
export function fmtDate(s: string | undefined | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s ?? "";
}
/** "2026-11" → "11/2026". */
export function fmtPeriod(p: string | undefined | null): string {
  const m = /^(\d{4})-(\d{2})$/.exec(p ?? "");
  return m ? `${m[2]}/${m[1]}` : p ?? "";
}

/** Ngày hôm nay theo giờ Việt Nam (không dùng toISOString vì lệch ngày lúc 0–7 giờ sáng). */
export const todayStr = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(now);
export const thisPeriod = (now = new Date()) => todayStr(now).slice(0, 7);

export function addDays(s: string, n: number): string {
  const d = new Date(Date.parse(s + "T00:00:00Z") + n * 86400000);
  return d.toISOString().slice(0, 10); // tính trên UTC thuần nên không lệch múi giờ
}
export function addMonths(period: string, n: number): string {
  const [y, m] = period.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
export const daysInMonth = (period: string) => { const [y, m] = period.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

/** So khớp tên không phân biệt hoa thường, dấu và khoảng trắng thừa. */
export const normName = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/đ/g, "d").replace(/\s+/g, " ").trim();

/** Mã ngắn ngẫu nhiên (chữ hoa + số, bỏ ký tự dễ nhầm). */
export function randomCode(n = 6): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = new Uint32Array(n);
  crypto.getRandomValues(buf);
  return Array.from(buf, (x) => A[x % A.length]).join("");
}
