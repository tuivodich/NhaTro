import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import HashLink from "./HashLink";

/** `heading`: dòng chữ không bấm được (vd. tên tài khoản và vai trò) ở đầu menu. */
export interface DdItem { label: string; to?: string; onClick?: () => void; heading?: boolean; sub?: string; active?: boolean; /** Chữ đỏ nhỏ bên phải mục (vd. “(Mới)”). */ badge?: string }

/** Menu thả xuống: bấm hoặc rê chuột (máy tính) để mở; Esc / bấm ra ngoài / chuyển trang thì đóng. */
export default function Dropdown({ label, items, align = "left", className = "", active = false }: {
  label: string; items: DdItem[]; align?: "left" | "right"; className?: string; active?: boolean;
}) {
  const hasBadge = items.some((i) => i.badge);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const loc = useLocation();

  useEffect(() => { setOpen(false); }, [loc.pathname, loc.hash]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={ref} className={`dd ${className} ${open ? "open" : ""} ${active || items.some((i) => i.active) ? "active" : ""}`}>
      <button type="button" className="dd-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {label}{hasBadge && <span className="dd-dot" aria-hidden="true" />}<span className="dd-caret" aria-hidden="true" />
      </button>
      <div className={`dd-menu ${align === "right" ? "right" : ""}`} role="menu">
        {items.map((it) => it.heading
          ? <div key={it.label} className="dd-who" role="presentation">{it.label}{it.sub && <> <span className="dd-role">({it.sub})</span></>}</div>
          : it.to
          ? <HashLink key={it.label} to={it.to} role="menuitem" className={it.active ? "on" : ""} aria-current={it.active ? "page" : undefined} onClick={() => setOpen(false)}>{it.label}{it.badge && <span className="dd-new">{it.badge}</span>}</HashLink>
          : <button key={it.label} type="button" role="menuitem" onClick={() => { setOpen(false); it.onClick?.(); }}>{it.label}</button>)}
      </div>
    </div>
  );
}
