# Kế hoạch dự án NhaTro — Quản lý nhà trọ (Web + Bot Telegram + App điện thoại)

> Phiên bản 2 — 01/11/2026. Tổng hợp từ: (1) khảo sát dự án mã nguồn mở, (2) hệ thống **Nhà Gỗ Homestay** đã xây (`tuivodich/Home`, tài liệu bàn giao: [`docs/tham-khao/nha-go-homestay-handoff.md`](tham-khao/nha-go-homestay-handoff.md)).
>
> **Thay đổi so với phiên bản 1:** bỏ phương án NestJS + PostgreSQL + Expo. Chuyển sang **dùng lại nền tảng Nhà Gỗ** (React + Firebase), vì phần lớn hạ tầng khó nhất đã có sẵn, đã được kiểm thử và đang chạy thật.

---

## 1. Quyết định chính

| Hạng mục | Quyết định | Lý do |
|---|---|---|
| Nền tảng | **React 19 + Vite + TypeScript + Firebase** (Auth, Firestore, Storage, Hosting, Cloud Functions Node 22, Scheduler, FCM) — giống Nhà Gỗ | Dùng lại được khoảng 50–60% mã: phân quyền, bot, VietQR, webhook ngân hàng, khai báo lưu trú, sao lưu, nhật ký, CI/CD, i18n, các component nhập liệu. Chi phí ở quy mô nhà trọ gần như trong hạn mức miễn phí. |
| Kiến trúc | **Rules-as-backend**: `firestore.rules` là lớp phân quyền thật, mọi luật có test; Cloud Functions lo việc cần tin cậy / chạy định kỳ | Đã chứng minh hiệu quả ở Nhà Gỗ (~400 kiểm tra luật). |
| Bot Telegram | Dùng lại `functions/bot.js` (factory + tiêm phụ thuộc), đổi lệnh sang nghiệp vụ nhà trọ | Có sẵn liên kết tài khoản, chống spam, nút bấm, chống gửi trùng (`tgSent`), ghi nhật ký. |
| App điện thoại | **PWA trước → đóng gói Capacitor** (Android/iOS) từ chính mã React | Một mã nguồn cho cả web và app; Nhà Gỗ đã có PWA + FCM. Capacitor cho camera (chụp đồng hồ, quét QR CCCD) và thông báo đẩy gốc. Chỉ khi cần giao diện native nặng mới cân nhắc Expo. |
| Thanh toán | VietQR (đã có) + webhook SePay/Casso (`bankhook.js`, đã có) | Nội dung chuyển khoản `NT <mã hóa đơn>` → tự cộng tiền vào hóa đơn. |
| Ngôn ngữ giao diện | Tiếng Việt là chính; giữ hệ i18n để thêm tiếng Anh sau (người thuê nước ngoài) | Ít tốn công vì khung đã có. |

**Đánh đổi cần biết:** Firestore không phải CSDL quan hệ, nên báo cáo/công nợ được tổng hợp ở client hoặc trong hàm. Với quy mô vài chục đến vài trăm phòng thì ổn. Nếu sau này làm dạng SaaS cho hàng nghìn chủ trọ, cần bổ sung bảng tổng hợp (rollup) do Cloud Functions ghi, hoặc xuất sang BigQuery.

---

## 2. Khác biệt nghiệp vụ: Homestay → Nhà trọ

