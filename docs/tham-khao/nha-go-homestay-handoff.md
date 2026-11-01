# Nhà Gỗ Homestay — Tài liệu bàn giao dự án (cho AI / lập trình viên tiếp nhận)

> Mục đích: một file duy nhất để một AI hoặc người khác đọc xong là hiểu **dự án là gì, được xây thế nào, chạy ra sao, có những quy tắc gì**, và có thể **mang sang dự án khác**.
> Không chứa bí mật nào (token, mật khẩu). Các giá trị đặc thù của dự án gốc được ghi rõ để bạn thay thế.
> Mã nguồn gốc: GitHub `tuivodich/Home`. Các tài liệu chi tiết hơn trong repo: `README.md`, `docs/phan-quyen.md`, `docs/telegram-bot.md`, `docs/email.md`.

---

## 0. Tóm tắt nhanh (TL;DR)

**EN.** A complete homestay management system: public bilingual (VI/EN) marketing + booking website, customer portal, staff back office, and a Telegram bot. Frontend: React 19 + Vite + TypeScript + react-router 7. Backend: Firebase (Auth, Firestore, Storage, Hosting, Cloud Functions gen2 on Node 22, Scheduler, FCM). **Firestore Security Rules are the real backend/authorization layer** (the browser talks to Firestore directly); Cloud Functions handle everything that needs trust or schedules (Telegram bot, email, price verification, iCal, bank webhook, backups, sitemap). Tests: node unit tests, Firestore-rules tests with the emulator, Cloud Functions tests with the emulator, and a Playwright e2e (kept outside the repo). CI/CD: GitHub Actions run the tests then deploy hosting + rules, and functions separately.

**VI.** Hệ thống quản lý homestay trọn gói: website giới thiệu + đặt phòng (song ngữ Việt/Anh), cổng khách hàng, khu quản trị cho nhân viên, bot Telegram. Không có “server riêng”: **luật Firestore (`firestore.rules`) chính là lớp phân quyền**, trình duyệt đọc/ghi Firestore trực tiếp; Cloud Functions chỉ làm những việc cần tin cậy hoặc chạy định kỳ.

Quy mô: luật Firestore ~540 dòng, 23 hàm Cloud Functions, ~37 route (12 công khai + 25 khu quản trị), ~400 kiểm tra luật + 95 test functions + 29 test thư viện (+ ~290 kiểm tra e2e trình duyệt).

---

## 1. Sản phẩm làm gì

**Khách (không cần đăng nhập):** xem giới thiệu, phòng, tiện nghi, lịch phòng trống theo ngày, trang chi tiết từng phòng (`/phong/:id`), cảm nhận khách, Hỏi & Đáp, Nội quy & Quy định, Chính sách quyền riêng tư, Điểm tham quan đẹp, Sơ đồ trang web.

**Khách (đăng nhập Google/email):** gửi yêu cầu đặt phòng (giá tính tự động, mã giảm giá, dịch vụ đi kèm, đặt cọc kèm mã VietQR), xem/hủy đặt phòng của mình, thanh toán cọc, check-in online (khai thông tin giấy tờ trước), xem hóa đơn + tải PDF, mã QR nhận phòng, hạng thành viên thân thiết + mã giảm giá riêng, gửi cảm nhận (mỗi tài khoản một cảm nhận), nhận thông báo qua Telegram/email, xin trả phòng sớm.

**Nhân viên (`/app`):** lịch phòng, đặt phòng (tạo, xác nhận, nhận/trả phòng, hủy, khách không đến, sửa giá, thu/hoàn tiền), khách lưu trú (hồ sơ + ảnh giấy tờ), khai báo lưu trú (xuất CSV/in), dọn phòng (danh sách kiểm tra, việc định kỳ, ghi chú nội bộ), khóa phòng theo ngày, đồng bộ lịch iCal (Airbnb/Booking…), đối soát chuyển khoản tự động, báo cáo doanh thu, chi phí & công nợ, thành viên thân thiết, mã giảm giá, email hàng loạt, chấm công + xếp ca, nhật ký hoạt động, sao lưu, quản lý nội dung (FAQ, nội quy, quyền riêng tư, duyệt cảm nhận), cài đặt (giao diện, ngôn ngữ, liên hệ, tỷ giá…).

**Bot Telegram:** khách hỏi phòng trống/giá/chính sách/địa chỉ/tra mã đặt phòng (song ngữ); nhân viên nhận thông báo yêu cầu mới có nút Xác nhận/Từ chối, nhắc cọc, cảnh báo chấm công, báo cáo cuối ngày, tạo đặt phòng nhanh, doanh thu…

---

## 2. Kiến trúc

