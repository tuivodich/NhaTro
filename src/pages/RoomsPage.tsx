import { useState } from "react";
import { Link } from "react-router-dom";
import { deleteDoc, doc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { useProps, useScoped } from "../lib/scoped";
import { useI18n } from "../i18n";
import { useAudit } from "../lib/audit";
import { syncListing, uploadImage, removeImage } from "../lib/listings";
import { isAdminRole, type Contract, type Room, type RoomStatus, type RoomType } from "../lib/types";
import NumInput from "../components/NumInput";
import Modal from "../components/Modal";
import Money from "../components/Money";
import PropSelect from "../components/PropSelect";

type Draft = Omit<Room, "id"> & { id?: string };

export default function RoomsPage() {
  const { profile } = useAuth();
  const admin = isAdminRole(profile?.role);
  const { props, byId, inScope, current } = useProps();
  const { L } = useI18n();
  const audit = useAudit();
  const rooms = useScoped<Room>("rooms").data.filter((r) => inScope(r.propertyId));
  const contracts = useScoped<Contract>("contracts").data.filter((c) => c.status === "hieu_luc");
  const [edit, setEdit] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const blank = (): Draft => ({ propertyId: current || props[0]?.id || "", code: "", name: "", type: "phong", rent: 0, status: "trong", public: false, photos: [] });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    setErr("");
    const code = edit.code.trim().toUpperCase();
    if (rooms.some((r) => r.code.toUpperCase() === code && r.id !== edit.id)) return setErr(`Mã ${code} đã có. Mã phòng phải khác nhau (bot dùng mã để nhận phòng).`);
    const { id: oldId, ...data } = edit;
    const id = oldId ?? `${data.propertyId}_${code}`.replace(/[^A-Za-z0-9_-]/g, "");
    try {
      const room = { ...data, code } as Room;
      await setDoc(doc(db, "rooms", id), room);
      await syncListing({ ...room, id }, byId[room.propertyId]);
      audit("room.save", `Lưu phòng ${code} (${byId[room.propertyId]?.name ?? ""})`, { type: "room", id });
      setEdit(null);
    } catch (x) { setErr((x as Error).message); }
  };
  const remove = async (r: Room) => {
    if (contracts.some((c) => c.roomId === r.id)) return alert("Phòng đang có hợp đồng hiệu lực.");
    if (!confirm(`Xóa phòng ${r.code}?`)) return;
    await syncListing({ ...r, public: false }, byId[r.propertyId]);
    await deleteDoc(doc(db, "rooms", r.id));
  };
  const addPhotos = async (files: FileList | null) => {
    if (!files || !edit) return;
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files).slice(0, 10 - (edit.photos?.length ?? 0))) {
        const id = edit.id ?? `${edit.propertyId}_${edit.code}`;
        urls.push((await uploadImage(`rooms/${edit.propertyId}/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`, f)).url);
      }
      setEdit({ ...edit, photos: [...(edit.photos ?? []), ...urls] });
    } catch (x) { setErr("Tải ảnh lỗi: " + (x as Error).message); } finally { setBusy(false); }
  };
  const delPhoto = (url: string) => {
    if (!edit) return;
    const m = /\/o\/([^?]+)/.exec(url);
    if (m) removeImage(decodeURIComponent(m[1]));
    setEdit({ ...edit, photos: (edit.photos ?? []).filter((p) => p !== url) });
  };

  const groups = props.filter((p) => inScope(p.id)).map((p) => ({ p, rs: rooms.filter((r) => r.propertyId === p.id).sort((a, b) => a.code.localeCompare(b.code, "vi", { numeric: true })) }));
  return (
    <>
      <div className="row between"><h2>Phòng</h2><div className="row">{profile?.role === "owner" && <Link className="btnlink" to="/app/khu?moi=1">+ Thêm khu nhà trọ</Link>}{admin && props.length > 0 && <button onClick={() => setEdit(blank())}>+ Thêm phòng</button>}</div></div>
      {!props.length && <p>Chưa có khu nào.{profile?.role === "owner" && <> <Link to="/app/khu?moi=1">Thêm khu nhà trọ đầu tiên</Link>.</>}</p>}
      {groups.map(({ p, rs }) => (
        <section key={p.id}>
          <div className="row between"><h3>{p.name} <small>· {rs.length} phòng/căn</small></h3>{admin && <button className="ghost" onClick={() => setEdit({ ...blank(), propertyId: p.id })}>+ Thêm phòng vào khu này</button>}</div>
          {!rs.length && <p><small>Khu này chưa có phòng nào.</small></p>}
          <div className="grid">
            {rs.map((r) => {
              const c = contracts.find((x) => x.roomId === r.id);
              return (
                <div key={r.id} className="card room">
                  {r.photos?.[0] && <img className="cover" src={r.photos[0]} alt="" loading="lazy" />}
                  <div className="row between"><b>{r.code}</b><span className={`tag ${r.status}`}>{L.roomStatus[r.status]}</span></div>
                  <small>{r.name} · {L.roomType[r.type]}{r.area ? ` · ${r.area} m²` : ""}</small>
                  <div><Money v={r.rent} />/tháng</div>
                  {c && <small>👤 {c.tenantName} · {c.occupants.filter((o) => !o.to).length} người</small>}
                  {r.public && r.status === "trong" && <small>🌐 Đang hiện trên trang công khai</small>}
                  {admin && <div className="row"><button className="ghost" onClick={() => setEdit({ ...r })}>Sửa</button><button className="ghost danger" onClick={() => remove(r)}>Xóa</button></div>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {edit && (
        <Modal title={edit.id ? `Sửa phòng ${edit.code}` : "Thêm phòng"} onClose={() => setEdit(null)} wide>
          <form className="col" onSubmit={save}>
            <div className="row">
              <label>Khu<PropSelect value={edit.propertyId} onChange={(propertyId) => setEdit({ ...edit, propertyId })} /></label>
              <label>Mã phòng<input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} required disabled={!!edit.id} placeholder="P1" maxLength={12} /></label>
              <label>Loại<select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value as RoomType })}>{(Object.keys(L.roomType) as RoomType[]).map((t) => <option key={t} value={t}>{L.roomType[t]}</option>)}</select></label>
            </div>
            <label>Tên hiển thị<input value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            <div className="row">
              <label>Giá thuê/tháng (đ)<NumInput min={0} step={100000} value={edit.rent} onChange={(e) => setEdit({ ...edit, rent: Math.max(0, Number(e.target.value)) })} /></label>
              <label>Diện tích (m²)<NumInput min={0} value={edit.area ?? ""} allowEmpty onChange={(e) => setEdit({ ...edit, area: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>
              <label>Số người tối đa<NumInput min={0} value={edit.maxPeople ?? ""} allowEmpty onChange={(e) => setEdit({ ...edit, maxPeople: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>
              <label>Tầng<input value={edit.floor ?? ""} onChange={(e) => setEdit({ ...edit, floor: e.target.value })} /></label>
            </div>
            <label>Trạng thái<select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as RoomStatus })}>{(Object.keys(L.roomStatus) as RoomStatus[]).map((s) => <option key={s} value={s}>{L.roomStatus[s]}</option>)}</select></label>
            <label>Tiện nghi<input value={edit.amenities ?? ""} onChange={(e) => setEdit({ ...edit, amenities: e.target.value })} placeholder="Máy lạnh, gác lửng, WC riêng…" /></label>
            <label>Mô tả<textarea value={edit.desc ?? ""} onChange={(e) => setEdit({ ...edit, desc: e.target.value })} /></label>
            <label className="check"><input type="checkbox" checked={!!edit.public} onChange={(e) => setEdit({ ...edit, public: e.target.checked })} /> Hiện trên trang công khai khi phòng trống</label>
            <div>
              <div className="photos">{(edit.photos ?? []).map((u) => <div key={u} className="ph"><img src={u} alt="" /><button type="button" className="ghost danger" onClick={() => delPhoto(u)} aria-label="Xóa ảnh">✕</button></div>)}</div>
              {edit.code && edit.propertyId && <label className="filebtn">{busy ? "Đang tải…" : "+ Thêm ảnh (tối đa 10)"}<input type="file" accept="image/*" multiple hidden disabled={busy} onChange={(e) => addPhotos(e.target.files)} /></label>}
            </div>
            {err && <p className="error">{err}</p>}
            <div className="row"><button type="submit" disabled={busy}>Lưu</button><button type="button" className="ghost" onClick={() => setEdit(null)}>Hủy</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
