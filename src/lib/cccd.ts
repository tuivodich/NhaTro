/**
 * Đọc chuỗi trong mã QR của CCCD gắn chip:
 *   "Số CCCD|Số CMND cũ|Họ và tên|Ngày sinh ddmmyyyy|Giới tính|Nơi thường trú|Ngày cấp ddmmyyyy"
 * (một số thẻ có thêm trường ở cuối — bỏ qua). Sai định dạng → null.
 */
export interface CccdData { idNumber: string; oldIdNumber: string; fullName: string; dob: string; gender: "nam" | "nu" | ""; address: string; idIssueDate: string }

const dmy = (s: string) => {
  const m = /^(\d{2})(\d{2})(\d{4})$/.exec(s.trim());
  if (!m) return "";
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(iso + "T00:00:00Z");
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? "" : iso;
};

export function parseCccdQr(raw: string): CccdData | null {
  const parts = String(raw ?? "").trim().split("|");
  if (parts.length < 7) return null;
  const [id, old, name, dob, gender, address, issued] = parts.map((p) => p.trim());
  if (!/^\d{12}$/.test(id) || !name) return null;
  const g = gender.toLowerCase();
  return {
    idNumber: id, oldIdNumber: /^\d{9}$/.test(old) ? old : "", fullName: name, dob: dmy(dob),
    gender: g === "nam" ? "nam" : g === "nữ" || g === "nu" ? "nu" : "", address, idIssueDate: dmy(issued),
  };
}