| Homestay (Nhà Gỗ) | Nhà trọ (NhaTro) | Ảnh hưởng |
|---|---|---|
| Đặt phòng theo **đêm** | **Hợp đồng theo tháng** (6–12 tháng), có tiền cọc | `bookings` → `contracts`; bỏ phần giá theo đêm/mùa/lễ |
| Giá tính một lần khi đặt | **Hóa đơn hằng tháng**: tiền phòng + điện nước theo **chỉ số** + dịch vụ (rác, mạng, xe…) | Viết `billing.ts` (thay `pricing.ts`), vẫn giữ mô hình *client tính, server tính lại và so khớp* |
| Khách ngắn ngày | **Người cư trú dài hạn**, nhiều người/phòng, đến/đi giữa chừng | `tenants` + danh sách người ở trong hợp đồng, lịch sử chuyển phòng |
| Một homestay | **Nhiều khu trọ** của một chủ | Thêm `propertyId` cho mọi tài liệu; luật kiểm tra quyền theo từng khu |
| Website bán phòng + đặt online | Trang công khai **phòng trống cho thuê** (ảnh, giá, liên hệ); đặt cọc giữ phòng là tùy chọn | Dùng lại landing + `busy` mirror thành `listings` |
| Dọn phòng, chấm công lễ tân | **Báo hỏng / sửa chữa**; nhân sự thường ít (chủ + 1–2 quản lý) | Dùng lại `housekeeping` thành phiếu sửa chữa; chấm công để tùy chọn |
| Công nợ ít | **Công nợ là trọng tâm**: nợ dồn tháng, thu một phần, khấu trừ cọc khi trả phòng | `invoices.paid` + `payLog[]` (dùng lại), báo cáo công nợ theo phòng/người |
| Khai báo lưu trú ngắn ngày | **Đăng ký tạm trú** (VNeID), theo dõi hạn tạm trú | Dùng lại `residence.ts` + thêm trạng thái/hạn tạm trú, cột giới tính |
| iCal, mã giảm giá, thành viên thân thiết, chủ đề lễ hội | Hầu như không cần | Để lại, không mang sang (trừ khung chủ đề nếu muốn) |

---

## 3. Bản đồ dùng lại từ Nhà Gỗ

### 3.1. Mang sang gần như nguyên vẹn
- `firestore.rules` (khung hàm trợ giúp vai trò) + `tests/rules.test.mjs` (khung `check(...)`)
- `src/lib/auth.tsx`, `firebase.ts`, `useCollection.ts`, `format.ts`, `dates.ts` (ngày giờ VN), `audit.ts`
- Component: `DateInput`, `NumInput`, `Dropdown`, `QrCode`, `CountrySelect`
- `src/StaffShell.tsx` (khung menu theo vai trò), `layout/SiteLayout.tsx`, hệ `i18n/`
- Functions: `telegram.js`, khung `bot.js` (phân biệt nhân viên/người thuê/vãng lai, liên kết bằng mã 30 phút, giới hạn tần suất), `bankhook.js` + `bankTx`, `backup.js`, `push.js` (FCM), `campaign.js` (email hàng loạt, tùy chọn), `sitemap.js`
- `public/sw.js`, manifest (PWA)
- `.github/workflows/` (test → chặn deploy; tách deploy hosting và functions; thử lại sau 2 phút)

### 3.2. Mang sang và chỉnh
| Nhà Gỗ | NhaTro |
|---|---|
| `rooms` | `rooms` + `propertyId`, tầng, diện tích, số người tối đa, tiện nghi, giá thuê, trạng thái `trong/dang_thue/dang_sua/giu_cho` |
| `guests` + `profiles` + ảnh giấy tờ | `tenants`: CCCD, ngày cấp, nơi cấp, quê quán, nghề nghiệp, SĐT, người liên hệ khẩn cấp, biển số xe, ảnh CCCD 2 mặt |
| `bookings` (vòng đời) | `contracts`: `nhap → hieu_luc → sap_het_han → da_thanh_ly` (hoặc `huy`); cọc, ngày chốt tiền, người ở |
| `pricing.ts` ↔ `functions/pricing.js` | `billing.ts` ↔ `functions/billing.js` (có test so khớp hai bản) |
| `report.ts` | doanh thu theo kỳ thu tiền, thu chi, lợi nhuận theo khu, **công nợ theo tuổi nợ**, tỷ lệ lấp đầy |
| `residence.ts` | danh sách tạm trú, cảnh báo hồ sơ thiếu / sắp hết hạn tạm trú; xuất CSV/in |
| `housekeeping` + `roomNotes` | `tickets` (báo hỏng: người thuê gửi qua bot/web, chủ giao việc, ghi chi phí → tự sinh khoản chi) |
| `expenses` | `transactions` (thu chi khác: sửa chữa, điện tổng EVN, nước tổng, mạng, thuế…) |
| `InvoicePage` (PDF bằng ảnh chụp) | Hóa đơn tháng **PDF dạng văn bản** (jsPDF + font tiếng Việt) kèm VietQR; in hàng loạt |
| `bookingSweep`, `tgReminders`, `tgDailyReport` | `billingSweep`, `tgReminders`, `tgDailyReport` (xem §6) |
| Landing + `busy` | Trang công khai "Phòng trống" từ `listings` (không có dữ liệu cá nhân) |

