# NhaTro — hướng dẫn cho AI / lập trình viên

Hệ thống quản lý nhà trọ: web quản trị + trang phòng trống công khai + cổng người thuê + bot Telegram + app điện thoại (PWA → Capacitor).

- Kế hoạch tổng thể: `docs/KE_HOACH.md` (đọc trước khi làm bất cứ việc gì).
- Nền tảng kế thừa từ dự án Nhà Gỗ Homestay (`tuivodich/Home`), xem `docs/tham-khao/nha-go-homestay-handoff.md`.

## Kiến trúc
React 19 + Vite + TypeScript + Firebase (Auth, Firestore, Storage, Hosting, Cloud Functions gen2 Node 22, Scheduler, FCM).
**Rules-as-backend:** `firestore.rules` / `storage.rules` là lớp phân quyền thật; giao diện chỉ ẩn nút cho tiện. Việc cần tin cậy hoặc chạy định kỳ (bot, webhook ngân hàng, phát hành hóa đơn, nhắc việc, sao lưu) thì đặt ở Cloud Functions.

## Quy tắc
- Không đưa bí mật (token, mật khẩu, khóa API) vào mã hoặc chat. Dùng Firebase Secret Manager / GitHub Secrets.
- Mọi thay đổi luật hoặc hàm phải kèm test, cả trường hợp "được" lẫn "bị chặn". `npm test` phải xanh trước khi commit.
- Tính tiền: `src/lib/billing.ts` và `functions/billing.js` phải luôn khớp nhau (có test so khớp). Server luôn tính lại, không tin số tiền từ trình duyệt.
- Dữ liệu cá nhân (CCCD, ảnh giấy tờ) chỉ chủ/quản lý xem. Dữ liệu công khai (`listings`) tách riêng, không chứa thông tin người thuê.
- Mọi tài liệu nghiệp vụ có `propertyId`; quyền nhân viên giới hạn theo khu (`users.props`).
- Mô-đun Cloud Functions viết dạng factory nhận phụ thuộc (`createX({db, tg, ...})`) để dễ test.
- Ngày theo giờ Việt Nam, lưu `YYYY-MM-DD`; kỳ hóa đơn `YYYY-MM`; tiền là số nguyên VNĐ. Không dùng `toISOString().slice(0,10)`.
- Thông báo / việc chạy định kỳ phải idempotent (khóa `tgSent/...`).
- Chuỗi giao diện đặt trong `i18n/` (tiếng Việt bắt buộc, tiếng Anh khi có).
- Báo cáo sau mỗi việc: đã làm gì, đã kiểm tra gì, còn giới hạn gì.
