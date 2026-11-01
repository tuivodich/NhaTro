import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { addDoc, collection, onSnapshot, query, where } from "firebase/firestore";
import { db, call } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { useI18n } from "../i18n";
import { payState } from "../lib/billing";
import { fmtDate, fmtPeriod, todayStr } from "../lib/format";
import { uploadImage } from "../lib/listings";
import { isStaffRole, type Contract, type Invoice, type Ticket } from "../lib/types";
import Money from "../components/Money";
import { ContactBox, PublicHeader } from "./Landing";
import { cancelRequest, useMyRequests } from "../components/RequestForm";

function useMine<T>(name: string, field: string, op: "==" | "array-contains", uid?: string) {
  const [d, setD] = useState<T[]>([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(query(collection(db, name), where(field, op, uid)), (s) => setD(s.docs.map((x) => ({ ...(x.data() as object), id: x.id }) as T)), () => setD([]));
  }, [name, field, op, uid]);
  return d;
}

/** Cổng người thuê: hóa đơn, hợp đồng, báo hỏng, liên kết Telegram. */
export default function Account() {
  const { user, profile, loading, logout } = useAuth();
  const { L } = useI18n();
  const uid = user?.uid;
  const invoices = useMine<Invoice>("invoices", "tenantUids", "array-contains", uid);
  const contracts = useMine<Contract>("contracts", "tenantUids", "array-contains", uid);
  const tickets = useMine<Ticket>("tickets", "createdBy", "==", uid);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [tk, setTk] = useState({ title: "", detail: "" });
  const [photo, setPhoto] = useState<File | null>(null);
  const [tgUrl, setTgUrl] = useState("");
  const myReqs = useMyRequests();
  if (loading) return <div className="center">Đang tải…</div>;
  if (!user) return <Navigate to="/dang-nhap?next=/tai-khoan" replace />;
  const today = todayStr();
  const active = contracts.filter((c) => c.status === "hieu_luc");
  const shown = invoices.filter((i) => i.status === "da_gui").sort((a, b) => b.period.localeCompare(a.period));
  const owe = shown.filter((i) => payState(i, today) !== "da_thu").reduce((s, i) => s + i.total - (i.paid ?? 0), 0);

  const claim = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg("");
    try { const r = await call<{ code: string }, { name: string; contracts: number }>("claimInvite")({ code }); setMsg(`✅ Đã gắn hồ sơ ${r.data.name} (${r.data.contracts} hợp đồng).`); setCode(""); }
    catch (x) { setMsg("❌ " + (x as Error).message); }
  };
  const report = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = active[0];
    if (!c || !tk.title) return;
    try {
      const photos = photo ? [(await uploadImage(`tickets/${uid}/${Date.now()}.jpg`, photo)).url] : [];
      await addDoc(collection(db, "tickets"), { propertyId: c.propertyId, roomId: c.roomId, roomCode: c.roomCode, contractId: c.id, title: tk.title, detail: tk.detail, photos, status: "moi", createdBy: uid, createdName: profile?.name || user.email || "", createdOn: today });
      setTk({ title: "", detail: "" }); setPhoto(null); setMsg("✅ Đã gửi báo hỏng.");
    } catch (x) { setMsg("❌ " + (x as Error).message); }
  };
  const linkTg = async () => { try { const r = await call<{ kind: string }, { link: string }>("tgLinkCode")({ kind: "tenant" }); setTgUrl(r.data.link); window.open(r.data.link, "_blank"); } catch (x) { setMsg("❌ " + (x as Error).message); } };

  return (
    <div className="pub">
      <PublicHeader />
      <main className="pub-main">
        <div className="row between"><h2>Xin chào {profile?.name || user.email}</h2><button className="ghost" onClick={logout}>Đăng xuất</button></div>
        {isStaffRole(profile?.role) && <p><Link to="/app">→ Vào trang quản lý</Link></p>}
        {msg && <p className="card">{msg}</p>}

        {myReqs.length > 0 && (
          <div className="card">
            <h3>Đăng ký thuê của tôi</h3>
            <ul>{myReqs.map((r) => (
              <li key={r.id}><Link to={`/phong/${r.roomId}`}>{r.roomName || r.roomCode}</Link> · {r.propertyName} — <span className={`tag rq-${r.status}`}>{L.requestStatus[r.status]}</span>
                {(r.status === "moi" || r.status === "da_lien_he") && <> <button className="ghost danger" onClick={() => cancelRequest(r.id)}>Hủy</button></>}</li>))}</ul>
          </div>
        )}

        {!active.length && !isStaffRole(profile?.role) && (
          <form className="card" onSubmit={claim}>
            <h3>Nhập mã mời của chủ nhà</h3>
            <p><small>Chủ nhà gửi bạn mã 6 ký tự để gắn tài khoản với hồ sơ thuê phòng.</small></p>
            <div className="row"><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="VD: AB12CD" maxLength={10} required /><button type="submit">Xác nhận</button></div>
          </form>
        )}

        {active.map((c) => (
          <div key={c.id} className="card">
            <h3>Phòng {c.roomCode}</h3>
            <div>Hợp đồng {c.code}: {fmtDate(c.start)} → {fmtDate(c.end)} · giá thuê <Money v={c.rent} />/tháng · cọc <Money v={c.deposit} /></div>
            <div className="row">{c.services.map((s) => <span key={s.id} className="tag">{s.name}: <Money v={s.price} />/{s.unit}</span>)}</div>
          </div>
        ))}

        {shown.length > 0 && <>
          <h3>Hóa đơn {owe > 0 ? <>· còn nợ <Money v={owe} /></> : "· đã thanh toán đủ ✅"}</h3>
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Kỳ</th><th>Phòng</th><th className="num">Tổng</th><th className="num">Còn lại</th><th>Trạng thái</th><th /></tr></thead>
            <tbody>{shown.map((i) => { const st = payState(i, today); return (
              <tr key={i.id}><td>{fmtPeriod(i.period)}</td><td>{i.roomCode}</td><td className="num"><Money v={i.total} /></td><td className="num"><Money v={i.total - (i.paid ?? 0)} /></td>
                <td><span className={`tag ${st}`}>{L.payState[st]}</span></td><td><Link to={`/hoa-don/${i.id}`}>{st === "da_thu" ? "Xem" : "Thanh toán"}</Link></td></tr>); })}</tbody>
          </table></div>
        </>}

        {active.length > 0 && (
          <form className="card" onSubmit={report}>
            <h3>Báo hỏng</h3>
            <label>Việc cần sửa<input value={tk.title} onChange={(e) => setTk({ ...tk, title: e.target.value })} required placeholder="VD: Vòi nước nhà tắm bị rỉ" /></label>
            <label>Chi tiết<textarea value={tk.detail} onChange={(e) => setTk({ ...tk, detail: e.target.value })} /></label>
            <label className="filebtn">{photo ? `📷 ${photo.name}` : "📷 Thêm ảnh"}<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /></label>
            <div className="row"><button type="submit">Gửi</button></div>
            {tickets.length > 0 && <ul>{tickets.sort((a, b) => b.createdOn.localeCompare(a.createdOn)).slice(0, 10).map((k) => <li key={k.id}>{fmtDate(k.createdOn)} · {k.title} — <b>{L.ticketStatus[k.status]}</b></li>)}</ul>}
          </form>
        )}

        <div className="card">
          <h3>Nhận hóa đơn &amp; nhắc hạn qua Telegram</h3>
          <div className="row"><button onClick={linkTg}>Liên kết Telegram</button>{tgUrl && <a href={tgUrl} target="_blank" rel="noreferrer">Mở lại liên kết</a>}</div>
        </div>
        <ContactBox />
      </main>
    </div>
  );
}
