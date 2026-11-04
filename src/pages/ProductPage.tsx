import { Link } from "react-router-dom";
import { PublicFooter, PublicHeader } from "./Landing";
import { useSite } from "../lib/site";

/** Bộ icon nét (24×24, nét 2, theo màu chữ) — thay emoji để đồng nhất giữa các máy và theo được biến màu giao diện. */
const ICONS = {
  receipt: <><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v1M14 20h1M18 18h3v3h-3" /></>,
  send: <><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></>,
  users: <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0" /><path d="M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3" /></>,
  building: <><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 10h1M14 10h1M9 14h1M14 14h1M10 21v-3h4v3" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></>,
  file: <><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  shield: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  check: <path d="m5 12 5 5L20 7" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
};
type IconName = keyof typeof ICONS;

function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{ICONS[name]}</svg>
  );
}

const FEATURES: { i: IconName; t: string; d: string }[] = [
  { i: "receipt", t: "Hóa đơn tự động", d: "Nhập chỉ số điện nước, hệ thống tính tiền phòng, dịch vụ, nợ cũ và phát hành hóa đơn PDF cho cả khu chỉ vài phút." },
  { i: "qr", t: "Thu tiền qua VietQR", d: "Mỗi hóa đơn kèm mã VietQR. Người thuê chuyển khoản, tiền tự khớp vào hóa đơn qua webhook ngân hàng." },
  { i: "send", t: "Bot Telegram", d: "Nhắc đóng tiền, báo cáo ngày, nhận báo hỏng và trả lời người thuê ngay trong Telegram." },
  { i: "users", t: "Cổng người thuê", d: "Người thuê tự xem hợp đồng, hóa đơn, lịch sử thanh toán và gửi yêu cầu sửa chữa kèm ảnh." },
  { i: "building", t: "Nhiều khu trọ", d: "Quản lý nhiều khu trong một tài khoản. Quản lý và nhân viên chỉ thấy khu được giao." },
  { i: "chart", t: "Công nợ & báo cáo", d: "Theo dõi nợ theo tuổi nợ, thu chi, tỷ lệ lấp đầy và lợi nhuận từng khu." },
  { i: "file", t: "Hợp đồng & tạm trú", d: "Lưu hợp đồng, tiền cọc, hạn thuê; nhắc sắp hết hạn và theo dõi đăng ký tạm trú." },
  { i: "shield", t: "Phân quyền chặt chẽ", d: "Chủ, quản lý, nhân viên, người thuê mỗi vai trò một quyền. Ảnh CCCD chỉ chủ và quản lý xem được." },
];

const TRUST = [
  "Dùng ngay trên điện thoại",
  "Người thuê không cần cài app",
  "Tiền luôn được máy chủ tính lại",
  "Nhân viên chỉ thấy khu được giao",
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

/** Hóa đơn minh họa trong hero (số liệu ví dụ, không phải dữ liệu thật). */
const PREVIEW_LINES = [
  { k: "Tiền phòng", v: "3.000.000" },
  { k: "Điện · 120 kWh", v: "420.000" },
  { k: "Nước · 6 m³", v: "120.000" },
  { k: "Dịch vụ", v: "150.000" },
];

function InvoicePreview() {
  return (
    <figure className="saas-preview" aria-label="Ví dụ hóa đơn tháng của một phòng">
      <div className="pv-head">
        <div><b>Phòng 203</b><span>Kỳ 2026-10</span></div>
        <span className="pv-status"><Icon name="check" size={14} />Đã thanh toán</span>
      </div>
      <dl className="pv-lines">
        {PREVIEW_LINES.map((l) => <div key={l.k}><dt>{l.k}</dt><dd>{l.v}</dd></div>)}
      </dl>
      <div className="pv-total"><span>Tổng cộng</span><b>3.690.000 đ</b></div>
      <div className="pv-foot"><span className="pv-qr"><Icon name="qr" size={20} /></span>Khớp tự động qua VietQR</div>
    </figure>
  );
}

/** Trang giới thiệu sản phẩm cho chủ trọ (marketing). Màu và phông lấy từ biến giao diện, không viết cứng. */
export default function ProductPage() {
  const { name } = useSite();
  return (
    <div className="pub saas">
      <PublicHeader />
      <section className="hero" aria-labelledby="saas-title">
        <span className="hero-deco d1" /><span className="hero-deco d2" />
        <div className="hero-in">
          <div className="hero-text">
            <span className="eyebrow">Phần mềm quản lý nhà trọ</span>
            <h1 id="saas-title">Quản lý nhà trọ <span className="hl">gọn nhẹ</span>, thu tiền đúng hạn</h1>
            <p>{name} lo hóa đơn điện nước, thu tiền, hợp đồng và báo hỏng, để bạn dành thời gian cho việc khác.</p>
            <div className="hero-cta">
              <Link className="btn-cta" to="/dang-nhap">Dùng thử miễn phí <Icon name="arrow" size={20} /></Link>
              <a className="btn-alt" href="#tinh-nang">Xem tính năng</a>
            </div>
          </div>
          <InvoicePreview />
        </div>
      </section>

      <main className="pub-main">
        <ul className="saas-trust" aria-label="Điểm nổi bật">
          {TRUST.map((t) => <li key={t}><span className="saas-check"><Icon name="check" size={16} /></span>{t}</li>)}
        </ul>

        <section id="tinh-nang" className="saas-sec" aria-labelledby="tinh-nang-h">
          <h2 id="tinh-nang-h">Mọi thứ chủ trọ cần</h2>
          <p className="saas-lead muted">Từ ghi chỉ số đến thu tiền và báo cáo, gói trong một hệ thống.</p>
          <div className="saas-grid">
            {FEATURES.map((f) => (
              <article key={f.t} className="card saas-feature">
                <span className="saas-ico"><Icon name={f.i} /></span>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="steps" aria-labelledby="buoc-h">
          <h2 id="buoc-h">Bắt đầu trong 3 bước</h2>
          <ol className="steps-row">
            {FLOW.map((s, i) => (
              <li key={s.t} className="step">
                <div className="step-n" aria-hidden="true">{i + 1}</div>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="saas-sec" aria-labelledby="faq-h">
          <h2 id="faq-h">Câu hỏi thường gặp</h2>
          <div className="saas-faq">
            {FAQ.map((f) => (
              <details key={f.q} className="card">
                <summary>{f.q}<span className="saas-chev"><Icon name="chevron" size={20} /></span></summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="card contact saas-cta" aria-labelledby="cta-h">
          <div>
            <h2 id="cta-h">Sẵn sàng bỏ sổ giấy và bảng tính?</h2>
            <p>Tạo tài khoản và thiết lập khu trọ đầu tiên của bạn ngay hôm nay.</p>
          </div>
          <div className="row"><Link className="btnlink" to="/dang-nhap">Bắt đầu ngay</Link><Link className="btnlink alt" to="/">Xem phòng trống</Link></div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
