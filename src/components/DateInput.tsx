import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { maskDMY, maskDMYHM, parseDMY, parseDMYHM, toDMY, toDMYHM } from "../lib/dates";

interface Props {
  value: string; onChange: (v: string) => void; min?: string; max?: string; required?: boolean; id?: string; disabled?: boolean;
  /** Giờ phút kèm theo (dd/mm/yyyy HH:mm); giá trị dạng yyyy-mm-ddTHH:mm. */
  withTime?: boolean;
}

/**
 * Ô ngày luôn hiện và nhận dạng dd/mm/yyyy: gõ tay (tự chèn dấu "/", kiểm tra ngày có thật kể cả năm nhuận, đúng khoảng min/max)
 * hoặc bấm biểu tượng lịch để chọn bằng bảng lịch của thiết bị. Chỉ đẩy giá trị lên khi ngày đã hợp lệ; ngày sai/chưa đủ báo lỗi
 * ngay dưới ô và chặn gửi biểu mẫu. Dữ liệu vẫn là yyyy-mm-dd.
 */
export default function DateInput({ value, onChange, min, max, required, id, disabled, withTime }: Props) {
  const { lang } = useI18n();
  const vi = lang === "vi";
  const show = (v: string) => (withTime ? toDMYHM(v) : toDMY(v));
  const parse = withTime ? parseDMYHM : parseDMY;
  const mask = withTime ? maskDMYHM : maskDMY;
  const len = withTime ? 16 : 10;
  const [text, setText] = useState(show(value));
  const [err, setErr] = useState("");
  const [focused, setFocused] = useState(false);
  const inp = useRef<HTMLInputElement>(null);
  const native = useRef<HTMLInputElement>(null);

  // Giá trị đổi từ bên ngoài (bảng lịch, nút khác) khi đang không gõ thì cập nhật chữ hiển thị.
  useEffect(() => { if (!focused) { setText(show(value)); setErr(""); } }, [value, focused]); // eslint-disable-line react-hooks/exhaustive-deps

  const problem = (iso: string | null, raw: string): string => {
    if (!raw.trim()) return required ? (vi ? "Vui lòng nhập ngày." : "Please enter a date.") : "";
    if (!iso) return raw.length < len ? (vi ? `Nhập đủ ngày theo dạng ${withTime ? "dd/mm/yyyy HH:mm" : "dd/mm/yyyy"}.` : `Enter the full date as ${withTime ? "dd/mm/yyyy HH:mm" : "dd/mm/yyyy"}.`) : (vi ? "Ngày không hợp lệ (kiểm tra ngày, tháng, năm)." : "Not a valid date (check day, month, year).");
    const d = iso.slice(0, 10);
    if (min && d < min.slice(0, 10)) return vi ? `Ngày phải từ ${toDMY(min.slice(0, 10))} trở đi.` : `Date must be ${toDMY(min.slice(0, 10))} or later.`;
    if (max && d > max.slice(0, 10)) return vi ? `Ngày không được sau ${toDMY(max.slice(0, 10))}.` : `Date must be ${toDMY(max.slice(0, 10))} or earlier.`;
    return "";
  };

  // Báo cho trình duyệt biết ô đang sai để chặn gửi biểu mẫu (required / form.checkValidity).
  useEffect(() => { inp.current?.setCustomValidity(err); }, [err, text]);

  const edit = (raw: string) => {
    const t = mask(raw);
    setText(t);
    const iso = parse(t);
    if (!t.trim()) { setErr(required ? (vi ? "Vui lòng nhập ngày." : "Please enter a date.") : ""); if (!required) onChange(""); return; }
    if (t.length < len) { setErr(""); return; } // đang gõ dở: chưa báo lỗi
    const p = problem(iso, t);
    setErr(p);
    if (!p && iso) onChange(iso);
  };

  return (
    <span className={`dateinp${err ? " bad" : ""}`}>
      <span className="dateinp-row">
        <input ref={inp} id={id} type="text" inputMode="numeric" autoComplete="off" disabled={disabled} required={required} maxLength={len}
          placeholder={withTime ? "dd/mm/yyyy HH:mm" : "dd/mm/yyyy"} value={text} aria-invalid={!!err}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); if (text.trim() && text.length < len) setErr(problem(null, text)); }}
          onChange={(e) => edit(e.target.value)} />
        <span className="dateinp-pick" title={vi ? "Chọn từ lịch" : "Pick from calendar"}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
          <input ref={native} type={withTime ? "datetime-local" : "date"} tabIndex={-1} aria-label={vi ? "Chọn ngày từ lịch" : "Pick a date from the calendar"} disabled={disabled}
            value={value} min={min} max={max}
            onChange={(e) => { if (e.target.value) { setText(show(e.target.value)); setErr(""); onChange(e.target.value); } }}
            onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* trình duyệt không cho mở: dùng cách gốc */ } }} />
        </span>
      </span>
      {err && <span className="dateinp-err" role="alert">{err}</span>}
    </span>
  );
}

/** Ô ngày giờ dd/mm/yyyy HH:mm (giá trị yyyy-mm-ddTHH:mm). */
export function DateTimeInput(p: Omit<Props, "withTime">) { return <DateInput {...p} withTime />; }
