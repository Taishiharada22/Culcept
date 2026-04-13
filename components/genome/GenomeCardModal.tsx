// components/genome/GenomeCardModal.tsx
// Genome Card モーダル — Talk ページから友達追加アイコンで開く
"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

interface GenomeCardModalProps {
  /** 外部から開閉を制御する場合 */
  open?: boolean;
  onClose?: () => void;
}

export default function GenomeCardModal({ open: controlledOpen, onClose }: GenomeCardModalProps) {
  const [isOpen, setIsOpen] = useState(controlledOpen ?? false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // イベントリスナーで開閉
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener("open-genome-card-modal", handleOpen);
    return () => window.removeEventListener("open-genome-card-modal", handleOpen);
  }, []);

  useEffect(() => {
    if (controlledOpen !== undefined) setIsOpen(controlledOpen);
  }, [controlledOpen]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    onClose?.();
  }, [onClose]);

  // シェアURL生成
  const generateShareUrl = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/genome-card/share", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setShareUrl(data.shareUrl ?? null);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && !shareUrl) {
      generateShareUrl();
    }
  }, [isOpen, shareUrl, generateShareUrl]);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = shareUrl;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [shareUrl]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/40"
            onClick={handleClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal Sheet */}
          <motion.div
            className="relative w-full max-w-lg rounded-t-3xl overflow-hidden"
            style={{
              background: "#ffffff",
              boxShadow: "0 -8px 40px rgba(0,0,0,0.12)",
              maxHeight: "85vh",
            }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-3 right-4 w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-90"
              style={{ background: "rgba(0,0,0,0.06)" }}
              aria-label="閉じる"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={2.5} strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Content */}
            <div className="px-6 pb-8 pt-2 space-y-6" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}>
              {/* Header */}
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl"
                  style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(236,72,153,0.08))" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1" />
                    <circle cx="9" cy="8" r="3" />
                    <line x1="19" y1="8" x2="19" y2="14" />
                    <line x1="16" y1="11" x2="22" y2="11" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold" style={{ color: "#1a1a2e" }}>
                  カード交換
                </h2>
                <p className="text-xs leading-relaxed" style={{ color: "#8888a0" }}>
                  あなたの Genome Card を共有して、<br />
                  相手のカードを受け取りましょう
                </p>
              </div>

              {/* Share Link */}
              <div className="space-y-3">
                <p className="text-xs font-semibold" style={{ color: "#4a4a68" }}>招待リンク</p>
                <div
                  className="flex items-center gap-2 rounded-2xl p-3"
                  style={{ background: "#f8f6fa", border: "1px solid rgba(139,92,246,0.12)" }}
                >
                  <div className="flex-1 min-w-0 text-xs truncate" style={{ color: "#4a4a68" }}>
                    {loading ? "生成中..." : (shareUrl ?? "読み込み中...")}
                  </div>
                  <button
                    onClick={handleCopy}
                    disabled={!shareUrl || loading}
                    className="flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95"
                    style={{
                      background: copied ? "rgba(34,197,94,0.12)" : "linear-gradient(135deg, #8B5CF6, #EC4899)",
                      color: copied ? "#059669" : "white",
                    }}
                  >
                    {copied ? "コピー済み ✓" : "コピー"}
                  </button>
                </div>
              </div>

              {/* QR Code hint */}
              <div
                className="flex items-center gap-3 rounded-2xl p-4"
                style={{ background: "rgba(139,92,246,0.04)", border: "1px solid rgba(139,92,246,0.08)" }}
              >
                <span className="text-2xl">📱</span>
                <div>
                  <p className="text-xs font-semibold" style={{ color: "#1a1a2e" }}>
                    リンクを相手に送信してください
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: "#8888a0" }}>
                    LINE・メール・SNS で送るだけでカード交換が始まります
                  </p>
                </div>
              </div>

              {/* Full page link */}
              <Link
                href="/genome-card"
                onClick={handleClose}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-medium transition-all active:scale-[0.97]"
                style={{
                  background: "rgba(0,0,0,0.04)",
                  color: "#4a4a68",
                }}
              >
                カード詳細を見る →
              </Link>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
