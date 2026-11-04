import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SITE_NAME, DEFAULT_THEME, THEME_IDS, THEME_INFO, isTheme, parseSettings, previewFromSearch } from "../src/lib/themeConfig.ts";

test("giao diện mặc định là Tươi sáng; có đủ 3 giao diện, mỗi cái có tên và mô tả", () => {
  assert.equal(DEFAULT_THEME, "sang");
  assert.deepEqual(THEME_IDS, ["sang", "tretrung", "go"]);
  for (const id of THEME_IDS) { assert.ok(THEME_INFO[id].name); assert.ok(THEME_INFO[id].desc); }
});

test("parseSettings: thiếu/sai thì dùng mặc định; cắt tên quá dài; bỏ khoảng trắng", () => {
  assert.deepEqual(parseSettings(undefined), { theme: "sang", name: DEFAULT_SITE_NAME });
  assert.deepEqual(parseSettings({ theme: "tretrung", name: "  Nhà trọ Ánh Dương " }), { theme: "tretrung", name: "Nhà trọ Ánh Dương" });
  assert.equal(parseSettings({ theme: "hacker" }).theme, "sang");
  assert.equal(parseSettings({ theme: 5, name: 7 }).name, DEFAULT_SITE_NAME);
  assert.equal(parseSettings({ name: "x".repeat(100) }).name.length, 60);
  assert.equal(parseSettings({ name: "   " }).name, DEFAULT_SITE_NAME);
});

test("isTheme và xem thử bằng ?theme=", () => {
  assert.ok(isTheme("go")); assert.ok(!isTheme("night")); assert.ok(!isTheme(undefined));
  assert.equal(previewFromSearch("?theme=tretrung"), "tretrung");
  assert.equal(previewFromSearch("?x=1&theme=go"), "go");
  assert.equal(previewFromSearch("?theme=<script>"), null);
  assert.equal(previewFromSearch(""), null);
});
