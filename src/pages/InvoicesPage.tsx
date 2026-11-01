import { useState } from "react";
import { Link } from "react-router-dom";
import { collection, deleteDoc, doc, updateDoc, writeBatch, Timestamp } from "firebase/firestore";
import { db, call } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { useProps, useScoped } from "../lib/scoped";
import { useI18n } from "../i18n";
import { useAudit } from "../lib/audit";
import { buildInvoice, payState, prevPeriod, type MeterPair } from "../lib/billing";
import { addDays, addMonths, fmtDate, fmtPeriod, randomCode, thisPeriod, todayStr } from "../lib/format";
import { isAdminRole, type Contract, type Invoice, type MeterReading, type PayEntry } from "../lib/types";
import NumInput from "../components/NumInput";
import Modal from "../components/Modal";
import Money from "../components/Money";

export default function InvoicesPage() {
  const { profile } = useAuth();
  const admin = isAdminRole(profile?.role);
  const { L } = useI18n();
  const audit = useAudit();
  const { inScope, byId } = useProps();
  const [period, setPeriod] = useState(thisPeriod());
  const invQ = useScoped<Invoice>("invoices"), conQ = useScoped<Contract>("contracts"), metQ = useScoped<MeterReading>("meterReadings");
  const invoices = invQ.data.filter((i) => inScope(i.propertyId));
  const contracts = conQ.data.filter((c) => inScope(c.propertyId));
  const readings = metQ.data;
  const loaded = !invQ.loading && !conQ.loading && !metQ.loading;
  const [preview, setPreview] = useState<{ c: Contract; lines: Invoice["lines"]; total: number; warnings: string[] }[] | null>(null);
  const [pay, setPay] = useState<{ inv: Invoice; amount: number; method: PayEntry["method"]; date: string; note: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const today = todayStr();
  const ofPeriod = invoices.filter((i) => i.period === period && i.status !== "huy");

  const readingsFor = (c: Contract): Record<string, MeterPair> => {
    const out: Record<string, MeterPair> = {};
    for (const s of c.services.filter((x) => x.mode === "meter")) {
      const now = readings.find((r) => r.id === `${c.id}_${period}_${s.id}`);
      const before = readings.filter((r) => r.contractId === c.id && r.serviceId === s.id && r.period <= prevPeriod(period)).sort((a, b) => b.period.localeCompare(a.period))[0];
      out[s.id] = { old: before?.value ?? null, new: now?.value ?? null };
    }
    return out;
  };

  /** Lập nháp cho các hợp đồng chưa có hóa đơn kỳ này. */
  const makePreview = () => {
    const todo = contracts.filter((c) => c.status === "hieu_luc" && !ofPeriod.some((i) => i.contractId === c.id) && c.start.slice(0, 7) <= period);
    setPreview(todo.map((c) => ({ c, ...buildInvoice({ contract: c, period, readings: readingsFor(c), roundTo: byId[c.propertyId]?.roundTo ?? 1000 }) })));
  };
  const saveDrafts = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const b = writeBatch(db);
      for (const p of preview.filter((x) => x.total > 0)) {
        const prop = byId[p.c.propertyId];
        const due = addDays(`${period}-${String(prop?.billingDay ?? 1).padStart(2, "0")}`, prop?.dueDays ?? 5);
        const inv: Omit<Invoice, "id"> = { code: randomCode(6), propertyId: p.c.propertyId, propertyName: prop?.name ?? "", roomId: p.c.roomId, roomCode: p.c.roomCode, contractId: p.c.id, period, tenantUids: p.c.tenantUids, tenantName: p.c.tenantName, lines: p.lines, total: p.total, paid: 0, payLog: [], status: "nhap", dueDate: due, createdBy: profile?.email ?? "" };
        b.set(doc(collection(db, "invoices")), inv);
      }
      await b.commit();
      audit("invoice.draft", `Lập ${preview.length} hóa đơn nháp kỳ ${fmtPeriod(period)}`);
      setPreview(null);
    } catch (x) { setMsg((x as Error).message); } finally { setBusy(false); }
  };

  const issue = async (ids: string[]) => {
    if (!ids.length || !confirm(`Phát hành ${ids.length} hóa đơn và gửi cho người thuê (Telegram)?`)) return;
    setBusy(true); setMsg("");
    try {
      const r = await call<{ ids: string[] }, { issued: string[]; failed: { id: string; problems: string[] }[]; sent: number }>("issueInvoices")({ ids });
      setMsg(`Đã phát hành ${r.data.issued.length} hóa đơn, gửi ${r.data.sent} tin Telegram.${r.data.failed.length ? ` Không phát hành ${r.data.failed.length}: ${r.data.failed.map((f) => f.problems.join("; ")).join(" | ")}` : ""}`);
    } catch (x) {
      // Cloud Functions chưa triển khai: phát hành trực tiếp (không gửi Telegram).
      if (!confirm(`Không gọi được máy chủ (${(x as Error).message}). Phát hành trực tiếp, không gửi Telegram?`)) return setBusy(false);
      for (const id of ids) await updateDoc(doc(db, "invoices", id), { status: "da_gui", issuedOn: today });
      setMsg(`Đã phát hành ${ids.length} hóa đơn (chưa gửi Telegram).`);
    } finally { setBusy(false); }
  };
  const cancel = async (inv: Invoice) => {
    if (inv.status === "nhap") { if (confirm("Xóa hóa đơn nháp?")) await deleteDoc(doc(db, "invoices", inv.id)); return; }
    if ((inv.paid ?? 0) > 0) return alert("Hóa đơn đã thu tiền — ghi hoàn tiền trước khi hủy.");
    if (!confirm(`Hủy hóa đơn ${inv.code}?`)) return;
    await updateDoc(doc(db, "invoices", inv.id), { status: "huy" });
    audit("invoice.cancel", `Hủy hóa đơn ${inv.code} ${inv.roomCode}`, { type: "invoice", id: inv.id });
  };
  const savePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pay || !pay.amount) return;
    const entry: PayEntry = { amount: pay.amount, date: pay.date, method: pay.method, by: profile?.email ?? "", note: pay.note, at: Timestamp.now() };
    try {
      await updateDoc(doc(db, "invoices", pay.inv.id), { paid: (pay.inv.paid ?? 0) + pay.amount, payLog: [...(pay.inv.payLog ?? []), entry] });
      audit("payment", `${pay.amount > 0 ? "Thu" : "Hoàn"} ${Math.abs(pay.amount).toLocaleString("vi-VN")} đ — ${pay.inv.roomCode} kỳ ${fmtPeriod(pay.inv.period)}`, { type: "invoice", id: pay.inv.id });
      setPay(null);
    } catch (x) { alert((x as Error).message); }
  };
  const resend = async (id: string) => {
    try { const r = await call<{ id: string }, { sent: number }>("resendInvoice")({ id }); alert(`Đã gửi ${r.data.sent} tin.`); } catch (x) { alert((x as Error).message); }
  };

  const drafts = ofPeriod.filter((i) => i.status === "nhap");
  const sum = ofPeriod.filter((i) => i.status === "da_gui").reduce((a, i) => ({ total: a.total + i.total, paid: a.paid + (i.paid ?? 0) }), { total: 0, paid: 0 });
  const older = invoices.filter((i) => i.period < period && i.status === "da_gui" && payState(i, today) !== "da_thu");

  const Row = (inv: Invoice) => {
    const st = payState(inv, today);
    return (
      <tr key={inv.id} className={st === "qua_han" ? "late" : ""}>
        <td><b>{inv.roomCode}</b><br /><small>{byId[inv.propertyId]?.name}</small></td>
        <td>{inv.tenantName}<br /><small><Link to={`/hoa-don/${inv.id}`}>{inv.code}</Link> · kỳ {fmtPeriod(inv.period)}</small></td>
        <td className="num"><Money v={inv.total} /></td>
        <td className="num"><Money v={inv.paid ?? 0} /></td>
        <td><span className={`tag ${st}`}>{L.payState[st]}</span><br /><small>hạn {fmtDate(inv.dueDate)}</small></td>
        <td className="row">
          {inv.status === "da_gui" && st !== "da_thu" && <button onClick={() => setPay({ inv, amount: inv.total - (inv.paid ?? 0), method: "cash", date: today, note: "" })}>Thu tiền</button>}
          {admin && inv.status === "nhap" && <button disabled={busy} onClick={() => issue([inv.id])}>Phát hành</button>}
          <Link className="btnlink" to={`/hoa-don/${inv.id}`}>Xem/In</Link>
          {inv.status === "da_gui" && <button className="ghost" onClick={() => resend(inv.id)}>Gửi lại</button>}
          {admin && inv.status === "da_gui" && (inv.paid ?? 0) > 0 && <button className="ghost" onClick={() => setPay({ inv, amount: -(inv.paid ?? 0), method: "cash", date: today, note: "Hoàn tiền" })}>Hoàn</button>}
          {admin && <button className="ghost danger" onClick={() => cancel(inv)}>{inv.status === "nhap" ? "Xóa" : "Hủy"}</button>}
        </td>
      </tr>
    );
  };

  return (
    <>
      <h2>Hóa đơn &amp; thu tiền</h2>
      <div className="row">
        <button className="ghost" onClick={() => setPeriod(addMonths(period, -1))}>‹</button><b>Kỳ {fmtPeriod(period)}</b><button className="ghost" onClick={() => setPeriod(addMonths(period, 1))}>›</button>
        <span className="spacer" />
        {admin && <button disabled={!loaded} onClick={makePreview}>Lập hóa đơn kỳ {fmtPeriod(period)}</button>}
        {admin && drafts.length > 0 && <button disabled={busy} onClick={() => issue(drafts.map((d) => d.id))}>Phát hành tất cả nháp ({drafts.length})</button>}
      </div>
      <div className="grid stats">
        <div className="card"><small>Đã phát hành kỳ này</small><big><Money v={sum.total} /></big></div>
        <div className="card"><small>Đã thu</small><big><Money v={sum.paid} /></big></div>
        <div className="card"><small>Còn lại</small><big><Money v={sum.total - sum.paid} /></big></div>
      </div>
      {msg && <p className="card">{msg}</p>}
      <div className="scroll"><table className="tbl">
        <thead><tr><th>Phòng</th><th>Người thuê / mã</th><th className="num">Tổng</th><th className="num">Đã thu</th><th>Trạng thái</th><th /></tr></thead>
        <tbody>{ofPeriod.sort((a, b) => a.roomCode.localeCompare(b.roomCode, "vi", { numeric: true })).map(Row)}</tbody>
      </table></div>
      {!ofPeriod.length && <p>Chưa có hóa đơn kỳ này.{admin && " Ghi chỉ số điện nước trước, rồi bấm “Lập hóa đơn”."}</p>}
      {older.length > 0 && <>
        <h3>Nợ các kỳ trước</h3>
        <div className="scroll"><table className="tbl"><tbody>{older.map(Row)}</tbody></table></div>
      </>}

      {preview && (
        <Modal title={`Xem trước hóa đơn kỳ ${fmtPeriod(period)}`} onClose={() => setPreview(null)} wide>
          {!preview.length && <p>Mọi hợp đồng đã có hóa đơn kỳ này.</p>}
          {preview.map((p) => (
            <div key={p.c.id} className="card inner">
              <div className="row between"><b>{p.c.roomCode} · {p.c.tenantName}</b><Money v={p.total} /></div>
              <ul className="lines">{p.lines.map((l, i) => <li key={i}><span>{l.label}</span><Money v={l.amount} /></li>)}</ul>
              {p.warnings.map((w) => <p key={w} className="warn">⚠️ {w}</p>)}
            </div>
          ))}
          <p><small>Hóa đơn được lưu dạng <b>nháp</b>; sửa phát sinh/giảm trừ ở trang hóa đơn rồi mới phát hành. Máy chủ tính lại toàn bộ khi phát hành.</small></p>
          <div className="row"><button disabled={busy || !preview.length} onClick={saveDrafts}>Lưu {preview.filter((x) => x.total > 0).length} hóa đơn nháp</button><button className="ghost" onClick={() => setPreview(null)}>Đóng</button></div>
        </Modal>
      )}
      {pay && (
        <Modal title={`${pay.amount < 0 ? "Hoàn tiền" : "Thu tiền"} · ${pay.inv.roomCode} kỳ ${fmtPeriod(pay.inv.period)}`} onClose={() => setPay(null)}>
          <form className="col" onSubmit={savePay}>
            <div>Tổng <Money v={pay.inv.total} /> · đã thu <Money v={pay.inv.paid ?? 0} /></div>
            <label>Số tiền (âm = hoàn)<NumInput step={1000} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: Math.round(Number(e.target.value)) })} /></label>
            <label>Hình thức<select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value as PayEntry["method"] })}>{(["cash", "bank", "other"] as const).map((m) => <option key={m} value={m}>{L.payMethod[m]}</option>)}</select></label>
            <label>Ngày thu<input type="date" value={pay.date} max={today} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></label>
            <label>Ghi chú<input value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></label>
            {!admin && pay.amount <= 0 && <p className="error">Nhân viên chỉ ghi được khoản thu (số dương).</p>}
            <div className="row"><button type="submit" disabled={!pay.amount || (!admin && pay.amount <= 0)}>Lưu</button><button type="button" className="ghost" onClick={() => setPay(null)}>Hủy</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}

/** Sửa phát sinh/giảm trừ của hóa đơn nháp (dùng ở trang xem hóa đơn). */
export async function saveDraftLines(inv: Invoice, lines: Invoice["lines"], roundTo: number) {
  const base = lines.filter((l) => l.kind !== "round");
  let total = base.reduce((s, l) => s + l.amount, 0);
  const out = [...base];
  if (roundTo > 1) { const r = Math.round(total / roundTo) * roundTo - total; if (r) { out.push({ kind: "round", label: "Làm tròn", qty: 1, den: 1, price: r, amount: r }); total += r; } }
  await updateDoc(doc(db, "invoices", inv.id), { lines: out, total });
}
