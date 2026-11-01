import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { useI18n } from "../i18n";
import { payState } from "../lib/billing";
import { isBankReady, transferContent, vietQrUrl, type Bank } from "../lib/banks";
import { fmtDate, fmtPeriod, todayStr } from "../lib/format";
import { isAdminRole, isStaffRole, type Invoice, type InvoiceLine } from "../lib/types";
import Money from "../components/Money";
import NumInput from "../components/NumInput";
import { saveDraftLines } from "./InvoicesPage";

/** Hóa đơn in được (trình duyệt → In / Lưu PDF dạng văn bản) kèm mã VietQR. Người thuê và nhân viên đều mở được (luật Firestore kiểm tra). */
export default function InvoiceView() {
  const { id = "" } = useParams();
  const { user, profile, loading } = useAuth();
  const { L } = useI18n();
  const [inv, setInv] = useState<Invoice | null | undefined>(undefined);
  const [bank, setBank] = useState<Bank | null>(null);
  const [siteName, setSiteName] = useState("");
  const [extra, setExtra] = useState<{ label: string; amount: number }>({ label: "", amount: 0 });

  useEffect(() => {
    if (!user) return;
    const off = onSnapshot(doc(db, "invoices", id), (s) => setInv(s.exists() ? ({ ...(s.data() as Invoice), id: s.id }) : null), () => setInv(null));
    getDoc(doc(db, "settings", "bank")).then((s) => setBank((s.data() as Bank) ?? null)).catch(() => {});
    getDoc(doc(db, "settings", "contact")).then((s) => setSiteName(s.data()?.name ?? "")).catch(() => {});
    return off;
  }, [id, user]);

  if (loading) return <div className="center">Đang tải…</div>;
  if (!user) return <Navigate to={`/dang-nhap?next=/hoa-don/${id}`} replace />;
  if (inv === undefined) return <div className="center">Đang tải…</div>;
  if (!inv) return <div className="center">Không tìm thấy hóa đơn hoặc bạn không có quyền xem. <Link to="/">Về trang chủ</Link></div>;

  const st = payState(inv, todayStr());
  const due = inv.total - (inv.paid ?? 0);
  const canEdit = isAdminRole(profile?.role) && inv.status === "nhap";
  const addLine = async () => {
    if (!extra.amount) return;
    const l: InvoiceLine = { kind: extra.amount < 0 ? "discount" : "extra", label: extra.label || (extra.amount < 0 ? "Giảm trừ" : "Phát sinh"), qty: 1, den: 1, price: extra.amount, amount: extra.amount };
    await saveDraftLines(inv, [...inv.lines, l], 1000);
    setExtra({ label: "", amount: 0 });
  };
  const delLine = (i: number) => saveDraftLines(inv, inv.lines.filter((_, j) => j !== i), 1000);

  return (
    <div className="invoice-page">
      <div className="noprint row">
        <Link to={isStaffRole(profile?.role) ? "/app/hoa-don" : "/tai-khoan"}>‹ Quay lại</Link>
        <span className="spacer" />
        <button onClick={() => window.print()}>🖨 In / Lưu PDF</button>
      </div>
      <article className="invoice">
        <header>
          <div><h1>HÓA ĐƠN TIỀN NHÀ</h1><div>Kỳ {fmtPeriod(inv.period)} · Mã <b>{inv.code}</b></div></div>
          <div className="right"><b>{siteName || inv.propertyName}</b><br />{inv.propertyName}<br /><span className={`tag ${st}`}>{L.payState[st]}</span></div>
        </header>
        <p>Phòng <b>{inv.roomCode}</b> · Người thuê: <b>{inv.tenantName}</b>{inv.dueDate && <> · Hạn thanh toán: <b>{fmtDate(inv.dueDate)}</b></>}</p>
        {inv.note && <p><i>{inv.note}</i></p>}
        <table className="tbl lines">
          <thead><tr><th>Nội dung</th><th className="num">SL</th><th className="num">Đơn giá</th><th className="num">Thành tiền</th>{canEdit && <th />}</tr></thead>
          <tbody>{inv.lines.map((l, i) => (
            <tr key={i}><td>{l.label}</td><td className="num">{l.kind === "round" ? "" : l.den && l.den > 1 ? `${l.qty}/${l.den}` : l.qty}</td><td className="num">{l.kind === "round" ? "" : <Money v={l.price} />}</td><td className="num"><Money v={l.amount} /></td>
              {canEdit && <td>{(l.kind === "extra" || l.kind === "discount") && <button className="ghost danger" onClick={() => delLine(i)}>✕</button>}</td>}</tr>))}</tbody>
          <tfoot>
            <tr><th colSpan={3}>Tổng cộng</th><th className="num"><Money v={inv.total} /></th>{canEdit && <th />}</tr>
            {(inv.paid ?? 0) !== 0 && <tr><td colSpan={3}>Đã thanh toán</td><td className="num"><Money v={inv.paid} /></td>{canEdit && <td />}</tr>}
            {(inv.paid ?? 0) !== 0 && <tr><th colSpan={3}>Còn lại</th><th className="num"><Money v={due} /></th>{canEdit && <th />}</tr>}
          </tfoot>
        </table>
        {canEdit && (
          <div className="row noprint">
            <label>Thêm phát sinh (+) / giảm trừ (−)<input value={extra.label} placeholder="Nội dung" onChange={(e) => setExtra({ ...extra, label: e.target.value })} /></label>
            <label>Số tiền<NumInput step={1000} value={extra.amount} onChange={(e) => setExtra({ ...extra, amount: Math.round(Number(e.target.value)) })} /></label>
            <button onClick={addLine}>Thêm dòng</button>
          </div>
        )}
        {inv.status === "da_gui" && due > 0 && (
          <div className="pay">
            {isBankReady(bank) ? <>
              <img src={vietQrUrl(bank, due, transferContent(inv.code))} alt="Mã VietQR chuyển khoản" width={220} />
              <div>
                <div>Quét mã bằng ứng dụng ngân hàng, hoặc chuyển khoản:</div>
                <div>Ngân hàng: <b>{bank.bankName}</b></div>
                <div>Số tài khoản: <b>{bank.accountNo}</b></div>
                <div>Chủ tài khoản: <b>{bank.accountName}</b></div>
                <div>Số tiền: <b><Money v={due} /></b></div>
                <div>Nội dung: <b className="code">{transferContent(inv.code)}</b></div>
              </div>
            </> : <p>Chủ nhà chưa cài đặt tài khoản nhận tiền.</p>}
          </div>
        )}
        {(inv.payLog ?? []).length > 0 && (
          <div className="paylog"><h4>Lịch sử thanh toán</h4>
            <ul>{inv.payLog.map((p, i) => <li key={i}>{fmtDate(p.date)} · {L.payMethod[p.method] ?? p.method} · <Money v={p.amount} />{p.note ? ` · ${p.note}` : ""}</li>)}</ul></div>
        )}
      </article>
    </div>
  );
}