```
Trình duyệt (React SPA)
   │  đọc/ghi trực tiếp, kiểm soát bởi firestore.rules + storage.rules
   ├──► Firebase Auth (Google, email/mật khẩu)
   ├──► Firestore (dữ liệu chính, realtime onSnapshot)
   ├──► Storage (ảnh phòng, ảnh giấy tờ khách)
   └──► Cloud Functions (httpsCallable: tgNotify, guestNotify, icalSyncNow, mailCampaign…)

Cloud Functions gen2 (Node 22, us-central1)
   ├── HTTP: telegramWebhook, ical (/ical/<phòng>.ics), bankHook, sitemap (/sitemap.xml)
   ├── Callable: tg*, guestNotify, mail*, loyaltyClaim, backup*, icalSyncNow
   └── Scheduler: bookingSweep, tgStaffAlerts, tgReminders, tgDailyReport, backupScheduled, icalSync

Firebase Hosting (site "nhago") ── rewrite /sitemap.xml, /ical/** → functions; còn lại → index.html (SPA)
GitHub Actions: test.yml (PR), deploy.yml (hosting+rules+storage), deploy-functions.yml
```

Nguyên tắc cốt lõi:
1. **Rules-as-backend.** Mọi quyền (ai đọc/ghi gì, trường nào được đổi, trạng thái nào được chuyển) nằm ở `firestore.rules`, có test riêng. Giao diện chỉ ẩn nút cho tiện; không được tin giao diện.
2. **Dữ liệu công khai tách riêng dữ liệu cá nhân.** Website công khai chỉ đọc `busy/{id}` (phòng + ngày + trạng thái, không tên khách) để hiện lịch trống; `bookings` chứa dữ liệu cá nhân, chỉ chủ đặt phòng + nhân viên đọc.
3. **Không tin giá từ trình duyệt.** Khách tự tính giá ở client; Cloud Function `verifyBooking` tính lại bằng bản JS của cùng thuật toán (`functions/pricing.js` ↔ `src/lib/pricing.ts`, có test so khớp) và sửa nếu lệch.
4. **Việc cần tin cậy / chạy nền → Cloud Functions** (bot, email, SMTP, FCM, iCal, webhook ngân hàng, sao lưu, nhắc việc). Secrets đặt ở Firebase Secret Manager (`TELEGRAM_BOT_TOKEN`, `SMTP_USER`, `SMTP_PASS`); các mã bí mật khác (iCal, webhook ngân hàng) lưu trong Firestore chỉ chủ/quản lý đọc.
5. **Ghi một lần, an toàn khi chạy lặp:** các thông báo tự động dùng `tgSent/<khóa>` (`create()` thất bại nếu đã tồn tại) để không gửi trùng.

Stack: React 19, Vite, TypeScript, react-router-dom 7, `firebase` (modular SDK), `qrcode`, `html2canvas` + `jspdf` (PDF, nạp động), không dùng UI framework hay state manager — chỉ hook + Context + CSS tự viết (`src/styles.css` cho khu quản trị, `src/landing/landing.css` cho website công khai).

---

## 3. Cấu trúc thư mục

