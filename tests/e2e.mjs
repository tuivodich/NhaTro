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
  await own.locator(".modal").waitFor({ state: "detached" });
  await own.locator("tr", { hasText: "Nguyễn Văn An" }).waitFor();
  await own.locator("tr", { hasText: "Nguyễn Văn An" }).getByRole("button", { name: "Tạo mã mời" }).click();
  const invite = (await own.locator("tr", { hasText: "Nguyễn Văn An" }).locator("code").textContent()).trim();
  ok("tạo mã mời", /^[A-Z0-9]{6}$/.test(invite));

  // 4b) Hộ chiếu (người nước ngoài) và CMND cũ; số sai bị báo lỗi
  await own.getByRole("button", { name: "+ Thêm người" }).click();
  await field(own, "Khu").selectOption("conghoa");
  await field(own, "Họ và tên").fill("Kim Min Ji");
  await field(own, "Số điện thoại").fill("0909000111");
  await own.getByLabel("Hộ chiếu", { exact: true }).check();
  ok("hộ chiếu: ẩn nút quét QR CCCD, hiện ô quốc tịch", !(await own.getByRole("button", { name: /Quét QR/ }).count()) && (await field(own, "Quốc tịch").count()) === 1);
  ok("hộ chiếu: có ô ảnh trang thông tin + nút chọn ảnh", (await own.getByText("Trang thông tin hộ chiếu").count()) === 1 && (await own.getByText("🖼 Chọn ảnh").count()) === 3);
  await field(own, "Số hộ chiếu").fill("AB1");
  await field(own, "Quốc tịch").fill("Hàn Quốc");
  await own.getByLabel(/đồng ý cho lưu thông tin/).check();
  await own.locator(".modal").getByRole("button", { name: "Lưu", exact: true }).click();
  ok("số hộ chiếu sai bị báo lỗi", await own.getByText(/Số hộ chiếu gồm 6–12/).waitFor({ timeout: 5000 }).then(() => true, () => false));
  await field(own, "Số hộ chiếu").fill("m1234567");
  await own.locator(".modal").getByRole("button", { name: "Lưu", exact: true }).click();
  await own.locator(".modal").waitFor({ state: "detached" });
  ok("lưu hồ sơ hộ chiếu", (await own.locator("tr", { hasText: "Kim Min Ji" }).textContent()).includes("Hộ chiếu ••••4567"));
  await own.getByRole("button", { name: "+ Thêm người" }).click();
  await field(own, "Khu").selectOption("conghoa");
  await field(own, "Họ và tên").fill("Trần Văn Dũng");
  await field(own, "Số điện thoại").fill("0909000222");
  await own.getByLabel("Chứng minh nhân dân (CMND cũ)").check();
  await field(own, "Số CMND").fill("123456789");
  await own.getByLabel(/đồng ý cho lưu thông tin/).check();
  await own.locator(".modal").getByRole("button", { name: "Lưu", exact: true }).click();
  await own.locator(".modal").waitFor({ state: "detached" });
  ok("lưu hồ sơ CMND cũ", (await own.locator("tr", { hasText: "Trần Văn Dũng" }).textContent()).includes("CMND ••••6789"));

  // 4c) Thêm khu nhà trọ thứ 4 từ menu chính + thêm phòng vào khu đó
  await own.getByRole("link", { name: "Khu nhà trọ" }).click();
  await own.getByRole("button", { name: "+ Thêm khu nhà trọ" }).click();
  await field(own, "Tên khu").fill("Khu trọ Gò Vấp");
  await field(own, "Địa chỉ").fill("12 Quang Trung, Gò Vấp, TP.HCM");
  await saveModal(own);
  await own.getByRole("heading", { name: "Khu nhà trọ (4)" }).waitFor();
  ok("tạo khu thứ 4", true);
  await own.locator(".card", { hasText: "Khu trọ Gò Vấp" }).getByRole("link", { name: "Xem / thêm phòng" }).click();
  await own.getByRole("button", { name: "+ Thêm phòng vào khu này" }).first().click();
  await field(own, "Mã phòng").fill("GV1");
  await field(own, "Giá thuê/tháng").fill("2500000");
  await saveModal(own);
  ok("thêm phòng vào khu mới", (await own.locator(".card.room", { hasText: "GV1" }).count()) === 1);
  await own.getByLabel("Chọn khu").selectOption(""); // trở lại "Tất cả khu"


  await own.goto(BASE + "/app/hop-dong");
  await own.getByRole("button", { name: "+ Hợp đồng mới" }).click();
  await field(own, "Khu").selectOption("conghoa");
  await field(own, "Phòng trống").selectOption({ label: "P1 — Phòng 1" });
  await field(own, "Người đứng tên").selectOption({ label: "Nguyễn Văn An · 0901234567" });
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
  ok("giao diện mặc định là Tươi sáng", await pub.evaluate(() => document.documentElement.dataset.theme) === "sang");
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
  // 13) Khách: lưu "Hồ sơ của tôi" → đăng ký thuê P2 (đồng ý chia sẻ) → chủ giữ chỗ → P2 rời trang chủ
  const guest = await newUser("khach@nhatro.vn");
  await guest.waitForURL("**/tai-khoan");
  await guest.getByRole("link", { name: "Mở hồ sơ" }).click();
  await field(guest, "Họ và tên").fill("Lê Văn Khách");
  await field(guest, "Số điện thoại").fill("0912 345 678");
  await field(guest, "Số CCCD").fill("079099888777");
  await guest.getByRole("button", { name: "Lưu hồ sơ" }).click();
  ok("khách lưu Hồ sơ của tôi", await guest.getByText(/Đã lưu hồ sơ/).waitFor({ timeout: 10000 }).then(() => true, () => false));
  await guest.goto(BASE + "/");
  await guest.getByText("Xem & đăng ký thuê").first().click();
  await guest.getByRole("button", { name: "📝 Đăng ký thuê phòng này" }).click();
  ok("form lấy sẵn họ tên từ hồ sơ", (await field(guest, "Họ và tên").inputValue()) === "Lê Văn Khách");
  ok("có ô đồng ý chia sẻ hồ sơ (đã tick sẵn)", await guest.getByLabel(/Cho phép chủ nhà dùng/).isChecked());
  await field(guest, "Số người ở").fill("2");
  await field(guest, "Muốn dọn vào từ").fill("01/12/2026");
  await field(guest, "Ghi chú").fill("Đi làm ca tối");
  await guest.getByRole("button", { name: "Gửi đăng ký" }).click();
  ok("khách gửi đăng ký thuê", await guest.getByText("Yêu cầu của bạn").waitFor({ timeout: 10000 }).then(() => true, () => false));
  await own.getByRole("link", { name: /Đăng ký thuê/ }).click();
  const card = own.locator(".card", { hasText: "Lê Văn Khách" });
  await card.waitFor();
  ok("chủ thấy số đăng ký mới + đồng ý chia sẻ hồ sơ", (await own.locator(".navbadge").textContent()).trim() === "1" && (await card.textContent()).includes("đồng ý chia sẻ hồ sơ"));
  await card.getByRole("button", { name: "✅ Giữ chỗ" }).click();
  await card.locator(".tag", { hasText: "Đang giữ chỗ" }).waitFor();
  ok("chủ giữ chỗ", true);
  const pub2 = await (await browser.newContext()).newPage();
  await pub2.goto(BASE + "/");
  await pub2.getByText(/Hiện đã hết phòng trống|Đang cho thuê/).first().waitFor();
  await pub2.waitForTimeout(1000);
  ok("phòng đang giữ chỗ không còn trên trang chủ", !(await pub2.getByText("Phòng 2").count()));

  // 14) Lập hợp đồng từ yêu cầu (máy chủ chưa chạy trong test → lập hồ sơ tối thiểu) → form điền sẵn → "Đã ký hợp đồng"
  await card.getByRole("button", { name: "📄 Lập hợp đồng" }).click();
  await own.waitForURL("**/app/hop-dong**");
  await own.getByRole("heading", { name: "Hợp đồng mới" }).waitFor();
  ok("form hợp đồng điền sẵn phòng P2 + người thuê", (await field(own, "Phòng trống").locator("option:checked").textContent()).startsWith("P2") && (await field(own, "Người đứng tên").locator("option:checked").textContent()).includes("Lê Văn Khách"));
  ok("ngày bắt đầu = ngày muốn dọn vào", (await field(own, "Ngày bắt đầu").inputValue()) === "01/12/2026");
  await own.getByRole("button", { name: "Tạo hợp đồng" }).click();
  await own.locator(".modal").waitFor({ state: "detached" });
  await own.getByRole("link", { name: /Đăng ký thuê/ }).click();
  await own.getByRole("button", { name: /Đang thuê \(1\)/ }).click();
  ok("yêu cầu tự chuyển “Đã ký hợp đồng” + gắn hợp đồng", (await card.textContent()).includes("Đã ký hợp đồng") && (await card.textContent()).includes("Hợp đồng"));

  // 15) Kết thúc thuê (thanh lý) → yêu cầu "Đã kết thúc thuê"; chủ khôi phục khi thanh lý nhầm
  await card.getByRole("link", { name: "Kết thúc thuê / thanh lý" }).click();
  await own.getByRole("button", { name: /Kết thúc thuê \/ thanh lý/ }).click();
  await field(own, "Chỉ số điện cuối").fill("10");
  await field(own, "Chỉ số nước cuối").fill("5");
  await own.locator(".modal").getByRole("button", { name: "Thanh lý", exact: true }).click();
  await own.locator(".modal").waitFor({ state: "detached" });
  await own.getByRole("link", { name: /Đăng ký thuê/ }).click();
  await own.getByRole("button", { name: "Tất cả" }).click();
  ok("thanh lý → yêu cầu “Đã kết thúc thuê”", await card.locator(".tag", { hasText: "Đã kết thúc thuê" }).waitFor({ timeout: 10000 }).then(() => true, () => false));
  await own.goto(BASE + "/app/hop-dong");
  await own.getByRole("button", { name: "Đã kết thúc" }).click();
  await own.locator("tr", { hasText: "Lê Văn Khách" }).click();
  await own.getByRole("button", { name: /Khôi phục hợp đồng/ }).click();
  await own.locator(".modal").waitFor({ state: "detached" });
  await own.getByRole("button", { name: "Đang hiệu lực" }).click();
  ok("khôi phục hợp đồng thanh lý nhầm", await own.locator("tr", { hasText: "Lê Văn Khách" }).waitFor({ timeout: 10000 }).then(() => true, () => false));
  await own.getByRole("link", { name: /Đăng ký thuê/ }).click();
  await own.getByRole("button", { name: "Tất cả" }).click();
  ok("yêu cầu quay về “Đã ký hợp đồng”", await card.locator(".tag", { hasText: "Đã ký hợp đồng" }).waitFor({ timeout: 10000 }).then(() => true, () => false));

  // 16) Bấm nhầm → đổi trạng thái tự do
  await card.getByLabel("Đổi trạng thái").selectOption("da_lien_he");
  await card.locator(".tag", { hasText: "Đã liên hệ" }).waitFor();
  await card.getByLabel("Đổi trạng thái").selectOption("da_thue");
  ok("đổi trạng thái qua lại", await card.locator(".tag", { hasText: "Đã ký hợp đồng" }).waitFor({ timeout: 10000 }).then(() => true, () => false));
  await guest.goto(BASE + "/tai-khoan");
  ok("khách thấy “Đã ký hợp đồng” trong tài khoản", await guest.locator(".card", { hasText: "Đăng ký thuê của tôi" }).getByText("Đã ký hợp đồng").waitFor({ timeout: 10000 }).then(() => true, () => false));
  // 17) Chủ đổi giao diện + tên website → khách thấy ngay; admin xem thử trước khi lưu
  await own.goto(BASE + "/app/cai-dat");
  await own.getByRole("radio", { name: /Trẻ trung/ }).click();
  ok("xem thử giao diện ngay khi bấm (chưa lưu)", await own.waitForFunction(() => document.documentElement.dataset.theme === "tretrung", null, { timeout: 5000 }).then(() => true, () => false));
  await own.getByLabel("Tên hiển thị của website").fill("Nhà Trọ Ánh Dương");
  await own.getByRole("button", { name: "Lưu giao diện" }).click();
  await own.getByText(/Đã lưu\. Giao diện mới/).waitFor();
  const pub3 = await (await browser.newContext()).newPage();
  await pub3.goto(BASE + "/");
  ok("khách thấy giao diện Trẻ trung sau khi chủ lưu", await pub3.waitForFunction(() => document.documentElement.dataset.theme === "tretrung", null, { timeout: 10000 }).then(() => true, () => false));
  ok("khách thấy tên website mới", await pub3.locator(".pub-head .brand", { hasText: "Nhà Trọ Ánh Dương" }).waitFor({ timeout: 10000 }).then(() => true, () => false));
  await own.goto(BASE + "/app");
  ok("trang quản trị cũng đổi giao diện + tên", await own.locator(".shell > header .brand", { hasText: "Nhà Trọ Ánh Dương" }).waitFor({ timeout: 10000 }).then(() => true, () => false) && await own.evaluate(() => document.documentElement.dataset.theme) === "tretrung");
  await pub3.goto(BASE + "/?theme=go");
  ok("?theme=go xem thử riêng, không lưu", await pub3.evaluate(() => document.documentElement.dataset.theme) === "go");
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
