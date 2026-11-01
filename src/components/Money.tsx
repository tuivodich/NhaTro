import { formatVnd } from "../lib/format";
export default function Money({ v, className }: { v: number; className?: string }) {
  return <span className={`money${v < 0 ? " neg" : ""}${className ? " " + className : ""}`}>{formatVnd(v)}</span>;
}
