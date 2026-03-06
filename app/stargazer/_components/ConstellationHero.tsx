// app/stargazer/_components/ConstellationHero.tsx
// 現在の仮説マップ - 観測された傾向とその精度を可視化
"use client";

import { useRef, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import type { CoreStar, ResolvedVisualStyle } from "@/types/stargazer";
import { hexToRgb, hexToRgba } from "../_utils/color";

interface DimensionDetail {
  id: string;
  score: number;
  confidence: number;
  evidenceCount: number;
  category: string;
  labelLeft: string;
  labelRight: string;
}

interface Props {
  coreStar: CoreStar;
  constellationInfo: {
    emoji: string;
    description: string;
    keywords: string[];
  } | null;
  visual?: ResolvedVisualStyle;
  dimensionDetails?: DimensionDetail[];
  observationStats?: {
    totalAnswered: number;
    avgResponseTimeMs: number;
    fastAnswerCount: number;
    slowAnswerCount: number;
    avgHesitation: number;
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  values: "価値観",
  decision: "判断",
  social: "対人",
  aesthetic: "美意識",
  emotional: "感情",
};

export default function ConstellationHero({
  coreStar,
  constellationInfo,
  visual,
  dimensionDetails,
  observationStats,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const primaryRgb = useMemo(() => visual ? hexToRgb(visual.baseColor) : "251,191,36", [visual]);
  const secondaryRgb = useMemo(() => visual ? hexToRgb(visual.supportColor) : "253,230,138", [visual]);
  const tertiaryRgb = useMemo(() => visual ? hexToRgb(visual.accentColor) : "245,158,11", [visual]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 2;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;
    const cx = w * 0.5;
    const cy = h * 0.42;

    interface Star { x: number; y: number; r: number; baseAlpha: number; speed: number; phase: number; color: string; }
    const stars: Star[] = [];
    stars.push({ x: cx, y: cy, r: 4, baseAlpha: 1, speed: 0.006, phase: 0, color: primaryRgb });
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
      stars.push({ x: cx + Math.cos(angle) * 28, y: cy + Math.sin(angle) * 28, r: 2 + Math.random(), baseAlpha: 0.6 + Math.random() * 0.3, speed: 0.004 + Math.random() * 0.003, phase: Math.random() * Math.PI * 2, color: Math.random() > 0.5 ? primaryRgb : secondaryRgb });
    }
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2 + 0.3;
      const dist = 50 + Math.random() * 15;
      stars.push({ x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist, r: 1 + Math.random() * 1.5, baseAlpha: 0.3 + Math.random() * 0.4, speed: 0.003 + Math.random() * 0.004, phase: Math.random() * Math.PI * 2, color: Math.random() > 0.3 ? secondaryRgb : tertiaryRgb });
    }

    const bgStars = Array.from({ length: 60 }, () => ({
      x: Math.random() * w, y: Math.random() * h, r: Math.random() * 0.7 + 0.2,
      alpha: Math.random() * 0.25 + 0.03, twinkleSpeed: Math.random() * 0.01 + 0.003, twinklePhase: Math.random() * Math.PI * 2,
    }));

    const connections: [number, number][] = [];
    for (let i = 1; i <= 5; i++) connections.push([0, i]);
    for (let i = 1; i < 5; i++) connections.push([i, i + 1]);
    connections.push([5, 1]);
    for (let i = 0; i < 5; i++) { const o = 6 + i; if (o < stars.length) connections.push([i + 1, o]); }

    let frame = 0;
    let animId: number;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      frame++;
      for (const s of bgStars) {
        const twinkle = Math.sin(frame * s.twinkleSpeed + s.twinklePhase) * 0.5 + 0.5;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${s.alpha * (0.5 + twinkle * 0.5)})`; ctx.fill();
      }
      const lineAlpha = Math.sin(frame * 0.005) * 0.03 + 0.07;
      for (const [a, b] of connections) {
        if (a >= stars.length || b >= stars.length) continue;
        ctx.beginPath(); ctx.moveTo(stars[a].x, stars[a].y); ctx.lineTo(stars[b].x, stars[b].y);
        ctx.strokeStyle = `rgba(${primaryRgb},${lineAlpha})`; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(stars[a].x, stars[a].y); ctx.lineTo(stars[b].x, stars[b].y);
        ctx.strokeStyle = `rgba(${primaryRgb},${lineAlpha * 2})`; ctx.lineWidth = 0.5; ctx.stroke();
      }
      for (const s of stars) {
        const flicker = Math.sin(frame * s.speed + s.phase) * 0.15 + 0.85;
        const alpha = s.baseAlpha * flicker;
        const g1 = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 6);
        g1.addColorStop(0, `rgba(${s.color},${alpha * 0.4})`); g1.addColorStop(0.4, `rgba(${s.color},${alpha * 0.1})`); g1.addColorStop(1, `rgba(${s.color},0)`);
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 6, 0, Math.PI * 2); ctx.fillStyle = g1; ctx.fill();
        const g2 = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 3);
        g2.addColorStop(0, `rgba(${s.color},${alpha * 0.6})`); g2.addColorStop(1, `rgba(${s.color},0)`);
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 3, 0, Math.PI * 2); ctx.fillStyle = g2; ctx.fill();
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fillStyle = `rgba(255,240,200,${alpha})`; ctx.fill();
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.5, 0, Math.PI * 2); ctx.fillStyle = `rgba(255,255,255,${alpha * 0.7})`; ctx.fill();
      }
      animId = requestAnimationFrame(draw);
    };
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [primaryRgb, secondaryRgb, tertiaryRgb]);

  const borderColor = visual ? hexToRgba(visual.baseColor, 0.08) : "rgba(251,191,36,0.08)";
  const glowShadow = visual
    ? `0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 ${hexToRgba(visual.baseColor, 0.05)}`
    : "0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(251,191,36,0.05)";
  const labelColor = visual ? hexToRgba(visual.baseColor, 0.3) : "rgba(253,230,138,0.3)";
  const labelLineColor = visual ? hexToRgba(visual.baseColor, 0.2) : "rgba(251,191,36,0.2)";
  const emojiGlow = visual ? `drop-shadow(0 0 20px ${visual.glowColor})` : "drop-shadow(0 0 20px rgba(251,191,36,0.3))";
  const nameColor = visual ? hexToRgba(visual.baseColor, 0.85) : undefined;
  const barGradient = visual
    ? `linear-gradient(90deg, ${hexToRgba(visual.baseColor, 0.4)}, ${hexToRgba(visual.supportColor, 0.5)})`
    : "linear-gradient(90deg, rgba(251,191,36,0.4), rgba(253,230,138,0.5))";
  const barLabel = visual ? hexToRgba(visual.baseColor, 0.3) : undefined;

  // 強く観測された傾向 top3
  const strongDimensions = (dimensionDetails || [])
    .filter((d) => d.confidence > 0.3 && Math.abs(d.score) > 0.2)
    .sort((a, b) => b.confidence * Math.abs(b.score) - a.confidence * Math.abs(a.score))
    .slice(0, 3);

  // まだ揺れている要素
  const wavering = (dimensionDetails || [])
    .filter((d) => d.confidence > 0.2 && d.confidence < 0.6 && Math.abs(d.score) < 0.25)
    .slice(0, 2);

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(145deg, rgba(12,12,28,0.9) 0%, rgba(10,15,30,0.95) 50%, rgba(12,12,28,0.85) 100%)",
        border: `1px solid ${borderColor}`,
        boxShadow: glowShadow,
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }} />

      <div className="relative z-10 p-6 text-center">
        {/* セクションラベル */}
        <div className="flex items-center justify-center gap-2 mb-5">
          <div className="h-px w-8" style={{ background: `linear-gradient(to right, transparent, ${labelLineColor})` }} />
          <span className="text-[10px] tracking-[0.2em] uppercase font-medium" style={{ color: labelColor }}>
            現在の仮説マップ
          </span>
          <div className="h-px w-8" style={{ background: `linear-gradient(to left, transparent, ${labelLineColor})` }} />
        </div>

        {/* 星座エモジ + 名前 */}
        <motion.span
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 150, delay: 0.1 }}
          className="text-5xl inline-block mb-3"
          style={{ filter: emojiGlow }}
        >
          {constellationInfo?.emoji || "⭐"}
        </motion.span>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }}>
          <h2
            className="text-2xl font-semibold mb-0.5"
            style={{ color: nameColor || "rgb(254,243,199)", fontFamily: "'Cormorant Garamond', serif" }}
          >
            {coreStar.constellationLabel}
          </h2>
          <p className="text-[10px] text-white/25 tracking-[0.15em] uppercase mb-4">
            {coreStar.constellationCode}
          </p>
        </motion.div>

        {/* 観測精度 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="flex items-center justify-center gap-3 mb-5"
        >
          <span className="text-[11px] text-white/35 font-medium">観測精度</span>
          <div className="h-[3px] bg-white/[0.04] rounded-full w-24 overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: barGradient }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.round(coreStar.confidenceScore * 100)}%` }}
              transition={{ delay: 0.6, duration: 1, ease: "easeOut" }}
            />
          </div>
          <span className="text-[11px] font-mono font-medium" style={{ color: barLabel || "rgba(253,230,138,0.45)" }}>
            {Math.round(coreStar.confidenceScore * 100)}%
          </span>
        </motion.div>
      </div>

      {/* ── 強く観測された傾向 ── */}
      {strongDimensions.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="px-6 pb-4"
        >
          <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-[10px] text-white/30 tracking-wider uppercase font-semibold mb-3">
              強く観測された傾向
            </p>
            <div className="space-y-2.5">
              {strongDimensions.map((dim, i) => {
                const isLeft = dim.score < 0;
                const label = isLeft ? dim.labelLeft : dim.labelRight;
                const strength = Math.abs(dim.score);
                return (
                  <motion.div
                    key={dim.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + i * 0.08 }}
                    className="flex items-center gap-3"
                  >
                    <span className="text-[11px] font-medium min-w-0 flex-1" style={{ color: visual ? hexToRgba(visual.baseColor, 0.7) : "rgba(253,230,138,0.7)" }}>
                      {label}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-[3px] bg-white/[0.04] rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: barGradient }}
                          initial={{ width: 0 }}
                          animate={{ width: `${strength * 100}%` }}
                          transition={{ delay: 0.7 + i * 0.08, duration: 0.6 }}
                        />
                      </div>
                      <span className="text-[10px] text-white/20 font-mono w-8 text-right">
                        {dim.evidenceCount}件
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── まだ揺れている要素 ── */}
      {wavering.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.6 }}
          className="px-6 pb-5"
        >
          <div className="flex items-center gap-2 mb-2">
            <motion.div
              className="w-1 h-1 rounded-full bg-amber-400/40"
              animate={{ scale: [1, 1.5, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="text-[10px] text-white/25 tracking-wider uppercase font-medium">
              まだ揺れている要素
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {wavering.map((dim) => (
              <span
                key={dim.id}
                className="text-[10px] px-2.5 py-1 rounded-full text-white/30"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                {dim.labelLeft} ⇔ {dim.labelRight}
                <span className="text-white/15 ml-1 font-mono">{dim.evidenceCount}件</span>
              </span>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
