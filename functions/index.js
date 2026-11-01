"use strict";
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { createTelegram } = require("./telegram");
const { createBot, webhookSecret, STAFF_COMMANDS, PUBLIC_COMMANDS } = require("./bot");
const { createInvoices } = require("./invoices");
const { createBankHook } = require("./bankhook");
const { createBackup } = require("./backup");
const { safeEq } = require("./common");

initializeApp();
// Token bot đặt trong Secret Manager (CI ghi từ GitHub secret TELEGRAM_BOT_TOKEN). Giá trị "-" = chưa có bot: các hàm vẫn chạy, chỉ không gửi Telegram.
const TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");
const REGION = "asia-southeast1";
const APP_URL = "https://nhatroviet.web.app";
const opts = { region: REGION, secrets: [TOKEN] };
const schedOpts = { ...opts, timeZone: "Asia/Ho_Chi_Minh", timeoutSeconds: 300 };

const mem = new Map();
const hasBot = () => { const v = TOKEN.value(); return !!v && v !== "-"; };
/** Khi chưa có bot thì dùng máy khách "câm" để mọi việc khác vẫn chạy. */
const mute = { getMe: async () => ({ username: "" }), sendMessage: async () => ({}), sendPhoto: async () => ({}), editMessageText: async () => ({}), answerCallbackQuery: async () => ({}), setMyCommands: async () => ({}) };
const botFor = () => createBot({ db: getFirestore(), tg: hasBot() ? createTelegram(TOKEN.value()) : mute, mem, appUrl: APP_URL });
const needAuth = (req) => { if (!req.auth) throw new HttpsError("unauthenticated", "Cần đăng nhập."); return req.auth.uid; };
const CODES = ["invalid-argument", "failed-precondition", "permission-denied", "not-found"];
const wrap = (fn) => async (req) => { try { return await fn(req); } catch (e) { console.error(e); throw e instanceof HttpsError ? e : new HttpsError(CODES.includes(e.code) ? e.code : "internal", e.message); } };
const roleOf = async (uid) => (await getFirestore().doc(`users/${uid}`).get()).data()?.role;

/** Telegram gọi vào đây; chỉ nhận khi đúng mã bí mật của webhook. */
exports.telegramWebhook = onRequest(opts, async (req, res) => {
  if (!hasBot() || req.method !== "POST" || !safeEq(req.get("x-telegram-bot-api-secret-token"), webhookSecret(TOKEN.value()))) { res.status(403).send("forbidden"); return; }
  try { await botFor().handleUpdate(req.body ?? {}); } catch (e) { console.error("telegram update failed", e); }
  res.status(200).send("ok"); // luôn 200 để Telegram không gửi lại vô hạn
});

/** Chủ bấm "Kết nối bot" ở Cài đặt: đăng ký webhook + menu lệnh. */
exports.tgSetup = onCall(opts, wrap(async (req) => {
  if ((await roleOf(needAuth(req))) !== "owner") throw new HttpsError("permission-denied", "Chỉ chủ mới kết nối bot.");
  if (!hasBot()) throw new HttpsError("failed-precondition", "Chưa có token bot (GitHub secret TELEGRAM_BOT_TOKEN).");
  const tg = createTelegram(TOKEN.value());
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  const url = `https://${REGION}-${project}.cloudfunctions.net/telegramWebhook`;
  const me = await tg.getMe();
  await tg.setWebhook(url, webhookSecret(TOKEN.value()));
  await tg.setMyCommands(PUBLIC_COMMANDS);
  const staff = await getFirestore().collection("tgChats").get();
  await Promise.allSettled(staff.docs.map((d) => tg.setMyCommands(STAFF_COMMANDS, { type: "chat", chat_id: Number(d.id) })));
  return { username: me.username, url };
}));

