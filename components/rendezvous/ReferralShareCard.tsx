"use client";

/**
 * ReferralShareCard
 * 紹介コード表示 + SNS別シェア機能
 */

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";

/* ── Share text helpers ── */
function buildShareText(code: string) {
  return `Rendezvousで繋がろう！招待コード: ${code}\nhttps://aneurasync.com/rendezvous/invite?code=${code}`;
}

function buildShareUrl(code: string) {
  return `https://aneurasync.com/rendezvous/invite?code=${code}`;
}

/* ── SVG Icons ── */
function LineIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function SystemShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

/* ── Circular icon button style ── */
const ICON_SIZE = 44;

function ShareIconButton({
  onClick,
  background,
  label,
  children,
}: {
  onClick: () => void;
  background: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        width: ICON_SIZE,
        height: ICON_SIZE,
        borderRadius: "50%",
        border: "none",
        background,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "transform 0.15s ease, opacity 0.15s ease",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.08)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      {children}
    </button>
  );
}

export default function ReferralShareCard() {
  const [code, setCode] = useState("");
  const [totalReferred, setTotalReferred] = useState(0);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [igCopied, setIgCopied] = useState(false);

  useEffect(() => {
    fetch("/api/rendezvous/referral")
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) {
          setCode(res.referralCode);
          setTotalReferred(res.totalReferred);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  /* ── クリップボードコピー（コード） ── */
  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const input = document.createElement("input");
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
  }, []);

  const handleCopy = useCallback(async () => {
    await copyToClipboard(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code, copyToClipboard]);

  /* ── LINE シェア ── */
  const handleLineShare = useCallback(() => {
    const text = buildShareText(code);
    window.open(`https://line.me/R/share?text=${encodeURIComponent(text)}`, "_blank");
  }, [code]);

  /* ── X (Twitter) シェア ── */
  const handleXShare = useCallback(() => {
    const text = buildShareText(code);
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
  }, [code]);

  /* ── Instagram（コピー → Instagram を開く） ── */
  const handleInstagramShare = useCallback(async () => {
    const text = buildShareText(code);
    await copyToClipboard(text);
    setIgCopied(true);
    setTimeout(() => setIgCopied(false), 2500);
    window.open("https://www.instagram.com/", "_blank");
  }, [code, copyToClipboard]);

  /* ── Facebook シェア ── */
  const handleFacebookShare = useCallback(() => {
    const url = buildShareUrl(code);
    const text = buildShareText(code);
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`,
      "_blank",
    );
  }, [code]);

  /* ── AirDrop / システムシェア ── */
  const handleSystemShare = useCallback(async () => {
    const text = buildShareText(code);
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch { /* ユーザーキャンセル */ }
    } else {
      await copyToClipboard(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code, copyToClipboard]);

  if (loading) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        padding: "20px",
        borderRadius: 16,
        background: "linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(168,85,247,0.06) 100%)",
        border: "1px solid rgba(99,102,241,0.1)",
      }}
    >
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1E1E3C", marginBottom: 8 }}>
        友達を招待する
      </h3>
      <p style={{ fontSize: 11, color: "rgba(30,30,60,0.5)", marginBottom: 14, lineHeight: 1.5 }}>
        紹介コードをシェアして、Rendezvousの輪を広げよう
      </p>

      {/* Code display */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 16px",
          borderRadius: 12,
          background: "rgba(255,255,255,0.8)",
          border: "1px dashed rgba(99,102,241,0.2)",
          marginBottom: 12,
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: 18,
            fontWeight: 800,
            color: "#6366F1",
            fontFamily: "'JetBrains Mono','SF Mono',monospace",
            letterSpacing: 2,
          }}
        >
          {code}
        </span>
        <button
          onClick={handleCopy}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid rgba(99,102,241,0.15)",
            background: copied ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.8)",
            fontSize: 11,
            fontWeight: 600,
            color: copied ? "#22C55E" : "#6366F1",
            cursor: "pointer",
          }}
        >
          {copied ? "コピー済み" : "コピー"}
        </button>
      </div>

      {/* Stats */}
      {totalReferred > 0 && (
        <p style={{ fontSize: 11, color: "rgba(30,30,60,0.4)", marginBottom: 12 }}>
          {totalReferred}人が参加しました
        </p>
      )}

      {/* Share buttons row */}
      <div style={{ marginBottom: 8 }}>
        <p style={{ fontSize: 11, color: "rgba(30,30,60,0.45)", marginBottom: 10, fontWeight: 600 }}>
          シェアする
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          {/* LINE */}
          <ShareIconButton onClick={handleLineShare} background="#06C755" label="LINEで送る">
            <LineIcon />
          </ShareIconButton>

          {/* X (Twitter) */}
          <ShareIconButton onClick={handleXShare} background="#000000" label="Xでシェア">
            <XIcon />
          </ShareIconButton>

          {/* Instagram */}
          <ShareIconButton
            onClick={handleInstagramShare}
            background="linear-gradient(135deg, #833AB4, #FD1D1D, #F77737)"
            label="コピーしてInstagramで共有"
          >
            <InstagramIcon />
          </ShareIconButton>

          {/* Facebook */}
          <ShareIconButton onClick={handleFacebookShare} background="#1877F2" label="Facebookでシェア">
            <FacebookIcon />
          </ShareIconButton>

          {/* AirDrop / System share */}
          <ShareIconButton
            onClick={handleSystemShare}
            background="rgba(99,102,241,0.12)"
            label="その他"
          >
            <span style={{ color: "#6366F1" }}>
              <SystemShareIcon />
            </span>
          </ShareIconButton>
        </div>

        {/* Instagram コピー済みトースト */}
        {igCopied && (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              fontSize: 11,
              color: "#22C55E",
              textAlign: "center",
              marginTop: 8,
              fontWeight: 600,
            }}
          >
            招待文をコピーしました — Instagramに貼り付けてください
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}
