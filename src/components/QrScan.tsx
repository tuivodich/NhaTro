import { useEffect, useRef, useState } from "react";

/**
 * Quét mã QR bằng camera (BarcodeDetector có sẵn trên Chrome Android / Edge / Safari mới).
 * Trình duyệt không hỗ trợ: dán chuỗi đọc được từ ứng dụng quét QR khác.
 */
export default function QrScan({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState("");
  const [manual, setManual] = useState("");
  const supported = typeof window !== "undefined" && "BarcodeDetector" in window;

  useEffect(() => {
    if (!supported) return;
    let stream: MediaStream | null = null, stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const det = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
        const tick = async () => {
          if (stop || !video.current) return;
          try { const r = await det.detect(video.current); if (r[0]?.rawValue) { onResult(r[0].rawValue); return; } } catch { /* khung hình chưa sẵn sàng */ }
          setTimeout(tick, 250);
        };
        tick();
      } catch (e) { setErr("Không mở được camera: " + (e as Error).message); }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [supported, onResult]);

  return (
    <div className="qrscan">
      {supported && !err && <video ref={video} playsInline muted className="qrvideo" />}
      {(!supported || err) && <p><small>{err || "Trình duyệt này chưa hỗ trợ quét QR trực tiếp."} Dán chuỗi QR (dạng <code>Số CCCD|CMND|Họ tên|…</code>):</small></p>}
      <div className="row">
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="079099012345|…" />
        <button type="button" onClick={() => manual && onResult(manual)}>Dùng</button>
        <button type="button" className="ghost" onClick={onClose}>Đóng</button>
      </div>
    </div>
  );
}
