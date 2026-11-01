"use strict";
/** Webhook báo biến động số dư (SePay, Casso): tự cộng tiền vào hóa đơn theo mã "NHATRO <mã>" trong nội dung chuyển khoản. */
const crypto = require("crypto");
const { esc, money, fmtPeriod, todayVN, safeEq, TRANSFER_PREFIX } = require("./common");

/** Mã hóa đơn (6 ký tự) sau tiền tố NHATRO; ngân hàng có thể bỏ khoảng trắng, đổi hoa/thường. */
function extractCode(content) {
  const m = new RegExp(`${TRANSFER_PREFIX}[\\s._-]*([A-Z0-9]{6})(?![A-Z0-9])`).exec(String(content ?? "").toUpperCase());
  return m ? m[1] : "";
}

/** Chuẩn hóa giao dịch SePay ({ id, transferType, transferAmount, content… }) và Casso ({ data: [...] }); bỏ tiền ra. */
function normalize(body) {
  const txs = [];
  const b = body && typeof body === "object" ? body : {};
  if (Array.isArray(b.data)) {
    for (const t of b.data) {
      const amount = Number(t?.amount);
      const id = String(t?.id ?? t?.tid ?? "");
      if (id && amount > 0) txs.push({ source: "casso", id, amount, content: String(t.description ?? t.content ?? ""), when: String(t.when ?? ""), account: String(t.bank_sub_acc_id ?? t.subAccId ?? "") });
    }
  } else if (b.id != null && b.transferType) {
    const amount = Number(b.transferAmount);
    if (b.transferType === "in" && amount > 0) txs.push({ source: "sepay", id: String(b.id), amount, content: String(b.content ?? b.description ?? ""), when: String(b.transactionDate ?? ""), account: String(b.accountNumber ?? "") });
  }
  return txs;
}

function createBankHook({ db, bot, now = () => new Date() } = {}) {
  const { FieldValue, Timestamp } = require("firebase-admin/firestore");
  const get = async (path) => { const s = await db.doc(path).get(); return s.exists ? { id: s.id, ...s.data() } : null; };

  async function credit(invoiceId, amount, note) {
    const ref = db.doc(`invoices/${invoiceId}`);
    return db.runTransaction(async (tx) => {
      const inv = (await tx.get(ref)).data();
      const paid = (inv.paid ?? 0) + amount;
      tx.update(ref, { paid, payLog: [...(inv.payLog ?? []), { amount, date: todayVN(now()), method: "bank", by: "bank", note, at: Timestamp.fromMillis(now().getTime()) }] });
      return { paid, total: inv.total };
    });
  }

  async function processTx(t) {
    const key = crypto.createHash("sha1").update(`${t.source}|${t.id}`).digest("hex");
    const ref = db.doc(`bankTx/${key}`);
    const code = extractCode(t.content);
    try { await ref.create({ source: t.source, txId: t.id, amount: t.amount, content: t.content.slice(0, 300), when: t.when, account: t.account, code, at: FieldValue.serverTimestamp(), matched: false, reason: "" }); }
    catch { return { id: t.id, result: "duplicate" }; }
    const inv = code ? (await db.collection("invoices").where("code", "==", code).limit(1).get()).docs.map((d) => ({ id: d.id, ...d.data() }))[0] : null;
    const reason = !code ? `Nội dung không có mã ${TRANSFER_PREFIX}` : !inv ? `Không có hóa đơn mã ${code}` : inv.status === "huy" ? `Hóa đơn ${code} đã hủy` : inv.status === "nhap" ? `Hóa đơn ${code} chưa phát hành` : "";
    if (reason) {
      await ref.update({ reason });
      if (bot) await bot.notifyManagers(`🏦 <b>Nhận ${money(t.amount)} nhưng chưa khớp hóa đơn</b>\n${esc(reason)}\nNội dung: <code>${esc(t.content.slice(0, 120))}</code>\nGán thủ công: trang quản trị → Đối soát ngân hàng.`, undefined, inv?.propertyId ?? "");
      return { id: t.id, result: "unmatched" };
    }
    const r = await credit(inv.id, t.amount, `Chuyển khoản (${t.source} #${t.id})`);
    await ref.update({ matched: true, invoiceId: inv.id, reason: "" });
    if ((await get("settings/audit"))?.enabled !== false) {
      await db.collection("auditLog").add({ at: FieldValue.serverTimestamp(), by: "bank", byName: "Ngân hàng (tự động)", role: "bank", action: "payment.in", summary: `Nhận ${money(t.amount)} — ${inv.roomCode} kỳ ${fmtPeriod(inv.period)} (${code})`, targetType: "invoice", targetId: inv.id }).catch(() => {});
    }
    if (bot) {
      const left = r.total - r.paid;
      await bot.notifyManagers(`💰 <b>Đã nhận ${money(t.amount)}</b> · phòng <b>${esc(inv.roomCode)}</b> · kỳ ${fmtPeriod(inv.period)}\n${esc(inv.tenantName ?? "")} · ${left > 0 ? `còn thiếu ${money(left)}` : left < 0 ? `trả dư ${money(-left)}` : "đã đủ ✅"}`, undefined, inv.propertyId);
      await bot.notifyTenants(inv.tenantUids, `✅ Chủ nhà đã nhận ${money(t.amount)} cho hóa đơn kỳ ${fmtPeriod(inv.period)} (phòng ${esc(inv.roomCode)}).${left > 0 ? ` Còn thiếu ${money(left)}.` : " Cảm ơn bạn!"}`);
    }
    return { id: t.id, result: "matched", invoiceId: inv.id };
  }

  async function handle(body, headers = {}) {
    const cfg = await get("settings/bankhook");
    if (!cfg?.token) return { status: 503, json: { success: false, error: 1, message: "not configured" } };
    const auth = String(headers.authorization ?? "").replace(/^(Apikey|Bearer)\s+/i, "");
    if (!safeEq(auth, cfg.token) && !safeEq(headers["secure-token"], cfg.token)) return { status: 401, json: { success: false, error: 1, message: "unauthorized" } };
    const results = [];
    for (const t of normalize(body)) {
      try { results.push(await processTx(t)); } catch (e) { console.error("bank tx", t.id, e.message); results.push({ id: t.id, result: "error" }); }
    }
    return { status: 200, json: { success: true, error: 0, results } };
  }

  return { handle };
}

module.exports = { createBankHook, extractCode, normalize };
