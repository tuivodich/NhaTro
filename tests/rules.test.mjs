import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, query, where, writeBatch, serverTimestamp } from "firebase/firestore";

// Chạy: npm run test:emu (Firestore Emulator do firebase emulators:exec dựng lên).
const [EMU_HOST, EMU_PORT] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8089").split(":");
const RULES = fileURLToPath(new URL("../firestore.rules", import.meta.url));
const env = await initializeTestEnvironment({ projectId: "demo-test", firestore: { rules: readFileSync(RULES, "utf8"), host: EMU_HOST, port: Number(EMU_PORT) } });

let pass = 0, fail = 0;
const check = async (name, p, expectOk) => {
  try { await (expectOk ? assertSucceeds(p) : assertFails(p)); pass++; console.log("ok  ", name); }
  catch (e) { fail++; console.log("FAIL", name, "-", String(e.message).split("\n")[0]); }
};

const inv = (o = {}) => ({ code: "AB12CD", propertyId: "A", roomId: "rA1", roomCode: "P1", contractId: "cA1", period: "2026-11", tenantUids: ["ten1"], tenantName: "An", lines: [], total: 3000000, paid: 0, payLog: [], status: "da_gui", dueDate: "2026-11-05", ...o });

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "meta/bootstrap"), { uid: "own" });
  await setDoc(doc(db, "users/own"), { role: "owner", email: "o@x" });
  await setDoc(doc(db, "users/manA"), { role: "manager", email: "m@x", props: { A: true } });
  await setDoc(doc(db, "users/stA"), { role: "staff", email: "s@x", props: { A: true } });
  await setDoc(doc(db, "users/ten1"), { role: "tenant", email: "t1@x" });
  await setDoc(doc(db, "users/ten2"), { role: "tenant", email: "t2@x" });
  await setDoc(doc(db, "settings/app"), { name: "NhaTro" });
  await setDoc(doc(db, "settings/bank"), { bankBin: "970436", accountNo: "123", accountName: "X" });
  await setDoc(doc(db, "settings/bankhook"), { token: "x".repeat(32) });
  await setDoc(doc(db, "properties/A"), { name: "Khu A" });
  await setDoc(doc(db, "properties/B"), { name: "Khu B" });
  await setDoc(doc(db, "rooms/rA1"), { propertyId: "A", code: "P1", rent: 3000000, status: "dang_thue" });
  await setDoc(doc(db, "rooms/rA2"), { propertyId: "A", code: "P2", rent: 3000000, status: "trong" });
  await setDoc(doc(db, "rooms/rB1"), { propertyId: "B", code: "N1", rent: 8000000, status: "trong" });
  await setDoc(doc(db, "listings/rA2"), { propertyId: "A", code: "P2", rent: 3000000 });
  await setDoc(doc(db, "tenants/tA1"), { propertyId: "A", fullName: "An", idNumber: "079099012345", phone: "090", uid: "ten1" });
  await setDoc(doc(db, "tenants/tB1"), { propertyId: "B", fullName: "Bình", idNumber: "079099000000", phone: "091" });
  await setDoc(doc(db, "contracts/cA1"), { propertyId: "A", roomId: "rA1", tenantUids: ["ten1"], status: "hieu_luc", rent: 3000000 });
  await setDoc(doc(db, "contracts/cB1"), { propertyId: "B", roomId: "rB1", tenantUids: ["ten2"], status: "hieu_luc", rent: 8000000 });
  await setDoc(doc(db, "invoices/iA1"), inv());
  await setDoc(doc(db, "invoices/iA2"), inv({ status: "nhap" }));
  await setDoc(doc(db, "invoices/iB1"), inv({ propertyId: "B", roomId: "rB1", contractId: "cB1", tenantUids: ["ten2"] }));
  await setDoc(doc(db, "meterReadings/m1"), { propertyId: "A", roomId: "rA1", contractId: "cA1", period: "2026-11", serviceId: "dien", value: 100 });
  await setDoc(doc(db, "meterReadings/m2"), { propertyId: "A", roomId: "rA1", contractId: "cA1", period: "2026-10", serviceId: "dien", value: 50, locked: true });
  await setDoc(doc(db, "transactions/x1"), { propertyId: "A", type: "chi", amount: 100, date: "2026-11-01" });
  await setDoc(doc(db, "transactions/xB"), { propertyId: "B", type: "chi", amount: 100, date: "2026-11-01" });
  await setDoc(doc(db, "tickets/k1"), { propertyId: "A", roomId: "rA1", title: "Hỏng vòi", status: "moi", createdBy: "ten1" });
  await setDoc(doc(db, "bankTx/b1"), { matched: false, amount: 1, reason: "x" });
  await setDoc(doc(db, "tgTenants/555"), { uid: "ten1" });
  await setDoc(doc(db, "tgLinks/ABCD1234"), { uid: "own" });
});

