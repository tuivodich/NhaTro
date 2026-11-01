/**
 * Đọc dữ liệu theo khu. Luật Firestore chỉ cho quản lý/nhân viên truy vấn `where("propertyId","==",khu)` của khu được giao,
 * nên với người không phải chủ ta mở một luồng lắng nghe cho mỗi khu rồi gộp lại. Chủ đọc cả bộ sưu tập.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { collection, doc, onSnapshot, query, where, type QueryConstraint } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./auth";
import type { Property } from "./types";

export function myPropIds(profile: { role: string; props?: Record<string, boolean> } | null): string[] | "all" {
  if (!profile) return [];
  if (profile.role === "owner") return "all";
  if (profile.role === "manager" || profile.role === "staff") return Object.keys(profile.props ?? {}).filter((k) => profile.props?.[k]);
  return [];
}

export function useScoped<T extends { id: string }>(name: string, enabled = true, extra: QueryConstraint[] = []) {
  const { profile } = useAuth();
  const scope = myPropIds(profile);
  const key = scope === "all" ? "all" : scope.join(",");
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!enabled || !profile) return;
    const parts = new Map<string, T[]>();
    const emit = () => { setData([...parts.values()].flat()); setLoading(false); };
    const targets = scope === "all" ? [null] : scope;
    if (!targets.length) { setData([]); setLoading(false); return; }
    const unsubs = targets.map((pid) => onSnapshot(
      pid ? query(collection(db, name), where("propertyId", "==", pid), ...extra) : query(collection(db, name), ...extra),
      (s) => { parts.set(pid ?? "*", s.docs.map((d) => ({ ...(d.data() as object), id: d.id }) as T)); emit(); },
      (e) => { console.error(name, e); emit(); },
    ));
    return () => unsubs.forEach((u) => u());
  }, [name, enabled, key, profile?.role]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, loading };
}

/** Danh sách khu mà người dùng làm việc được (chủ: tất cả; còn lại: đọc từng tài liệu). */
function useMyProperties() {
  const { profile } = useAuth();
  const scope = myPropIds(profile);
  const key = scope === "all" ? "all" : scope.join(",");
  const [data, setData] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!profile) return;
    if (scope === "all") return onSnapshot(collection(db, "properties"), (s) => { setData(s.docs.map((d) => ({ ...(d.data() as Property), id: d.id }))); setLoading(false); }, () => setLoading(false));
    const parts = new Map<string, Property>();
    if (!scope.length) { setData([]); setLoading(false); return; }
    const unsubs = scope.map((pid) => onSnapshot(doc(db, "properties", pid), (s) => {
      if (s.exists()) parts.set(pid, { ...(s.data() as Property), id: s.id }); else parts.delete(pid);
      setData([...parts.values()]); setLoading(false);
    }, () => setLoading(false)));
    return () => unsubs.forEach((u) => u());
  }, [key, profile?.role]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data: [...data].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, "vi")), loading };
}

/** Khu đang chọn ở thanh trên ("" = tất cả khu); nhớ trong trình duyệt. */
interface PropCtx { props: Property[]; loading: boolean; current: string; setCurrent: (id: string) => void; byId: Record<string, Property>; inScope: (pid: string) => boolean }
const Ctx = createContext<PropCtx>(null!);
export function PropertyProvider({ children }: { children: ReactNode }) {
  const { data, loading } = useMyProperties();
  const [current, setCur] = useState(() => { try { return localStorage.getItem("nt.prop") ?? ""; } catch { return ""; } });
  const setCurrent = (id: string) => { setCur(id); try { localStorage.setItem("nt.prop", id); } catch { /* bỏ qua */ } };
  const byId = useMemo(() => Object.fromEntries(data.map((p) => [p.id, p])), [data]);
  const cur = current && byId[current] ? current : "";
  return <Ctx.Provider value={{ props: data, loading, current: cur, setCurrent, byId, inScope: (pid) => !cur || pid === cur }}>{children}</Ctx.Provider>;
}
export const useProps = () => useContext(Ctx);