### 3.3. Không mang sang (giai đoạn đầu)
iCal, mã giảm giá, thành viên thân thiết, chủ đề Halloween/Noel/Tết, check-in online, cảm nhận khách, chấm công/xếp ca (để tùy chọn sau).

### 3.4. Sửa luôn các hạn chế đã biết của Nhà Gỗ
- Tên thương hiệu **không viết cứng**: đọc từ `settings/app` + một file `siteConfig.ts` duy nhất.
- PDF là văn bản thật, có lưu bản hóa đơn đã phát hành (snapshot) để không đổi khi đơn giá thay đổi.
- Đưa **e2e Playwright vào repo** ngay từ đầu.
- Khai báo tạm trú có cột giới tính.
- Nhật ký cho các thao tác nhạy cảm (sửa hóa đơn, xóa thu tiền, xem ảnh CCCD) **ghi phía server** (trigger Firestore) chứ không chỉ ở trình duyệt.

---

## 4. Mô hình dữ liệu Firestore

Quy ước giữ như Nhà Gỗ: ngày `YYYY-MM-DD` theo giờ VN; kỳ hóa đơn `YYYY-MM`; tiền là số nguyên VNĐ; mã hiển thị 6–8 ký tự chữ-số hoa.

| Bộ sưu tập | Nội dung chính | Ai đọc / ghi |
|---|---|---|
| `users/{uid}` | `name, email, phone, role, props: {pid: role}` | tự đọc; chủ cấp quyền |
| `properties/{pid}` | tên khu, địa chỉ, ảnh, chủ, tài khoản nhận tiền, ngày chốt tiền, hạn thanh toán, cấu hình dịch vụ mặc định | thành viên khu đọc; chủ ghi |
| `rooms/{id}` | `propertyId, code (P101), floor, area, rent, maxPeople, amenities[], photos[≤10], status` | nhân viên khu; người thuê đọc phòng mình |
| `listings/{roomId}` | bản sao công khai phòng trống: ảnh, giá, diện tích, tiện nghi (không có dữ liệu cá nhân) | **công khai đọc**; hàm/nhân viên đồng bộ |
| `tenants/{id}` | hồ sơ người cư trú; `uid?` nếu có tài khoản; `tamTru: {status, from, to}` | quản lý+ đọc/ghi; người thuê đọc của mình; **ảnh CCCD ở Storage `tenants/*`, chỉ quản lý+** |
| `contracts/{id}` | `propertyId, roomId, mainTenantId, occupants[{tenantId, from, to}], start, end, rent, deposit, billingDay, services[], status, files[]` | nhân viên khu; người thuê đọc hợp đồng của mình |
| `services/{id}` | điện, nước, rác, mạng, xe… `unit, price, mode: theo_chi_so / theo_nguoi / theo_phong / co_dinh`, bậc thang (tùy chọn) | chủ/quản lý |
| `meterReadings/{roomId_YYYY-MM_type}` | `old, new, photo, readBy, readAt` | nhân viên khu ghi; khóa sau khi hóa đơn phát hành |
| `invoices/{id}` | `code, propertyId, roomId, contractId, period, lines[] (snapshot đơn giá), carriedDebt, discount, total, paid, payLog[], status: nhap/da_gui/thu_mot_phan/da_thu/qua_han/huy, dueDate` | nhân viên khu; người thuê đọc của mình; chỉ chủ/quản lý sửa sau khi phát hành |
| `transactions/{id}` | thu chi khác theo khu, danh mục, chứng từ | chủ/quản lý |
| `tickets/{id}` | báo hỏng: phòng, mô tả, ảnh, trạng thái, chi phí | người thuê tạo cho phòng mình; nhân viên xử lý |
| `bankTx/{id}` | giao dịch từ webhook (dùng lại) | hàm ghi; chủ/quản lý gán tay |
| `auditLog/{id}` | dùng lại | như Nhà Gỗ |
| `settings/*` | `app, bank, bankhook, mail, audit, backup` | như Nhà Gỗ |
| `tgChats, tgTenants, fcmTokens`, *(server)* `tgLinks, tgSent, tgRate` | dùng lại, đổi `tgGuests` → `tgTenants` | như Nhà Gỗ |

