// app/sns/profile/_components/OthersViewTab.tsx
// Presence 4thタブ「相手から見た私」
// 8関係カテゴリ別の印象ナラティブ + 関係性レーダーチャート
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useInView } from "framer-motion";
import type { RelationshipCategory } from "@/lib/stargazer/partnerTypes";
import {
  RELATIONSHIP_LABELS,
  RELATIONSHIP_ICONS,
  RELATIONSHIP_COLORS,
} from "@/lib/stargazer/partnerTypes";
import type {
  RelationshipCategoryView,
  RelationshipRadarDimension,
} from "@/lib/stargazer/relationshipNarratives";
import { RELATIONSHIP_RADAR_LABELS } from "@/lib/stargazer/relationshipNarratives";
import type { OthersViewData } from "@/app/api/sns/stargazer-bridge/route";

/* ════════════════════════════════════════════════════════
   Utilities
   ════════════════════════════════════════════════════════ */

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const CARD_CLASS =
  "relative overflow-hidden rounded-[30px] border border-white/70 bg-white/88 shadow-[0_18px_60px_rgba(133,129,180,0.14)] backdrop-blur-xl";

const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const;

const CATEGORY_ORDER: RelationshipCategory[] = [
  "family",
  "friend",
  "romantic",
  "spouse",
  "colleague",
  "stranger",
  "close",
  "distant",
];

/* ════════════════════════════════════════════════════════
   Sub-components
   ════════════════════════════════════════════════════════ */

function ScrollReveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: EASE_OUT_EXPO }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function SurfaceCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={cx(CARD_CLASS, className)}>{children}</section>;
}

function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-6">
      <h3 className="text-lg font-black tracking-tight text-slate-900">
        {title}
      </h3>
      {subtitle && (
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          {subtitle}
        </p>
      )}
    </div>
  );
}

/* ── Category Chip ── */
function CategoryChip({
  category,
  selected,
  onClick,
}: {
  category: RelationshipCategory;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "relative flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-all whitespace-nowrap",
        selected
          ? "text-white shadow-[0_8px_20px_rgba(139,92,246,0.25)]"
          : "bg-white/60 text-slate-600 hover:bg-white/80 hover:text-slate-800"
      )}
    >
      {selected && (
        <motion.span
          layoutId="others-view-chip"
          className="absolute inset-0 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
          transition={{ type: "spring", stiffness: 360, damping: 30 }}
        />
      )}
      <span className="relative z-10">
        {RELATIONSHIP_ICONS[category]}
      </span>
      <span className="relative z-10">
        {RELATIONSHIP_LABELS[category]}
      </span>
    </button>
  );
}

/* ── Light-mode Radar Chart (8 axes) ── */
function LightRadarChart({
  dimensions,
  size = 260,
}: {
  dimensions: RelationshipRadarDimension[];
  size?: number;
}) {
  const cxCenter = size / 2;
  const cyCenter = size / 2;
  const radius = size * 0.36;
  const total = dimensions.length;

  function getPoint(index: number, score: number): [number, number] {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
    const r = radius * (score / 100);
    return [cxCenter + r * Math.cos(angle), cyCenter + r * Math.sin(angle)];
  }

  function getPolygonPoints(dims: RelationshipRadarDimension[]): string {
    return dims
      .map((d, i) => {
        const [x, y] = getPoint(i, d.score);
        return `${x},${y}`;
      })
      .join(" ");
  }

  const gridLevels = [33, 66, 100];

  function getGridPath(level: number): string {
    const points = Array.from({ length: total }, (_, i) => {
      const [x, y] = getPoint(i, level);
      return `${x},${y}`;
    });
    return `M ${points.join(" L ")} Z`;
  }

  function getAxisLine(index: number): string {
    const [x, y] = getPoint(index, 100);
    return `M ${cxCenter},${cyCenter} L ${x},${y}`;
  }

  function getLabelPos(index: number): {
    x: number;
    y: number;
    anchor: "start" | "middle" | "end";
  } {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
    const labelR = radius + 26;
    const x = cxCenter + labelR * Math.cos(angle);
    const y = cyCenter + labelR * Math.sin(angle);

    let anchor: "start" | "middle" | "end" = "middle";
    if (Math.cos(angle) > 0.3) anchor = "start";
    else if (Math.cos(angle) < -0.3) anchor = "end";

    return { x, y: y + 4, anchor };
  }

  const polygonPoints = getPolygonPoints(dimensions);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className="mx-auto"
    >
      {/* Grid */}
      {gridLevels.map((level) => (
        <path
          key={level}
          d={getGridPath(level)}
          fill="none"
          stroke="rgba(139,92,246,0.08)"
          strokeWidth={1}
        />
      ))}

      {/* Axis lines */}
      {dimensions.map((_, i) => (
        <path
          key={`axis-${i}`}
          d={getAxisLine(i)}
          stroke="rgba(139,92,246,0.06)"
          strokeWidth={1}
        />
      ))}

      {/* Data polygon */}
      <motion.polygon
        points={polygonPoints}
        fill="rgba(139,92,246,0.12)"
        stroke="rgba(139,92,246,0.5)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{ transformOrigin: `${cxCenter}px ${cyCenter}px` }}
      />

      {/* Data points */}
      {dimensions.map((d, i) => {
        const [px, py] = getPoint(i, d.score);
        return (
          <motion.circle
            key={`point-${i}`}
            cx={px}
            cy={py}
            r={3}
            fill="rgba(139,92,246,0.6)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 + i * 0.05 }}
          />
        );
      })}

      {/* Labels */}
      {dimensions.map((d, i) => {
        const pos = getLabelPos(i);
        return (
          <text
            key={`label-${i}`}
            x={pos.x}
            y={pos.y}
            textAnchor={pos.anchor}
            fill="rgba(71,85,105,0.7)"
            fontSize={11}
            fontWeight={600}
            fontFamily="system-ui, sans-serif"
          >
            {d.label}
          </text>
        );
      })}

      {/* Score values */}
      {dimensions.map((d, i) => {
        const [px, py] = getPoint(i, d.score);
        if (d.score < 10) return null;
        return (
          <text
            key={`score-${i}`}
            x={px}
            y={py - 8}
            textAnchor="middle"
            fill="rgba(139,92,246,0.5)"
            fontSize={9}
            fontFamily="monospace"
          >
            {d.score}
          </text>
        );
      })}
    </svg>
  );
}

