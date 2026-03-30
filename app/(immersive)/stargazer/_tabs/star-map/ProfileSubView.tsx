// app/stargazer/_tabs/star-map/ProfileSubView.tsx
// アーキタイプタブ「プロフィール」サブビュー — 強み・注意・関係性 + 進化 + AI学習
"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import EvolutionTimeline from "../../_components/EvolutionTimeline";
import AILearningIndicator from "../../_components/AILearningIndicator";
import SectionTransition from "../../_components/SectionTransition";
import CompatibilitySection from "../../_components/CompatibilitySection";
import {
  StrengthsSection,
  CautionsSection,
  RelationshipsSection,
  DefiningTraitsSection,
  DeepDiveSection,
} from "./shared";
import { useArchetypeTheme } from "../../_components/ArchetypeThemeProvider";
import { hexToRgba } from "../../_utils/color";
import { getArchetypeByCode } from "@/lib/stargazer/archetypeTypes";
import type { ArchetypeResult } from "@/lib/stargazer/archetypeResolver";
import type { ProfileContent, GrowthDirection } from "@/lib/stargazer/profileContentGenerator";

// Matches the inline type from StarMapTabProps.axisHistory
interface AxisHistoryEntry {
  date: string;
  scores: Record<string, number>;
  events?: Array<{ type: "contradiction" | "milestone" | "shift"; label: string }>;
}

interface ProfileSubViewProps {
  profileContent: ProfileContent | null;
  axisHistory?: AxisHistoryEntry[];
  aiLearningStats?: {
    categoryAccuracy?: Record<string, { accuracy: number; totalPredictions: number; trend: "improving" | "stable" | "declining" }>;
    overallAccuracy?: number;
    observationCount?: number;
  };
  totalObservations: number;
  onNavigateToDeep?: () => void;
  archetypeResult?: ArchetypeResult | null;
}

// 段階的空状態のプレースホルダーカード
// SVG placeholder icons — 24x24, currentColor
const PLACEHOLDER_ICONS: Record<string, React.ReactNode> = {
  diamond: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12l4 8-10 10L2 11z" />
      <path d="M2 11h20" />
      <path d="M12 21L8 11l4-8 4 8z" />
    </svg>
  ),
  warning: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <circle cx="12" cy="17" r="0.5" fill="currentColor" />
    </svg>
  ),
  connection: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="12" r="3" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <circle cx="12" cy="6" r="2" />
      <line x1="12" y1="8" x2="12" y2="10" />
    </svg>
  ),
  flame: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22c-4.97 0-7-3.58-7-7 0-3.07 2.17-5.66 3.5-7 .65 1.91 2 3 3.5 3 2.2 0 3.5-2.1 3.5-4 0-.53-.12-1.04-.35-1.5C17.66 8.35 19 11.13 19 15c0 3.42-2.03 7-7 7z" />
    </svg>
  ),
};

