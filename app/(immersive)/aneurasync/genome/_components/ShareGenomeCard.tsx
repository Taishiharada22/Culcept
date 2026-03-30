"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ShareGenomeCardProps {
  overallLabel: string;
  completeness: number;
  topTraits: Array<{ label: string; value: number; confidence: number }>;
  /** Archetype label for the share card */
  archetypeLabel?: string;
}

/**
 * ShareGenomeCard — generates a visual card for sharing genome highlights on SNS.
 * Uses canvas-based rendering for image generation.
 */
export default function ShareGenomeCard({
  overallLabel,
  completeness,
  topTraits,
  archetypeLabel,
}: ShareGenomeCardProps) {
  const [showPanel, setShowPanel] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const generateImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const w = 600;
    const h = 400;
    canvas.width = w;
    canvas.height = h;

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#f8f7ff");
    grad.addColorStop(0.5, "#fefcff");
    grad.addColorStop(1, "#fff8fa");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Border
    ctx.strokeStyle = "rgba(139,92,246,0.15)";
    ctx.lineWidth = 2;
    ctx.roundRect(4, 4, w - 8, h - 8, 24);
    ctx.stroke();

    // Title
    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 28px 'Cormorant Garamond', serif";
    ctx.textAlign = "center";
    ctx.fillText("Persona Genome", w / 2, 50);

    // Overall label
    ctx.fillStyle = "#6366f1";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(overallLabel, w / 2, 85);

    // Completeness
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px sans-serif";
    ctx.fillText(`完成度: ${completeness}%`, w / 2, 110);

    // Archetype
    if (archetypeLabel) {
      ctx.fillStyle = "#8b5cf6";
      ctx.font = "16px sans-serif";
      ctx.fillText(`✦ ${archetypeLabel}`, w / 2, 140);
    }

    // Top traits
    const startY = 170;
    topTraits.slice(0, 3).forEach((trait, i) => {
      const y = startY + i * 55;

      // Label
      ctx.fillStyle = "#475569";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(trait.label, 60, y);

      // Bar background
      ctx.fillStyle = "rgba(148,163,184,0.1)";
      ctx.beginPath();
      ctx.roundRect(60, y + 8, 480, 16, 8);
      ctx.fill();

      // Bar fill
      const barGrad = ctx.createLinearGradient(60, 0, 540, 0);
      barGrad.addColorStop(0, "#8b5cf6");
      barGrad.addColorStop(1, "#ec4899");
      ctx.fillStyle = barGrad;
      ctx.beginPath();
      ctx.roundRect(60, y + 8, 480 * trait.value, 16, 8);
      ctx.fill();

      // Confidence
      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`${Math.round(trait.confidence * 100)}%`, 540, y);
    });

    // Watermark
    ctx.fillStyle = "rgba(148,163,184,0.4)";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Aneurasync — Persona Genome", w / 2, h - 20);

    return canvas.toDataURL("image/png");
  }, [overallLabel, completeness, topTraits, archetypeLabel]);

  const handleShare = useCallback(async () => {
    const dataUrl = generateImage();
    if (!dataUrl) return;

    // Try native share API first
    if (navigator.share && navigator.canShare) {
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], "persona-genome.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: "My Persona Genome",
            text: `${overallLabel} — 完成度 ${completeness}%`,
            files: [file],
          });
          return;
        }
      } catch {
        // Fallback below
      }
    }

    // Fallback: download
    const link = document.createElement("a");
    link.download = "persona-genome.png";
    link.href = dataUrl;
    link.click();
  }, [generateImage, overallLabel, completeness]);

  const handleCopyLink = useCallback(() => {
    const url = `${window.location.origin}/aneurasync/genome`;
    navigator.clipboard.writeText(url).catch(() => {});
    setShowPanel(false);
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="hidden" />

      <motion.button
        type="button"
        onClick={() => setShowPanel(true)}
        className="flex items-center gap-2 rounded-full border border-white/80 bg-white/60 px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm backdrop-blur-sm transition hover:bg-white/80 hover:shadow-md"
        whileTap={{ scale: 0.96 }}
        aria-label="ゲノムをシェア"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 8V14H12V8" />
          <path d="M8 2V10" />
          <path d="M5 5L8 2L11 5" />
        </svg>
        シェア
      </motion.button>

      <AnimatePresence>
        {showPanel && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
              onClick={() => setShowPanel(false)}
            />

            {/* Panel */}
            <motion.div
              className="relative w-full max-w-md rounded-t-[28px] border border-white/85 bg-white/95 px-6 pb-8 pt-5 shadow-[0_-12px_40px_rgba(0,0,0,0.1)] backdrop-blur-xl sm:rounded-[28px] sm:pb-6"
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              {/* Handle */}
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />

              <div
                className="text-center text-lg font-semibold text-slate-800"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                ゲノムをシェア
              </div>
              <p className="mt-1 text-center text-sm text-slate-500">
                あなたのPersona Genomeを共有しましょう
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleShare}
                  className="flex flex-col items-center gap-2 rounded-[20px] border border-violet-100 bg-violet-50/60 px-4 py-5 text-sm font-semibold text-violet-700 transition hover:bg-violet-50"
                >
                  <span className="text-2xl">🖼️</span>
                  画像で保存
                </button>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex flex-col items-center gap-2 rounded-[20px] border border-slate-100 bg-slate-50/60 px-4 py-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <span className="text-2xl">🔗</span>
                  リンクをコピー
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowPanel(false)}
                className="mt-4 w-full rounded-[16px] py-3 text-center text-sm font-semibold text-slate-400 transition hover:bg-slate-50"
              >
                閉じる
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
