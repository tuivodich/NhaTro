import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import type { AuditEntry } from "../lib/audit";

export default function AuditPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<AuditEntry[]>([]);
  useEffect(() => onSnapshot(query(collection(db, "auditLog"), orderBy("at", "desc"), limit(300)), (s) => setRows(s.docs.map((d) => ({ ...(d.data() as AuditEntry), id: d.id }))), () => {}), []);
  return (
    <>
      <h2>Nhật ký hoạt động</h2>
      <div className="scroll"><table className="tbl">
        <thead><tr><th>Lúc</th><th>Ai</th><th>Việc</th>{profile?.role === "owner" && <th />}</tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}><td><small>{r.at?.toDate().toLocaleString("vi-VN") ?? ""}</small></td><td>{r.byName}<br /><small>{r.role}</small></td><td>{r.summary}</td>
            {profile?.role === "owner" && <td><button className="ghost danger" onClick={() => deleteDoc(doc(db, "auditLog", r.id))}>✕</button></td>}</tr>))}</tbody>
      </table></div>
    </>
  );
}