const ctx = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
const anon = ctx(), own = ctx("own"), man = ctx("manA"), st = ctx("stA"), t1 = ctx("ten1"), t2 = ctx("ten2");

// ===== Công khai =====
await check("anon đọc listings", getDocs(collection(anon, "listings")), true);
await check("anon đọc settings/app", getDoc(doc(anon, "settings/app")), true);
await check("anon KHÔNG đọc settings/bank", getDoc(doc(anon, "settings/bank")), false);
await check("anon KHÔNG đọc rooms", getDoc(doc(anon, "rooms/rA1")), false);
await check("anon KHÔNG đọc tenants", getDoc(doc(anon, "tenants/tA1")), false);
await check("anon KHÔNG đọc invoices", getDoc(doc(anon, "invoices/iA1")), false);
await check("anon KHÔNG ghi listings", setDoc(doc(anon, "listings/rA1"), { propertyId: "A", code: "P1", rent: 1 }), false);
await check("anon KHÔNG đọc tgLinks", getDoc(doc(anon, "tgLinks/ABCD1234")), false);

// ===== Đăng ký & vai trò =====
await check("người mới tự tạo tài khoản tenant", setDoc(doc(ctx("new1"), "users/new1"), { role: "tenant", email: "n@x" }), true);
await check("người mới KHÔNG tự làm owner khi đã có chủ", setDoc(doc(ctx("new2"), "users/new2"), { role: "owner", email: "n@x" }), false);
await check("người mới KHÔNG tự làm manager", setDoc(doc(ctx("new3"), "users/new3"), { role: "manager", email: "n@x" }), false);
await check("người mới KHÔNG tự gán khu", setDoc(doc(ctx("new4"), "users/new4"), { role: "tenant", email: "n@x", props: { A: true } }), false);
await check("tenant sửa tên mình", updateDoc(doc(t1, "users/ten1"), { name: "An" }), true);
await check("tenant KHÔNG tự nâng quyền", updateDoc(doc(t1, "users/ten1"), { role: "owner" }), false);
await check("manager KHÔNG tự thêm khu B", updateDoc(doc(man, "users/manA"), { props: { A: true, B: true } }), false);
await check("chủ cấp quyền quản lý + khu", updateDoc(doc(own, "users/ten2"), { role: "manager", props: { B: true } }), true);
await check("chủ trả lại tenant", updateDoc(doc(own, "users/ten2"), { role: "tenant", props: {} }), true);
await check("chủ KHÔNG đặt vai trò lạ", updateDoc(doc(own, "users/ten2"), { role: "admin" }), false);
await check("manager KHÔNG cấp quyền người khác", updateDoc(doc(man, "users/ten2"), { role: "staff" }), false);
await check("manager KHÔNG đọc danh sách users", getDocs(collection(man, "users")), false);
await check("chủ đọc danh sách users", getDocs(collection(own, "users")), true);

// ===== Cài đặt =====
await check("tenant đọc settings/bank (hiện QR)", getDoc(doc(t1, "settings/bank")), true);
await check("manager KHÔNG đọc bankhook", getDoc(doc(man, "settings/bankhook")), false);
await check("chủ đọc bankhook", getDoc(doc(own, "settings/bankhook")), true);
await check("manager KHÔNG sửa settings/bank", setDoc(doc(man, "settings/bank"), { bankBin: "1" }), false);
await check("chủ sửa settings/bank", setDoc(doc(own, "settings/bank"), { bankBin: "970436", accountNo: "999", accountName: "Y" }), true);
await check("chủ KHÔNG đặt bankhook token yếu", setDoc(doc(own, "settings/bankhook"), { token: "123" }), false);
await check("chủ đặt bankhook token", setDoc(doc(own, "settings/bankhook"), { token: "A".repeat(40) }), true);

