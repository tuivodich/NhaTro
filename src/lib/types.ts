/** Vai trò: chủ (toàn quyền mọi khu), quản lý (các khu được giao), nhân viên (ghi chỉ số, thu tiền mặt, báo hỏng; không xem CCCD), người thuê. */
export type Role = "owner" | "manager" | "staff" | "tenant";
export const STAFF_ROLES: Role[] = ["owner", "manager", "staff"];
export const isStaffRole = (r?: Role) => !!r && STAFF_ROLES.includes(r);
export const isAdminRole = (r?: Role) => r === "owner" || r === "manager";

export interface UserDoc { name?: string; email: string; phone?: string; role: Role; /** Khu được giao (quản lý/nhân viên): { [propertyId]: true }. Chủ thấy mọi khu. */ props?: Record<string, boolean> }

/** Cách tính một dịch vụ: theo chỉ số đồng hồ, theo số người ở, theo phòng (mỗi tháng), cố định. */
export type ServiceMode = "meter" | "person" | "room";
export interface Tier { upTo: number | null; price: number }
export interface Service { id: string; name: string; mode: ServiceMode; unit: string; price: number; /** Giá bậc thang (chỉ cho mode "meter"); có thì bỏ qua `price`. */ tiers?: Tier[] }

export type PropertyKind = "day_tro" | "nha_nguyen_can";
export interface Property {
  id: string; name: string; address: string; kind: PropertyKind; order?: number;
  /** Ngày chốt chỉ số & lập hóa đơn trong tháng (mặc định 1) và số ngày được trả sau đó (mặc định 5). */
  billingDay: number; dueDays: number;
  /** Dịch vụ mặc định áp cho hợp đồng mới. */
  services: Service[];
  /** Làm tròn tổng hóa đơn (VNĐ): 0 = không làm tròn, 1000 = tròn nghìn. */
  roundTo?: number;
  note?: string;
}

export type RoomType = "phong" | "mat_bang" | "nha";
export type RoomStatus = "trong" | "dang_thue" | "dang_sua" | "giu_cho";
export interface Room {
  id: string; propertyId: string; code: string; name?: string; type: RoomType; floor?: string; area?: number;
  rent: number; maxPeople?: number; amenities?: string; desc?: string; photos?: string[]; status: RoomStatus;
  /** Hiện trên trang công khai khi còn trống. */
  public?: boolean;
}

/** Bản sao công khai của phòng trống (không có dữ liệu cá nhân). */
export interface Listing { id: string; propertyId: string; propertyName: string; address: string; code: string; name?: string; type: RoomType; area?: number; rent: number; maxPeople?: number; amenities?: string; desc?: string; photos?: string[] }

export type TamTruStatus = "chua" | "da_dang_ky" | "het_han";
export interface Tenant {
  id: string; propertyId: string; fullName: string; gender?: "nam" | "nu" | ""; dob?: string;
  /** Loại giấy tờ (hồ sơ cũ không có = CCCD); `idNumber` là số của giấy tờ đó. */
  docType?: "cccd" | "cmnd" | "passport"; idNumber: string; oldIdNumber?: string; idIssueDate?: string; idIssuePlace?: string; docExpiry?: string; nationality?: string; address?: string;
  phone: string; email?: string; job?: string; workplace?: string; emergencyName?: string; emergencyPhone?: string; vehiclePlate?: string;
  idFront?: string; idBack?: string; portrait?: string;
  /** Tài khoản đăng nhập của người thuê (gắn qua mã mời). */
  uid?: string; inviteCode?: string;
  tamTru?: { status: TamTruStatus; from?: string; to?: string };
  consent?: boolean; note?: string;
}

export interface Occupant { tenantId: string; name: string; from: string; to?: string }
export type ContractStatus = "hieu_luc" | "da_thanh_ly" | "huy";
export interface Contract {
  id: string; code: string; propertyId: string; roomId: string; roomCode: string;
  mainTenantId: string; tenantName: string; occupants: Occupant[]; tenantUids: string[];
  start: string; end: string; rent: number; deposit: number; billingDay: number; services: Service[];
  status: ContractStatus; endedOn?: string; note?: string;
  settlement?: { finalInvoiceId?: string; depositUsed: number; refund: number; note?: string };
}

/** Chỉ số chốt đầu kỳ `period` của một hợp đồng (id: `${contractId}_${period}_${serviceId}`). */
export interface MeterReading { id: string; propertyId: string; roomId: string; contractId: string; period: string; serviceId: string; value: number; photo?: string; readBy?: string; readOn?: string; /** Đã khóa khi hóa đơn phát hành (chỉ quản lý sửa). */ locked?: boolean }

export type LineKind = "rent" | "service" | "extra" | "discount" | "round";
export interface InvoiceLine { kind: LineKind; label: string; qty: number; unit?: string; price: number; amount: number; /** Mẫu số khi tính theo ngày (thành tiền = qty × price / den). */ den?: number; serviceId?: string; old?: number; new?: number; tiers?: Tier[] }
export interface PayEntry { amount: number; date: string; method: "cash" | "bank" | "other"; by: string; note?: string; at?: { toMillis(): number } }
export type InvoiceStatus = "nhap" | "da_gui" | "huy";
export interface Invoice {
  id: string; code: string; propertyId: string; propertyName?: string; roomId: string; roomCode: string; contractId: string; period: string;
  tenantUids: string[]; tenantName: string; lines: InvoiceLine[]; total: number; paid: number; payLog: PayEntry[];
  status: InvoiceStatus; dueDate: string; issuedOn?: string; note?: string; createdBy?: string;
}

export interface Txn { id: string; propertyId: string; date: string; type: "thu" | "chi"; category: string; amount: number; note?: string; by?: string }

export type TicketStatus = "moi" | "dang_xu_ly" | "xong" | "huy";
export interface Ticket { id: string; propertyId: string; roomId: string; roomCode?: string; contractId?: string; title: string; detail?: string; photos?: string[]; status: TicketStatus; cost?: number; createdBy: string; createdName?: string; createdOn: string; doneOn?: string }
