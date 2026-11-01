"use strict";
/**
 * Bot Telegram của NhaTro (kế thừa cấu trúc bot Nhà Gỗ: factory nhận phụ thuộc tiêm vào để test với emulator).
 * Ba loại chat: nhân viên đã liên kết (tgChats), người thuê đã liên kết (tgTenants), khách vãng lai (giới hạn tần suất).
 */
const crypto = require("node:crypto");
const { payState } = require("./billing");
const { esc, money, fmtDate, fmtPeriod, todayVN, dayDiff, canProp, manages, STAFF, TRANSFER_PREFIX, vietQrUrl, isBankReady } = require("./common");

const STAFF_COMMANDS = [
  { command: "tongquan", description: "Tổng quan: phòng trống, công nợ, báo hỏng" },
  { command: "congno", description: "Danh sách phòng còn nợ" },
  { command: "phongtrong", description: "Phòng đang trống" },
  { command: "dien", description: "Ghi chỉ số điện (vd /dien P1 1234)" },
  { command: "nuoc", description: "Ghi chỉ số nước (vd /nuoc P1 56)" },
  { command: "hoadon", description: "Hóa đơn gần nhất của phòng (vd /hoadon P1)" },
  { command: "baohong", description: "Phiếu báo hỏng đang mở" },
  { command: "huylienket", description: "Ngừng nhận thông báo ở chat này" },
];
const TENANT_COMMANDS = [
  { command: "hoadon", description: "Hóa đơn của tôi (kèm mã QR chuyển khoản)" },
  { command: "no", description: "Số tiền còn nợ" },
  { command: "baohong", description: "Báo hỏng (vd /baohong Vòi nước rỉ)" },
  { command: "lienhe", description: "Liên hệ chủ nhà" },
  { command: "huylienket", description: "Ngừng nhận thông báo" },
];
const PUBLIC_COMMANDS = [
  { command: "phongtrong", description: "Phòng đang cho thuê" },
  { command: "lienhe", description: "Liên hệ chủ nhà" },
];
const STAFF_HELP = "Lệnh nhân viên:\n" + STAFF_COMMANDS.map((c) => `/${c.command} — ${c.description}`).join("\n");
const TENANT_HELP = "Lệnh người thuê:\n" + TENANT_COMMANDS.map((c) => `/${c.command} — ${c.description}`).join("\n");
const PUBLIC_HELP = "Xin chào! Đây là bot quản lý nhà trọ.\n" + PUBLIC_COMMANDS.map((c) => `/${c.command} — ${c.description}`).join("\n") +
  "\n\nNgười thuê: đăng nhập trang web → Tài khoản → “Nhận thông báo qua Telegram” để liên kết.";
const LIMITS = { memPerMin: 20, perMin: 6, perDay: 80 };
const STATE_VI = { chua_thu: "chưa thu", thu_mot_phan: "thu một phần", da_thu: "đã thu đủ", qua_han: "QUÁ HẠN" };

/** Mã bí mật gắn webhook: suy ra từ token để không cần thêm secret thứ hai. */
const webhookSecret = (token) => crypto.createHmac("sha256", token).update("nhatro-telegram-webhook").digest("hex").slice(0, 48);

function memAllow(mem, chatId, nowMs) {
  const e = mem.get(chatId);
  if (!e || nowMs - e.t >= 60000) { mem.set(chatId, { t: nowMs, n: 1 }); if (mem.size > 5000) for (const [k, v] of mem) if (nowMs - v.t >= 60000) mem.delete(k); return true; }
  e.n++;
  return e.n <= LIMITS.memPerMin;
}

