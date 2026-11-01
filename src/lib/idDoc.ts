/** Giấy tờ tùy thân của người cư trú: CCCD, CMND cũ, Hộ chiếu. */
export type DocType = "cccd" | "cmnd" | "passport";
export const DOC_TYPES: DocType[] = ["cccd", "cmnd", "passport"];

/** Ảnh cần chụp cho từng loại giấy tờ (trường lưu đường dẫn ảnh trong hồ sơ). */
export type DocImageField = "idFront" | "idBack" | "portrait";
export const DOC_IMAGES: Record<DocType, { field: DocImageField; label: string }[]> = {
  cccd: [{ field: "idFront", label: "CCCD mặt trước" }, { field: "idBack", label: "CCCD mặt sau" }, { field: "portrait", label: "Ảnh chân dung" }],
  cmnd: [{ field: "idFront", label: "CMND mặt trước" }, { field: "idBack", label: "CMND mặt sau" }, { field: "portrait", label: "Ảnh chân dung" }],
  passport: [{ field: "idFront", label: "Trang thông tin hộ chiếu" }, { field: "idBack", label: "Trang thị thực / dấu nhập cảnh" }, { field: "portrait", label: "Ảnh chân dung" }],
};

/** Hồ sơ cũ (trước khi có loại giấy tờ) coi là CCCD. */
export const docTypeOf = (t: { docType?: DocType }): DocType => t.docType ?? "cccd";

/** Chuẩn hóa số giấy tờ: bỏ khoảng trắng, dấu chấm, gạch; viết hoa. */
export const normDocNumber = (s: string) => String(s ?? "").replace(/[\s.\-]/g, "").toUpperCase();

/** Kiểm tra số giấy tờ theo loại; trả về thông báo lỗi ("" = hợp lệ hoặc để trống). */
export function docNumberError(type: DocType, raw: string): string {
  const n = normDocNumber(raw);
  if (!n) return "";
  if (type === "cccd") return /^\d{12}$/.test(n) ? "" : "Số CCCD phải có đúng 12 chữ số.";
  if (type === "cmnd") return /^(\d{9}|\d{12})$/.test(n) ? "" : "Số CMND phải có 9 hoặc 12 chữ số.";
  return /^[A-Z0-9]{6,12}$/.test(n) ? "" : "Số hộ chiếu gồm 6–12 chữ cái hoặc chữ số (vd C1234567).";
}

/** Che bớt số giấy tờ khi hiển thị trong danh sách. */
export const maskDoc = (n?: string) => (n ? `••••${n.slice(-4)}` : "");
