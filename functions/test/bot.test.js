"use strict";
// Chạy với Firestore Emulator: npm run test:emu (ở thư mục gốc).
const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { createBot, webhookSecret } = require("../bot");
const { createBankHook, extractCode, normalize } = require("../bankhook");
const { createInvoices } = require("../invoices");
const { buildInvoice } = require("../billing");

if (!getApps().length) initializeApp({ projectId: "demo-nhatro" });
const db = getFirestore();

function fakeTg() {
  const sent = [], photos = [], edits = [], answers = [];
  return {
    sent, photos, edits, answers,
    getMe: async () => ({ username: "nhatrobot" }),
    sendMessage: async (chat, text, extra) => { sent.push({ chat: String(chat), text, extra }); return {}; },
    sendPhoto: async (chat, photo, caption) => { photos.push({ chat: String(chat), photo, caption }); return {}; },
    editMessageText: async (chat, id, text) => { edits.push({ chat: String(chat), id, text }); return {}; },
    answerCallbackQuery: async (id, text) => { answers.push({ id, text }); return true; },
    setMyCommands: async () => true,
  };
}
const NOW = new Date("2026-11-03T03:00:00Z"); // 10:00 ngày 03/11/2026 giờ VN
const mk = () => { const tg = fakeTg(); return { tg, bot: createBot({ db, tg, now: () => NOW, randomCode: () => "ABCD1234", appUrl: "https://x.web.app" }) }; };
const msg = (chat, text, from = "Chủ") => ({ message: { chat: { id: chat, type: "private" }, from: { first_name: from }, text } });
const press = (chat, data) => ({ callback_query: { id: "cb1", data, from: { first_name: "Hà" }, message: { message_id: 9, text: "Hóa đơn", chat: { id: chat } } } });

const contract = {
  propertyId: "A", roomId: "rA1", roomCode: "P1", mainTenantId: "tA1", tenantName: "An", tenantUids: ["ten1"], status: "hieu_luc",
  occupants: [{ tenantId: "tA1", name: "An", from: "2026-01-01" }], start: "2026-01-01", end: "2026-11-20", rent: 3000000, deposit: 3000000, billingDay: 1,
  services: [{ id: "dien", name: "Điện", mode: "meter", unit: "kWh", price: 3500 }, { id: "rac", name: "Rác", mode: "room", unit: "tháng", price: 30000 }],
};

async function reset() {
  for (const c of ["users", "properties", "rooms", "contracts", "tenants", "invoices", "meterReadings", "tickets", "tgChats", "tgTenants", "tgLinks", "tgSent", "tgRate", "settings", "bankTx", "auditLog", "listings", "rentalRequests", "profiles", "tenants"]) {
    const s = await db.collection(c).get();
    await Promise.all(s.docs.map((d) => d.ref.delete()));
  }
  await db.doc("users/own").set({ role: "owner", email: "chu@x.vn" });
  await db.doc("users/stB").set({ role: "staff", email: "nvb@x.vn", props: { B: true } });
  await db.doc("users/stA").set({ role: "staff", email: "nva@x.vn", props: { A: true } });
  await db.doc("users/ten1").set({ role: "tenant", email: "an@x.vn" });
  await db.doc("properties/A").set({ name: "43/48 Cộng Hòa", billingDay: 1, dueDays: 5, roundTo: 1000, services: [] });
  await db.doc("properties/B").set({ name: "Hiệp Thành", billingDay: 1, dueDays: 5, services: [] });
  await db.doc("rooms/rA1").set({ propertyId: "A", code: "P1", rent: 3000000, status: "dang_thue" });
  await db.doc("rooms/rA2").set({ propertyId: "A", code: "P2", rent: 2800000, status: "trong" });
  await db.doc("contracts/cA1").set(contract);
  await db.doc("tenants/tA1").set({ propertyId: "A", fullName: "An", idNumber: "079099012345", phone: "090", inviteCode: "MOI123", tamTru: { status: "chua" } });
  await db.doc("tgChats/111").set({ uid: "own" });
  await db.doc("tgChats/222").set({ uid: "stB" });
  await db.doc("tgTenants/555").set({ uid: "ten1" });
  await db.doc("settings/bank").set({ bankBin: "970436", accountNo: "0123456789", accountName: "NGUYEN VAN CHU" });
}
const issuedInvoice = async (o = {}) => {
  const b = buildInvoice({ contract, period: "2026-11", readings: { dien: { old: 100, new: 190 } } });
  await db.doc("invoices/iA1").set({ code: "HD1234", propertyId: "A", roomId: "rA1", roomCode: "P1", contractId: "cA1", period: "2026-11", tenantUids: ["ten1"], tenantName: "An", lines: b.lines, total: b.total, paid: 0, payLog: [], status: "da_gui", dueDate: "2026-11-05", ...o });
  return b;
};