function createBot({ db, tg, now = () => new Date(), randomCode, mem = new Map(), appUrl = "" }) {
  const { FieldValue, Timestamp } = require("firebase-admin/firestore");
  const code8 = randomCode ?? (() => crypto.randomBytes(6).toString("base64url").replace(/[-_]/g, "x").slice(0, 8).toUpperCase());
  const get = async (path) => { const s = await db.doc(path).get(); return s.exists ? { id: s.id, ...s.data() } : null; };
  const all = async (q) => (await q.get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const today = () => todayVN(now());
  const period = () => today().slice(0, 7);
  /** Chỉ gửi một lần cho mỗi khóa (an toàn khi lịch chạy lặp/trùng). */
  const once = async (key) => { try { await db.doc(`tgSent/${key}`).create({ at: FieldValue.serverTimestamp() }); return true; } catch { return false; } };
  const audit = async (by, action, summary, target) => {
    try {
      if ((await get("settings/audit"))?.enabled === false) return;
      await db.collection("auditLog").add({ at: FieldValue.serverTimestamp(), by, byName: by, role: "telegram", action, summary: String(summary).slice(0, 300), targetType: target?.type ?? "", targetId: target?.id ?? "" });
    } catch (e) { console.error("audit", e.message); }
  };
  const btnRow = (text, path) => (appUrl ? { reply_markup: { inline_keyboard: [[{ text, url: appUrl + path }]] } } : {});
  const send = (chatId, text, extra) => tg.sendMessage(chatId, text, extra);

  // ===== Người nhận =====
  /** Chat nhân viên kèm tài khoản hiện tại (kiểm lại vai trò mỗi lần, bị hạ quyền thì bỏ). */
  async function staffChats() {
    const chats = await all(db.collection("tgChats"));
    const out = [];
    for (const c of chats) { const u = await get(`users/${c.uid}`); if (u && STAFF.includes(u.role)) out.push({ ...c, user: u }); }
    return out;
  }
  /** Gửi cho chủ + quản lý của khu (pid rỗng: mọi chủ/quản lý). Nhân viên thường nhận khi `staffToo`. */
  async function notifyManagers(text, extra, pid = "", staffToo = false) {
    const chats = (await staffChats()).filter((c) => (pid ? (staffToo ? canProp(c.user, pid) : manages(c.user, pid)) : ["owner", "manager"].includes(c.user.role)));
    return (await Promise.allSettled(chats.map((c) => send(c.id, text, extra)))).filter((r) => r.status === "fulfilled").length;
  }
  async function tenantChats(uids) {
    if (!uids?.length) return [];
    const out = [];
    for (let i = 0; i < uids.length; i += 10) out.push(...(await all(db.collection("tgTenants").where("uid", "in", uids.slice(i, i + 10)))));
    return out;
  }

  // ===== Liên kết =====
  async function linkCode(uid, kind) {
    const u = await get(`users/${uid}`);
    if (!u) throw Object.assign(new Error("Chưa có tài khoản."), { code: "permission-denied" });
    if (kind === "staff" && !STAFF.includes(u.role)) throw Object.assign(new Error("Chỉ chủ, quản lý, nhân viên."), { code: "permission-denied" });
    const code = code8();
    await db.doc(`tgLinks/${code}`).set({ uid, kind, exp: now().getTime() + 30 * 60 * 1000 });
    const me = await tg.getMe();
    return { code, username: me.username, link: `https://t.me/${me.username}?start=${code}` };
  }

  // ===== Hóa đơn → người thuê =====
  const invoiceText = (inv, head) => [
    head,
    `🏠 Phòng <b>${esc(inv.roomCode)}</b> · kỳ ${fmtPeriod(inv.period)} · mã <code>${esc(inv.code)}</code>`,
    ...(inv.lines ?? []).map((l) => `• ${esc(l.label)}: ${money(l.amount)}`),
    `<b>Tổng: ${money(inv.total)}</b>${inv.paid ? ` · đã trả ${money(inv.paid)} · còn ${money(inv.total - inv.paid)}` : ""}`,
    inv.dueDate ? `Hạn thanh toán: ${fmtDate(inv.dueDate)}` : "",
    `Nội dung chuyển khoản: <code>${TRANSFER_PREFIX} ${esc(inv.code)}</code>`,
  ].filter(Boolean).join("\n");

  async function sendInvoice(invoiceId, { force = false } = {}) {
    const inv = await get(`invoices/${invoiceId}`);
    if (!inv || inv.status !== "da_gui") return { sent: 0 };
    if (!force && !(await once(`inv_${invoiceId}`))) return { sent: 0, duplicate: true };
    const chats = await tenantChats(inv.tenantUids);
    const bank = await get("settings/bank");
    const due = inv.total - (inv.paid ?? 0);
    const text = invoiceText(inv, "🧾 <b>Hóa đơn tiền nhà</b>");
    const extra = btnRow("🌐 Xem hóa đơn", `/hoa-don/${inv.id}`);
    const r = await Promise.allSettled(chats.map((c) => (isBankReady(bank) && due > 0
      ? tg.sendPhoto(c.id, vietQrUrl(bank, due, `${TRANSFER_PREFIX} ${inv.code}`), text.slice(0, 1000), extra)
      : send(c.id, text, extra))));
    return { sent: r.filter((x) => x.status === "fulfilled").length };
  }

  // ===== Lệnh =====
  async function accessibleRooms(u) {
    if (u.role === "owner") return all(db.collection("rooms"));
    const out = [];
    for (const pid of Object.keys(u.props ?? {})) out.push(...(await all(db.collection("rooms").where("propertyId", "==", pid))));
    return out;
  }
  async function findRoom(u, code) {
    const c = String(code ?? "").trim().toUpperCase();
    if (!c) return { error: "Thiếu mã phòng." };
    const hits = (await accessibleRooms(u)).filter((r) => String(r.code).toUpperCase() === c);
    if (!hits.length) return { error: `Không thấy phòng <b>${esc(c)}</b> trong các khu bạn quản lý.` };
    if (hits.length > 1) return { error: `Mã phòng ${esc(c)} trùng ở nhiều khu — hãy đặt mã phòng khác nhau.` };
    return { room: hits[0] };
  }
  const activeContract = async (roomId) => (await all(db.collection("contracts").where("roomId", "==", roomId).where("status", "==", "hieu_luc")))[0] ?? null;

  async function propsOf(u) {
    if (u.role === "owner") return all(db.collection("properties"));
    const out = [];
    for (const pid of Object.keys(u.props ?? {})) { const p = await get(`properties/${pid}`); if (p) out.push(p); }
    return out;
  }
  async function invoicesOf(pids) {
    const out = [];
    for (const pid of pids) out.push(...(await all(db.collection("invoices").where("propertyId", "==", pid).where("status", "==", "da_gui"))));
    return out;
  }

  async function overview(u) {
    const props = await propsOf(u);
    const t = today();
    const lines = [`📊 <b>Tổng quan ${fmtDate(t)}</b>`];
    for (const p of props.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
      const rooms = await all(db.collection("rooms").where("propertyId", "==", p.id));
      const invs = await invoicesOf([p.id]);
      const debt = invs.filter((i) => payState(i, t) !== "da_thu").reduce((s, i) => s + i.total - (i.paid ?? 0), 0);
      const late = invs.filter((i) => payState(i, t) === "qua_han").length;
      const tickets = (await all(db.collection("tickets").where("propertyId", "==", p.id))).filter((k) => k.status === "moi" || k.status === "dang_xu_ly").length;
      lines.push(`\n🏘 <b>${esc(p.name)}</b>\nĐang thuê ${rooms.filter((r) => r.status === "dang_thue").length}/${rooms.length} · trống ${rooms.filter((r) => r.status === "trong").length}`
        + `\nCòn nợ: ${money(debt)}${late ? ` (⚠️ ${late} hóa đơn quá hạn)` : ""}${tickets ? `\n🔧 Báo hỏng đang mở: ${tickets}` : ""}`);
    }
    return lines.join("\n");
  }

  async function debtList(u) {
    const t = today();
    const props = await propsOf(u);
    const name = Object.fromEntries(props.map((p) => [p.id, p.name]));
    const rows = (await invoicesOf(props.map((p) => p.id))).filter((i) => payState(i, t) !== "da_thu")
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    if (!rows.length) return "✅ Không còn phòng nào nợ.";
    return ["💸 <b>Công nợ</b>", ...rows.slice(0, 40).map((i) => `• ${esc(name[i.propertyId] ?? "")} · <b>${esc(i.roomCode)}</b> · ${fmtPeriod(i.period)} · còn ${money(i.total - (i.paid ?? 0))}${payState(i, t) === "qua_han" ? ` · ⚠️ quá hạn ${dayDiff(i.dueDate, t)} ngày` : ""}`)].join("\n");
  }

  async function vacant(chatId, u) {
    if (u) {
      const rooms = (await accessibleRooms(u)).filter((r) => r.status === "trong");
      return send(chatId, rooms.length ? ["🔑 <b>Phòng trống</b>", ...rooms.map((r) => `• <b>${esc(r.code)}</b>${r.name ? ` — ${esc(r.name)}` : ""} · ${money(r.rent)}/tháng`)].join("\n") : "Không có phòng trống.");
    }
    const ls = await all(db.collection("listings"));
    if (!ls.length) return send(chatId, "Hiện chưa có phòng trống. Vui lòng liên hệ chủ nhà: /lienhe");
    return send(chatId, ["🔑 <b>Phòng đang cho thuê</b>", ...ls.map((l) => `• ${esc(l.name || l.code)} — ${esc(l.address ?? "")}\n   ${money(l.rent)}/tháng${l.area ? ` · ${l.area} m²` : ""}`)].join("\n"), btnRow("🌐 Xem ảnh phòng", "/"));
  }

  async function contact(chatId) {
    const c = (await get("settings/contact")) ?? {};
    const rows = [c.name && `👤 ${esc(c.name)}`, c.phone && `📞 ${esc(c.phone)}`, c.zalo && `💬 Zalo: ${esc(c.zalo)}`, c.email && `✉️ ${esc(c.email)}`].filter(Boolean);
    return send(chatId, rows.length ? `<b>Liên hệ chủ nhà</b>\n${rows.join("\n")}` : "Chủ nhà chưa cập nhật thông tin liên hệ.");
  }

  async function recordMeter(chatId, u, serviceId, args) {
    const label = serviceId === "dien" ? "điện" : "nước";
    const [code, raw] = args;
    const value = Number(String(raw ?? "").replace(/[.,\s]/g, ""));
    if (!code || !Number.isFinite(value) || value < 0 || String(raw ?? "") === "") return send(chatId, `Cú pháp: /${serviceId} &lt;mã phòng&gt; &lt;chỉ số&gt;\nVí dụ: /${serviceId} P1 1234`);
    const f = await findRoom(u, code);
    if (f.error) return send(chatId, f.error);
    const c = await activeContract(f.room.id);
    if (!c) return send(chatId, `Phòng ${esc(f.room.code)} chưa có hợp đồng đang hiệu lực.`);
    if (!(c.services ?? []).some((s) => s.id === serviceId && s.mode === "meter")) return send(chatId, `Hợp đồng phòng ${esc(f.room.code)} không tính ${label} theo chỉ số.`);
    const p = period();
    const ref = db.doc(`meterReadings/${c.id}_${p}_${serviceId}`);
    const cur = (await ref.get()).data();
    if (cur?.locked) return send(chatId, `Chỉ số ${label} kỳ ${fmtPeriod(p)} của ${esc(f.room.code)} đã khóa (hóa đơn đã phát hành). Quản lý sửa trên web.`);
    const prevs = (await all(db.collection("meterReadings").where("contractId", "==", c.id))).filter((r) => r.serviceId === serviceId && r.period < p).sort((a, b) => b.period.localeCompare(a.period));
    const prev = prevs[0];
    if (prev && value < prev.value) return send(chatId, `⚠️ Chỉ số mới ${value} nhỏ hơn kỳ ${fmtPeriod(prev.period)} (${prev.value}). Kiểm tra lại (thay đồng hồ thì sửa trên web).`);
    await ref.set({ propertyId: c.propertyId, roomId: c.roomId, contractId: c.id, period: p, serviceId, value, readBy: u.email || "telegram", readOn: today(), locked: false });
    await audit(u.email || "telegram", "meter.set", `Chỉ số ${label} ${f.room.code} kỳ ${fmtPeriod(p)}: ${value}`, { type: "contract", id: c.id });
    return send(chatId, `✅ Đã ghi chỉ số ${label} <b>${esc(f.room.code)}</b> kỳ ${fmtPeriod(p)}: <b>${value}</b>${prev ? `\nKỳ trước ${prev.value} → dùng ${value - prev.value}` : ""}`);
  }

  async function roomInvoice(chatId, u, code) {
    const f = await findRoom(u, code);
    if (f.error) return send(chatId, f.error);
    const invs = (await all(db.collection("invoices").where("roomId", "==", f.room.id))).filter((i) => i.status === "da_gui").sort((a, b) => b.period.localeCompare(a.period));
    if (!invs.length) return send(chatId, `Phòng ${esc(f.room.code)} chưa có hóa đơn đã phát hành.`);
    const inv = invs[0];
    const st = payState(inv, today());
    const kb = st !== "da_thu" ? { reply_markup: { inline_keyboard: [[{ text: `💵 Đã thu tiền mặt ${money(inv.total - (inv.paid ?? 0))}`, callback_data: `pay:${inv.id}` }], [{ text: "📨 Gửi lại cho người thuê", callback_data: `rs:${inv.id}` }]] } } : {};
    return send(chatId, invoiceText(inv, `🧾 <b>Hóa đơn</b> · ${STATE_VI[st] ?? st}`), kb);
  }

  async function openTickets(chatId, u) {
    const props = await propsOf(u);
    const rows = [];
    for (const p of props) rows.push(...(await all(db.collection("tickets").where("propertyId", "==", p.id))).filter((k) => k.status === "moi" || k.status === "dang_xu_ly"));
    if (!rows.length) return send(chatId, "✅ Không có phiếu báo hỏng nào đang mở.");
    for (const k of rows.slice(0, 10)) {
      await send(chatId, `🔧 <b>${esc(k.roomCode ?? "")}</b> · ${esc(k.title)}${k.detail ? `\n${esc(k.detail)}` : ""}\n${fmtDate(k.createdOn)} · ${esc(k.createdName ?? "")}`, { reply_markup: { inline_keyboard: [[{ text: "✅ Đã xử lý xong", callback_data: `tk:${k.id}` }]] } });
    }
  }

  // ===== Người thuê =====
  async function tenantInvoices(chatId, link) {
    const invs = (await all(db.collection("invoices").where("tenantUids", "array-contains", link.uid))).filter((i) => i.status === "da_gui").sort((a, b) => b.period.localeCompare(a.period));
    if (!invs.length) return send(chatId, "Bạn chưa có hóa đơn nào.");
    const open = invs.filter((i) => payState(i, today()) !== "da_thu");
    for (const inv of (open.length ? open : invs.slice(0, 1)).slice(0, 5)) await sendInvoice(inv.id, { force: true });
  }
  async function tenantDebt(chatId, link) {
    const t = today();
    const invs = (await all(db.collection("invoices").where("tenantUids", "array-contains", link.uid))).filter((i) => i.status === "da_gui" && payState(i, t) !== "da_thu");
    if (!invs.length) return send(chatId, "✅ Bạn không còn khoản nợ nào. Cảm ơn bạn!");
    const sum = invs.reduce((s, i) => s + i.total - (i.paid ?? 0), 0);
    return send(chatId, [`💸 <b>Còn nợ: ${money(sum)}</b>`, ...invs.map((i) => `• Phòng ${esc(i.roomCode)} · kỳ ${fmtPeriod(i.period)} · ${money(i.total - (i.paid ?? 0))}${payState(i, t) === "qua_han" ? " · ⚠️ quá hạn" : ""}`), "Gõ /hoadon để nhận mã QR chuyển khoản."].join("\n"));
  }
  async function tenantTicket(chatId, link, text, fromName) {
    const title = String(text ?? "").trim().slice(0, 200);
    if (!title) return send(chatId, "Cú pháp: /baohong &lt;nội dung&gt;\nVí dụ: /baohong Vòi nước nhà tắm bị rỉ");
    const cs = (await all(db.collection("contracts").where("tenantUids", "array-contains", link.uid))).filter((c) => c.status === "hieu_luc");
    if (!cs.length) return send(chatId, "Không tìm thấy hợp đồng đang thuê của bạn.");
    const c = cs[0];
    const ref = await db.collection("tickets").add({ propertyId: c.propertyId, roomId: c.roomId, roomCode: c.roomCode ?? "", contractId: c.id, title, status: "moi", createdBy: link.uid, createdName: fromName || c.tenantName || "", createdOn: today() });
    await notifyManagers(`🔧 <b>Báo hỏng mới</b> · phòng <b>${esc(c.roomCode ?? "")}</b>\n${esc(title)}\nNgười báo: ${esc(fromName || c.tenantName || "")}`, { reply_markup: { inline_keyboard: [[{ text: "✅ Đã xử lý xong", callback_data: `tk:${ref.id}` }]] } }, c.propertyId, true);
    return send(chatId, "✅ Đã gửi báo hỏng cho chủ nhà. Bạn sẽ được báo khi xử lý xong.");
  }

  // ===== Giới hạn tần suất khách vãng lai =====
  async function rateCheck(chatId) {
    const ref = db.doc(`tgRate/${chatId}`);
    const t = now().getTime();
    const minKey = Math.floor(t / 60000), dayKey = today();
    return db.runTransaction(async (tx) => {
      const d = (await tx.get(ref)).data() ?? {};
      const m = d.minKey === minKey ? d.minN + 1 : 1;
      const dn = d.dayKey === dayKey ? d.dayN + 1 : 1;
      tx.set(ref, { minKey, minN: m, dayKey, dayN: dn, expireAt: new Date(t + 2 * 86400000) });
      return m <= LIMITS.perMin && dn <= LIMITS.perDay;
    });
  }

  async function handleMessage(msg) {
    const chatId = String(msg.chat.id);
    const text = String(msg.text ?? "").trim();
    if (!text.startsWith("/")) return;
    if (!memAllow(mem, chatId, now().getTime())) return;
    const [cmdRaw, ...rest] = text.split(/\s+/);
    const cmd = cmdRaw.split("@")[0].toLowerCase();
    const staffLink = await get(`tgChats/${chatId}`);
    const tenantLink = staffLink ? null : await get(`tgTenants/${chatId}`);
    if (!staffLink && !tenantLink && !(await rateCheck(chatId))) return;

    if (cmd === "/start") {
      const code = (rest[0] ?? "").toUpperCase();
      if (!/^[A-Z0-9]{8}$/.test(code)) return send(chatId, staffLink ? STAFF_HELP : tenantLink ? TENANT_HELP : PUBLIC_HELP);
      const link = await get(`tgLinks/${code}`);
      if (!link || link.exp < now().getTime()) return send(chatId, "Mã liên kết không đúng hoặc đã hết hạn (30 phút). Hãy tạo mã mới trên trang web.");
      const u = await get(`users/${link.uid}`);
      await db.doc(`tgLinks/${code}`).delete();
      if (!u) return send(chatId, "Không tìm thấy tài khoản.");
      if (link.kind === "staff") {
        if (!STAFF.includes(u.role)) return send(chatId, "Tài khoản này không còn quyền nhân viên.");
        await db.doc(`tgChats/${chatId}`).set({ uid: link.uid, email: u.email ?? "", name: msg.chat.title ?? msg.from?.first_name ?? "", linkedAt: FieldValue.serverTimestamp() });
        await tg.setMyCommands?.(STAFF_COMMANDS, { type: "chat", chat_id: Number(chatId) }).catch(() => {});
        return send(chatId, `✅ Đã liên kết với ${esc(u.email ?? "tài khoản của bạn")}. Chat này sẽ nhận thông báo tiền vào, công nợ, báo hỏng.\n\n${STAFF_HELP}`);
      }
      await db.doc(`tgTenants/${chatId}`).set({ uid: link.uid, name: msg.from?.first_name ?? "", linkedAt: FieldValue.serverTimestamp() });
      await tg.setMyCommands?.(TENANT_COMMANDS, { type: "chat", chat_id: Number(chatId) }).catch(() => {});
      return send(chatId, `✅ Đã liên kết Telegram với tài khoản ${esc(u.email ?? "của bạn")}. Bạn sẽ nhận hóa đơn hằng tháng và nhắc hạn tại đây.\n\n${TENANT_HELP}`);
    }
    if (cmd === "/lienhe") return contact(chatId);
    if (cmd === "/huylienket") {
      if (staffLink) { await db.doc(`tgChats/${chatId}`).delete(); return send(chatId, "Đã ngừng nhận thông báo ở chat này."); }
      if (tenantLink) { await db.doc(`tgTenants/${chatId}`).delete(); return send(chatId, "Đã ngừng nhận thông báo ở chat này."); }
      return send(chatId, "Chat này chưa liên kết tài khoản nào.");
    }

    if (staffLink) {
      const u = await get(`users/${staffLink.uid}`);
      if (!u || !STAFF.includes(u.role)) { await db.doc(`tgChats/${chatId}`).delete(); return send(chatId, "Tài khoản liên kết không còn quyền nhân viên; đã ngắt liên kết."); }
      if (cmd === "/tongquan") return send(chatId, await overview(u));
      if (cmd === "/congno") return send(chatId, await debtList(u));
      if (cmd === "/phongtrong") return vacant(chatId, u);
      if (cmd === "/dien" || cmd === "/nuoc") return recordMeter(chatId, u, cmd.slice(1), rest);
      if (cmd === "/hoadon") return rest[0] ? roomInvoice(chatId, u, rest[0]) : send(chatId, "Cú pháp: /hoadon &lt;mã phòng&gt;, vd /hoadon P1");
      if (cmd === "/baohong") return openTickets(chatId, u);
      return send(chatId, STAFF_HELP);
    }
    if (tenantLink) {
      if (cmd === "/hoadon") return tenantInvoices(chatId, tenantLink);
      if (cmd === "/no") return tenantDebt(chatId, tenantLink);
      if (cmd === "/baohong") return tenantTicket(chatId, tenantLink, rest.join(" "), msg.from?.first_name);
      return send(chatId, TENANT_HELP);
    }
    if (cmd === "/phongtrong") return vacant(chatId, null);
    return send(chatId, PUBLIC_HELP);
  }

  // ===== Nút bấm (chỉ nhân viên) =====
  async function markCashPaid(invoiceId, u, actor) {
    const ref = db.doc(`invoices/${invoiceId}`);
    return db.runTransaction(async (tx) => {
      const inv = (await tx.get(ref)).data();
      if (!inv) return { ok: false, text: "Không tìm thấy hóa đơn." };
      if (!canProp(u, inv.propertyId)) return { ok: false, text: "Bạn không phụ trách khu này." };
      if (inv.status !== "da_gui") return { ok: false, text: "Hóa đơn chưa phát hành hoặc đã hủy." };
      const due = inv.total - (inv.paid ?? 0);
      if (due <= 0) return { ok: false, text: "Hóa đơn đã thu đủ." };
      tx.update(ref, { paid: inv.total, payLog: [...(inv.payLog ?? []), { amount: due, date: todayVN(now()), method: "cash", by: actor, note: "Ghi qua Telegram", at: Timestamp.fromMillis(now().getTime()) }] });
      return { ok: true, text: `💵 ${esc(actor)} đã ghi thu tiền mặt ${money(due)}.`, inv };
    });
  }
  async function closeTicket(id, u, actor) {
    const ref = db.doc(`tickets/${id}`);
    const k = (await ref.get()).data();
    if (!k) return { ok: false, text: "Không tìm thấy phiếu." };
    if (!canProp(u, k.propertyId)) return { ok: false, text: "Bạn không phụ trách khu này." };
    if (k.status === "xong") return { ok: false, text: "Phiếu đã xử lý trước đó." };
    await ref.update({ status: "xong", doneOn: todayVN(now()) });
    const chats = await tenantChats([k.createdBy]);
    await Promise.allSettled(chats.map((c) => send(c.id, `✅ Báo hỏng “${esc(k.title)}” đã được xử lý xong.`)));
    return { ok: true, text: `✅ ${esc(actor)} đã xử lý xong.` };
  }

  async function handleCallback(cb) {
    const chatId = String(cb.message?.chat?.id ?? "");
    if (!memAllow(mem, chatId, now().getTime())) return;
    const [action, id] = String(cb.data ?? "").split(":");
    if (!["pay", "rs", "tk"].includes(action) || !id) return tg.answerCallbackQuery(cb.id, "Thao tác không hợp lệ");
    const link = await get(`tgChats/${chatId}`);
    const u = link && (await get(`users/${link.uid}`));
    if (!u || !STAFF.includes(u.role)) return tg.answerCallbackQuery(cb.id, "Chat chưa liên kết hoặc không đủ quyền");
    const actor = cb.from?.first_name || u.email || "nhân viên";
    let r;
    if (action === "pay") {
      r = await markCashPaid(id, u, actor);
      if (r.ok) await audit(actor, "payment.cash", `Thu tiền mặt hóa đơn ${r.inv.code} (${r.inv.roomCode}) qua Telegram`, { type: "invoice", id });
    } else if (action === "rs") {
      const inv = await get(`invoices/${id}`);
      r = !inv || !canProp(u, inv.propertyId) ? { ok: false, text: "Không đủ quyền." } : { ok: true, text: `📨 Đã gửi lại cho ${(await sendInvoice(id, { force: true })).sent} chat người thuê.` };
    } else r = await closeTicket(id, u, actor);
    await tg.answerCallbackQuery(cb.id, r.ok ? "Đã xong" : r.text.replace(/<[^>]+>/g, "").slice(0, 150));
    if (cb.message && action !== "rs") await tg.editMessageText(chatId, cb.message.message_id, `${esc(cb.message.text ?? "")}\n\n${r.text}`, { reply_markup: { inline_keyboard: [] } }).catch(() => {});
    else if (action === "rs") await send(chatId, r.text);
  }

  async function handleUpdate(update) {
    if (update.message) return handleMessage(update.message);
    if (update.callback_query) return handleCallback(update.callback_query);
  }

  // ===== Nhắc việc định kỳ (mỗi việc chỉ một lần nhờ tgSent) =====
  async function reminders() {
    const t = today(), p = period(), day = Number(t.slice(8, 10));
    const out = { tenant: 0, managers: 0 };
    const props = await all(db.collection("properties"));
    for (const prop of props) {
      // 1) Hóa đơn: nhắc người thuê trước hạn 1 ngày, đúng hạn, quá hạn 3 và 10 ngày.
      const invs = (await all(db.collection("invoices").where("propertyId", "==", prop.id).where("status", "==", "da_gui"))).filter((i) => payState(i, t) !== "da_thu" && i.dueDate);
      for (const inv of invs) {
        const d = dayDiff(inv.dueDate, t);
        const kind = d === -1 ? "truoc1" : d === 0 ? "dunghan" : d === 3 ? "tre3" : d === 10 ? "tre10" : "";
        if (!kind || !(await once(`rm_${kind}_${inv.id}`))) continue;
        const head = d < 0 ? "⏰ <b>Nhắc: ngày mai đến hạn thanh toán</b>" : d === 0 ? "⏰ <b>Hôm nay là hạn thanh toán</b>" : `⚠️ <b>Hóa đơn đã quá hạn ${d} ngày</b>`;
        const chats = await tenantChats(inv.tenantUids);
        out.tenant += (await Promise.allSettled(chats.map((c) => send(c.id, invoiceText(inv, head))))).filter((x) => x.status === "fulfilled").length;
      }
      const late = invs.filter((i) => payState(i, t) === "qua_han");
      if (late.length && (await once(`od_${t}_${prop.id}`))) {
        out.managers += await notifyManagers([`⚠️ <b>${esc(prop.name)}: ${late.length} hóa đơn quá hạn</b>`, ...late.map((i) => `• ${esc(i.roomCode)} · ${fmtPeriod(i.period)} · còn ${money(i.total - (i.paid ?? 0))} · trễ ${dayDiff(i.dueDate, t)} ngày`)].join("\n"), undefined, prop.id);
      }
      // 2) Hợp đồng sắp hết hạn: trước 30 và 7 ngày.
      const cs = await all(db.collection("contracts").where("propertyId", "==", prop.id).where("status", "==", "hieu_luc"));
      for (const c of cs) {
        if (!c.end) continue;
        const left = dayDiff(t, c.end);
        const key = left <= 7 ? "exp7" : left <= 30 ? "exp30" : "";
        if (key && (await once(`${key}_${c.id}`))) out.managers += await notifyManagers(`📄 <b>Hợp đồng sắp hết hạn</b>\n${esc(prop.name)} · phòng <b>${esc(c.roomCode ?? "")}</b> · ${esc(c.tenantName ?? "")}\nHết hạn ${fmtDate(c.end)} (${left < 0 ? `đã quá ${-left} ngày` : `còn ${left} ngày`}). Gia hạn hoặc thanh lý trên web.`, undefined, prop.id);
      }
      // 3) Đến ngày chốt: nhắc ghi chỉ số điện nước còn thiếu.
      if (day >= (prop.billingDay || 1)) {
        const need = [];
        for (const c of cs) {
          for (const s of (c.services ?? []).filter((x) => x.mode === "meter")) {
            if (!(await db.doc(`meterReadings/${c.id}_${p}_${s.id}`).get()).exists) need.push(`${c.roomCode ?? "?"} (${s.name.toLowerCase()})`);
          }
        }
        if (need.length && (await once(`meter_${prop.id}_${p}_${t}`)) && day - (prop.billingDay || 1) < 5) {
          out.managers += await notifyManagers(`📟 <b>${esc(prop.name)}: chưa ghi chỉ số kỳ ${fmtPeriod(p)}</b>\n${need.map(esc).join(", ")}\nGhi nhanh: /dien P1 1234 · /nuoc P1 56`, undefined, prop.id, true);
        }
      }
      // 4) Tạm trú sắp hết hạn (15 ngày) hoặc chưa đăng ký.
      const ts = await all(db.collection("tenants").where("propertyId", "==", prop.id));
      const activeIds = new Set(cs.flatMap((c) => (c.occupants ?? []).filter((o) => !o.to || o.to >= t).map((o) => o.tenantId)));
      const warn = ts.filter((x) => activeIds.has(x.id) && (x.tamTru?.status !== "da_dang_ky" || (x.tamTru?.to && dayDiff(t, x.tamTru.to) <= 15)));
      if (warn.length && (await once(`tamtru_${prop.id}_${p}`))) {
        out.managers += await notifyManagers(`🪪 <b>${esc(prop.name)}: tạm trú cần xử lý</b>\n${warn.map((x) => `• ${esc(x.fullName)} — ${x.tamTru?.status === "da_dang_ky" ? `hết hạn ${fmtDate(x.tamTru.to)}` : "chưa đăng ký"}`).join("\n")}`, undefined, prop.id);
      }
    }
    return out;
  }

  /** Báo cáo cuối ngày cho chủ/quản lý. */
  async function dailyReport() {
    const t = today();
    let sent = 0;
    for (const c of (await staffChats()).filter((x) => ["owner", "manager"].includes(x.user.role))) {
      const props = await propsOf(c.user);
      const invs = await invoicesOf(props.map((p) => p.id));
      const inToday = invs.flatMap((i) => (i.payLog ?? []).filter((x) => x.date === t)).reduce((s, x) => s + x.amount, 0);
      const debt = invs.filter((i) => payState(i, t) !== "da_thu").reduce((s, i) => s + i.total - (i.paid ?? 0), 0);
      const text = `🌙 <b>Báo cáo ngày ${fmtDate(t)}</b>\nTiền vào hôm nay: <b>${money(inToday)}</b>\nTổng còn nợ: ${money(debt)}\n\n${(await overview(c.user)).split("\n").slice(1).join("\n")}`;
      try { await send(c.id, text); sent++; } catch (e) { console.error("dailyReport", e.message); }
    }
    return { sent };
  }

  async function notifyTenants(uids, text, extra) {
    const chats = await tenantChats(uids);
    return (await Promise.allSettled(chats.map((c) => send(c.id, text, extra)))).filter((r) => r.status === "fulfilled").length;
  }

  return { handleUpdate, linkCode, sendInvoice, notifyManagers, notifyTenants, reminders, dailyReport };
}

module.exports = { createBot, webhookSecret, STAFF_COMMANDS, TENANT_COMMANDS, PUBLIC_COMMANDS };
