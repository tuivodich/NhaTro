import { addDoc, collection, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { useEffect } from "react";
import { db } from "./firebase";
import { useAuth } from "./auth";

/** Công tắc ghi nhật ký (settings/audit, chỉ chủ đổi). Dùng chung một lượt lắng nghe cho mọi nơi gọi useAudit(); mặc định bật. */
let auditOn = true;
let watchers = 0;
let stop: (() => void) | null = null;
function watchAuditSwitch() {
  if (watchers++ === 0) stop = onSnapshot(doc(db, "settings", "audit"), (s) => { auditOn = s.data()?.enabled !== false; }, () => { auditOn = true; });
  return () => { if (--watchers === 0) { stop?.(); stop = null; } };
}
export const isAuditOn = () => auditOn;

export interface AuditEntry { id: string; at?: { toDate(): Date }; by: string; byName: string; role?: string; action: string; summary: string; targetType?: string; targetId?: string }

/**
 * Nhật ký hoạt động: ghi lại ai làm gì (đổi trạng thái đặt phòng, sửa giá, thu/hoàn tiền, đổi hạng, đổi vai trò…).
 * Bản ghi chỉ thêm, không sửa/xóa (luật Firestore). Ghi lỗi chỉ in ra console, không làm hỏng thao tác chính.
 */
export function useAudit() {
  const { user, profile } = useAuth();
  useEffect(() => { if (user) return watchAuditSwitch(); }, [user]);
  return (action: string, summary: string, target?: { type: string; id: string }) => {
    if (!user || !auditOn) return;
    addDoc(collection(db, "auditLog"), {
      at: serverTimestamp(), by: user.uid, byName: (profile?.name || user.displayName || user.email || "").slice(0, 100), role: profile?.role ?? "",
      action: action.slice(0, 40), summary: summary.slice(0, 300), targetType: target?.type ?? "", targetId: (target?.id ?? "").slice(0, 100),
    }).catch((e) => console.error("audit", e));
  };
}
