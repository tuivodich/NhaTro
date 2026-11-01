/** Dữ liệu khởi tạo: 3 khu cho thuê của chủ nhà (giá thuê để 0 — chủ nhập theo thực tế). */
import { doc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { DEFAULT_SERVICES } from "./billing";
import type { Property, Room } from "./types";

type P = Omit<Property, "id"> & { id: string; rooms: Omit<Room, "id" | "propertyId" | "status" | "rent">[] };
export const SEED: P[] = [
  {
    id: "conghoa", order: 1, name: "Khu trọ 43/48 Cộng Hòa", address: "43/48 Cộng Hòa, phường Tân Sơn Nhất, TP. Hồ Chí Minh",
    kind: "day_tro", billingDay: 1, dueDays: 5, roundTo: 1000, services: DEFAULT_SERVICES,
    rooms: [
      ...[1, 2, 3, 4, 5, 6].map((n) => ({ code: `P${n}`, name: `Phòng ${n}`, type: "phong" as const })),
      { code: "MB", name: "Mặt bằng phía trước", type: "mat_bang" as const },
    ],
  },
  {
    id: "hiepthanh", order: 2, name: "Nhà 495/5 Hiệp Thành 10", address: "495/5 đường Hiệp Thành 10, phường Tân Thới Hiệp, TP. Hồ Chí Minh",
    kind: "nha_nguyen_can", billingDay: 1, dueDays: 5, roundTo: 1000, services: [],
    rooms: [{ code: "HT", name: "Nhà nguyên căn 495/5 Hiệp Thành 10", type: "nha" as const }],
  },
  {
    id: "anphudong", order: 3, name: "Nhà 36/37/12 Quốc Lộ 1", address: "36/37/12 Quốc Lộ 1, phường An Phú Đông, TP. Hồ Chí Minh",
    kind: "nha_nguyen_can", billingDay: 1, dueDays: 5, roundTo: 1000, services: [],
    rooms: [{ code: "APD", name: "Nhà nguyên căn 36/37/12 Quốc Lộ 1", type: "nha" as const }],
  },
];

/** Tạo khu và phòng (bỏ qua nếu đã có). Mã phòng không trùng giữa các khu để bot nhận đúng (/dien P1 1234). */
export async function seedProperties(existing: string[]) {
  const b = writeBatch(db);
  let n = 0;
  for (const { rooms, id, ...p } of SEED) {
    if (existing.includes(id)) continue;
    b.set(doc(db, "properties", id), p);
    for (const r of rooms) { b.set(doc(db, "rooms", `${id}_${r.code}`), { ...r, propertyId: id, rent: 0, status: "trong", public: false }); n++; }
  }
  await b.commit();
  return n;
}
