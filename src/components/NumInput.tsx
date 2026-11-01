import { useEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: number | "";
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  /** Cho phép xóa trắng ô (giá trị rỗng được báo lên); mặc định ô trống chỉ là trạng thái đang gõ và trở lại giá trị cũ khi rời ô. */
  allowEmpty?: boolean;
};

/**
 * Ô nhập số dùng được khi xóa/bôi đen để gõ số mới. Ô giữ chuỗi đang gõ riêng và chỉ báo giá trị lên khi đã có số;
 * các ô ép về mức tối thiểu (vd `|| 1`) hoặc về 0 ngay khi xóa sẽ bật lại số cũ nên không gõ lại được.
 * Rời ô thì hiển thị đúng giá trị đã được trang chấp nhận (sau khi giới hạn min/max).
 */
export default function NumInput({ value, onChange, allowEmpty, ...rest }: Props) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(String(value)); }, [value]);
  return (
    <input {...rest} type="number" value={text}
      onFocus={(e) => { focused.current = true; rest.onFocus?.(e); }}
      onBlur={(e) => { focused.current = false; setText(String(value)); rest.onBlur?.(e); }}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value !== "" || allowEmpty) onChange(e);
      }} />
  );
}
