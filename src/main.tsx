import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { I18nProvider } from "./i18n";
import { AuthProvider } from "./lib/auth";
import "./styles.css";
import "./app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  </StrictMode>,
);

// PWA: cài lên màn hình điện thoại như ứng dụng (service worker tối giản).
if ("serviceWorker" in navigator && !import.meta.env.DEV) navigator.serviceWorker.register("/sw.js").catch(() => {});
