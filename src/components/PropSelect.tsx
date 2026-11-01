import { useProps } from "../lib/scoped";

/** Chọn khu trong biểu mẫu. */
export default function PropSelect({ value, onChange, required = true }: { value: string; onChange: (v: string) => void; required?: boolean }) {
  const { props } = useProps();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">— Chọn khu —</option>
      {props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}
