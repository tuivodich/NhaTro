"use strict";
const crypto = require("node:crypto");

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = (n) => `${new Intl.NumberFormat("vi-VN").format(Math.round(n || 0))} đ`;
const fmtDate = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : s ?? ""; };
const fmtPeriod = (p) => { const m = /^(\d{4})-(\d{2})$/.exec(p ?? ""); return m ? `${m[2]}/${m[1]}` : p ?? ""; };
/** Ngày hôm nay theo giờ Việt Nam (yyyy-mm-dd). */
const todayVN = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(now);
const dayDiff = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const safeEq = (a, b) => { const x = Buffer.from(String(a ?? "")), y = Buffer.from(String(b ?? "")); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const err = (code, message) => Object.assign(new Error(message), { code });

/** Quyền theo khu, giống canProp/manages trong firestore.rules. */
const canProp = (u, pid) => !!u && (u.role === "owner" || (["manager", "staff"].includes(u.role) && !!u.props?.[pid]));
const manages = (u, pid) => !!u && (u.role === "owner" || (u.role === "manager" && !!u.props?.[pid]));
const STAFF = ["owner", "manager", "staff"];

/** Tiền tố trong nội dung chuyển khoản (khớp src/lib/banks.ts). */
const TRANSFER_PREFIX = "NHATRO";
function vietQrUrl(b, amount, info) {
  const q = new URLSearchParams({ addInfo: info, accountName: b.accountName });
  if (amount > 0) q.set("amount", String(Math.round(amount)));
  return `https://img.vietqr.io/image/${b.bankBin}-${b.accountNo}-compact2.png?${q.toString()}`;
}
const isBankReady = (b) => !!b && /^\d{6}$/.test(b.bankBin ?? "") && /^[0-9A-Za-z]{4,30}$/.test(b.accountNo ?? "") && !!b.accountName;

module.exports = { esc, money, fmtDate, fmtPeriod, todayVN, dayDiff, safeEq, err, canProp, manages, STAFF, TRANSFER_PREFIX, vietQrUrl, isBankReady };
