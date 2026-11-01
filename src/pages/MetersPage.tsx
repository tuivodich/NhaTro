import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { useProps, useScoped } from "../lib/scoped";
import { useAudit } from "../lib/audit";
import { uploadImage } from "../lib/listings";
import { addMonths, fmtPeriod, thisPeriod, todayStr } from "../lib/format";
import { isAdminRole, type Contract, type MeterReading } from "../lib/types";

/** Ghi chỉ số chốt đầu kỳ: gõ nhanh cả dãy (Enter chuyển ô kế tiếp), chụp ảnh đồng hồ bằng điện thoại. */
export default function MetersPage() {
  const { profile } = useAuth();
  const admin = isAdminRole(profile?.role);
  const audit = useAudit();
  const { inScope, byId } = useProps();
  const [period, setPeriod] = useState(thisPeriod());
  const contracts = useScoped<Contract>("contracts").data.filter((c) => c.status === "hieu_luc" && inScope(c.propertyId) && c.services.some((s) => s.mode === "meter"));
  const readings = useScoped<MeterReading>("meterReadings").data;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState("");
  const [msg, setMsg] = useState("");

  const cur = (cid: string, sid: string) => readings.find((r) => r.id === `${cid}_${period}_${sid}`);
  const prev = (cid: string, sid: string) => readings.filter((r) => r.contractId === cid && r.serviceId === sid && r.period < period).sort((a, b) => b.period.localeCompare(a.period))[0];

  const save = async (c: Contract, sid: string, photo?: File) => {
    const key = `${c.id}_${period}_${sid}`;
    const raw = draft[key] ?? (cur(c.id, sid)?.value != null ? String(cur(c.id, sid)!.value) : "");
    const value = Number(raw.replace(/[.,\s]/g, ""));
    if (raw === "" || !Number.isFinite(value) || value < 0) return;
    const p = prev(c.id, sid);
    if (p && value < p.value && !confirm(`Chỉ số ${value} nhỏ hơn kỳ trước (${p.value}). Đồng hồ đã thay mới? Vẫn lưu?`)) return;
    setSaving(key); setMsg("");
    try {
      const old = cur(c.id, sid);
      let photoPath = old?.photo;
      if (photo) photoPath = (await uploadImage(`meters/${c.propertyId}/${key}-${Date.now()}.jpg`, photo)).path;
      await setDoc(doc(db, "meterReadings", key), { propertyId: c.propertyId, roomId: c.roomId, contractId: c.id, period, serviceId: sid, value, readBy: profile?.email ?? "", readOn: todayStr(), locked: old?.locked ?? false, ...(photoPath ? { photo: photoPath } : {}) });
      audit("meter.set", `Chỉ số ${sid} ${c.roomCode} kỳ ${fmtPeriod(period)}: ${value}`, { type: "contract", id: c.id });
      setDraft((d) => { const n = { ...d }; delete n[key]; return n; });
    } catch (x) { setMsg("Lỗi: " + (x as Error).message); } finally { setSaving(""); }
  };

  const rows = contracts.sort((a, b) => (byId[a.propertyId]?.order ?? 0) - (byId[b.propertyId]?.order ?? 0) || a.roomCode.localeCompare(b.roomCode, "vi", { numeric: true }))
    .flatMap((c) => c.services.filter((s) => s.mode === "meter").map((s) => ({ c, s })));
  const done = rows.filter(({ c, s }) => cur(c.id, s.id)).length;

  return (
    <>
      <h2>Chỉ số điện nước</h2>
      <div className="row">
        <button className="ghost" onClick={() => setPeriod(addMonths(period, -1))}>‹</button>
        <b>Chốt đầu kỳ {fmtPeriod(period)}</b>
        <button className="ghost" onClick={() => setPeriod(addMonths(period, 1))}>›</button>
        <small>Đã ghi {done}/{rows.length}</small>
      </div>
      <p><small>Chỉ số ghi ở kỳ {fmtPeriod(period)} là số chốt đầu tháng (ngày chốt của khu); hóa đơn kỳ {fmtPeriod(period)} tính lượng dùng tháng {fmtPeriod(addMonths(period, -1))} = chỉ số kỳ này − kỳ trước. Ghi nhanh qua bot: <code>/dien P1 1234</code>.</small></p>
      {msg && <p className="error">{msg}</p>}
      <div className="scroll"><table className="tbl meters">
        <thead><tr><th>Phòng</th><th>Loại</th><th className="num">Kỳ trước</th><th>Chỉ số kỳ này</th><th className="num">Dùng</th><th /></tr></thead>
        <tbody>{rows.map(({ c, s }, i) => {
          const key = `${c.id}_${period}_${s.id}`;
          const r = cur(c.id, s.id), p = prev(c.id, s.id);
          const locked = !!r?.locked && !admin;
          const val = draft[key] ?? (r ? String(r.value) : "");
          const used = val !== "" && p ? Number(val) - p.value : null;
          return (
            <tr key={key} className={r ? "ok" : ""}>
              <td><b>{c.roomCode}</b><br /><small>{byId[c.propertyId]?.name}</small></td>
              <td>{s.name}</td>
              <td className="num">{p ? <>{p.value}<br /><small>{fmtPeriod(p.period)}</small></> : <small>chưa có</small>}</td>
              <td><input inputMode="numeric" data-i={i} value={val} disabled={locked} aria-label={`Chỉ số ${s.name} ${c.roomCode}`}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                onBlur={() => draft[key] !== undefined && save(c, s.id)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (document.querySelector(`input[data-i="${i + 1}"]`) as HTMLInputElement | null)?.focus(); } }} />
                {r?.locked && <small> 🔒</small>}</td>
              <td className={`num${used != null && used < 0 ? " neg" : ""}`}>{used != null ? `${used} ${s.unit}` : ""}</td>
              <td>{saving === key ? "…" : !locked && <label className="filebtn" title="Chụp ảnh đồng hồ">📷<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && save(c, s.id, e.target.files[0])} /></label>}</td>
            </tr>);
        })}</tbody>
      </table></div>
      {!rows.length && <p>Không có hợp đồng nào tính điện nước theo chỉ số.</p>}
    </>
  );
}
