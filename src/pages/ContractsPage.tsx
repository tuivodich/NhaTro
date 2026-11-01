import { useMemo, useState } from "react";
import { collection, doc, getDoc, writeBatch } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { useProps, useScoped } from "../lib/scoped";
import { useI18n } from "../i18n";
import { useAudit } from "../lib/audit";
import { syncListing } from "../lib/listings";
import { buildInvoice } from "../lib/billing";
import { addDays, addMonths, fmtDate, randomCode, todayStr } from "../lib/format";
import { isAdminRole, type Contract, type Invoice, type MeterReading, type Room, type Service, type Tenant } from "../lib/types";
import DateInput from "../components/DateInput";
import NumInput from "../components/NumInput";
import Modal from "../components/Modal";
import Money from "../components/Money";
import PropSelect from "../components/PropSelect";
import { ServicesEditor } from "./PropertiesPage";

interface NewC { propertyId: string; roomId: string; mainTenantId: string; others: string[]; start: string; months: number; rent: number; deposit: number; services: Service[]; meters: Record<string, number | ""> ; note: string }

export default function ContractsPage() {
  const { profile } = useAuth();
  const admin = isAdminRole(profile?.role);
  const { L } = useI18n();
  const audit = useAudit();
  const { current, inScope, byId, props } = useProps();
  const rooms = useScoped<Room>("rooms").data;
  const contracts = useScoped<Contract>("contracts").data.filter((c) => inScope(c.propertyId));
  const tenants = useScoped<Tenant>("tenants", admin).data;
  const readings = useScoped<MeterReading>("meterReadings").data;
  const [tab, setTab] = useState<"hieu_luc" | "cu">("hieu_luc");
  const [nc, setNc] = useState<NewC | null>(null);
  const [view, setView] = useState<Contract | null>(null);
  const [settle, setSettle] = useState<{ c: Contract; date: string; meters: Record<string, number | "">; extra: number; note: string } | null>(null);
  const [err, setErr] = useState("");
  const today = todayStr();

  const startNew = () => {
    const pid = current || props[0]?.id || "";
    setErr("");
    setNc({ propertyId: pid, roomId: "", mainTenantId: "", others: [], start: today, months: 12, rent: 0, deposit: 0, services: byId[pid]?.services ?? [], meters: {}, note: "" });
  };
  const vacantRooms = useMemo(() => rooms.filter((r) => r.propertyId === nc?.propertyId && !contracts.some((c) => c.roomId === r.id && c.status === "hieu_luc")), [rooms, contracts, nc?.propertyId]);
  const propTenants = tenants.filter((t) => t.propertyId === nc?.propertyId);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nc) return;
    setErr("");
    const room = rooms.find((r) => r.id === nc.roomId);
    const main = tenants.find((t) => t.id === nc.mainTenantId);
    if (!room || !main) return setErr("Chọn phòng và người đứng tên hợp đồng.");
    const people = [main, ...nc.others.map((id) => tenants.find((t) => t.id === id)!).filter(Boolean)];
    const end = addDays(`${addMonths(nc.start.slice(0, 7), nc.months)}${nc.start.slice(7)}`, -1);
    const ref = doc(collection(db, "contracts"));
    const c: Omit<Contract, "id"> = {
      code: randomCode(6), propertyId: nc.propertyId, roomId: room.id, roomCode: room.code, mainTenantId: main.id, tenantName: main.fullName,
      occupants: people.map((t) => ({ tenantId: t.id, name: t.fullName, from: nc.start })), tenantUids: people.map((t) => t.uid).filter((u): u is string => !!u),
      start: nc.start, end, rent: nc.rent || room.rent, deposit: nc.deposit, billingDay: byId[nc.propertyId]?.billingDay ?? 1, services: nc.services, status: "hieu_luc", note: nc.note,
    };
    const b = writeBatch(db);
    b.set(ref, c);
    b.update(doc(db, "rooms", room.id), { status: "dang_thue" });
    // Chỉ số đầu (chốt ở kỳ bắt đầu) để hóa đơn tháng sau tính lượng dùng.
    for (const s of nc.services.filter((x) => x.mode === "meter")) {
      const v = nc.meters[s.id];
      if (v !== "" && v != null) b.set(doc(db, "meterReadings", `${ref.id}_${nc.start.slice(0, 7)}_${s.id}`), { propertyId: nc.propertyId, roomId: room.id, contractId: ref.id, period: nc.start.slice(0, 7), serviceId: s.id, value: Number(v), readBy: profile?.email ?? "", readOn: nc.start, locked: false });
    }
    try {
      await b.commit();
      await syncListing({ ...room, status: "dang_thue" }, byId[room.propertyId]);
      audit("contract.create", `Hợp đồng ${c.code}: ${room.code} — ${main.fullName}`, { type: "contract", id: ref.id });
      setNc(null);
    } catch (x) { setErr((x as Error).message); }
  };

  const update = async (c: Contract, patch: Partial<Contract>, summary: string) => {
    const b = writeBatch(db);
    b.update(doc(db, "contracts", c.id), patch);
    await b.commit();
    audit("contract.update", `${c.code} ${c.roomCode}: ${summary}`, { type: "contract", id: c.id });
    setView({ ...c, ...patch });
  };
  const addOccupant = (c: Contract, tid: string) => {
    const t = tenants.find((x) => x.id === tid);
    if (!t) return;
    update(c, { occupants: [...c.occupants, { tenantId: t.id, name: t.fullName, from: today }], tenantUids: t.uid ? [...new Set([...c.tenantUids, t.uid])] : c.tenantUids }, `thêm người ở ${t.fullName}`);
  };
  const leave = (c: Contract, tid: string) => update(c, { occupants: c.occupants.map((o) => (o.tenantId === tid && !o.to ? { ...o, to: today } : o)) }, "người ở chuyển đi");
  const extend = (c: Contract, months: number) => update(c, { end: addDays(`${addMonths(c.end.slice(0, 7), months)}${c.end.slice(7)}`, 0) }, `gia hạn ${months} tháng`);

  /** Thanh lý: chốt chỉ số cuối, lập hóa đơn cuối (nháp) có trừ tiền cọc, trả phòng. */
  const doSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settle) return;
    const { c, date } = settle;
    const p = date.slice(0, 7);
    const meterIn: Record<string, { old?: number; new?: number }> = {};
    for (const s of c.services.filter((x) => x.mode === "meter")) {
      const base = readings.filter((r) => r.contractId === c.id && r.serviceId === s.id && r.period <= p).sort((a, b) => b.period.localeCompare(a.period))[0];
      const v = settle.meters[s.id];
      if (base && v !== "" && v != null) meterIn[s.id] = { old: base.value, new: Number(v) };
    }
    const built = buildInvoice({ contract: { ...c, endedOn: date }, period: p, readings: meterIn, extras: settle.extra ? [{ label: settle.note || "Phát sinh khi trả phòng", amount: settle.extra }] : [], roundTo: byId[c.propertyId]?.roundTo ?? 1000 });
    const depositUsed = Math.min(c.deposit, Math.max(0, built.total));
    const lines = depositUsed ? [...built.lines, { kind: "discount" as const, label: "Trừ tiền cọc", qty: 1, den: 1, price: -depositUsed, amount: -depositUsed }] : built.lines;
    const total = built.total - depositUsed;
    const refund = c.deposit - depositUsed;
    if (!confirm(`Thanh lý ${c.roomCode} ngày ${fmtDate(date)}?\nHóa đơn cuối: ${built.total.toLocaleString("vi-VN")} đ\nTrừ cọc: ${depositUsed.toLocaleString("vi-VN")} đ\nHoàn cọc cho người thuê: ${refund.toLocaleString("vi-VN")} đ${built.warnings.length ? "\n\nLưu ý:\n" + built.warnings.join("\n") : ""}`)) return;
    const b = writeBatch(db);
    const invRef = doc(collection(db, "invoices"));
    const inv: Omit<Invoice, "id"> = { code: randomCode(6), propertyId: c.propertyId, propertyName: byId[c.propertyId]?.name ?? "", roomId: c.roomId, roomCode: c.roomCode, contractId: c.id, period: p, tenantUids: c.tenantUids, tenantName: c.tenantName, lines, total, paid: 0, payLog: [], status: "nhap", dueDate: date, note: `Hóa đơn thanh lý hợp đồng ${c.code}`, createdBy: profile?.email ?? "" };
    b.set(invRef, inv);
    b.update(doc(db, "contracts", c.id), { status: "da_thanh_ly", endedOn: date, occupants: c.occupants.map((o) => (o.to ? o : { ...o, to: date })), settlement: { finalInvoiceId: invRef.id, depositUsed, refund, note: settle.note } });
    b.update(doc(db, "rooms", c.roomId), { status: "trong" });
    await b.commit();
    const room = (await getDoc(doc(db, "rooms", c.roomId))).data() as Room | undefined;
    if (room) await syncListing({ ...room, id: c.roomId }, byId[c.propertyId]);
    audit("contract.settle", `Thanh lý ${c.code} ${c.roomCode}: trừ cọc ${depositUsed}, hoàn ${refund}`, { type: "contract", id: c.id });
    setSettle(null); setView(null);
    alert("Đã thanh lý. Hóa đơn cuối ở dạng nháp — vào Hóa đơn để kiểm tra và phát hành.");
  };

  const list = contracts.filter((c) => (tab === "hieu_luc" ? c.status === "hieu_luc" : c.status !== "hieu_luc")).sort((a, b) => a.roomCode.localeCompare(b.roomCode, "vi", { numeric: true }));
  return (
    <>
      <div className="row between"><h2>Hợp đồng</h2>{admin && <button onClick={startNew}>+ Hợp đồng mới</button>}</div>
      <div className="row tabs"><button className={tab === "hieu_luc" ? "" : "ghost"} onClick={() => setTab("hieu_luc")}>Đang hiệu lực</button><button className={tab === "cu" ? "" : "ghost"} onClick={() => setTab("cu")}>Đã kết thúc</button></div>
      <div className="scroll"><table className="tbl">
        <thead><tr><th>Phòng</th><th>Người đứng tên</th><th>Thời hạn</th><th className="num">Giá thuê</th><th className="num">Cọc</th><th>Trạng thái</th></tr></thead>
        <tbody>{list.map((c) => {
          const soon = c.status === "hieu_luc" && c.end <= addDays(today, 30);
          return (
            <tr key={c.id} onClick={() => setView(c)} className="clickable">
              <td><b>{c.roomCode}</b><br /><small>{byId[c.propertyId]?.name}</small></td>
              <td>{c.tenantName}<br /><small>{c.occupants.filter((o) => !o.to).length} người ở</small></td>
              <td>{fmtDate(c.start)} → {fmtDate(c.endedOn ?? c.end)}{soon && <span className="tag qua_han"> sắp hết hạn</span>}</td>
              <td className="num"><Money v={c.rent} /></td><td className="num"><Money v={c.deposit} /></td>
              <td><span className={`tag ${c.status}`}>{L.contractStatus[c.status]}</span></td>
            </tr>);
        })}</tbody>
      </table></div>

      {nc && (
        <Modal title="Hợp đồng mới" onClose={() => setNc(null)} wide>
          <form className="col" onSubmit={create}>
            <div className="row">
              <label>Khu<PropSelect value={nc.propertyId} onChange={(pid) => setNc({ ...nc, propertyId: pid, roomId: "", mainTenantId: "", others: [], services: byId[pid]?.services ?? [] })} /></label>
              <label>Phòng trống<select value={nc.roomId} required onChange={(e) => { const r = rooms.find((x) => x.id === e.target.value); setNc({ ...nc, roomId: e.target.value, rent: r?.rent ?? 0, deposit: nc.deposit || r?.rent || 0 }); }}>
                <option value="">— Chọn —</option>{vacantRooms.map((r) => <option key={r.id} value={r.id}>{r.code} {r.name ? `— ${r.name}` : ""}</option>)}</select></label>
            </div>
            <label>Người đứng tên<select value={nc.mainTenantId} required onChange={(e) => setNc({ ...nc, mainTenantId: e.target.value })}>
              <option value="">— Chọn (thêm hồ sơ ở “Người cư trú” trước) —</option>{propTenants.map((t) => <option key={t.id} value={t.id}>{t.fullName} · {t.phone}</option>)}</select></label>
            <fieldset><legend>Người ở cùng</legend><div className="row">{propTenants.filter((t) => t.id !== nc.mainTenantId).map((t) => (
              <label key={t.id} className="check"><input type="checkbox" checked={nc.others.includes(t.id)} onChange={(e) => setNc({ ...nc, others: e.target.checked ? [...nc.others, t.id] : nc.others.filter((x) => x !== t.id) })} /> {t.fullName}</label>))}</div></fieldset>
            <div className="row">
              <label>Ngày bắt đầu<DateInput value={nc.start} required onChange={(start) => setNc({ ...nc, start })} /></label>
              <label>Thời hạn (tháng)<NumInput min={1} max={120} value={nc.months} onChange={(e) => setNc({ ...nc, months: Math.max(1, Number(e.target.value)) })} /></label>
              <label>Giá thuê/tháng<NumInput min={0} step={100000} value={nc.rent} onChange={(e) => setNc({ ...nc, rent: Math.max(0, Number(e.target.value)) })} /></label>
              <label>Tiền cọc<NumInput min={0} step={100000} value={nc.deposit} onChange={(e) => setNc({ ...nc, deposit: Math.max(0, Number(e.target.value)) })} /></label>
            </div>
            <h4>Dịch vụ</h4>
            <ServicesEditor value={nc.services} onChange={(services) => setNc({ ...nc, services })} />
            {nc.services.some((s) => s.mode === "meter") && <fieldset><legend>Chỉ số đầu khi nhận phòng</legend><div className="row">{nc.services.filter((s) => s.mode === "meter").map((s) => (
              <label key={s.id}>{s.name} ({s.unit})<NumInput min={0} value={nc.meters[s.id] ?? ""} allowEmpty onChange={(e) => setNc({ ...nc, meters: { ...nc.meters, [s.id]: e.target.value === "" ? "" : Number(e.target.value) } })} /></label>))}</div></fieldset>}
            <label>Ghi chú / điều khoản riêng<textarea value={nc.note} onChange={(e) => setNc({ ...nc, note: e.target.value })} /></label>
            {err && <p className="error">{err}</p>}
            <div className="row"><button type="submit">Tạo hợp đồng</button><button type="button" className="ghost" onClick={() => setNc(null)}>Hủy</button></div>
          </form>
        </Modal>
      )}

      {view && !settle && (
        <Modal title={`Hợp đồng ${view.code} · phòng ${view.roomCode}`} onClose={() => setView(null)} wide>
          <div className="col">
            <div>{byId[view.propertyId]?.name} — {byId[view.propertyId]?.address}</div>
            <div>Người đứng tên: <b>{view.tenantName}</b> · {fmtDate(view.start)} → {fmtDate(view.endedOn ?? view.end)} · <span className={`tag ${view.status}`}>{L.contractStatus[view.status]}</span></div>
            <div>Giá thuê <Money v={view.rent} />/tháng · cọc <Money v={view.deposit} /> · chốt ngày {view.billingDay}</div>
            <div className="row">{view.services.map((s) => <span key={s.id} className="tag">{s.name}: <Money v={s.price} />/{s.unit}</span>)}</div>
            <h4>Người ở</h4>
            <ul>{view.occupants.map((o, i) => <li key={i}>{o.name} — từ {fmtDate(o.from)}{o.to ? ` đến ${fmtDate(o.to)}` : ""} {admin && !o.to && view.status === "hieu_luc" && o.tenantId !== view.mainTenantId && <button className="ghost" onClick={() => leave(view, o.tenantId)}>Chuyển đi</button>}</li>)}</ul>
            {admin && view.status === "hieu_luc" && <>
              <label>Thêm người ở<select value="" onChange={(e) => addOccupant(view, e.target.value)}><option value="">— Chọn hồ sơ —</option>
                {tenants.filter((t) => t.propertyId === view.propertyId && !view.occupants.some((o) => o.tenantId === t.id && !o.to)).map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}</select></label>
              <div className="row">
                <button className="ghost" onClick={() => extend(view, 6)}>Gia hạn 6 tháng</button>
                <button className="ghost" onClick={() => extend(view, 12)}>Gia hạn 12 tháng</button>
                <button className="danger ghost" onClick={() => setSettle({ c: view, date: today, meters: {}, extra: 0, note: "" })}>Thanh lý / trả phòng</button>
                <button className="ghost" onClick={() => printContract(view, byId[view.propertyId]?.name ?? "", byId[view.propertyId]?.address ?? "")}>🖨 In hợp đồng</button>
              </div>
            </>}
            {view.settlement && <div>Thanh lý: trừ cọc <Money v={view.settlement.depositUsed} />, hoàn <Money v={view.settlement.refund} /></div>}
          </div>
        </Modal>
      )}

      {settle && (
        <Modal title={`Thanh lý phòng ${settle.c.roomCode}`} onClose={() => setSettle(null)}>
          <form className="col" onSubmit={doSettle}>
            <label>Ngày trả phòng<DateInput value={settle.date} required onChange={(date) => setSettle({ ...settle, date })} /></label>
            {settle.c.services.filter((s) => s.mode === "meter").map((s) => (
              <label key={s.id}>Chỉ số {s.name.toLowerCase()} cuối<NumInput min={0} required value={settle.meters[s.id] ?? ""} allowEmpty onChange={(e) => setSettle({ ...settle, meters: { ...settle.meters, [s.id]: e.target.value === "" ? "" : Number(e.target.value) } })} /></label>))}
            <label>Phát sinh (+) / giảm trừ (−), vd hư hỏng<NumInput step={10000} value={settle.extra} onChange={(e) => setSettle({ ...settle, extra: Number(e.target.value) })} /></label>
            <label>Ghi chú<input value={settle.note} onChange={(e) => setSettle({ ...settle, note: e.target.value })} /></label>
            <small>Hệ thống lập hóa đơn cuối (tiền phòng theo số ngày ở trong tháng + điện nước), tự trừ tiền cọc và tính số tiền hoàn cọc. Nếu đã thu tiền phòng cả tháng này, thêm dòng giảm trừ tương ứng.</small>
            <div className="row"><button type="submit" className="danger">Thanh lý</button><button type="button" className="ghost" onClick={() => setSettle(null)}>Hủy</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}

/** In hợp đồng mẫu (trình duyệt → In / Lưu PDF). Mẫu chung, chủ nhà nên rà soát điều khoản với quy định hiện hành. */
function printContract(c: Contract, propName: string, address: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  const m = (n: number) => n.toLocaleString("vi-VN") + " đồng";
  const esc = (s: string) => s.replace(/[&<>]/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[x]!);
  w.document.write(`<!doctype html><html lang="vi"><meta charset="utf-8"><title>Hợp đồng ${esc(c.code)}</title>
<style>body{font-family:"Times New Roman",serif;max-width:720px;margin:24px auto;line-height:1.5;padding:0 16px}h1,h2{text-align:center}h1{font-size:16px}h2{font-size:18px}.sig{display:flex;justify-content:space-around;margin-top:48px;text-align:center}</style>
<h1>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br>Độc lập – Tự do – Hạnh phúc</h1><h2>HỢP ĐỒNG THUÊ ${c.roomCode.startsWith("MB") ? "MẶT BẰNG" : "NHÀ / PHÒNG"}</h2>
<p>Số: ${esc(c.code)}</p>
<p><b>Bên cho thuê (Bên A):</b> ……………………………………</p>
<p><b>Bên thuê (Bên B):</b> ${esc(c.tenantName)}</p>
<p><b>Điều 1.</b> Bên A cho Bên B thuê ${esc(c.roomCode)} tại ${esc(propName)}, địa chỉ ${esc(address)}. Số người ở: ${c.occupants.filter((o) => !o.to).map((o) => esc(o.name)).join(", ")}.</p>
<p><b>Điều 2.</b> Thời hạn thuê từ ngày ${fmtDate(c.start)} đến ngày ${fmtDate(c.end)}.</p>
<p><b>Điều 3.</b> Giá thuê ${m(c.rent)}/tháng, thanh toán trước ngày ${c.billingDay + 5} hằng tháng. Tiền đặt cọc ${m(c.deposit)}, hoàn trả khi kết thúc hợp đồng sau khi trừ các khoản còn nợ.</p>
<p><b>Điều 4.</b> Dịch vụ: ${c.services.map((s) => `${esc(s.name)} ${m(s.price)}/${esc(s.unit)}`).join("; ") || "Bên B tự thanh toán trực tiếp với nhà cung cấp"}.</p>
<p><b>Điều 5.</b> Bên B giữ gìn tài sản, tuân thủ nội quy, đăng ký tạm trú theo quy định; đồng ý cho Bên A lưu thông tin cá nhân để quản lý hợp đồng và đăng ký tạm trú.</p>
${c.note ? `<p><b>Điều khoản riêng:</b> ${esc(c.note)}</p>` : ""}
<div class="sig"><div><b>BÊN A</b><br><i>(ký, ghi rõ họ tên)</i></div><div><b>BÊN B</b><br><i>(ký, ghi rõ họ tên)</i></div></div>
<script>window.print()</script>`);
  w.document.close();
}
