import { useState } from "react";
import { collection, deleteDoc, doc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useProps, useScoped } from "../lib/scoped";
import { useI18n } from "../i18n";
import { useAudit } from "../lib/audit";
import { parseCccdQr } from "../lib/cccd";
import { DOC_IMAGES, DOC_TYPES, docNumberError, docTypeOf, maskDoc, normDocNumber, type DocImageField, type DocType } from "../lib/idDoc";
import { imageUrl, uploadImage, removeImage } from "../lib/listings";
import { fmtDate, normName, randomCode } from "../lib/format";
import { SITE_URL } from "../lib/siteConfig";
import type { Contract, Tenant, TamTruStatus } from "../lib/types";
import DateInput from "../components/DateInput";
import Modal from "../components/Modal";
import PropSelect from "../components/PropSelect";
import QrScan from "../components/QrScan";

/** Bản nháp hồ sơ: `id` có sẵn ngay khi mở form thêm mới (để tải ảnh giấy tờ trước khi lưu); `isNew` = chưa lưu lần nào. */
type Draft = Omit<Tenant, "id"> & { id: string; isNew?: boolean; uploaded?: string[] };

/** Ảnh giấy tờ: xem (tải đường dẫn khi bấm, vì ảnh là dữ liệu nhạy cảm) + chụp bằng camera hoặc chọn ảnh có sẵn. */
function DocImageBox({ label, path, busy, onPick }: { label: string; path?: string; busy: boolean; onPick: (f?: File) => void }) {
  const [url, setUrl] = useState("");
  const [shownFor, setShownFor] = useState("");
  const show = () => imageUrl(path!).then((u) => { setUrl(u); setShownFor(path!); }).catch(() => alert("Không mở được ảnh"));
  return (
    <div className="col docbox">
      <small><b>{label}</b></small>
      {path ? (url && shownFor === path
        ? <a href={url} target="_blank" rel="noreferrer"><img className="docimg" src={url} alt={label} /></a>
        : <button type="button" className="ghost" onClick={show}>🔒 Xem ảnh</button>)
        : <small className="muted">Chưa có ảnh</small>}
      <div className="row">
        <label className="filebtn">{busy ? "Đang tải…" : "📷 Chụp"}<input type="file" accept="image/*" capture="environment" hidden disabled={busy} onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ""; }} /></label>
        <label className="filebtn">{busy ? "…" : "🖼 Chọn ảnh"}<input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ""; }} /></label>
      </div>
    </div>
  );
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
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const blank = (): Draft => ({ id: doc(collection(db, "tenants")).id, isNew: true, uploaded: [], propertyId: current || props[0]?.id || "", docType: "cccd", fullName: "", idNumber: "", phone: "", gender: "", nationality: "Việt Nam", tamTru: { status: "chua" }, consent: false });
  const roomOf = (t: Tenant) => contracts.find((c) => c.status === "hieu_luc" && c.occupants.some((o) => o.tenantId === t.id && !o.to))?.roomCode;
  const dtype = edit ? docTypeOf(edit) : "cccd";

  /** Đóng form: hồ sơ mới chưa lưu thì xóa ảnh đã tải lên để không để lại ảnh giấy tờ mồ côi. */
  const close = () => {
    if (edit?.isNew) for (const p of edit.uploaded ?? []) removeImage(p);
    setEdit(null); setScan(false); setErr("");
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    setErr("");
    const number = normDocNumber(edit.idNumber);
    const bad = docNumberError(dtype, number);
    if (bad) return setErr(bad);
    if (edit.oldIdNumber && !/^\d{9}$/.test(normDocNumber(edit.oldIdNumber))) return setErr("Số CMND cũ phải có 9 chữ số.");
    const dup = number && tenants.find((t) => t.id !== edit.id && docTypeOf(t) === dtype && normDocNumber(t.idNumber) === number);
    if (dup) return setErr(`${L.docTypeShort[dtype]} số này đã có hồ sơ: ${dup.fullName}.`);
    const { id, isNew, uploaded, ...data } = edit;
    void uploaded;
    const clean = Object.fromEntries(Object.entries({ ...data, docType: dtype, idNumber: number, oldIdNumber: dtype === "cccd" ? normDocNumber(edit.oldIdNumber ?? "") || undefined : undefined }).filter(([, v]) => v !== undefined));
    try {
      await setDoc(doc(db, "tenants", id), clean);
      audit("tenant.save", `${isNew ? "Thêm" : "Sửa"} hồ sơ ${data.fullName} (${L.docTypeShort[dtype]})`, { type: "tenant", id });
      setEdit(null); setScan(false);
    } catch (x) { setErr((x as Error).message); }
  };

  const upload = async (field: DocImageField, f?: File) => {
    if (!f || !edit) return;
    if (!edit.propertyId) return setErr("Chọn khu trước khi tải ảnh giấy tờ.");
    setBusy(field); setErr("");
    try {
      const { path } = await uploadImage(`tenants/${edit.propertyId}/${edit.id}/${field}-${Date.now()}.jpg`, f);
      const old = edit[field];
      if (!edit.isNew) await updateDoc(doc(db, "tenants", edit.id), { [field]: path }); // hồ sơ đã có: lưu ngay
      if (old) removeImage(old);
      setEdit({ ...edit, [field]: path, uploaded: [...(edit.uploaded ?? []), path] });
    } catch (x) { setErr("Tải ảnh lỗi: " + (x as Error).message); } finally { setBusy(""); }
  };
  const invite = async (t: Tenant) => {
    const code = randomCode(6);
    await updateDoc(doc(db, "tenants", t.id), { inviteCode: code });
    prompt(`Gửi mã mời cho ${t.fullName}. Người thuê đăng nhập ${SITE_URL}/tai-khoan rồi nhập mã:`, code);
  };
  const remove = async (t: Tenant) => {
    if (roomOf(t)) return alert("Người này đang ở trong hợp đồng hiệu lực.");
    if (!confirm(`Xóa hồ sơ ${t.fullName}? (ảnh giấy tờ cũng bị xóa)`)) return;
    for (const p of [t.idFront, t.idBack, t.portrait]) if (p) removeImage(p);
    await deleteDoc(doc(db, "tenants", t.id));
    audit("tenant.delete", `Xóa hồ sơ ${t.fullName}`, { type: "tenant", id: t.id });
  };
  const onScan = (text: string) => {
    const d = parseCccdQr(text);
    setScan(false);
    if (!d || !edit) return setErr("Không đọc được mã QR trên CCCD.");
    setEdit({ ...edit, docType: "cccd", idNumber: d.idNumber, oldIdNumber: d.oldIdNumber || edit.oldIdNumber, fullName: d.fullName, dob: d.dob || edit.dob, gender: d.gender || edit.gender, address: d.address || edit.address, idIssueDate: d.idIssueDate || edit.idIssueDate, idIssuePlace: edit.idIssuePlace || "Cục Cảnh sát QLHC về TTXH", nationality: "Việt Nam" });
  };
  const setType = (t: DocType) => edit && setEdit({ ...edit, docType: t, nationality: t === "passport" ? (edit.nationality === "Việt Nam" ? "" : edit.nationality) : "Việt Nam", oldIdNumber: t === "cccd" ? edit.oldIdNumber : undefined });

  const nq = normName(q);
  const list = tenants.filter((t) => !nq || normName(`${t.fullName} ${t.phone} ${t.idNumber} ${t.oldIdNumber ?? ""}`).includes(nq)).sort((a, b) => a.fullName.localeCompare(b.fullName, "vi"));
  const F = (k: keyof Draft, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label>{label}<input value={(edit?.[k] as string) ?? ""} onChange={(e) => setEdit({ ...edit!, [k]: e.target.value })} {...extra} /></label>
  );
  const numLabel = dtype === "passport" ? "Số hộ chiếu" : dtype === "cmnd" ? "Số CMND" : "Số CCCD";

  return (
    <>
      <div className="row between"><h2>Người cư trú</h2><button onClick={() => { setErr(""); setEdit(blank()); }}>+ Thêm người</button></div>
      <input placeholder="Tìm theo tên, SĐT, số giấy tờ…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="scroll"><table className="tbl">
        <thead><tr><th>Họ tên</th><th>Phòng</th><th>SĐT</th><th>Giấy tờ</th><th>Tạm trú</th><th>Tài khoản</th><th /></tr></thead>
        <tbody>{list.map((t) => (
          <tr key={t.id}>
            <td><b>{t.fullName}</b><br /><small>{byId[t.propertyId]?.name}{t.nationality && t.nationality !== "Việt Nam" ? ` · ${t.nationality}` : ""}</small></td>
            <td>{roomOf(t) ?? <small>—</small>}</td>
            <td><a href={`tel:${t.phone}`}>{t.phone}</a></td>
            <td>{t.idNumber ? <>{L.docTypeShort[docTypeOf(t)]} {maskDoc(t.idNumber)}</> : <small>chưa có</small>}{t.idFront ? " 🖼" : ""}</td>
            <td><span className={`tag ${t.tamTru?.status ?? "chua"}`}>{L.tamTru[t.tamTru?.status ?? "chua"]}</span>{t.tamTru?.to && <small> đến {fmtDate(t.tamTru.to)}</small>}</td>
            <td>{t.uid ? "✅" : t.inviteCode ? <code>{t.inviteCode}</code> : <button className="ghost" onClick={() => invite(t)}>Tạo mã mời</button>}</td>
            <td className="row"><button className="ghost" onClick={() => { setErr(""); setEdit({ ...t }); }}>Sửa</button><button className="ghost danger" onClick={() => remove(t)}>Xóa</button></td>
          </tr>))}</tbody>
      </table></div>
      <p><small>🔒 Số giấy tờ và ảnh giấy tờ chỉ chủ/quản lý của khu xem được (nhân viên không xem được). Chỉ thu thập khi người thuê đồng ý.</small></p>

      {edit && (
        <Modal title={edit.isNew ? "Thêm người cư trú" : `Hồ sơ: ${edit.fullName}`} onClose={close} wide>
          <form className="col" onSubmit={save}>
            <div className="row"><label>Khu<PropSelect value={edit.propertyId} onChange={(propertyId) => setEdit({ ...edit, propertyId })} /></label>{F("fullName", "Họ và tên", { required: true })}</div>
            <div className="row">
              <label>Ngày sinh<DateInput value={edit.dob ?? ""} onChange={(dob) => setEdit({ ...edit, dob })} /></label>
              <label>Giới tính<select value={edit.gender ?? ""} onChange={(e) => setEdit({ ...edit, gender: e.target.value as Tenant["gender"] })}><option value="">—</option><option value="nam">Nam</option><option value="nu">Nữ</option></select></label>
              {F("phone", "Số điện thoại", { required: true, inputMode: "tel" })}
            </div>

            <fieldset><legend>Giấy tờ tùy thân</legend>
              <div className="row doctypes" role="radiogroup" aria-label="Loại giấy tờ">
                {DOC_TYPES.map((t) => <label key={t} className="check"><input type="radio" name="doctype" checked={dtype === t} onChange={() => setType(t)} /> {L.docType[t]}</label>)}
              </div>
              {dtype !== "passport" && (scan ? <QrScan onResult={onScan} onClose={() => setScan(false)} /> : <button type="button" className="ghost" onClick={() => setScan(true)}>📷 Quét QR trên CCCD gắn chip để tự điền</button>)}
              <div className="row">
                {F("idNumber", numLabel, { inputMode: dtype === "passport" ? "text" : "numeric", maxLength: dtype === "passport" ? 12 : 12, autoCapitalize: "characters" })}
                {dtype === "cccd" && F("oldIdNumber", "Số CMND cũ (nếu có)", { inputMode: "numeric", maxLength: 9 })}
                {dtype === "passport" && F("nationality", "Quốc tịch", { required: true, placeholder: "vd Hàn Quốc" })}
              </div>
              <div className="row">
                <label>Ngày cấp<DateInput value={edit.idIssueDate ?? ""} onChange={(idIssueDate) => setEdit({ ...edit, idIssueDate })} /></label>
                {F("idIssuePlace", "Nơi cấp")}
                <label>{dtype === "passport" ? "Ngày hết hạn" : "Có giá trị đến"}<DateInput value={edit.docExpiry ?? ""} onChange={(docExpiry) => setEdit({ ...edit, docExpiry })} /></label>
              </div>
              <h4>Ảnh giấy tờ <small>(chỉ chủ/quản lý xem)</small></h4>
              <div className="row docimgs">
                {DOC_IMAGES[dtype].map(({ field, label }) => <DocImageBox key={field} label={label} path={edit[field]} busy={busy === field} onPick={(f) => upload(field, f)} />)}
              </div>
            </fieldset>

            {F("address", dtype === "passport" ? "Địa chỉ ở nước ngoài / tại Việt Nam" : "Nơi thường trú")}
            <div className="row">{F("job", "Nghề nghiệp")}{F("workplace", "Nơi làm việc / học")}{F("vehiclePlate", "Biển số xe")}</div>
            <div className="row">{F("emergencyName", "Người liên hệ khẩn cấp")}{F("emergencyPhone", "SĐT khẩn cấp", { inputMode: "tel" })}{F("email", "Email", { type: "email" })}</div>
            <fieldset><legend>{dtype === "passport" ? "Tạm trú (khai báo tạm trú người nước ngoài)" : "Tạm trú"}</legend><div className="row">
              <label>Trạng thái<select value={edit.tamTru?.status ?? "chua"} onChange={(e) => setEdit({ ...edit, tamTru: { ...edit.tamTru, status: e.target.value as TamTruStatus } })}>{(Object.keys(L.tamTru) as TamTruStatus[]).map((s) => <option key={s} value={s}>{L.tamTru[s]}</option>)}</select></label>
              <label>Từ ngày<DateInput value={edit.tamTru?.from ?? ""} onChange={(from) => setEdit({ ...edit, tamTru: { status: edit.tamTru?.status ?? "chua", ...edit.tamTru, from } })} /></label>
              <label>Đến ngày<DateInput value={edit.tamTru?.to ?? ""} onChange={(to) => setEdit({ ...edit, tamTru: { status: edit.tamTru?.status ?? "chua", ...edit.tamTru, to } })} /></label>
            </div></fieldset>
            <label>Ghi chú<textarea value={edit.note ?? ""} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></label>
            <label className="check"><input type="checkbox" checked={!!edit.consent} onChange={(e) => setEdit({ ...edit, consent: e.target.checked })} required /> Người thuê đồng ý cho lưu thông tin cá nhân để quản lý hợp đồng và đăng ký tạm trú</label>
            {edit.inviteCode && <small>Mã mời tài khoản người thuê: <code>{edit.inviteCode}</code></small>}
            {err && <p className="error">{err}</p>}
            <div className="row"><button type="submit" disabled={!!busy}>Lưu</button><button type="button" className="ghost" onClick={close}>{edit.isNew ? "Hủy" : "Đóng"}</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
