import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as ts from "../src/lib/billing.ts";

const js = createRequire(import.meta.url)("../functions/billing.js");

const contract = {
  rent: 3_000_000, start: "2026-01-01", end: "2026-12-31",
  occupants: [{ tenantId: "t1", name: "A", from: "2026-01-01" }, { tenantId: "t2", name: "B", from: "2026-11-20" }],
  services: [
    { id: "dien", name: "Điện", mode: "meter" as const, unit: "kWh", price: 3500 },
    { id: "nuoc", name: "Nước", mode: "person" as const, unit: "người", price: 100_000 },
    { id: "rac", name: "Rác", mode: "room" as const, unit: "tháng", price: 30_000 },
  ],
};

test("tháng đủ: tiền phòng + điện theo chỉ số + nước theo người + rác, tròn nghìn", () => {
  const r = ts.buildInvoice({ contract, period: "2026-11", readings: { dien: { old: 1200, new: 1290 } } });
  assert.deepEqual(r.warnings, []);
  const by = Object.fromEntries(r.lines.map((l) => [l.serviceId ?? l.kind, l.amount]));
  assert.equal(by.rent, 3_000_000);
  assert.equal(by.dien, 90 * 3500);
  assert.equal(by.nuoc, 200_000); // 2 người (B đến giữa tháng vẫn tính)
  assert.equal(by.rac, 30_000);
  assert.equal(r.total, 3_000_000 + 315_000 + 200_000 + 30_000);
  assert.match(r.lines.find((l) => l.serviceId === "dien")!.label, /tháng 10\/2026: 1\.200 → 1\.290/);
});

test("tháng đầu tính theo ngày ở; tổng làm tròn có dòng Làm tròn", () => {
  const c = { ...contract, start: "2026-11-16", occupants: [{ tenantId: "t1", name: "A", from: "2026-11-16" }] };
  const r = ts.buildInvoice({ contract: c, period: "2026-11" });
  const rent = r.lines.find((l) => l.kind === "rent")!;
  assert.equal(rent.qty, 15); assert.equal(rent.den, 30);
  assert.equal(rent.amount, 1_500_000);
  assert.ok(r.warnings.some((w) => w.startsWith("Điện")), "thiếu chỉ số điện được cảnh báo");
  assert.equal(r.total % 1000, 0);
  assert.ok(ts.verifyInvoice(r).ok);
});

test("thanh lý giữa tháng (endedOn) và giảm trừ", () => {
  const c = { ...contract, endedOn: "2026-12-10" };
  const r = ts.buildInvoice({ contract: c, period: "2026-12", readings: { dien: { old: 100, new: 100 } }, extras: [{ label: "Trừ cọc", amount: -500_000 }] });
  assert.equal(r.lines.find((l) => l.kind === "rent")!.amount, Math.round(3_000_000 * 10 / 31));
  assert.equal(r.lines.find((l) => l.kind === "discount")!.amount, -500_000);
});

test("cảnh báo chỉ số mới nhỏ hơn chỉ số cũ, hợp đồng ngoài kỳ", () => {
  assert.ok(ts.buildInvoice({ contract, period: "2026-11", readings: { dien: { old: 50, new: 10 } } }).warnings.some((w) => w.includes("nhỏ hơn")));
  const r = ts.buildInvoice({ contract, period: "2027-02" });
  assert.equal(r.total, 0);
  assert.ok(r.warnings[0].includes("không có hiệu lực"));
});

test("bậc thang", () => {
  const tiers = [{ upTo: 50, price: 2000 }, { upTo: 100, price: 2500 }, { upTo: null, price: 3000 }];
  assert.equal(ts.tierAmount(30, tiers), 60_000);
  assert.equal(ts.tierAmount(120, tiers), 50 * 2000 + 50 * 2500 + 20 * 3000);
});

test("verifyInvoice phát hiện sửa tay sai", () => {
  const r = ts.buildInvoice({ contract, period: "2026-11", readings: { dien: { old: 0, new: 10 } } });
  const bad = { ...r, lines: r.lines.map((l) => (l.kind === "rent" ? { ...l, amount: 1 } : l)) };
  assert.equal(ts.verifyInvoice(bad).ok, false);
  assert.equal(ts.verifyInvoice({ ...r, total: r.total + 1 }).ok, false);
});

test("payState", () => {
  assert.equal(ts.payState({ status: "da_gui", total: 100, paid: 0, dueDate: "2026-11-05" }, "2026-11-04"), "chua_thu");
  assert.equal(ts.payState({ status: "da_gui", total: 100, paid: 50, dueDate: "2026-11-05" }, "2026-11-04"), "thu_mot_phan");
  assert.equal(ts.payState({ status: "da_gui", total: 100, paid: 50, dueDate: "2026-11-05" }, "2026-11-06"), "qua_han");
  assert.equal(ts.payState({ status: "da_gui", total: 100, paid: 100 }, "2027-01-01"), "da_thu");
  assert.equal(ts.payState({ status: "nhap", total: 100 }, "2027-01-01"), "nhap");
});

test("SO KHỚP: billing.ts và functions/billing.js cho kết quả giống hệt nhau", () => {
  const cases = [
    { contract, period: "2026-11", readings: { dien: { old: 1200, new: 1290 } } },
    { contract: { ...contract, start: "2026-11-16" }, period: "2026-11", roundTo: 0 },
    { contract: { ...contract, endedOn: "2026-12-10" }, period: "2026-12", readings: { dien: { old: 1, new: 7 } }, extras: [{ label: "x", amount: 12_345 }, { label: "y", amount: -2_000 }] },
    { contract: { ...contract, services: [{ id: "dien", name: "Điện", mode: "meter" as const, unit: "kWh", price: 0, tiers: [{ upTo: 50, price: 1984 }, { upTo: null, price: 2380 }] }] }, period: "2026-03", readings: { dien: { old: 0, new: 173 } } },
    { contract, period: "2027-05" },
  ];
  for (const c of cases) assert.deepEqual(js.buildInvoice(structuredClone(c)), ts.buildInvoice(structuredClone(c)));
  for (const p of ["2026-01", "2024-02", "2026-12"]) {
    assert.deepEqual(js.periodRange(p), ts.periodRange(p));
    assert.equal(js.prevPeriod(p), ts.prevPeriod(p));
  }
  const inv = ts.buildInvoice(cases[0]);
  assert.deepEqual(js.verifyInvoice(inv), ts.verifyInvoice(inv));
});
