// Kiểm thử trình duyệt toàn luồng với Firebase Emulator (auth + firestore) và Vite dev server.
// Chạy: npm run test:e2e   (cần Playwright + Chromium; CI có thể bỏ qua bước này)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { console.log("Bỏ qua e2e: chưa cài playwright"); process.exit(0); }

const BASE = "http://127.0.0.1:5173";
const vite = spawn("npx", ["vite", "--port", "5173", "--strictPort", "--host", "127.0.0.1"], { env: { ...process.env, VITE_USE_EMULATOR: "1" }, stdio: "pipe", detached: true });
const stopVite = () => { try { process.kill(-vite.pid, "SIGTERM"); } catch { /* đã dừng */ } };
await new Promise((res, rej) => { vite.stdout.on("data", (d) => String(d).includes("Local") && res()); setTimeout(() => { stopVite(); rej(new Error("vite không chạy")); }, 60000); });

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log("ok  ", name); } else { fail++; console.log("FAIL", name); } };
const browser = await chromium.launch();
const errors = [], consoleErrors = [];
async function newUser(email) {
  const ctx = await browser.newContext({ locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300)); });
  page.on("dialog", (d) => { d.accept().catch(() => {}); });
  await page.goto(BASE + "/dang-nhap");
  await page.getByRole("button", { name: "Chưa có tài khoản? Tạo mới" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill("matkhau123");
  await page.getByRole("button", { name: "Tạo tài khoản" }).last().click();
  return page;
}
/** Bấm Lưu và đợi hộp thoại đóng (ứng dụng chỉ đóng khi máy chủ đã nhận). */
const saveModal = async (page) => { await page.locator(".modal").getByRole("button", { name: "Lưu", exact: true }).click(); await page.locator(".modal").waitFor({ state: "detached" }); };
const field = (page, label) => page.locator("label", { hasText: label }).locator("input, select, textarea").first();

try {
  // 1) Người đầu tiên là chủ → tạo 3 khu
  const own = await newUser("chu@nhatro.vn");
  await own.waitForURL("**/app");
  await own.getByRole("button", { name: "Tạo 3 khu nhà trọ" }).click();
  await own.getByText("Đã tạo 3 khu").waitFor();
  ok("chủ tạo 3 khu", true);
  await own.getByRole("link", { name: "Phòng", exact: true }).click();
  await own.getByRole("heading", { name: "Khu trọ 43/48 Cộng Hòa" }).waitFor();
  await own.waitForFunction(() => document.querySelectorAll(".card.room").length >= 9, null, { timeout: 10000 }).catch(() => {});
  ok("có 7 phòng khu Cộng Hòa + 2 nhà nguyên căn", (await own.locator(".card.room").count()) === 9);

  // 2) Đặt giá phòng P1, bật hiện công khai cho P2
  await own.locator(".card.room", { hasText: "P1" }).getByRole("button", { name: "Sửa" }).click();
  await field(own, "Giá thuê/tháng").fill("3000000");
  await saveModal(own);
  await own.locator(".card.room", { hasText: "P2" }).getByRole("button", { name: "Sửa" }).click();
  await field(own, "Giá thuê/tháng").fill("2800000");
  await own.getByLabel("Hiện trên trang công khai khi phòng trống").check();
  await saveModal(own);
  await own.locator(".card.room", { hasText: "Đang hiện trên trang công khai" }).waitFor();


  // 3) Đơn giá điện khu Cộng Hòa
  await own.goto(BASE + "/app/khu");
  await own.locator(".card", { hasText: "Khu trọ 43/48 Cộng Hòa" }).getByRole("button", { name: "Sửa" }).click();
  const svc = own.locator(".svc").first();
  await svc.locator("label", { hasText: "Đơn giá" }).locator("input").fill("3500");
  await own.locator(".svc").nth(2).locator("label", { hasText: "Đơn giá" }).locator("input").fill("30000");
  await saveModal(own);
  await own.getByText("Điện: 3.500 đ/kWh").waitFor();
  ok("lưu đơn giá điện", true);

  // 4) Hồ sơ người thuê (dán QR CCCD)
  await own.goto(BASE + "/app/nguoi-thue");
  await own.getByRole("button", { name: "+ Thêm người" }).click();
  await own.getByRole("button", { name: /Quét QR trên CCCD/ }).click();
  await own.getByPlaceholder("079099012345|…").fill("079099012345|123456789|Nguyễn Văn An|01021999|Nam|12 Lê Lợi, Q1, TP.HCM|15082021");
  await own.getByRole("button", { name: "Dùng" }).click();
  ok("QR CCCD tự điền họ tên", (await field(own, "Họ và tên").inputValue()) === "Nguyễn Văn An");
  await field(own, "Khu").selectOption("conghoa");
  await field(own, "Số điện thoại").fill("0901234567");
  await own.getByLabel(/đồng ý cho lưu thông tin/).check();
  await own.getByRole("button", { name: "Lưu" }).click();
  await own.getByText("Lưu hồ sơ trước").waitFor({ state: "detached" });
  await own.locator("form").getByRole("button", { name: "Đóng", exact: true }).last().click();
  await own.locator("tr", { hasText: "Nguyễn Văn An" }).waitFor();
  await own.locator("tr", { hasText: "Nguyễn Văn An" }).getByRole("button", { name: "Tạo mã mời" }).click();
  const invite = (await own.locator("tr", { hasText: "Nguyễn Văn An" }).locator("code").textContent()).trim();
  ok("tạo mã mời", /^[A-Z0-9]{6}$/.test(invite));

  // 5) Hợp đồng P1 bắt đầu 01/10/2026 với chỉ số điện đầu 1000
  await own.goto(BASE + "/app/hop-dong");
  await own.getByRole("button", { name: "+ Hợp đồng mới" }).click();
  await field(own, "Khu").selectOption("conghoa");
  await field(own, "Phòng trống").selectOption({ label: "P1 — Phòng 1" });
  await field(own, "Người đứng tên").selectOption({ index: 1 });
  await field(own, "Ngày bắt đầu").fill("01/10/2026");
  await own.locator("fieldset", { hasText: "Chỉ số đầu" }).locator("label", { hasText: "Điện" }).locator("input").fill("1000");
  await own.locator("fieldset", { hasText: "Chỉ số đầu" }).locator("label", { hasText: "Nước" }).locator("input").fill("50");
  await own.getByRole("button", { name: "Tạo hợp đồng" }).click();
  await own.locator(".modal").waitFor({ state: "detached" });
  await own.locator("tr", { hasText: "Nguyễn Văn An" }).waitFor();
  ok("tạo hợp đồng", true);

  // 6) Ghi chỉ số kỳ 11/2026
  await own.goto(BASE + "/app/chi-so");
  await own.getByText("Chốt đầu kỳ 11/2026").waitFor();
  await own.getByLabel("Chỉ số Điện P1").fill("1090");
  await own.getByLabel("Chỉ số Nước P1").fill("56");
  await own.getByLabel("Chỉ số Điện P1").focus();
  await own.getByText("Đã ghi 2/2").waitFor();
  ok("ghi chỉ số điện nước", true);

  // 7) Lập hóa đơn kỳ 11/2026, phát hành (máy chủ chưa chạy → phát hành trực tiếp), thu một phần
  // Chuyển trang trong ứng dụng (không tải lại) như người dùng thật, để chỉ số vừa ghi kịp đồng bộ.
  await own.getByRole("button", { name: "Tài chính" }).click();
  await own.getByRole("menuitem", { name: "Hóa đơn & thu tiền" }).click();
  await own.getByRole("button", { name: /Lập hóa đơn kỳ 11\/2026/ }).click();
  const prev = own.locator(".card.inner", { hasText: "P1" });
  await prev.waitFor();
  const pt = await prev.textContent();
  ok("hóa đơn có điện 90 kWh = 315.000 đ", pt.includes("315.000")) || console.log("   xem trước:", pt);
  await own.getByRole("button", { name: /Lưu 1 hóa đơn nháp/ }).click();
  await own.locator(".modal").waitFor({ state: "detached" });
  await own.getByRole("button", { name: "Phát hành", exact: true }).click();
  await own.getByText(/Đã phát hành 1 hóa đơn/).waitFor();
  await own.getByRole("button", { name: "Thu tiền" }).click();
  await field(own, "Số tiền").fill("1000000");
  await own.getByRole("button", { name: "Lưu" }).click();
  await own.locator("tr", { hasText: "P1" }).getByText("Thu một phần").waitFor();
  ok("thu một phần", true);

  // 8) Tài khoản ngân hàng (để hiện VietQR)
  await own.goto(BASE + "/app/cai-dat");
  await field(own, "Ngân hàng").selectOption("970436");
  await field(own, "Số tài khoản").fill("0123456789");
  await field(own, "Tên chủ tài khoản").fill("NGUYEN VAN CHU");
  await own.locator(".card", { hasText: "Tài khoản nhận tiền" }).getByRole("button", { name: "Lưu" }).click();
  await own.getByText("Đã lưu tài khoản ngân hàng").waitFor();

  // 9) Trang công khai thấy P2, không thấy P1
  const pub = await (await browser.newContext()).newPage();
  await pub.goto(BASE + "/");
  await pub.getByText("Phòng 2").waitFor();
  ok("trang công khai có P2, không có P1", !(await pub.getByText("Phòng 1", { exact: true }).count()));

  // 10) Người thuê: chưa gắn hồ sơ thì không thấy hóa đơn nào (claimInvite cần Cloud Functions → kiểm tra quyền)
  const ten = await newUser("an@nhatro.vn");
  await ten.waitForURL("**/tai-khoan");
  await ten.getByText("Nhập mã mời của chủ nhà").waitFor();
  ok("người thuê mới thấy ô mã mời, không thấy hóa đơn", !(await ten.locator("table").count()));
  await ten.goto(BASE + "/app");
  await ten.waitForURL("**/tai-khoan");
  ok("người thuê không vào được /app", true);

  // 11) Hóa đơn in được có VietQR
  await own.goto(BASE + "/app/hoa-don");
  await own.getByRole("link", { name: "Xem/In" }).first().click();
  await own.getByRole("heading", { name: "HÓA ĐƠN TIỀN NHÀ" }).waitFor();
  ok("hóa đơn có mã VietQR", (await own.locator('img[alt="Mã VietQR chuyển khoản"]').getAttribute("src")).includes("970436-0123456789"));

  // 12) Báo cáo thu chi tháng có khoản đã thu
  await own.goto(BASE + "/app/thu-chi");
  ok("báo cáo ghi nhận 1.000.000 đ đã thu", await own.locator(".card", { hasText: "Đã thu tiền nhà" }).filter({ hasText: "1.000.000" }).waitFor({ timeout: 10000 }).then(() => true, () => false));
} catch (e) {
  fail++; console.log("FAIL (ngoại lệ)", e.message.split("\n").slice(0, 3).join(" | "));
  for (const c of browser.contexts()) for (const pg of c.pages()) await pg.screenshot({ path: `/tmp/claude-0/e2e-${Date.now()}.png`, fullPage: true }).catch(() => {});
} finally {
  ok("không có lỗi JavaScript trên trang", errors.length === 0) || console.log(errors.slice(0, 5));
  if (consoleErrors.length) console.log("console errors:", consoleErrors.slice(0, 8));
  await browser.close();
  stopVite();
}
console.log(`\n${pass} đạt, ${fail} lỗi`);
process.exit(fail ? 1 : 0);