// ===== Khu =====
await check("manager A đọc khu A", getDoc(doc(man, "properties/A")), true);
await check("manager A KHÔNG đọc khu B", getDoc(doc(man, "properties/B")), false);
await check("manager KHÔNG tạo khu", setDoc(doc(man, "properties/C"), { name: "C" }), false);
await check("chủ tạo khu", setDoc(doc(own, "properties/C"), { name: "C" }), true);
await check("manager A sửa khu A", updateDoc(doc(man, "properties/A"), { note: "x" }), true);
await check("staff KHÔNG sửa khu", updateDoc(doc(st, "properties/A"), { note: "y" }), false);

// ===== Phòng & listings =====
await check("staff A truy vấn phòng khu A", getDocs(query(collection(st, "rooms"), where("propertyId", "==", "A"))), true);
await check("staff A KHÔNG truy vấn phòng khu B", getDocs(query(collection(st, "rooms"), where("propertyId", "==", "B"))), false);
await check("manager A KHÔNG liệt kê mọi phòng", getDocs(collection(man, "rooms")), false);
await check("chủ liệt kê mọi phòng", getDocs(collection(own, "rooms")), true);
await check("manager A thêm phòng khu A", setDoc(doc(man, "rooms/rA3"), { propertyId: "A", code: "P3", rent: 2500000, status: "trong" }), true);
await check("manager A KHÔNG thêm phòng khu B", setDoc(doc(man, "rooms/rB9"), { propertyId: "B", code: "X", rent: 1, status: "trong" }), false);
await check("manager A KHÔNG chuyển phòng sang khu B", updateDoc(doc(man, "rooms/rA2"), { propertyId: "B" }), false);
await check("phòng KHÔNG nhận trạng thái lạ", updateDoc(doc(man, "rooms/rA2"), { status: "xyz" }), false);
await check("staff KHÔNG sửa phòng", updateDoc(doc(st, "rooms/rA2"), { rent: 1 }), false);
await check("manager A ghi listing phòng khu A", setDoc(doc(man, "listings/rA2"), { propertyId: "A", propertyName: "Khu A", address: "x", code: "P2", type: "phong", rent: 3000000, photos: [] }), true);
await check("listing KHÔNG chứa trường lạ (dữ liệu cá nhân)", setDoc(doc(man, "listings/rA2"), { propertyId: "A", code: "P2", rent: 1, tenantName: "An" }), false);
await check("listing KHÔNG sai khu so với phòng", setDoc(doc(own, "listings/rA2"), { propertyId: "B", code: "P2", rent: 1 }), false);
await check("manager A KHÔNG ghi listing phòng khu B", setDoc(doc(man, "listings/rB1"), { propertyId: "B", code: "N1", rent: 1 }), false);

// ===== Người thuê (CCCD) =====
await check("manager A đọc hồ sơ khu A", getDoc(doc(man, "tenants/tA1")), true);
await check("manager A KHÔNG đọc hồ sơ khu B", getDoc(doc(man, "tenants/tB1")), false);
await check("staff KHÔNG đọc hồ sơ (CCCD)", getDoc(doc(st, "tenants/tA1")), false);
await check("tenant đọc hồ sơ của mình", getDoc(doc(t1, "tenants/tA1")), true);
await check("tenant KHÔNG đọc hồ sơ người khác", getDoc(doc(t2, "tenants/tA1")), false);
await check("manager tạo hồ sơ khu A", setDoc(doc(man, "tenants/tA2"), { propertyId: "A", fullName: "Cường", idNumber: "1", phone: "1" }), true);
await check("manager KHÔNG tự gắn uid cho hồ sơ", setDoc(doc(man, "tenants/tA3"), { propertyId: "A", fullName: "D", uid: "ten2" }), false);
await check("manager KHÔNG đổi uid hồ sơ", updateDoc(doc(man, "tenants/tA1"), { uid: "ten2" }), false);
await check("manager A KHÔNG chuyển hồ sơ sang khu B", updateDoc(doc(man, "tenants/tA1"), { propertyId: "B" }), false);
await check("tenant KHÔNG sửa hồ sơ", updateDoc(doc(t1, "tenants/tA1"), { phone: "1" }), false);
await check("manager tạo hồ sơ hộ chiếu", setDoc(doc(man, "tenants/tA5"), { propertyId: "A", fullName: "Kim", docType: "passport", idNumber: "M12345678", nationality: "Hàn Quốc", phone: "1" }), true);
await check("manager tạo hồ sơ CMND cũ", setDoc(doc(man, "tenants/tA6"), { propertyId: "A", fullName: "Dũng", docType: "cmnd", idNumber: "123456789", phone: "1" }), true);
await check("KHÔNG nhận loại giấy tờ lạ", setDoc(doc(man, "tenants/tA7"), { propertyId: "A", fullName: "X", docType: "bang_lai", idNumber: "1", phone: "1" }), false);
await check("KHÔNG sửa sang loại giấy tờ lạ", updateDoc(doc(man, "tenants/tA5"), { docType: "khac" }), false);
await check("manager đổi CMND → CCCD", updateDoc(doc(man, "tenants/tA6"), { docType: "cccd", idNumber: "079099000111" }), true);

