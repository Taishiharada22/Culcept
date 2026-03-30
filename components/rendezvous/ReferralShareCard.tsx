"use client";

/**
 * ReferralShareCard
 * 紹介コード表示 + シェア機能
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

export default function ReferralShareCard() {
  const [code, setCode] = useState("");
  const [totalReferred, setTotalReferred] = useState(0);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement("input");
      input.value = code;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = async () => {
    const shareText = `Rendezvousで繋がろう！紹介コード: ${code}\nhttps://aneurasync.com/rendezvous/invite?code=${code}`;
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText });
      } catch {}
    } else {
      handleCopy();
    }
  };

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

      {/* Share button */}
      <button
        onClick={handleShare}
        style={{
          width: "100%",
          padding: "12px",
          borderRadius: 12,
          border: "none",
          background: "linear-gradient(135deg, #6366F1, #A855F7)",
          color: "#fff",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        シェアする
      </button>
    </motion.div>
  );
}
