import { useEffect, type ReactNode } from "react";

/** Hộp thoại đơn giản: bấm nền hoặc Esc để đóng. */
export default function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`card modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between"><h3>{title}</h3><button type="button" className="ghost" onClick={onClose} aria-label="Đóng">✕</button></div>
        {children}
      </div>
    </div>
  );
}
