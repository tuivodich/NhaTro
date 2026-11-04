import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { CACHE_KEY, DEFAULT_SETTINGS, parseSettings, previewFromSearch, type SiteSettings, type ThemeId } from "./themeConfig";

interface SiteCtx { settings: SiteSettings; theme: ThemeId; name: string; setPreview: (t: ThemeId | null) => void }
const Ctx = createContext<SiteCtx>({ settings: DEFAULT_SETTINGS, theme: DEFAULT_SETTINGS.theme, name: DEFAULT_SETTINGS.name, setPreview: () => {} });

function readCache(): SiteSettings {
  try { const raw = localStorage.getItem(CACHE_KEY); if (raw) return parseSettings(JSON.parse(raw)); } catch { /* không có bộ nhớ trình duyệt */ }
  return DEFAULT_SETTINGS;
}

/**
 * Giao diện và tên website. Lần đầu dùng bản đã nhớ ở trình duyệt (tránh chớp giao diện mặc định), rồi cập nhật ngay khi đọc được
 * settings/app từ Firestore (ai cũng đọc được). Gắn giao diện vào <html data-theme> để CSS đổi toàn bộ trang.
 */
export function SiteProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(readCache);
  const [preview, setPreview] = useState<ThemeId | null>(null);
  useEffect(() => onSnapshot(doc(db, "settings", "app"), (s) => {
    const next = parseSettings(s.data());
    setSettings(next);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { /* bỏ qua */ }
  }, () => {}), []);
  const urlPreview = typeof location === "undefined" ? null : previewFromSearch(location.search);
  const theme = preview ?? urlPreview ?? settings.theme;
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const value = useMemo(() => ({ settings, theme, name: settings.name, setPreview }), [settings, theme]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useSite = () => useContext(Ctx);
