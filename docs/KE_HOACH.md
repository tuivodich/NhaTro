# Kế hoạch dự án NhaTro — Quản lý nhà trọ (Web + Telegram Bot + App di động)

> Cập nhật: 01/11/2026

## 1. Khảo sát dự án mã nguồn mở có thể tận dụng

### 1.1. Nền tảng quản lý cho thuê (đánh giá để fork hoặc tham khảo)

| Dự án | Sao | Giấy phép | Công nghệ | Hoạt động gần nhất | Nhận xét |
|---|---|---|---|---|---|
| [microrealestate/microrealestate](https://github.com/microrealestate/microrealestate) | ~1.2k | MIT | TypeScript, Node.js, Next.js, MongoDB, Docker | 10/2026 | Trưởng thành nhất: tài sản, hợp đồng, tiền thuê, biên lai, cổng cho người thuê, đa ngôn ngữ. Kiến trúc microservice, phần lớn hướng tới thuê nhà kiểu phương Tây (theo hợp đồng/tháng), không có tính điện nước theo chỉ số. |
| [senatroxx/OpenKos](https://github.com/senatroxx/OpenKos) | ~117 | Apache-2.0 | Laravel (PHP 8.4) + React, PostgreSQL | 10/2026 | Làm riêng cho "kos" (nhà trọ Indonesia) — rất gần mô hình nhà trọ VN: phòng, hợp đồng, nhiều người ở/phòng, hóa đơn, minh chứng thanh toán, nhắc nợ qua WhatsApp, phiếu bảo trì, có kiến trúc plugin. Đang ở giai đoạn alpha. |
| [clawnify/OpenProperty](https://github.com/clawnify/OpenProperty) | ~28 | MIT | TypeScript, Cloudflare Workers + D1 | 10/2026 | Nhẹ, có sổ thu tiền thuê; nhỏ, phù hợp để tham khảo. |
| [PlotiHub/Plotihub-App](https://github.com/PlotiHub/Plotihub-App) | — | MIT | Django + PostgreSQL | — | Quản lý nhà cho thuê ở Kenya (mô hình gần giống nhà trọ). |

### 1.2. Dự án Việt Nam (chủ yếu tham khảo nghiệp vụ / giao diện)

| Dự án | Giấy phép | Ghi chú |
|---|---|---|
| [chauminhtrung/RRMS](https://github.com/chauminhtrung/RRMS) | Không có | Hệ thống quản lý nhà trọ (JS). |
| [NguyenDuy04/rentflow](https://github.com/NguyenDuy04/rentflow) | MIT | MVP: phòng, người thuê, **chỉ số điện nước, hóa đơn** (Python). Đúng nghiệp vụ VN, có thể tham khảo cách tính tiền. |
| [azmedia2006/quan-ly-phong-tro-v1](https://github.com/azmedia2006/quan-ly-phong-tro-v1) | Không có | Quản lý phòng trọ (PHP). |
| [tanhdmt/PHONGTROVIET](https://github.com/tanhdmt/PHONGTROVIET) | — | Quản lý & tìm kiếm nhà trọ (PHP, cũ — 2017). |
| [thaivietha/HostelManagement](https://github.com/thaivietha) | — | Quản lý nhà trọ, tra cứu và thanh toán hóa đơn (Laravel Blade). |

> ⚠️ Repo **không có giấy phép** thì mặc định *không được phép* sao chép mã — chỉ nên xem để tham khảo ý tưởng.

### 1.3. Thư viện dùng được cho bối cảnh Việt Nam

| Thư viện | Giấy phép | Dùng để |
|---|---|---|
| [xuannghia/vietnam-qr-pay](https://github.com/xuannghia/vietnam-qr-pay) | MIT | Tạo/đọc mã **VietQR** (chuyển khoản ngân hàng, Momo, ZaloPay) — in lên hóa đơn để người thuê quét trả tiền. |
| [payOSHQ/payos-lib-node](https://github.com/payOSHQ/payos-lib-node) | MIT | Cổng **payOS**: tạo link thanh toán, webhook xác nhận tự động. |
| SePay ([datlechin/sepay-php](https://github.com/datlechin/sepay-php), [sepayvn/laravel-sepay](https://github.com/sepayvn/laravel-sepay)) | MIT | Webhook **biến động số dư** → tự động gạch nợ khi người thuê chuyển khoản đúng nội dung. |
| [kentzu213/telegram-shop-bot](https://github.com/kentzu213/telegram-shop-bot) | MIT | Ví dụ bot Telegram + VietQR (tham khảo luồng thanh toán qua bot). |
| grammY (Node) / aiogram (Python) | MIT | Framework viết bot Telegram. |
| Quét QR trên CCCD gắn chip | — | Mã QR trên CCCD chứa chuỗi `Số CCCD|Số CMND cũ|Họ tên|Ngày sinh|Giới tính|Địa chỉ|Ngày cấp` — quét bằng camera (vd. `expo-camera`, `zxing`) và tách theo dấu `|` để tự điền thông tin người thuê. |

### 1.4. Kết luận / Khuyến nghị

**Không nên fork nguyên một dự án**, mà **tự xây dựng** và **tham khảo** có chọn lọc, vì:
- MicroRealEstate mạnh nhưng nghiệp vụ là thuê nhà phương Tây, dùng MongoDB + microservice — sửa sang mô hình nhà trọ VN (điện nước theo chỉ số, nhiều người/phòng, tạm trú) tốn công ngang viết mới.
- OpenKos rất sát nghiệp vụ nhưng là PHP/Laravel, đang alpha (có thể thay đổi lớn).
- Ba nền tảng (Web + Bot + Mobile) nên dùng chung một API và một ngôn ngữ để một người/nhóm nhỏ dễ bảo trì.

Cách tận dụng:
- **Mô hình dữ liệu & luồng nghiệp vụ**: tham khảo OpenKos (hợp đồng nhiều người thuê, hóa đơn, nhắc nợ, bảo trì) và rentflow (chỉ số điện nước).
- **Cổng cho người thuê, biên lai, cấu trúc đa ngôn ngữ**: tham khảo MicroRealEstate (MIT — được phép tái sử dụng mã nếu giữ thông báo bản quyền).
- **Thanh toán**: dùng trực tiếp vietnam-qr-pay + payOS/SePay.

## 2. Kiến trúc đề xuất

```
                 ┌──────────────┐   ┌───────────────┐   ┌─────────────────┐
                 │  Web (Next.js)│   │ Telegram Bot  │   │ App di động     │
                 │  chủ trọ/QL   │   │ (grammY)      │   │ (Expo/React N.) │
                 └──────┬───────┘   └──────┬────────┘   └───────┬─────────┘
                        └──────────────────┼────────────────────┘
                                           ▼
                              ┌─────────────────────────┐
                              │ API Backend (NestJS)    │──► Webhook payOS / SePay
                              │ REST + Auth (JWT)       │──► Hàng đợi việc nền (BullMQ)
                              └──────┬───────────┬──────┘      (tạo hóa đơn, nhắc nợ)
                                     ▼           ▼
                              PostgreSQL     Lưu trữ ảnh (S3/MinIO/R2)
                              (Prisma ORM)   Redis
```

**Stack (toàn bộ TypeScript, monorepo pnpm + Turborepo):**

| Thành phần | Công nghệ |
|---|---|
| Backend API | NestJS (hoặc Fastify) + Prisma + PostgreSQL |
| Web quản trị | Next.js + Tailwind + shadcn/ui, TanStack Query |
| Bot Telegram | grammY, chạy webhook, gọi chung API |
| App di động | Expo (React Native) — Android + iOS từ một mã nguồn |
| Hàng đợi / lịch | Redis + BullMQ (tạo hóa đơn đầu tháng, nhắc nợ) |
| Ảnh / tài liệu | S3 tương thích (MinIO tự host, Cloudflare R2) |
| Xuất file | PDF hóa đơn/hợp đồng (Puppeteer hoặc @react-pdf), Excel (exceljs) |
| Triển khai | Docker Compose trên VPS; CI GitHub Actions |

```
nhatro/
├── apps/
│   ├── api/        # NestJS
│   ├── web/        # Next.js
│   ├── bot/        # Telegram bot
│   └── mobile/     # Expo
├── packages/
│   ├── db/         # Prisma schema + migrations
│   ├── shared/     # types, zod schema, hàm tính tiền dùng chung
│   └── ui/         # component dùng chung (tuỳ chọn)
└── docker-compose.yml
```

## 3. Mô hình dữ liệu (bản nháp)

- **User** — tài khoản đăng nhập; vai trò: `OWNER` (chủ trọ), `MANAGER` (quản lý), `TENANT` (người thuê); `telegramChatId`.
- **Property** (khu/nhà trọ) — tên, địa chỉ, ảnh, chủ sở hữu, cấu hình giá điện/nước mặc định, tài khoản ngân hàng nhận tiền.
- **Room** (phòng) — số phòng, tầng, diện tích, giá thuê, số người tối đa, trạng thái (`TRONG`, `DANG_THUE`, `DANG_SUA`), ảnh, tiện nghi.
- **Tenant** (người cư trú) — họ tên, ngày sinh, giới tính, **số CCCD**, ngày cấp, nơi cấp, quê quán/địa chỉ thường trú, SĐT, ảnh CCCD 2 mặt, ảnh chân dung, nghề nghiệp/nơi làm, người liên hệ khẩn cấp, **trạng thái đăng ký tạm trú**, biển số xe.
- **Contract** (hợp đồng) — phòng, người đại diện, danh sách người ở, ngày bắt đầu/kết thúc, giá thuê, **tiền cọc**, ngày chốt tiền, file hợp đồng scan.
- **Service** (dịch vụ) — điện (theo số), nước (theo khối hoặc theo người), internet, rác, gửi xe, vệ sinh… với đơn giá & cách tính (`THEO_CHI_SO`, `THEO_NGUOI`, `THEO_PHONG`, `CO_DINH`).
- **MeterReading** (chỉ số đồng hồ) — phòng, loại (điện/nước), kỳ (tháng), chỉ số cũ/mới, ảnh đồng hồ, người ghi.
- **Invoice** + **InvoiceItem** (hóa đơn) — kỳ, tiền phòng, từng dịch vụ, giảm trừ, phát sinh, tổng, trạng thái (`CHUA_THU`, `THU_MOT_PHAN`, `DA_THU`, `QUA_HAN`), mã VietQR, hạn thanh toán.
- **Payment** (thu tiền) — hóa đơn, số tiền, phương thức (tiền mặt/chuyển khoản/payOS), mã giao dịch, ảnh minh chứng, người xác nhận.
- **Transaction** (thu chi khác) — sửa chữa, mua sắm, tiền điện tổng EVN, thuế… gắn với khu trọ, có danh mục.
- **Deposit** (cọc) — nhận/hoàn/khấu trừ.
- **MaintenanceTicket** (báo hỏng) — phòng, mô tả, ảnh, trạng thái, chi phí.
- **AuditLog** — ai xem/sửa gì (đặc biệt với dữ liệu CCCD).

**Công nợ** = tổng hóa đơn chưa thanh toán đủ theo phòng/người thuê — tính từ Invoice − Payment, không lưu riêng.

## 4. Chức năng theo nền tảng

### Web (chủ trọ / quản lý — đầy đủ nhất)
- Dashboard: tỷ lệ lấp đầy, doanh thu tháng, công nợ, phòng sắp hết hợp đồng.
- CRUD khu trọ, phòng (kèm thư viện ảnh), người thuê, hợp đồng, dịch vụ.
- Nhập chỉ số điện nước hàng loạt theo bảng → **tạo hóa đơn hàng loạt** → gửi qua Telegram/Zalo/in PDF.
- Thu tiền, gạch nợ, báo cáo thu chi theo tháng/năm, xuất Excel.
- Xuất danh sách người cư trú phục vụ khai báo tạm trú.
- Phân quyền nhiều người quản lý.

### Bot Telegram
- **Cho chủ trọ**: `/tongquan`, `/congno`, `/phongtrong`, nhập chỉ số nhanh (`/dien P101 1234`), nhận thông báo khi có tiền vào (webhook SePay/payOS), nhắc phòng sắp hết hợp đồng.
- **Cho người thuê** (liên kết tài khoản bằng mã mời/deep link): nhận hóa đơn hằng tháng kèm **ảnh VietQR**, xem lịch sử thanh toán, gửi ảnh minh chứng chuyển khoản, báo hỏng kèm ảnh.
- Lịch tự động: nhắc nộp tiền trước/đúng/sau hạn.

### App di động (Expo)
- Bản thu gọn cho chủ trọ khi đi thực địa: **chụp đồng hồ điện nước** để ghi chỉ số, chụp ảnh phòng.
- **Quét QR trên CCCD** để tự điền thông tin người thuê; chụp ảnh CCCD.
- Xem công nợ, xác nhận thu tiền mặt, nhận push notification.
- (Giai đoạn sau) Chế độ cho người thuê: xem hóa đơn, quét trả tiền, báo hỏng.

## 5. Lộ trình thực hiện

| Giai đoạn | Thời lượng ước tính* | Nội dung | Kết quả |
|---|---|---|---|
| **0. Chuẩn bị** | 1 tuần | Chốt yêu cầu chi tiết (số khu, số phòng, cách tính điện nước hiện tại, mẫu hóa đơn đang dùng); vẽ wireframe; dựng monorepo, CI, Docker Compose (Postgres, Redis, MinIO). | Repo khung chạy được |
| **1. Backend lõi** | 2–3 tuần | Prisma schema + migration; Auth (JWT, vai trò); API CRUD khu trọ/phòng/ảnh/người thuê/hợp đồng; upload ảnh; seed dữ liệu mẫu; test. | API + tài liệu Swagger |
| **2. Web MVP** | 3 tuần | Đăng nhập, dashboard, quản lý phòng & người thuê & hợp đồng; nhập chỉ số; tạo hóa đơn hàng loạt; in PDF có VietQR; ghi nhận thu tiền; báo cáo công nợ. | **Dùng thật được cho chủ trọ** |
| **3. Thu chi & báo cáo** | 1–2 tuần | Thu chi khác, cọc, báo cáo tháng/năm, biểu đồ, xuất Excel. | Quản lý doanh thu hoàn chỉnh |
| **4. Bot Telegram** | 2 tuần | Liên kết tài khoản; lệnh cho chủ trọ; gửi hóa đơn cho người thuê; nhắc nợ tự động (BullMQ); nhận minh chứng/báo hỏng. | Bot chạy webhook |
| **5. Thanh toán tự động** | 1 tuần | Tích hợp SePay hoặc payOS: nội dung chuyển khoản chứa mã hóa đơn → webhook tự gạch nợ → báo Telegram. | Giảm đối soát thủ công |
| **6. App di động** | 3–4 tuần | Expo app: đăng nhập, danh sách phòng, ghi chỉ số bằng camera, quét QR CCCD, công nợ, push notification; build Android (APK/Google Play) và iOS (TestFlight). | App lên store |
| **7. Hoàn thiện & vận hành** | liên tục | Sao lưu DB tự động, giám sát lỗi (Sentry), bảo mật, tối ưu, chế độ cho người thuê, (tuỳ chọn) Zalo OA, đa chủ trọ (SaaS). | Bản ổn định |

\* Ước tính cho 1 lập trình viên toàn thời gian; tổng khoảng 3–4 tháng cho bản đầy đủ. Có thể đưa vào dùng thật từ cuối giai đoạn 2 (~6–7 tuần).

## 6. Lưu ý pháp lý & bảo mật

- **Dữ liệu cá nhân (CCCD, ảnh, SĐT)** thuộc phạm vi Nghị định 13/2023/NĐ-CP và Luật Bảo vệ dữ liệu cá nhân (hiệu lực từ 01/01/2026): cần có sự đồng ý của người thuê (điều khoản trong hợp đồng), chỉ thu thập dữ liệu cần thiết, mã hoá số CCCD & ảnh, phân quyền xem, ghi log truy cập, xoá dữ liệu khi hết mục đích. Nên tham khảo ý kiến chuyên môn pháp lý trước khi vận hành dạng dịch vụ cho nhiều chủ trọ.
- **Đăng ký tạm trú**: hiện thực hiện qua VNeID/Cổng dịch vụ công — hệ thống chỉ nên hỗ trợ theo dõi trạng thái và xuất thông tin, không tự động nộp.
- **Giá điện cho người thuê trọ**: theo quy định của Bộ Công Thương/EVN, chủ trọ không được thu cao hơn giá quy định — nên có cảnh báo khi đơn giá cấu hình vượt mức.
- Không lưu token bot/khoá API trong mã nguồn (dùng biến môi trường), dùng HTTPS, sao lưu DB hằng ngày.

## 7. Việc cần làm tiếp theo

1. Chủ dự án xác nhận/điều chỉnh stack và danh sách chức năng ở mục 4.
2. Cung cấp mẫu hóa đơn, hợp đồng và cách tính tiền đang dùng.
3. Bắt đầu Giai đoạn 0: dựng monorepo + Docker Compose + Prisma schema đầu tiên.
