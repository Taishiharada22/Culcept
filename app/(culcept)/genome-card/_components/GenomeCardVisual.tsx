"use client";

import { motion } from "framer-motion";
import type { GenomeCardData, VisibilityLevel } from "@/lib/genome/cardTypes";
import { getCardTheme } from "@/lib/genome/archetypeThemes";

/* ── Home統一カラー ── */
const C = {
  s1: "#ffffff", s2: "#f5f6fa",
  t1: "#1a1a2e", t2: "#4a4a68", t3: "#8888a0", t4: "#c8c8dc",
  neural: "#8B5CF6", pulse: "#EC4899",
};

/* ─── 4軸レーダー ─── */
function RadarChart({ data }: {
  data: { physical: number; personality: number; behavioral: number; social: number };
}) {
  const cx = 50, cy = 50, r = 36;
  const labels = [
    { key: "physical" as const, label: "身体", angle: -Math.PI / 2 },
    { key: "personality" as const, label: "性格", angle: 0 },
    { key: "behavioral" as const, label: "行動", angle: Math.PI / 2 },
    { key: "social" as const, label: "社会", angle: Math.PI },
  ];
  const points = labels.map(({ key, angle }) => {
    const v = (data[key] / 100) * r;
    return { x: cx + v * Math.cos(angle), y: cy + v * Math.sin(angle) };
  });
  const polygon = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg viewBox="0 0 100 100" className="w-full max-w-[160px] mx-auto">
      <defs>
        <linearGradient id="radar-fill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={C.neural} stopOpacity="0.15" />
          <stop offset="100%" stopColor={C.pulse} stopOpacity="0.1" />
        </linearGradient>
      </defs>
      {[0.33, 0.66, 1.0].map((level) => (
        <polygon key={level}
          points={labels.map(({ angle }) => `${cx + r * level * Math.cos(angle)},${cy + r * level * Math.sin(angle)}`).join(" ")}
          fill="none" stroke={`${C.t4}50`} strokeWidth="0.3" />
      ))}
      {labels.map(({ key, angle }) => (
        <line key={key} x1={cx} y1={cy} x2={cx + r * Math.cos(angle)} y2={cy + r * Math.sin(angle)}
          stroke={`${C.t4}30`} strokeWidth="0.3" />
      ))}
      <polygon points={polygon} fill="url(#radar-fill)" stroke={C.neural} strokeWidth="0.8" strokeOpacity="0.5" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2" fill={C.neural} fillOpacity="0.7" />
      ))}
      {labels.map(({ key, label, angle }) => {
        const lx = cx + (r + 11) * Math.cos(angle);
        const ly = cy + (r + 11) * Math.sin(angle);
        return <text key={key} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
          fill={C.t3} fontSize="5">{label}</text>;
      })}
    </svg>
  );
}

/* ─── Completeness リング ─── */
function CompletenessRing({ value }: { value: number }) {
  const r = 22, c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <div className="relative flex-shrink-0" style={{ width: 52, height: 52 }}>
      <svg viewBox="0 0 52 52" className="w-full h-full -rotate-90">
        <circle cx="26" cy="26" r={r} fill="none" stroke={C.s2} strokeWidth="3" />
        <defs>
          <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={C.neural} />
            <stop offset="100%" stopColor={C.pulse} />
          </linearGradient>
        </defs>
        <motion.circle
          cx="26" cy="26" r={r} fill="none"
          stroke="url(#ring-grad)" strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center"
        style={{ fontSize: 11, fontWeight: 700, color: C.t1 }}>
        {value}%
      </span>
    </div>
  );
}

/* ═══ メインコンポーネント ═══ */
interface Props {
  card: GenomeCardData;
  level?: VisibilityLevel;
  compact?: boolean;
}

