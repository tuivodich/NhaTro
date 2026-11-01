import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { useI18n } from "../i18n";
import { parseCccdQr } from "../lib/cccd";
import { DOC_IMAGES, DOC_TYPES, docNumberError, normDocNumber, type DocImageField, type DocType } from "../lib/idDoc";
import { removeImage, uploadImage } from "../lib/listings";
import type { Profile } from "../lib/types";
import DateInput from "../components/DateInput";
import DocImageBox from "../components/DocImageBox";
import QrScan from "../components/QrScan";
import { PublicHeader } from "./Landing";

/**
 * "Hồ sơ của tôi": người dùng tự lưu thông tin và ảnh giấy tờ một lần, dùng lại cho mọi lần đăng ký thuê.
 * Chỉ chính chủ đọc được (luật Firestore/Storage); chủ nhà chỉ nhận bản chép khi người dùng tick "đồng ý chia sẻ" lúc đăng ký thuê.
 */
export default function MyProfile() {
  const { user, profile: account, loading } = useAuth();
  const { L } = useI18n();
  const [p, setP] = useState<Profile | null>(null);
  const [busy, setBusy] = useState("");
  const [scan, setScan] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "profiles", user.uid)).then((s) => setP((s.data() as Profile) ?? { fullName: account?.name || user.displayName || "", phone: account?.phone || "", email: user.email ?? "", docType: "cccd", nationality: "Việt Nam" }))
      .catch(() => setP({ docType: "cccd" }));
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="center">Đang tải…</div>;
  if (!user) return <Navigate to="/dang-nhap?next=/ho-so" replace />;
  if (!p) return <div className="center">Đang tải…</div>;
  const dtype: DocType = p.docType ?? "cccd";
  const clean = (o: Profile) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(""); setMsg("");
    const bad = docNumberError(dtype, p.idNumber ?? "");
    if (bad) return setErr(bad);
    if (p.oldIdNumber && !/^\d{9}$/.test(normDocNumber(p.oldIdNumber))) return setErr("Số CMND cũ phải có 9 chữ số.");
    try {
      await setDoc(doc(db, "profiles", user.uid), clean({ ...p, docType: dtype, idNumber: normDocNumber(p.idNumber ?? ""), oldIdNumber: dtype === "cccd" && p.oldIdNumber ? normDocNumber(p.oldIdNumber) : undefined }));
      if (p.fullName && p.fullName !== account?.name) await updateDoc(doc(db, "users", user.uid), { name: p.fullName, ...(p.phone ? { phone: p.phone } : {}) }).catch(() => {});
      setMsg("✅ Đã lưu hồ sơ. Lần sau đăng ký thuê, chủ nhà có thể dùng hồ sơ này nếu bạn đồng ý chia sẻ.");
    } catch (x) { setErr((x as Error).message); }
  };
  const upload = async (field: DocImageField, f?: File) => {
    if (!f) return;
    setBusy(field); setErr("");
    try {
      const { path } = await uploadImage(`profiles/${user.uid}/${field}-${Date.now()}.jpg`, f);
      const old = p[field];
      const next = { ...p, [field]: path };
      await setDoc(doc(db, "profiles", user.uid), clean({ ...next, docType: dtype })); // lưu ngay để ảnh không mồ côi
      if (old) removeImage(old);
      setP(next);
    } catch (x) { setErr("Tải ảnh lỗi: " + (x as Error).message); } finally { setBusy(""); }
  };
  const onScan = (text: string) => {
    setScan(false);
    const d = parseCccdQr(text);
    if (!d) return setErr("Không đọc được mã QR trên CCCD.");
    setP({ ...p, docType: "cccd", idNumber: d.idNumber, oldIdNumber: d.oldIdNumber || p.oldIdNumber, fullName: d.fullName, dob: d.dob || p.dob, gender: d.gender || p.gender, address: d.address || p.address, idIssueDate: d.idIssueDate || p.idIssueDate, nationality: "Việt Nam" });
  };
  const F = (k: keyof Profile, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label>{label}<input value={(p[k] as string) ?? ""} onChange={(e) => setP({ ...p, [k]: e.target.value })} {...extra} /></label>
  );

  return (
    <div className="pub">
      <PublicHeader />
      <main className="pub-main">
        <div className="row between"><h2>Hồ sơ của tôi</h2><Link to="/tai-khoan">‹ Tài khoản</Link></div>
        <p><small>🔒 Chỉ bạn xem được hồ sơ này. Khi đăng ký thuê phòng, bạn chọn có cho chủ nhà dùng hồ sơ (kèm ảnh giấy tờ) để lập hợp đồng và đăng ký tạm trú hay không — không phải nhập lại mỗi lần.</small></p>
        <form className="card col" onSubmit={save}>
          <div className="row">{F("fullName", "Họ và tên", { required: true, autoComplete: "name" })}{F("phone", "Số điện thoại", { required: true, inputMode: "tel", autoComplete: "tel" })}</div>
          <div className="row">
            <label>Ngày sinh<DateInput value={p.dob ?? ""} onChange={(dob) => setP({ ...p, dob })} /></label>
            <label>Giới tính<select value={p.gender ?? ""} onChange={(e) => setP({ ...p, gender: e.target.value as Profile["gender"] })}><option value="">—</option><option value="nam">Nam</option><option value="nu">Nữ</option></select></label>
            {F("email", "Email", { type: "email" })}
          </div>
          <fieldset><legend>Giấy tờ tùy thân</legend>
            <div className="row doctypes" role="radiogroup" aria-label="Loại giấy tờ">
              {DOC_TYPES.map((t) => <label key={t} className="check"><input type="radio" name="doctype" checked={dtype === t} onChange={() => setP({ ...p, docType: t, nationality: t === "passport" ? (p.nationality === "Việt Nam" ? "" : p.nationality) : "Việt Nam" })} /> {L.docType[t]}</label>)}
            </div>
            {dtype !== "passport" && (scan ? <QrScan onResult={onScan} onClose={() => setScan(false)} /> : <button type="button" className="ghost" onClick={() => setScan(true)}>📷 Quét QR trên CCCD gắn chip để tự điền</button>)}
            <div className="row">
              {F("idNumber", dtype === "passport" ? "Số hộ chiếu" : dtype === "cmnd" ? "Số CMND" : "Số CCCD", { inputMode: dtype === "passport" ? "text" : "numeric", maxLength: 12 })}
              {dtype === "cccd" && F("oldIdNumber", "Số CMND cũ (nếu có)", { inputMode: "numeric", maxLength: 9 })}
              {dtype === "passport" && F("nationality", "Quốc tịch", { required: true })}
            </div>
            <div className="row">
              <label>Ngày cấp<DateInput value={p.idIssueDate ?? ""} onChange={(idIssueDate) => setP({ ...p, idIssueDate })} /></label>
              {F("idIssuePlace", "Nơi cấp")}
              <label>{dtype === "passport" ? "Ngày hết hạn" : "Có giá trị đến"}<DateInput value={p.docExpiry ?? ""} onChange={(docExpiry) => setP({ ...p, docExpiry })} /></label>
            </div>
            <h4>Ảnh giấy tờ</h4>
            <div className="row docimgs">{DOC_IMAGES[dtype].map(({ field, label }) => <DocImageBox key={field} label={label} path={p[field]} busy={busy === field} onPick={(f) => upload(field, f)} />)}</div>
          </fieldset>
          {F("address", dtype === "passport" ? "Địa chỉ" : "Nơi thường trú")}
          <div className="row">{F("job", "Nghề nghiệp")}{F("workplace", "Nơi làm việc / học")}{F("vehiclePlate", "Biển số xe")}</div>
          <div className="row">{F("emergencyName", "Người liên hệ khẩn cấp")}{F("emergencyPhone", "SĐT khẩn cấp", { inputMode: "tel" })}</div>
          {err && <p className="error">{err}</p>}
          {msg && <p>{msg}</p>}
          <div className="row"><button type="submit" disabled={!!busy}>Lưu hồ sơ</button></div>
        </form>
      </main>
    </div>
  );
}
