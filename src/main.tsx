import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { I18nProvider } from "./i18n";
import { AuthProvider } from "./lib/auth";
import { SiteProvider } from "./lib/site";
import "./styles.css";
import "./app.css";
import "./public.css";
import "./themes.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <SiteProvider>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </SiteProvider>
    </I18nProvider>
  </StrictMode>,
);

// PWA: cài lên màn hình điện thoại như ứng dụng (service worker tối giản).
if ("serviceWorker" in navigator && !import.meta.env.DEV) navigator.serviceWorker.register("/sw.js").catch(() => {});