test("webhookSecret ổn định, phụ thuộc token; extractCode/normalize", () => {
  assert.equal(webhookSecret("t1"), webhookSecret("t1"));
  assert.notEqual(webhookSecret("t1"), webhookSecret("t2"));
  assert.equal(extractCode("CT DEN:123 NHATRO HD1234 chuyen tien"), "HD1234");
  assert.equal(extractCode("nhatro-hd1234"), "HD1234");
  assert.equal(extractCode("NHATROHD12345"), ""); // dài hơn 6 ký tự: không nhận nhầm
  assert.equal(extractCode("tien phong"), "");
  assert.deepEqual(normalize({ id: 1, transferType: "out", transferAmount: 5 }), []);
  assert.equal(normalize({ data: [{ id: 9, amount: 10, description: "x" }, { id: 10, amount: -5 }] }).length, 1);
});

test("liên kết: nhân viên và người thuê; mã hết hạn bị từ chối", async () => {
  await reset();
  const { tg, bot } = mk();
  const l = await bot.linkCode("stA", "staff");
  assert.equal(l.link, "https://t.me/nhatrobot?start=ABCD1234");
  await bot.handleUpdate(msg(333, "/start ABCD1234"));
  assert.equal((await db.doc("tgChats/333").get()).data().uid, "stA");
  assert.equal((await db.doc("tgLinks/ABCD1234").get()).exists, false, "mã dùng một lần");
  await assert.rejects(bot.linkCode("ten1", "staff"), /Chỉ chủ/);
  await bot.linkCode("ten1", "tenant");
  await bot.handleUpdate(msg(444, "/start ABCD1234"));
  assert.equal((await db.doc("tgTenants/444").get()).data().uid, "ten1");
  await db.doc("tgLinks/ZZZZ9999").set({ uid: "own", kind: "staff", exp: NOW.getTime() - 1 });
  await bot.handleUpdate(msg(666, "/start ZZZZ9999"));
  assert.match(tg.sent.at(-1).text, /hết hạn/);
  assert.equal((await db.doc("tgChats/666").get()).exists, false);
});

test("/dien ghi chỉ số kỳ hiện tại; nhỏ hơn kỳ trước bị chặn; đã khóa bị chặn; khu khác không thấy", async () => {
  await reset();
  const { tg, bot } = mk();
  await db.doc("meterReadings/cA1_2026-10_dien").set({ propertyId: "A", contractId: "cA1", roomId: "rA1", period: "2026-10", serviceId: "dien", value: 100 });
  await bot.handleUpdate(msg(111, "/dien P1 1.234"));
  assert.equal((await db.doc("meterReadings/cA1_2026-11_dien").get()).data().value, 1234);
  assert.match(tg.sent.at(-1).text, /dùng 1134/);
  await bot.handleUpdate(msg(111, "/dien p1 50"));
  assert.match(tg.sent.at(-1).text, /nhỏ hơn/);
  await db.doc("meterReadings/cA1_2026-11_dien").update({ locked: true });
  await bot.handleUpdate(msg(111, "/dien P1 1300"));
  assert.match(tg.sent.at(-1).text, /đã khóa/);
  assert.equal((await db.doc("meterReadings/cA1_2026-11_dien").get()).data().value, 1234);
  await bot.handleUpdate(msg(111, "/nuoc P1 5"));
  assert.match(tg.sent.at(-1).text, /không tính nước/);
  await bot.handleUpdate(msg(222, "/dien P1 2000")); // nhân viên khu B
  assert.match(tg.sent.at(-1).text, /Không thấy phòng/);
});