/* ── Detail Row ── */
function DetailRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="flex gap-3 rounded-2xl border border-violet-100/50 bg-violet-50/30 px-4 py-3">
      <span className="text-lg">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-violet-400">{label}</div>
        <p className="mt-0.5 text-sm leading-relaxed text-slate-700">
          {value}
        </p>
      </div>
    </div>
  );
}

/* ── Impression Badge ── */
function ImpressionBadge({ text }: { text: string }) {
  return (
    <span className="inline-block rounded-full border border-violet-200/60 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-3 py-1 text-xs font-bold text-violet-700">
      {text}
    </span>
  );
}

/* ════════════════════════════════════════════════════════
   Main Component
   ════════════════════════════════════════════════════════ */

export default function OthersViewTab() {
  const [selectedCategory, setSelectedCategory] =
    useState<RelationshipCategory>("family");
  const [data, setData] = useState<OthersViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const chipScrollRef = useRef<HTMLDivElement>(null);

  // Fetch data from API
  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const res = await fetch("/api/sns/stargazer-bridge", {
          credentials: "include",
        });
        if (!res.ok) throw new Error("API error");
        const json = await res.json();
        if (!cancelled) {
          if (json.hasData === false) {
            // No Stargazer data yet
            setData(null);
          } else {
            setData(json as OthersViewData);
          }
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  // Find selected category view
  const selectedView = data?.categories.find(
    (c) => c.category === selectedCategory
  );

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <motion.div
          className="h-8 w-8 rounded-full border-2 border-violet-200 border-t-violet-500"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        />
        <p className="mt-4 text-sm text-slate-400">読み込み中...</p>
      </div>
    );
  }

  // ── No data state ──
  if (!data || error) {
    return (
      <ScrollReveal>
        <SurfaceCard className="px-6 py-10 sm:px-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="text-4xl">🔭</span>
            <h3 className="text-lg font-black text-slate-800">
              まだデータがありません
            </h3>
            <p className="max-w-xs text-sm leading-relaxed text-slate-500">
              Stargazer で自己観測を始めると、相手から見たあなたの印象が表示されます
            </p>
            <Link
              href="/stargazer"
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(139,92,246,0.25)] transition hover:shadow-[0_12px_28px_rgba(139,92,246,0.3)]"
            >
              Stargazer を開く →
            </Link>
          </div>
        </SurfaceCard>
      </ScrollReveal>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <ScrollReveal>
        <SurfaceCard className="px-6 py-7 sm:px-8">
          <SectionHeading
            title="相手から見たあなた"
            subtitle="関係性によって、あなたの見え方は変わる"
          />

          {/* ── Category Chips (horizontal scroll) ── */}
          <div
            ref={chipScrollRef}
            className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-2 scrollbar-hide sm:-mx-8 sm:px-8"
          >
            {CATEGORY_ORDER.map((cat) => (
              <CategoryChip
                key={cat}
                category={cat}
                selected={selectedCategory === cat}
                onClick={() => setSelectedCategory(cat)}
              />
            ))}
          </div>
        </SurfaceCard>
      </ScrollReveal>

      {/* ── Selected Category Detail ── */}
      <AnimatePresence mode="wait">
        {selectedView && (
          <motion.div
            key={selectedView.category}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            {/* ── Summary + Impressions ── */}
            <ScrollReveal delay={0.05}>
              <SurfaceCard className="px-6 py-7 sm:px-8">
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-2xl">
                    {RELATIONSHIP_ICONS[selectedView.category]}
                  </span>
                  <h4 className="text-base font-black text-slate-800">
                    {RELATIONSHIP_LABELS[selectedView.category]}から見たあなた
                  </h4>
                </div>

                {/* Summary */}
                <p className="mb-5 text-[15px] font-medium leading-relaxed text-slate-700">
                  {selectedView.summary}
                </p>

                {/* Impression Top 3 */}
                <div className="mb-1 text-xs font-bold text-violet-400">
                  印象 Top 3
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedView.impressionTop3.map((imp) => (
                    <ImpressionBadge key={imp} text={imp} />
                  ))}
                </div>
              </SurfaceCard>
            </ScrollReveal>

            {/* ── Comfort & Misunderstanding ── */}
            <ScrollReveal delay={0.1}>
              <SurfaceCard className="px-6 py-7 sm:px-8">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-emerald-100/60 bg-gradient-to-br from-emerald-50/60 to-teal-50/40 px-5 py-4">
                    <div className="mb-2 text-xs font-bold text-emerald-500">
                      😌 安心ポイント
                    </div>
                    <p className="text-sm leading-relaxed text-slate-700">
                      {selectedView.comfort}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-amber-100/60 bg-gradient-to-br from-amber-50/60 to-yellow-50/40 px-5 py-4">
                    <div className="mb-2 text-xs font-bold text-amber-500">
                      😮 誤解されやすい点
                    </div>
                    <p className="text-sm leading-relaxed text-slate-700">
                      {selectedView.misunderstanding}
                    </p>
                  </div>
                </div>
              </SurfaceCard>
            </ScrollReveal>

            {/* ── Misunderstanding Reduction ── */}
            <ScrollReveal delay={0.12}>
              <SurfaceCard className="px-6 py-7 sm:px-8">
                <div className="rounded-2xl border border-sky-100/60 bg-gradient-to-br from-sky-50/60 to-blue-50/40 px-5 py-4">
                  <div className="mb-2 text-xs font-bold text-sky-500">
                    💡 誤解を減らす一手
                  </div>
                  <p className="text-sm leading-relaxed text-slate-700">
                    {selectedView.misunderstandingReduction}
                  </p>
                </div>
              </SurfaceCard>
            </ScrollReveal>

            {/* ── Detail Rows ── */}
            <ScrollReveal delay={0.15}>
              <SurfaceCard className="space-y-3 px-6 py-7 sm:px-8">
                <SectionHeading
                  title="関係のディテール"
                  subtitle="この関係性でのあなたの特徴"
                />
                <DetailRow
                  icon="📏"
                  label="距離感"
                  value={selectedView.distance}
                />
                <DetailRow
                  icon="🚪"
                  label="近寄りやすさ"
                  value={selectedView.approachability}
                />
                <DetailRow
                  icon="💨"
                  label="圧・柔らかさ"
                  value={selectedView.pressure}
                />
                <DetailRow
                  icon="🤝"
                  label="信頼感"
                  value={selectedView.trust}
                />
                <DetailRow
                  icon="🎭"
                  label="ギャップ"
                  value={selectedView.gap}
                />
                <DetailRow
                  icon="🎬"
                  label="場面"
                  value={selectedView.scene}
                />
                <DetailRow
                  icon="👔"
                  label="服装傾向"
                  value={selectedView.clothingTendency}
                />
                <DetailRow
                  icon="💬"
                  label="話し方"
                  value={selectedView.speechPattern}
                />
              </SurfaceCard>
            </ScrollReveal>

            {/* ── Relationship Radar Chart ── */}
            <ScrollReveal delay={0.2}>
              <SurfaceCard className="px-6 py-7 sm:px-8">
                <SectionHeading
                  title="関係性レーダー"
                  subtitle={`${RELATIONSHIP_LABELS[selectedView.category]}に対する8つの軸`}
                />
                <LightRadarChart dimensions={selectedView.radar} />
              </SurfaceCard>
            </ScrollReveal>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Stargazer Link ── */}
      <ScrollReveal delay={0.25}>
        <div className="flex justify-center">
          <Link
            href="/stargazer"
            className="inline-flex items-center gap-2 rounded-full border border-violet-200/60 bg-white/80 px-6 py-3 text-sm font-bold text-violet-600 shadow-[0_8px_24px_rgba(139,92,246,0.1)] backdrop-blur-xl transition hover:bg-violet-50 hover:shadow-[0_12px_30px_rgba(139,92,246,0.15)]"
          >
            🔭 Stargazer で詳しく見る →
          </Link>
        </div>
      </ScrollReveal>
    </div>
  );
}
