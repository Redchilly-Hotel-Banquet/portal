"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** The QR code for a reward's verification link, drawn in the browser, in the same colours the generated one uses. */
export function useQrDataUrl(url: string | undefined, width = 320): string {
  const [dataUrl, setDataUrl] = useState("");
  useEffect(() => {
    let alive = true;
    if (!url) { setDataUrl(""); return; }
    QRCode.toDataURL(url, { margin: 1, width, color: { dark: "#5d070c", light: "#fff9ef" } })
      .then((value) => { if (alive) setDataUrl(value); })
      .catch(() => { if (alive) setDataUrl(""); });
    return () => { alive = false; };
  }, [url, width]);
  return dataUrl;
}

export function QrImage({ url, size = 80, label }: { url?: string; size?: number; label: string }) {
  const src = useQrDataUrl(url, Math.max(160, size * 2));
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt={label} width={size} height={size} className="rounded-sm border border-border bg-white" /> : <div style={{ width: size, height: size }} className="rounded-sm border border-dashed border-border" aria-hidden />;
}