// ===== Hợp đồng =====
await check("tenant truy vấn hợp đồng của mình", getDocs(query(collection(t1, "contracts"), where("tenantUids", "array-contains", "ten1"))), true);
await check("tenant KHÔNG đọc hợp đồng người khác", getDoc(doc(t1, "contracts/cB1")), false);
await check("staff A đọc hợp đồng khu A", getDoc(doc(st, "contracts/cA1")), true);
await check("manager tạo hợp đồng khu A", setDoc(doc(man, "contracts/cA2"), { propertyId: "A", roomId: "rA2", tenantUids: [], status: "hieu_luc", rent: 1 }), true);
await check("hợp đồng mới KHÔNG ở trạng thái thanh lý", setDoc(doc(man, "contracts/cA3"), { propertyId: "A", roomId: "rA2", tenantUids: [], status: "da_thanh_ly" }), false);
await check("staff KHÔNG tạo hợp đồng", setDoc(doc(st, "contracts/cA4"), { propertyId: "A", roomId: "rA2", tenantUids: [], status: "hieu_luc" }), false);
await check("manager thanh lý hợp đồng", updateDoc(doc(man, "contracts/cA2"), { status: "da_thanh_ly" }), true);
await check("manager KHÔNG xóa hợp đồng", deleteDoc(doc(man, "contracts/cA2")), false);

// ===== Chỉ số =====
await check("staff ghi chỉ số khu A", setDoc(doc(st, "meterReadings/m3"), { propertyId: "A", roomId: "rA1", contractId: "cA1", period: "2026-12", serviceId: "dien", value: 130 }), true);
await check("staff KHÔNG ghi chỉ số âm", setDoc(doc(st, "meterReadings/m4"), { propertyId: "A", roomId: "rA1", contractId: "cA1", period: "2026-12", serviceId: "nuoc", value: -1 }), false);
await check("staff KHÔNG ghi chỉ số khu B", setDoc(doc(st, "meterReadings/m5"), { propertyId: "B", value: 1 }), false);
await check("staff KHÔNG tạo chỉ số đã khóa", setDoc(doc(st, "meterReadings/m6"), { propertyId: "A", value: 1, locked: true }), false);
await check("staff sửa chỉ số chưa khóa", updateDoc(doc(st, "meterReadings/m1"), { value: 101 }), true);
await check("staff KHÔNG khóa chỉ số", updateDoc(doc(st, "meterReadings/m1"), { locked: true }), false);
await check("staff KHÔNG sửa chỉ số đã khóa", updateDoc(doc(st, "meterReadings/m2"), { value: 51 }), false);
await check("manager sửa chỉ số đã khóa", updateDoc(doc(man, "meterReadings/m2"), { value: 52 }), true);
await check("tenant KHÔNG đọc chỉ số", getDoc(doc(t1, "meterReadings/m1")), false);

