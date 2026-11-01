import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Mã QR (SVG) cho một đường dẫn; tạo ngay trong trình duyệt, không gọi dịch vụ ngoài. */
export default function QrCode({ value, size = 168, label }: { value: string; size?: number; label: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#14261d", light: "#ffffff" } })
      .then((s) => { if (live) setSvg(s); }).catch((e) => console.error("qr", e));
    return () => { live = false; };
  }, [value]);
  return <div className="qrbox" role="img" aria-label={label} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}
