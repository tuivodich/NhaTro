import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, signOut, sendPasswordResetEmail, type User,
} from "firebase/auth";
import { doc, getDoc, onSnapshot, setDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { UserDoc } from "./types";

interface AuthState {
  user: User | null;
  profile: UserDoc | null;
  loading: boolean;
  login: (email: string, pw: string) => Promise<void>;
  register: (email: string, pw: string) => Promise<void>;
  loginGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}
const Ctx = createContext<AuthState>(null!);

/** Tạo hồ sơ lần đầu: người đầu tiên của hệ thống là Chủ, còn lại là người thuê (chủ cấp quyền nhân viên sau). */
async function ensureProfile(u: User) {
  const ref = doc(db, "users", u.uid);
  if ((await getDoc(ref)).exists()) return;
  const base = { email: u.email ?? "", name: u.displayName ?? "" };
  const boot = await getDoc(doc(db, "meta", "bootstrap"));
  if (!boot.exists()) {
    const b = writeBatch(db);
    b.set(doc(db, "meta", "bootstrap"), { uid: u.uid, createdAt: serverTimestamp() });
    b.set(ref, { ...base, role: "owner" });
    try { await b.commit(); return; } catch { /* có người khác nhanh hơn → làm người thuê */ }
  }
  await setDoc(ref, { ...base, role: "tenant" });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const creating = useRef(false);

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); if (!u) { setProfile(null); setLoading(false); } else setLoading(true); }), []);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (s) => {
      if (s.exists()) { setProfile(s.data() as UserDoc); setLoading(false); return; }
      setProfile(null);
      if (!creating.current) {
        creating.current = true;
        ensureProfile(user).catch((e) => console.error("ensureProfile", e)).finally(() => { creating.current = false; setLoading(false); });
      }
    }, () => setLoading(false));
  }, [user]);

  const value: AuthState = {
    user, profile, loading,
    login: async (email, pw) => { await signInWithEmailAndPassword(auth, email, pw); },
    register: async (email, pw) => { await createUserWithEmailAndPassword(auth, email, pw); },
    loginGoogle: async () => { const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" }); await signInWithPopup(auth, p); },
    resetPassword: (email) => sendPasswordResetEmail(auth, email),
    logout: () => signOut(auth),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
