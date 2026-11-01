import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useProps, useScoped } from "../lib/scoped";
import { debts, debtAging, expiringContracts, monthSummary, occupancy } from "../lib/report";
import { fmtDate, thisPeriod, todayStr } from "../lib/format";
import { seedProperties, SEED } from "../lib/seed";
import { isAdminRole, type RentalRequest, type Contract, type Invoice, type Room, type Ticket, type Txn } from "../lib/types";
import Money from "../components/Money";

export default function Dashboard() {
  const { profile } = useAuth();
  const admin = isAdminRole(profile?.role);
  const { props, loading, inScope, byId } = useProps();
  const rooms = useScoped<Room>("rooms").data.filter((r) => inScope(r.propertyId));
  const invoices = useScoped<Invoice>("invoices").data.filter((i) => inScope(i.propertyId));
  const contracts = useScoped<Contract>("contracts").data.filter((c) => inScope(c.propertyId));
  const tickets = useScoped<Ticket>("tickets").data.filter((k) => inScope(k.propertyId) && (k.status === "moi" || k.status === "dang_xu_ly"));
  const txns = useScoped<Txn>("transactions", admin).data.filter((t) => inScope(t.propertyId));
  const newReqs = useScoped<RentalRequest>("rentalRequests").data.filter((r) => inScope(r.propertyId) && r.status === "moi").length;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const today = todayStr();
  const occ = occupancy(rooms);
  const debtRows = debts(invoices, today);
  const aging = debtAging(debtRows);
  const month = monthSummary(thisPeriod(), invoices, txns);
  const expiring = expiringContracts(contracts, today, 30);

  const seed = async () => {
    setBusy(true); setMsg("");
    try { const n = await seedProperties(props.map((p) => p.id)); setMsg(`Đã tạo ${SEED.length} khu và ${n} phòng/căn. Vào “Phòng” để nhập giá thuê, “Khu trọ & dịch vụ” để nhập đơn giá điện nước.`); }
    catch (e) { setMsg("Lỗi: " + (e as Error).message); } finally { setBusy(false); }
  };

  if (!loading && !props.length) {
    return (
      <div className="card">
        <h2>Chào mừng!</h2>
        {profile?.role === "owner" ? <>
          <p>Chưa có khu trọ nào. Bấm nút dưới để tạo sẵn 3 khu của bạn:</p>
          <ul>{SEED.map((s) => <li key={s.id}><b>{s.name}</b> — {s.rooms.length} {s.kind === "day_tro" ? "phòng/mặt bằng" : "căn"}</li>)}</ul>
          <button disabled={busy} onClick={seed}>Tạo 3 khu nhà trọ</button>
        </> : <p>Bạn chưa được giao khu nào. Hãy nhờ chủ nhà cấp quyền ở “Tài khoản &amp; phân quyền”.</p>}
        {msg && <p>{msg}</p>}
      </div>
    );
  }

  return (
    <>
      <h2>Tổng quan · {fmtDate(today)}</h2>
      {msg && <p className="card">{msg}</p>}
      <div className="grid stats">
        <div className="card"><small>Đang thuê</small><big>{occ.rented}/{occ.total}</big><small>Trống {occ.vacant} · lấp đầy {Math.round(occ.rate * 100)}%</small></div>
        <div className="card"><small>Còn phải thu</small><big><Money v={aging.total} /></big><small>Quá hạn: <Money v={aging.d30 + aging.d60 + aging.over60} /></small></div>
        {admin && <div className="card"><small>Đã thu tháng này</small><big><Money v={month.collected} /></big><small>Chi: <Money v={month.expense} /> · Lãi: <Money v={month.profit} /></small></div>}
        <div className="card"><small>Đăng ký thuê mới</small><big>{newReqs}</big><Link to="/app/dang-ky">Xem</Link></div>
        <div className="card"><small>Báo hỏng đang mở</small><big>{tickets.length}</big><Link to="/app/bao-hong">Xem</Link></div>
      </div>

      <div className="card">
        <div className="row between"><h3>Việc cần làm đầu tháng</h3><small>Kỳ {thisPeriod().slice(5)}/{thisPeriod().slice(0, 4)}</small></div>
        <ol className="steps">
          <li><Link to="/app/chi-so">Ghi chỉ số điện nước</Link> (hoặc gửi bot: <code>/dien P1 1234</code>)</li>
          <li><Link to="/app/hoa-don">Lập hóa đơn nháp → kiểm tra → phát hành</Link> (gửi người thuê qua Telegram kèm mã VietQR)</li>
          <li>Theo dõi <Link to="/app/hoa-don">thu tiền</Link>; chuyển khoản tự gạch nợ nếu đã nối webhook ngân hàng</li>
        </ol>
      </div>

      {debtRows.length > 0 && (
        <div className="card">
          <h3>Công nợ</h3>
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Khu</th><th>Phòng</th><th>Người thuê</th><th>Kỳ</th><th>Hạn</th><th className="num">Còn nợ</th></tr></thead>
            <tbody>{debtRows.slice(0, 15).map((r) => (
              <tr key={r.invoiceId} className={r.daysLate > 0 ? "late" : ""}>
                <td>{byId[r.propertyId]?.name}</td><td>{r.roomCode}</td><td>{r.tenantName}</td><td>{r.period.slice(5)}/{r.period.slice(0, 4)}</td>
                <td>{fmtDate(r.dueDate)}{r.daysLate > 0 && <small> (trễ {r.daysLate} ngày)</small>}</td><td className="num"><Money v={r.due} /></td>
              </tr>))}</tbody>
          </table></div>
        </div>
      )}

      {expiring.length > 0 && (
        <div className="card">
          <h3>Hợp đồng sắp hết hạn (30 ngày)</h3>
          <ul>{expiring.map((c) => <li key={c.id}><b>{c.roomCode}</b> · {c.tenantName} · hết hạn {fmtDate(c.end)} — <Link to="/app/hop-dong">gia hạn / thanh lý</Link></li>)}</ul>
        </div>
      )}

      <div className="grid">
        {props.filter((p) => inScope(p.id)).map((p) => {
          const rs = rooms.filter((r) => r.propertyId === p.id);
          return (
            <div key={p.id} className="card">
              <h3>{p.name}</h3>
              <small>{p.address}</small>
              <div className="roomchips">{rs.sort((a, b) => a.code.localeCompare(b.code, "vi", { numeric: true })).map((r) => {
                const owe = debtRows.some((d) => d.roomId === r.id);
                return <span key={r.id} className={`chip ${r.status}${owe ? " owe" : ""}`} title={owe ? "Còn nợ" : ""}>{r.code}</span>;
              })}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
