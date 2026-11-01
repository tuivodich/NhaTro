import { useState } from "react";
import { addDoc, collection, deleteDoc, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { useProps, useScoped } from "../lib/scoped";
import { useAudit } from "../lib/audit";
import { debtAging, debts, monthSummary, occupancy } from "../lib/report";
import { addMonths, fmtDate, fmtPeriod, thisPeriod, todayStr } from "../lib/format";
import { downloadCsv } from "../lib/csv";
import type { Invoice, Room, Txn } from "../lib/types";
import NumInput from "../components/NumInput";
import Money from "../components/Money";
import PropSelect from "../components/PropSelect";

const CATS = { chi: ["Điện tổng (EVN)", "Nước tổng", "Internet", "Sửa chữa", "Mua sắm", "Thuế/phí", "Lương", "Khác"], thu: ["Tiền cọc giữ chỗ", "Phí khác", "Khác"] };

export default function FinancePage() {
  const { profile } = useAuth();
  const audit = useAudit();
  const { inScope, byId, current, props } = useProps();
  const invoices = useScoped<Invoice>("invoices").data.filter((i) => inScope(i.propertyId));
  const txns = useScoped<Txn>("transactions").data.filter((t) => inScope(t.propertyId));
  const rooms = useScoped<Room>("rooms").data.filter((r) => inScope(r.propertyId));
  const [period, setPeriod] = useState(thisPeriod());
  const [f, setF] = useState<Omit<Txn, "id">>({ propertyId: current || props[0]?.id || "", date: todayStr(), type: "chi", category: CATS.chi[0], amount: 0, note: "" });
  const [err, setErr] = useState("");
  const today = todayStr();
  const s = monthSummary(period, invoices, txns);
  const aging = debtAging(debts(invoices, today));
  const occ = occupancy(rooms);
  const year = period.slice(0, 4);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`).map((p) => monthSummary(p, invoices, txns));

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.amount || !f.propertyId) return setErr("Nhập số tiền và chọn khu.");
    try {
      await addDoc(collection(db, "transactions"), { ...f, by: profile?.email ?? "" });
      audit("txn.add", `${f.type === "chi" ? "Chi" : "Thu"} ${f.amount.toLocaleString("vi-VN")} đ — ${f.category} (${byId[f.propertyId]?.name ?? ""})`);
      setF({ ...f, amount: 0, note: "" }); setErr("");
    } catch (x) { setErr((x as Error).message); }
  };
  const del = async (t: Txn) => { if (confirm("Xóa khoản này?")) { await deleteDoc(doc(db, "transactions", t.id)); audit("txn.delete", `Xóa ${t.category} ${t.amount}`); } };
  const list = txns.filter((t) => t.date.startsWith(period)).sort((a, b) => b.date.localeCompare(a.date));
  const exportYear = () => downloadCsv(`thu-chi-${year}.csv`, [["Tháng", "Đã thu tiền nhà", "Tiền mặt", "Chuyển khoản", "Phát hành", "Thu khác", "Chi", "Lãi"], ...months.map((m) => [fmtPeriod(m.period), m.collected, m.collectedCash, m.collectedBank, m.billed, m.otherIncome, m.expense, m.profit])]);
  const exportTx = () => downloadCsv(`so-thu-chi-${period}.csv`, [["Ngày", "Khu", "Loại", "Danh mục", "Số tiền", "Ghi chú"], ...list.map((t) => [fmtDate(t.date), byId[t.propertyId]?.name, t.type === "chi" ? "Chi" : "Thu", t.category, t.amount, t.note])]);

  return (
    <>
      <h2>Thu chi &amp; báo cáo</h2>
      <div className="row"><button className="ghost" onClick={() => setPeriod(addMonths(period, -1))}>‹</button><b>Tháng {fmtPeriod(period)}</b><button className="ghost" onClick={() => setPeriod(addMonths(period, 1))}>›</button></div>
      <div className="grid stats">
        <div className="card"><small>Đã thu tiền nhà</small><big><Money v={s.collected} /></big><small>Tiền mặt <Money v={s.collectedCash} /> · CK <Money v={s.collectedBank} /></small></div>
        <div className="card"><small>Thu khác</small><big><Money v={s.otherIncome} /></big></div>
        <div className="card"><small>Chi</small><big><Money v={s.expense} /></big></div>
        <div className="card"><small>Lãi (thu − chi)</small><big><Money v={s.profit} /></big><small>Phát hành kỳ này: <Money v={s.billed} /></small></div>
      </div>
      <div className="grid stats">
        <div className="card"><small>Công nợ hiện tại</small><big><Money v={aging.total} /></big>
          <small>Chưa tới hạn <Money v={aging.current} /> · trễ ≤30 ngày <Money v={aging.d30} /> · 31–60 <Money v={aging.d60} /> · &gt;60 <Money v={aging.over60} /></small></div>
        <div className="card"><small>Tỷ lệ lấp đầy</small><big>{Math.round(occ.rate * 100)}%</big><small>{occ.rented}/{occ.total} phòng/căn</small></div>
      </div>

      <form className="card" onSubmit={add}>
        <h3>Ghi khoản thu/chi khác</h3>
        <div className="row">
          <label>Khu<PropSelect value={f.propertyId} onChange={(propertyId) => setF({ ...f, propertyId })} /></label>
          <label>Ngày<input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></label>
          <label>Loại<select value={f.type} onChange={(e) => { const type = e.target.value as Txn["type"]; setF({ ...f, type, category: CATS[type][0] }); }}><option value="chi">Chi</option><option value="thu">Thu</option></select></label>
          <label>Danh mục<select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS[f.type].map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Số tiền<NumInput min={0} step={1000} value={f.amount} onChange={(e) => setF({ ...f, amount: Math.max(0, Math.round(Number(e.target.value))) })} /></label>
        </div>
        <label>Ghi chú<input value={f.note ?? ""} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        {err && <p className="error">{err}</p>}
        <div className="row"><button type="submit">Thêm</button></div>
      </form>

      <div className="row between"><h3>Sổ thu chi tháng {fmtPeriod(period)}</h3><button className="ghost" onClick={exportTx}>Xuất Excel (CSV)</button></div>
      <div className="scroll"><table className="tbl">
        <thead><tr><th>Ngày</th><th>Khu</th><th>Danh mục</th><th className="num">Số tiền</th><th>Ghi chú</th><th /></tr></thead>
        <tbody>{list.map((t) => <tr key={t.id}><td>{fmtDate(t.date)}</td><td>{byId[t.propertyId]?.name}</td><td>{t.type === "chi" ? "🔻" : "🔺"} {t.category}</td><td className="num"><Money v={t.type === "chi" ? -t.amount : t.amount} /></td><td>{t.note}</td><td><button className="ghost danger" onClick={() => del(t)}>✕</button></td></tr>)}</tbody>
      </table></div>

      <div className="row between"><h3>Cả năm {year}</h3><button className="ghost" onClick={exportYear}>Xuất Excel (CSV)</button></div>
      <div className="scroll"><table className="tbl">
        <thead><tr><th>Tháng</th><th className="num">Đã thu</th><th className="num">Thu khác</th><th className="num">Chi</th><th className="num">Lãi</th></tr></thead>
        <tbody>{months.map((m) => <tr key={m.period}><td>{fmtPeriod(m.period)}</td><td className="num"><Money v={m.collected} /></td><td className="num"><Money v={m.otherIncome} /></td><td className="num"><Money v={m.expense} /></td><td className="num"><Money v={m.profit} /></td></tr>)}</tbody>
        <tfoot><tr><th>Tổng</th>{(["collected", "otherIncome", "expense", "profit"] as const).map((k) => <th key={k} className="num"><Money v={months.reduce((a, m) => a + m[k], 0)} /></th>)}</tr></tfoot>
      </table></div>
    </>
  );
}