export default function GenomeCardVisual({ card, level, compact }: Props) {
  const effectiveLevel: VisibilityLevel = level ?? (card.genome ? 3 : card.layerCompleteness ? 2 : 1);
  const theme = getCardTheme(card.archetypeLabel);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div className="rounded-2xl overflow-hidden" style={{
        background: C.s1,
        border: `1px solid ${C.s2}`,
        padding: compact ? 16 : 24,
      }}>
        {/* Lv1: ヘッダー */}
        <div className="flex items-center gap-4">
          {card.avatarUrl ? (
            <img src={card.avatarUrl} alt="" className="w-14 h-14 rounded-xl object-cover" style={{ border: `1px solid ${C.s2}` }} />
          ) : (
            <div className="w-14 h-14 rounded-xl flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${C.neural}15, ${C.pulse}15)`, fontSize: 22, color: C.t3 }}>
              ✦
            </div>
          )}
          <div className="flex-1 min-w-0">
            {card.displayName && (
              <p style={{ fontSize: 14, fontWeight: 600, color: C.t1 }} className="truncate">{card.displayName}</p>
            )}
            {card.archetypeLabel && (
              <p style={{
                fontSize: 12, fontWeight: 600, marginTop: 2,
                background: `linear-gradient(135deg, ${theme.accentHex}, ${C.pulse})`,
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              }}>
                {theme.symbol} {card.archetypeLabel}
              </p>
            )}
            {card.summaryLine && (
              <p style={{ fontSize: 11, color: C.t3, marginTop: 4 }} className="line-clamp-2">{card.summaryLine}</p>
            )}
          </div>
          <CompletenessRing value={card.completeness} />
        </div>

        {/* Lv2: レーダー + 特性 */}
        {effectiveLevel >= 2 && card.layerCompleteness && !compact && (
          <motion.div
            className="space-y-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            style={{ marginTop: 20 }}
          >
            <RadarChart data={card.layerCompleteness} />
            {card.topTraits && card.topTraits.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {card.topTraits.map((t) => (
                  <span key={t.id} style={{
                    fontSize: 10, padding: "3px 10px", borderRadius: 20,
                    background: C.s2, color: C.t2,
                  }}>{t.label}</span>
                ))}
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              {card.pcSeason && (
                <span style={{
                  fontSize: 10, padding: "3px 10px", borderRadius: 20,
                  background: `${C.neural}10`, color: C.neural, border: `1px solid ${C.neural}20`,
                }}>{card.pcSeason}</span>
              )}
              {card.topStyleLanes?.map((lane) => (
                <span key={lane} style={{
                  fontSize: 10, padding: "3px 10px", borderRadius: 20, background: C.s2, color: C.t3,
                }}>{lane}</span>
              ))}
            </div>
          </motion.div>
        )}

        {/* Lv3: ストランド */}
        {effectiveLevel >= 3 && card.visualization && !compact && (
          <motion.div
            className="space-y-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.s2}` }}
          >
            <p style={{ fontSize: 10, fontWeight: 500, color: C.t3, letterSpacing: "0.08em" }}>あなたの構成要素</p>
            {card.visualization.strands.map((strand) => (
              <div key={strand.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: strand.color, boxShadow: `0 0 4px ${strand.color}40` }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.t1 }}>{strand.label}</span>
                </div>
                {strand.basePairs.slice(0, 4).map((bp) => (
                  <div key={bp.id} className="flex items-center gap-2">
                    <span style={{ fontSize: 9, color: C.t3, width: 80, textAlign: "right", flexShrink: 0 }}>{bp.label}</span>
                    <div style={{ flex: 1, height: 4, borderRadius: 2, background: C.s2, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 2, width: `${Math.round(bp.value * 100)}%`,
                        background: strand.color, opacity: 0.6, transition: "width 0.8s ease",
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {card.visualization.dominantTraits.length > 0 && (
              <div>
                <p style={{ fontSize: 9, color: C.t4, marginBottom: 4 }}>主な特徴</p>
                <div className="flex flex-wrap gap-1">
                  {card.visualization.dominantTraits.slice(0, 4).map((t) => (
                    <span key={t.id} style={{
                      fontSize: 10, padding: "3px 10px", borderRadius: 20,
                      background: `${C.neural}10`, color: C.neural, border: `1px solid ${C.neural}20`,
                    }}>{t.label}</span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {effectiveLevel < 3 && (
          <div className="text-center" style={{ marginTop: 16 }}>
            <span style={{ fontSize: 10, color: C.t4 }}>公開レベル {effectiveLevel}/3</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
