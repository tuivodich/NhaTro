import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useI18n } from "../i18n";
import type { Listing } from "../lib/types";
import Money from "../components/Money";
import { ContactBox, PublicHeader } from "./Landing";
import RequestForm from "../components/RequestForm";

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
        <Link to="/">‹ Tất cả phòng</Link>
        {l === undefined ? <p>Đang tải…</p> : !l ? <p>Phòng này đã được thuê hoặc không còn hiển thị.</p> : <>
          <h1>{l.name || l.code}</h1>
          <p>{L.roomType[l.type]} · {l.propertyName} · {l.address}</p>
          {!!l.photos?.length && <div className="gallery">
            <img className="big" src={l.photos[i]} alt="" />
            <div className="thumbs">{l.photos.map((p, k) => <button key={p} className={`ghost${k === i ? " on" : ""}`} onClick={() => setI(k)}><img src={p} alt="" /></button>)}</div>
          </div>}
          <div className="card">
            <div><b>Giá thuê: <Money v={l.rent} />/tháng</b></div>
            {l.area && <div>Diện tích: {l.area} m²</div>}
            {l.maxPeople && <div>Tối đa {l.maxPeople} người</div>}
            {l.amenities && <div>Tiện nghi: {l.amenities}</div>}
            {l.desc && <p className="pre">{l.desc}</p>}
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.address)}`} target="_blank" rel="noreferrer">📍 Xem bản đồ</a>
          </div>
          <RequestForm listing={l} />
          <ContactBox />
        </>}
      </main>
    </div>
  );
}
