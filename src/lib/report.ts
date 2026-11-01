/** Báo cáo thu chi, công nợ, lấp đầy (hàm thuần, dễ test). */
import { payState } from "./billing.ts";
import type { Contract, Invoice, Room, Txn } from "./types";

export interface MonthSummary {
  period: string;
  /** Tiền thu thực tế trong tháng (theo ngày thu trong payLog), tách theo phương thức. */
  collected: number; collectedCash: number; collectedBank: number;
  /** Tổng hóa đơn phát hành của kỳ. */
  billed: number;
  otherIncome: number; expense: number;
  profit: number;
}

export function monthSummary(period: string, invoices: Invoice[], txns: Txn[]): MonthSummary {
  let collected = 0, cash = 0, bank = 0, billed = 0, otherIncome = 0, expense = 0;
  for (const inv of invoices) {
    if (inv.status === "huy") continue;
    if (inv.status !== "nhap" && inv.period === period) billed += inv.total;
    for (const p of inv.payLog ?? []) {
      if (!p.date?.startsWith(period)) continue;
      collected += p.amount;
      if (p.method === "bank") bank += p.amount; else cash += p.amount;
    }
  }
  for (const t of txns) {
    if (!t.date?.startsWith(period)) continue;
    if (t.type === "thu") otherIncome += t.amount; else expense += t.amount;
  }
  return { period, collected, collectedCash: cash, collectedBank: bank, billed, otherIncome, expense, profit: collected + otherIncome - expense };
}

export interface DebtRow { invoiceId: string; code: string; propertyId: string; roomId: string; roomCode: string; tenantName: string; period: string; dueDate: string; total: number; paid: number; due: number; daysLate: number }

/** Hóa đơn đã phát hành còn nợ, sắp xếp nợ lâu nhất trước. */
export function debts(invoices: Invoice[], today: string): DebtRow[] {
  const rows: DebtRow[] = [];
  for (const inv of invoices) {
    const st = payState(inv, today);
    if (st !== "chua_thu" && st !== "thu_mot_phan" && st !== "qua_han") continue;
    const due = inv.total - (inv.paid ?? 0);
    const daysLate = inv.dueDate && today > inv.dueDate ? Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(inv.dueDate + "T00:00:00Z")) / 86400000) : 0;
    rows.push({ invoiceId: inv.id, code: inv.code, propertyId: inv.propertyId, roomId: inv.roomId, roomCode: inv.roomCode, tenantName: inv.tenantName, period: inv.period, dueDate: inv.dueDate, total: inv.total, paid: inv.paid ?? 0, due, daysLate });
  }
  return rows.sort((a, b) => b.daysLate - a.daysLate || a.period.localeCompare(b.period));
}

/** Tuổi nợ: chưa tới hạn, quá hạn 1–30, 31–60, trên 60 ngày. */
export function debtAging(rows: DebtRow[]) {
  const b = { current: 0, d30: 0, d60: 0, over60: 0, total: 0 };
  for (const r of rows) {
    b.total += r.due;
    if (r.daysLate <= 0) b.current += r.due; else if (r.daysLate <= 30) b.d30 += r.due; else if (r.daysLate <= 60) b.d60 += r.due; else b.over60 += r.due;
  }
  return b;
}

/** Hợp đồng còn hiệu lực sắp hết hạn trong `days` ngày (kể cả đã quá hạn mà chưa thanh lý). */
export function expiringContracts(contracts: Contract[], today: string, days = 30): Contract[] {
  const limit = new Date(Date.parse(today + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);
  return contracts.filter((c) => c.status === "hieu_luc" && c.end && c.end <= limit).sort((a, b) => a.end.localeCompare(b.end));
}

export function occupancy(rooms: Room[]) {
  const total = rooms.filter((r) => r.status !== "dang_sua").length;
  const rented = rooms.filter((r) => r.status === "dang_thue").length;
  return { total, rented, vacant: rooms.filter((r) => r.status === "trong").length, rate: total ? rented / total : 0 };
}
