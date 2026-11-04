import { useEffect, useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useSite } from "../lib/site";
import { useAudit } from "../lib/audit";
import { NAME_MAX, THEME_IDS, THEME_INFO, type ThemeId } from "../lib/themeConfig";

/**
 * Chủ chọn giao diện và tên website (lưu settings/app, ai cũng đọc được). Bấm thẻ để xem thử ngay trên trang này
 * (chưa lưu); bấm Lưu mới áp dụng cho mọi người; rời trang mà chưa lưu thì trở về giao diện đang dùng.
 */
export default function ThemePicker() {
  const { settings, setPreview } = useSite();
  const audit = useAudit();
  const [theme, setTheme] = useState<ThemeId>(settings.theme);
  const [name, setName] = useState(settings.name);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const dirty = theme !== settings.theme || name.trim() !== settings.name;

  // Cài đặt thật đổi (đọc xong từ máy chủ, hoặc người khác lưu) mà đang không sửa dở thì cập nhật theo.
  useEffect(() => { if (!dirty) { setTheme(settings.theme); setName(settings.name); } }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps
  // Rời trang: bỏ xem thử.
  useEffect(() => () => setPreview(null), [setPreview]);

  const pick = (id: ThemeId) => { setTheme(id); setPreview(id === settings.theme ? null : id); setMsg(""); };
  const save = async () => {
    setBusy(true); setErr(""); setMsg("");
    try {
      await setDoc(doc(db, "settings", "app"), { theme, name: name.trim().slice(0, NAME_MAX) || settings.name });
      setPreview(null);
      audit("settings.theme", `Đổi giao diện: ${THEME_INFO[theme].name}`);
      setMsg("✅ Đã lưu. Giao diện mới áp dụng cho mọi người ngay.");
    } catch (e) { setErr("Không lưu được: " + (e as Error).message); } finally { setBusy(false); }
  };
  const reset = () => { setTheme(settings.theme); setName(settings.name); setPreview(null); setMsg(""); setErr(""); };

  return (
    <div className="card" id="site-theme">
      <h3>Giao diện website</h3>
      <p><small>Áp dụng cho trang công khai, cổng người thuê và cả trang quản trị. Bấm vào thẻ để xem thử ngay, bấm <b>Lưu</b> để áp dụng cho mọi người. Có thể xem thử riêng bằng đường dẫn <code>?theme=tretrung</code>.</small></p>
      <div className="theme-grid" role="radiogroup" aria-label="Giao diện website">
        {THEME_IDS.map((id) => (
          <button key={id} type="button" role="radio" aria-checked={theme === id} className={`theme-card${theme === id ? " on" : ""}`} onClick={() => pick(id)}>
            <span className="theme-thumb" data-theme={id} aria-hidden="true"><span className="tt-head" /><span className="tt-hero" /><span className="tt-cards"><i /><i /><i /></span></span>
            <b>{THEME_INFO[id].name}{settings.theme === id ? " · đang dùng" : ""}</b>
            <small>{THEME_INFO[id].desc}</small>
          </button>
        ))}
      </div>
      <label>Tên hiển thị của website<input value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} /></label>
      <div className="row">
        <button type="button" disabled={!dirty || busy} onClick={save}>Lưu giao diện</button>
        <button type="button" className="ghost" disabled={!dirty || busy} onClick={reset}>Hủy</button>
      </div>
      {msg && <p role="status">{msg}</p>}
      {err && <p className="error">{err}</p>}
    </div>
  );
}
