import { doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { useCollection } from "../lib/useCollection";
import { useProps } from "../lib/scoped";
import { useI18n } from "../i18n";
import { useAudit } from "../lib/audit";
import type { Role, UserDoc } from "../lib/types";

/** Chủ cấp vai trò và giao khu cho từng tài khoản (người mới đăng ký luôn là người thuê). */
export default function AccountsPage() {
  const { user } = useAuth();
  const { L } = useI18n();
  const audit = useAudit();
  const { props } = useProps();
  const { data: users } = useCollection<UserDoc & { id: string }>("users");
  const set = async (u: UserDoc & { id: string }, patch: Partial<UserDoc>) => {
    if (patch.role === "owner" && !confirm(`Cấp quyền CHỦ (toàn quyền) cho ${u.email}?`)) return;
    await updateDoc(doc(db, "users", u.id), patch);
    audit("user.role", `${u.email}: ${patch.role ? L.role[patch.role] : "đổi khu"}`, { type: "user", id: u.id });
  };
  const sorted = [...users].sort((a, b) => (a.role === b.role ? a.email.localeCompare(b.email) : ["owner", "manager", "staff", "tenant"].indexOf(a.role) - ["owner", "manager", "staff", "tenant"].indexOf(b.role)));
  return (
    <>
      <h2>Tài khoản &amp; phân quyền</h2>
      <p><small>Người mới đăng nhập (Google/email) mặc định là <b>người thuê</b>. Quản lý làm mọi việc ở khu được giao (trừ phân quyền, tài khoản ngân hàng); nhân viên chỉ ghi chỉ số, thu tiền mặt, xử lý báo hỏng và <b>không xem được CCCD</b>.</small></p>
      <div className="scroll"><table className="tbl">
        <thead><tr><th>Tài khoản</th><th>Vai trò</th><th>Khu được giao</th></tr></thead>
        <tbody>{sorted.map((u) => (
          <tr key={u.id}>
            <td>{u.name || "—"}<br /><small>{u.email}</small></td>
            <td>{u.id === user?.uid ? <b>{L.role[u.role]} (bạn)</b> :
              <select value={u.role} onChange={(e) => set(u, { role: e.target.value as Role })}>{(Object.keys(L.role) as Role[]).map((r) => <option key={r} value={r}>{L.role[r]}</option>)}</select>}</td>
            <td>{u.role === "manager" || u.role === "staff" ? <div className="row">{props.map((p) => (
              <label key={p.id} className="check"><input type="checkbox" checked={!!u.props?.[p.id]} onChange={(e) => set(u, { props: { ...(u.props ?? {}), [p.id]: e.target.checked } })} /> {p.name}</label>))}</div>
              : <small>{u.role === "owner" ? "Tất cả" : "—"}</small>}</td>
          </tr>))}</tbody>
      </table></div>
    </>
  );
}
