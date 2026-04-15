// components/genome/GenomeCardModal.tsx
// 友だち追加ボトムシート — Talk ページから友達追加アイコンで開く
"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface GenomeCardModalProps {
  open?: boolean;
  onClose?: () => void;
}

export default function GenomeCardModal({ open: controlledOpen, onClose }: GenomeCardModalProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(controlledOpen ?? false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [searchId, setSearchId] = useState("");
  const [searchResult, setSearchResult] = useState<{
    found: boolean;
    user?: { id: string; displayName: string; avatarUrl: string | null; publicId: string };
    connectionStatus?: string | null;
  } | null>(null);
  const [searching, setSearching] = useState(false);
  const [exchangeLoading, setExchangeLoading] = useState(false);

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
    setSearchResult(null);
    setSearchId("");
    onClose?.();
  }, [onClose]);

  // シェアURL生成
  const generateShareUrl = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/genome-card/share");
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

  // My ID 取得
  const fetchMyId = useCallback(async () => {
    try {
      const res = await fetch("/api/genome-card/my-id");
      if (res.ok) {
        const data = await res.json();
        setMyId(data.publicId ?? null);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      if (!shareUrl) generateShareUrl();
      if (!myId) fetchMyId();
    }
  }, [isOpen, shareUrl, myId, generateShareUrl, fetchMyId]);

  // コピー
  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  // 共有（Web Share API）
  const handleShare = useCallback(async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Aneurasync — 友だち追加",
          text: "Genome Card を交換しよう！",
          url: shareUrl,
        });
      } catch {
        // cancelled
      }
    } else {
      // Web Share API 非対応 → コピーにフォールバック
      handleCopy(shareUrl);
    }
  }, [shareUrl, handleCopy]);

  // ID検索
  const handleSearch = useCallback(async () => {
    const id = searchId.trim().toUpperCase();
    if (!id) return;
    setSearching(true);
    setSearchResult(null);
    try {
      const res = await fetch(`/api/genome-card/search?id=${encodeURIComponent(id)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResult(data);
      }
    } catch {
      // silent
    } finally {
      setSearching(false);
    }
  }, [searchId]);

  // カード交換申請
  const handleExchange = useCallback(async (targetId: string) => {
    setExchangeLoading(true);
    try {
      const res = await fetch("/api/genome-card/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: targetId }),
      });
      if (res.ok) {
        setSearchResult(prev => prev ? { ...prev, connectionStatus: "pending" } : prev);
      }
    } catch {
      // silent
    } finally {
      setExchangeLoading(false);
    }
  }, []);

  // リンク再生成
  const handleRegenerate = useCallback(async () => {
    setShareUrl(null);
    await generateShareUrl();
  }, [generateShareUrl]);

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
            className="relative w-full max-w-lg rounded-t-3xl overflow-y-auto"
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
            <div className="px-6 pb-8 pt-2 space-y-5" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}>
              {/* Header */}
              <div className="text-center space-y-1.5">
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
                  友だちを追加
                </h2>
                <p className="text-xs leading-relaxed" style={{ color: "#8888a0" }}>
                  Alter があなたのチャットをサポートできます。
                </p>
              </div>

              {/* ① QR コードで追加 — フルスクリーン遷移 */}
              <button
                onClick={() => {
                  handleClose();
                  router.push("/talk/qr");
                }}
                className="w-full flex items-center gap-4 rounded-2xl p-4 transition-all active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, rgba(139,92,246,0.08), rgba(236,72,153,0.05))",
                  border: "1px solid rgba(139,92,246,0.15)",
                }}
              >
                <div className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #8B5CF6, #7C3AED)" }}>
                  {/* QR icon */}
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="8" height="8" rx="1" />
                    <rect x="14" y="2" width="8" height="8" rx="1" />
                    <rect x="2" y="14" width="8" height="8" rx="1" />
                    <rect x="14" y="14" width="4" height="4" rx="0.5" />
                    <line x1="22" y1="14" x2="22" y2="18" />
                    <line x1="18" y1="22" x2="22" y2="22" />
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold" style={{ color: "#1a1a2e" }}>QR コードで追加</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "#8888a0" }}>見せる or 読み取る</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth={2} strokeLinecap="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              {/* ② 招待リンク */}
              <div className="space-y-2.5">
                <p className="text-xs font-semibold" style={{ color: "#4a4a68" }}>招待リンク</p>
                <div
                  className="rounded-2xl p-3 space-y-2.5"
                  style={{ background: "#f8f6fa", border: "1px solid rgba(139,92,246,0.10)" }}
                >
                  {/* URL 表示 */}
                  <div className="text-xs truncate px-1" style={{ color: "#6a6a88" }}>
                    {loading ? "生成中..." : (shareUrl ?? "読み込み中...")}
                  </div>
                  {/* コピー + 共有 ボタン */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => shareUrl && handleCopy(shareUrl)}
                      disabled={!shareUrl || loading}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-40"
                      style={{
                        background: copied ? "rgba(34,197,94,0.12)" : "white",
                        color: copied ? "#059669" : "#4a4a68",
                        border: "1px solid rgba(0,0,0,0.08)",
                      }}
                    >
                      {copied ? (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                          コピー済み
                        </>
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" />
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                          </svg>
                          コピー
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleShare}
                      disabled={!shareUrl || loading}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-40"
                      style={{
                        background: "linear-gradient(135deg, #8B5CF6, #EC4899)",
                        color: "white",
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                        <polyline points="16 6 12 2 8 6" />
                        <line x1="12" y1="2" x2="12" y2="15" />
                      </svg>
                      共有
                    </button>
                  </div>
                </div>
              </div>

              {/* ③ ID 検索 */}
              <div className="space-y-2.5">
                <p className="text-xs font-semibold" style={{ color: "#4a4a68" }}>ID で検索</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={searchId}
                    onChange={(e) => setSearchId(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="ANRS-XXXX-XXXX"
                    className="flex-1 px-3.5 py-2.5 rounded-xl text-sm outline-none transition-all"
                    style={{
                      background: "#f8f6fa",
                      border: "1px solid rgba(139,92,246,0.12)",
                      color: "#1a1a2e",
                    }}
                  />
                  <button
                    onClick={handleSearch}
                    disabled={!searchId.trim() || searching}
                    className="flex-shrink-0 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-40"
                    style={{ background: "#1a1a2e", color: "white" }}
                  >
                    {searching ? "..." : "検索"}
                  </button>
                </div>

                {/* 検索結果 */}
                {searchResult && (
                  <div className="rounded-xl p-3" style={{ background: "#f8f6fa" }}>
                    {!searchResult.found ? (
                      <p className="text-xs text-center" style={{ color: "#8888a0" }}>
                        ユーザーが見つかりませんでした
                      </p>
                    ) : searchResult.user && (
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                          style={{ background: "linear-gradient(135deg, #8B5CF6, #EC4899)", color: "white" }}>
                          {searchResult.user.displayName?.charAt(0) ?? "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: "#1a1a2e" }}>
                            {searchResult.user.displayName}
                          </p>
                          <p className="text-[10px]" style={{ color: "#8888a0" }}>
                            {searchResult.user.publicId}
                          </p>
                        </div>
                        {searchResult.connectionStatus === "accepted" ? (
                          <span className="text-[11px] font-medium" style={{ color: "#059669" }}>接続済み</span>
                        ) : searchResult.connectionStatus === "pending" ? (
                          <span className="text-[11px] font-medium" style={{ color: "#D97706" }}>申請中</span>
                        ) : (
                          <button
                            onClick={() => handleExchange(searchResult.user!.id)}
                            disabled={exchangeLoading}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all active:scale-95"
                            style={{ background: "linear-gradient(135deg, #8B5CF6, #EC4899)", color: "white" }}
                          >
                            {exchangeLoading ? "..." : "申請"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ④ My ID */}
              <div className="space-y-2">
                <p className="text-xs font-semibold" style={{ color: "#4a4a68" }}>My ID</p>
                <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5"
                  style={{ background: "#f8f6fa", border: "1px solid rgba(0,0,0,0.05)" }}>
                  <span className="flex-1 text-sm font-mono font-medium tracking-wide" style={{ color: "#1a1a2e" }}>
                    {myId ?? "..."}
                  </span>
                  <button
                    onClick={() => myId && handleCopy(myId)}
                    disabled={!myId}
                    className="flex-shrink-0 p-1.5 rounded-lg transition-all active:scale-90 disabled:opacity-30"
                    style={{ background: "rgba(0,0,0,0.05)" }}
                    aria-label="IDをコピー"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* リンク再生成 */}
              <div className="flex items-center justify-center">
                <button
                  onClick={handleRegenerate}
                  disabled={loading}
                  className="text-[11px] transition-all active:opacity-60 disabled:opacity-30"
                  style={{ color: "#8888a0" }}
                >
                  リンクを再生成
                </button>
              </div>

              {/* カード詳細を見る */}
              <Link
                href="/genome-card"
                onClick={handleClose}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-medium transition-all active:scale-[0.97]"
                style={{ background: "rgba(0,0,0,0.04)", color: "#4a4a68" }}
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
