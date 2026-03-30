"use client";

import { useState, useRef, useCallback, useEffect, useMemo, memo } from "react";
import { motion } from "framer-motion";
import type { GenomeCardData } from "@/lib/genome/cardTypes";
import { getCardTheme, getArchetypeDef, DEFAULT_THEME } from "@/lib/genome/archetypeThemes";
import ArchetypeEmblem from "./ArchetypeEmblem";
import { generateNarrative } from "@/lib/genome/narrativeEngine";

/* ═══════════════════════════════════════════════
   HoloRadar — 5軸レーダーチャート（メモ化）
   ═══════════════════════════════════════════════ */
const HoloRadar = memo(function HoloRadar({ data, accentHex }: {
  data: { analytical: number; cautious: number; social: number; expressive: number; independent: number };
  accentHex: string;
}) {
  const cx = 50, cy = 50, r = 38;
  const axes = [
    { key: "analytical" as const, label: "分析", angle: -Math.PI / 2 },
    { key: "cautious" as const, label: "慎重", angle: -Math.PI / 2 + (2 * Math.PI / 5) },
    { key: "social" as const, label: "社交", angle: -Math.PI / 2 + (4 * Math.PI / 5) },
    { key: "expressive" as const, label: "表現", angle: -Math.PI / 2 + (6 * Math.PI / 5) },
    { key: "independent" as const, label: "自律", angle: -Math.PI / 2 + (8 * Math.PI / 5) },
  ];
  const points = axes.map(({ key, angle }) => {
    const v = (data[key] / 100) * r;
    return { x: cx + v * Math.cos(angle), y: cy + v * Math.sin(angle) };
  });
  const polygon = points.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      {[0.33, 0.66, 1.0].map((level) => (
        <polygon key={level}
          points={axes.map(({ angle }) => `${cx + r * level * Math.cos(angle)},${cy + r * level * Math.sin(angle)}`).join(" ")}
          fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.3" />
      ))}
      {axes.map(({ key, angle }) => (
        <line key={key} x1={cx} y1={cy} x2={cx + r * Math.cos(angle)} y2={cy + r * Math.sin(angle)}
          stroke="rgba(255,255,255,0.06)" strokeWidth="0.3" />
      ))}
      <polygon points={polygon} fill={`${accentHex}20`} stroke={`${accentHex}80`} strokeWidth="0.8" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2" fill={`${accentHex}CC`} />
      ))}
      {axes.map(({ key, label, angle }) => {
        const lx = cx + (r + 10) * Math.cos(angle);
        const ly = cy + (r + 10) * Math.sin(angle);
        return <text key={key} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
          fill="rgba(255,255,255,0.4)" fontSize="5" fontWeight="500">{label}</text>;
      })}
    </svg>
  );
});

/* ═══════════════════════════════════════════════
   星空背景
   ═══════════════════════════════════════════════ */
