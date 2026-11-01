import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

// Cấu hình web của Firebase KHÔNG phải bí mật (trình duyệt nào cũng thấy); bảo mật do firestore.rules / storage.rules đảm nhiệm.
// Nên giới hạn API key theo tên miền trong Google Cloud Console → APIs & Services → Credentials.
const firebaseConfig = {
  apiKey: "AIzaSyDnxGIpG51iPHtpKfa3ntmqEX32nFKCBuY",
  authDomain: "vnhatro.firebaseapp.com",
  projectId: "vnhatro",
  storageBucket: "vnhatro.firebasestorage.app",
  messagingSenderId: "768854749321",
  appId: "1:768854749321:web:6a4c103b385e646ec49658",
  measurementId: "G-M35Z0F43FW",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
/** Cloud Functions đặt ở Singapore (gần Việt Nam), khớp REGION trong functions/index.js. */
export const functions = getFunctions(app, "asia-southeast1");
export const call = <I = unknown, O = unknown>(name: string) => httpsCallable<I, O>(functions, name);

// Chỉ dùng khi chạy thử cục bộ với Firebase Emulator (VITE_USE_EMULATOR=1); bản deploy không bật.
if (import.meta.env.VITE_USE_EMULATOR) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8089);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
