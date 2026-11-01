import test from "node:test";
import assert from "node:assert/strict";
import { isRealDate, maskDMY, maskDMYHM, parseDMY, parseDMYHM, toDMY, toDMYHM } from "../src/lib/dates.ts";

test("parseDMY: ngày hợp lệ, nhiều kiểu phân cách, năm nhuận", () => {
  assert.equal(parseDMY("25/12/2026"), "2026-12-25");
  assert.equal(parseDMY("5/1/2026"), "2026-01-05");
  assert.equal(parseDMY(" 05-01-2026 "), "2026-01-05");
  assert.equal(parseDMY("05.01.2026"), "2026-01-05");
  assert.equal(parseDMY("29/02/2028"), "2028-02-29");
  assert.equal(parseDMY("29/02/2027"), null); // không nhuận
  assert.equal(parseDMY("31/04/2026"), null);
  assert.equal(parseDMY("00/10/2026"), null);
  assert.equal(parseDMY("10/13/2026"), null);
  assert.equal(parseDMY("10/10/1899"), null);
  assert.equal(parseDMY("10/10/2101"), null);
  assert.equal(parseDMY("25/12"), null);
  assert.equal(parseDMY("25/12/26"), null);
  assert.equal(parseDMY("abc"), null);
  assert.equal(parseDMY(""), null);
});

test("toDMY và isRealDate", () => {
  assert.equal(toDMY("2026-12-25"), "25/12/2026");
  assert.equal(toDMY("2026-02-30"), "");
  assert.equal(toDMY(""), "");
  assert.ok(isRealDate(2000, 2, 29)); assert.ok(!isRealDate(1900, 2, 29)); assert.ok(isRealDate(2024, 2, 29));
});

test("maskDMY: tự chèn dấu / và bỏ ký tự thừa", () => {
  assert.equal(maskDMY("2"), "2"); assert.equal(maskDMY("25"), "25"); assert.equal(maskDMY("251"), "25/1");
  assert.equal(maskDMY("2512"), "25/12"); assert.equal(maskDMY("25122"), "25/12/2");
  assert.equal(maskDMY("25122026"), "25/12/2026"); assert.equal(maskDMY("251220261234"), "25/12/2026");
  assert.equal(maskDMY("25/12/2026"), "25/12/2026"); assert.equal(maskDMY("ab25-12.2026"), "25/12/2026");
});

test("ngày giờ dd/mm/yyyy HH:mm", () => {
  assert.equal(parseDMYHM("25/12/2026 14:30"), "2026-12-25T14:30");
  assert.equal(parseDMYHM("5/1/2026 8:05"), "2026-01-05T08:05");
  assert.equal(parseDMYHM("25/12/2026 24:00"), null);
  assert.equal(parseDMYHM("25/12/2026 12:60"), null);
  assert.equal(parseDMYHM("31/02/2026 10:00"), null);
  assert.equal(parseDMYHM("25/12/2026"), null);
  assert.equal(toDMYHM("2026-12-25T14:30"), "25/12/2026 14:30");
  assert.equal(toDMYHM("bad"), "");
  assert.equal(maskDMYHM("251220261430"), "25/12/2026 14:30");
  assert.equal(maskDMYHM("2512202614"), "25/12/2026 14");
  assert.equal(maskDMYHM("25122026143"), "25/12/2026 14:3");
  assert.equal(maskDMYHM("25122"), "25/12/2");
});
