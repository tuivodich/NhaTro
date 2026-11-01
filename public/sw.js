// Service worker tối giản: cho phép cài ứng dụng lên màn hình điện thoại (PWA). Không lưu đệm dữ liệu (dữ liệu luôn lấy từ Firestore).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
