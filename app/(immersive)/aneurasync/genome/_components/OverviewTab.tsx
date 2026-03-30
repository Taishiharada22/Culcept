"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import type {
  PersonaGenome,
  GenomeVisualizationData,
  GenomeBasePair,
} from "@/lib/aneurasync/personaGenome";
import DnaHelixHero from "./DnaHelixHero";
import ShareGenomeCard from "./ShareGenomeCard";
import SocialProofBadge from "./SocialProofBadge";

interface OverviewTabProps {
  genome: PersonaGenome;
  visualization: GenomeVisualizationData;
}

const LAYER_COLORS: Record<string, { accent: string; bg: string }> = {
  physical: { accent: "#6366f1", bg: "rgba(99,102,241,0.08)" },
  personality: { accent: "#8b5cf6", bg: "rgba(139,92,246,0.08)" },
  behavioral: { accent: "#ec4899", bg: "rgba(236,72,153,0.08)" },
  social: { accent: "#14b8a6", bg: "rgba(20,184,166,0.08)" },
};

const LAYER_LABELS: Record<string, string> = {
  physical: "フィジカル",
  personality: "パーソナリティ",
  behavioral: "ビヘイビア",
  social: "ソーシャル",
};

const LAYER_CTA: Record<string, { label: string; href: string }> = {
  physical: { label: "体型・カラー診断", href: "/body-color/avatar" },
  personality: { label: "観測を続ける", href: "/stargazer" },
  behavioral: { label: "探索する", href: "/" },
  social: { label: "マッチを探す", href: "/rendezvous" },
};