function PlaceholderSection({
  label,
  requiredObs,
  currentObs,
  icon,
}: {
  label: string;
  requiredObs: number;
  currentObs: number;
  icon: string;
}) {
  const { theme } = useArchetypeTheme();
  const remaining = Math.max(requiredObs - currentObs, 1);

  return (
    <motion.div
      className="rounded-xl p-4 text-center"
      style={{
        border: `1px dashed ${theme ? hexToRgba(theme.palette.primary, 0.15) : "rgba(176,144,80,0.15)"}`,
        background: theme
          ? hexToRgba(theme.palette.primary, 0.02)
          : "rgba(176,144,80,0.02)",
      }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <span className="block mb-2 opacity-30" style={{ color: theme?.palette.textMuted ?? "rgba(100,105,130,0.5)" }}>
        {PLACEHOLDER_ICONS[icon] ?? icon}
      </span>
      <p
        className="font-display text-sm font-bold"
        style={{
          color: theme?.palette.textMuted ?? "rgba(60,65,85,0.5)",
        }}
      >
        {label}
      </p>
      <p
        className="text-xs mt-1"
        style={{
          color: theme?.palette.textMuted ?? "rgba(100,105,130,0.4)",
        }}
      >
        あと{remaining}回の観測で解放
      </p>
    </motion.div>
  );
}

// ── Growth Direction Section ──

function GrowthDirectionSection({ growth }: { growth: GrowthDirection }) {
  const { theme } = useArchetypeTheme();
  const primary = theme?.palette.primary ?? "#8B5CF6";
  const textColor = theme?.palette.text ?? "rgba(20,25,45,0.95)";
  const textMuted = theme?.palette.textMuted ?? "rgba(60,65,85,0.7)";
  const textLabel = theme?.palette.textLabel ?? "rgba(140,120,60,0.8)";

  return (
    <section>
      <div className="mb-4">
        <span
          className="text-section-header font-semibold"
          style={{ color: textLabel }}
        >
          成長の方向性
        </span>
        <h3
          className="font-display text-xl font-bold mt-1"
          style={{ color: textColor }}
        >
          観測データが示す、次のステップ
        </h3>
      </div>

      <div className="space-y-3">
        {/* Current phase */}
        <div
          className="card-section"
          style={{ borderLeft: `3px solid ${hexToRgba(primary, 0.35)}` }}
        >
          <span
            className="text-[10px] font-mono-sg uppercase tracking-wider block mb-1"
            style={{ color: textLabel }}
          >
            現在のフェーズ
          </span>
          <p className="text-sm font-medium" style={{ color: textColor }}>
            {growth.currentPhase}
          </p>
          {growth.growthEdge && (
            <p className="text-xs mt-1.5 leading-relaxed" style={{ color: textMuted }}>
              {growth.growthEdge}
            </p>
          )}
        </div>

        {/* Action suggestions as checklist */}
        {growth.actionSuggestions.length > 0 && (
          <div className="space-y-2">
            <span
              className="text-[10px] font-mono-sg uppercase tracking-wider block"
              style={{ color: textLabel }}
            >
              試してみること
            </span>
            {growth.actionSuggestions.map((suggestion, i) => (
              <motion.div
                key={i}
                className="card-section flex items-start gap-3 py-3"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.06 }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={hexToRgba(primary, 0.4)}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 mt-0.5"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 12l2 2 4-4" />
                </svg>
                <p className="text-sm leading-relaxed" style={{ color: textColor }}>
                  {suggestion}
                </p>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ── 深層セクション — coreFear / coreDesire / innerContradiction / forbiddenPhrase ──

function DeepArchetypeSection({
  coreFear,
  coreDesire,
  innerContradiction,
  forbiddenPhrase,
}: {
  coreFear: string;
  coreDesire: string;
  innerContradiction: string;
  forbiddenPhrase: string;
}) {
  const { theme } = useArchetypeTheme();
  const primary = theme?.palette.primary ?? "#8B5CF6";
  const textColor = theme?.palette.text ?? "rgba(20,25,45,0.95)";
  const textMuted = theme?.palette.textMuted ?? "rgba(60,65,85,0.7)";
  const textLabel = theme?.palette.textLabel ?? "rgba(140,120,60,0.8)";

  return (
    <section>
      <div className="mb-4">
        <span
          className="text-section-header font-semibold"
          style={{ color: textLabel }}
        >
          深層
        </span>
        <h3
          className="font-display text-xl font-bold mt-1"
          style={{ color: textColor }}
        >
          あなたを動かしている、根の部分
        </h3>
      </div>

      <div className="space-y-3">
        {/* coreFear + coreDesire — side by side */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div
            className="card-section"
            style={{ borderLeft: `3px solid ${hexToRgba(primary, 0.25)}` }}
          >
            <span
              className="text-[10px] font-mono-sg uppercase tracking-wider block mb-1.5"
              style={{ color: textLabel }}
            >
              根源的恐怖
            </span>
            <p className="text-sm leading-relaxed" style={{ color: textColor }}>
              {coreFear}
            </p>
          </div>

          <div
            className="card-section"
            style={{ borderLeft: `3px solid ${hexToRgba(primary, 0.25)}` }}
          >
            <span
              className="text-[10px] font-mono-sg uppercase tracking-wider block mb-1.5"
              style={{ color: textLabel }}
            >
              根源的欲求
            </span>
            <p className="text-sm leading-relaxed" style={{ color: textColor }}>
              {coreDesire}
            </p>
          </div>
        </div>

        {/* innerContradiction */}
        <div
          className="card-section"
          style={{ borderLeft: `3px solid ${hexToRgba(primary, 0.35)}` }}
        >
          <span
            className="text-[10px] font-mono-sg uppercase tracking-wider block mb-1.5"
            style={{ color: textLabel }}
          >
            あなたの矛盾
          </span>
          <p className="text-sm leading-relaxed" style={{ color: textColor }}>
            {innerContradiction}
          </p>
        </div>

        {/* forbiddenPhrase */}
        <div
          className="card-section"
          style={{ borderLeft: `3px solid ${hexToRgba(primary, 0.45)}` }}
        >
          <span
            className="text-[10px] font-mono-sg uppercase tracking-wider block mb-1.5"
            style={{ color: textLabel }}
          >
            禁句
          </span>
          <p
            className="text-sm leading-relaxed italic"
            style={{ color: textMuted }}
          >
            &ldquo;{forbiddenPhrase}&rdquo;
          </p>
        </div>
      </div>
    </section>
  );
}

export default function ProfileSubView({
  profileContent,
  axisHistory,
  aiLearningStats,
  totalObservations,
  onNavigateToDeep,
  archetypeResult,
}: ProfileSubViewProps) {
  const { theme } = useArchetypeTheme();

  const archetypeDef = archetypeResult
    ? getArchetypeByCode(archetypeResult.code)
    : null;

  const hasStrengths =
    profileContent && profileContent.strengths.length > 0;
  const hasCautions =
    profileContent && profileContent.weaknesses.length > 0;
  const hasRelationships =
    profileContent && profileContent.relationships.length > 0;
  const hasTraits =
    profileContent && profileContent.influentialTraits.length > 0;
  const hasTimeline = axisHistory && axisHistory.length >= 2;
  // ── 相性傾向データ取得 ──
  const [compatibility, setCompatibility] = useState<any>(null);
  useEffect(() => {
    if (totalObservations < 5) return;
    fetch("/api/stargazer/compatibility")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.compatibility) setCompatibility(d.compatibility);
      })
      .catch(() => {});
  }, [totalObservations]);

  const hasAnyContent =
    hasStrengths ||
    hasCautions ||
    hasRelationships ||
    hasTraits ||
    hasTimeline;

  return (
    <div className="space-y-6 sm:space-y-8 pb-6 sm:pb-8 lg:pb-12 xl:max-w-5xl xl:mx-auto">
      {/* ═══ 強み + 注意 (2-column on desktop) ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 md:gap-6 space-y-6 md:space-y-0">
        <div>
          {hasStrengths ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
            >
              <StrengthsSection strengths={profileContent!.strengths} />
            </motion.div>
          ) : (
            <PlaceholderSection
              label="強み"
              requiredObs={5}
              currentObs={totalObservations}
              icon="diamond"
            />
          )}
        </div>

        <div>
          {hasCautions ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: 0.05 }}
            >
              <CautionsSection weaknesses={profileContent!.weaknesses} />
            </motion.div>
          ) : (
            <PlaceholderSection
              label="注意傾向"
              requiredObs={7}
              currentObs={totalObservations}
              icon="warning"
            />
          )}
        </div>
      </div>

      {/* ═══ 対人関係 + 原動力 (2-column on desktop) ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 md:gap-6 space-y-6 md:space-y-0">
        <div>
          {hasRelationships ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: 0.1 }}
            >
              <RelationshipsSection
                relationships={profileContent!.relationships}
              />
            </motion.div>
          ) : (
            <PlaceholderSection
              label="関係性パターン"
              requiredObs={8}
              currentObs={totalObservations}
              icon="connection"
            />
          )}
        </div>

        <div>
          {hasTraits ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: 0.15 }}
            >
              <DefiningTraitsSection
                traits={profileContent!.influentialTraits}
              />
            </motion.div>
          ) : (
            <PlaceholderSection
              label="行動の原動力"
              requiredObs={10}
              currentObs={totalObservations}
              icon="flame"
            />
          )}
        </div>
      </div>

      {/* ═══ 成長の方向性 ═══ */}
      {profileContent?.growthDirection && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.18 }}
        >
          <GrowthDirectionSection growth={profileContent.growthDirection} />
        </motion.div>
      )}

      {/* ═══ 深層 — coreFear / coreDesire / innerContradiction / forbiddenPhrase ═══ */}
      {archetypeDef?.coreFear && archetypeDef?.coreDesire && archetypeDef?.innerContradiction && archetypeDef?.forbiddenPhrase && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.22 }}
        >
          <DeepArchetypeSection
            coreFear={archetypeDef.coreFear}
            coreDesire={archetypeDef.coreDesire}
            innerContradiction={archetypeDef.innerContradiction}
            forbiddenPhrase={archetypeDef.forbiddenPhrase}
          />
        </motion.div>
      )}

      {/* ═══ 相性傾向 ═══ */}
      {compatibility && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.2 }}
        >
          <CompatibilitySection
            resolvedType={null}
            compatibility={compatibility}
            lightMode
          />
        </motion.div>
      )}

      {/* ═══ Evolution Timeline — cosmic transition ═══ */}
      {hasTimeline ? (
        <SectionTransition preset="cosmic" direction="up" transitionKey="evolution">
          <EvolutionTimeline history={axisHistory!} compact={false} />
        </SectionTransition>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl p-5 text-center"
          style={{
            background: "rgba(255,255,255,0.4)",
            border: "1px dashed rgba(148,163,184,0.2)",
          }}
        >
          <div className="text-2xl mb-2">📈</div>
          <p className="text-xs font-medium" style={{ color: "rgba(100,116,139,0.7)" }}>進化タイムライン</p>
          <p className="text-[10px] mt-1" style={{ color: "rgba(100,116,139,0.5)" }}>
            2日以上の観測が蓄積されると、あなたの内面の変化がここに浮かび上がります
          </p>
        </motion.div>
      )}

      {/* ═══ AI Learning — slide transition ═══ */}
      {aiLearningStats ? (
        <SectionTransition preset="slide" direction="up" transitionKey="ai-learning">
          <AILearningIndicator
            mode="detailed"
            categoryAccuracy={aiLearningStats.categoryAccuracy}
            overallAccuracy={aiLearningStats.overallAccuracy}
            observationCount={aiLearningStats.observationCount}
          />
        </SectionTransition>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl p-5 text-center"
          style={{
            background: "rgba(255,255,255,0.4)",
            border: "1px dashed rgba(148,163,184,0.2)",
          }}
        >
          <div className="text-2xl mb-2">🧠</div>
          <p className="text-xs font-medium" style={{ color: "rgba(100,116,139,0.7)" }}>AI学習状況</p>
          <p className="text-[10px] mt-1" style={{ color: "rgba(100,116,139,0.5)" }}>
            予測にフィードバックすると、観測AIの学習状況がここに現れます
          </p>
        </motion.div>
      )}

      {/* ═══ Deep Dive Link ═══ */}
      {hasAnyContent && (
        <>
          <div className="sg-divider" />
          <DeepDiveSection onNavigateToDeep={onNavigateToDeep} />
        </>
      )}
    </div>
  );
}
