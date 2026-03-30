"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DailyOracleCard as OracleData } from "@/lib/stargazer/dailyOracleCard";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Colors by family
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const FAMILY_COLORS: Record<string, { from: string; to: string; accent: string }> = {
  purple: { from: "#1a0a2e", to: "#0a0a1a", accent: "#8B5CF6" },
  amber:  { from: "#1a150a", to: "#0a0a1a", accent: "#F59E0B" },
  teal:   { from: "#0a1a1a", to: "#0a0a1a", accent: "#14B8A6" },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Canvas Image Generator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateOracleImage(oracle: OracleData): Promise<Blob | null> {
  return new Promise((resolve) => {
    const W = 1080;
    const H = 1350;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return resolve(null);

    const colors = FAMILY_COLORS[oracle.colorFamily] ?? FAMILY_COLORS.purple;

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, W * 0.3, H);
    grad.addColorStop(0, colors.from);
    grad.addColorStop(1, colors.to);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Subtle radial glow
    const radial = ctx.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H * 0.35, W * 0.6);
    radial.addColorStop(0, `${colors.accent}15`);
    radial.addColorStop(1, "transparent");
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, W, H);

    // Header: ✦ DAILY ORACLE ✦
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "500 18px sans-serif";
    ctx.letterSpacing = "8px";
    ctx.fillText("✦  DAILY ORACLE  ✦", W / 2, 160);

    // Main text
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "500 38px sans-serif";
    const lines = wrapText(ctx, `「${oracle.mainText}」`, W - 160);
    const startY = H * 0.32 + ((6 - lines.length) * 28);
    lines.forEach((line, i) => {
      ctx.fillText(line, W / 2, startY + i * 58);
    });

    // Divider
    const divY = startY + lines.length * 58 + 40;
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 30, divY);
    ctx.lineTo(W / 2 + 30, divY);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "16px sans-serif";
    ctx.fillText("✦", W / 2, divY + 5);

    // Archetype label
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "500 26px sans-serif";
    ctx.fillText(oracle.archetypeLabel, W / 2, divY + 60);

    // Date
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "18px monospace";
    ctx.fillText(oracle.date, W / 2, divY + 100);

    // Countdown
    const remaining = Math.max(0, oracle.expiresAt - Date.now());
    const hours = Math.floor(remaining / 3600000);
    const mins = Math.floor((remaining % 3600000) / 60000);
    ctx.fillStyle = `${colors.accent}88`;
    ctx.font = "16px monospace";
    ctx.fillText(`残り ${hours}:${String(mins).padStart(2, "0")}`, W / 2, divY + 135);

    // Footer
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "16px sans-serif";
    ctx.fillText("aneurasync.app", W / 2, H - 60);

    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const char of text) {
    const test = current + char;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = char;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Share Helper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function shareOracle(oracle: OracleData) {
  const blob = await generateOracleImage(oracle);
  if (!blob) return;

  const file = new File([blob], `oracle-${oracle.date}.png`, { type: "image/png" });

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      text: `「${oracle.mainText}」\n\n${oracle.archetypeLabel}\n#Aneurasync #DailyOracle`,
      files: [file],
    });
  } else {
    // Fallback: download
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `oracle-${oracle.date}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface Props {
  oracle: OracleData;
}

export default function DailyOracleCard({ oracle }: Props) {
  const [countdown, setCountdown] = useState("");
  const [sharing, setSharing] = useState(false);
  const colors = FAMILY_COLORS[oracle.colorFamily] ?? FAMILY_COLORS.purple;

  useEffect(() => {
    const tick = () => {
      const rem = Math.max(0, oracle.expiresAt - Date.now());
      const h = Math.floor(rem / 3600000);
      const m = Math.floor((rem % 3600000) / 60000);
      const s = Math.floor((rem % 60000) / 1000);
      setCountdown(`${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [oracle.expiresAt]);

  const handleShare = useCallback(async () => {
    setSharing(true);
    try {
      await shareOracle(oracle);
    } catch {}
    setSharing(false);
  }, [oracle]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        position: "relative",
        aspectRatio: "4 / 5",
        maxHeight: 480,
        borderRadius: 20,
        overflow: "hidden",
        background: `linear-gradient(160deg, ${colors.from}, ${colors.to})`,
        border: `1px solid ${colors.accent}22`,
      }}
    >
      {/* Radial glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse at 50% 30%, ${colors.accent}12, transparent 70%)`,
        }}
      />

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "32px 24px",
          textAlign: "center",
        }}
      >
        {/* Header */}
        <div
          style={{
            fontSize: 11,
            letterSpacing: 6,
            color: "rgba(255,255,255,0.35)",
            marginBottom: 32,
            textTransform: "uppercase",
          }}
        >
          ✦ DAILY ORACLE ✦
        </div>

        {/* Main text */}
        <div
          style={{
            fontSize: 18,
            lineHeight: 1.8,
            color: "rgba(255,255,255,0.9)",
            fontWeight: 500,
            maxWidth: 320,
            marginBottom: 28,
          }}
        >
          「{oracle.mainText}」
        </div>

        {/* Sub text */}
        {oracle.subText && (
          <div
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.45)",
              marginBottom: 20,
              fontStyle: "italic",
            }}
          >
            {oracle.subText}
          </div>
        )}

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <div style={{ width: 24, height: 1, background: "rgba(255,255,255,0.15)" }} />
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>✦</span>
          <div style={{ width: 24, height: 1, background: "rgba(255,255,255,0.15)" }} />
        </div>

        {/* Archetype label */}
        <div style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>
          {oracle.archetypeLabel}
        </div>

        {/* Date + countdown */}
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>
          {oracle.date}
        </div>
        <div
          style={{
            fontSize: 11,
            color: `${colors.accent}99`,
            fontFamily: "monospace",
            marginTop: 4,
          }}
        >
          残り {countdown}
        </div>

        {/* Share button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleShare}
          disabled={sharing}
          style={{
            position: "absolute",
            bottom: 20,
            right: 20,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.5)",
            fontSize: 12,
            cursor: "pointer",
            backdropFilter: "blur(8px)",
          }}
        >
          {sharing ? "..." : "シェア ↗"}
        </motion.button>

        {/* Brand */}
        <div
          style={{
            position: "absolute",
            bottom: 24,
            left: 24,
            fontSize: 10,
            color: "rgba(255,255,255,0.18)",
          }}
        >
          aneurasync.app
        </div>
      </div>
    </motion.div>
  );
}