test("khách vãng lai không dùng được lệnh nhân viên; /phongtrong đọc listings", async () => {
  await reset();
  const { tg, bot } = mk();
  await db.doc("listings/rA2").set({ propertyId: "A", code: "P2", name: "Phòng 2", address: "43/48 Cộng Hòa", rent: 2800000 });
  await bot.handleUpdate(msg(999, "/dien P1 5"));
  assert.doesNotMatch(tg.sent.at(-1).text, /Đã ghi/);
  await bot.handleUpdate(msg(999, "/phongtrong"));
  assert.match(tg.sent.at(-1).text, /Phòng 2/);
});

test("sendInvoice: gửi ảnh VietQR cho người thuê, chỉ một lần", async () => {
  await reset();
  const { tg, bot } = mk();
  await issuedInvoice();
  assert.equal((await bot.sendInvoice("iA1")).sent, 1);
  assert.equal(tg.photos.length, 1);
  assert.equal(tg.photos[0].chat, "555");
  assert.match(tg.photos[0].photo, /img\.vietqr\.io\/image\/970436-0123456789/);
  assert.equal(new URL(tg.photos[0].photo).searchParams.get("addInfo"), "NHATRO HD1234");
  assert.equal((await bot.sendInvoice("iA1")).duplicate, true);
  assert.equal(tg.photos.length, 1);
});

test("nút Đã thu tiền mặt: nhân viên khu khác bị từ chối; chủ ghi được; người thuê /no", async () => {
  await reset();
  const { tg, bot } = mk();
  const b = await issuedInvoice();
  await bot.handleUpdate(press(222, "pay:iA1"));
  assert.match(tg.answers.at(-1).text, /không phụ trách/);
  await bot.handleUpdate(press(111, "pay:iA1"));
  const inv = (await db.doc("invoices/iA1").get()).data();
  assert.equal(inv.paid, b.total);
  assert.equal(inv.payLog[0].method, "cash");
  assert.equal(inv.payLog[0].date, "2026-11-03");
  await bot.handleUpdate(press(111, "pay:iA1"));
  assert.match(tg.answers.at(-1).text, /đã thu đủ/);
  await bot.handleUpdate(msg(555, "/no", "An"));
  assert.match(tg.sent.at(-1).text, /không còn khoản nợ/);
});

test("người thuê báo hỏng → nhân viên khu nhận; bấm xong → người thuê được báo", async () => {
  await reset();
  const { tg, bot } = mk();
  await db.doc("tgChats/777").set({ uid: "stA" });
  await bot.handleUpdate(msg(555, "/baohong Vòi nước rỉ", "An"));
  const k = (await db.collection("tickets").get()).docs[0];
  assert.equal(k.data().roomId, "rA1");
  assert.equal(k.data().status, "moi");
  const toStaff = tg.sent.filter((s) => /Báo hỏng mới/.test(s.text)).map((s) => s.chat).sort();
  assert.deepEqual(toStaff, ["111", "777"], "chủ + nhân viên khu A, không gửi nhân viên khu B");
  await bot.handleUpdate(press(777, `tk:${k.id}`));
  assert.equal((await k.ref.get()).data().status, "xong");
  assert.ok(tg.sent.some((s) => s.chat === "555" && /xử lý xong/.test(s.text)));
});

