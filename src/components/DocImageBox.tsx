import { useState } from "react";
import { imageUrl } from "../lib/listings";

/** Ảnh giấy tờ: xem (tải đường dẫn khi bấm, vì ảnh là dữ liệu nhạy cảm) + chụp bằng camera hoặc chọn ảnh có sẵn. */
export default function DocImageBox({ label, path, busy, onPick }: { label: string; path?: string; busy: boolean; onPick: (f?: File) => void }) {
  const [url, setUrl] = useState("");
  const [shownFor, setShownFor] = useState("");
  const show = () => imageUrl(path!).then((u) => { setUrl(u); setShownFor(path!); }).catch(() => alert("Không mở được ảnh"));
  return (
    <div className="col docbox">
      <small><b>{label}</b></small>
      {path ? (url && shownFor === path
        ? <a href={url} target="_blank" rel="noreferrer"><img className="docimg" src={url} alt={label} /></a>
        : <button type="button" className="ghost" onClick={show}>🔒 Xem ảnh</button>)
        : <small className="muted">Chưa có ảnh</small>}
      <div className="row">
        <label className="filebtn">{busy ? "Đang tải…" : "📷 Chụp"}<input type="file" accept="image/*" capture="environment" hidden disabled={busy} onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ""; }} /></label>
        <label className="filebtn">{busy ? "…" : "🖼 Chọn ảnh"}<input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ""; }} /></label>
      </div>
    </div>
  );
}

