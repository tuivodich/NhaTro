import test from "node:test";
import assert from "node:assert/strict";
import { debtAging, debts, expiringContracts, monthSummary, occupancy } from "../src/lib/report.ts";
import { parseCccdQr } from "../src/lib/cccd.ts";
import { addMonths, todayStr, daysInMonth } from "../src/lib/format.ts";

const inv = (o: Record<string, unknown>) => ({ id: "i", code: "C", propertyId: "p", roomId: "r", roomCode: "P1", contractId: "c", period: "2026-11", tenantUids: [], tenantName: "A", lines: [], total: 1000, paid: 0, payLog: [], status: "da_gui", dueDate: "2026-11-05", ...o }) as never;

test("monthSummary: thu theo ngày thu, phát hành theo kỳ, bỏ hóa đơn hủy/nháp", () => {
  const s = monthSummary("2026-11", [
    inv({ total: 3000, paid: 3000, payLog: [{ amount: 1000, date: "2026-10-30", method: "cash", by: "x" }, { amount: 2000, date: "2026-11-02", method: "bank", by: "x" }] }),
    inv({ status: "nhap", total: 999 }),
    inv({ status: "huy", total: 5000, payLog: [{ amount: 5000, date: "2026-11-01", method: "cash", by: "x" }] }),
  ], [
    { id: "t", propertyId: "p", date: "2026-11-10", type: "chi", category: "Sửa chữa", amount: 500 },
    { id: "t2", propertyId: "p", date: "2026-11-11", type: "thu", category: "Khác", amount: 100 },
    { id: "t3", propertyId: "p", date: "2026-12-01", type: "chi", category: "x", amount: 7 },
  ]);
  assert.deepEqual(s, { period: "2026-11", collected: 2000, collectedCash: 0, collectedBank: 2000, billed: 3000, otherIncome: 100, expense: 500, profit: 1600 });
});

test("debts + aging", () => {
  const rows = debts([
    inv({ id: "a", total: 1000, paid: 400, dueDate: "2026-11-05" }),
    inv({ id: "b", total: 1000, paid: 1000 }),
    inv({ id: "c", total: 2000, dueDate: "2026-08-01", period: "2026-08" }),
    inv({ id: "d", total: 500, dueDate: "2026-12-05", period: "2026-12" }),
  ], "2026-11-20");
  assert.deepEqual(rows.map((r) => r.invoiceId), ["c", "a", "d"]);
  assert.equal(rows[1].due, 600);
  assert.deepEqual(debtAging(rows), { current: 500, d30: 600, d60: 0, over60: 2000, total: 3100 });
});

test("expiringContracts & occupancy", () => {
  const c = (id: string, end: string, status = "hieu_luc") => ({ id, end, status }) as never;
  assert.deepEqual(expiringContracts([c("a", "2026-12-15"), c("b", "2027-06-01"), c("x", "2026-11-01", "da_thanh_ly"), c("d", "2026-11-10")], "2026-11-20").map((x: { id: string }) => x.id), ["d", "a"]);
  const r = (status: string) => ({ status }) as never;
  assert.deepEqual(occupancy([r("dang_thue"), r("trong"), r("dang_sua"), r("dang_thue")]), { total: 3, rented: 2, vacant: 1, rate: 2 / 3 });
});

test("parseCccdQr", () => {
  assert.deepEqual(parseCccdQr("079099012345|123456789|Nguyễn Văn An|01021999|Nam|12 Cộng Hòa, Tân Bình, TP.HCM|15082021"), {
    idNumber: "079099012345", oldIdNumber: "123456789", fullName: "Nguyễn Văn An", dob: "1999-02-01", gender: "nam", address: "12 Cộng Hòa, Tân Bình, TP.HCM", idIssueDate: "2021-08-15",
  });
  assert.equal(parseCccdQr("079099012345||Trần Thị B|31021999|Nữ|x|15082021")?.dob, "");
  assert.equal(parseCccdQr("079099012345||Trần Thị B|31121999|Nữ|x|15082021")?.gender, "nu");
  assert.equal(parseCccdQr("abc"), null);
  assert.equal(parseCccdQr("123|x|y|z|t|u|v"), null);
});

test("format: kỳ, ngày VN", () => {
  assert.equal(addMonths("2026-11", 2), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.equal(daysInMonth("2024-02"), 29);
  assert.equal(todayStr(new Date("2026-11-01T18:30:00Z")), "2026-11-02"); // 01:30 sáng giờ VN
});