**Công nợ** = Σ(`total − paid`) của hóa đơn chưa `da_thu`/`huy`, gom theo phòng/người thuê. Không lưu riêng, nhưng hóa đơn tháng mới ghi `carriedDebt` để in ra cho rõ.

### Vai trò
`owner` (chủ: toàn quyền, cấp quyền, tài khoản ngân hàng), `manager` (quản lý một/nhiều khu: mọi nghiệp vụ trừ cấp quyền chủ/ngân hàng), `staff` (ghi chỉ số, xử lý báo hỏng, xác nhận thu tiền mặt; **không xem ảnh CCCD**), `tenant` (người thuê: xem phòng/hợp đồng/hóa đơn của mình, báo hỏng). Mọi quyền nhân viên giới hạn theo `props[pid]`.

---

## 5. Logic nghiệp vụ cốt lõi

**Tính hóa đơn (`billing.ts` ↔ `functions/billing.js`):**
`tiền phòng` (chia theo ngày nếu vào/ra giữa tháng) + Σ dịch vụ:
`theo_chi_so` = (mới − cũ) × đơn giá (hoặc bậc thang) · `theo_nguoi` = số người ở trong kỳ × đơn giá · `theo_phong`/`co_dinh` = đơn giá
→ + phát sinh − giảm trừ → + nợ kỳ trước (chỉ hiển thị) → làm tròn nghìn. Các dòng lưu snapshot (`label`, `qty`, `price`, `amount`). Server tính lại khi phát hành; nếu lệch thì sửa và báo.

**Kiểm tra dữ liệu:** chỉ số mới < cũ (thay đồng hồ → cho nhập chỉ số đầu mới), mức dùng tăng bất thường (> 2× trung bình 3 tháng) → cảnh báo; đơn giá điện cấu hình vượt mức trần → cảnh báo.

**Vòng đời hợp đồng:** tạo (chọn phòng trống, người thuê, cọc) → `hieu_luc` (phòng `dang_thue`, `listings` gỡ) → 30 ngày trước hạn `sap_het_han` (nhắc) → gia hạn **hoặc** thanh lý: chốt chỉ số cuối → hóa đơn cuối → **khấu trừ cọc** (hoàn phần dư / ghi nợ phần thiếu) → phòng `trong` → `listings` hiện lại.

**Thu tiền:** `paid` + `payLog[]` (dương = thu, âm = hoàn; ghi phương thức, người thu). Webhook ngân hàng khớp `NT <mã>` thì tự cộng tiền (giao dịch Firestore, chống lặp bằng `bankTx`) và báo Telegram cho chủ + người thuê; giao dịch không khớp được để gán tay.

**Idempotent:** mọi việc chạy định kỳ và thông báo dùng khóa `tgSent/<loại>_<id>_<kỳ>` như Nhà Gỗ.

---

## 6. Cloud Functions

| Hàm | Loại | Việc |
|---|---|---|
| `telegramWebhook`, `tgLinkCode`, `tgTenantLink`, `tgSetup`, `tgNotify` | HTTP/callable | dùng lại |
| `issueInvoices` | callable | phát hành hóa đơn hàng loạt cho một khu/kỳ: tính lại phía server, sinh mã, gửi Telegram/email/FCM |
| `bankHook` | HTTP | dùng lại, đổi tiền tố `NT` và đích là `invoices` |
| `billingSweep` | schedule (hằng ngày 07:00) | đánh `qua_han`; tạo **hóa đơn nháp** đúng ngày chốt của từng khu; cập nhật `sap_het_han`; đồng bộ `listings` |
| `tgReminders` | schedule (08:00, 19:00) | nhắc ghi chỉ số trước ngày chốt; nhắc người thuê trước/đúng/sau hạn; hợp đồng sắp hết hạn; tạm trú sắp hết hạn / thiếu hồ sơ; báo hỏng tồn đọng |
| `tgDailyReport` | schedule (21:00) | tiền vào hôm nay, công nợ, phòng trống, việc tồn |
| `auditSensitive` | Firestore trigger | ghi nhật ký phía server khi sửa/xóa hóa đơn, thu tiền, hồ sơ người thuê |
| `backupNow/List/Get`, `backupScheduled` | dùng lại |
| `sitemap` | dùng lại (trang phòng trống) |

Secrets giữ như cũ: `TELEGRAM_BOT_TOKEN`, `SMTP_USER`, `SMTP_PASS` (Secret Manager); mã webhook trong `settings/bankhook` (chỉ chủ đọc).

