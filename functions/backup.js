"use strict";

/** Các bộ sưu tập được sao lưu (không gồm ảnh giấy tờ trong Storage, không gồm nhật ký tạm như tgRate/tgSent/pend). */
const COLLECTIONS = ["users", "profiles", "rentalRequests", "properties", "rooms", "listings", "tenants", "contracts", "meterReadings", "invoices", "transactions", "tickets", "bankTx", "settings", "tgChats", "tgTenants"];
const NAME_RE = /^nhatro-\d{8}-\d{6}\.json$/;
const PREFIX = "backups/";

/** Chuyển giá trị Firestore thành JSON thường (Timestamp → {"__ts": ISO}). */
function plain(v) {
  if (v && typeof v === "object") {
    if (typeof v.toDate === "function" && typeof v.seconds === "number") return { __ts: v.toDate().toISOString() };
    if (Array.isArray(v)) return v.map(plain);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  }
  return v;
}

const stamp = (d) => {
  const vn = new Date(d.getTime() + 7 * 3600000); // giờ Việt Nam
  const p = (n) => String(n).padStart(2, "0");
  return `${vn.getUTCFullYear()}${p(vn.getUTCMonth() + 1)}${p(vn.getUTCDate())}-${p(vn.getUTCHours())}${p(vn.getUTCMinutes())}${p(vn.getUTCSeconds())}`;
};

function createBackup({ db, bucket, now = () => new Date() }) {
  async function run(keep = 14) {
    const at = now();
    const data = { app: "nhatro", createdAt: at.toISOString(), collections: {} };
    const counts = {};
    for (const c of COLLECTIONS) {
      const snap = await db.collection(c).get();
      data.collections[c] = Object.fromEntries(snap.docs.map((d) => [d.id, plain(d.data())]));
      counts[c] = snap.size;
    }
    const name = `nhatro-${stamp(at)}.json`;
    const body = JSON.stringify(data);
    await bucket.file(PREFIX + name).save(body, { contentType: "application/json", resumable: false });
    // Giữ lại `keep` bản mới nhất.
    const [files] = await bucket.getFiles({ prefix: PREFIX });
    const mine = files.filter((f) => NAME_RE.test(f.name.slice(PREFIX.length))).sort((a, b) => b.name.localeCompare(a.name));
    await Promise.all(mine.slice(Math.max(1, keep)).map((f) => f.delete()));
    const status = { at: at.toISOString(), ok: true, file: name, bytes: Buffer.byteLength(body), counts, kept: Math.min(mine.length, Math.max(1, keep)) };
    await db.doc("settings/backupStatus").set(status);
    return status;
  }
  async function list() {
    const [files] = await bucket.getFiles({ prefix: PREFIX });
    return files.filter((f) => NAME_RE.test(f.name.slice(PREFIX.length))).map((f) => ({ name: f.name.slice(PREFIX.length), bytes: Number(f.metadata?.size ?? 0) })).sort((a, b) => b.name.localeCompare(a.name));
  }
  async function get(name) {
    if (!NAME_RE.test(name)) throw Object.assign(new Error("Tên file không hợp lệ."), { code: "invalid-argument" });
    const [buf] = await bucket.file(PREFIX + name).download();
    if (buf.length > 8 * 1024 * 1024) throw Object.assign(new Error("File quá lớn để tải qua web (>8MB); hãy tải từ Cloud Storage trong Firebase Console."), { code: "failed-precondition" });
    return buf.toString("utf8");
  }
  /** Chạy theo lịch (mỗi ngày): đến lượt thì sao lưu. Lỗi được ghi vào backupStatus. */
  async function scheduled() {
    const cfg = (await db.doc("settings/backup").get()).data();
    if (!cfg || cfg.enabled !== true) return { skipped: "disabled" };
    const vnDay = new Date(now().getTime() + 7 * 3600000).getUTCDay();
    if (cfg.frequency === "weekly" && vnDay !== 0) return { skipped: "not-sunday" };
    try { return await run(cfg.keep ?? 14); } catch (e) {
      await db.doc("settings/backupStatus").set({ at: now().toISOString(), ok: false, error: String(e.message ?? e).slice(0, 300) });
      throw e;
    }
  }
  return { run, list, get, scheduled };
}
module.exports = { createBackup, COLLECTIONS, NAME_RE, plain, stamp };
