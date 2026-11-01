import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, deleteDoc, doc, setDoc, updateDoc } from "firebase/firestore";
import { db, call } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { useProps, useScoped } from "../lib/scoped";
import { useI18n } from "../i18n";
import { useAudit } from "../lib/audit";
import { syncListing } from "../lib/listings";
import { fmtDate, todayStr } from "../lib/format";
import { isAdminRole, type Contract, type RentalRequest, type RequestStatus, type Room } from "../lib/types";

const ALL: RequestStatus[] = ["moi", "da_lien_he", "giu_cho", "da_thue", "ket_thuc", "tu_choi", "huy"];
const OPEN: RequestStatus[] = ["moi", "da_lien_he", "giu_cho"];

/** Đăng ký thuê / hẹn xem phòng gửi từ trang công khai: Mới → Đã liên hệ → Giữ chỗ → Đã ký hợp đồng → Đã kết thúc thuê. */
export default function RequestsPage() {
  const { profile } = useAuth();
  const admin = isAdminRole(profile?.role);
  const { L } = useI18n();
  const audit = useAudit();
  const nav = useNavigate();
  const { inScope, byId } = useProps();
  const reqs = useScoped<RentalRequest>("rentalRequests").data.filter((r) => inScope(r.propertyId));
  const rooms = useScoped<Room>("rooms").data;
  const contracts = useScoped<Contract>("contracts").data;
  const [tab, setTab] = useState<"open" | "active" | "all">("open");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const who = profile?.name || profile?.email || "";

  /**
   * Đổi trạng thái (kể cả quay lại bước trước khi bấm nhầm) và giữ trạng thái phòng cho khớp:
   * vào "Giữ chỗ" → phòng giữ chỗ + gỡ khỏi trang công khai; rời "Giữ chỗ" (không sang ký hợp đồng) → phòng trống + đăng lại.
   */
  const setStatus = async (r: RentalRequest, status: RequestStatus) => {
    if (status === r.status) return;
    setMsg("");
    const room = rooms.find((x) => x.id === r.roomId);
    const hasContract = contracts.some((c) => c.roomId === r.roomId && c.status === "hieu_luc");
    try {
      if (status === "giu_cho") {
        if (!room) return setMsg("Không tìm thấy phòng.");
        if (room.status === "dang_thue" || hasContract) return setMsg(`Phòng ${r.roomCode} đang có hợp đồng, không giữ chỗ được.`);
        if (room.status !== "giu_cho") { await updateDoc(doc(db, "rooms", room.id), { status: "giu_cho" }); await syncListing({ ...room, status: "giu_cho" }, byId[room.propertyId]); }
      } else if (r.status === "giu_cho" && status !== "da_thue" && room?.status === "giu_cho") {
        await updateDoc(doc(db, "rooms", room.id), { status: "trong" });
        await syncListing({ ...room, status: "trong" }, byId[room.propertyId]);
      }
      if (status === "da_thue" && !r.contractId && !confirm("Yêu cầu này chưa gắn hợp đồng. Vẫn đánh dấu “Đã ký hợp đồng”? (nên dùng nút “Lập hợp đồng”)")) return;
      const staffNote = notes[r.id] ?? r.staffNote;
      await updateDoc(doc(db, "rentalRequests", r.id), { status, handledBy: who, handledOn: todayStr(), ...(staffNote !== undefined ? { staffNote } : {}) });
      audit("request.status", `Đăng ký thuê ${r.roomCode} — ${r.name}: ${L.requestStatus[r.status]} → ${L.requestStatus[status]}`, { type: "rentalRequest", id: r.id });
    } catch (x) { setMsg("Lỗi: " + (x as Error).message); }
  };

  /** Lập hồ sơ người thuê: máy chủ chép "Hồ sơ của tôi" + ảnh giấy tờ (nếu người gửi đồng ý) và gắn tài khoản; lỗi máy chủ thì tạo hồ sơ tối thiểu. */
  const makeTenant = async (r: RentalRequest): Promise<string | null> => {
    setBusy(r.id); setMsg("");
    try {
      const res = await call<{ id: string }, { tenantId: string; existing?: boolean; fromProfile?: boolean; copiedImages?: number }>("tenantFromRequest")({ id: r.id });
      const d = res.data;
      setMsg(d.existing ? `Đã có hồ sơ cho ${r.name}.` : `Đã lập hồ sơ ${r.name}${d.fromProfile ? ` từ “Hồ sơ của tôi” (${d.copiedImages ?? 0} ảnh giấy tờ)` : " (người gửi chưa chia sẻ giấy tờ — bổ sung ở Người cư trú)"}; tài khoản người gửi đã được gắn.`);
      return d.tenantId;
    } catch (x) {
      if (!confirm(`Không gọi được máy chủ (${(x as Error).message}). Tạo hồ sơ tối thiểu (họ tên, SĐT) trên trình duyệt?`)) return null;
      const ref = doc(collection(db, "tenants"));
      await setDoc(ref, { propertyId: r.propertyId, fullName: r.name, phone: r.phone, idNumber: "", docType: "cccd", nationality: "Việt Nam", gender: "", tamTru: { status: "chua" }, consent: false, note: `Từ đăng ký thuê phòng ${r.roomCode}${r.note ? `: ${r.note}` : ""}` });
      await updateDoc(doc(db, "rentalRequests", r.id), { tenantId: ref.id });
      audit("tenant.save", `Tạo hồ sơ ${r.name} từ đăng ký thuê`, { type: "tenant", id: ref.id });
      setMsg(`Đã tạo hồ sơ ${r.name}. Bổ sung giấy tờ ở “Người cư trú”; gửi mã mời để người thuê xem hóa đơn.`);
      return ref.id;
    } finally { setBusy(""); }
  };
  /** Lập hợp đồng: bảo đảm có hồ sơ người thuê, rồi mở form hợp đồng điền sẵn (trang Hợp đồng tự đánh dấu "Đã ký" khi tạo xong). */
  const makeContract = async (r: RentalRequest) => {
    const tid = r.tenantId ?? (await makeTenant(r));
    if (tid) nav(`/app/hop-dong?tuYeuCau=${encodeURIComponent(r.id)}&nguoiThue=${encodeURIComponent(tid)}`);
  };
  const remove = async (r: RentalRequest) => { if (confirm(`Xóa yêu cầu của ${r.name}?`)) await deleteDoc(doc(db, "rentalRequests", r.id)); };

  const filters: Record<typeof tab, (r: RentalRequest) => boolean> = { open: (r) => OPEN.includes(r.status), active: (r) => r.status === "da_thue", all: () => true };
  const list = reqs.filter(filters[tab]).sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));

  return (
    <>
      <h2>Đăng ký thuê</h2>
      <p><small>Quy trình: <b>Mới</b> → <b>Đã liên hệ</b> → <b>Giữ chỗ</b> (phòng ẩn khỏi trang công khai) → <b>Lập hợp đồng</b> (tự chuyển “Đã ký hợp đồng”) → khi thanh lý hợp đồng tự chuyển <b>Đã kết thúc thuê</b>. Bấm nhầm thì chọn lại ở ô “Đổi trạng thái”.</small></p>
      <div className="row tabs">
        <button className={tab === "open" ? "" : "ghost"} onClick={() => setTab("open")}>Đang xử lý ({reqs.filter(filters.open).length})</button>
        <button className={tab === "active" ? "" : "ghost"} onClick={() => setTab("active")}>Đang thuê ({reqs.filter(filters.active).length})</button>
        <button className={tab === "all" ? "" : "ghost"} onClick={() => setTab("all")}>Tất cả</button>
      </div>
      {msg && <p className="card">{msg}</p>}
      {list.map((r) => {
        const c = r.contractId ? contracts.find((x) => x.id === r.contractId) : undefined;
        return (
          <div key={r.id} className="card">
            <div className="row between"><b>{r.roomCode}{r.roomName ? ` · ${r.roomName}` : ""} — {byId[r.propertyId]?.name ?? r.propertyName}</b><span className={`tag rq-${r.status}`}>{L.requestStatus[r.status]}</span></div>
            <div>👤 <b>{r.name}</b> · 📞 <a href={`tel:${r.phone.replace(/[^0-9+]/g, "")}`}>{r.phone}</a> · <a href={`https://zalo.me/${r.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">Zalo</a> · {r.people} người{r.shareProfile ? " · 🪪 đồng ý chia sẻ hồ sơ" : ""}</div>
            <small>{r.moveIn && <>Dọn vào {fmtDate(r.moveIn)} · </>}{r.viewAt && <>Hẹn xem {fmtDate(r.viewAt.slice(0, 10))} {r.viewAt.slice(11, 16)} · </>}Gửi {r.createdAt ? new Date(r.createdAt.toMillis()).toLocaleString("vi-VN") : ""}{r.handledBy ? ` · ${r.handledBy} cập nhật ${fmtDate(r.handledOn)}` : ""}</small>
            {r.note && <div className="pre">“{r.note}”</div>}
            {(r.tenantId || c) && <small>{r.tenantId && <>🗂 Đã có hồ sơ người thuê{admin && <> (<Link to="/app/nguoi-thue">xem</Link>)</>}</>}{c && <> · 📄 Hợp đồng {c.code}: {fmtDate(c.start)} → {fmtDate(c.endedOn ?? c.end)} ({L.contractStatus[c.status]}) — <Link to={`/app/hop-dong?xem=${c.id}`}>mở hợp đồng</Link></>}</small>}
            <label>Ghi chú nội bộ<input value={notes[r.id] ?? r.staffNote ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} onBlur={() => notes[r.id] !== undefined && notes[r.id] !== (r.staffNote ?? "") && updateDoc(doc(db, "rentalRequests", r.id), { staffNote: notes[r.id] })} placeholder="vd hẹn 18h thứ 7" /></label>
            <div className="row">
              {r.status === "moi" && <button className="ghost" onClick={() => setStatus(r, "da_lien_he")}>📞 Đã liên hệ</button>}
              {admin && (r.status === "moi" || r.status === "da_lien_he") && <button onClick={() => setStatus(r, "giu_cho")}>✅ Giữ chỗ</button>}
              {admin && OPEN.includes(r.status) && <button disabled={busy === r.id} onClick={() => makeContract(r)}>📄 Lập hợp đồng</button>}
              {admin && !r.tenantId && r.status !== "huy" && <button className="ghost" disabled={busy === r.id} onClick={() => makeTenant(r)}>{busy === r.id ? "Đang lập…" : "Lập hồ sơ người thuê"}</button>}
              {r.status === "da_thue" && c?.status === "hieu_luc" && <Link className="btnlink" to={`/app/hop-dong?xem=${c.id}`}>Kết thúc thuê / thanh lý</Link>}
              {OPEN.includes(r.status) && (admin || r.status !== "giu_cho") && <button className="ghost danger" onClick={() => setStatus(r, "tu_choi")}>❌ Từ chối{r.status === "giu_cho" ? " / bỏ giữ chỗ" : ""}</button>}
              {admin && (
                <label className="inline">Đổi trạng thái
                  <select value={r.status} onChange={(e) => setStatus(r, e.target.value as RequestStatus)}>
                    {ALL.map((s) => <option key={s} value={s}>{L.requestStatus[s]}</option>)}
                  </select>
                </label>
              )}
              {admin && !OPEN.includes(r.status) && r.status !== "da_thue" && <button className="ghost danger" onClick={() => remove(r)}>Xóa</button>}
            </div>
          </div>
        );
      })}
      {!list.length && <p>Không có yêu cầu nào.</p>}
    </>
  );
}