test("reminders: nhắc đúng hạn, hợp đồng sắp hết hạn, chỉ số chưa ghi, tạm trú — chạy lại không gửi trùng", async () => {
  await reset();
  const { tg, bot } = mk();
  await issuedInvoice({ dueDate: "2026-11-03" });
  const r1 = await bot.reminders();
  assert.ok(r1.tenant >= 1);
  assert.ok(tg.sent.some((s) => s.chat === "555" && /Hôm nay là hạn/.test(s.text)));
  assert.ok(tg.sent.some((s) => s.chat === "111" && /sắp hết hạn/.test(s.text)));
  assert.ok(tg.sent.some((s) => s.chat === "111" && /chưa ghi chỉ số/.test(s.text)));
  assert.ok(tg.sent.some((s) => s.chat === "111" && /tạm trú/.test(s.text)));
  assert.ok(!tg.sent.some((s) => s.chat === "222"), "nhân viên khu B không nhận việc khu A");
  const n = tg.sent.length;
  await bot.reminders();
  assert.equal(tg.sent.length, n, "không gửi trùng");
});

test("bankHook: sai token 401; khớp mã cộng tiền + báo; trùng giao dịch bỏ qua; không mã → chưa khớp", async () => {
  await reset();
  const { tg, bot } = mk();
  await issuedInvoice();
  await db.doc("settings/bankhook").set({ token: "T".repeat(32) });
  const hook = createBankHook({ db, bot, now: () => NOW });
  assert.equal((await hook.handle({}, { authorization: "Apikey sai" })).status, 401);
  const tx = { id: 77, transferType: "in", transferAmount: 1000000, content: "NHATRO HD1234 tien nha", transactionDate: "2026-11-03 09:00:00", accountNumber: "0123456789" };
  const r = await hook.handle(tx, { authorization: "Apikey " + "T".repeat(32) });
  assert.equal(r.json.results[0].result, "matched");
  const inv = (await db.doc("invoices/iA1").get()).data();
  assert.equal(inv.paid, 1000000);
  assert.equal(inv.payLog[0].method, "bank");
  assert.ok(tg.sent.some((s) => s.chat === "111" && /Đã nhận/.test(s.text)));
  assert.ok(tg.sent.some((s) => s.chat === "555" && /đã nhận/.test(s.text)));
  assert.equal((await hook.handle(tx, { authorization: "Apikey " + "T".repeat(32) })).json.results[0].result, "duplicate");
  assert.equal((await db.doc("invoices/iA1").get()).data().paid, 1000000);
  const r2 = await hook.handle({ ...tx, id: 78, content: "chuyen tien" }, { "secure-token": "T".repeat(32) });
  assert.equal(r2.json.results[0].result, "unmatched");
});

test("issue: hóa đơn sai số bị từ chối; đúng thì phát hành, khóa chỉ số, gửi người thuê; nhân viên không phát hành được", async () => {
  await reset();
  const { tg, bot } = mk();
  const b = await issuedInvoice({ status: "nhap" });
  await db.doc("meterReadings/cA1_2026-11_dien").set({ propertyId: "A", contractId: "cA1", period: "2026-11", serviceId: "dien", value: 190 });
  await db.doc("meterReadings/cA1_2026-10_dien").set({ propertyId: "A", contractId: "cA1", period: "2026-10", serviceId: "dien", value: 100 });
  await db.doc("invoices/bad").set({ ...(await db.doc("invoices/iA1").get()).data(), code: "BAD000", total: b.total - 5000 });
  const iss = createInvoices({ db, bot, now: () => NOW });
  const st = await iss.issue("stA", ["iA1"]);
  assert.equal(st.issued.length, 0);
  assert.match(st.failed[0].problems[0], /quyền/);
  const r = await iss.issue("own", ["iA1", "bad"]);
  assert.deepEqual(r.issued, ["iA1"]);
  assert.equal(r.failed[0].id, "bad");
  assert.equal((await db.doc("invoices/iA1").get()).data().status, "da_gui");
  assert.equal((await db.doc("invoices/bad").get()).data().status, "nhap");
  assert.equal((await db.doc("meterReadings/cA1_2026-11_dien").get()).data().locked, true);
  assert.equal((await db.doc("meterReadings/cA1_2026-10_dien").get()).data().locked, true);
  assert.equal(r.sent, 1);
  assert.equal(tg.photos.length, 1);
});

