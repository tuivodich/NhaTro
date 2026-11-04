import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useCollection } from "../lib/useCollection";
import { useAuth } from "../lib/auth";
import { useSite } from "../lib/site";
import { useI18n } from "../i18n";
import { isStaffRole, type Listing } from "../lib/types";
import { formatVnd } from "../lib/format";
import HashLink from "../components/HashLink";

export interface Contact { name?: string; phone?: string; zalo?: string; email?: string }
export function useContact() {
  const [c, setC] = useState<Contact>({});
  useEffect(() => { getDoc(doc(db, "settings", "contact")).then((s) => setC((s.data() as Contact) ?? {})).catch(() => {}); }, []);
  return c;
}

export const HomeIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v10h13V10" /><path d="M10 20v-5h4v5" /></svg>
);
const PinIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
);

export function PublicHeader() {
  const { user, profile } = useAuth();
  const { name } = useSite();
  return (
    <header className="pub-head">
      <div className="pub-head-in">
        <Link to="/" className="brand"><span className="logo-mark"><HomeIcon /></span>{name}</Link>
        <nav>
          <HashLink to="/#phong">Phòng trống</HashLink>
          <HashLink to="/#cach-thue">Cách thuê</HashLink>
          <HashLink to="/#lien-he">Liên hệ</HashLink>
          {user
            ? <><Link to="/ho-so">Hồ sơ của tôi</Link><Link className="btn-login" to={isStaffRole(profile?.role) ? "/app" : "/tai-khoan"}>{isStaffRole(profile?.role) ? "Quản lý" : "Tài khoản"}</Link></>
            : <Link className="btn-login" to="/dang-nhap">Đăng nhập</Link>}
        </nav>
      </div>
    </header>
  );
}

export function ContactBox({ id = "lien-he" }: { id?: string }) {
  const c = useContact();
  if (!c.phone && !c.zalo && !c.email) return null;
  return (
    <section id={id} className="card contact">
      <div>
        <h3>{c.name ? `Liên hệ thuê phòng — ${c.name}` : "Liên hệ thuê phòng"}</h3>
        <p>Gọi hoặc nhắn trực tiếp cho chủ nhà.</p>
      </div>
      <div className="row">
        {c.phone && <a className="btnlink" href={`tel:${c.phone}`}>📞 {c.phone}</a>}
        {c.zalo && <a className="btnlink alt" href={`https://zalo.me/${c.zalo.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">💬 Zalo</a>}
        {c.email && <a className="btnlink alt" href={`mailto:${c.email}`}>✉️ {c.email}</a>}
      </div>
    </section>
  );
}

export function PublicFooter() {
  const { name } = useSite();
  return <footer className="pub-foot">{name} · TP. Hồ Chí Minh</footer>;
}

const STEPS = [
  { t: "Chọn phòng & đăng ký", d: "Đăng nhập bằng Google, để lại số điện thoại và ngày muốn dọn vào." },
  { t: "Hẹn xem & giữ chỗ", d: "Chủ nhà gọi lại, hẹn giờ xem phòng và giữ chỗ cho bạn." },
  { t: "Ký hợp đồng", d: "Giấy tờ lưu một lần trong “Hồ sơ của tôi”, các lần thuê sau không phải nhập lại." },
];

/** Trang công khai: phòng/nhà đang trống (bản sao `listings`, không có dữ liệu cá nhân). Giao diện do chủ chọn ở Cài đặt. */
export default function Landing() {
  const { L } = useI18n();
  const { data, loading } = useCollection<Listing>("listings");
  const [khu, setKhu] = useState("");
  const list = useMemo(() => [...data].sort((a, b) => a.propertyName.localeCompare(b.propertyName, "vi") || a.code.localeCompare(b.code, "vi", { numeric: true })), [data]);
  const khuList = useMemo(() => [...new Set(list.map((l) => l.propertyName))], [list]);
  const shown = khu ? list.filter((l) => l.propertyName === khu) : list;

  // Cuộn tới mục neo (/#phong…) khi vào từ trang khác.
  useEffect(() => {
    const id = location.hash.slice(1);
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 150);
  }, [loading]);

  return (
    <div className="pub">
      <PublicHeader />
      <section className="hero">
        <span className="hero-deco d1" /><span className="hero-deco d2" />
        <div className="hero-in">
          <div className="hero-text">
            <span className="eyebrow">Thuê trực tiếp từ chủ nhà</span>
            <h1>Tìm chỗ ở <span className="hl">ưng ý</span> cho riêng bạn</h1>
            <p>Chọn phòng, bấm đăng ký. Chủ nhà sẽ gọi lại hẹn bạn đến xem, không qua môi giới.</p>
            <div className="hero-cta">
              <a className="btn-cta" href="#phong">Xem phòng trống</a>
              <a className="btn-alt" href="#lien-he">Liên hệ chủ nhà</a>
            </div>
          </div>
          <div className="hero-stickers" aria-hidden="true">{khuList.slice(0, 3).map((k) => <span key={k}>{k}</span>)}</div>
        </div>
      </section>

      <main className="pub-main">
        <div className="sec-head" id="phong">
          <h2>Đang cho thuê</h2>
          {khuList.length > 1 && (
            <div className="chips">
              <button type="button" className="chip-btn" aria-pressed={!khu} onClick={() => setKhu("")}>Tất cả</button>
              {khuList.map((k) => <button key={k} type="button" className="chip-btn" aria-pressed={khu === k} onClick={() => setKhu(k)}>{k}</button>)}
            </div>
          )}
        </div>
        {loading ? <p>Đang tải…</p> : !shown.length ? <p>Hiện đã hết phòng trống. Liên hệ chủ nhà để được báo khi có phòng.</p> : (
          <div className="listings">
            {shown.map((l) => (
              <Link key={l.id} to={`/phong/${l.id}`} className="card listing">
                <div className="cover-wrap">
                  {l.photos?.[0] ? <img className="cover" src={l.photos[0]} alt={l.name || l.code} loading="lazy" /> : <div className="cover ph-empty">Ảnh phòng</div>}
                  <span className="badge-type">{L.roomType[l.type]}</span>
                  <span className="price-badge">{formatVnd(l.rent)}</span>
                </div>
                <div className="listing-body">
                  <div className="listing-name">{l.name || l.code}</div>
                  <div className="listing-addr"><PinIcon /><span>{l.address || l.propertyName}</span></div>
                  <div className="price-line">{formatVnd(l.rent)}<small> /tháng</small></div>
                  <div className="facts">
                    {l.area ? <span className="fact">{l.area} m²</span> : null}
                    {l.maxPeople ? <span className="fact">Tối đa {l.maxPeople} người</span> : null}
                    <span className="fact">Còn trống</span>
                  </div>
                  <span className="btn-fake">Xem &amp; đăng ký thuê</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        <section id="cach-thue" className="steps">
          <h2>Thuê phòng trong 3 bước</h2>
          <div className="steps-row">
            {STEPS.map((s, i) => <div key={s.t} className="step"><div className="step-n">{i + 1}</div><b>{s.t}</b><p>{s.d}</p></div>)}
          </div>
        </section>

        <ContactBox />
        <p className="center-text muted"><small>Người đang thuê: <Link to="/tai-khoan">đăng nhập</Link> để xem hóa đơn, hợp đồng, báo hỏng.</small></p>
      </main>
      <PublicFooter />
    </div>
  );
}