---

## 7. Chức năng theo nền tảng

### Web quản trị (`/app`) — chủ/quản lý
- **Tổng quan:** phòng trống/đang thuê, doanh thu tháng, công nợ, hợp đồng sắp hết hạn, báo hỏng mở.
- **Khu trọ & phòng:** sơ đồ phòng theo tầng (màu theo trạng thái/nợ), ảnh, tiện nghi.
- **Người cư trú:** hồ sơ, ảnh CCCD, lịch sử ở, trạng thái tạm trú; xuất danh sách tạm trú.
- **Hợp đồng:** tạo/gia hạn/thanh lý, in hợp đồng từ mẫu, cọc.
- **Chốt điện nước:** bảng nhập nhanh cả tầng (Tab/Enter như Excel), kèm ảnh đồng hồ.
- **Hóa đơn:** tạo nháp → kiểm tra → phát hành hàng loạt → gửi/in PDF có VietQR; thu tiền; nợ dồn.
- **Thu chi & báo cáo:** thu chi khác, lợi nhuận theo khu/tháng/năm, công nợ theo tuổi nợ, xuất Excel.
- **Báo hỏng**, **nhật ký**, **sao lưu**, **cài đặt** (đơn giá, ngân hàng, bot, email), **phân quyền**.

### Trang công khai
Danh sách phòng trống (ảnh, giá, diện tích, tiện nghi, bản đồ), trang chi tiết phòng, nút liên hệ Zalo/điện thoại/Telegram, nội quy. *(Đặt cọc giữ phòng online: giai đoạn sau.)*

### Cổng người thuê (web/app, đăng nhập Google/SĐT)
Hóa đơn + mã VietQR, lịch sử thanh toán, hợp đồng, báo hỏng kèm ảnh, liên kết Telegram.

### Bot Telegram
- **Chủ/quản lý:** `/tongquan`, `/phongtrong`, `/congno [khu]`, `/dien P101 1234`, `/nuoc P101 56`, `/hoadon P101`, `/thu P101 3000000`, `/baohong`, `/baocao`. Tin tự động: tiền vào, quá hạn, sắp hết hợp đồng, báo hỏng mới, báo cáo 21:00. Nút: 💰 Đã thu tiền mặt · 🧾 Gửi lại hóa đơn · 🔧 Nhận việc / ✅ Đã sửa.
- **Người thuê:** nhận hóa đơn tháng (ảnh VietQR + nút xem chi tiết), `/hoadon`, `/lichsu`, `/hopdong`, `/baohong` (gửi ảnh), gửi ảnh chứng từ chuyển khoản.
- **Khách vãng lai:** `/phongtrong`, `/gia`, `/diachi`, `/lienhe` (giới hạn tần suất như Nhà Gỗ).

### App điện thoại (PWA → Capacitor)
Cùng mã React, giao diện tối ưu cho điện thoại cho các việc tại chỗ:
- **Chụp đồng hồ** điện/nước → nhập chỉ số (giai đoạn sau: OCR gợi ý số).
- **Quét QR trên CCCD** gắn chip → tự điền hồ sơ (chuỗi `CCCD|CMND cũ|Họ tên|Ngày sinh|Giới tính|Địa chỉ|Ngày cấp`) + chụp 2 mặt.
- Xác nhận thu tiền mặt, xem công nợ, xử lý báo hỏng, nhận thông báo đẩy (FCM).
- Phát hành: APK/Google Play trước; iOS (TestFlight/App Store) cần tài khoản Apple Developer.

---

## 8. Lộ trình thực hiện

Theo đúng cách làm của Nhà Gỗ: mỗi giai đoạn chia thành các PR nhỏ; luật/hàm mới phải có test; CI xanh mới merge.