test("claimInvite: gắn uid vào hồ sơ, hợp đồng, hóa đơn; mã sai bị từ chối", async () => {
  await reset();
  await db.doc("users/ten2").set({ role: "tenant", email: "b@x.vn" });
  await db.doc("contracts/cA1").update({ tenantUids: [] });
  await issuedInvoice({ tenantUids: [] });
  const iss = createInvoices({ db });
  await assert.rejects(iss.claimInvite("ten2", "SAI999"), /không đúng/);
  const r = await iss.claimInvite("ten2", "moi123");
  assert.deepEqual({ c: r.contracts, i: r.invoices }, { c: 1, i: 1 });
  assert.equal((await db.doc("tenants/tA1").get()).data().uid, "ten2");
  assert.equal((await db.doc("tenants/tA1").get()).data().inviteCode, undefined);
  assert.deepEqual((await db.doc("contracts/cA1").get()).data().tenantUids, ["ten2"]);
  assert.deepEqual((await db.doc("invoices/iA1").get()).data().tenantUids, ["ten2"]);
  await assert.rejects(iss.claimInvite("ten2", "MOI123"), /không đúng/);
});

test("dailyReport: gửi chủ (không gửi nhân viên)", async () => {
  await reset();
  const { tg, bot } = mk();
  await issuedInvoice({ paid: 500000, payLog: [{ amount: 500000, date: "2026-11-03", method: "cash", by: "x" }] });
  assert.equal((await bot.dailyReport()).sent, 1);
  assert.match(tg.sent[0].text, /Tiền vào hôm nay: <b>500\.000 đ/);
  assert.equal(tg.sent[0].chat, "111");
});

test("đăng ký thuê: báo chủ + nhân viên khu A (không báo khu B), một lần; nút giữ chỗ gỡ phòng khỏi trang công khai", async () => {
  await reset();
  const { tg, bot } = mk();
  const { Timestamp } = require("firebase-admin/firestore");
  await db.doc("tgChats/777").set({ uid: "stA" });
  await db.doc("listings/rA2").set({ propertyId: "A", code: "P2", rent: 2800000 });
  await db.doc("rentalRequests/ten1_rA2").set({ roomId: "rA2", propertyId: "A", roomCode: "P2", propertyName: "43/48 Cộng Hòa", name: "Bình <b>", phone: "0909 123 456", people: 2, moveIn: "2026-12-01", status: "moi", createdBy: "ten1", createdAt: Timestamp.fromMillis(1) });
  assert.equal((await bot.notifyRequest("ten1_rA2")).sent, 2);
  assert.deepEqual(tg.sent.map((x) => x.chat).sort(), ["111", "777"]);
  assert.match(tg.sent[0].text, /Bình &lt;b&gt;/);
  assert.equal(tg.sent[0].extra.reply_markup.inline_keyboard[0].length, 3);
  assert.equal((await bot.notifyRequest("ten1_rA2")).duplicate, true);
  // Nhân viên không giữ chỗ được, nhân viên khu khác không đụng được
  await bot.handleUpdate(press(777, "rqh:ten1_rA2"));
  assert.match(tg.answers.at(-1).text, /Chỉ chủ\/quản lý/);
  await bot.handleUpdate(press(222, "rqc:ten1_rA2"));
  assert.match(tg.answers.at(-1).text, /không phụ trách/);
  await bot.handleUpdate(press(777, "rqc:ten1_rA2"));
  assert.equal((await db.doc("rentalRequests/ten1_rA2").get()).data().status, "da_lien_he");
  await bot.handleUpdate(press(111, "rqh:ten1_rA2"));
  assert.equal((await db.doc("rentalRequests/ten1_rA2").get()).data().status, "giu_cho");
  assert.equal((await db.doc("rooms/rA2").get()).data().status, "giu_cho");
  assert.equal((await db.doc("listings/rA2").get()).exists, false);
  // Gửi lại sau khi hủy (createdAt mới) thì báo lại
  await db.doc("rentalRequests/ten1_rA2").update({ status: "moi", createdAt: Timestamp.fromMillis(2) });
  assert.equal((await bot.notifyRequest("ten1_rA2")).sent, 2);
});

