import { useState } from "react";
import { Link } from "react-router-dom";
import { collection, deleteDoc, doc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { useProps, useScoped } from "../lib/scoped";
import { useI18n } from "../i18n";
import { useAudit } from "../lib/audit";
import { syncListing } from "../lib/listings";
import { fmtDate, todayStr } from "../lib/format";
import { isAdminRole, type RentalRequest, type RequestStatus, type Room } from "../lib/types";

/** Đăng ký thuê / hẹn xem phòng gửi từ trang công khai. */
export default function RequestsPage() {
  const { profile } = useAuth();
  const admin = isAdminRole(profile?.role);
  const { L } = useI18n();
  const audit = useAudit();
  const { inScope, byId } = useProps();
  const reqs = useScoped<RentalRequest>("rentalRequests").data.filter((r) => inScope(r.propertyId));
  const rooms = useScoped<Room>("rooms").data;
  const [tab, setTab] = useState<"open" | "all">("open");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const who = profile?.name || profile?.email || "";

  const setStatus = async (r: RentalRequest, status: RequestStatus) => {
    setMsg("");
    try {
      const room = rooms.find((x) => x.id === r.roomId);
      if (status === "giu_cho") {
        if (!room || room.status !== "trong") return setMsg(`Phòng ${r.roomCode} không còn trống.`);
        await updateDoc(doc(db, "rooms", room.id), { status: "giu_cho" });
        await syncListing({ ...room, status: "giu_cho" }, byId[room.propertyId]);
      }
      // Bỏ giữ chỗ (từ chối/hủy khi đang giữ) → trả phòng về trống và đăng lại.
      if (r.status === "giu_cho" && (status === "tu_choi" || status === "huy" || status === "da_lien_he") && room?.status === "giu_cho") {
        await updateDoc(doc(db, "rooms", room.id), { status: "trong" });
        await syncListing({ ...room, status: "trong" }, byId[room.propertyId]);
      }
      const staffNote = notes[r.id] ?? r.staffNote;
      await updateDoc(doc(db, "rentalRequests", r.id), { status, handledBy: who, handledOn: todayStr(), ...(staffNote !== undefined ? { staffNote } : {}) });
      audit("request.status", `Đăng ký thuê ${r.roomCode} — ${r.name}: ${L.requestStatus[status]}`, { type: "rentalRequest", id: r.id });
    } catch (x) { setMsg("Lỗi: " + (x as Error).message); }
  };
  /** Tạo hồ sơ người cư trú từ yêu cầu (họ tên, SĐT); bổ sung giấy tờ ở trang Người cư trú. */
  const makeTenant = async (r: RentalRequest) => {
    const ref = doc(collection(db, "tenants"));
    await setDoc(ref, { propertyId: r.propertyId, fullName: r.name, phone: r.phone, idNumber: "", docType: "cccd", nationality: "Việt Nam", gender: "", tamTru: { status: "chua" }, consent: false, note: `Từ đăng ký thuê phòng ${r.roomCode}${r.note ? `: ${r.note}` : ""}` });
    audit("tenant.save", `Tạo hồ sơ ${r.name} từ đăng ký thuê`, { type: "tenant", id: ref.id });
    setMsg(`Đã tạo hồ sơ ${r.name}. Vào “Người cư trú” để bổ sung giấy tờ, rồi “Hợp đồng” để lập hợp đồng phòng ${r.roomCode}.`);
  };
  const remove = async (r: RentalRequest) => { if (confirm(`Xóa yêu cầu của ${r.name}?`)) await deleteDoc(doc(db, "rentalRequests", r.id)); };

  const OPEN: RequestStatus[] = ["moi", "da_lien_he", "giu_cho"];
  const list = reqs.filter((r) => tab === "all" || OPEN.includes(r.status)).sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));

  return (
    <>
      <h2>Đăng ký thuê</h2>
      <p><small>Yêu cầu gửi từ trang phòng trống công khai. Bấm <b>Giữ chỗ</b> để chuyển phòng sang “giữ chỗ” và gỡ khỏi trang công khai; ký hợp đồng xong bấm <b>Đã ký hợp đồng</b>.</small></p>
      <div className="row tabs"><button className={tab === "open" ? "" : "ghost"} onClick={() => setTab("open")}>Đang xử lý</button><button className={tab === "all" ? "" : "ghost"} onClick={() => setTab("all")}>Tất cả</button></div>
      {msg && <p className="card">{msg}</p>}
      {list.map((r) => (
        <div key={r.id} className="card">
          <div className="row between"><b>{r.roomCode}{r.roomName ? ` · ${r.roomName}` : ""} — {byId[r.propertyId]?.name ?? r.propertyName}</b><span className={`tag rq-${r.status}`}>{L.requestStatus[r.status]}</span></div>
          <div>👤 <b>{r.name}</b> · 📞 <a href={`tel:${r.phone.replace(/[^0-9+]/g, "")}`}>{r.phone}</a> · <a href={`https://zalo.me/${r.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">Zalo</a> · {r.people} người</div>
          <small>{r.moveIn && <>Dọn vào {fmtDate(r.moveIn)} · </>}{r.viewAt && <>Hẹn xem {fmtDate(r.viewAt.slice(0, 10))} {r.viewAt.slice(11, 16)} · </>}Gửi {r.createdAt ? new Date(r.createdAt.toMillis()).toLocaleString("vi-VN") : ""}{r.handledBy ? ` · ${r.handledBy} xử lý ${fmtDate(r.handledOn)}` : ""}</small>
          {r.note && <div className="pre">“{r.note}”</div>}
          <label>Ghi chú nội bộ<input value={notes[r.id] ?? r.staffNote ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} placeholder="vd hẹn 18h thứ 7" /></label>
          <div className="row">
            {r.status === "moi" && <button className="ghost" onClick={() => setStatus(r, "da_lien_he")}>📞 Đã liên hệ</button>}
            {admin && (r.status === "moi" || r.status === "da_lien_he") && <button onClick={() => setStatus(r, "giu_cho")}>✅ Giữ chỗ</button>}
            {admin && r.status === "giu_cho" && <button onClick={() => setStatus(r, "da_thue")}>📄 Đã ký hợp đồng</button>}
            {admin && OPEN.includes(r.status) && <button className="ghost" onClick={() => makeTenant(r)}>Tạo hồ sơ người thuê</button>}
            {OPEN.includes(r.status) && (admin || r.status !== "giu_cho") && <button className="ghost danger" onClick={() => setStatus(r, "tu_choi")}>❌ Từ chối{r.status === "giu_cho" ? " / bỏ giữ chỗ" : ""}</button>}
            {admin && !OPEN.includes(r.status) && <button className="ghost danger" onClick={() => remove(r)}>Xóa</button>}
            {r.status === "giu_cho" && <Link className="btnlink" to="/app/hop-dong">Lập hợp đồng</Link>}
          </div>
        </div>
      ))}
      {!list.length && <p>Chưa có yêu cầu nào.</p>}
    </>
  );
}