export default function OverviewTab({ genome, visualization }: OverviewTabProps) {
  const layers = Object.entries(genome.layerCompleteness) as Array<
    [keyof typeof genome.layerCompleteness, number]
  >;

  // Find weakest layer for recommendation
  const weakest = layers.reduce((a, b) => (a[1] <= b[1] ? a : b));

  return (
    <div className="space-y-8">
      {/* Today's Highlight Hero */}
      {visualization.dominantTraits[0] && (
        <motion.div
          className="relative overflow-hidden rounded-[36px] border border-white/85 bg-gradient-to-br from-violet-50/80 via-white/90 to-fuchsia-50/80 p-8 shadow-[0_24px_64px_rgba(148,163,184,0.18)] backdrop-blur-xl"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          role="region"
          aria-label="今日のハイライト"
        >
          <div className="text-xs font-medium tracking-wider text-violet-400 uppercase">今日のハイライト</div>
          <div className="mt-3 text-2xl font-semibold text-slate-900" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            {visualization.dominantTraits[0].label}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            あなたのゲノムで最も確信度の高い特徴です。
            {visualization.dominantTraits[0].confidence > 0.8 ? "複数の観測データが一致しています。" : "さらなる観測で精度が向上します。"}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1">
              <div className="flex justify-between text-[11px] text-slate-400 mb-1.5">
                <span>{visualization.dominantTraits[0].leftLabel}</span>
                <span>{visualization.dominantTraits[0].rightLabel}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-white/80">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(visualization.dominantTraits[0].value * 100)}%` }}
                  transition={{ delay: 0.4, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
            <span className="rounded-full bg-violet-500/10 px-3 py-1.5 text-sm font-bold text-violet-600">
              {Math.round(visualization.dominantTraits[0].confidence * 100)}%
            </span>
          </div>
        </motion.div>
      )}

      {/* DNA Helix Hero */}
      <DnaHelixHero
        strands={visualization.strands}
        overallLabel={visualization.overallLabel}
        overallDescription={visualization.overallDescription}
        completeness={genome.completeness}
      />

      {/* Layer Completeness */}
      <SurfaceCard aria-label="ゲノム完成度">
        <CardTitle>ゲノム完成度</CardTitle>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {layers.map(([key, pct], i) => {
            const color = LAYER_COLORS[key];
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06, duration: 0.4 }}
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-700">
                    {LAYER_LABELS[key]}
                  </span>
                  <span className="font-semibold" style={{ color: color?.accent }}>
                    {Math.round(pct)}%
                  </span>
                </div>
                <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-slate-100">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: color?.accent }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ delay: 0.3 + i * 0.08, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    role="progressbar"
                    aria-valuenow={Math.round(pct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${LAYER_LABELS[key]}の完成度 ${Math.round(pct)}%`}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      </SurfaceCard>

      {/* Dominant Traits */}
      {visualization.dominantTraits.length > 0 && (
        <SurfaceCard aria-label="強い特徴">
          <CardTitle>強い特徴</CardTitle>
          <div className="mt-4 space-y-3">
            {visualization.dominantTraits.map((trait, i) => (
              <TraitBar key={trait.id} trait={trait} index={i} />
            ))}
          </div>
        </SurfaceCard>
      )}

      {/* Weak / Uncertain Traits */}
      {visualization.weakTraits.length > 0 && (
        <SurfaceCard aria-label="観測が必要な領域">
          <CardTitle>観測が必要な領域</CardTitle>
          <p className="mt-1 text-sm text-slate-500">
            信頼度が低い特徴。データを集めると精度が向上します
          </p>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
            {visualization.weakTraits.map((trait) => (
              <span
                key={trait.id}
                className="shrink-0 rounded-full border border-dashed border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-500"
              >
                {trait.label}
              </span>
            ))}
          </div>
        </SurfaceCard>
      )}

      {/* Next Best Action */}
      {weakest[1] < 100 && (
        <SurfaceCard className="text-center" aria-label="次のアクション">
          <div className="text-3xl">🧬</div>
          <CardTitle className="mt-3">
            ゲノムの解像度を上げましょう
          </CardTitle>
          <p className="mx-auto mt-2 max-w-[380px] text-sm text-slate-500">
            {LAYER_LABELS[weakest[0]]}層のデータを集めると、あなたの深層パターンがより鮮明になります
          </p>
          <div className="mt-5">
            <Link
              href={LAYER_CTA[weakest[0]]?.href ?? "/aneurasync"}
              className="inline-flex items-center justify-center gap-2 rounded-[18px] bg-slate-900 px-5 py-3 text-sm font-semibold text-white no-underline shadow-[0_12px_30px_rgba(15,23,42,0.18)] transition hover:bg-slate-800"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
              </span>
              {LAYER_CTA[weakest[0]]?.label ?? "探索する"}
            </Link>
          </div>
        </SurfaceCard>
      )}

      {/* Social Proof */}
      <SocialProofBadge
        completenessPercentile={genome.completeness > 80 ? 15 : genome.completeness > 50 ? 35 : 60}
        archetypeLabel={genome.personality.archetypeLabel ?? undefined}
        archetypeSharePct={12}
      />

      {/* Share */}
      <div className="flex justify-center">
        <ShareGenomeCard
          overallLabel={visualization.overallLabel}
          completeness={genome.completeness}
          topTraits={visualization.dominantTraits.slice(0, 3).map((t) => ({
            label: t.label,
            value: t.value,
            confidence: t.confidence,
          }))}
          archetypeLabel={genome.personality.archetypeLabel ?? undefined}
        />
      </div>
    </div>
  );
}

/* ─── Shared sub-components ─── */

function SurfaceCard({
  children,
  className,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      role="region"
      aria-label={ariaLabel}
      className={`rounded-[32px] border border-white/85 bg-white/76 p-7 sm:p-8 shadow-[0_18px_48px_rgba(148,163,184,0.14)] ring-1 ring-slate-200/55 backdrop-blur-xl ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

function CardTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`text-xl font-semibold text-slate-900 ${className ?? ""}`}
      style={{ fontFamily: "'Cormorant Garamond', serif" }}
    >
      {children}
    </div>
  );
}

function TraitBar({ trait, index }: { trait: GenomeBasePair; index: number }) {
  const pct = Math.round(trait.value * 100);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4 }}
    >
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{trait.leftLabel}</span>
        <span className="text-sm font-semibold text-slate-600">{trait.label}</span>
        <span>{trait.rightLabel}</span>
      </div>
      <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-slate-100">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ delay: 0.2 + index * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${trait.label} ${pct}%`}
        />
      </div>
      <div className="mt-1 text-right text-[11px] text-slate-400">
        信頼度 {Math.round(trait.confidence * 100)}%
      </div>
    </motion.div>
  );
}