const { createRequests } = require("../requests");
test("tenantFromRequest: chỉ chủ/quản lý của khu; chép hồ sơ + ảnh khi đồng ý; gắn uid; không chép ảnh ngoài thư mục; dùng lại", async () => {
  await reset();
  const copies = [];
  const bucket = { file: (p) => ({ name: p, copy: async (dest) => { if (p.includes("missing")) throw new Error("404"); copies.push([p, dest.name]); } }) };
  const rq = createRequests({ db, bucket, now: () => NOW });
  await db.doc("profiles/ten1").set({ fullName: "Nguyễn Bình", phone: "0909", docType: "passport", idNumber: "M1234567", nationality: "Hàn Quốc",
    idFront: "profiles/ten1/front.jpg", idBack: "tenants/A/other/idBack.jpg", portrait: "profiles/ten1/missing.jpg" });
  await db.doc("rentalRequests/ten1_rA2").set({ roomId: "rA2", propertyId: "A", roomCode: "P2", name: "Bình", phone: "0911", people: 1, status: "giu_cho", createdBy: "ten1", shareProfile: true });
  await assert.rejects(rq.tenantFromRequest("stA", "ten1_rA2"), /Chỉ chủ\/quản lý/);
  await assert.rejects(rq.tenantFromRequest("stB", "ten1_rA2"), /Chỉ chủ\/quản lý/);
  const r = await rq.tenantFromRequest("own", "ten1_rA2");
  assert.equal(r.fromProfile, true);
  assert.equal(r.copiedImages, 1, "chỉ chép ảnh hợp lệ trong profiles/ten1/");
  const t = (await db.doc(`tenants/${r.tenantId}`).get()).data();
  assert.equal(t.fullName, "Nguyễn Bình"); assert.equal(t.docType, "passport"); assert.equal(t.nationality, "Hàn Quốc");
  assert.equal(t.uid, "ten1"); assert.equal(t.consent, true); assert.equal(t.propertyId, "A");
  assert.match(t.idFront, new RegExp(`^tenants/A/${r.tenantId}/idFront-`));
  assert.equal(t.idBack, undefined, "không chép ảnh trỏ ra ngoài thư mục hồ sơ");
  assert.deepEqual(copies.map((c) => c[0]), ["profiles/ten1/front.jpg"]);
  assert.equal((await db.doc("rentalRequests/ten1_rA2").get()).data().tenantId, r.tenantId);
  assert.deepEqual(await rq.tenantFromRequest("own", "ten1_rA2"), { tenantId: r.tenantId, existing: true });
  // Không đồng ý chia sẻ → chỉ họ tên + SĐT trong yêu cầu
  await db.doc("rentalRequests/ten1_rA9").set({ roomId: "rA9", propertyId: "B", roomCode: "N9", name: "Bình", phone: "0911", people: 1, status: "moi", createdBy: "ten1", shareProfile: false });
  const r2 = await rq.tenantFromRequest("own", "ten1_rA9");
  const t2 = (await db.doc(`tenants/${r2.tenantId}`).get()).data();
  assert.equal(r2.fromProfile, false); assert.equal(t2.fullName, "Bình"); assert.equal(t2.idNumber, ""); assert.equal(t2.uid, "ten1"); assert.equal(t2.consent, false);
});
