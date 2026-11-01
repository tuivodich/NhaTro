# NhaTro — Quản lý nhà trọ

Hệ thống quản lý phòng trọ và nhà cho thuê gồm: web quản trị, trang phòng trống công khai, cổng người thuê, bot Telegram và ứng dụng điện thoại dạng PWA (cài lên màn hình chính). Nền tảng kế thừa từ dự án Nhà Gỗ Homestay (`tuivodich/Home`).

- Trang web: https://nhatroviet.web.app (Firebase project `vnhatro`)
- Kế hoạch tổng thể: [`docs/KE_HOACH.md`](docs/KE_HOACH.md)
- Hướng dẫn triển khai lần đầu: [`docs/trien-khai.md`](docs/trien-khai.md)
- Quy tắc cho AI / lập trình viên: [`CLAUDE.md`](CLAUDE.md)

## Chức năng

| Phần | Nội dung |
|---|---|
| Khu & phòng | 3 khu tạo sẵn (43/48 Cộng Hòa: P1–P6 + mặt bằng MB; nhà 495/5 Hiệp Thành 10; nhà 36/37/12 QL1), ảnh phòng, giá, trạng thái, đăng công khai khi trống |
| Người cư trú | Hồ sơ, CCCD (quét QR trên thẻ để tự điền), ảnh giấy tờ (chỉ chủ/quản lý xem), tạm trú, mã mời tài khoản |
| Hợp đồng | Tạo, người ở cùng, gia hạn, thanh lý (tự lập hóa đơn cuối, trừ cọc, tính tiền hoàn cọc), in hợp đồng mẫu |
| Điện nước | Bảng ghi chỉ số cả dãy, chụp ảnh đồng hồ, hoặc nhắn bot `/dien P1 1234` |
| Hóa đơn | Lập nháp hàng loạt → máy chủ tính lại → phát hành, gửi Telegram kèm mã VietQR; thu tiền mặt/chuyển khoản, nợ dồn, in/lưu PDF |
| Tài chính | Thu chi khác, báo cáo tháng/năm, công nợ theo tuổi nợ, xuất Excel (CSV), đối soát ngân hàng |
| Tự động | Webhook SePay/Casso tự gạch nợ; 08:00 nhắc hạn trả tiền, hợp đồng sắp hết hạn, chỉ số chưa ghi, tạm trú; 21:00 báo cáo ngày; 02:00 sao lưu |
| Báo hỏng | Người thuê gửi qua web/bot; nhân viên nhận, xử lý, ghi chi phí |
| Phân quyền | Chủ (mọi khu) · Quản lý (khu được giao) · Nhân viên (ghi chỉ số, thu tiền mặt, không xem CCCD) · Người thuê |

## Kiến trúc

React 19 + Vite + TypeScript + Firebase (Auth, Firestore, Storage, Hosting, Cloud Functions Node 22 ở `asia-southeast1`). **Luật Firestore là lớp phân quyền thật** (`firestore.rules`); Cloud Functions lo việc cần tin cậy hoặc chạy định kỳ.

```
src/lib/billing.ts  ↔  functions/billing.js   tính hóa đơn (test so khớp hai bản)
src/pages/*                                   các trang
functions/bot.js, invoices.js, bankhook.js    bot Telegram, phát hành hóa đơn + mã mời, webhook ngân hàng
firestore.rules, storage.rules                phân quyền theo khu
tests/rules.test.mjs, functions/test, scripts/*.test.mts, tests/e2e.mjs
```

## Lệnh

```bash
npm ci && npm ci --prefix functions && npm ci --prefix tests
npm run dev          # giao diện (nối Firebase thật)
npm test             # test thư viện + luật Firestore + Cloud Functions (cần JDK 21)
npm run test:e2e     # test trình duyệt toàn luồng (cần Playwright + Chromium)
npm run build
```

Chạy giao diện với emulator: `VITE_USE_EMULATOR=1 npx vite` trong lúc `npx firebase emulators:start --only auth,firestore,storage --project demo-test`.