```
index.html, vite.config.ts, tsconfig.json, package.json
firebase.json            hosting (site, rewrites), firestore/storage rules, functions (Node 22)
firestore.rules          LUẬT PHÂN QUYỀN (~540 dòng, dòng dài) — trung tâm của hệ thống
storage.rules            `rooms/*` ảnh phòng (công khai đọc, admin ghi), `guests/*` ảnh giấy tờ (lễ tân+ đọc/ghi, admin xóa)
public/                  favicon, manifest, sw.js (thông báo đẩy), robots.txt
src/
  main.tsx, App.tsx      định tuyến (xem §8)
  StaffShell.tsx         khung khu quản trị: menu, route con theo vai trò, nhãn (Mới)
  lib/                   logic không UI: pricing.ts, report.ts, residence.ts, seasons.ts, theme.ts,
                         auth.tsx, firebase.ts, audit.ts, housekeeping.ts, loyalty.ts, blocks.ts,
                         useBusySync.ts, useCollection.ts, types.ts, format.ts, dates.ts, countries.ts…
  pages/                 mỗi trang một file (Bookings, Calendar, Guests, Rooms, PricingPage, ReportsPage,
                         IcalPage, BankSyncPage, AuditPage, HousekeepingPage, InvoicePage, Account…)
  components/            DateInput (gõ dd/mm/yyyy + lịch), NumInput, CountrySelect, Dropdown, QrCode…
  landing/               website công khai: Hero, Sections, Availability, BookingModal, CheckinModal,
                         PayPanel, forest.ts (cảnh SVG sinh bằng code), tetArt.ts, ForestScene.tsx, landing.css
  i18n/                  chuỗi Việt/Anh: index.tsx (khu quản trị), landing.ts, guest.ts, pricing.ts, hr.ts, explore.ts
  layout/SiteLayout.tsx  khung trang công khai (header, footer, đăng nhập, chủ đề)
functions/
  index.js               đăng ký toàn bộ hàm (HTTP, callable, schedule) + secrets
  bot.js                 bot Telegram (createBot nhận db/tg/guest/push được tiêm vào → dễ test)
  guest.js               thông báo khách (email/Telegram), kiểm giá, dọn đặt phòng treo, nhắc lịch, xin đánh giá
  pricing.js             bản JS của thuật toán giá
  ical.js, bankhook.js   iCal xuất/nhập, webhook ngân hàng
  campaign.js, loyalty.js, push.js, backup.js, sitemap.js, site.js, telegram.js
  test/*.test.js         test chạy với Firestore Emulator (node:test)
tests/rules.test.mjs     ~400 kiểm tra luật Firestore (@firebase/rules-unit-testing, có package.json riêng)
scripts/*.test.mts       test thuần cho thư viện (pricing, report, residence, dates, seasons, countries)
docs/                    phan-quyen.md, telegram-bot.md, email.md, PROJECT-HANDOFF.md
.github/workflows/       test.yml, deploy.yml, deploy-functions.yml
```

---

## 4. Mô hình dữ liệu Firestore

Quy ước: ngày lưu dạng chuỗi `YYYY-MM-DD` (giờ Việt Nam khi tính); tiền là số nguyên VNĐ; id đặt phòng là id tài liệu, mã hiển thị `code` = 8 ký tự chữ-số hoa.

| Bộ sưu tập | Nội dung chính | Ai đọc / ghi (tóm tắt) |
|---|---|---|
| `users/{uid}` | `{name,email,role}` | tự đọc; chủ/quản lý đọc tất cả; chỉ chủ cấp vai trò quản lý/chủ |
| `profiles/{uid}` | hồ sơ khách (họ tên, giấy tờ…) | chính chủ; nhân viên lễ tân+ đọc |
| `rooms/{id}` | tên, loại, sức chứa, `baseGuests`, giá, ảnh (≤8), mô tả VN/EN, trạng thái | **công khai đọc**; admin ghi (rules kiểm tra từng trường) |
| `bookings/{id}` | khách, phòng, ngày, `status`, `total`, `deposit`, `paid`, `payLog[]`, `lines[]` (dòng giá VN/EN), `code`, `source`, `lang`, `createdBy`, `cancelReason`, `plannedCheckOut/earlyCheckout`, `earlyCheckoutRequest`… | chủ đặt phòng + nhân viên đọc; tạo/sửa theo trạng thái & vai trò (§5) |
| `busy/{id}` | bản sao công khai `{roomId,checkIn,checkOut,status}`; `busy/blk_<id>` cho khóa phòng | **công khai đọc**; nhân viên đồng bộ (client + hàm `bookingSweep`) |
| `pend/{uid_n}` | “khe giữ chỗ” giới hạn số yêu cầu chờ mỗi tài khoản (`maxPending`) | tạo cùng lúc với đặt phòng (kiểm bằng `getAfter` trong rules) |
| `coupons/{code}` | mã giảm giá dùng 1 lần | tạo bởi admin; dùng nguyên tử cùng booking |
| `guests/{id}`, `precheckins/{bookingId}` | hồ sơ khách lưu trú; khách check-in online | nhân viên / khách của mình |
| `members/{uid}` | hạng thành viên đặt tay | chủ ghi |
| `reviews/{uid}` | cảm nhận (mỗi tài khoản 1), `status: pending/approved` | công khai đọc phần đã duyệt |
| `pages/{privacy,faq,rules}` | nội dung chủ/quản lý sửa trực tiếp trên trang | công khai đọc; admin ghi |
| `settings/*` | `app` (giao diện, ngôn ngữ mặc định, `maxPending`…), `contact`, `pricing`, `booking`, `bank`, `loyalty`, `mail`, `audit`, `housekeeping`, `ical`, `bankhook`, `backup`… | tùy tài liệu: công khai (contact, pricing, booking), admin, hoặc chỉ chủ (bank, bankhook); `mailState`/`icalState` chỉ hàm ghi |
| `roomBlocks/{id}` | khóa phòng theo ngày (`from,to,reason,source:"ical"?`) | lễ tân+ đọc; admin tạo/xóa |
| `roomStatus/{roomId}` | `ready/dirty/cleaning`, `done[]` (checklist), `tasks{}` (việc định kỳ) | mọi nhân viên |
| `roomNotes/{roomId}` | ghi chú nội bộ từng phòng | nhân viên |
| `expenses`, `shifts`, `schedule`, `attendance` | chi phí & công nợ; ca làm, lịch ca, chấm công | admin / từng nhân viên cho chính mình |
| `auditLog/{id}` | ai làm gì (`action,summary,by,role`) | nhân viên tạo (ràng buộc `by`, `at==request.time`, tôn trọng `settings/audit.enabled`); admin đọc; **chỉ chủ xóa** |
| `bankTx/{id}` | giao dịch ngân hàng từ webhook | hàm ghi; admin đọc & gán tay giao dịch chưa khớp |
| `tgChats`, `tgGuests`, `fcmTokens`, `mailCampaigns` | liên kết Telegram nhân viên/khách, token FCM, lịch sử email hàng loạt | hàm ghi; chủ sở hữu/admin đọc |
| *(chỉ server, rules mặc định chặn)* | `tgLinks` (mã liên kết 30 phút), `tgSent` (chống gửi trùng), `tgRate` (giới hạn tần suất), `tgPrefs` (ngôn ngữ bot của khách) | Admin SDK |

---

## 5. Vai trò & phân quyền

Vai trò: `owner` (chủ), `manager`, `reception`, `housekeeping`, `security`, `customer` (+ `pending` cũ coi như khách). Người tự đăng ký luôn là khách; chỉ chủ/quản lý cấp quyền nhân viên (quản lý không cấp được Chủ/Quản lý). Bảng chi tiết: `docs/phan-quyen.md`.

Một số ràng buộc quan trọng đã mã hóa trong rules:
- Khách tạo đặt phòng: `status=="pending"`, `source=="online"`, đúng `createdBy`, kèm khe `pend`, mã giảm giá hợp lệ được dùng **trong cùng lần ghi**; khách chỉ tự hủy khi `pending/confirmed`; khi đang ở (`checked_in`) chỉ được ghi trường `earlyCheckoutRequest`.
- Lễ tân chỉ đổi `status/cancelReason` (+ trả sớm: `checkOut/plannedCheckOut/earlyCheckout`); chỉ admin sửa giá/mã giảm giá; chỉ **chủ** hoàn tác trả phòng/khôi phục đặt phòng đã hủy.
- Ảnh giấy tờ khách chỉ nhân viên lễ tân+ xem. Tài khoản ngân hàng nhận cọc: người đăng nhập đọc (để hiện QR), chỉ chủ ghi.
- `auditLog`: không ai sửa; chỉ chủ xóa; ghi bị từ chối khi chủ tắt (`settings/audit`).

---

## 6. Logic nghiệp vụ quan trọng

**Vòng đời đặt phòng:** `pending → confirmed → checked_in → checked_out`, hoặc `cancelled` (`cancelReason`: `expired` | `customer` | `noshow`). Có thể chuyển qua lại giữa pending/confirmed/checked_in (chỉ chủ hoàn tác từ checked_out/cancelled). Nhận phòng bắt buộc có hồ sơ khách và có hộp xác nhận; trả phòng luôn hỏi lại.

**Trả phòng sớm:** `checkOut` được rút về ngày thực tế, giữ `plannedCheckOut`, `earlyCheckout=true`; phòng nhả ngay cho khách khác (lịch trống, bot, kiểm tra trùng đều bỏ qua `checked_out`). Khách có thể gửi yêu cầu (`earlyCheckoutRequest`), nhân viên được báo Telegram và tự bấm trả phòng.

**Chống trùng lịch:** `busy` mirror quyết định lịch trống trên web/bot (`nightState` bỏ qua `cancelled/checked_out`); nhân viên kiểm trùng với đặt phòng đang hiệu lực + khóa phòng. Khóa phòng thủ công và lịch nhập từ iCal đều ghi `roomBlocks` + `busy/blk_<id>`.

**Tự dọn đặt phòng treo** (`guest.js expireStale`, chạy trong `bookingSweep` 3 giờ/lần và ở client): pending qua ngày nhận phòng → hết hạn; confirmed qua ngày trả phòng mà không đến → “khách không đến”, **giữ nguyên tiền cọc**, báo quản lý.

**Giá (`src/lib/pricing.ts`, `functions/pricing.js`):** giá nền/đêm → phần trăm cuối tuần (ngày cấu hình), mùa, ngày lễ (lễ thắng mùa) → giảm ở dài ngày (theo bậc số đêm) → phụ thu thêm khách (vượt `baseGuests`) → mã giảm giá % → phụ thu nhận sớm/trả muộn → dịch vụ đi kèm (theo lần hoặc theo đêm). Làm tròn nghìn. Cọc = % tổng (làm tròn lên nghìn). Chính sách hủy theo bậc “số ngày trước nhận phòng → % hoàn”. Dòng chi tiết giá lưu song ngữ (`label`/`labelEn`).

**Doanh thu (`src/lib/report.ts`):** ghi nhận khi trả phòng theo ngày trả phòng; “cọc giữ lại” (đặt phòng hủy/không đến còn tiền sau hoàn) tính riêng theo ngày hủy và cộng vào lợi nhuận; công suất = đêm có khách / (phòng hoạt động × số ngày).

**Thanh toán:** `paid` + `payLog[]` (số dương thu, số âm hoàn). Mã chuyển khoản `NHAGO <mã đặt phòng>`; VietQR dựng từ `settings/bank`. Webhook ngân hàng (SePay/Casso) tự cộng tiền vào đúng đặt phòng (giao dịch Firestore, chống ghi lặp qua `bankTx`), **không tự xác nhận**; giao dịch lạ để gán tay.

**Thành viên thân thiết:** hạng theo số lần ở (`settings/loyalty`), chủ đặt tay được; khách nhận mã giảm giá riêng của hạng qua hàm `loyaltyClaim` (kiểm hạng phía server).

**Khai báo lưu trú:** `src/lib/residence.ts` gom khách theo khoảng ngày, nêu trường còn thiếu, xuất CSV/in.

**Chủ đề giao diện (6):** Đêm rừng thông (mặc định), Sương mai, Hoàng hôn tím sương, Noel, Halloween, Tết cổ truyền. Tranh nhà gỗ + rừng thông **sinh hoàn toàn bằng code SVG** (`forest.ts`, `tetArt.ts`) theo bảng màu; hiệu ứng bằng CSS (tuyết, dơi, đèn lồng, hoa mai rơi…), tôn trọng `prefers-reduced-motion` và công tắc “hiệu ứng” của chủ. Tự chuyển theo mùa (Halloween 20/10–01/11, Noel 01/12–05/01, Tết −21/+10 ngày quanh mùng 1 theo bảng 2025–2035 ở `seasons.ts`); xem thử bằng `?theme=tet`.

**Song ngữ:** website lưu lựa chọn ngôn ngữ ở trình duyệt; chủ đặt ngôn ngữ mặc định (`settings/app.defaultLang`). Đặt phòng online lưu `lang` để email/Telegram gửi khách đúng ngôn ngữ. Nội dung các trang pháp lý có hai ô Việt/Anh.

---

## 7. Cloud Functions

| Hàm | Loại | Việc |
|---|---|---|
| `telegramWebhook` | HTTP | nhận update Telegram, kiểm `x-telegram-bot-api-secret-token` (suy ra từ token) |
| `tgNotify` | callable | web báo sự kiện: yêu cầu đặt phòng mới, khách hủy, cảm nhận mới, phòng cần dọn, xin trả sớm |
| `tgLinkCode`, `tgGuestLink`, `tgSetup` | callable | liên kết Telegram nhân viên/khách; chủ kết nối bot (setWebhook + menu lệnh) |
| `guestNotify` | callable | sau khi nhân viên xác nhận/hủy: email + Telegram cho khách (một lần mỗi loại) |
| `mailTest`, `mailStatus`, `mailCampaign` | callable | SMTP: gửi thử, trạng thái, email hàng loạt (≤100/lần) |
| `loyaltyClaim` | callable | cấp mã giảm giá theo hạng |
| `backupNow/List/Get`, `backupScheduled` (02:00) | callable/schedule | xuất JSON toàn bộ lên Cloud Storage, giữ N bản |
| `ical` | HTTP | `/ical/<phòng>.ics?k=<mã>` xuất lịch bận từng phòng |
| `icalSync` (hằng giờ), `icalSyncNow` | schedule/callable | nhập lịch các kênh bán phòng thành khóa phòng; báo khi trùng |
| `bankHook` | HTTP | webhook báo biến động số dư |
| `sitemap` | HTTP | `/sitemap.xml` động (mỗi phòng một URL) |
| `bookingSweep` (06:00–22:00 mỗi 3h) | schedule | kiểm giá, gửi tin theo trạng thái, đồng bộ `busy`, dọn đặt phòng treo, nhắc lịch, xin đánh giá |
| `tgStaffAlerts` (hằng giờ :20) | schedule | nhân viên quá giờ chưa vào/ra ca |
| `tgReminders` (08:00, 18:00) | schedule | nhắc cọc, khách chưa đến/quá hạn trả, thiếu hồ sơ lưu trú, việc định kỳ đến hạn |
| `tgDailyReport` (21:00) | schedule | báo cáo ngày cho chủ/quản lý |

Secrets: `TELEGRAM_BOT_TOKEN`, `SMTP_USER`, `SMTP_PASS` (giá trị `-` = tắt tính năng). Mô-đun được viết dạng **factory nhận phụ thuộc tiêm vào** (`createBot({db,tg,guest,push,now})`, `createGuest({db,tg,mailer})`, `createIcal({db,fetchImpl,notify})`) nên test với Firestore Emulator + giả lập Telegram/SMTP rất dễ — nên giữ phong cách này.

---

## 8. Bot Telegram

- **Phân biệt người dùng:** chat có trong `tgChats` (vai trò owner/manager/reception, kiểm lại vai trò mỗi lệnh) = nhân viên; `tgGuests/{chatId}` = khách đã liên kết tài khoản; còn lại = khách vãng lai (giới hạn tần suất: bộ nhớ + Firestore 6/phút, 80/ngày).
- **Liên kết:** nhân viên tạo mã ở trang quản trị → mở link `t.me/<bot>?start=<mã>` (mã sống 30 phút, lưu `tgLinks`). Khách thì từ trang “Đặt phòng của tôi”.
- **Lệnh công khai (có bản tiếng Anh, `/lang vi|en`, tự nhận theo `language_code`):** `/trong` (phòng trống), `/gia` (báo giá nhanh), `/phong`, `/tiennghi`, `/chinhsach`, `/diachi`, `/tra MÃ`, `/cuatoi`, `/lienhe`, `/dat`.
- **Lệnh nhân viên (luôn tiếng Việt):** `/homnay`, `/cho`, `/doanhthu [tuan|thang]` (chủ/quản lý), `/baocao`, `/phongban`, `/taodat P1 25/12 2 3 Tên SĐT`, `/huylienket`.
- **Nút trong tin:** ✅ Xác nhận / ❌ Từ chối (`cf:`/`rj:`), 💰 Đã nhận cọc (`pd:`), ✅ Đã dọn xong (`rd:`), 🚫 Khách không đến (`ns:`).
- **Tin tự động:** yêu cầu mới (kèm cảnh báo nếu giá bị sửa), khách hủy, cảm nhận mới, phòng cần dọn, nhắc cọc, quá hạn, thiếu hồ sơ, việc định kỳ, trùng lịch iCal, tiền vào qua ngân hàng, xin trả sớm, báo cáo 21:00.
- Mọi thao tác qua bot ghi `auditLog` (role `telegram`). Chi tiết cài đặt: `docs/telegram-bot.md`.

---

## 9. Kiểm thử & CI/CD

- `npm run test:lib` — test thuần (pricing, report, residence, dates, seasons, countries) bằng `node --experimental-strip-types`.
- `npm run test:emu` — Firestore Emulator (JDK 21 cần cho emulator): `tests/rules.test.mjs` (~400 kiểm tra luật, mỗi dòng `check(mô tả, promise, mong muốn)`) + `functions/test/*.test.js` (bot, guest, expire, campaign, ical/bankhook, loyalty, sitemap, backup…).
- `npm test` = cả hai. **Quy tắc đã giữ:** sửa luật hoặc hàm thì thêm test trước khi merge; CI chạy `npm test` ở PR và **chặn deploy nếu lỗi**.
- E2E trình duyệt (Playwright + emulator auth/firestore, ~290 kiểm tra) viết ngoài repo; kiểm tra đủ luồng: đặt phòng, xác nhận, nhận/trả phòng sớm, báo cáo, chủ đề, QR, PDF… Nếu bạn mang dự án đi, nên đưa e2e vào repo.
- `.github/workflows`: `test.yml` (PR + nhánh khác main), `deploy.yml` (build → test → `firebase deploy --only hosting,firestore:rules,storage`), `deploy-functions.yml` (khi đổi `functions/**`). Secrets GitHub: `FIREBASE_SERVICE_ACCOUNT`, `TELEGRAM_BOT_TOKEN`, `SMTP_USER`, `SMTP_PASS`.
- **Lưu ý thứ tự deploy:** hosting rewrite tới hàm mới sẽ lỗi nếu hàm chưa tồn tại (hai workflow chạy song song) → `deploy.yml` tự thử lại một lần sau 2 phút. Service account cần đủ quyền Scheduler/Functions/Secret Manager (lần đầu sẽ gặp lỗi `cloudscheduler.jobs.update`: bật Cloud Scheduler API và cấp vai trò).

---

## 10. Dựng lại từ đầu trên dự án Firebase mới (checklist)

1. Tạo project Firebase (gói Blaze, cần cho Functions/Scheduler); bật Auth (Google + Email/Password), Firestore, Storage, Hosting (đặt tên site), Cloud Scheduler API.
2. Điền cấu hình web vào `src/lib/firebase.ts`; đổi `.firebaserc`, `firebase.json` (`site`).
3. `npm ci && npm ci --prefix functions && npm ci --prefix tests`; `npm test`.
4. Tạo service account deploy, đặt secret GitHub `FIREBASE_SERVICE_ACCOUNT` (+ bot/SMTP). Lần đầu: tạo bot qua @BotFather, đặt `TELEGRAM_BOT_TOKEN`; deploy; vào trang quản trị bấm “Kết nối bot”.
5. Đăng ký tài khoản đầu tiên rồi **tự đặt vai trò `owner` trong Firestore (`users/<uid>.role`)** — phần còn lại cấp qua giao diện.
6. Chủ nhập: liên hệ, tài khoản ngân hàng, giá & chính sách, phòng (+ ảnh), cấu hình email (nếu dùng), liên kết Telegram.
7. (Tùy chọn) SePay/Casso trỏ tới `bankHook`; dán đường dẫn iCal vào các kênh bán phòng.

---

## 11. Quá trình xây dựng (theo giai đoạn)

1. **Nền tảng quản trị (PR #1–4):** phòng, đặt phòng, lịch, khách lưu trú + ảnh giấy tờ, đăng nhập, luật Firestore ngay từ đầu.
2. **Website công khai + đặt phòng online (#5–10):** landing, bản sao `busy` công khai, đăng nhập Google, yêu cầu chờ xác nhận, mã giảm giá một lần, hủy bởi khách, FAQ/quyền riêng tư/cảm nhận, giao diện “D” (kem + xanh rừng + gỗ).
3. **Giao diện nhiều chủ đề & tinh chỉnh UX (#11–16, #22–27):** 4 giao diện, thống nhất dd/mm/yyyy, menu gọn, phân quyền có Lưu/Hủy.
4. **Bot Telegram (#17–19, #29):** thông báo + nút xác nhận, chế độ khách, chống spam, liên hệ dùng chung với website, lệnh doanh thu/buồng phòng/cọc.
5. **Nhân sự (#20–21):** chấm công, ca làm, bảng công.
6. **Tài chính & vận hành (#25–28):** bảng giá, cọc VietQR, chính sách hủy, dịch vụ, hóa đơn, thành viên thân thiết, báo cáo, chi phí, dọn phòng, sao lưu.
7. **Độ tin cậy (#32–34):** CI chạy toàn bộ test và chặn deploy, kiểm giá phía server, email + Telegram cho khách.
8. **Mở rộng bot/khách (#35–40):** bot nhân viên (`/taodat`…), QR nhận phòng, thông báo đẩy, menu quản trị theo nhóm, email hàng loạt, tự dọn đặt phòng treo, ô ngày gõ tay, quốc tịch dạng danh sách, giãn lịch chạy nền.
9. **Chất lượng nghiệp vụ (#41–46):** sửa lỗi hiển thị tiền, dịch chi tiết giá, trả phòng sớm có hỏi lại + nhả phòng, khai báo lưu trú, khóa phòng, nhật ký hoạt động, email xin đánh giá, khách tự xin trả sớm.
10. **Tự động hóa & tích hợp (#47–52):** tắt/bật + xóa nhật ký, cọc giữ lại, checklist dọn phòng, tiếng Anh cho email/bot, iCal, đối soát ngân hàng, hóa đơn PDF, Nội quy.
11. **Giao diện mùa lễ (#53–54):** Halloween, Tết (đồ họa vector chi tiết), tự chuyển theo mùa.

Cách làm việc lặp lại cho mỗi yêu cầu: hiểu vấn đề → viết/sửa mã + test → chạy `npm test` + e2e → commit nhánh làm việc → PR → chờ CI xanh → squash-merge → báo cáo (làm gì, kiểm tra gì, giới hạn gì). Không đẩy bí mật vào repo/chat.

---

## 12. Bài học & quyết định thiết kế (nên giữ)

- **Luôn viết test luật cho mọi trường hợp “được” và “bị chặn”** — nhiều lỗi quyền chỉ lộ ra ở đây (vd. quy tắc đọc `settings` từng làm lộ cấu hình email; luật `rooms` làm vỡ test dùng tài liệu tối thiểu).
- **`money()` trả JSX**, cần chuỗi thì dùng `moneyText` (từng gây `[object Object]` trong tooltip/tổng hợp).
- **Ô nhập số** dùng `NumInput` (giữ chuỗi cục bộ) vì `<input type=number>` kiểm soát chặt không xóa/gõ lại được.
- **Ngày dùng giờ địa phương/VN**, không `toISOString().slice(0,10)` (lệch một ngày lúc 0–7h sáng).
- **Điều kiện đua (race)** khi dữ liệu về muộn (vd. điền sẵn hồ sơ khách ghi đè chữ đang gõ) → dùng `ref` đánh dấu đã khởi tạo một lần.
- **Thông báo tự động phải idempotent** (`tgSent`), và các hàm quét định kỳ phải chịu được chạy lặp/trùng.
- **Hosting ↔ Functions** phụ thuộc thứ tự (xem §9).
- **Mã bí mật không đặt trong repo**: Secret Manager cho bot/SMTP; Firestore (chỉ admin/chủ đọc) cho iCal/webhook ngân hàng.
- **Phân tách deploy** hosting và functions để lỗi quyền ở functions không chặn cập nhật website.
- Chi phí: Firestore + Functions ở quy mô homestay nằm trong hạn mức miễn phí hoặc vài đô/tháng; chạy nền được giãn (3 giờ/lần) để tiết kiệm.

---

## 13. Hạn chế đã biết / chưa làm

- Nhật ký hoạt động do trình duyệt nhân viên ghi → không chống được người cố tình bỏ qua.
- iCal không tức thời (kênh bán phòng làm mới sau vài giờ). Đối soát ngân hàng cần dịch vụ bên thứ ba (SePay/Casso, thường có phí) và chưa thử với dịch vụ thật.
- Email thật (SMTP), thông báo đẩy trên thiết bị thật, tải ảnh phòng lên Storage qua giao diện: chưa kiểm thử tự động (emulator không đánh giá được luật Storage chéo dịch vụ).
- Tên “Nhà Gỗ Homestay” còn cứng ở ~20 nơi (`site.name`, `functions/site.js`, `index.html`, manifest…); chưa có cài đặt đổi tên động (đã tư vấn phương án).
- Hóa đơn PDF là ảnh chụp trang (không phải PDF văn bản); không lưu bản riêng.
- Danh sách khai báo lưu trú chưa có cột giới tính; chưa có gửi khai báo tự động lên cổng cơ quan chức năng.
- Chưa có app di động riêng (website responsive + PWA nhẹ cho thông báo đẩy).

---

## 14. Mang sang dự án khác: cái gì dùng lại được, cái gì phải đổi

**Dùng lại gần như nguyên vẹn (mô-đun chung):** khung `rules-as-backend` + bộ test luật; `DateInput`, `NumInput`, `Dropdown`, `QrCode`; hệ i18n Việt/Anh; cơ chế chủ đề + hiệu ứng; `pricing` (đồng bộ client/server); bot (factory + tiêm phụ thuộc); email/campaign; iCal; webhook ngân hàng; sao lưu; sitemap động; nhật ký hoạt động; chấm công; CI/CD.

**Phải thay cho dự án mới:** tên thương hiệu và nội dung mẫu (`siteConfig.ts`, `functions/site.js`, `defaultContent.ts`, `index.html`, manifest, logo/favicon); tiền tệ/ngôn ngữ/múi giờ (đang VNĐ, `Asia/Ho_Chi_Minh`, VietQR); các mục pháp lý đặc thù Việt Nam (khai báo lưu trú, CCCD, mã `NHAGO`); danh sách quốc gia/ngày Tết; mã dự án Firebase; ảnh phòng.

**Mẫu yêu cầu để giao cho AI khác (copy dùng):**

> Hãy đọc `docs/PROJECT-HANDOFF.md`, `README.md`, `firestore.rules`, `functions/index.js`, `src/App.tsx`, `src/StaffShell.tsx`. Hiểu kiến trúc “rules-as-backend”. Sau đó làm: <yêu cầu mới>. Quy tắc: không đưa bí mật vào mã; mọi thay đổi luật/hàm phải có test (rules + functions) và chạy `npm test` xanh trước khi commit; giữ mô-đun dạng factory nhận phụ thuộc; chuỗi giao diện thêm cả tiếng Việt và tiếng Anh; ngày dùng giờ địa phương; báo cáo ngắn gọn: đã làm gì, đã kiểm tra gì, giới hạn gì.

---

## 15. Lệnh thường dùng

```bash
npm run dev                 # chạy giao diện (Vite)
npm run build               # tsc --noEmit + vite build
npm test                    # test:lib + test:emu (cần JDK 21 cho emulator)
npm run test:lib            # chỉ test thư viện
firebase emulators:exec --only firestore --project demo-test "node tests/rules.test.mjs"
npm ci --prefix functions   # cài thư viện hàm
```

Biến môi trường dev: `VITE_USE_EMULATOR=1` để trỏ web vào emulator (không gọi Cloud Functions).