| GĐ | Thời lượng* | Nội dung | Dùng lại từ Nhà Gỗ |
|---|---|---|---|
| **0. Khởi tạo** | 3–5 ngày | Tạo project Firebase (Blaze), nhận mã nguồn Nhà Gỗ vào repo (bỏ phần không dùng), đổi tên/cấu hình thương hiệu động, CI/CD, emulator, Playwright | khung repo, CI, test |
| **1. Nền tảng & dữ liệu** | 1–2 tuần | Vai trò + `props` theo khu; `properties`, `rooms` (ảnh), `tenants` (CCCD, ảnh), luật + test; menu quản trị | auth, rules, StaffShell, Guests |
| **2. Hợp đồng** | 1 tuần | Vòng đời hợp đồng, cọc, người ở, sơ đồ phòng, mẫu in hợp đồng | vòng đời bookings |
| **3. Điện nước & hóa đơn** ⭐ | 2 tuần | `services`, `meterReadings`, `billing.ts`+`billing.js` (test so khớp), hóa đơn nháp → phát hành, PDF + VietQR, thu tiền, công nợ | pricing (mô hình), QrCode, payLog |
| **4. Thu chi & báo cáo** | 1 tuần | `transactions`, báo cáo lợi nhuận/công nợ/lấp đầy, xuất Excel | report.ts, expenses |
| → **Bắt đầu dùng thật** (~6 tuần) | | | |
| **5. Bot Telegram** | 1–1,5 tuần | Đổi lệnh/nút sang nhà trọ, liên kết người thuê, gửi hóa đơn, nhắc nợ, báo cáo ngày | bot.js gần như toàn bộ |
| **6. Tự động hóa** | 1 tuần | `bankHook` cho hóa đơn, `billingSweep`, nhắc hợp đồng/tạm trú, nhật ký phía server, sao lưu | bankhook, backup, sweep |
| **7. Cổng người thuê & báo hỏng** | 1 tuần | Đăng nhập người thuê, xem hóa đơn/hợp đồng, tickets | khu khách hàng |
| **8. App điện thoại** | 2 tuần | PWA hoàn chỉnh → Capacitor: camera chụp đồng hồ, quét QR CCCD, push; build Android, rồi iOS | sw.js, push.js |
| **9. Trang công khai** | 3–5 ngày | `listings`, trang phòng trống, sitemap | landing, busy, sitemap |
| **10. Mở rộng** | tùy chọn | OCR đồng hồ, Zalo OA, ký hợp đồng điện tử, đặt cọc online, tiếng Anh, nhiều chủ trọ (SaaS) | — |

\* Ước tính cho 1 người làm cùng AI theo nhịp như Nhà Gỗ; tổng khoảng **2,5–3 tháng** (ngắn hơn phiên bản 1 khoảng 1 tháng nhờ dùng lại).

---

## 9. Kiểm thử & quy tắc làm việc

- `npm run test:lib`: `billing`, `report`, `residence`, `dates`… (test thuần). **Bắt buộc có test so khớp `billing.ts` ↔ `functions/billing.js`.**
- `npm run test:emu`: luật Firestore (mỗi quyền phải có cả trường hợp "được" và "bị chặn", đặc biệt: người thuê không đọc được phòng/hóa đơn người khác; `staff` không đọc được ảnh CCCD; nhân viên khu A không đụng được khu B) + test Cloud Functions.
- `npm run test:e2e`: Playwright, có trong repo, chạy với emulator.
- CI: PR chạy `npm test`; deploy hosting/rules và functions tách riêng; lỗi thì chặn deploy.
- Quy tắc kế thừa: không đưa bí mật vào mã; mô-đun functions viết dạng factory nhận phụ thuộc; ngày theo giờ VN (không dùng `toISOString().slice(0,10)`); ô số dùng `NumInput`; `money()` vs `moneyText`; thông báo idempotent.

---

## 10. Pháp lý & bảo mật

- **Dữ liệu cá nhân (CCCD, ảnh, SĐT)**: tuân thủ Nghị định 13/2023/NĐ-CP và Luật Bảo vệ dữ liệu cá nhân (hiệu lực 01/01/2026). Cần: điều khoản đồng ý trong hợp đồng; chỉ thu thập dữ liệu cần thiết; ảnh CCCD chỉ chủ/quản lý xem (luật Storage); ghi nhật ký truy cập; xóa/ẩn danh khi thanh lý quá thời hạn lưu giữ. Nên hỏi ý kiến pháp lý trước khi cung cấp cho nhiều chủ trọ.
- **Tạm trú**: thực hiện trên VNeID/Cổng dịch vụ công. Hệ thống chỉ theo dõi và xuất danh sách, không tự nộp.
- **Giá điện/nước cho người thuê**: theo quy định hiện hành, không được thu vượt mức giá quy định. Hệ thống cảnh báo khi đơn giá cấu hình vượt trần.
- Hóa đơn đã phát hành không sửa trực tiếp: điều chỉnh bằng dòng phát sinh/giảm trừ hoặc hủy rồi phát hành lại, có ghi nhật ký.