// ===== Hóa đơn =====
await check("tenant truy vấn hóa đơn của mình", getDocs(query(collection(t1, "invoices"), where("tenantUids", "array-contains", "ten1"))), true);
await check("tenant KHÔNG đọc hóa đơn người khác", getDoc(doc(t1, "invoices/iB1")), false);
await check("tenant KHÔNG sửa hóa đơn (tự ghi đã trả)", updateDoc(doc(t1, "invoices/iA1"), { paid: 3000000 }), false);
await check("manager A lập hóa đơn nháp", setDoc(doc(man, "invoices/iA3"), inv({ status: "nhap", paid: 0 })), true);
await check("KHÔNG lập hóa đơn đã thu sẵn", setDoc(doc(man, "invoices/iA4"), inv({ status: "nhap", paid: 100 })), false);
await check("KHÔNG lập hóa đơn ở trạng thái đã gửi", setDoc(doc(man, "invoices/iA5"), inv({ status: "da_gui" })), false);
await check("manager A KHÔNG lập hóa đơn khu B", setDoc(doc(man, "invoices/iB2"), inv({ propertyId: "B", status: "nhap" })), false);
await check("staff ghi một lần thu tiền mặt", updateDoc(doc(st, "invoices/iA1"), { paid: 1000000, payLog: [{ amount: 1000000, date: "2026-11-02", method: "cash", by: "stA" }] }), true);
await check("staff KHÔNG giảm số đã thu", updateDoc(doc(st, "invoices/iA1"), { paid: 0, payLog: [{ amount: 1, date: "x", method: "cash", by: "stA" }, { amount: -1, date: "x", method: "cash", by: "stA" }] }), false);
await check("staff KHÔNG sửa tổng tiền", updateDoc(doc(st, "invoices/iA1"), { total: 1 }), false);
await check("staff KHÔNG thu tiền hóa đơn nháp", updateDoc(doc(st, "invoices/iA2"), { paid: 1, payLog: [{ amount: 1 }] }), false);
await check("manager phát hành hóa đơn", updateDoc(doc(man, "invoices/iA3"), { status: "da_gui" }), true);
await check("manager KHÔNG xóa hóa đơn đã phát hành", deleteDoc(doc(man, "invoices/iA3")), false);
await check("manager xóa hóa đơn nháp", deleteDoc(doc(man, "invoices/iA2")), true);

// ===== Thu chi =====
await check("manager A đọc thu chi khu A", getDocs(query(collection(man, "transactions"), where("propertyId", "==", "A"))), true);
await check("manager A KHÔNG đọc thu chi khu B", getDoc(doc(man, "transactions/xB")), false);
await check("staff KHÔNG đọc thu chi", getDoc(doc(st, "transactions/x1")), false);
await check("manager ghi khoản chi", addDoc(collection(man, "transactions"), { propertyId: "A", type: "chi", amount: 50000, date: "2026-11-03", category: "Sửa chữa" }), true);
await check("KHÔNG ghi loại thu chi lạ", addDoc(collection(man, "transactions"), { propertyId: "A", type: "x", amount: 1 }), false);

// ===== Báo hỏng =====
const tk = (o = {}) => ({ propertyId: "A", roomId: "rA1", roomCode: "P1", contractId: "cA1", title: "Bóng đèn hỏng", status: "moi", createdBy: "ten1", createdOn: "2026-11-02", ...o });
await check("tenant báo hỏng phòng mình", setDoc(doc(t1, "tickets/k2"), tk()), true);
await check("tenant KHÔNG báo hỏng phòng người khác", setDoc(doc(t2, "tickets/k3"), tk({ createdBy: "ten2" })), false);
await check("tenant KHÔNG báo hỏng sai phòng", setDoc(doc(t1, "tickets/k4"), tk({ roomId: "rA2" })), false);
await check("tenant KHÔNG tạo phiếu đã xong", setDoc(doc(t1, "tickets/k5"), tk({ status: "xong" })), false);
await check("tenant đọc phiếu mình gửi", getDoc(doc(t1, "tickets/k1")), true);
await check("tenant KHÔNG tự đóng phiếu", updateDoc(doc(t1, "tickets/k1"), { status: "xong" }), false);
await check("staff xử lý phiếu", updateDoc(doc(st, "tickets/k1"), { status: "xong" }), true);

