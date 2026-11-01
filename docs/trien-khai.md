# Triển khai lần đầu (project Firebase `vnhatro`)

Mã nguồn đã cấu hình sẵn cho project `vnhatro` và trang `nhatroviet.web.app`. **Không gửi token hay mật khẩu qua chat**: mọi bí mật đặt trong GitHub → Settings → Secrets and variables → Actions.

## 1. Bật dịch vụ trong Firebase Console (https://console.firebase.google.com/project/vnhatro)
1. **Authentication → Sign-in method**: bật *Google* và *Email/Password*. Ở *Settings → Authorized domains* kiểm tra có `nhatroviet.web.app`.
2. **Firestore Database**: tạo database (chế độ production, vị trí `asia-southeast1` cho gần Việt Nam). Luật sẽ được deploy tự động.
3. **Storage**: bật (dùng bucket `vnhatro.firebasestorage.app` — đây là kho ảnh, *không phải* trang web).
4. **Hosting**: trang `nhatroviet` phải tồn tại (Hosting → Add another site nếu chưa có). Nếu chỉ có trang mặc định `vnhatro`, sửa `"site"` trong `firebase.json` thành `vnhatro`.
5. Gói **Blaze** (đã có) — cần cho Cloud Functions và lịch chạy.

## 2. Tài khoản dịch vụ cho GitHub Actions
1. Google Cloud Console → IAM & Admin → Service Accounts → *Create* (vd `github-deploy`).
2. Cấp vai trò: *Firebase Admin*, *Cloud Functions Admin*, *Service Account User*, *Secret Manager Admin*, *Cloud Scheduler Admin*, *Artifact Registry Administrator*, *Cloud Build Editor*.
3. Tạo khóa JSON → dán toàn bộ nội dung vào GitHub secret **`FIREBASE_SERVICE_ACCOUNT`**.
4. Bật API (lần đầu deploy functions thường báo thiếu): Cloud Functions, Cloud Build, Artifact Registry, Cloud Scheduler, Secret Manager, Cloud Run, Eventarc.

## 3. Bot Telegram (tùy chọn, làm sau cũng được)
1. Nhắn **@BotFather** → `/newbot` → lấy token.
2. Đặt GitHub secret **`TELEGRAM_BOT_TOKEN`** = token. Chưa có thì các hàm vẫn deploy, chỉ không gửi Telegram.
3. Sau khi workflow “Deploy Cloud Functions” chạy xong: đăng nhập web với tài khoản chủ → **Hệ thống → Cài đặt → Kết nối bot**, rồi **Tạo đường dẫn liên kết** để nhận thông báo.

## 4. Đưa lên mạng
Workflow chạy khi đẩy lên nhánh `main` (hoặc bấm *Run workflow* trong tab Actions): `deploy.yml` (web + luật) và `deploy-functions.yml` (Cloud Functions). Cả hai chạy toàn bộ test trước, lỗi thì không deploy.

## 5. Sau khi lên mạng
1. **Người đăng nhập đầu tiên trở thành Chủ** — hãy đăng nhập ngay bằng tài khoản của bạn.
2. Tổng quan → **Tạo 3 khu nhà trọ**.
3. Hệ thống → **Khu trọ & dịch vụ**: nhập đơn giá điện, nước, rác, internet cho khu Cộng Hòa (hai căn nhà nguyên căn để trống nếu người thuê tự trả điện nước).
4. **Phòng**: nhập giá thuê, ảnh; bật “Hiện trên trang công khai” cho phòng trống.
5. Cài đặt → **Tài khoản nhận tiền** (để hiện mã VietQR), **Liên hệ chủ nhà**.
6. **Người cư trú** → thêm hồ sơ (quét QR CCCD) → **Hợp đồng** (nhập chỉ số đầu) → đầu tháng: **Điện nước** → **Hóa đơn** → Phát hành.
7. Gửi **mã mời** cho người thuê để họ đăng nhập xem hóa đơn và nhận Telegram.
8. (Tùy chọn) **SePay / Casso**: Cài đặt → tạo mã webhook, khai báo URL `https://asia-southeast1-vnhatro.cloudfunctions.net/bankHook` với header `Authorization: Apikey <mã>`.
9. Google Cloud Console → APIs & Services → Credentials: **giới hạn API key** của web theo tên miền `nhatroviet.web.app`, `vnhatro.firebaseapp.com` (API key web không phải bí mật nhưng nên giới hạn).

## Cài lên điện thoại
Mở https://nhatroviet.web.app/app bằng Chrome (Android) hoặc Safari (iPhone) → *Thêm vào màn hình chính*. Quét QR CCCD dùng camera trực tiếp trên Chrome Android; trình duyệt chưa hỗ trợ thì dán chuỗi QR.
