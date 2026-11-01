"use strict";
/**
 * Lập hồ sơ người thuê (tenants) từ một đăng ký thuê. Chạy phía server vì "Hồ sơ của tôi" (profiles/{uid}) chỉ chính chủ đọc được:
 * chỉ khi người gửi đã đồng ý chia sẻ (shareProfile) thì mới chép thông tin + ảnh giấy tờ; luôn gắn tài khoản người gửi (uid)
 * để họ xem được hợp đồng/hóa đơn mà không cần mã mời.
 */
const { manages, todayVN, err } = require("./common");

const FIELDS = ["fullName", "phone", "dob", "gender", "docType", "idNumber", "oldIdNumber", "idIssueDate", "idIssuePlace", "docExpiry", "nationality", "address", "job", "workplace", "vehiclePlate", "emergencyName", "emergencyPhone", "email"];
const IMAGES = ["idFront", "idBack", "portrait"];

function createRequests({ db, bucket, now = () => new Date() }) {
  const { FieldValue } = require("firebase-admin/firestore");
  const get = async (path) => { const s = await db.doc(path).get(); return s.exists ? { id: s.id, ...s.data() } : null; };

  async function tenantFromRequest(uid, requestId) {
    const u = await get(`users/${uid}`);
    const req = await get(`rentalRequests/${String(requestId ?? "")}`);
    if (!req) throw err("not-found", "Không tìm thấy đăng ký thuê.");
    if (!manages(u, req.propertyId)) throw err("permission-denied", "Chỉ chủ/quản lý của khu này.");
    // Đã lập trước đó, hoặc người này đã có hồ sơ trong khu → dùng lại.
    if (req.tenantId && (await get(`tenants/${req.tenantId}`))) return { tenantId: req.tenantId, existing: true };
    const same = (await db.collection("tenants").where("propertyId", "==", req.propertyId).where("uid", "==", req.createdBy).limit(1).get()).docs[0];
    if (same) { await db.doc(`rentalRequests/${req.id}`).update({ tenantId: same.id }); return { tenantId: same.id, existing: true }; }

    const profile = req.shareProfile ? await get(`profiles/${req.createdBy}`) : null;
    const ref = db.collection("tenants").doc();
    const t = { propertyId: req.propertyId, fullName: req.name, phone: req.phone, docType: "cccd", idNumber: "", nationality: "Việt Nam", gender: "", tamTru: { status: "chua" } };
    if (profile) for (const f of FIELDS) if (profile[f] != null && profile[f] !== "") t[f] = profile[f];
    if (!["cccd", "cmnd", "passport"].includes(t.docType)) t.docType = "cccd";
    let copied = 0;
    if (profile) {
      for (const f of IMAGES) {
        const src = String(profile[f] ?? "");
        if (!src.startsWith(`profiles/${req.createdBy}/`) || src.includes("..")) continue; // chỉ chép ảnh trong thư mục của chính người gửi
        const dest = `tenants/${req.propertyId}/${ref.id}/${f}-${now().getTime()}.jpg`;
        try { await bucket.file(src).copy(bucket.file(dest)); t[f] = dest; copied++; } catch (e) { console.error("copy", f, e.message); }
      }
    }
    await ref.set({
      ...t, uid: req.createdBy, consent: !!req.shareProfile,
      note: `Từ đăng ký thuê phòng ${req.roomCode} ngày ${todayVN(now())}${req.note ? `: ${req.note}` : ""}`.slice(0, 1000),
    });
    await db.doc(`rentalRequests/${req.id}`).update({ tenantId: ref.id });
    if ((await get("settings/audit"))?.enabled !== false) {
      await db.collection("auditLog").add({ at: FieldValue.serverTimestamp(), by: uid, byName: u.email ?? "", role: u.role, action: "tenant.fromRequest", summary: `Lập hồ sơ ${t.fullName} từ đăng ký thuê ${req.roomCode}${profile ? " (chép hồ sơ cá nhân)" : ""}`, targetType: "tenant", targetId: ref.id }).catch(() => {});
    }
    return { tenantId: ref.id, name: t.fullName, fromProfile: !!profile, copiedImages: copied };
  }

  return { tenantFromRequest };
}

module.exports = { createRequests };
