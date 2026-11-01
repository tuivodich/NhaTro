"use strict";
/**
 * Bản JS (phía server) của src/lib/billing.ts — PHẢI KHỚP từng dòng (test so khớp: scripts/billing.test.mts).
 * Kỳ P: tiền phòng + dịch vụ theo phòng/người thu trước cho tháng P; dịch vụ theo chỉ số = chỉ số kỳ P − chỉ số kỳ P−1.
 */

const pad = (n) => String(n).padStart(2, "0");
const fmtP = (p) => `${p.slice(5, 7)}/${p.slice(0, 4)}`;
const fmtD = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const num = (n) => new Intl.NumberFormat("vi-VN").format(n);

function prevPeriod(p) {
  const [y, m] = p.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}
function periodRange(p) {
  const [y, m] = p.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${p}-01`, `${p}-${pad(last)}`];
}
const dayDiff = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

function occupiedDays(start, end, period) {
  const [a, b] = periodRange(period);
  const dim = dayDiff(a, b) + 1;
  const from = start > a ? start : a;
  const to = end && end < b ? end : b;
  return { days: to < from ? 0 : dayDiff(from, to) + 1, dim };
}

function peopleInPeriod(occupants, period) {
  const [a, b] = periodRange(period);
  return (occupants ?? []).filter((o) => o.from <= b && (!o.to || o.to >= a)).length;
}

function tierAmount(usage, tiers) {
  let left = Math.max(0, usage), prev = 0, sum = 0;
  for (const t of tiers) {
    if (left <= 0) break;
    const cap = t.upTo == null ? Infinity : t.upTo - prev;
    const q = Math.min(left, cap);
    sum += q * t.price;
    left -= q;
    if (t.upTo != null) prev = t.upTo;
  }
  return Math.round(sum);
}

function lineAmount(l) {
  if (l.kind === "round") return Math.round(l.amount);
  if (l.kind === "service" && l.old != null && l.new != null) {
    const used = l.new - l.old;
    return l.tiers?.length ? tierAmount(used, l.tiers) : Math.round(used * l.price);
  }
  return Math.round((l.qty * l.price) / (l.den || 1));
}

function buildInvoice(inp) {
  const { contract: c, period } = inp;
  const prorate = inp.prorate !== false;
  const warnings = [];
  const lines = [];
  const end = c.endedOn || c.end;
  const { days, dim } = occupiedDays(c.start, end, period);
  if (days === 0) warnings.push(`Hợp đồng không có hiệu lực trong kỳ ${fmtP(period)}.`);
  const partial = prorate && days > 0 && days < dim;
  const [a, b] = periodRange(period);
  const rangeLabel = partial ? ` (${fmtD(c.start > a ? c.start : a)}–${fmtD(end && end < b ? end : b)}: ${days}/${dim} ngày)` : "";

  if (days > 0) {
    lines.push({ kind: "rent", label: `Tiền phòng tháng ${fmtP(period)}${rangeLabel}`, qty: partial ? days : 1, den: partial ? dim : 1, unit: partial ? "ngày" : "tháng", price: c.rent, amount: 0 });
  }
  const people = peopleInPeriod(c.occupants, period);
  for (const s of c.services ?? []) {
    if (s.mode === "meter") {
      const r = inp.readings?.[s.id];
      if (r?.old == null || r?.new == null) { warnings.push(`${s.name}: chưa đủ chỉ số (kỳ trước / kỳ này).`); continue; }
      if (r.new < r.old) { warnings.push(`${s.name}: chỉ số mới (${r.new}) nhỏ hơn chỉ số cũ (${r.old}).`); continue; }
      if (!s.price && !s.tiers?.length) warnings.push(`${s.name}: chưa đặt đơn giá.`);
      const used = r.new - r.old;
      lines.push({ kind: "service", serviceId: s.id, label: `${s.name} tháng ${fmtP(prevPeriod(period))}: ${num(r.old)} → ${num(r.new)} (${num(used)} ${s.unit})`, qty: used, unit: s.unit, price: s.price, old: r.old, new: r.new, ...(s.tiers?.length ? { tiers: s.tiers } : {}), amount: 0 });
    } else if (days > 0) {
      if (!s.price) warnings.push(`${s.name}: chưa đặt đơn giá.`);
      const qty = s.mode === "person" ? people : 1;
      if (s.mode === "person" && qty === 0) { warnings.push(`${s.name}: hợp đồng chưa có người ở.`); continue; }
      lines.push({ kind: "service", serviceId: s.id, label: `${s.name} tháng ${fmtP(period)}${s.mode === "person" ? ` (${qty} người)` : ""}${partial ? ` (${days}/${dim} ngày)` : ""}`, qty: partial ? qty * days : qty, den: partial ? dim : 1, unit: s.unit, price: s.price, amount: 0 });
    }
  }
  for (const e of inp.extras ?? []) {
    if (!e.amount) continue;
    lines.push({ kind: e.amount < 0 ? "discount" : "extra", label: e.label || (e.amount < 0 ? "Giảm trừ" : "Phát sinh"), qty: 1, den: 1, price: Math.round(e.amount), amount: 0 });
  }
  for (const l of lines) l.amount = lineAmount(l);
  let total = lines.reduce((s, l) => s + l.amount, 0);
  const roundTo = inp.roundTo ?? 1000;
  if (roundTo > 1) {
    const r = Math.round(total / roundTo) * roundTo - total;
    if (r !== 0) { lines.push({ kind: "round", label: "Làm tròn", qty: 1, den: 1, price: r, amount: r }); total += r; }
  }
  return { lines, total, warnings };
}

function verifyInvoice(inv, roundTo = 1000) {
  const problems = [];
  let sum = 0;
  for (const l of inv.lines ?? []) {
    const a = lineAmount(l);
    if (a !== l.amount) problems.push(`Dòng "${l.label}": ${l.amount} ≠ ${a}`);
    if (l.kind === "round" && Math.abs(l.amount) >= Math.max(roundTo, 1)) problems.push(`Dòng làm tròn quá lớn: ${l.amount}`);
    sum += a;
  }
  if (sum !== inv.total) problems.push(`Tổng ${inv.total} ≠ ${sum}`);
  return { ok: problems.length === 0, total: sum, problems };
}

function payState(inv, today) {
  if (inv.status === "nhap" || inv.status === "huy") return inv.status;
  const paid = inv.paid ?? 0;
  if (paid >= inv.total) return "da_thu";
  if (inv.dueDate && today > inv.dueDate) return "qua_han";
  return paid > 0 ? "thu_mot_phan" : "chua_thu";
}

module.exports = { prevPeriod, periodRange, occupiedDays, peopleInPeriod, tierAmount, lineAmount, buildInvoice, verifyInvoice, payState };