/** Nhân viên / người thuê tạo đường dẫn liên kết Telegram (30 phút). */
exports.tgLinkCode = onCall(opts, wrap(async (req) => {
  if (!hasBot()) throw new HttpsError("failed-precondition", "Chủ nhà chưa kết nối bot Telegram.");
  return botFor().linkCode(needAuth(req), req.data?.kind === "tenant" ? "tenant" : "staff");
}));

/** Phát hành hóa đơn nháp (server tính lại số tiền) và gửi cho người thuê. */
exports.issueInvoices = onCall({ ...opts, timeoutSeconds: 300 }, wrap(async (req) => {
  const uid = needAuth(req);
  return createInvoices({ db: getFirestore(), bot: botFor() }).issue(uid, req.data?.ids);
}));

/** Gửi lại hóa đơn đã phát hành qua Telegram. */
exports.resendInvoice = onCall(opts, wrap(async (req) => {
  const uid = needAuth(req);
  const inv = (await getFirestore().doc(`invoices/${String(req.data?.id ?? "")}`).get()).data();
  const u = (await getFirestore().doc(`users/${uid}`).get()).data();
  const { canProp } = require("./common");
  if (!inv || !canProp(u, inv.propertyId)) throw new HttpsError("permission-denied", "Không có quyền.");
  return botFor().sendInvoice(String(req.data.id), { force: true });
}));

/** Người thuê nhập mã mời để xem hợp đồng/hóa đơn của mình. */
exports.claimInvite = onCall({ region: REGION }, wrap(async (req) => createInvoices({ db: getFirestore() }).claimInvite(needAuth(req), req.data?.code)));

/** Webhook biến động số dư (SePay/Casso). */
exports.bankHook = onRequest(opts, async (req, res) => {
  if (req.method !== "POST") { res.status(405).send("method not allowed"); return; }
  try {
    const r = await createBankHook({ db: getFirestore(), bot: botFor() }).handle(req.body, { authorization: req.get("authorization"), "secure-token": req.get("secure-token") });
    res.status(r.status).json(r.json);
  } catch (e) { console.error("bankHook", e); res.status(500).json({ success: false, error: 1 }); }
});

/** 08:00 hằng ngày: nhắc hạn thanh toán, hợp đồng sắp hết hạn, chỉ số chưa ghi, tạm trú. */
exports.dailyReminders = onSchedule({ ...schedOpts, schedule: "0 8 * * *" }, async () => { try { console.log("reminders", JSON.stringify(await botFor().reminders())); } catch (e) { console.error("reminders", e); } });
/** 21:00 hằng ngày: báo cáo cho chủ/quản lý. */
exports.dailyReport = onSchedule({ ...schedOpts, schedule: "0 21 * * *" }, async () => { try { await botFor().dailyReport(); } catch (e) { console.error("dailyReport", e); } });

// ===== Sao lưu (chỉ chủ) =====
const backupFor = () => createBackup({ db: getFirestore(), bucket: getStorage().bucket() });
const needOwner = async (req) => { if ((await roleOf(needAuth(req))) !== "owner") throw new HttpsError("permission-denied", "Chỉ chủ mới sao lưu được."); };
exports.backupNow = onCall({ region: REGION, timeoutSeconds: 300, memory: "512MiB" }, wrap(async (req) => {
  await needOwner(req);
  return backupFor().run((await getFirestore().doc("settings/backup").get()).data()?.keep ?? 14);
}));
exports.backupList = onCall({ region: REGION }, wrap(async (req) => { await needOwner(req); return { files: await backupFor().list() }; }));
exports.backupGet = onCall({ region: REGION, memory: "512MiB" }, wrap(async (req) => { await needOwner(req); return { name: req.data?.name, json: await backupFor().get(String(req.data?.name ?? "")) }; }));
exports.backupScheduled = onSchedule({ region: REGION, schedule: "0 2 * * *", timeZone: "Asia/Ho_Chi_Minh", timeoutSeconds: 540, memory: "512MiB" }, async () => { await backupFor().scheduled(); });
