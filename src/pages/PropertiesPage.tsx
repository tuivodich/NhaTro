import { useState } from "react";
import { addDoc, collection, deleteDoc, doc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useProps, useScoped } from "../lib/scoped";
import { useI18n } from "../i18n";
import { useAudit } from "../lib/audit";
import { DEFAULT_SERVICES } from "../lib/billing";
import type { Property, Room, Service, ServiceMode } from "../lib/types";
import NumInput from "../components/NumInput";
import Modal from "../components/Modal";
import Money from "../components/Money";

const EMPTY: Omit<Property, "id"> = { name: "", address: "", kind: "day_tro", billingDay: 1, dueDays: 5, roundTo: 1000, services: DEFAULT_SERVICES };

export function ServicesEditor({ value, onChange }: { value: Service[]; onChange: (s: Service[]) => void }) {
  const { L } = useI18n();
  const set = (i: number, patch: Partial<Service>) => onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <div className="services">
      {value.map((s, i) => (
        <div key={i} className="row svc">
          <label>Tên<input value={s.name} onChange={(e) => set(i, { name: e.target.value })} required /></label>
          <label>Cách tính<select value={s.mode} onChange={(e) => set(i, { mode: e.target.value as ServiceMode, unit: e.target.value === "person" ? "người" : e.target.value === "room" ? "tháng" : s.unit })}>
            {(Object.keys(L.serviceMode) as ServiceMode[]).map((m) => <option key={m} value={m}>{L.serviceMode[m]}</option>)}
          </select></label>
          <label>Đơn vị<input value={s.unit} onChange={(e) => set(i, { unit: e.target.value })} style={{ maxWidth: 80 }} /></label>
          <label>Đơn giá (đ)<NumInput min={0} step={100} value={s.price} onChange={(e) => set(i, { price: Math.max(0, Number(e.target.value)) })} /></label>
          <button type="button" className="ghost danger" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Xóa dịch vụ">✕</button>
        </div>
      ))}
      <button type="button" className="ghost" onClick={() => onChange([...value, { id: `dv${Date.now().toString(36)}`, name: "", mode: "room", unit: "tháng", price: 0 }])}>+ Thêm dịch vụ</button>
      <small>Mã dịch vụ <code>dien</code> / <code>nuoc</code> dùng cho lệnh bot /dien, /nuoc. Dịch vụ theo chỉ số tính lượng dùng tháng trước; theo người/phòng thu trước cho tháng của hóa đơn.</small>
    </div>
  );
}

export default function PropertiesPage() {
  const { props } = useProps();
  const rooms = useScoped<Room>("rooms").data;
  const { L } = useI18n();
  const audit = useAudit();
  const [edit, setEdit] = useState<(Omit<Property, "id"> & { id?: string }) | null>(null);
  const [err, setErr] = useState("");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    setErr("");
    const { id, ...data } = edit;
    try {
      if (id) await setDoc(doc(db, "properties", id), data); else await addDoc(collection(db, "properties"), { ...data, order: props.length + 1 });
      audit("property.save", `Lưu khu ${data.name}`, { type: "property", id: id ?? "" });
      setEdit(null);
    } catch (x) { setErr((x as Error).message); }
  };
  const remove = async (p: Property) => {
    if (rooms.some((r) => r.propertyId === p.id)) return alert("Khu còn phòng — xóa các phòng trước.");
    if (!confirm(`Xóa khu “${p.name}”?`)) return;
    await deleteDoc(doc(db, "properties", p.id));
  };

  return (
    <>
      <div className="row between"><h2>Khu trọ &amp; dịch vụ</h2><button onClick={() => setEdit({ ...EMPTY })}>+ Thêm khu</button></div>
      {props.map((p) => (
        <div key={p.id} className="card">
          <div className="row between"><h3>{p.name}</h3><span className="tag">{L.propertyKind[p.kind]}</span></div>
          <small>{p.address}</small>
          <div>Chốt chỉ số &amp; lập hóa đơn ngày <b>{p.billingDay}</b> hằng tháng · hạn trả sau <b>{p.dueDays}</b> ngày · {rooms.filter((r) => r.propertyId === p.id).length} phòng/căn</div>
          <div className="row">{p.services.length ? p.services.map((s) => <span key={s.id} className="tag">{s.name}: <Money v={s.price} />/{s.unit} ({L.serviceMode[s.mode]})</span>) : <small>Không có dịch vụ thu thêm (người thuê tự trả điện nước).</small>}</div>
          <div className="row"><button className="ghost" onClick={() => setEdit({ ...p })}>Sửa</button><button className="ghost danger" onClick={() => remove(p)}>Xóa</button></div>
        </div>
      ))}
      {edit && (
        <Modal title={edit.id ? "Sửa khu" : "Thêm khu"} onClose={() => setEdit(null)} wide>
          <form className="col" onSubmit={save}>
            <label>Tên khu<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required /></label>
            <label>Địa chỉ<input value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} required /></label>
            <div className="row">
              <label>Loại<select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as Property["kind"] })}><option value="day_tro">Dãy trọ</option><option value="nha_nguyen_can">Nhà nguyên căn</option></select></label>
              <label>Ngày chốt (1–28)<NumInput min={1} max={28} value={edit.billingDay} onChange={(e) => setEdit({ ...edit, billingDay: Math.min(28, Math.max(1, Number(e.target.value))) })} /></label>
              <label>Hạn trả (ngày)<NumInput min={0} max={30} value={edit.dueDays} onChange={(e) => setEdit({ ...edit, dueDays: Math.max(0, Number(e.target.value)) })} /></label>
              <label>Làm tròn tổng<select value={edit.roundTo ?? 1000} onChange={(e) => setEdit({ ...edit, roundTo: Number(e.target.value) })}><option value={0}>Không</option><option value={1000}>Tròn nghìn</option><option value={10000}>Tròn chục nghìn</option></select></label>
            </div>
            <h4>Dịch vụ mặc định cho hợp đồng mới</h4>
            <ServicesEditor value={edit.services} onChange={(services) => setEdit({ ...edit, services })} />
            <label>Ghi chú<textarea value={edit.note ?? ""} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></label>
            {err && <p className="error">{err}</p>}
            <div className="row"><button type="submit">Lưu</button><button type="button" className="ghost" onClick={() => setEdit(null)}>Hủy</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
