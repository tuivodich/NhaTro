/** Giao diện website (không phụ thuộc Firebase để test được bằng node). Chủ chọn ở Cài đặt → lưu trong settings/app. */
export type ThemeId = "sang" | "tretrung" | "go";
export const THEME_IDS: ThemeId[] = ["sang", "tretrung", "go"];
export const DEFAULT_THEME: ThemeId = "sang";

export const THEME_INFO: Record<ThemeId, { name: string; desc: string }> = {
  sang: { name: "Tươi sáng", desc: "Xanh da trời, vàng nắng, bo tròn mềm mại, thân thiện." },
  tretrung: { name: "Trẻ trung", desc: "Tím, hồng, xanh chanh, viền đậm, năng động." },
  go: { name: "Gỗ & rừng", desc: "Kem ấm, xanh rừng, nâu gỗ (giao diện đầu tiên)." },
};

export const DEFAULT_SITE_NAME = "Nhà Trọ Việt";
export const NAME_MAX = 60;

export interface SiteSettings { theme: ThemeId; name: string }
export const DEFAULT_SETTINGS: SiteSettings = { theme: DEFAULT_THEME, name: DEFAULT_SITE_NAME };

export const isTheme = (v: unknown): v is ThemeId => typeof v === "string" && (THEME_IDS as string[]).includes(v);

/** Đọc settings/app: thiếu hoặc sai thì dùng mặc định. */
export function parseSettings(data: Record<string, unknown> | undefined | null): SiteSettings {
  const name = typeof data?.name === "string" ? data.name.trim().slice(0, NAME_MAX) : "";
  return { theme: isTheme(data?.theme) ? data!.theme : DEFAULT_THEME, name: name || DEFAULT_SITE_NAME };
}

/** Xem thử một giao diện bằng đường dẫn ?theme=tretrung (chỉ trên trình duyệt đang xem, không lưu). */
export function previewFromSearch(search: string): ThemeId | null {
  const v = new URLSearchParams(search).get("theme");
  return isTheme(v) ? v : null;
}

/** Khóa nhớ giao diện ở trình duyệt (trang index.html đọc cùng khóa này để tránh chớp giao diện cũ). */
export const CACHE_KEY = "nhatro.site";