// ===== Đăng ký thuê / hẹn xem phòng =====
const rq = (o = {}) => ({ roomId: "rA2", propertyId: "A", roomCode: "P2", propertyName: "Khu A", name: "Bình", phone: "0909 123 456", people: 2, moveIn: "2026-12-01", note: "Xem phòng tối", status: "moi", createdBy: "ten2", createdAt: serverTimestamp(), ...o });
await check("anon KHÔNG gửi đăng ký thuê", setDoc(doc(anon, "rentalRequests/x_rA2"), rq({ createdBy: "x" })), false);
await check("người đăng nhập gửi đăng ký thuê phòng đang đăng", setDoc(doc(t2, "rentalRequests/ten2_rA2"), rq()), true);
await check("KHÔNG gửi trùng (đã có yêu cầu cho phòng này)", setDoc(doc(t2, "rentalRequests/ten2_rA2"), rq({ note: "lần 2" })), false);
await check("KHÔNG gửi với id sai người", setDoc(doc(t1, "rentalRequests/ten2_rA2b"), rq({ createdBy: "ten1" })), false);
await check("KHÔNG gửi cho phòng không đăng công khai", setDoc(doc(t1, "rentalRequests/ten1_rA1"), rq({ roomId: "rA1", createdBy: "ten1" })), false);
await check("KHÔNG gửi sai khu so với phòng", setDoc(doc(t1, "rentalRequests/ten1_rA2"), rq({ propertyId: "B", createdBy: "ten1" })), false);
await check("KHÔNG gửi SĐT không hợp lệ", setDoc(doc(t1, "rentalRequests/ten1_rA2"), rq({ phone: "abc", createdBy: "ten1" })), false);
await check("KHÔNG gửi trạng thái giữ chỗ sẵn", setDoc(doc(t1, "rentalRequests/ten1_rA2"), rq({ status: "giu_cho", createdBy: "ten1" })), false);
await check("KHÔNG gửi kèm trường lạ", setDoc(doc(t1, "rentalRequests/ten1_rA2"), rq({ createdBy: "ten1", idNumber: "1" })), false);
await check("người gửi đọc yêu cầu của mình", getDoc(doc(t2, "rentalRequests/ten2_rA2")), true);
await check("người khác KHÔNG đọc yêu cầu", getDoc(doc(t1, "rentalRequests/ten2_rA2")), false);
await check("staff khu A đọc yêu cầu khu A", getDocs(query(collection(st, "rentalRequests"), where("propertyId", "==", "A"))), true);
await check("người gửi KHÔNG tự đổi sang giữ chỗ", updateDoc(doc(t2, "rentalRequests/ten2_rA2"), { status: "giu_cho" }), false);
await check("staff đánh dấu đã liên hệ", updateDoc(doc(st, "rentalRequests/ten2_rA2"), { status: "da_lien_he", staffNote: "hẹn 18h", handledBy: "s@x" }), true);
await check("staff KHÔNG sửa SĐT người gửi", updateDoc(doc(st, "rentalRequests/ten2_rA2"), { phone: "0000000000" }), false);
await check("người gửi hủy yêu cầu", updateDoc(doc(t2, "rentalRequests/ten2_rA2"), { status: "huy" }), true);
await check("người gửi gửi lại sau khi hủy", setDoc(doc(t2, "rentalRequests/ten2_rA2"), rq({ note: "gửi lại" })), true);
await check("manager từ chối", updateDoc(doc(man, "rentalRequests/ten2_rA2"), { status: "tu_choi" }), true);
await check("người gửi KHÔNG gửi lại khi đã bị từ chối", setDoc(doc(t2, "rentalRequests/ten2_rA2"), rq({ note: "x" })), false);
await check("manager khu A KHÔNG đọc yêu cầu khu B (truy vấn)", getDocs(query(collection(man, "rentalRequests"), where("propertyId", "==", "B"))), false);

