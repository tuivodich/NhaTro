import { useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isStaffRole } from "../lib/types";
import { PublicHeader } from "./Landing";

const MSG: Record<string, string> = {
  "auth/invalid-credential": "Sai email hoặc mật khẩu.", "auth/email-already-in-use": "Email đã có tài khoản — hãy đăng nhập.",
  "auth/weak-password": "Mật khẩu cần ít nhất 6 ký tự.", "auth/popup-closed-by-user": "Đã đóng cửa sổ đăng nhập.", "auth/invalid-email": "Email không hợp lệ.",
};

export default function Login() {
  const { user, profile, loading, login, register, loginGoogle, resetPassword } = useAuth();
  const [sp] = useSearchParams();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (user && !loading && profile) return <Navigate to={sp.get("next") || (isStaffRole(profile.role) ? "/app" : "/tai-khoan")} replace />;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr("");
    try { await fn(); } catch (e) { const c = (e as { code?: string }).code ?? ""; setErr(MSG[c] ?? (e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="pub">
      <PublicHeader />
      <main className="pub-main narrow">
        <div className="card">
          <h2>{mode === "in" ? "Đăng nhập" : "Tạo tài khoản"}</h2>
          <button disabled={busy} onClick={() => run(loginGoogle)}>Tiếp tục với Google</button>
          <form className="col" onSubmit={(e) => { e.preventDefault(); run(() => (mode === "in" ? login(email, pw) : register(email, pw))); }}>
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
            <label>Mật khẩu<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} autoComplete={mode === "in" ? "current-password" : "new-password"} /></label>
            {err && <p className="error">{err}</p>}
            <button type="submit" disabled={busy}>{mode === "in" ? "Đăng nhập" : "Tạo tài khoản"}</button>
          </form>
          <div className="row between">
            <button className="ghost" onClick={() => setMode(mode === "in" ? "up" : "in")}>{mode === "in" ? "Chưa có tài khoản? Tạo mới" : "Đã có tài khoản? Đăng nhập"}</button>
            {mode === "in" && <button className="ghost" disabled={!email} onClick={() => run(async () => { await resetPassword(email); setErr("Đã gửi email đặt lại mật khẩu."); })}>Quên mật khẩu</button>}
          </div>
          <small>Người thuê: sau khi đăng nhập, nhập <b>mã mời</b> chủ nhà gửi để xem hóa đơn và hợp đồng của mình.</small>
        </div>
      </main>
    </div>
  );
}
