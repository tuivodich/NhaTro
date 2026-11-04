import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useI18n } from "../i18n";
import { formatVnd } from "../lib/format";
import type { Listing } from "../lib/types";
import RequestForm from "../components/RequestForm";
import { ContactBox, PublicFooter, PublicHeader } from "./Landing";

export default function ListingPage() {
  const { id = "" } = useParams();
  const { L } = useI18n();
  const [l, setL] = useState<Listing | null | undefined>(undefined);
  const [i, setI] = useState(0);
  useEffect(() => { getDoc(doc(db, "listings", id)).then((s) => setL(s.exists() ? ({ ...(s.data() as Listing), id: s.id }) : null)).catch(() => setL(null)); }, [id]);
  return (
    <div className="pub">
      <PublicHeader />
      <main className="pub-main">
        <Link className="back-link" to="/#phong">‹ Tất cả phòng</Link>
        {l === undefined ? <p>Đang tải…</p> : !l ? <p>Phòng này đã được thuê hoặc không còn hiển thị.</p> : (
          <div className="detail">
            <div className="detail-main">
              <div className="gallery">
                {l.photos?.length ? <>
                  <img className="big" src={l.photos[i]} alt={l.name || l.code} />
                  {l.photos.length > 1 && <div className="thumbs">{l.photos.map((p, k) => <button key={p} className={`ghost${k === i ? " on" : ""}`} onClick={() => setI(k)} aria-label={`Ảnh ${k + 1}`}><img src={p} alt="" /></button>)}</div>}
                </> : <div className="ph-empty">Chưa có ảnh phòng</div>}
              </div>
              <h1>{l.name || l.code}</h1>
              <div className="listing-addr"><span>{L.roomType[l.type]} · {l.address || l.propertyName}</span></div>
              <div className="price-big"><b>{formatVnd(l.rent)}</b><span>/tháng</span></div>
              <div className="facts">
                {l.area ? <span className="fact">{l.area} m²</span> : null}
                {l.maxPeople ? <span className="fact">Tối đa {l.maxPeople} người</span> : null}
                <span className="fact">Còn trống</span>
              </div>
              {l.desc && <><h2>Mô tả</h2><p className="pre">{l.desc}</p></>}
              {l.amenities && <><h2>Tiện nghi</h2><p>{l.amenities}</p></>}
              <p><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.address)}`} target="_blank" rel="noreferrer">📍 Xem bản đồ</a></p>
            </div>
            <div className="detail-side">
              <RequestForm listing={l} />
              <ContactBox id="lien-he-phong" />
            </div>
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
