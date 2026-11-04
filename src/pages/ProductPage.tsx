import { Link } from "react-router-dom";
import { PublicFooter, PublicHeader } from "./Landing";
import { useSite } from "../lib/site";

const FEATURES = [
  { i: "🧾", t: "Hóa đơn tự động", d: "Nhập chỉ số điện nước, hệ thống tính tiền phòng, dịch vụ, nợ cũ và phát hành hóa đơn PDF cho cả khu chỉ vài phút." },
  { i: "🏦", t: "Thu tiền qua VietQR", d: "Mỗi hóa đơn kèm mã VietQR. Người thuê chuyển khoản, tiền tự khớp vào hóa đơn qua webhook ngân hàng." },
  { i: "🤖", t: "Bot Telegram", d: "Nhắc đóng tiền, báo cáo ngày, nhận báo hỏng và trả lời người thuê ngay trong Telegram." },
  { i: "👥", t: "Cổng người thuê", d: "Người thuê tự xem hợp đồng, hóa đơn, lịch sử thanh toán và gửi yêu cầu sửa chữa kèm ảnh." },
  { i: "🏘️", t: "Nhiều khu trọ", d: "Quản lý nhiều khu trong một tài khoản. Quản lý và nhân viên chỉ thấy khu được giao." },
  { i: "📊", t: "Công nợ & báo cáo", d: "Theo dõi nợ theo tuổi nợ, thu chi, tỷ lệ lấp đầy và lợi nhuận từng khu." },
  { i: "📄", t: "Hợp đồng & tạm trú", d: "Lưu hợp đồng, tiền cọc, hạn thuê; nhắc sắp hết hạn và theo dõi đăng ký tạm trú." },
  { i: "🔒", t: "Phân quyền chặt chẽ", d: "Chủ, quản lý, nhân viên, người thuê mỗi vai trò một quyền. Ảnh CCCD chỉ chủ và quản lý xem được." },
];

const FLOW = [
  { t: "Thiết lập khu & phòng", d: "Tạo khu trọ, phòng, đơn giá điện nước và dịch vụ một lần." },
  { t: "Ghi chỉ số hằng tháng", d: "Nhân viên nhập chỉ số bằng điện thoại, hệ thống cảnh báo số bất thường." },
  { t: "Phát hành & thu tiền", d: "Gửi hóa đơn, nhận tiền tự động, theo dõi ai còn nợ trên một màn hình." },
];

const FAQ = [
  { q: "Dùng được trên điện thoại không?", a: "Có. NhaTro chạy như ứng dụng (PWA) trên điện thoại, cài thẳng lên màn hình chính." },
  { q: "Dữ liệu người thuê có an toàn không?", a: "Quyền truy cập được kiểm soát ở tầng cơ sở dữ liệu theo vai trò và theo khu. Thông tin giấy tờ cá nhân chỉ chủ và quản lý xem được." },
  { q: "Tôi có nhiều khu trọ thì sao?", a: "Một tài khoản quản lý được nhiều khu, phân quyền nhân viên riêng cho từng khu." },
  { q: "Người thuê có cần cài gì không?", a: "Không. Họ đăng nhập bằng Google hoặc email trên trình duyệt để xem hóa đơn và báo hỏng." },
];

/** Trang giới thiệu sản phẩm cho chủ trọ (marketing). Màu và phông lấy từ biến giao diện, không viết cứng. */
export default function ProductPage() {
  const { name } = useSite();
  return (
    <div className="pub saas">
      <PublicHeader />
      <section className="hero">
        <span className="hero-deco d1" /><span className="hero-deco d2" />
        <div className="hero-in">
          <div className="hero-text">
            <span className="eyebrow">Phần mềm quản lý nhà trọ</span>
            <h1>Quản lý nhà trọ <span className="hl">gọn nhẹ</span>, thu tiền đúng hạn</h1>
            <p>{name} lo hóa đơn điện nước, thu tiền, hợp đồng và báo hỏng, để bạn dành thời gian cho việc khác.</p>
            <div className="hero-cta">
              <Link className="btn-cta" to="/dang-nhap">Dùng thử miễn phí</Link>
              <a className="btn-alt" href="#tinh-nang">Xem tính năng</a>
            </div>
          </div>
          <div className="hero-stickers" aria-hidden="true"><span>Hóa đơn</span><span>VietQR</span><span>Telegram</span></div>
        </div>
      </section>

      <main className="pub-main">
        <section id="tinh-nang" className="saas-sec">
          <h2>Mọi thứ chủ trọ cần</h2>
          <p className="saas-lead muted">Từ ghi chỉ số đến thu tiền và báo cáo, gói trong một hệ thống.</p>
          <div className="saas-grid">
            {FEATURES.map((f) => (
              <article key={f.t} className="card saas-feature">
                <span className="saas-ico" aria-hidden="true">{f.i}</span>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="steps">
          <h2>Bắt đầu trong 3 bước</h2>
          <div className="steps-row">
            {FLOW.map((s, i) => <div key={s.t} className="step"><div className="step-n">{i + 1}</div><b>{s.t}</b><p>{s.d}</p></div>)}
          </div>
        </section>

        <section className="saas-sec">
          <h2>Câu hỏi thường gặp</h2>
          <div className="saas-faq">
            {FAQ.map((f) => <details key={f.q} className="card"><summary>{f.q}</summary><p>{f.a}</p></details>)}
          </div>
        </section>

        <section className="card contact saas-cta">
          <div>
            <h3>Sẵn sàng bỏ sổ giấy và bảng tính?</h3>
            <p>Tạo tài khoản và thiết lập khu trọ đầu tiên của bạn ngay hôm nay.</p>
          </div>
          <div className="row"><Link className="btnlink" to="/dang-nhap">Bắt đầu ngay</Link><Link className="btnlink alt" to="/">Xem phòng trống</Link></div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
