// app/(culcept)/talk/qr/QRPageClient.tsx
// QR コードフルスクリーンページ — スキャン / マイ QR コード
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

type Mode = "scan" | "myqr";

export default function QRPageClient() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("scan");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannedUrl, setScannedUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // シェアURL取得
  useEffect(() => {
    fetch("/api/genome-card/share")
      .then(r => r.ok ? r.json() : null)
      .then(data => data?.shareUrl && setShareUrl(data.shareUrl))
      .catch(() => {});
  }, []);

  // カメラ起動
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 720 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {/* AbortError: interrupted by new load */});
      }
    } catch {
      setCameraError("カメラにアクセスできません");
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
  }, []);

  // QR スキャンループ（jsQR を動的 import）
  const startScanning = useCallback(async () => {
    const jsQRModule = await import("jsqr").catch(() => null);
    const jsQR = jsQRModule?.default;
    if (!jsQR) {
      setCameraError("QR スキャナーの読み込みに失敗しました");
      return;
    }

    scanIntervalRef.current = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code?.data) {
        // Aneurasync のシェアリンクか判定
        const url = code.data;
        if (url.includes("/genome-card/share/") || url.includes("/genome-card/connect/")) {
          setScannedUrl(url);
          stopCamera();
        }
      }
    }, 250);
  }, [stopCamera]);

  // mode 切り替え時のカメラ制御
  useEffect(() => {
    if (mode === "scan") {
      startCamera().then(startScanning);
    } else {
      stopCamera();
    }
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // スキャン成功 → 遷移
  useEffect(() => {
    if (scannedUrl) {
      try {
        const url = new URL(scannedUrl);
        router.push(url.pathname);
      } catch {
        router.push(scannedUrl);
      }
    }
  }, [scannedUrl, router]);

  const handleClose = useCallback(() => {
    stopCamera();
    router.back();
  }, [stopCamera, router]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#000" }}>
      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}>
        <button
          onClick={handleClose}
          className="w-10 h-10 flex items-center justify-center rounded-full transition-all active:scale-90"
          aria-label="閉じる"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 relative flex flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          {mode === "scan" ? (
            <motion.div
              key="scan"
              className="w-full h-full flex flex-col items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* Camera view */}
              <div className="relative">
                <video
                  ref={videoRef}
                  className="rounded-2xl"
                  style={{ width: "min(80vw, 320px)", height: "min(80vw, 320px)", objectFit: "cover" }}
                  playsInline
                  muted
                />
                {/* スキャンフレーム */}
                <div className="absolute inset-0 pointer-events-none" style={{ width: "min(80vw, 320px)", height: "min(80vw, 320px)" }}>
                  {/* 四隅のコーナー */}
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" fill="none">
                    {/* 左上 */}
                    <path d="M2 15 L2 2 L15 2" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                    {/* 右上 */}
                    <path d="M85 2 L98 2 L98 15" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                    {/* 左下 */}
                    <path d="M2 85 L2 98 L15 98" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                    {/* 右下 */}
                    <path d="M85 98 L98 98 L98 85" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>
                <canvas ref={canvasRef} className="hidden" />
              </div>

              {cameraError && (
                <p className="mt-4 text-sm text-white/60 text-center">{cameraError}</p>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="myqr"
              className="w-full flex flex-col items-center justify-center px-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* QR コード表示 */}
              <div className="rounded-3xl p-6 flex flex-col items-center" style={{ background: "white" }}>
                {shareUrl ? (
                  <QRCodeSVG value={shareUrl} size={220} />
                ) : (
                  <div className="w-[220px] h-[220px] flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
                  </div>
                )}
                <p className="mt-3 text-xs text-center" style={{ color: "#8888a0" }}>
                  相手にこのコードを読み取ってもらいましょう
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom controls */}
      <div className="relative z-10 pb-6 flex flex-col items-center gap-4"
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}>
        {/* Mode toggle pill */}
        <button
          onClick={() => setMode(m => m === "scan" ? "myqr" : "scan")}
          className="flex items-center gap-2 px-5 py-3 rounded-full transition-all active:scale-95"
          style={{
            background: "rgba(255,255,255,0.15)",
            backdropFilter: "blur(10px)",
          }}
        >
          {mode === "scan" ? (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="8" height="8" rx="1" />
                <rect x="14" y="2" width="8" height="8" rx="1" />
                <rect x="2" y="14" width="8" height="8" rx="1" />
                <rect x="14" y="14" width="4" height="4" rx="0.5" />
              </svg>
              <span className="text-sm font-medium text-white">マイ QR コード</span>
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round">
                <path d="M1 4v-1a2 2 0 012-2h2" />
                <path d="M19 2h2a2 2 0 012 2v1" />
                <path d="M1 20v1a2 2 0 002 2h2" />
                <path d="M19 23h2a2 2 0 002-2v-1" />
                <line x1="1" y1="12" x2="23" y2="12" />
              </svg>
              <span className="text-sm font-medium text-white">スキャン</span>
            </>
          )}
        </button>

        {/* 説明テキスト */}
        <p className="text-xs text-white/50 text-center px-8">
          {mode === "scan"
            ? "QR コードをスキャンして友だち追加などの機能を利用できます。"
            : "この QR コードを相手に読み取ってもらうとカード交換が始まります。"
          }
        </p>
      </div>
    </div>
  );
}

/* ── QR Code SVG Generator ── */
// 軽量 QR 生成コンポーネント（qrcode ライブラリ不使用、Canvas → SVG）
function QRCodeSVG({ value, size = 200 }: { value: string; size?: number }) {
  const [svgContent, setSvgContent] = useState<string | null>(null);

  useEffect(() => {
    // 動的 import で qrcode を使う（なければ簡易表示）
    import("qrcode")
      .then(QRCode => {
        return QRCode.toString(value, {
          type: "svg",
          width: size,
          margin: 1,
          color: { dark: "#1a1a2e", light: "#ffffff" },
        });
      })
      .then(svg => setSvgContent(svg))
      .catch(() => {
        // ライブラリなし → URL表示のフォールバック
        setSvgContent(null);
      });
  }, [value, size]);

  if (!svgContent) {
    return (
      <div
        className="flex items-center justify-center rounded-xl"
        style={{ width: size, height: size, background: "#f4f0f8" }}
      >
        <p className="text-xs text-center px-4 break-all" style={{ color: "#8888a0" }}>
          {value}
        </p>
      </div>
    );
  }

  return <div dangerouslySetInnerHTML={{ __html: svgContent }} />;
}
