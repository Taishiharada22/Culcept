// ObservationReportCard.tsx
// 観測レポートカード — 完了時にSNSシェア用のカード画像を自動生成
// Canvas APIでレンダリング → ダウンロード/シェア可能
"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { ResolvedResult } from "@/lib/stargazer/typeResolver";
import { ARCHETYPE_DEFS } from "@/lib/stargazer/archetypeTypes";

interface Props {
  result: ResolvedResult;
  answeredCount: number;
  totalQuestions: number;
  onClose: () => void;
}

export default function ObservationReportCard({
  result,
  answeredCount,
  totalQuestions,
  onClose,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // アーキタイプ情報の取得 (old topMatches removed; use reactionType as fallback)
  const archetype = null as (typeof ARCHETYPE_DEFS)[number] | null;

  // Canvas描画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 640;
    const H = 900;
    canvas.width = W;
    canvas.height = H;

    // 背景
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#1a1520");
    grad.addColorStop(0.5, "#1e1a28");
    grad.addColorStop(1, "#15121c");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // 星のパーティクル
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const r = Math.random() * 1.5 + 0.5;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(190,170,110,${Math.random() * 0.3 + 0.1})`;
      ctx.fill();
    }

    // Glow circle
    const glowGrad = ctx.createRadialGradient(W / 2, 200, 10, W / 2, 200, 150);
    glowGrad.addColorStop(0, "rgba(140,120,60,0.15)");
    glowGrad.addColorStop(1, "transparent");
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 50, W, 300);

    // Header
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(190,170,110,0.5)";
    ctx.font = "12px monospace";
    ctx.letterSpacing = "6px";
    ctx.fillText("✦  深 層 観 測  ✦", W / 2, 60);

    // Emoji
    ctx.font = "56px serif";
    ctx.fillText(archetype?.emoji || "✦", W / 2, 190);

    // Archetype name
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText(archetype?.name || "未判定", W / 2, 260);

    // English name
    ctx.fillStyle = "rgba(190,170,110,0.6)";
    ctx.font = "14px monospace";
    ctx.fillText(archetype?.englishName || "", W / 2, 290);

    // Tagline
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "14px sans-serif";
    const tagline = archetype?.tagline || "";
    // Word wrap
    wrapText(ctx, tagline, W / 2, 330, W - 80, 22);

    // Divider
    ctx.strokeStyle = "rgba(190,170,110,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(80, 380);
    ctx.lineTo(W - 80, 380);
    ctx.stroke();

    // Core insights (from result summary)
    ctx.fillStyle = "rgba(190,170,110,0.45)";
    ctx.font = "11px monospace";
    ctx.fillText("核心の洞察", W / 2, 410);

    const insights = [
      archetype?.safeState ? `安定時: ${archetype.safeState}` : null,
      archetype?.stressState ? `圧力下: ${archetype.stressState}` : null,
      archetype?.growthKey ? `成長の鍵: ${archetype.growthKey}` : null,
    ].filter(Boolean) as string[];

    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = "13px sans-serif";
    insights.forEach((insight, i) => {
      wrapText(ctx, `• ${insight}`, W / 2, 445 + i * 50, W - 100, 20);
    });

    // Depth bar
    const barY = 640;
    ctx.fillStyle = "rgba(190,170,110,0.15)";
    roundRect(ctx, 80, barY, W - 160, 8, 4);
    ctx.fill();

    const depthRatio = answeredCount / Math.max(1, totalQuestions);
    ctx.fillStyle = "rgba(190,170,110,0.5)";
    roundRect(ctx, 80, barY, (W - 160) * depthRatio, 8, 4);
    ctx.fill();

    ctx.fillStyle = "rgba(190,170,110,0.4)";
    ctx.font = "11px monospace";
    ctx.textAlign = "left";
    ctx.fillText("深度", 80, barY - 8);
    ctx.textAlign = "right";
    ctx.fillText(depthRatio >= 0.8 ? "核心到達" : `${Math.round(depthRatio * 100)}%`, W - 80, barY - 8);

    // Rarity
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(190,170,110,0.35)";
    ctx.font = "12px monospace";
    const rarity = ((1 / 27) * 100).toFixed(1);
    ctx.fillText(`全体の ${rarity}% のアーキタイプ`, W / 2, barY + 40);

    // Strengths chips
    if (archetype?.strengths) {
      const chipY = barY + 70;
      ctx.fillStyle = "rgba(190,170,110,0.3)";
      ctx.font = "11px sans-serif";
      const chipStr = archetype.strengths.slice(0, 3).join("  •  ");
      ctx.fillText(chipStr, W / 2, chipY);
    }

    // Shadow tension
    if (archetype?.shadowTension) {
      ctx.fillStyle = "rgba(180,100,80,0.3)";
      ctx.font = "italic 12px sans-serif";
      wrapText(ctx, `もうひとり: ${archetype.shadowTension}`, W / 2, barY + 110, W - 100, 18);
    }

    // Motto
    if (archetype?.motto) {
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = "italic 13px sans-serif";
      ctx.fillText(`"${archetype.motto}"`, W / 2, H - 80);
    }

    // Footer
    ctx.fillStyle = "rgba(190,170,110,0.2)";
    ctx.font = "11px monospace";
    ctx.fillText("aneurasync.app", W / 2, H - 30);

    // Generate image URL
    setImageUrl(canvas.toDataURL("image/png"));
  }, [result, archetype, answeredCount, totalQuestions]);

  const handleDownload = useCallback(() => {
    if (!imageUrl) return;
    const link = document.createElement("a");
    link.download = `observation-${archetype?.englishName || "report"}.png`;
    link.href = imageUrl;
    link.click();
  }, [imageUrl, archetype]);

  const handleShare = useCallback(async () => {
    if (!imageUrl || !navigator.share) {
      handleDownload();
      return;
    }

    try {
      const blob = await (await fetch(imageUrl)).blob();
      const file = new File([blob], "observation-report.png", { type: "image/png" });
      await navigator.share({
        title: `深層観測 — ${archetype?.name || "観測レポート"}`,
        text: `私のアーキタイプは ${archetype?.emoji} ${archetype?.name}`,
        files: [file],
      });
    } catch {
      handleDownload();
    }
  }, [imageUrl, archetype, handleDownload]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center py-8 px-4"
    >
      {/* Hidden canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Preview */}
      {imageUrl && (
        <motion.img
          src={imageUrl}
          alt="観測レポートカード"
          className="w-full max-w-xs rounded-2xl shadow-xl mb-6"
          style={{ border: "1px solid rgba(190,170,110,0.15)" }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        />
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <motion.button
          onClick={handleShare}
          className="px-5 py-2.5 rounded-xl font-body text-sm font-semibold"
          style={{
            background: "rgba(140,120,60,0.12)",
            border: "1px solid rgba(140,120,60,0.25)",
            color: "rgba(140,120,60,0.85)",
          }}
          whileTap={{ scale: 0.97 }}
        >
          シェアする
        </motion.button>
        <motion.button
          onClick={handleDownload}
          className="px-5 py-2.5 rounded-xl font-body text-sm"
          style={{
            background: "rgba(0,0,0,0.03)",
            border: "1px solid rgba(140,150,180,0.15)",
            color: "rgba(80,85,105,0.65)",
          }}
          whileTap={{ scale: 0.97 }}
        >
          保存する
        </motion.button>
      </div>

      <motion.button
        onClick={onClose}
        className="mt-6 font-body text-xs"
        style={{ color: "rgba(120,125,140,0.4)" }}
      >
        結果を見る →
      </motion.button>
    </motion.div>
  );
}

// ── Canvas helpers ──

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split("");
  let line = "";
  let currentY = y;

  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && i > 0) {
      ctx.fillText(line, x, currentY);
      line = words[i];
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
