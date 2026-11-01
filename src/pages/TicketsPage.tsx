import { useState } from "react";
import { addDoc, collection, doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { useProps, useScoped } from "../lib/scoped";
import { useI18n } from "../i18n";
import { useAudit } from "../lib/audit";
import { fmtDate, todayStr } from "../lib/format";
import { isAdminRole, type Room, type Ticket, type TicketStatus } from "../lib/types";
import NumInput from "../components/NumInput";

export default function TicketsPage() {
  const { user, profile } = useAuth();
  const admin = isAdminRole(profile?.role);
  const { L } = useI18n();
  const audit = useAudit();
  const { inScope, byId } = useProps();
  const tickets = useScoped<Ticket>("tickets").data.filter((k) => inScope(k.propertyId));
  const rooms = useScoped<Room>("rooms").data.filter((r) => inScope(r.propertyId));
  const [show, setShow] = useState<"open" | "all">("open");
  const [f, setF] = useState({ roomId: "", title: "", detail: "" });

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = rooms.find((x) => x.id === f.roomId);
    if (!r || !f.title) return;
    await addDoc(collection(db, "tickets"), { propertyId: r.propertyId, roomId: r.id, roomCode: r.code, title: f.title, detail: f.detail, status: "moi", createdBy: user!.uid, createdName: profile?.name || profile?.email || "", createdOn: todayStr() });
    setF({ roomId: "", title: "", detail: "" });
  };
  const setStatus = async (k: Ticket, status: TicketStatus) => {
    await updateDoc(doc(db, "tickets", k.id), { status, ...(status === "xong" ? { doneOn: todayStr() } : {}) });
    audit("ticket.status", `${k.roomCode}: ${k.title} → ${L.ticketStatus[status]}`, { type: "ticket", id: k.id });
  };
  const setCost = async (k: Ticket, cost: number) => {
    await updateDoc(doc(db, "tickets", k.id), { cost });
    if (admin && cost > 0 && confirm(`Ghi ${cost.toLocaleString("vi-VN")} đ vào sổ chi “Sửa chữa”?`)) {
      await addDoc(collection(db, "transactions"), { propertyId: k.propertyId, date: todayStr(), type: "chi", category: "Sửa chữa", amount: cost, note: `${k.roomCode}: ${k.title}`, by: profile?.email ?? "" });
    }
  };
  const list = tickets.filter((k) => show === "all" || k.status === "moi" || k.status === "dang_xu_ly").sort((a, b) => b.createdOn.localeCompare(a.createdOn));

  return (
    <>
      <h2>Báo hỏng &amp; sửa chữa</h2>
      <form className="card" onSubmit={add}>
        <div className="row">
          <label>Phòng<select value={f.roomId} onChange={(e) => setF({ ...f, roomId: e.target.value })} required><option value="">— Chọn —</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.code} · {byId[r.propertyId]?.name}</option>)}</select></label>
          <label>Việc cần sửa<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></label>
        </div>
        <label>Chi tiết<input value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} /></label>
        <div className="row"><button type="submit">Thêm phiếu</button></div>
      </form>
      <div className="row tabs"><button className={show === "open" ? "" : "ghost"} onClick={() => setShow("open")}>Đang mở</button><button className={show === "all" ? "" : "ghost"} onClick={() => setShow("all")}>Tất cả</button></div>
      {list.map((k) => (
        <div key={k.id} className="card">
          <div className="row between"><b>{k.roomCode} · {k.title}</b><span className={`tag ${k.status}`}>{L.ticketStatus[k.status]}</span></div>
          {k.detail && <div>{k.detail}</div>}
          <small>{byId[k.propertyId]?.name} · {fmtDate(k.createdOn)} · {k.createdName}{k.doneOn ? ` · xong ${fmtDate(k.doneOn)}` : ""}</small>
          <div className="row">
            {k.status === "moi" && <button className="ghost" onClick={() => setStatus(k, "dang_xu_ly")}>Nhận việc</button>}
            {k.status !== "xong" && <button onClick={() => setStatus(k, "xong")}>Đã xong</button>}
            {k.status !== "huy" && k.status !== "xong" && <button className="ghost danger" onClick={() => setStatus(k, "huy")}>Hủy</button>}
            <label>Chi phí<NumInput min={0} step={10000} value={k.cost ?? 0} onChange={() => {}} onBlur={(e) => { const v = Number(e.target.value); if (v !== (k.cost ?? 0)) setCost(k, Math.max(0, v)); }} /></label>
          </div>
        </div>
      ))}
      {!list.length && <p>Không có phiếu nào.</p>}
    </>
  );
}
