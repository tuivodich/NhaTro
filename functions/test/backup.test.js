"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { createBackup, plain, stamp } = require("../backup");

if (!getApps().length) initializeApp({ projectId: "demo-nhatro" });
const db = getFirestore();

function fakeBucket() {
  const files = new Map();
  return {
    files,
    file: (name) => ({
      name,
      save: async (body) => { files.set(name, Buffer.from(body)); },
      download: async () => [files.get(name)],
      delete: async () => { files.delete(name); },
    }),
    getFiles: async ({ prefix }) => [[...files.keys()].filter((n) => n.startsWith(prefix)).map((n) => ({ name: n, metadata: { size: String(files.get(n).length) }, delete: async () => { files.delete(n); } }))],
  };
}
async function reset() {
  for (const c of ["invoices", "rooms", "users", "settings", "tenants"]) { const s = await db.collection(c).get(); await Promise.all(s.docs.map((d) => d.ref.delete())); }
  await db.doc("rooms/r1").set({ name: "Gỗ 1", price: 500000 });
  await db.doc("invoices/b1").set({ tenantName: "An", total: 1000000, payLog: [{ amount: 1, at: Timestamp.fromDate(new Date("2026-11-01T00:00:00Z")) }] });
  await db.doc("users/u1").set({ role: "owner", email: "o@x" });
}

test("plain: Timestamp thành {__ts}, giữ nguyên phần còn lại", () => {
  assert.deepEqual(plain({ a: Timestamp.fromDate(new Date("2026-01-02T03:04:05Z")), b: [1, { c: "x" }], d: null }), { a: { __ts: "2026-01-02T03:04:05.000Z" }, b: [1, { c: "x" }], d: null });
});

test("stamp theo giờ Việt Nam", () => {
  assert.equal(stamp(new Date("2026-11-10T19:30:05Z")), "20261111-023005");
});

test("sao lưu: ghi file JSON đủ dữ liệu, ghi trạng thái, giữ N bản mới nhất", async () => {
  await reset();
  const bucket = fakeBucket();
  let t = new Date("2026-11-01T00:00:00Z");
  const b = createBackup({ db, bucket, now: () => t });
  const s1 = await b.run(2);
  assert.equal(s1.ok, true);
  assert.equal(s1.counts.invoices, 1);
  const body = JSON.parse(bucket.files.get(`backups/${s1.file}`).toString());
  assert.equal(body.collections.invoices.b1.tenantName, "An");
  assert.deepEqual(body.collections.invoices.b1.payLog[0].at, { __ts: "2026-11-01T00:00:00.000Z" });
  assert.equal(body.collections.rooms.r1.price, 500000);
  assert.equal((await db.doc("settings/backupStatus").get()).data().file, s1.file);
  for (const day of [2, 3, 4]) { t = new Date(`2026-11-0${day}T00:00:00Z`); await b.run(2); }
  const names = (await b.list()).map((f) => f.name);
  assert.equal(names.length, 2);
  assert.ok(names[0] > names[1]); // mới nhất trước
  assert.ok(!names.includes(s1.file)); // bản cũ nhất đã bị xóa
});

test("tải về một bản: chỉ nhận đúng tên file, không đọc đường dẫn lạ", async () => {
  await reset();
  const bucket = fakeBucket();
  const b = createBackup({ db, bucket });
  const s = await b.run(5);
  assert.match(await b.get(s.file), /"app":"nhatro"/);
  await assert.rejects(b.get("../secrets.json"), /không hợp lệ/);
  await assert.rejects(b.get("guests/x/abc.jpg"), /không hợp lệ/);
});

test("theo lịch: tắt thì bỏ qua; hằng tuần chỉ chạy Chủ nhật (giờ VN)", async () => {
  await reset();
  const bucket = fakeBucket();
  let t = new Date("2026-11-10T19:00:00Z"); // 11/11/2026 02:00 VN (thứ Tư)
  const b = createBackup({ db, bucket, now: () => t });
  assert.deepEqual(await b.scheduled(), { skipped: "disabled" });
  await db.doc("settings/backup").set({ enabled: true, frequency: "weekly", keep: 3 });
  assert.deepEqual(await b.scheduled(), { skipped: "not-sunday" });
  t = new Date("2026-11-14T19:00:00Z"); // 15/11/2026 02:00 VN (Chủ nhật)
  assert.equal((await b.scheduled()).ok, true);
  await db.doc("settings/backup").set({ enabled: true, frequency: "daily", keep: 3 });
  t = new Date("2026-11-11T19:00:00Z");
  assert.equal((await b.scheduled()).ok, true);
});

test("theo lịch: lỗi được ghi vào backupStatus", async () => {
  await reset();
  await db.doc("settings/backup").set({ enabled: true, frequency: "daily", keep: 3 });
  const broken = { file: () => ({ save: async () => { throw new Error("hết dung lượng"); } }), getFiles: async () => [[]] };
  await assert.rejects(createBackup({ db, bucket: broken }).scheduled(), /hết dung lượng/);
  const st = (await db.doc("settings/backupStatus").get()).data();
  assert.equal(st.ok, false);
  assert.match(st.error, /hết dung lượng/);
});
