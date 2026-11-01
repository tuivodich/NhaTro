import { createContext, useContext, useState, type ReactNode } from "react";

/** Nhãn dùng chung (trạng thái, vai trò, loại phòng…). Tiếng Việt là chính; thêm tiếng Anh sau vào `en`. */
export const vi = {
  role: { owner: "Chủ", manager: "Quản lý", staff: "Nhân viên", tenant: "Người thuê" },
  roomType: { phong: "Phòng trọ", mat_bang: "Mặt bằng", nha: "Nhà nguyên căn" },
  roomStatus: { trong: "Trống", dang_thue: "Đang thuê", dang_sua: "Đang sửa", giu_cho: "Giữ chỗ" },
  propertyKind: { day_tro: "Dãy trọ", nha_nguyen_can: "Nhà nguyên căn" },
  contractStatus: { hieu_luc: "Hiệu lực", da_thanh_ly: "Đã thanh lý", huy: "Đã hủy" },
  payState: { nhap: "Nháp", huy: "Đã hủy", chua_thu: "Chưa thu", thu_mot_phan: "Thu một phần", da_thu: "Đã thu đủ", qua_han: "Quá hạn" },
  serviceMode: { meter: "Theo chỉ số", person: "Theo người", room: "Theo phòng/tháng" },
  ticketStatus: { moi: "Mới", dang_xu_ly: "Đang xử lý", xong: "Đã xong", huy: "Hủy" },
  tamTru: { chua: "Chưa đăng ký", da_dang_ky: "Đã đăng ký", het_han: "Hết hạn" },
  payMethod: { cash: "Tiền mặt", bank: "Chuyển khoản", other: "Khác" },
  gender: { nam: "Nam", nu: "Nữ", "": "—" },
  docType: { cccd: "Căn cước công dân (CCCD)", cmnd: "Chứng minh nhân dân (CMND cũ)", passport: "Hộ chiếu" },
  requestStatus: { moi: "Mới", da_lien_he: "Đã liên hệ", giu_cho: "Đang giữ chỗ", da_thue: "Đã ký hợp đồng", ket_thuc: "Đã kết thúc thuê", tu_choi: "Từ chối", huy: "Đã hủy" },
  docTypeShort: { cccd: "CCCD", cmnd: "CMND", passport: "Hộ chiếu" },
};
export type Dict = typeof vi;

const Ctx = createContext<{ lang: "vi" | "en"; setLang: (l: "vi" | "en") => void; L: Dict }>({ lang: "vi", setLang: () => {}, L: vi });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<"vi" | "en">("vi");
  return <Ctx.Provider value={{ lang, setLang, L: vi }}>{children}</Ctx.Provider>;
}
export const useI18n = () => useContext(Ctx);