// ===== Hồ sơ của tôi (profiles) & liên kết yêu cầu ↔ hồ sơ/hợp đồng =====
const prof = (uid, o = {}) => ({ fullName: "Bình", phone: "0909", docType: "cccd", idNumber: "079099000222", idFront: `profiles/${uid}/idFront-1.jpg`, ...o });
await check("người dùng lưu hồ sơ của mình", setDoc(doc(t2, "profiles/ten2"), prof("ten2")), true);
await check("người dùng đọc hồ sơ của mình", getDoc(doc(t2, "profiles/ten2")), true);
await check("người khác KHÔNG đọc hồ sơ", getDoc(doc(t1, "profiles/ten2")), false);
await check("chủ KHÔNG đọc thẳng hồ sơ cá nhân", getDoc(doc(own, "profiles/ten2")), false);
await check("manager KHÔNG đọc thẳng hồ sơ cá nhân", getDoc(doc(man, "profiles/ten2")), false);
await check("KHÔNG ghi hồ sơ của người khác", setDoc(doc(t1, "profiles/ten2"), prof("ten2")), false);
await check("KHÔNG trỏ ảnh sang thư mục người khác", setDoc(doc(t2, "profiles/ten2"), prof("ten2", { idFront: "tenants/A/tA1/idFront.jpg" })), false);
await check("KHÔNG trỏ ảnh sang hồ sơ người khác", setDoc(doc(t2, "profiles/ten2"), prof("ten2", { idBack: "profiles/ten1/x.jpg" })), false);
await check("hồ sơ KHÔNG nhận loại giấy tờ lạ", setDoc(doc(t2, "profiles/ten2"), prof("ten2", { docType: "abc" })), false);
await check("gửi đăng ký kèm đồng ý chia sẻ hồ sơ", setDoc(doc(t1, "rentalRequests/ten1_rA2"), rq({ createdBy: "ten1", shareProfile: true })), true);
await check("KHÔNG gửi shareProfile sai kiểu", setDoc(doc(t2, "rentalRequests/ten2_rA9"), rq({ roomId: "rA9", shareProfile: "yes" })), false);
await check("manager gắn hồ sơ + hợp đồng vào yêu cầu", updateDoc(doc(man, "rentalRequests/ten1_rA2"), { tenantId: "tA1", contractId: "cA1", status: "da_thue" }), true);
await check("manager chuyển yêu cầu sang kết thúc thuê", updateDoc(doc(man, "rentalRequests/ten1_rA2"), { status: "ket_thuc" }), true);
await check("manager đổi lại trạng thái khi bấm nhầm", updateDoc(doc(man, "rentalRequests/ten1_rA2"), { status: "da_thue" }), true);
await check("người gửi KHÔNG tự gắn hợp đồng", updateDoc(doc(t1, "rentalRequests/ten1_rA2"), { contractId: "x" }), false);
await check("người gửi KHÔNG gửi lại khi đang thuê", setDoc(doc(t1, "rentalRequests/ten1_rA2"), rq({ createdBy: "ten1", note: "lại" })), false);
await updateDoc(doc(man, "rentalRequests/ten1_rA2"), { status: "ket_thuc" });
await check("người gửi gửi lại sau khi đã kết thúc thuê", setDoc(doc(t1, "rentalRequests/ten1_rA2"), rq({ createdBy: "ten1", note: "thuê lại" })), true);

// ===== Nhật ký, ngân hàng, Telegram =====
await check("staff ghi nhật ký của mình", addDoc(collection(st, "auditLog"), { by: "stA", at: serverTimestamp(), action: "x", summary: "y" }), true);
await check("staff KHÔNG ghi nhật ký giả người khác", addDoc(collection(st, "auditLog"), { by: "own", at: serverTimestamp(), action: "x", summary: "y" }), false);
await check("tenant KHÔNG ghi nhật ký", addDoc(collection(t1, "auditLog"), { by: "ten1", at: serverTimestamp(), action: "x", summary: "y" }), false);
await check("staff KHÔNG đọc nhật ký", getDocs(collection(st, "auditLog")), false);
await check("manager đọc nhật ký", getDocs(collection(man, "auditLog")), true);
await check("manager gán giao dịch ngân hàng", updateDoc(doc(man, "bankTx/b1"), { matched: true, invoiceId: "iA1", reason: "", assignedBy: "manA" }), true);
await check("staff KHÔNG đọc giao dịch ngân hàng", getDoc(doc(st, "bankTx/b1")), false);
await check("tenant đọc liên kết Telegram của mình", getDoc(doc(t1, "tgTenants/555")), true);
await check("tenant KHÔNG tự tạo liên kết Telegram", setDoc(doc(t2, "tgTenants/777"), { uid: "ten2" }), false);
await check("chủ KHÔNG đọc tgLinks (chỉ server)", getDoc(doc(own, "tgLinks/ABCD1234")), false);

// ===== Bootstrap chủ đầu tiên (môi trường trống) =====
await env.clearFirestore();
{
  const first = ctx("first");
  const b = writeBatch(first);
  b.set(doc(first, "meta/bootstrap"), { uid: "first" });
  b.set(doc(first, "users/first"), { role: "owner", email: "f@x" });
  await check("người đầu tiên thành chủ", b.commit(), true);
  const second = ctx("second");
  const b2 = writeBatch(second);
  b2.set(doc(second, "users/second"), { role: "owner", email: "s@x" });
  await check("người thứ hai KHÔNG thành chủ", b2.commit(), false);
}

await env.cleanup();
console.log(`\n${pass} đạt, ${fail} lỗi`);
process.exit(fail ? 1 : 0);
