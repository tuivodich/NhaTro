import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useCollection } from "../lib/useCollection";
import { useAuth } from "../lib/auth";
import { useI18n } from "../i18n";
import { isStaffRole, type Listing } from "../lib/types";
import { DEFAULT_SITE_NAME } from "../lib/siteConfig";
import Money from "../components/Money";

export interface Contact { name?: string; phone?: string; zalo?: string; email?: string }
export function useContact() {
  const [c, setC] = useState<Contact>({});
  useEffect(() => { getDoc(doc(db, "settings", "contact")).then((s) => setC((s.data() as Contact) ?? {})).catch(() => {}); }, []);
  return c;
}

export function PublicHeader() {
  const { user, profile } = useAuth();
  return (
    <header className="pub-head">
      <Link to="/" className="brand"><img src="/favicon.svg" alt="" width="28" height="28" /> {DEFAULT_SITE_NAME}</Link>
      <span className="spacer" />
      {user ? <Link to={isStaffRole(profile?.role) ? "/app" : "/tai-khoan"}>{isStaffRole(profile?.role) ? "Quản lý" : "Tài khoản"}</Link> : <Link to="/dang-nhap">Đăng nhập</Link>}
    </header>
  );
}

export function ContactBox() {
  const c = useContact();
  if (!c.phone && !c.zalo && !c.email) return null;
  return (
    <div className="card contact">
      <h3>Liên hệ thuê phòng{c.name ? ` — ${c.name}` : ""}</h3>
      <div className="row">
        {c.phone && <a className="btnlink" href={`tel:${c.phone}`}>📞 {c.phone}</a>}
        {c.zalo && <a className="btnlink" href={`https://zalo.me/${c.zalo.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">💬 Zalo</a>}
        {c.email && <a className="btnlink" href={`mailto:${c.email}`}>✉️ {c.email}</a>}
      </div>
    </div>
  );
}

/** Trang công khai: danh sách phòng/nhà đang trống (bản sao `listings`, không có dữ liệu cá nhân). */
export default function Landing() {
  const { L } = useI18n();
  const { data, loading } = useCollection<Listing>("listings");
  const list = [...data].sort((a, b) => a.propertyName.localeCompare(b.propertyName, "vi") || a.code.localeCompare(b.code, "vi", { numeric: true }));
  return (
    <div className="pub">
      <PublicHeader />
      <section className="hero">
        <h1>Phòng trọ &amp; nhà cho thuê</h1>
        <p>{[...new Set(list.map((l) => l.propertyName))].join(" · ") || "TP. Hồ Chí Minh"}</p>
      </section>
      <main className="pub-main">
        <h2>Đang cho thuê</h2>
        {loading ? <p>Đang tải…</p> : !list.length ? <p>Hiện đã hết phòng trống. Liên hệ để được báo khi có phòng.</p> : (
          <div className="grid listings">
            {list.map((l) => (
              <Link key={l.id} to={`/phong/${l.id}`} className="card listing">
                {l.photos?.[0] ? <img className="cover" src={l.photos[0]} alt={l.name || l.code} loading="lazy" /> : <div className="cover ph-empty">🏠</div>}
                <b>{l.name || l.code}</b>
                <small>{L.roomType[l.type]} · {l.address}</small>
                <div><Money v={l.rent} />/tháng{l.area ? ` · ${l.area} m²` : ""}</div>
              </Link>
            ))}
          </div>
        )}
        <ContactBox />
        <p className="center-text"><small>Người đang thuê: <Link to="/tai-khoan">đăng nhập</Link> để xem hóa đơn, hợp đồng, báo hỏng.</small></p>
      </main>
    </div>
  );
}
