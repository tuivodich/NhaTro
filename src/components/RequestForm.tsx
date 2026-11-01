import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { useI18n } from "../i18n";
import { fmtDate, todayStr } from "../lib/format";
import type { Listing, Profile, RentalRequest } from "../lib/types";
import DateInput, { DateTimeInput } from "./DateInput";
import NumInput from "./NumInput";

/** Yêu cầu của người đang đăng nhập (đọc bằng truy vấn createdBy, vì luật không cho đọc tài liệu chưa tồn tại). */
export function useMyRequests() {
  const { user } = useAuth();
  const [data, setData] = useState<RentalRequest[]>([]);
  useEffect(() => {
    if (!user) { setData([]); return; }
    return onSnapshot(query(collection(db, "rentalRequests"), where("createdBy", "==", user.uid)),
      (s) => setData(s.docs.map((d) => ({ ...(d.data() as RentalRequest), id: d.id }))), () => setData([]));
  }, [user]);
  return data;
}

export const cancelRequest = (id: string) => updateDoc(doc(db, "rentalRequests", id), { status: "huy" });

/** Form "Đăng ký thuê / hẹn xem phòng" trên trang chi tiết phòng công khai. */
export default function RequestForm({ listing }: { listing: Listing }) {
  const { user, profile, loading } = useAuth();
  const { L } = useI18n();
  const mine = useMyRequests().find((r) => r.roomId === listing.id);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", phone: "", people: 1, moveIn: "", viewAt: "", note: "", share: false });
  const [prof, setProf] = useState<Profile | null>(null);
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "profiles", user.uid)).then((s) => {
      const d = (s.data() as Profile) ?? null;
      setProf(d);
      if (d) setF((x) => ({ ...x, name: d.fullName || x.name, phone: d.phone || x.phone, share: !!d.idNumber }));
    }).catch(() => {});
  }, [user]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => { if (profile) setF((x) => ({ ...x, name: x.name || profile.name || "", phone: x.phone || profile.phone || "" })); }, [profile]);

  if (loading) return null;
  if (!user) return (
    <div className="card request">
      <h3>Đăng ký thuê / hẹn xem phòng</h3>
      <p>Đăng nhập (Google hoặc email) để gửi yêu cầu; chủ nhà sẽ liên hệ lại với bạn.</p>
      <Link className="btnlink primary" to={`/dang-nhap?next=/phong/${listing.id}`}>Đăng nhập để đăng ký</Link>
    </div>
  );
  if (mine && mine.status !== "huy" && mine.status !== "ket_thuc") return (
    <div className="card request">
      <h3>Yêu cầu của bạn</h3>
      <div>Trạng thái: <span className={`tag rq-${mine.status}`}>{L.requestStatus[mine.status]}</span></div>
      <small>{mine.name} · {mine.phone} · {mine.people} người{mine.moveIn ? ` · dọn vào ${fmtDate(mine.moveIn)}` : ""}</small>
      {(mine.status === "moi" || mine.status === "da_lien_he") && <div className="row"><button className="ghost danger" onClick={() => cancelRequest(mine.id)}>Hủy yêu cầu</button></div>}
      {done && <p>✅ Đã gửi! Chủ nhà sẽ gọi lại cho bạn sớm.</p>}
    </div>
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!/^[0-9+ .]{8,15}$/.test(f.phone.trim())) return setErr("Số điện thoại không hợp lệ.");
    setBusy(true);
    try {
      const data: Record<string, unknown> = {
        roomId: listing.id, propertyId: listing.propertyId, roomCode: listing.code, propertyName: listing.propertyName,
        name: f.name.trim().slice(0, 100), phone: f.phone.trim(), people: Math.max(1, Math.min(20, Math.round(f.people))),
        status: "moi", createdBy: user.uid, createdAt: serverTimestamp(),
      };
      if (listing.name) data.roomName = listing.name;
      if (f.moveIn) data.moveIn = f.moveIn;
      if (f.viewAt) data.viewAt = f.viewAt;
      if (f.note.trim()) data.note = f.note.trim().slice(0, 1000);
      data.shareProfile = f.share;
      await setDoc(doc(db, "rentalRequests", `${user.uid}_${listing.id}`), data);
      setDone(true); setOpen(false);
    } catch (x) { setErr("Không gửi được: " + (x as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="card request">
      <h3>Đăng ký thuê / hẹn xem phòng</h3>
      {!open ? <>
        <p>Để lại thông tin, chủ nhà sẽ liên hệ để hẹn xem phòng và giữ chỗ cho bạn.{mine?.status === "huy" ? " (Bạn đã hủy yêu cầu trước — có thể gửi lại.)" : mine?.status === "ket_thuc" ? " (Bạn từng thuê phòng này — có thể đăng ký lại.)" : ""}</p>
        <div className="row"><button onClick={() => setOpen(true)}>📝 Đăng ký thuê phòng này</button></div>
      </> : (
        <form className="col" onSubmit={submit}>
          <div className="row">
            <label>Họ và tên<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={100} autoComplete="name" /></label>
            <label>Số điện thoại<input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required inputMode="tel" autoComplete="tel" /></label>
            <label>Số người ở<NumInput min={1} max={20} value={f.people} onChange={(e) => setF({ ...f, people: Number(e.target.value) || 1 })} /></label>
          </div>
          <div className="row">
            <label>Muốn dọn vào từ<DateInput value={f.moveIn} min={todayStr()} onChange={(moveIn) => setF({ ...f, moveIn })} /></label>
            <label>Muốn xem phòng lúc (tùy chọn)<DateTimeInput value={f.viewAt} min={todayStr()} onChange={(viewAt) => setF({ ...f, viewAt })} /></label>
          </div>
          <label>Ghi chú<textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={1000} placeholder="Nghề nghiệp, có xe máy không, câu hỏi về phòng…" /></label>
          {prof?.idNumber
            ? <label className="check"><input type="checkbox" checked={f.share} onChange={(e) => setF({ ...f, share: e.target.checked })} /> Cho phép chủ nhà dùng <Link to="/ho-so">Hồ sơ của tôi</Link> (giấy tờ{prof.idFront ? " và ảnh giấy tờ" : ""}) để lập hợp đồng, đăng ký tạm trú</label>
            : <small>💡 Lưu <Link to="/ho-so">Hồ sơ của tôi</Link> (giấy tờ, ảnh) một lần để không phải đưa lại giấy tờ mỗi khi thuê.</small>}
          <small>Thông tin chỉ chủ nhà/quản lý khu xem được, dùng để liên hệ cho thuê.</small>
          {err && <p className="error">{err}</p>}
          <div className="row"><button type="submit" disabled={busy}>{busy ? "Đang gửi…" : "Gửi đăng ký"}</button><button type="button" className="ghost" onClick={() => setOpen(false)}>Hủy</button></div>
        </form>
      )}
    </div>
  );
}
