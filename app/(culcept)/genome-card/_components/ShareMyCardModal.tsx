"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { GenomeCardData } from "@/lib/genome/cardTypes";
import { getCardTheme, getArchetypeDef } from "@/lib/genome/archetypeThemes";
import { drawEmblemOnCanvas } from "./ArchetypeEmblem";
import FocusTrap from "./FocusTrap";

const C = { s1: "#ffffff", s2: "#f5f6fa", t1: "#1a1a2e", t2: "#4a4a68", t3: "#8888a0", t4: "#c8c8dc", neural: "#8B5CF6", pulse: "#EC4899" };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  card: GenomeCardData;
}

export default function ShareMyCardModal({ isOpen, onClose, card }: Props) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const theme = getCardTheme(card.archetypeLabel);
  const def = getArchetypeDef(card.archetypeLabel);
  const exchangeUrl = typeof window !== "undefined"
    ? `${window.location.origin}/genome-card/connect/${card.userId}`
    : "";

  /* ── Canvas画像生成（1080x1350 Instagram Story比率）── */
  const generateImage = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const w = 1080, h = 1350;
    canvas.width = w;
    canvas.height = h;

    // 背景グラデーション（テーマカラーを反映）
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#080515");
    grad.addColorStop(0.4, "#12092a");
    grad.addColorStop(0.7, "#0e0720");
    grad.addColorStop(1, "#060310");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // アクセントカラーの大きなグロー（中央）
    const glowGrad = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, 400);
    glowGrad.addColorStop(0, `${theme.accentHex}15`);
    glowGrad.addColorStop(1, "transparent");
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = "center";

    // ── 上部: タイプ名（控えめに）──
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "500 24px monospace";
    ctx.fillText(`${theme.symbol}  ${theme.name}`, w / 2, 200);

    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.font = "400 18px monospace";
    ctx.fillText(theme.english, w / 2, 240);

    // ── 中央: エモーショナルヒーロー（これがバズる部分）──
    // 最もインパクトのある一文を大きく中央に
    const heroText = def?.midnightThought ?? def?.innerContradiction ?? def?.tagline;
    if (heroText) {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "300 42px sans-serif";
      const heroLines = wrapText(ctx, heroText, w - 200);
      const heroStartY = h * 0.42 - (heroLines.length * 60) / 2;
      heroLines.forEach((line, i) => {
        ctx.fillText(line, w / 2, heroStartY + i * 60);
      });
    }

    // ── 下部: 名前 + Emblem ──
    const emblemCode = def?.code ?? "PEA";
    drawEmblemOnCanvas(ctx, emblemCode, w / 2, h * 0.72, 180, theme.accentHex);

    if (card.displayName) {
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = "500 22px sans-serif";
      ctx.fillText(card.displayName, w / 2, h * 0.85);
    }

    // CTA
    ctx.fillStyle = `${theme.accentHex}60`;
    ctx.font = "400 18px sans-serif";
    ctx.fillText("あなたのGenome Cardを作る →", w / 2, h * 0.9);

    // ブランド
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.font = "14px monospace";
    ctx.fillText("Aneurasync", w / 2, h - 60);

    return canvas.toDataURL("image/png");
  }, [card, theme, def]);

  /* ── シェア ── */
  const handleShare = useCallback(async () => {
    const dataUrl = generateImage();
    if (!dataUrl) return;

    // Data URLをBlobに変換
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], "genome-card.png", { type: "image/png" });

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${card.displayName ?? ""}のGenome Card`,
          text: `${theme.name} — ${theme.english}\nAneurasyncで自分のGenome Cardを作ろう`,
          files: [file],
        });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch {
        // ユーザーがキャンセルした場合
      }
    } else {
      // フォールバック: ダウンロード
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "genome-card.png";
      a.click();
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  }, [generateImage, card.displayName, theme]);

  /* ── URLコピー ── */
  const handleCopyLink = useCallback(async () => {
    await navigator.clipboard.writeText(exchangeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [exchangeUrl]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(8px)" }} onClick={onClose} />
          <motion.div className="relative w-full max-w-sm rounded-t-2xl sm:rounded-2xl overflow-hidden"
            initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
            style={{ background: C.s1, border: `1px solid ${C.s2}`, boxShadow: "0 -8px 40px rgba(0,0,0,0.1)" }}>

            <FocusTrap onClose={onClose} ariaLabel="カードをシェア">
            <div className="p-6 space-y-5">
              <div className="text-center">
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.t1 }}>カードをシェア</h3>
                <p style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>
                  友達にGenome Cardを見せよう
                </p>
              </div>

              {/* アクションボタン */}
              <div className="space-y-2">
                {/* LINEで送る */}
                <button
                  onClick={() => {
                    const lineUrl = `https://line.me/R/share?text=${encodeURIComponent(
                      `${card.displayName ?? "私"}のGenome Cardを見てみて！\n${theme.name} — ${theme.english}\n\n${exchangeUrl}`
                    )}`;
                    window.open(lineUrl, "_blank");
                  }}
                  className="w-full py-3.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                  style={{ background: "#06C755", color: "white" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/></svg>
                  LINEで送る
                </button>

                {/* SNSシェア（画像） */}
                <button onClick={handleShare}
                  className="w-full py-3.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                  style={{ background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`, color: "white" }}>
                  <span style={{ fontSize: 16 }}>📤</span>
                  {shared ? "シェアしました！" : "カード画像をシェア"}
                </button>

                {/* 交換リンクコピー */}
                <button onClick={handleCopyLink}
                  className="w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                  style={{ background: C.s2, color: C.t1 }}>
                  <span style={{ fontSize: 14 }}>🔗</span>
                  {copied ? "コピーしました！" : "交換リンクをコピー"}
                </button>

                {/* 交換URL（最小化） */}
                <div className="rounded-lg px-3 py-2 text-center" style={{ background: C.s2 }}>
                  <p style={{ fontSize: 8, color: C.t4, wordBreak: "break-all", fontFamily: "monospace", lineHeight: 1.4 }}>
                    {exchangeUrl}
                  </p>
                </div>
              </div>

              <button onClick={onClose}
                className="w-full py-3 rounded-xl text-sm font-medium"
                style={{ background: "transparent", color: C.t3 }}>
                閉じる
              </button>
            </div>

            {/* Hidden canvas for image generation */}
            <canvas ref={canvasRef} style={{ display: "none" }} />
            </FocusTrap>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* テキスト折り返しヘルパー */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const chars = text.split("");
  const lines: string[] = [];
  let current = "";
  for (const ch of chars) {
    const test = current + ch;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}
