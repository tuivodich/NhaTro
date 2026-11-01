"use strict";
/** Phát hành hóa đơn (server kiểm tra lại số tiền) và gắn tài khoản người thuê bằng mã mời. */
const { verifyInvoice, prevPeriod } = require("./billing");
const { todayVN, manages, err } = require("./common");

function createInvoices({ db, bot, now = () => new Date() }) {
  const { FieldValue } = require("firebase-admin/firestore");
  const get = async (path) => { const s = await db.doc(path).get(); return s.exists ? { id: s.id, ...s.data() } : null; };

  /**
   * Phát hành các hóa đơn nháp: tính lại từng dòng (functions/billing.js), sai thì không phát hành và trả lý do;
   * đúng thì chuyển "da_gui", khóa chỉ số điện nước đã dùng, gửi Telegram cho người thuê.
   */
  async function issue(uid, ids) {
    const u = await get(`users/${uid}`);
    if (!Array.isArray(ids) || !ids.length || ids.length > 200) throw err("invalid-argument", "Danh sách hóa đơn không hợp lệ.");
    const issued = [], failed = [];
    const props = new Map();
    for (const id of ids.map(String)) {
      const inv = await get(`invoices/${id}`);
      if (!inv) { failed.push({ id, problems: ["Không tìm thấy hóa đơn."] }); continue; }
      if (!manages(u, inv.propertyId)) { failed.push({ id, problems: ["Không có quyền với khu này."] }); continue; }
      if (inv.status !== "nhap") { failed.push({ id, problems: ["Hóa đơn không còn là nháp."] }); continue; }
      if (!props.has(inv.propertyId)) props.set(inv.propertyId, await get(`properties/${inv.propertyId}`));
      const roundTo = props.get(inv.propertyId)?.roundTo ?? 1000;
      const v = verifyInvoice(inv, roundTo);
      if (!v.ok) { failed.push({ id, problems: v.problems }); continue; }
      const batch = db.batch();
      batch.update(db.doc(`invoices/${id}`), { status: "da_gui", issuedOn: todayVN(now()) });
      for (const l of inv.lines ?? []) {
        if (l.kind !== "service" || l.old == null || !l.serviceId) continue;
        for (const p of [inv.period, prevPeriod(inv.period)]) {
          const ref = db.doc(`meterReadings/${inv.contractId}_${p}_${l.serviceId}`);
          if ((await ref.get()).exists) batch.update(ref, { locked: true });
        }
      }
      await batch.commit();
      issued.push(id);
    }
    let sent = 0;
    if (bot) for (const id of issued) { try { sent += (await bot.sendInvoice(id)).sent; } catch (e) { console.error("sendInvoice", id, e.message); } }
    return { issued, failed, sent };
  }

  /** Người thuê nhập mã mời (quản lý tạo trên hồ sơ): gắn uid vào hồ sơ, các hợp đồng đang hiệu lực và hóa đơn của họ. */
  async function claimInvite(uid, rawCode) {
    const code = String(rawCode ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{6,10}$/.test(code)) throw err("invalid-argument", "Mã mời không hợp lệ.");
    const u = await get(`users/${uid}`);
    if (!u) throw err("failed-precondition", "Chưa có tài khoản.");
    const hit = (await db.collection("tenants").where("inviteCode", "==", code).limit(1).get()).docs[0];
    if (!hit) throw err("not-found", "Mã mời không đúng hoặc đã dùng.");
    const t = hit.data();
    if (t.uid && t.uid !== uid) throw err("failed-precondition", "Hồ sơ này đã gắn với tài khoản khác.");
    await hit.ref.update({ uid, inviteCode: FieldValue.delete() });
    const contracts = (await db.collection("contracts").where("propertyId", "==", t.propertyId).get()).docs
      .filter((d) => d.data().status === "hieu_luc" && (d.data().occupants ?? []).some((o) => o.tenantId === hit.id));
    let invoices = 0;
    for (const c of contracts) {
      await c.ref.update({ tenantUids: FieldValue.arrayUnion(uid) });
      const invs = (await db.collection("invoices").where("contractId", "==", c.id).get()).docs.filter((d) => d.data().status !== "huy");
      for (const i of invs) { await i.ref.update({ tenantUids: FieldValue.arrayUnion(uid) }); invoices++; }
    }
    return { tenantId: hit.id, name: t.fullName, contracts: contracts.length, invoices };
  }

  return { issue, claimInvite };
}

module.exports = { createInvoices };