---

## 11. Phụ lục — Khảo sát mã nguồn mở (phiên bản 1, tóm tắt)

| Dự án | Giấy phép | Dùng cho |
|---|---|---|
| [microrealestate/microrealestate](https://github.com/microrealestate/microrealestate) | MIT | Tham khảo cổng người thuê, biên lai, hợp đồng |
| [senatroxx/OpenKos](https://github.com/senatroxx/OpenKos) | Apache-2.0 | Tham khảo nghiệp vụ nhà trọ: nhiều người/phòng, hóa đơn, minh chứng thanh toán, nhắc nợ, bảo trì |
| [NguyenDuy04/rentflow](https://github.com/NguyenDuy04/rentflow) | MIT | Tham khảo tính điện nước theo chỉ số |
| [clawnify/OpenProperty](https://github.com/clawnify/OpenProperty), [PlotiHub](https://github.com/PlotiHub/Plotihub-App) | MIT | Tham khảo |
| [chauminhtrung/RRMS](https://github.com/chauminhtrung/RRMS), [azmedia2006/quan-ly-phong-tro-v1](https://github.com/azmedia2006/quan-ly-phong-tro-v1) | Không có giấy phép | Chỉ xem ý tưởng, **không chép mã** |
| [xuannghia/vietnam-qr-pay](https://github.com/xuannghia/vietnam-qr-pay) | MIT | Tạo/đọc VietQR (nếu cần thay thế bản đang dùng) |
| [payOSHQ/payos-lib-node](https://github.com/payOSHQ/payos-lib-node), SePay/Casso | MIT | Cổng thanh toán / webhook biến động số dư |

Kết luận vẫn giữ: không fork các dự án này. Nền tảng chính là **mã Nhà Gỗ của chính bạn**; các dự án trên chỉ dùng để tham khảo nghiệp vụ.

---

## 12. Tiến độ (01/11/2026)

Đã làm xong (gộp giai đoạn 0–7 và 9, ở mức bản đầu):
- Khung dự án kế thừa Nhà Gỗ, cấu hình project `vnhatro` / trang `nhatroviet`, CI/CD (test → deploy).
- Luật Firestore/Storage theo khu + 112 kiểm tra; `billing.ts` ↔ `billing.js` + test so khớp; báo cáo, CCCD.
- Cloud Functions: bot Telegram nhà trọ, phát hành hóa đơn (server tính lại, khóa chỉ số), mã mời người thuê, webhook ngân hàng `NHATRO <mã>`, nhắc việc 08:00, báo cáo 21:00, sao lưu 02:00 — 18 test.
- Web: tổng quan, khu & dịch vụ, phòng (ảnh, công khai), người cư trú (quét QR CCCD, ảnh giấy tờ, tạm trú), hợp đồng (thanh lý trừ cọc, in mẫu), điện nước, hóa đơn & thu tiền, thu chi & báo cáo, báo hỏng, đối soát ngân hàng, phân quyền, nhật ký, cài đặt; trang phòng trống công khai; cổng người thuê; hóa đơn in/PDF có VietQR; PWA.
- Test trình duyệt toàn luồng (`tests/e2e.mjs`, 15 kiểm tra).

Còn lại: đóng gói Capacitor lên store, OCR đồng hồ, Zalo, ký hợp đồng điện tử, tiếng Anh, mẫu hóa đơn/hợp đồng theo ý chủ nhà.

## 13. Việc cần làm ngay

1. **Gắn repo `tuivodich/Home` vào phiên làm việc** để AI đọc và sao chép các mô-đun dùng lại (§3).
2. Chủ dự án cung cấp: số khu/số phòng, mẫu hóa đơn + hợp đồng đang dùng, cách tính điện nước (giá/kWh, nước theo khối hay theo người), ngày chốt và hạn thu tiền, ngân hàng nhận tiền.
3. Tạo project Firebase mới (gói Blaze) và bot Telegram mới (@BotFather). Bí mật **không** gửi qua chat, đặt trong Secret Manager / GitHub Secrets.
4. Bắt đầu **Giai đoạn 0**.
