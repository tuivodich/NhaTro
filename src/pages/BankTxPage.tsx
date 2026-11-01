import { useState } from "react";
import { doc, runTransaction, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { useCollection } from "../lib/useCollection";
import { useProps, useScoped } from "../lib/scoped";
import { useAudit } from "../lib/audit";
import { payState } from "../lib/billing";
import { fmtPeriod, todayStr } from "../lib/format";
import type { Invoice } from "../lib/types";
import Money from "../components/Money";

interface BankTx { id: string; source: string; amount: number; content: string; when: string; code: string; matched: boolean; reason: string; invoiceId?: string }

/** Giao dịch từ webhook ngân hàng; giao dịch chưa khớp được gán tay vào hóa đơn. */
export default function BankTxPage() {
  const { user, profile } = useAuth();
  const audit = useAudit();
  const { byId } = useProps();
  const { data } = useCollection<BankTx>("bankTx");
  const invoices = useScoped<Invoice>("invoices").data.filter((i) => i.status === "da_gui" && payState(i, todayStr()) !== "da_thu");
  const [pick, setPick] = useState<Record<string, string>>({});
  const assign = async (t: BankTx) => {
    const invId = pick[t.id];
    if (!invId) return;
    await runTransaction(db, async (tx) => {
      const ir = doc(db, "invoices", invId), br = doc(db, "bankTx", t.id);
      const inv = (await tx.get(ir)).data() as Invoice;
      tx.update(ir, { paid: (inv.paid ?? 0) + t.amount, payLog: [...(inv.payLog ?? []), { amount: t.amount, date: todayStr(), method: "bank", by: profile?.email ?? "", note: `Gán tay giao dịch ${t.source}`, at: Timestamp.now() }] });
      tx.update(br, { matched: true, invoiceId: invId, reason: "", assignedBy: user!.uid });
    });
    audit("bank.assign", `Gán ${t.amount.toLocaleString("vi-VN")} đ vào hóa đơn`, { type: "invoice", id: invId });
  };
  const list = [...data].sort((a, b) => String(b.when).localeCompare(String(a.when)));
  return (
    <>
      <h2>Đối soát ngân hàng</h2>
      {!list.length && <p>Chưa có giao dịch nào (cần cài webhook SePay/Casso ở Cài đặt).</p>}
      {list.map((t) => (
        <div key={t.id} className="card">
          <div className="row between"><b><Money v={t.amount} /></b><span className={`tag ${t.matched ? "da_thu" : "qua_han"}`}>{t.matched ? "Đã khớp" : "Chưa khớp"}</span></div>
          <small>{t.when} · {t.source} · <code>{t.content}</code></small>
          {!t.matched && <>
            <small className="error">{t.reason}</small>
            <div className="row">
              <select value={pick[t.id] ?? ""} onChange={(e) => setPick({ ...pick, [t.id]: e.target.value })}><option value="">— Chọn hóa đơn —</option>
                {invoices.map((i) => <option key={i.id} value={i.id}>{byId[i.propertyId]?.name} · {i.roomCode} · {fmtPeriod(i.period)} · còn {(i.total - (i.paid ?? 0)).toLocaleString("vi-VN")} đ</option>)}</select>
              <button disabled={!pick[t.id]} onClick={() => assign(t)}>Gán</button>
            </div>
          </>}
        </div>
      ))}
    </>
  );
}