function Starfield({ seed }: { seed: string }) {
  const stars = Array.from({ length: 24 }, (_, i) => {
    const hash = (seed.charCodeAt(i % seed.length) * (i + 1) * 7) % 1000;
    return { left: `${hash % 100}%`, top: `${(hash * 3) % 100}%`, size: 0.4 + (hash % 3) * 0.3,
      delay: `${(hash % 40) / 10}s`, duration: `${2 + (hash % 30) / 10}s` };
  });
  return (
    <div className="genome-starfield" aria-hidden>
      {stars.map((s, i) => <span key={i} style={{ left: s.left, top: s.top, width: s.size, height: s.size,
        animationDelay: s.delay, animationDuration: s.duration }} />)}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   日替わり — 曜日ごとに異なる「エモーショナルヒーロー」を選ぶ
   ═══════════════════════════════════════════════ */
function pickEmotionalHero(def: ReturnType<typeof getArchetypeDef>, front: GenomeCardData["cardFront"]): {
  label: string; text: string;
} | null {
  if (!def) return null;
  const day = new Date().getDay();
  // 7日間ローテーション — 毎日違う「刺さる」一文
  const candidates: { label: string; text: string | undefined }[] = [
    { label: "深夜の独白", text: def.midnightThought },
    { label: "内なる矛盾", text: def.innerContradiction },
    { label: "禁句", text: def.forbiddenPhrase ? `「${def.forbiddenPhrase}」——これだけは言わないで。` : undefined },
    { label: "隠された願い", text: def.secretDesire },
    { label: "恋愛の癖", text: def.lovePattern },
    { label: "子供の頃", text: def.childhoodScene },
    { label: "ストレス時", text: def.stressState },
  ];
  // 今日のスロット → 空なら次を試す
  for (let attempt = 0; attempt < 7; attempt++) {
    const slot = candidates[(day + attempt) % 7];
    if (slot.text) return { label: slot.label, text: slot.text };
  }
  // フォールバック
  if (front?.dilemma) return { label: "迷うとき", text: front.dilemma };
  if (def.tagline) return { label: "この人の核心", text: def.tagline };
  return null;
}

function getDailyVariation(): { hueShift: number; patternRotate: number } {
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  return { hueShift: (seed % 12) - 6, patternRotate: seed % 360 };
}

/* ═══════════════════════════════════════════════
   メインコンポーネント
   ═══════════════════════════════════════════════ */
interface Props {
  card: GenomeCardData;
  compact?: boolean;
  viewerContext?: { talkSuggestion?: string };
}

export default function GenomeCardLiving({ card, compact, viewerContext }: Props) {
  const [flipped, setFlipped] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  const front = card.cardFront;
  const back = card.cardBack;
  const hasBack = !!(back && (back.radarAxes || back.strengths || back.midnightThought || back.lovePattern));

  const theme = useMemo(() => getCardTheme(card.archetypeLabel), [card.archetypeLabel]);
  const def = useMemo(() => getArchetypeDef(card.archetypeLabel), [card.archetypeLabel]);
  const daily = useMemo(() => getDailyVariation(), []);
  const narrative = useMemo(() => generateNarrative(card), [card]);
  const emotionalHero = useMemo(() => pickEmotionalHero(def, front), [def, front]);

  // カードレベル
  const cl = card.journeyStats?.cardLevel ?? 1;
  const levelGlow = cl >= 4 ? `0 0 24px ${theme.glow}, 0 0 50px ${theme.accentHex}25`
    : cl >= 3 ? `0 0 14px ${theme.glow}` : cl >= 2 ? `0 0 6px ${theme.accentHex}20` : "none";
  const levelBorder = cl >= 3 ? `2px solid ${theme.accentHex}50` : `1px solid ${theme.accentHex}25`;

  /* ── ジャイロ / タッチ追従 ── */
  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((clientY - rect.top) / rect.height - 0.5) * 2;
    setTilt({ x: y * -8, y: x * 8 });
  }, []);
  const resetTilt = useCallback(() => setTilt({ x: 0, y: 0 }), []);

  useEffect(() => {
    const handler = (e: DeviceOrientationEvent) => {
      const beta = Math.min(Math.max((e.beta ?? 0) - 45, -30), 30);
      const gamma = Math.min(Math.max(e.gamma ?? 0, -30), 30);
      setTilt({ x: beta * 0.3, y: gamma * 0.3 });
    };
    window.addEventListener("deviceorientation", handler, { passive: true });
    return () => window.removeEventListener("deviceorientation", handler);
  }, []);

  return (
    <div
      ref={cardRef}
      className="relative mx-auto"
      style={{ perspective: "1200px", maxWidth: compact ? 200 : 340 }}
      onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
      onMouseLeave={resetTilt}
      onTouchMove={(e) => { const t = e.touches[0]; if (t) handleMove(t.clientX, t.clientY); }}
      onTouchEnd={resetTilt}
      role="button" tabIndex={0}
      aria-label={`${card.archetypeLabel ?? "Genome"} カード。${hasBack ? "クリックで裏返す" : ""}`}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && hasBack) { e.preventDefault(); setFlipped(!flipped); } }}
    >
      <motion.div
        className="relative w-full cursor-pointer"
        onClick={() => hasBack && setFlipped(!flipped)}
        animate={{
          rotateY: flipped ? 180 : 0, rotateX: tilt.x, rotateZ: tilt.y * 0.05,
          boxShadow: flipped
            ? "0 24px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.04)"
            : "0 16px 48px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.04)",
        }}
        transition={{ rotateY: { duration: 0.7, ease: [0.4, 0, 0.2, 1] }, default: { duration: 0.15 } }}
        style={{ transformStyle: "preserve-3d", willChange: "transform", borderRadius: 24 }}
      >
        {/* ════════════════════════════════════════════
           表面 — たったひとつの「刺さる」言葉
           ════════════════════════════════════════════ */}
        <div className="w-full rounded-[24px] overflow-hidden" style={{ backfaceVisibility: "hidden" }}>
          <div className="genome-card-holo relative" style={{
            "--holo-angle": `${Math.round(tilt.y * 10 + 180)}deg`,
            background: theme.gradient, padding: compact ? 14 : 24, borderRadius: 24,
            border: levelBorder, boxShadow: levelGlow,
            animation: "genome-card-breathe 6s ease-in-out infinite",
            filter: `hue-rotate(${daily.hueShift}deg)`,
            minHeight: compact ? 260 : 440,
            display: "flex", flexDirection: "column", justifyContent: "space-between",
          } as React.CSSProperties}>
            <Starfield seed={card.userId || "default"} />
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100"
              preserveAspectRatio="none" style={{ opacity: 0.04, transform: `rotate(${daily.patternRotate}deg)` }}>
              <path d={theme.pattern} fill="none" stroke="white" strokeWidth="0.3" />
            </svg>

            {/* ── 上部: タイプ名 + エンブレム ── */}
            <div className="relative z-10">
              <div className="flex items-center gap-3">
                <motion.div className="relative" style={{ animation: "genome-float-slow 6s ease-in-out infinite" }}
                  initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.6 }}>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    style={{ filter: "blur(14px)", transform: "scale(1.5)" }}>
                    <div style={{ width: compact ? 36 : 48, height: compact ? 36 : 48,
                      background: `radial-gradient(circle, ${theme.glow}, transparent 70%)` }} />
                  </div>
                  <ArchetypeEmblem
                    code={(def?.code ?? "PEA") as import("@/lib/stargazer/archetypeTypes").ArchetypeCode}
                    size={compact ? 44 : 52} tilt={tilt} completeness={card.completeness}
                    accentHex={theme.accentHex} glow={theme.glow} compact={compact} />
                </motion.div>
                <div>
                  <motion.h2 initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}
                    style={{ fontSize: compact ? 14 : 17, fontWeight: 800, color: "white", letterSpacing: "-0.01em",
                      textShadow: `0 0 10px ${theme.glow}` }}>
                    {theme.name}
                  </motion.h2>
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
                    className="flex items-center gap-1.5"
                    style={{ fontSize: 7, letterSpacing: "0.12em", textTransform: "uppercase" as const,
                      color: "rgba(255,255,255,0.25)", fontFamily: "monospace", marginTop: 2 }}>
                    <span>{theme.english}</span>
                    {cl >= 2 && (
                      <span style={{ fontSize: 6, padding: "1px 4px", borderRadius: 4,
                        background: cl >= 4 ? `${theme.accentHex}30` : `${theme.accentHex}15`,
                        color: `${theme.accentHex}${cl >= 4 ? "" : "80"}`,
                        border: `1px solid ${theme.accentHex}20` }}>
                        {cl >= 4 ? "ORACLE" : cl >= 3 ? "DEEP" : "PATTERN"}
                      </span>
                    )}
                  </motion.div>
                </div>
              </div>
            </div>

            {/* ── 中央: エモーショナル・ヒーロー ──
                カードの存在理由。この1行で心を掴む。 */}
            {!compact && emotionalHero && (
              <motion.div className="relative z-10 flex-1 flex flex-col items-center justify-center"
                style={{ paddingTop: 16, paddingBottom: 16 }}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 1.0, ease: "easeOut" }}>
                <p style={{ fontSize: 6, color: `${theme.accentHex}35`, letterSpacing: "0.2em",
                  textTransform: "uppercase" as const, marginBottom: 10 }}>
                  {emotionalHero.label}
                </p>
                <p style={{ fontSize: 16, fontWeight: 300, color: "rgba(255,255,255,0.9)",
                  lineHeight: 2.0, letterSpacing: "0.03em", textAlign: "center", maxWidth: 280 }}>
                  {emotionalHero.text}
                </p>
              </motion.div>
            )}

            {compact && (
              <div className="relative z-10 flex-1 flex items-center justify-center">
                {emotionalHero && (
                  <p style={{ fontSize: 11, fontWeight: 300, color: "rgba(255,255,255,0.8)",
                    lineHeight: 1.7, textAlign: "center", maxWidth: 160 }}>
                    {emotionalHero.text.slice(0, 40)}{emotionalHero.text.length > 40 ? "…" : ""}
                  </p>
                )}
              </div>
            )}

            {/* ── あなただけの矛盾（personalInsights） ── */}
            {!compact && card.personalInsights && card.personalInsights.length > 0 && (
              <motion.div className="relative z-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
                style={{ padding: "6px 12px", borderRadius: 10,
                  background: "rgba(255,255,255,0.02)", borderLeft: "2px solid rgba(255,255,255,0.08)" }}>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", lineHeight: 1.8 }}>
                  {card.personalInsights[0].insight}
                </p>
              </motion.div>
            )}

            {/* ── 下部: 名前 + フッター ── */}
            <div className="relative z-10">
              {/* 名前 + 希少性 */}
              {!compact && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
                  className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {card.avatarUrl && <img src={card.avatarUrl} alt="" className="rounded-full object-cover"
                      style={{ width: 18, height: 18, border: `1px solid ${theme.accentHex}25` }} />}
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>
                      {card.displayName}
                    </span>
                  </div>
                  {narrative.rarityMessage && (
                    <span style={{ fontSize: 6, color: `${theme.accentHex}35`, letterSpacing: "0.08em" }}>
                      {narrative.rarityMessage}
                    </span>
                  )}
                </motion.div>
              )}

              {/* レベル + 進捗バー + flip hint */}
              <div className="flex items-center gap-2">
                {card.journeyStats && (
                  <span style={{ fontSize: 7, color: `${theme.accentHex}50`, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                    Lv.{card.journeyStats.cardLevel}
                  </span>
                )}
                <div style={{ flex: 1, height: 1.5, borderRadius: 1, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${card.completeness}%` }}
                    transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
                    style={{ height: "100%", borderRadius: 1,
                      background: `linear-gradient(90deg, ${theme.accentHex}80, ${theme.accentHex}30)` }} />
                </div>
                {hasBack && (
                  <span style={{ fontSize: 7, color: "rgba(255,255,255,0.15)", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                    tap to reveal ›
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════
           裏面 — もうひとつの顔（物語として流れる）
           ════════════════════════════════════════════ */}
        {hasBack && (
          <div className="w-full rounded-[24px] overflow-hidden absolute top-0 left-0"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
            <div className="genome-card-holo relative" style={{
              "--holo-angle": `${Math.round(tilt.y * 10 + 180)}deg`,
              background: theme.gradient, padding: compact ? 14 : 20, borderRadius: 24,
              border: `1px solid ${theme.accentHex}25`,
              animation: "genome-card-breathe 6s ease-in-out infinite",
              filter: `hue-rotate(${daily.hueShift}deg)`,
              minHeight: compact ? 260 : 440,
              display: "flex", flexDirection: "column",
            } as React.CSSProperties}>
              <Starfield seed={(card.userId || "back") + "_b"} />

              {/* ヘッダー */}
              <div className="relative z-10 flex items-center justify-between mb-2">
                <span style={{ fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase" as const,
                  color: "rgba(255,255,255,0.25)", fontFamily: "monospace" }}>
                  {theme.symbol} もうひとつの顔
                </span>
                {card.displayName && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{card.displayName}</span>}
              </div>

              {/* レーダー（コンパクトに） */}
              {back?.radarAxes && (
                <div className="relative z-10 mx-auto" style={{ width: compact ? 100 : 130, height: compact ? 100 : 130 }}>
                  <HoloRadar data={back.radarAxes} accentHex={theme.accentHex} />
                </div>
              )}

              {/* ── 物語として流れるプロフィール ── */}
              <div className="relative z-10 flex-1 overflow-y-auto" style={{ marginTop: 6 }}>
                <div className="space-y-3">
                  {/* 強み → 死角 の対比 */}
                  {back?.strengths && back.strengths.length > 0 && (
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}>
                      <span style={{ color: "rgba(52,211,153,0.8)" }}>{back.strengths[0]}</span>
                      {back.blindSpot && (
                        <span style={{ color: "rgba(255,255,255,0.35)" }}>。でも、{back.blindSpot}</span>
                      )}
                    </p>
                  )}

                  {/* 恋愛パターン — 最も「刺さる」コンテンツのひとつ */}
                  {back?.lovePattern && (
                    <div style={{ padding: "8px 12px", borderRadius: 10,
                      background: `${theme.accentHex}06`, borderLeft: `2px solid ${theme.accentHex}30` }}>
                      <p style={{ fontSize: 7, color: `${theme.accentHex}50`, letterSpacing: "0.12em", marginBottom: 3 }}>
                        恋愛で必ず出る癖
                      </p>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", lineHeight: 1.7 }}>
                        {back.lovePattern}
                      </p>
                    </div>
                  )}

                  {/* ストレス時 + 禁句 — 「取扱説明書」的な実用性 */}
                  {(back?.stressResponse || def?.forbiddenPhrase) && (
                    <div style={{ padding: "8px 12px", borderRadius: 10,
                      background: "rgba(255,150,100,0.04)", borderLeft: "2px solid rgba(255,150,100,0.2)" }}>
                      {back?.stressResponse && (
                        <p style={{ fontSize: 9, color: "rgba(255,200,150,0.6)", lineHeight: 1.6 }}>
                          追い詰められると、{back.stressResponse}
                        </p>
                      )}
                      {def?.forbiddenPhrase && (
                        <p style={{ fontSize: 9, color: "rgba(255,150,100,0.5)", lineHeight: 1.6, marginTop: 2 }}>
                          絶対に言わないで: 「{def.forbiddenPhrase}」
                        </p>
                      )}
                    </div>
                  )}

                  {/* 名言 — 締めの一撃 */}
                  {back?.quote && (
                    <div className="text-center" style={{ padding: "6px 0" }}>
                      <p style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", lineHeight: 1.6, fontStyle: "italic" }}>
                        「{back.quote.text}」
                      </p>
                      <p style={{ fontSize: 7, color: "rgba(255,255,255,0.2)", marginTop: 2 }}>
                        — {back.quote.author}
                      </p>
                    </div>
                  )}

                  {/* 外見特性（控えめに） */}
                  {back?.bodyTraits && (
                    <div className="flex flex-wrap gap-1">
                      <span style={{ fontSize: 7, padding: "2px 6px", borderRadius: 8,
                        background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.3)" }}>
                        {back.bodyTraits}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* フッター */}
              <div className="relative z-10 text-center mt-2">
                <span style={{ fontSize: 7, color: "rgba(255,255,255,0.15)", letterSpacing: "0.04em" }}>
                  tap to flip ›
                </span>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
