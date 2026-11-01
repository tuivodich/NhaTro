import { useState } from "react";
import { addDoc, collection, deleteDoc, doc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useProps, useScoped } from "../lib/scoped";
import { useI18n } from "../i18n";
import { useAudit } from "../lib/audit";
import { parseCccdQr } from "../lib/cccd";
import { imageUrl, uploadImage, removeImage } from "../lib/listings";
import { fmtDate, normName, randomCode } from "../lib/format";
import { SITE_URL } from "../lib/siteConfig";
import type { Contract, Tenant, TamTruStatus } from "../lib/types";
import DateInput from "../components/DateInput";
import Modal from "../components/Modal";
import PropSelect from "../components/PropSelect";
import QrScan from "../components/QrScan";

type Draft = Omit<Tenant, "id"> & { id?: string };

function DocImage({ path, label }: { path?: string; label: string }) {
  const [url, setUrl] = useState("");
  if (!path) return null;
  return url ? <a href={url} target="_blank" rel="noreferrer"><img className="docimg" src={url} alt={label} /></a>
    : <button type="button" className="ghost" onClick={() => imageUrl(path).then(setUrl).catch(() => alert("Không mở được ảnh"))}>🔒 Xem {label}</button>;
}

export default function TenantsPage() {
  const { current, inScope, byId, props } = useProps();
  const { L } = useI18n();
  const audit = useAudit();
  const tenants = useScoped<Tenant>("tenants").data.filter((t) => inScope(t.propertyId));
  const contracts = useScoped<Contract>("contracts").data;
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Draft | null>(null);
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const blank = (): Draft => ({ propertyId: current || props[0]?.id || "", fullName: "", idNumber: "", phone: "", gender: "", tamTru: { status: "chua" }, consent: false });
  const roomOf = (t: Tenant) => contracts.find((c) => c.status === "hieu_luc" && c.occupants.some((o) => o.tenantId === t.id && !o.to))?.roomCode;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    setErr("");
    if (edit.idNumber && !/^\d{9}$|^\d{12}$/.test(edit.idNumber)) return setErr("Số CCCD phải có 12 chữ số (CMND cũ 9 số).");
    const dup = tenants.find((t) => t.idNumber && t.idNumber === edit.idNumber && t.id !== edit.id);
    if (dup) return setErr(`Số CCCD này đã có hồ sơ: ${dup.fullName}.`);
    const { id, ...data } = edit;
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    try {
      if (id) await setDoc(doc(db, "tenants", id), clean);
      else { const r = await addDoc(collection(db, "tenants"), clean); setEdit({ ...edit, id: r.id }); }
      audit("tenant.save", `Lưu hồ sơ ${data.fullName}`, { type: "tenant", id: id ?? "" });
      if (id) setEdit(null);
    } catch (x) { setErr((x as Error).message); }
  };
  const upload = async (field: "idFront" | "idBack" | "portrait", f?: File) => {
    if (!f || !edit?.id) return;
    setBusy(true);
    try {
      if (edit[field]) removeImage(edit[field]!);
      const { path } = await uploadImage(`tenants/${edit.propertyId}/${edit.id}/${field}-${Date.now()}.jpg`, f);
      await updateDoc(doc(db, "tenants", edit.id), { [field]: path });
      setEdit({ ...edit, [field]: path });
    } catch (x) { setErr("Tải ảnh lỗi: " + (x as Error).message); } finally { setBusy(false); }
  };
  const invite = async (t: Tenant) => {
    const code = randomCode(6);
    await updateDoc(doc(db, "tenants", t.id), { inviteCode: code });
    prompt(`Gửi mã mời cho ${t.fullName}. Người thuê đăng nhập ${SITE_URL}/tai-khoan rồi nhập mã:`, code);
  };
  const remove = async (t: Tenant) => {
    if (roomOf(t)) return alert("Người này đang ở trong hợp đồng hiệu lực.");
    if (!confirm(`Xóa hồ sơ ${t.fullName}? (ảnh CCCD cũng bị xóa)`)) return;
    for (const p of [t.idFront, t.idBack, t.portrait]) if (p) removeImage(p);
    await deleteDoc(doc(db, "tenants", t.id));
    audit("tenant.delete", `Xóa hồ sơ ${t.fullName}`, { type: "tenant", id: t.id });
  };
  const onScan = (text: string) => {
    const d = parseCccdQr(text);
    setScan(false);
    if (!d || !edit) return setErr("Không đọc được mã QR CCCD.");
    setEdit({ ...edit, idNumber: d.idNumber, oldIdNumber: d.oldIdNumber || edit.oldIdNumber, fullName: d.fullName, dob: d.dob || edit.dob, gender: d.gender || edit.gender, address: d.address || edit.address, idIssueDate: d.idIssueDate || edit.idIssueDate, idIssuePlace: edit.idIssuePlace || "Cục Cảnh sát QLHC về TTXH" });
  };

  const nq = normName(q);
  const list = tenants.filter((t) => !nq || normName(`${t.fullName} ${t.phone} ${t.idNumber}`).includes(nq)).sort((a, b) => a.fullName.localeCompare(b.fullName, "vi"));
  const F = (k: keyof Draft, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label>{label}<input value={(edit?.[k] as string) ?? ""} onChange={(e) => setEdit({ ...edit!, [k]: e.target.value })} {...extra} /></label>
  );

  return (
    <>
      <div className="row between"><h2>Người cư trú</h2><button onClick={() => setEdit(blank())}>+ Thêm người</button></div>
      <input placeholder="Tìm theo tên, SĐT, CCCD…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="scroll"><table className="tbl">
        <thead><tr><th>Họ tên</th><th>Phòng</th><th>SĐT</th><th>CCCD</th><th>Tạm trú</th><th>Tài khoản</th><th /></tr></thead>
        <tbody>{list.map((t) => (
          <tr key={t.id}>
            <td><b>{t.fullName}</b><br /><small>{byId[t.propertyId]?.name}</small></td>
            <td>{roomOf(t) ?? <small>—</small>}</td>
            <td><a href={`tel:${t.phone}`}>{t.phone}</a></td>
            <td>{t.idNumber ? `••••${t.idNumber.slice(-4)}` : <small>chưa có</small>}</td>
            <td><span className={`tag ${t.tamTru?.status ?? "chua"}`}>{L.tamTru[t.tamTru?.status ?? "chua"]}</span>{t.tamTru?.to && <small> đến {fmtDate(t.tamTru.to)}</small>}</td>
            <td>{t.uid ? "✅" : t.inviteCode ? <code>{t.inviteCode}</code> : <button className="ghost" onClick={() => invite(t)}>Tạo mã mời</button>}</td>
            <td className="row"><button className="ghost" onClick={() => setEdit({ ...t })}>Sửa</button><button className="ghost danger" onClick={() => remove(t)}>Xóa</button></td>
          </tr>))}</tbody>
      </table></div>
      <p><small>🔒 Số CCCD và ảnh giấy tờ chỉ chủ/quản lý của khu xem được (nhân viên không xem được). Chỉ thu thập khi người thuê đồng ý.</small></p>

      {edit && (
        <Modal title={edit.id ? `Hồ sơ: ${edit.fullName}` : "Thêm người cư trú"} onClose={() => setEdit(null)} wide>
          <form className="col" onSubmit={save}>
            {scan ? <QrScan onResult={onScan} onClose={() => setScan(false)} /> : <button type="button" className="ghost" onClick={() => setScan(true)}>📷 Quét QR trên CCCD để tự điền</button>}
            <div className="row"><label>Khu<PropSelect value={edit.propertyId} onChange={(propertyId) => setEdit({ ...edit, propertyId })} /></label>{F("fullName", "Họ và tên", { required: true })}</div>
            <div className="row">
              <label>Ngày sinh<DateInput value={edit.dob ?? ""} onChange={(dob) => setEdit({ ...edit, dob })} /></label>
              <label>Giới tính<select value={edit.gender ?? ""} onChange={(e) => setEdit({ ...edit, gender: e.target.value as Tenant["gender"] })}><option value="">—</option><option value="nam">Nam</option><option value="nu">Nữ</option></select></label>
              {F("phone", "Số điện thoại", { required: true, inputMode: "tel" })}
            </div>
            <div className="row">{F("idNumber", "Số CCCD", { inputMode: "numeric", maxLength: 12 })}{F("oldIdNumber", "CMND cũ", { inputMode: "numeric", maxLength: 9 })}
              <label>Ngày cấp<DateInput value={edit.idIssueDate ?? ""} onChange={(idIssueDate) => setEdit({ ...edit, idIssueDate })} /></label></div>
            {F("idIssuePlace", "Nơi cấp")}
            {F("address", "Nơi thường trú")}
            <div className="row">{F("job", "Nghề nghiệp")}{F("workplace", "Nơi làm việc / học")}{F("vehiclePlate", "Biển số xe")}</div>
            <div className="row">{F("emergencyName", "Người liên hệ khẩn cấp")}{F("emergencyPhone", "SĐT khẩn cấp", { inputMode: "tel" })}{F("email", "Email", { type: "email" })}</div>
            <fieldset><legend>Tạm trú</legend><div className="row">
              <label>Trạng thái<select value={edit.tamTru?.status ?? "chua"} onChange={(e) => setEdit({ ...edit, tamTru: { ...edit.tamTru, status: e.target.value as TamTruStatus } })}>{(Object.keys(L.tamTru) as TamTruStatus[]).map((s) => <option key={s} value={s}>{L.tamTru[s]}</option>)}</select></label>
              <label>Từ ngày<DateInput value={edit.tamTru?.from ?? ""} onChange={(from) => setEdit({ ...edit, tamTru: { status: edit.tamTru?.status ?? "chua", ...edit.tamTru, from } })} /></label>
              <label>Đến ngày<DateInput value={edit.tamTru?.to ?? ""} onChange={(to) => setEdit({ ...edit, tamTru: { status: edit.tamTru?.status ?? "chua", ...edit.tamTru, to } })} /></label>
            </div></fieldset>
            {edit.id ? (
              <fieldset><legend>Ảnh giấy tờ (chỉ chủ/quản lý xem)</legend><div className="row">
                {(["idFront", "idBack", "portrait"] as const).map((f) => (
                  <div key={f} className="col">
                    <small>{f === "idFront" ? "CCCD mặt trước" : f === "idBack" ? "CCCD mặt sau" : "Ảnh chân dung"}</small>
                    <DocImage path={edit[f]} label={f} />
                    <label className="filebtn">{busy ? "Đang tải…" : edit[f] ? "Chụp lại" : "📷 Chụp / chọn ảnh"}<input type="file" accept="image/*" capture="environment" hidden disabled={busy} onChange={(e) => upload(f, e.target.files?.[0])} /></label>
                  </div>
                ))}
              </div></fieldset>
            ) : <small>Lưu hồ sơ trước, sau đó chụp ảnh CCCD.</small>}
            <label>Ghi chú<textarea value={edit.note ?? ""} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></label>
            <label className="check"><input type="checkbox" checked={!!edit.consent} onChange={(e) => setEdit({ ...edit, consent: e.target.checked })} required /> Người thuê đồng ý cho lưu thông tin cá nhân để quản lý hợp đồng và đăng ký tạm trú</label>
            {edit.inviteCode && <small>Mã mời tài khoản người thuê: <code>{edit.inviteCode}</code></small>}
            {err && <p className="error">{err}</p>}
            <div className="row"><button type="submit" disabled={busy}>Lưu</button><button type="button" className="ghost" onClick={() => setEdit(null)}>Đóng</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
