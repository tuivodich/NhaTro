import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { Link, useLocation } from "react-router-dom";

/**
 * Liên kết nội bộ có thể kèm mục neo (`/#booking`). Đang ở đúng trang thì cuộn mượt tới mục đó
 * (kể cả khi bấm lại cùng một mục); ở trang khác thì chuyển trang, trang đích tự cuộn tới mục neo.
 */
export default function HashLink({ to, onClick, children, ...rest }: { to: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const loc = useLocation();
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    const [path, hash] = to.split("#");
    if (hash && (path === "" || path === loc.pathname)) {
      const el = document.getElementById(hash);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: "smooth" });
        history.replaceState(null, "", to);
      }
    }
  };
  return <Link to={to} onClick={click} {...rest}>{children}</Link>;
}
