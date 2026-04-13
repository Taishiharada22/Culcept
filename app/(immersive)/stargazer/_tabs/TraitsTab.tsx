// app/stargazer/_tabs/TraitsTab.tsx
// 特性タブ — 5層の自己認識を段階的に深める
//
// Level 1: 行動の気づき  — 「自分はこういう選択をしていたのか」
// Level 2: パターンの命名 — 「この繰り返しに名前がつくのか」
// Level 3: 矛盾の統合   — 「矛盾する自分も、自分だったのか」
// Level 4: 深層パターン  — 「自分はこれを守ろうとしていたのか」
// Level 5: 意味の発見   — 「だから自分はこう生きているのか」
//
// 心理学的根拠:
//   Jung (影の統合), IFS (見守り型・追放者), Rogers (real self / ideal self),
//   Eurich (内的/外的自己認識), Haidt (象と騎手), Enneagram (命名による解放),
//   CliftonStrengths (Being Seen体験), 本音と建前 (日本文化特有の自己疎外),
//   Frankl (ロゴセラピー — 意味への意志)
"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { DerivedTraitCard, ContextDifference } from "@/lib/stargazer/traitCards";
import {
  generateProfileContent,
  type ProfileContent,
} from "@/lib/stargazer/profileContentGenerator";
import type { TypeDefLike } from "@/lib/stargazer/dailyInsightEngine";
import {
  computeCareerMatches,
  getAxisDisplayLabel,
  CATEGORY_LABELS,
  type CareerMatch,
} from "@/lib/stargazer/careerAptitude";
import type { ArchetypeResult, DualArchetypeResult } from "@/lib/stargazer/archetypeResolver";
import { getArchetypeByCode, LAYER1_DEFS, LAYER2_DEFS, LAYER3_DEFS, EXECUTION_DEFS } from "@/lib/stargazer/archetypeTypes";
import type { ArchetypeCode, ArchetypeDef } from "@/lib/stargazer/archetypeTypes";
import { useArchetypeTheme } from "../_components/ArchetypeThemeProvider";
import { hexToRgba } from "../_utils/color";
import EmptyState from "../_shared/EmptyState";

// New modules
import { detectParadoxes, type Paradox } from "@/lib/stargazer/paradoxDetector";
import { analyzeContextShifts, type ContextProfile, type ContextShift } from "@/lib/stargazer/contextShiftAnalyzer";
import { generateCareerInsight, generateDecisionPattern, generateStrengthNarrative, generateLifeCompass, type DecisionPattern, type LifeCompass } from "@/lib/stargazer/personalizedProse";
import { generateProtectionInsight, analyzeGap, type ProtectionInsight, type GapAnalysis, type PersonalizedGuardian } from "@/lib/stargazer/traitInsights";

// Deep analysis modules
import { analyzeStressCascade, type StressCascadeResult, type StressCascadeStep } from "@/lib/stargazer/stressResponseCascade";
import { detectUniqueStrengths, type UniqueStrengthResult, type UniqueStrength } from "@/lib/stargazer/uniqueStrengthDetector";
import { analyzeRelationalImpact, type RelationalImpactResult, type RelationalImpact } from "@/lib/stargazer/relationalImpactAnalyzer";
import { extractImplicitValues, type ImplicitValuesResult, type ImplicitValue, type ValueConflict } from "@/lib/stargazer/implicitValuesExtractor";
import { analyzeTraitEvolution, type TraitSnapshot, type TraitEvolutionResult, type AxisEvolution } from "@/lib/stargazer/traitEvolution";
import { analyzeWorkStyle, type WorkStyleResult, type WorkStyleDimension } from "@/lib/stargazer/workStyleFitness";
import { analyzeChronotype, type ChronotypeResult } from "@/lib/stargazer/chronotypeFitness";
import { analyzeTeamCombinations, type TeamCombinationResult } from "@/lib/stargazer/teamCombination";
import { crossReferenceStressAndJobs, type StressJobInsight } from "@/lib/stargazer/stressJobCrossRef";
import { localizeText, localizeCompoundKey } from "@/lib/stargazer/textLocalizer";
import { axisLabel } from "@/lib/stargazer/axisLabels";
import type { CognitiveAxisKey } from "@/lib/stargazer/cognitiveFitQuestions";
import { deriveCognitiveFitDisplay, summarizeCognitiveProfile, describeCfFitForJob, type CognitiveBand } from "@/lib/stargazer/cognitiveFitScoring";

// ── Types ──

interface TraitsTabProps {
  hasData: boolean;
  axisScores: Partial<Record<TraitAxisKey, number>>;
  cognitiveFit?: Partial<Record<CognitiveAxisKey, number>> | null;
  traitCards: DerivedTraitCard[];
  typeDef: TypeDefLike | null;
  contextDiffs: ContextDifference[] | null;
  contextScores: Record<string, Partial<Record<TraitAxisKey, number>>> | null;
  totalObservations: number;
  archetypeResult: ArchetypeResult | null;
  dualArchetypeResult?: DualArchetypeResult | null;
}

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("#")) return hexToRgba(color, alpha);
  return color.replace(/[\d.]+\)$/, `${alpha})`);
}

// ── Section Header ──

function SectionHeader({
  label,
  sublabel,
  color,
  mutedColor,
}: {
  label: string;
  sublabel?: string;
  color: string;
  mutedColor: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div
        className="flex-1 h-px"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${hexToRgba(color, 0.3)} 100%)`,
        }}
      />
      <div className="text-center">
        <span
          className="text-[10px] font-mono-sg tracking-[0.25em] uppercase block"
          style={{ color: mutedColor }}
        >
          {label}
        </span>
        {sublabel && (
          <span
            className="text-[9px] font-mono tracking-[0.2em] block mt-0.5"
            style={{ color: withAlpha(mutedColor, 0.6) }}
          >
            {sublabel}
          </span>
        )}
      </div>
      <div
        className="flex-1 h-px"
        style={{
          background: `linear-gradient(90deg, ${hexToRgba(color, 0.3)} 0%, transparent 100%)`,
        }}
      />
    </div>
  );
}

// ── Shared Card Wrapper ──

function SectionCard({
  children,
  border,
  gradient,
  glassBlur,
  delay = 0,
}: {
  children: React.ReactNode;
  border: string;
  gradient: string;
  glassBlur?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className="rounded-2xl overflow-hidden"
      style={{
        background: gradient,
        border: `1px solid ${border}`,
        ...(glassBlur ? { backdropFilter: `blur(${glassBlur})` } : {}),
      }}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.25, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="p-6 sm:p-8">{children}</div>
    </motion.div>
  );
}

// ── Main Component ──

export default function TraitsTab({
  hasData,
  axisScores,
  cognitiveFit,
  traitCards,
  typeDef,
  contextDiffs,
  contextScores,
  totalObservations,
  archetypeResult,
  dualArchetypeResult,
}: TraitsTabProps) {
  const { theme } = useArchetypeTheme();

  // ── All hooks MUST be called unconditionally (Rules of Hooks) ──

  const paradoxes = useMemo(
    () => detectParadoxes(axisScores),
    [axisScores],
  );

  const contextProfile = useMemo(
    () => contextScores ? analyzeContextShifts(contextScores) : null,
    [contextScores],
  );

  const careerMatches = useMemo(
    () => computeCareerMatches(axisScores, cognitiveFit),
    [axisScores, cognitiveFit],
  );

  const cfDisplay = useMemo(
    () => cognitiveFit && Object.keys(cognitiveFit).length > 0
      ? deriveCognitiveFitDisplay(cognitiveFit as Record<string, number>)
      : null,
    [cognitiveFit],
  );

  const cognitiveProfileSummary = useMemo(
    () => cognitiveFit ? summarizeCognitiveProfile(cognitiveFit as Record<string, number>) : null,
    [cognitiveFit],
  );

  const decisionPattern = useMemo(
    () => generateDecisionPattern(axisScores),
    [axisScores],
  );

  const archetypeDef = archetypeResult
    ? getArchetypeByCode(archetypeResult.code) ?? null
    : null;

  const protectionInsight = useMemo(
    () => (archetypeDef ? generateProtectionInsight(archetypeDef, axisScores) : null),
    [archetypeDef, axisScores],
  );

  const gapAnalysis = useMemo(
    () =>
      dualArchetypeResult && !dualArchetypeResult.isSame
        ? analyzeGap(dualArchetypeResult)
        : null,
    [dualArchetypeResult],
  );

  const strengthNarrative = useMemo(
    () => generateStrengthNarrative(axisScores),
    [axisScores],
  );

  const lifeCompass = useMemo(
    () => generateLifeCompass(axisScores, archetypeResult?.code),
    [axisScores, archetypeResult?.code],
  );

  // Deep analysis modules
  const stressCascade = useMemo(
    () => analyzeStressCascade(axisScores),
    [axisScores],
  );

  const uniqueStrengths = useMemo(
    () => detectUniqueStrengths(axisScores),
    [axisScores],
  );

  const relationalImpact = useMemo(
    () => analyzeRelationalImpact(axisScores),
    [axisScores],
  );

  const implicitValues = useMemo(
    () => extractImplicitValues(axisScores),
    [axisScores],
  );

  // ── TraitEvolution: fetch snapshots from trajectory API ──
  const [traitEvolution, setTraitEvolution] = useState<TraitEvolutionResult | null>(null);

  useEffect(() => {
    if (!hasData) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/stargazer/trajectory?days=90");
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (cancelled || !json.ok) return;

        // trajectory API returns trajectories[] with { axisId, dataPoints: {date, score}[] }
        // Convert to TraitSnapshot[] grouped by date
        const dateMap = new Map<string, { scores: Partial<Record<TraitAxisKey, number>>; count: number }>();
        for (const traj of json.trajectories || []) {
          for (const pt of traj.dataPoints || []) {
            const entry = dateMap.get(pt.date) ?? { scores: {}, count: 0 };
            entry.scores[traj.axisId as TraitAxisKey] = pt.score;
            entry.count++;
            dateMap.set(pt.date, entry);
          }
        }

        const snapshots: TraitSnapshot[] = Array.from(dateMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, { scores, count }]) => ({
            date,
            axisScores: scores,
            totalObservations: count,
          }));

        if (!cancelled && snapshots.length >= 2) {
          setTraitEvolution(analyzeTraitEvolution(snapshots));
        }
      } catch {
        // Silently fail — evolution is optional enrichment
      }
    })();
    return () => { cancelled = true; };
  }, [hasData]);

  // ── New analysis modules ──
  const workStyle = useMemo(() => analyzeWorkStyle(axisScores), [axisScores]);
  const chronotype = useMemo(() => analyzeChronotype(axisScores), [axisScores]);
  const teamCombinations = useMemo(
    () => analyzeTeamCombinations(archetypeResult?.code, axisScores),
    [archetypeResult?.code, axisScores],
  );
  const stressJobInsights = useMemo(
    () => crossReferenceStressAndJobs(careerMatches.slice(0, 5), stressCascade, axisScores),
    [careerMatches, stressCascade, axisScores],
  );
  const inverseMatches = useMemo(
    () => careerMatches.slice(-5).reverse(),
    [careerMatches],
  );

  // ── Early return AFTER all hooks ──
  if (!hasData || !theme) {
    return (
      <EmptyState message="観測を重ねると、あなたの特性がここに表示されます。" />
    );
  }

  const { primary, accent, text, textMuted, border } = theme.palette;

  // Category colors for trait cards
  const CATEGORY_COLORS: Record<string, string> = {
    core: accent,
    relational: "#6366f1",
    emotional: "#ec4899",
    motion: "#f59e0b",
    safety: "#22a060",
  };
  const CATEGORY_NAMES: Record<string, string> = {
    core: "核心",
    relational: "関係性",
    emotional: "感情",
    motion: "行動様式",
    safety: "安全性",
  };
  const DEPTH_LABELS: Record<string, string> = {
    deep: "確信あり",
    medium: "傾向あり",
    shallow: "兆しあり",
    unobserved: "未観測",
  };

  return (
    <div className="space-y-8 pb-8">

      {/* ═══ Growth Milestones（成長マイルストーン）═══ */}
      <motion.div
        className="rounded-2xl p-4"
        style={{
          background: theme.gradient.card,
          border: `1px solid ${border}`,
        }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-mono tracking-wider uppercase" style={{ color: textMuted }}>
            観測の深度
          </span>
          <span className="text-xs font-bold" style={{ color: primary }}>
            {totalObservations} 観測
          </span>
        </div>
        {/* Depth tiers */}
        {(() => {
          const tiers = [
            { min: 0, label: "表層", sublabel: "行動パターンの認識", emoji: "🌊", next: 10 },
            { min: 10, label: "パターン", sublabel: "繰り返しの構造化", emoji: "🔍", next: 30 },
            { min: 30, label: "矛盾統合", sublabel: "対立する自分の受容", emoji: "🌀", next: 60 },
            { min: 60, label: "深層構造", sublabel: "防衛パターンの認識", emoji: "💎", next: 100 },
            { min: 100, label: "意味の発見", sublabel: "なぜこう生きるかの理解", emoji: "✦", next: null },
          ];
          const currentTierIdx = tiers.findLastIndex((t) => totalObservations >= t.min);
          const currentTier = tiers[Math.max(0, currentTierIdx)];
          const nextTier = currentTierIdx < tiers.length - 1 ? tiers[currentTierIdx + 1] : null;
          const progress = currentTier.next
            ? Math.min(1, (totalObservations - currentTier.min) / (currentTier.next - currentTier.min))
            : 1;

          return (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span style={{ fontSize: 18 }}>{currentTier.emoji}</span>
                <div>
                  <span className="text-sm font-bold" style={{ color: text }}>{currentTier.label}</span>
                  <span className="text-[10px] ml-2" style={{ color: textMuted }}>{currentTier.sublabel}</span>
                </div>
              </div>
              {/* Progress bar */}
              <div style={{ height: 4, borderRadius: 2, background: hexToRgba(primary, 0.1), overflow: "hidden" }}>
                <motion.div
                  style={{ height: "100%", borderRadius: 2, background: hexToRgba(primary, 0.5) }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progress * 100}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
              {nextTier && (
                <p className="text-[10px] mt-2" style={{ color: textMuted }}>
                  次の段階「{nextTier.label}」まで: あと{nextTier.min - totalObservations}回の観測
                </p>
              )}
            </div>
          );
        })()}
      </motion.div>

      {/* ═══ L1: あなたの特性 — 行動の気づき ═══ */}
      {traitCards.length > 0 && (
        <SectionCard border={border} gradient={theme.gradient.card} glassBlur={theme.glassEffect.blur}>
          <SectionHeader
            label="あなたの特性"
            sublabel="Level 1 — 行動の気づき"
            color={primary}
            mutedColor={textMuted}
          />

          {/* Motto — archetype one-line essence */}
          {archetypeDef?.motto && (
            <div
              className="rounded-xl p-4 mb-5 text-center"
              style={{
                background: `linear-gradient(135deg, ${hexToRgba(accent, 0.06)} 0%, ${hexToRgba(primary, 0.03)} 100%)`,
                border: `1px solid ${hexToRgba(accent, 0.12)}`,
              }}
            >
              <span className="text-[10px] font-mono block mb-1" style={{ color: withAlpha(textMuted, 0.6) }}>
                あなたの一言
              </span>
              <p className="text-base font-bold tracking-wide" style={{ color: withAlpha(text, 0.95) }}>
                「{archetypeDef.motto}」
              </p>
            </div>
          )}

          <p
            className="text-sm leading-relaxed mb-5"
            style={{ color: withAlpha(text, 0.84) }}
          >
            観測から浮かび上がった、あなたの選択パターン。強度が高いほど、無意識に現れやすい傾向です。
          </p>

          {/* Trait cards grouped by category */}
          {(() => {
            const grouped = traitCards.reduce<Record<string, typeof traitCards>>((acc, card) => {
              const cat = card.category;
              if (!acc[cat]) acc[cat] = [];
              acc[cat].push(card);
              return acc;
            }, {});
            return Object.entries(grouped).map(([category, cards]) => (
              <div key={category} className="mb-4 last:mb-0">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: CATEGORY_COLORS[category] || accent }}
                  />
                  <span
                    className="text-[10px] font-mono tracking-wider"
                    style={{ color: withAlpha(CATEGORY_COLORS[category] || accent, 0.8) }}
                  >
                    {CATEGORY_NAMES[category] || category}
                  </span>
                </div>
                <div className="space-y-2">
                  {cards.map((card) => (
                    <TraitCardItem
                      key={card.id}
                      card={card}
                      catColor={CATEGORY_COLORS[category] || accent}
                      depthLabel={DEPTH_LABELS[card.observationDepth] || ""}
                      text={text}
                      textMuted={textMuted}
                      border={border}
                      accent={accent}
                    />
                  ))}
                </div>
              </div>
            ));
          })()}

          {/* Confidence indicator — what we still don't know */}
          {archetypeResult && archetypeResult.layer1 && archetypeResult.layer2 && archetypeResult.layer3 && archetypeResult.layer4 && (
            <ConfidenceIndicator
              archetypeResult={archetypeResult}
              totalObservations={totalObservations}
              primary={primary}
              accent={accent}
              text={text}
              textMuted={textMuted}
              border={border}
            />
          )}
        </SectionCard>
      )}

      {/* ═══ L1.5: 固有の強み — 軸の交差点に生まれる超能力 ═══ */}
      {uniqueStrengths && uniqueStrengths.strengths.length > 0 && (
        <>
          <div className="sg-divider" />
          <UniqueStrengthSection
            result={uniqueStrengths}
            primary={primary}
            accent={accent}
            text={text}
            textMuted={textMuted}
            border={border}
            gradient={theme.gradient.card}
            glassBlur={theme.glassEffect.blur}
          />
        </>
      )}

      {/* ═══ L2: パターンの命名 — 文脈 + 意思決定 ═══ */}
      {contextProfile && contextProfile.shifts.length > 0 && (
        <>
          <div className="sg-divider" />
          <ContextSection
            profile={contextProfile}
            contextDiffs={contextDiffs}
            primary={primary}
            accent={accent}
            text={text}
            textMuted={textMuted}
            border={border}
            gradient={theme.gradient.card}
            glassBlur={theme.glassEffect.blur}
          />
        </>
      )}

      {/* ═══ L3: 矛盾の統合 ═══ */}
      {paradoxes.length > 0 && (
        <>
          <div className="sg-divider" />
          <ParadoxSection
            paradoxes={paradoxes}
            gapAnalysis={gapAnalysis}
            archetypeDef={archetypeDef}
            primary={primary}
            accent={accent}
            text={text}
            textMuted={textMuted}
            border={border}
            gradient={theme.gradient.card}
            glassBlur={theme.glassEffect.blur}
          />
        </>
      )}

      {/* ═══ L4: 深層パターン — 防御機構 ═══ */}
      {protectionInsight && (
        <>
          <div className="sg-divider" />
          <ProtectionSection
            insight={protectionInsight}
            primary={primary}
            accent={accent}
            text={text}
            textMuted={textMuted}
            border={border}
            gradient={theme.gradient.card}
            glassBlur={theme.glassEffect.blur}
          />
        </>
      )}

      {/* ═══ L4.5: ストレス時の崩れ方パターン ═══ */}
      {stressCascade && stressCascade.cascade.length > 0 && (
        <>
          <div className="sg-divider" />
          <StressCascadeSection
            result={stressCascade}
            primary={primary}
            accent={accent}
            text={text}
            textMuted={textMuted}
            border={border}
            gradient={theme.gradient.card}
            glassBlur={theme.glassEffect.blur}
          />
        </>
      )}

      {/* ═══ L4.7: 関係性インパクト ═══ */}
      {relationalImpact && (
        <>
          <div className="sg-divider" />
          <RelationalImpactSection
            result={relationalImpact}
            primary={primary}
            accent={accent}
            text={text}
            textMuted={textMuted}
            border={border}
            gradient={theme.gradient.card}
            glassBlur={theme.glassEffect.blur}
          />
        </>
      )}

      {/* ═══ L4.8: 深層心理 — Stage3 6軸 + interactionInsights ═══ */}
      <DeepPsychologySection
        axisScores={axisScores}
        archetypeResult={archetypeResult}
        totalObservations={totalObservations}
        primary={primary}
        accent={accent}
        text={text}
        textMuted={textMuted}
        border={border}
        gradient={theme.gradient.card}
        glassBlur={theme.glassEffect.blur}
      />

      {/* ═══ L5: 意味の発見 — 適職 + 人生の羅針盤 ═══ */}
      {(careerMatches.length > 0 || lifeCompass) && (
        <>
          <div className="sg-divider" />
          <MeaningSection
            careerMatches={careerMatches}
            axisScores={axisScores}
            cfDisplay={cfDisplay}
            cognitiveProfileSummary={cognitiveProfileSummary}
            cognitiveFit={cognitiveFit}
            decisionPattern={decisionPattern}
            lifeCompass={lifeCompass}
            strengthNarrative={strengthNarrative ?? ""}
            inverseMatches={inverseMatches}
            stressJobInsights={stressJobInsights}
            workStyle={workStyle}
            chronotype={chronotype}
            teamCombinations={teamCombinations}
            archetypeDef={archetypeDef}
            primary={primary}
            accent={accent}
            text={text}
            textMuted={textMuted}
            border={border}
            gradient={theme.gradient}
            glassBlur={theme.glassEffect.blur}
          />
        </>
      )}

      {/* ═══ L5.5: 暗黙の価値観 ═══ */}
      {implicitValues && implicitValues.values.length > 0 && (
        <>
          <div className="sg-divider" />
          <ImplicitValuesSection
            result={implicitValues}
            primary={primary}
            accent={accent}
            text={text}
            textMuted={textMuted}
            border={border}
            gradient={theme.gradient.card}
            glassBlur={theme.glassEffect.blur}
          />
        </>
      )}

      {/* ═══ L6: 変化の軌跡 — 時系列進化 ═══ */}
      {traitEvolution && (
        <>
          <div className="sg-divider" />
          <TraitEvolutionSection
            result={traitEvolution}
            primary={primary}
            accent={accent}
            text={text}
            textMuted={textMuted}
            border={border}
            gradient={theme.gradient.card}
            glassBlur={theme.glassEffect.blur}
          />
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// L1 Helper: TraitCardItem
// ════════════════════════════════════════════════════════

function TraitCardItem({
  card,
  catColor,
  depthLabel,
  text,
  textMuted,
  border,
  accent,
}: {
  card: DerivedTraitCard;
  catColor: string;
  depthLabel: string;
  text: string;
  textMuted: string;
  border: string;
  accent: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const strengthPct = Math.round(card.strength * 100);
  const isDeep = card.observationDepth === "deep";

  return (
    <motion.div
      className="rounded-xl overflow-hidden cursor-pointer"
      style={{
        background: hexToRgba(catColor, 0.03),
        border: `1px solid ${hexToRgba(catColor, isDeep ? 0.15 : 0.08)}`,
      }}
      initial={{ opacity: 0, x: -6 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="p-3 flex items-center gap-3">
        {/* Strength ring */}
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: hexToRgba(catColor, 0.08) }}
        >
          <span
            className="text-xs font-mono font-bold"
            style={{ color: catColor }}
          >
            {strengthPct}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: text }}>
              {card.label}
            </span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full"
              style={{
                background: hexToRgba(catColor, 0.08),
                color: withAlpha(catColor, 0.75),
              }}
            >
              {depthLabel}
            </span>
          </div>
          {/* Strength bar */}
          <div
            className="h-1 rounded-full mt-1.5 overflow-hidden"
            style={{ background: hexToRgba(catColor, 0.08) }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: hexToRgba(catColor, 0.5) }}
              initial={{ width: 0 }}
              whileInView={{ width: `${strengthPct}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>
        <motion.span
          className="text-xs flex-shrink-0"
          style={{ color: textMuted }}
          animate={{ rotate: isExpanded ? 90 : 0 }}
        >
          ▸
        </motion.span>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="px-3 pb-3 space-y-2"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <p
              className="text-xs leading-[1.8]"
              style={{ color: withAlpha(text, 0.82) }}
            >
              {localizeText(card.description)}
            </p>

            {/* Shadow — overexpression / suppression */}
            {card.shadow && (
              <div className="space-y-1.5 mt-1">
                <div
                  className="rounded-lg p-2.5"
                  style={{
                    background: hexToRgba("rgba(220,80,120,1)", 0.03),
                    border: `1px solid ${hexToRgba("rgba(220,80,120,1)", 0.08)}`,
                  }}
                >
                  <span className="text-[9px] font-mono block mb-0.5" style={{ color: "rgba(220,80,120,0.7)" }}>
                    過剰に働くと
                  </span>
                  <p className="text-[11px] leading-relaxed" style={{ color: withAlpha(text, 0.75) }}>
                    {card.shadow.overexpression}
                  </p>
                </div>
                <div
                  className="rounded-lg p-2.5"
                  style={{
                    background: hexToRgba(accent, 0.03),
                    border: `1px solid ${hexToRgba(accent, 0.08)}`,
                  }}
                >
                  <span className="text-[9px] font-mono block mb-0.5" style={{ color: withAlpha(accent, 0.7) }}>
                    抑圧すると
                  </span>
                  <p className="text-[11px] leading-relaxed" style={{ color: withAlpha(text, 0.75) }}>
                    {card.shadow.suppression}
                  </p>
                </div>
                <p className="text-[10px] leading-relaxed italic" style={{ color: withAlpha(text, 0.55) }}>
                  {card.shadow.balanceHint}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════
// L1 Helper: ConfidenceIndicator
// ════════════════════════════════════════════════════════

function ConfidenceIndicator({
  archetypeResult,
  totalObservations,
  primary,
  accent,
  text,
  textMuted,
  border,
}: {
  archetypeResult: ArchetypeResult;
  totalObservations: number;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
}) {
  const confidencePct = Math.round(archetypeResult.confidence * 100);
  const layers = [
    {
      name: "核（何を守るか）",
      code: archetypeResult.layer1.code,
      label: LAYER1_DEFS[archetypeResult.layer1.code as keyof typeof LAYER1_DEFS]?.label || archetypeResult.layer1.code,
      score: archetypeResult.layer1.score,
      margin: Math.abs(
        archetypeResult.layer1.score -
          Math.max(
            ...Object.values(archetypeResult.layer1.scores).filter(
              (s) => s !== archetypeResult.layer1.score
            )
          )
      ),
    },
    {
      name: "納得の仕方（何をリアルと感じるか）",
      code: archetypeResult.layer2.code,
      label: LAYER2_DEFS[archetypeResult.layer2.code as keyof typeof LAYER2_DEFS]?.label || archetypeResult.layer2.code,
      score: archetypeResult.layer2.score,
      margin: Math.abs(
        archetypeResult.layer2.score -
          Math.max(
            ...Object.values(archetypeResult.layer2.scores).filter(
              (s) => s !== archetypeResult.layer2.score
            )
          )
      ),
    },
    {
      name: "行動スイッチ（ストレス下で）",
      code: archetypeResult.layer3.code,
      label: LAYER3_DEFS[archetypeResult.layer3.code as keyof typeof LAYER3_DEFS]?.label || archetypeResult.layer3.code,
      score: archetypeResult.layer3.score,
      margin: Math.abs(
        archetypeResult.layer3.score -
          Math.max(
            ...Object.values(archetypeResult.layer3.scores).filter(
              (s) => s !== archetypeResult.layer3.score
            )
          )
      ),
    },
    {
      name: "実行スタイル（動き方）",
      code: archetypeResult.layer4.code,
      label: EXECUTION_DEFS[archetypeResult.layer4.code as keyof typeof EXECUTION_DEFS]?.label || archetypeResult.layer4.code,
      score: archetypeResult.layer4.score,
      margin: Math.abs(
        archetypeResult.layer4.score -
          Math.max(
            ...Object.values(archetypeResult.layer4.scores).filter(
              (s) => s !== archetypeResult.layer4.score
            )
          )
      ),
    },
  ];

  return (
    <div
      className="mt-5 rounded-xl p-4"
      style={{
        background: hexToRgba(primary, 0.02),
        border: `1px dashed ${hexToRgba(border, 0.25)}`,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-mono" style={{ color: withAlpha(textMuted, 0.7) }}>
          観測の確信度
        </span>
        <span
          className="text-xs font-mono font-bold"
          style={{ color: confidencePct >= 70 ? "rgba(34,160,88,0.85)" : confidencePct >= 40 ? accent : "rgba(220,80,120,0.8)" }}
        >
          {confidencePct}%
        </span>
      </div>

      {/* Overall confidence bar */}
      <div
        className="h-1.5 rounded-full overflow-hidden mb-3"
        style={{ background: hexToRgba(primary, 0.06) }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${confidencePct}%`,
            background: confidencePct >= 70 ? "rgba(34,160,88,0.5)" : confidencePct >= 40 ? hexToRgba(accent, 0.5) : "rgba(220,80,120,0.5)",
          }}
        />
      </div>

      {/* Per-layer confidence */}
      <div className="space-y-2">
        {layers.map((layer) => {
          const isUncertain = layer.margin < 0.15;
          return (
            <div key={layer.name} className="flex items-center gap-2">
              <span
                className="text-[10px] w-[140px] flex-shrink-0 truncate"
                style={{ color: withAlpha(textMuted, 0.7) }}
              >
                {layer.name}
              </span>
              <span
                className="text-[10px] font-mono font-medium w-16 flex-shrink-0"
                style={{ color: isUncertain ? "rgba(220,80,120,0.7)" : withAlpha(text, 0.7) }}
              >
                {layer.label}
              </span>
              {isUncertain && (
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-full"
                  style={{
                    background: "rgba(220,80,120,0.06)",
                    color: "rgba(220,80,120,0.7)",
                    border: "1px solid rgba(220,80,120,0.1)",
                  }}
                >
                  まだ揺れている
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p
        className="text-[10px] leading-relaxed mt-3"
        style={{ color: withAlpha(text, 0.45) }}
      >
        {totalObservations <= 0
          ? "初期観測に基づく判定です。日々の観測を重ねるほど、感情・行動の深層パターンが反映されます。"
          : "観測を重ねるほど精度が上がります。「まだ揺れている」部分は、次の観測で変わる可能性がある領域です。"}
      </p>

      {/* interactionInsights は L4.8 DeepPsychologySection に移設 */}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// Section: 矛盾の統合 (Level 3) — Paradoxes + GapAnalysis
// ════════════════════════════════════════════════════════

function ParadoxSection({
  paradoxes,
  gapAnalysis,
  archetypeDef,
  primary,
  accent,
  text,
  textMuted,
  border,
  gradient,
  glassBlur,
}: {
  paradoxes: Paradox[];
  gapAnalysis: GapAnalysis | null;
  archetypeDef: ArchetypeDef | null;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
  gradient: string;
  glassBlur: string;
}) {
  return (
    <SectionCard border={border} gradient={gradient} glassBlur={glassBlur}>
      <SectionHeader
        label="矛盾の統合"
        sublabel="Level 3 — 矛盾する自分も、自分だったのか"
        color={primary}
        mutedColor={textMuted}
      />

      <p
        className="text-sm leading-relaxed mb-6"
        style={{ color: withAlpha(text, 0.84) }}
      >
        矛盾は弱さではない。両方を持っているからこそ、あなたにしか見えない景色がある。
      </p>

      {/* Paradox cards */}
      <div className="space-y-4 mb-6">
        {paradoxes.map((paradox, i) => (
          <ParadoxCard
            key={paradox.id}
            paradox={paradox}
            index={i}
            primary={primary}
            accent={accent}
            text={text}
            textMuted={textMuted}
            border={border}
          />
        ))}
      </div>

      {/* selfView vs observedView — Three Mirror */}
      {archetypeDef?.dualView && (
        <div className="mb-5">
          <span className="text-[10px] font-mono block mb-3" style={{ color: withAlpha(accent, 0.8) }}>
            三面鏡 — 自分が見る自分 vs データが示す自分
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              className="rounded-xl p-3"
              style={{
                background: hexToRgba(primary, 0.04),
                border: `1px solid ${hexToRgba(border, 0.25)}`,
              }}
            >
              <span className="text-[10px] font-mono block mb-1.5" style={{ color: withAlpha(textMuted, 0.8) }}>
                自分から見た自分
              </span>
              <p className="text-sm leading-relaxed" style={{ color: text }}>
                {archetypeDef.dualView.selfView}
              </p>
            </div>
            <div
              className="rounded-xl p-3"
              style={{
                background: hexToRgba(accent, 0.04),
                border: `1px solid ${hexToRgba(accent, 0.15)}`,
              }}
            >
              <span className="text-[10px] font-mono block mb-1.5" style={{ color: accent }}>
                他者から見たあなた
              </span>
              <p className="text-sm leading-relaxed" style={{ color: text }}>
                {archetypeDef.dualView.observedView}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Gap Analysis — integrated here as part of L3 contradiction */}
      {gapAnalysis && (
        <div className="mt-5">
          <span className="text-[10px] font-mono block mb-3" style={{ color: withAlpha(accent, 0.8) }}>
            自己認識ギャップ — {gapAnalysis.gapType === "same" ? "一致" : "ズレ検出"}
          </span>
          <p className="text-sm leading-relaxed mb-4" style={{ color: withAlpha(text, 0.84) }}>
            {gapAnalysis.overallInsight}
          </p>
          <div className="space-y-2.5">
            {gapAnalysis.layers.map((layer, i) => (
              <div
                key={layer.layerName}
                className="rounded-lg p-3"
                style={{
                  background: layer.matches ? hexToRgba(primary, 0.03) : hexToRgba(accent, 0.04),
                  border: `1px solid ${layer.matches ? hexToRgba(border, 0.2) : hexToRgba(accent, 0.15)}`,
                }}
              >
                <span className="text-[10px] font-mono block mb-1.5" style={{ color: withAlpha(textMuted, 0.8) }}>
                  {layer.layerName}
                </span>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <span className="text-[10px] block mb-0.5" style={{ color: withAlpha(text, 0.5) }}>自分の認識</span>
                    <span className="text-sm font-medium" style={{ color: text }}>{layer.selfLabel}</span>
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{
                      background: layer.matches ? "rgba(34,160,88,0.1)" : hexToRgba(accent, 0.1),
                      color: layer.matches ? "rgba(34,160,88,0.85)" : accent,
                    }}
                  >
                    {layer.matches ? "一致" : "ズレあり"}
                  </span>
                  <div className="flex-1 text-right">
                    <span className="text-[10px] block mb-0.5" style={{ color: withAlpha(text, 0.5) }}>データの示唆</span>
                    <span className="text-sm font-medium" style={{ color: layer.matches ? text : accent }}>{layer.dataLabel}</span>
                  </div>
                </div>
                {layer.hypothesis && (
                  <div
                    className="rounded-lg p-2.5 mt-2"
                    style={{
                      background: hexToRgba(accent, 0.03),
                      border: `1px dashed ${hexToRgba(accent, 0.1)}`,
                    }}
                  >
                    <span className="text-[10px] font-mono block mb-1" style={{ color: withAlpha(accent, 0.7) }}>
                      なぜズレるのか（仮説）
                    </span>
                    <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.78) }}>
                      {localizeText(layer.hypothesis)}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ════════════════════════════════════════════════════════
// L5: 意味の発見 — Career + Life Compass combined
// ════════════════════════════════════════════════════════

function MeaningSection({
  careerMatches,
  axisScores,
  cfDisplay,
  cognitiveProfileSummary,
  cognitiveFit,
  decisionPattern,
  lifeCompass,
  strengthNarrative,
  inverseMatches,
  stressJobInsights,
  workStyle,
  chronotype,
  teamCombinations,
  archetypeDef,
  primary,
  accent,
  text,
  textMuted,
  border,
  gradient,
  glassBlur,
}: {
  careerMatches: CareerMatch[];
  axisScores: Partial<Record<TraitAxisKey, number>>;
  cfDisplay: {
    bandLabels: Record<string, CognitiveBand>;
    environmentFit: string[];
    contradictionInsight?: string;
  } | null;
  cognitiveProfileSummary: string | null;
  cognitiveFit?: Partial<Record<CognitiveAxisKey, number>> | null;
  decisionPattern: DecisionPattern | null;
  lifeCompass: LifeCompass | null;
  strengthNarrative: string;
  inverseMatches: CareerMatch[];
  stressJobInsights: StressJobInsight[];
  workStyle: WorkStyleResult | null;
  chronotype: ChronotypeResult | null;
  teamCombinations: TeamCombinationResult | null;
  archetypeDef: ArchetypeDef | null;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
  gradient: { card: string; button: string };
  glassBlur: string;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const topMatches = careerMatches.slice(0, 5);
  const restMatches = careerMatches.slice(5);

  return (
    <SectionCard border={border} gradient={gradient.card} glassBlur={glassBlur}>
      <SectionHeader
        label="意味の発見"
        sublabel="Level 5 — だから自分はこう生きているのか"
        color={accent}
        mutedColor={textMuted}
      />

      {/* Life Compass — core statement first */}
      {lifeCompass && (
        <>
          <div
            className="rounded-xl p-5 mb-5 text-center"
            style={{
              background: `linear-gradient(135deg, ${hexToRgba(accent, 0.06)} 0%, ${hexToRgba(primary, 0.04)} 100%)`,
              border: `1px solid ${hexToRgba(accent, 0.15)}`,
            }}
          >
            <p
              className="text-base leading-[1.9] font-medium"
              style={{ color: withAlpha(text, 0.95) }}
            >
              {lifeCompass.coreStatement}
            </p>
          </div>

          {/* Strength Narrative */}
          {strengthNarrative && (
            <div className="mb-5">
              <p
                className="text-sm leading-[1.85]"
                style={{ color: withAlpha(text, 0.84) }}
              >
                {strengthNarrative}
              </p>
            </div>
          )}

          {/* Natural Gifts */}
          {lifeCompass.naturalGifts.length > 0 && (
            <div
              className="rounded-xl p-4 mb-4"
              style={{
                background: hexToRgba("rgba(34,160,88,1)", 0.03),
                border: `1px solid ${hexToRgba("rgba(34,160,88,1)", 0.1)}`,
              }}
            >
              <span className="text-[10px] font-mono block mb-2" style={{ color: "rgba(34,160,88,0.85)" }}>
                あなたが自然に世界に与えているもの
              </span>
              <div className="space-y-1.5">
                {lifeCompass.naturalGifts.map((gift, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span
                      className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0"
                      style={{ background: "rgba(34,160,88,0.5)" }}
                    />
                    <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.82) }}>
                      {gift}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deep Need + Growth Edge + Daily Practice */}
          <div className="grid grid-cols-1 gap-3 mb-5">
            <div
              className="rounded-xl p-4"
              style={{
                background: hexToRgba(primary, 0.03),
                border: `1px solid ${hexToRgba(border, 0.2)}`,
              }}
            >
              <span className="text-[10px] font-mono block mb-1.5" style={{ color: withAlpha(textMuted, 0.8) }}>
                あなたが深く必要としているもの
              </span>
              <p className="text-sm leading-[1.8]" style={{ color: withAlpha(text, 0.85) }}>
                {lifeCompass.deepNeed}
              </p>
            </div>
            <div
              className="rounded-xl p-4"
              style={{
                background: hexToRgba(accent, 0.04),
                border: `1px solid ${hexToRgba(accent, 0.12)}`,
              }}
            >
              <span className="text-[10px] font-mono block mb-1.5" style={{ color: accent }}>
                次の成長が待っている場所
              </span>
              <p className="text-sm leading-[1.8]" style={{ color: withAlpha(text, 0.88) }}>
                {lifeCompass.growthEdge}
              </p>
            </div>
            <div
              className="rounded-xl p-4"
              style={{
                background: `linear-gradient(135deg, ${hexToRgba(accent, 0.05)} 0%, ${hexToRgba(primary, 0.03)} 100%)`,
                border: `1px solid ${hexToRgba(accent, 0.12)}`,
              }}
            >
              <span className="text-[10px] font-mono block mb-1.5" style={{ color: accent }}>
                今日できるひとつのこと
              </span>
              <p className="text-sm leading-[1.8] font-medium" style={{ color: withAlpha(text, 0.9) }}>
                {lifeCompass.dailyPractice}
              </p>
            </div>
          </div>
        </>
      )}

      {/* ── 認知特性 ── */}
      {cfDisplay && Object.keys(cfDisplay.bandLabels).length > 0 && (
        <>
          <SectionHeader
            label="認知特性"
            sublabel="あなたの頭の使い方のクセ"
            color={accent}
            mutedColor={textMuted}
          />

          <div className="space-y-2 mb-4">
            {(
              [
                ["abstract_structuring", "具体 ↔ 抽象", "🧩"],
                ["decomposition", "全体把握 ↔ 分解", "🔬"],
                ["cognitive_updating", "信念保持 ↔ 柔軟更新", "🔄"],
                ["decision_tempo", "即断 ↔ 熟考", "⏱"],
                ["social_modeling", "行動ベース ↔ 意図ベース", "👁"],
                ["exploration_closure", "広く探索 ↔ 素早く絞る", "🎯"],
              ] as const
            ).map(([axis, axisLabel, icon]) => {
              const band = cfDisplay.bandLabels[axis];
              if (!band) return null;
              return (
                <div
                  key={axis}
                  className="rounded-lg p-3"
                  style={{
                    background: hexToRgba(primary, 0.03),
                    border: `1px solid ${hexToRgba(border, 0.2)}`,
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px]" style={{ color: withAlpha(textMuted, 0.7) }}>
                      {icon} {axisLabel}
                    </span>
                    <span
                      className="text-xs font-bold"
                      style={{ color: withAlpha(accent, 0.9) }}
                    >
                      {band.label}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed" style={{ color: withAlpha(text, 0.75) }}>
                    {band.strengthNote}
                  </p>
                </div>
              );
            })}
          </div>

          {/* 環境適性 */}
          {cfDisplay.environmentFit.length > 0 && (
            <div
              className="rounded-xl p-4 mb-4"
              style={{
                background: hexToRgba(accent, 0.04),
                border: `1px solid ${hexToRgba(accent, 0.12)}`,
              }}
            >
              <span className="text-[10px] font-mono block mb-2" style={{ color: accent }}>
                あなたの認知スタイルが活きる環境
              </span>
              <div className="space-y-1.5">
                {cfDisplay.environmentFit.map((fit, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span
                      className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0"
                      style={{ background: hexToRgba(accent, 0.5) }}
                    />
                    <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.82) }}>
                      {fit}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 矛盾 */}
          {cfDisplay.contradictionInsight && (
            <div
              className="rounded-xl p-4 mb-4"
              style={{
                background: "rgba(245,158,11,0.04)",
                border: "1px solid rgba(245,158,11,0.12)",
              }}
            >
              <span className="text-[10px] font-mono block mb-2" style={{ color: "rgba(245,158,11,0.85)" }}>
                認知スタイルの矛盾
              </span>
              <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.82) }}>
                {cfDisplay.contradictionInsight}
              </p>
            </div>
          )}
        </>
      )}

      {/* Career Direction — power flow */}
      {topMatches.length > 0 && (
        <>
          <SectionHeader
            label="力の方向性"
            sublabel="あなたの力の方向"
            color={primary}
            mutedColor={textMuted}
          />

          <p
            className="text-sm leading-relaxed mb-3"
            style={{ color: withAlpha(text, 0.84) }}
          >
            あなたの特性が自然に活きる方向。スコアが高いほど、意識しなくても力が流れやすい仕事です。
          </p>

          {/* 認知特性サマリー */}
          {cognitiveProfileSummary && (
            <div
              className="rounded-lg px-3.5 py-2.5 mb-5 flex items-start gap-2"
              style={{
                background: hexToRgba(accent, 0.05),
                border: `1px solid ${hexToRgba(accent, 0.12)}`,
              }}
            >
              <span className="text-xs mt-0.5 flex-shrink-0">🧠</span>
              <div>
                <span className="text-[10px] font-mono block mb-0.5" style={{ color: accent }}>
                  あなたの認知特性
                </span>
                <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.85) }}>
                  {cognitiveProfileSummary}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {topMatches.map((match, i) => {
              const personalInsight = generateCareerInsight(match, axisScores);
              const catInfo = CATEGORY_LABELS[match.job.category];
              const isTop3 = i < 3;

              return (
                <motion.div
                  key={match.job.id}
                  className="rounded-xl overflow-hidden cursor-pointer"
                  style={{
                    background: isTop3 ? hexToRgba(accent, 0.04) : hexToRgba(primary, 0.03),
                    border: `1px solid ${isTop3 ? hexToRgba(accent, 0.15) : hexToRgba(border, 0.25)}`,
                  }}
                  initial={{ opacity: 0, x: -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.1 + i * 0.06 }}
                  onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                >
                  <div className="p-3.5 flex items-center gap-3">
                    <span
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-mono font-bold flex-shrink-0"
                      style={{
                        background: isTop3 ? hexToRgba(accent, 0.12) : hexToRgba(primary, 0.08),
                        color: isTop3 ? accent : textMuted,
                      }}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs">{catInfo.icon}</span>
                        <span className="text-sm font-medium truncate" style={{ color: text }}>
                          {match.job.name}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className="text-sm font-mono font-semibold"
                        style={{ color: isTop3 ? accent : withAlpha(text, 0.7) }}
                      >
                        {match.score}%
                      </span>
                      <motion.span
                        className="text-xs"
                        style={{ color: textMuted }}
                        animate={{ rotate: expandedIdx === i ? 90 : 0 }}
                      >
                        ▸
                      </motion.span>
                    </div>
                  </div>

                  <div className="px-3.5 pb-2">
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: hexToRgba(primary, 0.08) }}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: isTop3 ? gradient.button : hexToRgba(primary, 0.3) }}
                        initial={{ width: 0 }}
                        whileInView={{ width: `${match.score}%` }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 + i * 0.06, duration: 0.4 }}
                      />
                    </div>
                  </div>

                  <AnimatePresence>
                    {expandedIdx === i && (
                      <motion.div
                        className="px-3.5 pb-4 space-y-2"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="rounded-lg p-3" style={{ background: hexToRgba("rgba(34,160,88,1)", 0.04), border: `1px solid ${hexToRgba("rgba(34,160,88,1)", 0.1)}` }}>
                          <span className="text-[10px] font-mono block mb-1" style={{ color: "rgba(34,160,88,0.85)" }}>あなたが合う理由</span>
                          <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.85) }}>{personalInsight.whyYouFit}</p>
                        </div>
                        <div className="rounded-lg p-3" style={{ background: hexToRgba("rgba(220,80,120,1)", 0.03), border: `1px solid ${hexToRgba("rgba(220,80,120,1)", 0.08)}` }}>
                          <span className="text-[10px] font-mono block mb-1" style={{ color: "rgba(220,80,120,0.8)" }}>あなたの課題</span>
                          <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.8) }}>{personalInsight.yourChallenge}</p>
                        </div>
                        <div className="rounded-lg p-3" style={{ background: hexToRgba(accent, 0.04), border: `1px solid ${hexToRgba(accent, 0.1)}` }}>
                          <span className="text-[10px] font-mono block mb-1" style={{ color: accent }}>力の流れ</span>
                          <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.85) }}>{personalInsight.strengthApplication}</p>
                        </div>
                        {/* 認知適性との合致 */}
                        {cognitiveFit && match.job.cfWeights && (() => {
                          const cfFit = describeCfFitForJob(cognitiveFit as Record<string, number>, match.job.cfWeights!);
                          if (!cfFit) return null;
                          return (
                            <div className="rounded-lg p-3" style={{ background: hexToRgba("rgba(120,80,200,1)", 0.04), border: `1px solid ${hexToRgba("rgba(120,80,200,1)", 0.1)}` }}>
                              <span className="text-[10px] font-mono block mb-1" style={{ color: "rgba(120,80,200,0.85)" }}>🧠 認知特性</span>
                              <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.85) }}>{cfFit}</p>
                            </div>
                          );
                        })()}
                        {/* 成功のための行動 */}
                        {match.job.successActions && match.job.successActions.length > 0 && (
                          <div className="rounded-lg p-3" style={{ background: hexToRgba("rgba(34,130,220,1)", 0.04), border: `1px solid ${hexToRgba("rgba(34,130,220,1)", 0.1)}` }}>
                            <span className="text-[10px] font-mono block mb-2" style={{ color: "rgba(34,130,220,0.85)" }}>成功する行動パターン</span>
                            <div className="space-y-1.5">
                              {match.job.successActions.map((action, ai) => (
                                <div key={ai} className="flex items-start gap-2">
                                  <span className="text-[10px] mt-0.5 flex-shrink-0" style={{ color: "rgba(34,130,220,0.6)" }}>▸</span>
                                  <p className="text-[11px] leading-relaxed" style={{ color: withAlpha(text, 0.8) }}>{action}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* 失敗リスク */}
                        {match.job.failureRisks && match.job.failureRisks.length > 0 && (
                          <div className="rounded-lg p-3" style={{ background: hexToRgba("rgba(200,60,60,1)", 0.03), border: `1px solid ${hexToRgba("rgba(200,60,60,1)", 0.08)}` }}>
                            <span className="text-[10px] font-mono block mb-2" style={{ color: "rgba(200,60,60,0.8)" }}>これをやると失敗する</span>
                            <div className="space-y-1.5">
                              {match.job.failureRisks.map((risk, ri) => (
                                <div key={ri} className="flex items-start gap-2">
                                  <span className="text-[10px] mt-0.5 flex-shrink-0" style={{ color: "rgba(200,60,60,0.5)" }}>✕</span>
                                  <p className="text-[11px] leading-relaxed" style={{ color: withAlpha(text, 0.75) }}>{risk}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>

          {restMatches.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowAll(!showAll)}
                className="w-full text-center py-2 rounded-lg text-xs font-mono"
                style={{ background: hexToRgba(primary, 0.04), color: accent, border: `1px solid ${hexToRgba(accent, 0.15)}` }}
              >
                {showAll ? "閉じる" : `他 ${restMatches.length} 件の職種を見る`}
              </button>
              <AnimatePresence>
                {showAll && (
                  <motion.div
                    className="mt-3 space-y-2"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                  >
                    {restMatches.map((match) => {
                      const catInfo = CATEGORY_LABELS[match.job.category];
                      return (
                        <div key={match.job.id} className="flex items-center gap-3 rounded-lg p-2.5" style={{ background: hexToRgba(primary, 0.03), border: `1px solid ${hexToRgba(border, 0.2)}` }}>
                          <span className="text-xs">{catInfo.icon}</span>
                          <span className="text-xs flex-1 truncate" style={{ color: withAlpha(text, 0.85) }}>{match.job.name}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: hexToRgba(primary, 0.08) }}>
                              <div className="h-full rounded-full" style={{ width: `${match.score}%`, background: hexToRgba(primary, 0.3) }} />
                            </div>
                            <span className="text-[10px] font-mono w-8 text-right" style={{ color: withAlpha(textMuted, 0.7) }}>{match.score}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </>
      )}

      {/* ═══ 向いていない仕事 ═══ */}
      {inverseMatches.length > 0 && (
        <div className="mt-6">
          <SectionHeader label="力が逆方向に流れる仕事" sublabel="逆方向の力" color={"rgba(200,60,60,0.8)"} mutedColor={textMuted} />
          <p className="text-xs leading-relaxed mb-3" style={{ color: withAlpha(text, 0.6) }}>
            スコアが低い＝ダメではない。この方向では「自然体では力が出にくい」という意味。
          </p>
          <div className="space-y-2">
            {inverseMatches.map((match) => {
              const catInfo = CATEGORY_LABELS[match.job.category];
              return (
                <div key={match.job.id} className="flex items-center gap-3 rounded-lg p-2.5" style={{ background: hexToRgba("rgba(200,60,60,1)", 0.03), border: `1px solid ${hexToRgba("rgba(200,60,60,1)", 0.08)}` }}>
                  <span className="text-xs">{catInfo.icon}</span>
                  <span className="text-xs flex-1 truncate" style={{ color: withAlpha(text, 0.7) }}>{match.job.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: hexToRgba("rgba(200,60,60,1)", 0.08) }}>
                      <div className="h-full rounded-full" style={{ width: `${match.score}%`, background: "rgba(200,60,60,0.4)" }} />
                    </div>
                    <span className="text-[10px] font-mono w-8 text-right" style={{ color: "rgba(200,60,60,0.6)" }}>{match.score}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ ストレス×仕事 クロスリファレンス ═══ */}
      {stressJobInsights.length > 0 && (
        <div className="mt-6">
          <SectionHeader label="ストレス適合マップ" sublabel="ストレスと仕事の相関" color={accent} mutedColor={textMuted} />
          <div className="space-y-2">
            {stressJobInsights.filter(s => s.riskLevel > 0.1).slice(0, 3).map((insight) => (
              <div key={insight.jobId} className="rounded-xl p-3" style={{ background: hexToRgba(insight.riskLevel > 0.5 ? "rgba(220,80,60,1)" : accent, 0.04), border: `1px solid ${hexToRgba(insight.riskLevel > 0.5 ? "rgba(220,80,60,1)" : accent, 0.12)}` }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs">{insight.riskLevel > 0.5 ? "⚠️" : "💡"}</span>
                  <span className="text-xs font-medium" style={{ color: text }}>{insight.jobName}</span>
                  <span className="text-[10px] font-mono ml-auto" style={{ color: insight.riskLevel > 0.5 ? "rgba(220,80,60,0.8)" : withAlpha(accent, 0.7) }}>
                    リスク {Math.round(insight.riskLevel * 100)}%
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed mb-1.5" style={{ color: withAlpha(text, 0.75) }}>{localizeText(insight.vulnerablePoint)}</p>
                <p className="text-[10px] leading-relaxed" style={{ color: withAlpha(accent, 0.8) }}>→ {localizeText(insight.copingStrategy)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decision Pattern */}
      {decisionPattern && (
        <div className="mt-6">
          <SectionHeader label="判断の癖" sublabel="意思決定のパターン" color={primary} mutedColor={textMuted} />
          <div className="space-y-3">
            <div className="rounded-lg p-3" style={{ background: hexToRgba(primary, 0.03), border: `1px solid ${hexToRgba(border, 0.2)}` }}>
              <span className="text-[10px] font-mono block mb-1" style={{ color: accent }}>あなたの意思決定パターン</span>
              <p className="text-xs leading-[1.8]" style={{ color: withAlpha(text, 0.85) }}>{decisionPattern.tendency}</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: hexToRgba("rgba(220,80,120,1)", 0.03), border: `1px solid ${hexToRgba("rgba(220,80,120,1)", 0.08)}` }}>
              <span className="text-[10px] font-mono block mb-1" style={{ color: "rgba(220,80,120,0.8)" }}>見落としやすいもの</span>
              <p className="text-xs leading-[1.8]" style={{ color: withAlpha(text, 0.8) }}>{decisionPattern.blindSpot}</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: hexToRgba(primary, 0.03), border: `1px solid ${hexToRgba(border, 0.2)}` }}>
              <span className="text-[10px] font-mono block mb-1" style={{ color: withAlpha(accent, 0.8) }}>ストレス時の変化</span>
              <p className="text-xs leading-[1.8]" style={{ color: withAlpha(text, 0.8) }}>{decisionPattern.stressShift}</p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 環境適合度 ═══ */}
      {workStyle && (
        <div className="mt-6">
          <SectionHeader label="最適な働き方" sublabel="環境適合度" color={primary} mutedColor={textMuted} />
          <p className="text-xs leading-relaxed mb-3" style={{ color: withAlpha(text, 0.7) }}>
            {workStyle.idealEnvironment}
          </p>
          <div className="space-y-3">
            {workStyle.dimensions.map((dim) => (
              <WorkStyleDimensionCard
                key={dim.id}
                dimension={dim}
                primary={primary}
                accent={accent}
                text={text}
                textMuted={textMuted}
                border={border}
              />
            ))}
          </div>
          <div className="mt-3 rounded-lg p-2.5" style={{ background: hexToRgba("rgba(200,60,60,1)", 0.03), border: `1px solid ${hexToRgba("rgba(200,60,60,1)", 0.08)}` }}>
            <p className="text-[10px] leading-relaxed" style={{ color: "rgba(200,60,60,0.7)" }}>
              ⚠ {workStyle.avoidEnvironment}
            </p>
          </div>
        </div>
      )}

      {/* ═══ 時間帯適性 ═══ */}
      {chronotype && (
        <div className="mt-6">
          <SectionHeader label="1日の力の流れ" sublabel="時間帯と集中力" color={accent} mutedColor={textMuted} />
          <div className="rounded-xl p-4 mb-3" style={{ background: hexToRgba(accent, 0.05), border: `1px solid ${hexToRgba(accent, 0.15)}` }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm">{chronotype.type === "morning" ? "🌅" : chronotype.type === "evening" ? "🌙" : "⚖️"}</span>
              <span className="text-sm font-bold" style={{ color: text }}>{chronotype.typeLabel}</span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.8) }}>{chronotype.description}</p>
          </div>
          <div className="space-y-2 mb-3">
            {chronotype.timeBlocks.map((block) => (
              <div key={block.period} className="rounded-lg p-3" style={{ background: hexToRgba(primary, 0.03), border: `1px solid ${hexToRgba(border, 0.15)}` }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium" style={{ color: text }}>{block.period}</span>
                  <span className="text-[10px] font-mono" style={{ color: withAlpha(textMuted, 0.7) }}>{block.timeRange}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: hexToRgba(primary, 0.08) }}>
                  <div className="h-full rounded-full" style={{ width: `${block.energy * 100}%`, background: block.energy > 0.7 ? accent : hexToRgba(primary, 0.3) }} />
                </div>
                <p className="text-[10px] leading-relaxed" style={{ color: withAlpha(accent, 0.8) }}>✓ {block.bestFor}</p>
                <p className="text-[10px] leading-relaxed mt-0.5" style={{ color: "rgba(200,60,60,0.6)" }}>✕ {block.avoidFor}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg p-3" style={{ background: hexToRgba(accent, 0.04), border: `1px solid ${hexToRgba(accent, 0.1)}` }}>
            <span className="text-[10px] font-mono block mb-1.5" style={{ color: accent }}>実践アドバイス</span>
            <div className="space-y-1">
              {chronotype.advice.map((a, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[10px] mt-0.5 flex-shrink-0" style={{ color: withAlpha(accent, 0.6) }}>▸</span>
                  <p className="text-[10px] leading-relaxed" style={{ color: withAlpha(text, 0.75) }}>{a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ コンビネーション提案 ═══ */}
      {teamCombinations && (
        <div className="mt-6">
          <SectionHeader label="最強の相棒" sublabel="チームの相乗効果" color={primary} mutedColor={textMuted} />
          <p className="text-xs leading-relaxed mb-3" style={{ color: withAlpha(text, 0.7) }}>{teamCombinations.summary}</p>
          <div className="space-y-2">
            {teamCombinations.bestPartners.map((partner, i) => (
              <TeamPartnerCard
                key={partner.archetypeCode}
                partner={partner}
                rank={i + 1}
                primary={primary}
                accent={accent}
                text={text}
                textMuted={textMuted}
                border={border}
              />
            ))}
          </div>
          {teamCombinations.growthPartners.length > 0 && (
            <div className="mt-3">
              <span className="text-[10px] font-mono block mb-2" style={{ color: withAlpha(accent, 0.8) }}>
                成長を加速させるパートナー
              </span>
              {teamCombinations.growthPartners.map((partner) => (
                <div key={partner.archetypeCode} className="rounded-lg p-2.5 mb-1.5" style={{ background: hexToRgba(accent, 0.04), border: `1px solid ${hexToRgba(accent, 0.1)}` }}>
                  <span className="text-xs font-medium" style={{ color: text }}>{partner.archetypeName}</span>
                  <p className="text-[10px] mt-1 leading-relaxed" style={{ color: withAlpha(text, 0.7) }}>{partner.whySynergy}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ 最強の恋人 ═══ */}
      {teamCombinations && teamCombinations.romanticPartners && (
        <div className="mt-6">
          <SectionHeader label="最強の恋人" sublabel="恋愛の相性" color={primary} mutedColor={textMuted} />
          <p className="text-xs leading-relaxed mb-3" style={{ color: withAlpha(text, 0.7) }}>{teamCombinations.romanticSummary}</p>
          <div className="space-y-2">
            {teamCombinations.romanticPartners.map((partner, i) => (
              <TeamPartnerCard
                key={partner.archetypeCode}
                partner={partner}
                rank={i + 1}
                primary={primary}
                accent={accent}
                text={text}
                textMuted={textMuted}
                border={border}
              />
            ))}
          </div>
        </div>
      )}

      {/* ═══ 運命の相手 — archetypeDef.romanticMatch ═══ */}
      {archetypeDef?.romanticMatch && (() => {
        const matchDef = getArchetypeByCode(archetypeDef.romanticMatch!.code);
        if (!matchDef) return null;
        const rm = archetypeDef.romanticMatch!;
        return (
          <div className="mt-6">
            <SectionHeader label="運命の相手" sublabel="タイプが導く最深の相性" color={accent} mutedColor={textMuted} />
            <div
              className="rounded-xl p-4 space-y-3"
              style={{
                background: `linear-gradient(135deg, ${hexToRgba(accent, 0.06)}, ${hexToRgba(primary, 0.03)})`,
                border: `1px solid ${hexToRgba(accent, 0.15)}`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{matchDef.emoji}</span>
                <span className="text-sm font-bold" style={{ color: text }}>{matchDef.name}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: hexToRgba(accent, 0.1), color: accent }}>{matchDef.code}</span>
              </div>
              <div className="rounded-lg p-2.5" style={{ background: hexToRgba("rgba(220,80,120,1)", 0.04) }}>
                <span className="text-[10px] font-mono block mb-1" style={{ color: "rgba(220,80,120,0.8)" }}>惹かれる理由</span>
                <p className="text-[11px] leading-relaxed" style={{ color: withAlpha(text, 0.85) }}>{rm.attraction}</p>
              </div>
              <div className="rounded-lg p-2.5" style={{ background: hexToRgba("rgba(34,160,88,1)", 0.04) }}>
                <span className="text-[10px] font-mono block mb-1" style={{ color: "rgba(34,160,88,0.8)" }}>二人の関係性</span>
                <p className="text-[11px] leading-relaxed" style={{ color: withAlpha(text, 0.85) }}>{rm.dynamic}</p>
              </div>
              <div className="rounded-lg p-2.5" style={{ background: hexToRgba("rgba(220,180,60,1)", 0.04) }}>
                <span className="text-[10px] font-mono block mb-1" style={{ color: "rgba(220,180,60,0.8)" }}>落とし穴</span>
                <p className="text-[11px] leading-relaxed" style={{ color: withAlpha(text, 0.8) }}>{rm.warning}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ 根源 — coreFear / coreDesire ═══ */}
      {archetypeDef && (archetypeDef.coreFear || archetypeDef.coreDesire) && (
        <div className="mt-6">
          <SectionHeader label="根源" sublabel="最も深い恐怖と欲求" color={primary} mutedColor={textMuted} />
          <div className="space-y-2">
            {archetypeDef.coreFear && (
              <div
                className="rounded-xl p-3"
                style={{
                  background: hexToRgba("rgba(220,38,38,1)", 0.04),
                  border: `1px solid ${hexToRgba("rgba(220,38,38,1)", 0.12)}`,
                }}
              >
                <span className="text-[10px] font-mono block mb-1" style={{ color: "rgba(220,38,38,0.6)" }}>最も恐れること</span>
                <p className="text-[11px] leading-relaxed" style={{ color: withAlpha(text, 0.85) }}>{archetypeDef.coreFear}</p>
              </div>
            )}
            {archetypeDef.coreDesire && (
              <div
                className="rounded-xl p-3"
                style={{
                  background: hexToRgba("rgba(245,158,11,1)", 0.04),
                  border: `1px solid ${hexToRgba("rgba(245,158,11,1)", 0.12)}`,
                }}
              >
                <span className="text-[10px] font-mono block mb-1" style={{ color: "rgba(245,158,11,0.6)" }}>最も求めること</span>
                <p className="text-[11px] leading-relaxed" style={{ color: withAlpha(text, 0.85) }}>{archetypeDef.coreDesire}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Note */}
      <div
        className="mt-5 p-3 rounded-lg text-center"
        style={{ background: hexToRgba(primary, 0.03), border: `1px dashed ${hexToRgba(border, 0.3)}` }}
      >
        <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.6) }}>
          これは性格特性からの予測です。「向いていない」のではなく「意識してエネルギーを使う必要がある」と読んでください。
        </p>
      </div>
    </SectionCard>
  );
}

// ════════════════════════════════════════════════════════
// OLD Sections removed: ParadoxSection → integrated above
// OLD CareerSection → integrated into MeaningSection
// OLD GapSection → integrated into ParadoxSection
// OLD CompassSection → integrated into MeaningSection
// ════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════
// Remaining: ParadoxCard, ContextSection, ProtectionSection
// (kept mostly as-is below)
// ════════════════════════════════════════════════════════

// (Old ParadoxSection removed — integrated into main ParadoxSection above)

function ParadoxCard({
  paradox,
  index,
  primary,
  accent,
  text,
  textMuted,
  border,
}: {
  paradox: Paradox;
  index: number;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
}) {
  const [isExpanded, setIsExpanded] = useState(index === 0);

  return (
    <motion.div
      className="rounded-xl overflow-hidden cursor-pointer"
      style={{
        background: hexToRgba(accent, 0.03),
        border: `1px solid ${hexToRgba(accent, 0.12)}`,
      }}
      initial={{ opacity: 0, x: -8 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ delay: 0.1 + index * 0.08 }}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      {/* Header */}
      <div className="p-4 flex items-center gap-3">
        {/* Intensity indicator */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: hexToRgba(accent, 0.08 + paradox.intensity * 0.12),
          }}
        >
          <div
            className="w-2 h-2 rounded-full"
            style={{
              background: accent,
              opacity: 0.5 + paradox.intensity * 0.5,
            }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <h4
            className="text-sm font-medium"
            style={{ color: text }}
          >
            {paradox.name}
          </h4>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px]" style={{ color: textMuted }}>
              {getAxisDisplayLabel(paradox.axes[0])}
            </span>
            <span className="text-[10px]" style={{ color: withAlpha(accent, 0.5) }}>×</span>
            <span className="text-[10px]" style={{ color: textMuted }}>
              {getAxisDisplayLabel(paradox.axes[1])}
            </span>
          </div>
        </div>

        <motion.span
          className="text-xs flex-shrink-0"
          style={{ color: textMuted }}
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.2 }}
        >
          ▸
        </motion.span>
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="px-4 pb-4"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Insight */}
            <p
              className="text-sm leading-[1.85] mb-4"
              style={{ color: withAlpha(text, 0.88) }}
            >
              {localizeText(paradox.insight)}
            </p>

            {/* Scenario — when this paradox shows up */}
            {paradox.scenario && (
              <div
                className="rounded-lg p-3 mb-3"
                style={{
                  background: hexToRgba(primary, 0.03),
                  border: `1px dashed ${hexToRgba(border, 0.2)}`,
                }}
              >
                <span
                  className="text-[10px] font-mono block mb-1"
                  style={{ color: withAlpha(textMuted, 0.7) }}
                >
                  この矛盾が現れる場面
                </span>
                <p
                  className="text-xs leading-[1.8] italic"
                  style={{ color: withAlpha(text, 0.75) }}
                >
                  {paradox.scenario}
                </p>
              </div>
            )}

            {/* Gift — IFS: "No bad parts" */}
            <div
              className="rounded-lg p-3"
              style={{
                background: hexToRgba("rgba(34,160,88,1)", 0.04),
                border: `1px solid ${hexToRgba("rgba(34,160,88,1)", 0.1)}`,
              }}
            >
              <span
                className="text-[10px] font-mono block mb-1"
                style={{ color: "rgba(34,160,88,0.85)" }}
              >
                この矛盾の贈り物
              </span>
              <p
                className="text-xs leading-relaxed"
                style={{ color: withAlpha(text, 0.85) }}
              >
                {paradox.gift}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════
// Section 2: 状況で変わるあなた
// ════════════════════════════════════════════════════════

function ContextSection({
  profile,
  contextDiffs,
  primary,
  accent,
  text,
  textMuted,
  border,
  gradient,
  glassBlur,
}: {
  profile: ContextProfile;
  contextDiffs: ContextDifference[] | null;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
  gradient: string;
  glassBlur: string;
}) {
  return (
    <SectionCard border={border} gradient={gradient} glassBlur={glassBlur}>
      <SectionHeader
        label="パターンの命名"
        sublabel="Level 2 — この繰り返しに名前がつくのか"
        color={primary}
        mutedColor={textMuted}
      />

      <p
        className="text-sm leading-relaxed mb-4"
        style={{ color: withAlpha(text, 0.84) }}
      >
        {profile.summary}
      </p>

      {/* Authenticity/Performance badges */}
      {(profile.mostPerformativeContext || profile.mostAuthenticContext) && (
        <div className="flex gap-3 mb-5 flex-wrap">
          {profile.mostAuthenticContext && (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
              style={{
                background: hexToRgba("rgba(34,160,88,1)", 0.06),
                border: `1px solid ${hexToRgba("rgba(34,160,88,1)", 0.15)}`,
                color: "rgba(34,160,88,0.85)",
              }}
            >
              <span>🪞</span>
              素に近い: {profile.mostAuthenticContext === "general" ? "ふだん" : profile.mostAuthenticContext === "friends" ? "友人" : profile.mostAuthenticContext === "romance" ? "恋愛" : profile.mostAuthenticContext === "work" ? "仕事" : profile.mostAuthenticContext === "family" ? "家族" : profile.mostAuthenticContext}
            </div>
          )}
          {profile.mostPerformativeContext && (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
              style={{
                background: hexToRgba(accent, 0.06),
                border: `1px solid ${hexToRgba(accent, 0.15)}`,
                color: accent,
              }}
            >
              <span>🎭</span>
              演じている: {profile.mostPerformativeContext === "work" ? "仕事" : profile.mostPerformativeContext === "romance" ? "恋愛" : profile.mostPerformativeContext === "friends" ? "友人" : profile.mostPerformativeContext === "family" ? "家族" : profile.mostPerformativeContext}
            </div>
          )}
        </div>
      )}

      {/* 本音/建前 insight */}
      {profile.honneInsight && (
        <div
          className="rounded-xl p-4 mb-5"
          style={{
            background: hexToRgba(primary, 0.03),
            border: `1px solid ${hexToRgba(border, 0.2)}`,
          }}
        >
          <span className="text-[10px] font-mono block mb-2" style={{ color: withAlpha(accent, 0.8) }}>
            本音と建前
          </span>
          <p className="text-sm leading-[1.85]" style={{ color: withAlpha(text, 0.85) }}>
            {profile.honneInsight}
          </p>
        </div>
      )}

      {/* Context shifts */}
      <div className="space-y-3">
        {profile.shifts.map((shift, i) => (
          <ContextShiftCard
            key={shift.axis}
            shift={shift}
            index={i}
            primary={primary}
            accent={accent}
            text={text}
            textMuted={textMuted}
            border={border}
          />
        ))}
      </div>

      {/* contextDiffs — axis-level context variation detail */}
      {contextDiffs && contextDiffs.length > 0 && (
        <div className="mt-5">
          <span className="text-[10px] font-mono block mb-3" style={{ color: withAlpha(textMuted, 0.7) }}>
            文脈間の差が大きい軸
          </span>
          <div className="space-y-2">
            {contextDiffs.slice(0, 5).map((diff) => (
              <div
                key={diff.axis}
                className="rounded-lg p-3"
                style={{
                  background: hexToRgba(primary, 0.03),
                  border: `1px solid ${hexToRgba(border, 0.2)}`,
                }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium" style={{ color: text }}>
                    {localizeText(diff.axisLabel)}
                  </span>
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                    style={{
                      background: hexToRgba(accent, 0.08),
                      color: accent,
                    }}
                  >
                    差 {(diff.gap * 100).toFixed(0)}%
                  </span>
                </div>
                {/* Context score bars */}
                <div className="space-y-0.5 mb-2">
                  {diff.contexts.map((ctx) => (
                    <div key={ctx.context} className="flex items-center gap-2">
                      <span
                        className="text-[10px] w-10 text-right flex-shrink-0"
                        style={{ color: withAlpha(textMuted, 0.6) }}
                      >
                        {localizeText(ctx.contextLabel)}
                      </span>
                      <div
                        className="flex-1 h-1 rounded-full overflow-hidden"
                        style={{ background: hexToRgba(primary, 0.06) }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${((ctx.score + 1) / 2) * 100}%`,
                            background: hexToRgba(accent, 0.35),
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] leading-relaxed" style={{ color: withAlpha(text, 0.6) }}>
                  {localizeText(diff.insight)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function ContextShiftCard({
  shift,
  index,
  primary,
  accent,
  text,
  textMuted,
  border,
}: {
  shift: ContextShift;
  index: number;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
}) {
  const [isExpanded, setIsExpanded] = useState(index === 0);
  const sorted = [...shift.contexts].sort((a, b) => b.score - a.score);

  return (
    <motion.div
      className="rounded-xl overflow-hidden cursor-pointer"
      style={{
        background: hexToRgba(primary, 0.03),
        border: `1px solid ${hexToRgba(border, 0.25)}`,
      }}
      initial={{ opacity: 0, x: -8 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ delay: 0.1 + index * 0.08 }}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="p-3.5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium" style={{ color: text }}>
            {getAxisDisplayLabel(shift.axis)}
          </span>
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded"
              style={{
                background: hexToRgba(accent, 0.08),
                color: accent,
              }}
            >
              差 {(shift.gap * 100).toFixed(0)}%
            </span>
            <motion.span
              className="text-xs"
              style={{ color: textMuted }}
              animate={{ rotate: isExpanded ? 90 : 0 }}
            >
              ▸
            </motion.span>
          </div>
        </div>

        {/* Mini bar chart showing context scores */}
        <div className="space-y-1">
          {sorted.map((ctx) => (
            <div key={ctx.context} className="flex items-center gap-2">
              <span
                className="text-[10px] w-14 text-right flex-shrink-0"
                style={{ color: withAlpha(textMuted, 0.7) }}
              >
                {localizeText(ctx.contextLabel)}
              </span>
              <div
                className="flex-1 h-1.5 rounded-full overflow-hidden"
                style={{ background: hexToRgba(primary, 0.06) }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${((ctx.score + 1) / 2) * 100}%`,
                    background:
                      ctx === sorted[0]
                        ? hexToRgba(accent, 0.5)
                        : hexToRgba(primary, 0.25),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="px-3.5 pb-4"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <p
              className="text-xs leading-[1.8] mb-3"
              style={{ color: withAlpha(text, 0.85) }}
            >
              {localizeText(shift.insight)}
            </p>

            {/* Deep psychological hypothesis */}
            {shift.deepWhyHypothesis && (
              <div
                className="rounded-lg p-3 mb-2"
                style={{
                  background: hexToRgba(accent, 0.03),
                  border: `1px dashed ${hexToRgba(accent, 0.1)}`,
                }}
              >
                <span className="text-[10px] font-mono block mb-1" style={{ color: withAlpha(accent, 0.7) }}>
                  なぜ変わるのか（仮説）
                </span>
                <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.78) }}>
                  {shift.deepWhyHypothesis}
                </p>
              </div>
            )}

            <div
              className="rounded-lg p-3 mb-2"
              style={{
                background: hexToRgba(primary, 0.03),
                border: `1px dashed ${hexToRgba(border, 0.25)}`,
              }}
            >
              <p
                className="text-xs leading-relaxed"
                style={{ color: withAlpha(text, 0.75) }}
              >
                {shift.implication}
              </p>
            </div>

            {/* Eurich-style self-awareness question */}
            {shift.selfAwarenessQuestion && (
              <div
                className="rounded-lg p-3"
                style={{
                  background: hexToRgba("rgba(34,160,88,1)", 0.03),
                  border: `1px solid ${hexToRgba("rgba(34,160,88,1)", 0.08)}`,
                }}
              >
                <span className="text-[10px] font-mono block mb-1" style={{ color: "rgba(34,160,88,0.85)" }}>
                  自分を観る問い
                </span>
                <p className="text-xs leading-relaxed italic" style={{ color: withAlpha(text, 0.82) }}>
                  {shift.selfAwarenessQuestion}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}


// ════════════════════════════════════════════════════════
// Section: 固有の強み (UniqueStrength)
// ════════════════════════════════════════════════════════

function UniqueStrengthSection({
  result,
  primary,
  accent,
  text,
  textMuted,
  border,
  gradient,
  glassBlur,
}: {
  result: UniqueStrengthResult;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
  gradient: string;
  glassBlur: string;
}) {
  return (
    <SectionCard border={border} gradient={gradient} glassBlur={glassBlur}>
      <SectionHeader
        label="固有の強み"
        sublabel="軸の交差点に生まれる超能力"
        color={accent}
        mutedColor={textMuted}
      />

      <p className="text-sm leading-relaxed mb-2" style={{ color: withAlpha(text, 0.84) }}>
        {result.summary}
      </p>

      <div className="flex items-center gap-2 mb-5">
        <span
          className="text-[10px] font-mono px-2 py-0.5 rounded-full"
          style={{
            background: hexToRgba(accent, 0.08),
            color: accent,
            border: `1px solid ${hexToRgba(accent, 0.15)}`,
          }}
        >
          レアリティ: {result.overallRarityLabel}
        </span>
      </div>

      <div className="space-y-3">
        {result.strengths.map((strength, i) => (
          <UniqueStrengthCard
            key={strength.name}
            strength={strength}
            index={i}
            primary={primary}
            accent={accent}
            text={text}
            textMuted={textMuted}
            border={border}
          />
        ))}
      </div>
    </SectionCard>
  );
}

function UniqueStrengthCard({
  strength,
  index,
  primary,
  accent,
  text,
  textMuted,
  border,
}: {
  strength: UniqueStrength;
  index: number;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
}) {
  const [isExpanded, setIsExpanded] = useState(index === 0);
  const rarityPct = Math.round(strength.rarity * 100);

  return (
    <motion.div
      className="rounded-xl overflow-hidden cursor-pointer"
      style={{
        background: hexToRgba(accent, 0.04),
        border: `1px solid ${hexToRgba(accent, 0.12)}`,
      }}
      initial={{ opacity: 0, x: -8 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ delay: 0.1 + index * 0.08 }}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="p-3.5 flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: hexToRgba(accent, 0.1) }}
        >
          <span className="text-sm">⚡</span>
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium" style={{ color: text }}>
            {strength.name}
          </span>
          <span
            className="text-[10px] font-mono ml-2 px-1.5 py-0.5 rounded"
            style={{ background: hexToRgba(accent, 0.08), color: accent }}
          >
            {rarityPct}% レア
          </span>
        </div>
        <motion.span
          className="text-xs flex-shrink-0"
          style={{ color: textMuted }}
          animate={{ rotate: isExpanded ? 90 : 0 }}
        >
          ▸
        </motion.span>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="px-3.5 pb-4 space-y-2.5"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs leading-[1.8]" style={{ color: withAlpha(text, 0.88) }}>
              {strength.superpower}
            </p>

            <div className="rounded-lg p-2.5" style={{ background: hexToRgba("rgba(34,160,88,1)", 0.04), border: `1px solid ${hexToRgba("rgba(34,160,88,1)", 0.1)}` }}>
              <span className="text-[9px] font-mono block mb-1" style={{ color: "rgba(34,160,88,0.85)" }}>フローが生まれる場面</span>
              <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.82) }}>{strength.flowScenario}</p>
            </div>

            <div className="rounded-lg p-2.5" style={{ background: hexToRgba(accent, 0.03), border: `1px solid ${hexToRgba(accent, 0.08)}` }}>
              <span className="text-[9px] font-mono block mb-1" style={{ color: accent }}>日常で活かすヒント</span>
              <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.82) }}>{strength.dailyApplication}</p>
            </div>

            <div className="rounded-lg p-2.5" style={{ background: hexToRgba("rgba(220,80,120,1)", 0.03), border: `1px solid ${hexToRgba("rgba(220,80,120,1)", 0.08)}` }}>
              <span className="text-[9px] font-mono block mb-1" style={{ color: "rgba(220,80,120,0.75)" }}>盲点</span>
              <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.75) }}>{strength.blindSpot}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════
// Section: ストレス時の崩れ方パターン (StressCascade)
// ════════════════════════════════════════════════════════

function StressCascadeSection({
  result,
  primary,
  accent,
  text,
  textMuted,
  border,
  gradient,
  glassBlur,
}: {
  result: StressCascadeResult;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
  gradient: string;
  glassBlur: string;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const stageColors = ["rgba(220,80,120,0.8)", "rgba(245,158,11,0.8)", "rgba(100,116,139,0.7)"];

  return (
    <SectionCard border={border} gradient={gradient} glassBlur={glassBlur}>
      <SectionHeader
        label="ストレス時の崩れ方パターン"
        sublabel="ストレス時にどの順序で崩れるか"
        color={"rgba(220,80,120,0.8)"}
        mutedColor={textMuted}
      />

      <p className="text-sm leading-relaxed mb-5" style={{ color: withAlpha(text, 0.84) }}>
        {result.summary}
      </p>

      {/* Cascade stages */}
      <div className="space-y-3 mb-5">
        {result.cascade.map((step, i) => (
          <motion.div
            key={step.axis}
            className="rounded-xl p-3.5"
            style={{
              background: hexToRgba(stageColors[i] || primary, 0.04),
              border: `1px solid ${hexToRgba(stageColors[i] || border, 0.15)}`,
            }}
            initial={{ opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 * i }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-bold flex-shrink-0"
                style={{ background: hexToRgba(stageColors[i] || primary, 0.12), color: stageColors[i] || textMuted }}
              >
                {step.stage}
              </span>
              <span className="text-xs font-medium" style={{ color: text }}>{step.axisLabel}</span>
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full ml-auto"
                style={{
                  background: hexToRgba(stageColors[i] || primary, 0.08),
                  color: stageColors[i] || textMuted,
                }}
              >
                {step.stressDirection === "amplify" ? "増幅" : step.stressDirection === "freeze" ? "凍結" : "反転"}
              </span>
            </div>
            <p className="text-xs leading-[1.8] mb-2" style={{ color: withAlpha(text, 0.82) }}>
              {localizeText(step.description)}
            </p>
            <div
              className="rounded-lg p-2 text-[10px] leading-relaxed"
              style={{ background: hexToRgba("rgba(34,160,88,1)", 0.04), color: withAlpha(text, 0.7) }}
            >
              💡 {step.recoveryHint}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Last standing */}
      {result.lastStanding && (
        <div
          className="rounded-xl p-4 mb-4"
          style={{
            background: hexToRgba("rgba(34,160,88,1)", 0.04),
            border: `1px solid ${hexToRgba("rgba(34,160,88,1)", 0.12)}`,
          }}
        >
          <span className="text-[10px] font-mono block mb-1.5" style={{ color: "rgba(34,160,88,0.85)" }}>
            最後の砦 — {result.lastStanding.axisLabel}
          </span>
          <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.85) }}>
            {result.lastStanding.description}
          </p>
        </div>
      )}

      {/* Early warnings + resilience */}
      <motion.button
        className="w-full rounded-xl p-3 text-left"
        style={{
          background: showDetails ? hexToRgba(primary, 0.05) : hexToRgba(primary, 0.02),
          border: `1px solid ${hexToRgba(border, 0.2)}`,
        }}
        onClick={() => setShowDetails(!showDetails)}
        whileTap={{ scale: 0.99 }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono" style={{ color: withAlpha(textMuted, 0.8) }}>
            早期警告サイン + レジリエンス評価
          </span>
          <motion.span className="text-xs" style={{ color: textMuted }} animate={{ rotate: showDetails ? 90 : 0 }}>▸</motion.span>
        </div>
      </motion.button>

      <AnimatePresence>
        {showDetails && (
          <motion.div
            className="mt-3 space-y-3"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            {result.earlyWarnings.length > 0 && (
              <div className="rounded-lg p-3" style={{ background: hexToRgba("rgba(245,158,11,1)", 0.04), border: `1px solid ${hexToRgba("rgba(245,158,11,1)", 0.1)}` }}>
                <span className="text-[10px] font-mono block mb-2" style={{ color: "rgba(245,158,11,0.85)" }}>早期警告サイン</span>
                <div className="space-y-1.5">
                  {result.earlyWarnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ background: "rgba(245,158,11,0.5)" }} />
                      <p className="text-[11px] leading-relaxed" style={{ color: withAlpha(text, 0.78) }}>{w}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="rounded-lg p-3" style={{ background: hexToRgba(primary, 0.03), border: `1px solid ${hexToRgba(border, 0.2)}` }}>
              <span className="text-[10px] font-mono block mb-1.5" style={{ color: accent }}>レジリエンス評価</span>
              <p className="text-xs leading-[1.8]" style={{ color: withAlpha(text, 0.82) }}>{result.resilienceProfile}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </SectionCard>
  );
}

// ════════════════════════════════════════════════════════
// Section: 関係性インパクト (RelationalImpact)
// ════════════════════════════════════════════════════════

function RelationalImpactSection({
  result,
  primary,
  accent,
  text,
  textMuted,
  border,
  gradient,
  glassBlur,
}: {
  result: RelationalImpactResult;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
  gradient: string;
  glassBlur: string;
}) {
  const [expandedCtx, setExpandedCtx] = useState<string | null>(null);

  return (
    <SectionCard border={border} gradient={gradient} glassBlur={glassBlur}>
      <SectionHeader
        label="関係性インパクト"
        sublabel="あなたが他者に与える影響"
        color={"#6366f1"}
        mutedColor={textMuted}
      />

      <p className="text-sm leading-relaxed mb-5" style={{ color: withAlpha(text, 0.84) }}>
        {result.summary}
      </p>

      {/* First impression vs deep impression */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <div className="rounded-xl p-3" style={{ background: hexToRgba(primary, 0.03), border: `1px solid ${hexToRgba(border, 0.2)}` }}>
          <span className="text-[10px] font-mono block mb-1.5" style={{ color: withAlpha(textMuted, 0.8) }}>最初の印象</span>
          <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.85) }}>{result.firstImpression}</p>
        </div>
        <div className="rounded-xl p-3" style={{ background: hexToRgba("#6366f1", 0.04), border: `1px solid ${hexToRgba("#6366f1", 0.12)}` }}>
          <span className="text-[10px] font-mono block mb-1.5" style={{ color: "#6366f1" }}>深く知った後</span>
          <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.85) }}>{result.deepImpression}</p>
        </div>
      </div>

      {/* Communication pattern — Satir */}
      <div
        className="rounded-xl p-4 mb-5"
        style={{ background: hexToRgba("#6366f1", 0.03), border: `1px solid ${hexToRgba("#6366f1", 0.1)}` }}
      >
        <span className="text-[10px] font-mono block mb-1" style={{ color: "#6366f1" }}>
          コミュニケーションスタンス: {result.communication.stanceLabel}
        </span>
        <p className="text-xs leading-[1.8] mb-2" style={{ color: withAlpha(text, 0.85) }}>
          {result.communication.stanceDescription}
        </p>
        <p className="text-[10px] leading-relaxed italic" style={{ color: withAlpha(text, 0.6) }}>
          {result.communication.stressShift}
        </p>
      </div>

      {/* Impact by context */}
      <div className="space-y-2.5">
        {result.impacts.map((impact) => (
          <motion.div
            key={impact.context}
            className="rounded-xl overflow-hidden cursor-pointer"
            style={{
              background: hexToRgba(primary, 0.03),
              border: `1px solid ${hexToRgba(border, 0.2)}`,
            }}
            onClick={() => setExpandedCtx(expandedCtx === impact.context ? null : impact.context)}
          >
            <div className="p-3 flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: text }}>{impact.contextLabel}での影響</span>
              <motion.span className="text-xs" style={{ color: textMuted }} animate={{ rotate: expandedCtx === impact.context ? 90 : 0 }}>▸</motion.span>
            </div>
            <AnimatePresence>
              {expandedCtx === impact.context && (
                <motion.div
                  className="px-3 pb-3 space-y-2"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="rounded-lg p-2.5" style={{ background: hexToRgba("rgba(34,160,88,1)", 0.04), border: `1px solid ${hexToRgba("rgba(34,160,88,1)", 0.08)}` }}>
                    <span className="text-[9px] font-mono block mb-1" style={{ color: "rgba(34,160,88,0.85)" }}>ポジティブな影響</span>
                    <p className="text-[11px] leading-relaxed" style={{ color: withAlpha(text, 0.82) }}>{impact.positiveImpact}</p>
                  </div>
                  <div className="rounded-lg p-2.5" style={{ background: hexToRgba("rgba(220,80,120,1)", 0.03), border: `1px solid ${hexToRgba("rgba(220,80,120,1)", 0.08)}` }}>
                    <span className="text-[9px] font-mono block mb-1" style={{ color: "rgba(220,80,120,0.75)" }}>注意すべき影響</span>
                    <p className="text-[11px] leading-relaxed" style={{ color: withAlpha(text, 0.75) }}>{impact.riskImpact}</p>
                  </div>
                  <div className="rounded-lg p-2.5" style={{ background: hexToRgba("#6366f1", 0.03), border: `1px solid ${hexToRgba("#6366f1", 0.08)}` }}>
                    <span className="text-[9px] font-mono block mb-1" style={{ color: "#6366f1" }}>相手の視点</span>
                    <p className="text-[11px] leading-relaxed" style={{ color: withAlpha(text, 0.8) }}>{impact.otherPerspective}</p>
                  </div>
                  <p className="text-[10px] leading-relaxed italic" style={{ color: withAlpha(text, 0.55) }}>
                    💡 {impact.deepeningHint}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>

      {/* Gottman risk */}
      {result.gottmanRisk && (
        <div className="rounded-xl p-4 mt-4" style={{ background: hexToRgba("rgba(220,80,120,1)", 0.03), border: `1px solid ${hexToRgba("rgba(220,80,120,1)", 0.1)}` }}>
          <span className="text-[10px] font-mono block mb-1.5" style={{ color: "rgba(220,80,120,0.8)" }}>
            関係性リスク: {result.gottmanRisk.horseman}
          </span>
          <p className="text-xs leading-[1.8] mb-2" style={{ color: withAlpha(text, 0.78) }}>
            {result.gottmanRisk.description}
          </p>
          <div className="rounded-lg p-2.5" style={{ background: hexToRgba("rgba(34,160,88,1)", 0.04), border: `1px solid ${hexToRgba("rgba(34,160,88,1)", 0.08)}` }}>
            <span className="text-[9px] font-mono block mb-1" style={{ color: "rgba(34,160,88,0.85)" }}>解毒剤</span>
            <p className="text-[11px] leading-relaxed" style={{ color: withAlpha(text, 0.82) }}>{result.gottmanRisk.antidote}</p>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ════════════════════════════════════════════════════════
// Section: 暗黙の価値観 (ImplicitValues)
// ════════════════════════════════════════════════════════

function ImplicitValuesSection({
  result,
  primary,
  accent,
  text,
  textMuted,
  border,
  gradient,
  glassBlur,
}: {
  result: ImplicitValuesResult;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
  gradient: string;
  glassBlur: string;
}) {
  const [expandedValue, setExpandedValue] = useState<string | null>(result.values[0]?.name ?? null);

  return (
    <SectionCard border={border} gradient={gradient} glassBlur={glassBlur}>
      <SectionHeader
        label="暗黙の価値観"
        sublabel="選択が語るあなたの優先順位"
        color={accent}
        mutedColor={textMuted}
      />

      <p className="text-sm leading-relaxed mb-2" style={{ color: withAlpha(text, 0.84) }}>
        {result.summary}
      </p>

      {/* Core theme */}
      <div
        className="rounded-xl p-4 mb-5"
        style={{
          background: `linear-gradient(135deg, ${hexToRgba(accent, 0.06)} 0%, ${hexToRgba(primary, 0.03)} 100%)`,
          border: `1px solid ${hexToRgba(accent, 0.12)}`,
        }}
      >
        <p className="text-sm leading-[1.85] font-medium" style={{ color: withAlpha(text, 0.92) }}>
          {result.coreTheme}
        </p>
      </div>

      {/* Value cards */}
      <div className="space-y-2.5 mb-5">
        {result.values.slice(0, 5).map((value, i) => {
          const confidencePct = Math.round(value.confidence * 100);
          const isExpanded = expandedValue === value.name;

          return (
            <motion.div
              key={value.name}
              className="rounded-xl overflow-hidden cursor-pointer"
              style={{
                background: hexToRgba(accent, i < 2 ? 0.04 : 0.02),
                border: `1px solid ${hexToRgba(i < 2 ? accent : border, i < 2 ? 0.12 : 0.2)}`,
              }}
              initial={{ opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 + i * 0.06 }}
              onClick={() => setExpandedValue(isExpanded ? null : value.name)}
            >
              <div className="p-3.5 flex items-center gap-3">
                <span
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-mono font-bold flex-shrink-0"
                  style={{ background: hexToRgba(accent, 0.1), color: accent }}
                >
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium" style={{ color: text }}>{value.name}</span>
                  <div className="h-1 rounded-full mt-1.5 overflow-hidden" style={{ background: hexToRgba(accent, 0.08) }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: hexToRgba(accent, 0.4) }}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${confidencePct}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.25 }}
                    />
                  </div>
                </div>
                <span className="text-[10px] font-mono" style={{ color: withAlpha(accent, 0.7) }}>{confidencePct}%</span>
                <motion.span className="text-xs flex-shrink-0" style={{ color: textMuted }} animate={{ rotate: isExpanded ? 90 : 0 }}>▸</motion.span>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    className="px-3.5 pb-4 space-y-2"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="text-xs leading-[1.8]" style={{ color: withAlpha(text, 0.85) }}>
                      {value.description}
                    </p>
                    <div className="rounded-lg p-2.5" style={{ background: hexToRgba(primary, 0.03), border: `1px solid ${hexToRgba(border, 0.2)}` }}>
                      <span className="text-[9px] font-mono block mb-1" style={{ color: withAlpha(textMuted, 0.7) }}>現れる場面</span>
                      <p className="text-[11px] leading-relaxed" style={{ color: withAlpha(text, 0.78) }}>{value.manifestation}</p>
                    </div>
                    <div className="rounded-lg p-2.5" style={{ background: hexToRgba("rgba(220,80,120,1)", 0.03), border: `1px solid ${hexToRgba("rgba(220,80,120,1)", 0.08)}` }}>
                      <span className="text-[9px] font-mono block mb-1" style={{ color: "rgba(220,80,120,0.75)" }}>脅かされた時</span>
                      <p className="text-[11px] leading-relaxed" style={{ color: withAlpha(text, 0.75) }}>{value.whenThreatened}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Value conflicts */}
      {result.conflicts.length > 0 && (
        <div className="mb-4">
          <span className="text-[10px] font-mono block mb-3" style={{ color: withAlpha(accent, 0.8) }}>
            価値観の対立 — 両方を大切にしたい葛藤
          </span>
          <div className="space-y-2.5">
            {result.conflicts.map((conflict) => (
              <div
                key={`${conflict.valueA}-${conflict.valueB}`}
                className="rounded-xl p-3.5"
                style={{ background: hexToRgba(accent, 0.03), border: `1px solid ${hexToRgba(accent, 0.1)}` }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium" style={{ color: text }}>{conflict.valueA}</span>
                  <span className="text-[10px]" style={{ color: withAlpha(accent, 0.5) }}>×</span>
                  <span className="text-xs font-medium" style={{ color: text }}>{conflict.valueB}</span>
                </div>
                <p className="text-xs leading-[1.8] mb-2" style={{ color: withAlpha(text, 0.78) }}>
                  {conflict.description}
                </p>
                <p className="text-[10px] leading-relaxed italic" style={{ color: withAlpha(text, 0.6) }}>
                  💡 {conflict.integrationHint}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Terminal vs Instrumental */}
      <div
        className="rounded-xl p-4"
        style={{ background: hexToRgba(primary, 0.03), border: `1px dashed ${hexToRgba(border, 0.25)}` }}
      >
        <span className="text-[10px] font-mono block mb-1.5" style={{ color: withAlpha(textMuted, 0.7) }}>
          目的価値 vs 手段価値
        </span>
        <p className="text-xs leading-[1.8]" style={{ color: withAlpha(text, 0.78) }}>
          {result.terminalVsInstrumental}
        </p>
      </div>
    </SectionCard>
  );
}

// ════════════════════════════════════════════════════════
// L4 Helper: GuardianCard — individual IFS guardian
// ════════════════════════════════════════════════════════

function GuardianCard({
  guardian,
  index,
  primary,
  accent,
  text,
  textMuted,
  border,
}: {
  guardian: PersonalizedGuardian;
  index: number;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <motion.div
      className="rounded-xl overflow-hidden cursor-pointer"
      style={{
        background: hexToRgba(primary, 0.03),
        border: `1px solid ${hexToRgba(border, 0.2)}`,
      }}
      initial={{ opacity: 0, x: -8 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ delay: 0.1 + index * 0.08 }}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="p-3.5 flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: hexToRgba(accent, 0.08) }}
        >
          <span className="text-sm" style={{ opacity: 0.7 }}>🛡️</span>
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium" style={{ color: text }}>
            {guardian.name}
          </span>
        </div>
        <motion.span
          className="text-xs flex-shrink-0"
          style={{ color: textMuted }}
          animate={{ rotate: isExpanded ? 90 : 0 }}
        >
          ▸
        </motion.span>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="px-3.5 pb-4 space-y-2.5"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* How it manifests */}
            <p className="text-xs leading-[1.8]" style={{ color: withAlpha(text, 0.85) }}>
              {guardian.manifestation}
            </p>

            {/* Positive intent — IFS core principle */}
            <div
              className="rounded-lg p-2.5"
              style={{
                background: hexToRgba("rgba(34,160,88,1)", 0.04),
                border: `1px solid ${hexToRgba("rgba(34,160,88,1)", 0.1)}`,
              }}
            >
              <span className="text-[9px] font-mono block mb-1" style={{ color: "rgba(34,160,88,0.85)" }}>
                正の意図
              </span>
              <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.82) }}>
                {guardian.positiveIntent}
              </p>
            </div>

            {/* Overprotection — when it goes too far */}
            <div
              className="rounded-lg p-2.5"
              style={{
                background: hexToRgba("rgba(220,80,120,1)", 0.03),
                border: `1px solid ${hexToRgba("rgba(220,80,120,1)", 0.08)}`,
              }}
            >
              <span className="text-[9px] font-mono block mb-1" style={{ color: "rgba(220,80,120,0.75)" }}>
                過剰に働くと
              </span>
              <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.78) }}>
                {guardian.overprotection}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════
// L4: あなたが守っているもの (Level 4 — 深層パターン)
// ════════════════════════════════════════════════════════


function ProtectionSection({
  insight,
  primary,
  accent,
  text,
  textMuted,
  border,
  gradient,
  glassBlur,
}: {
  insight: ProtectionInsight;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
  gradient: string;
  glassBlur: string;
}) {
  const [showShadow, setShowShadow] = useState(false);

  return (
    <SectionCard border={border} gradient={gradient} glassBlur={glassBlur}>
      <SectionHeader
        label="あなたが守っているもの"
        sublabel="Level 4 — 自分はこれを守ろうとしていたのか"
        color={primary}
        mutedColor={textMuted}
      />

      {/* Core protection */}
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: hexToRgba(accent, 0.1) }}
          >
            <span className="text-lg" style={{ opacity: 0.8 }}>🛡️</span>
          </div>
          <h3 className="text-lg font-bold" style={{ color: text }}>
            {insight.protectionName}
          </h3>
        </div>
        <p
          className="text-sm leading-[1.85] mb-4"
          style={{ color: withAlpha(text, 0.88) }}
        >
          {insight.protectionDescription}
        </p>
      </div>

      {/* Guardians — IFS */}
      <div
        className="rounded-xl p-4 mb-4"
        style={{
          background: hexToRgba(primary, 0.03),
          border: `1px solid ${hexToRgba(border, 0.25)}`,
        }}
      >
        <span className="text-[10px] font-mono block mb-2" style={{ color: accent }}>
          あなたの見守り型たち
        </span>
        <p className="text-sm leading-[1.8]" style={{ color: withAlpha(text, 0.85) }}>
          {insight.guardians}
        </p>
      </div>

      {/* Personalized Guardian Cards — individual IFS parts */}
      {insight.personalizedGuardians.length > 0 && (
        <div className="space-y-3 mb-4">
          <span className="text-[10px] font-mono block" style={{ color: withAlpha(accent, 0.8) }}>
            あなたの中の見守り型たち — 一人ずつ見る
          </span>
          {insight.personalizedGuardians.map((guardian, i) => (
            <GuardianCard
              key={guardian.name}
              guardian={guardian}
              index={i}
              primary={primary}
              accent={accent}
              text={text}
              textMuted={textMuted}
              border={border}
            />
          ))}
        </div>
      )}

      {/* Safe vs Stress states */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div
          className="rounded-xl p-3"
          style={{
            background: hexToRgba("rgba(34,160,88,1)", 0.04),
            border: `1px solid ${hexToRgba("rgba(34,160,88,1)", 0.12)}`,
          }}
        >
          <span className="text-[10px] font-mono block mb-1.5" style={{ color: "rgba(34,160,88,0.85)" }}>
            安全な時のあなた
          </span>
          <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.85) }}>
            {insight.safeState}
          </p>
        </div>
        <div
          className="rounded-xl p-3"
          style={{
            background: hexToRgba("rgba(220,80,120,1)", 0.03),
            border: `1px solid ${hexToRgba("rgba(220,80,120,1)", 0.1)}`,
          }}
        >
          <span className="text-[10px] font-mono block mb-1.5" style={{ color: "rgba(220,80,120,0.8)" }}>
            脅かされた時のあなた
          </span>
          <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.8) }}>
            {insight.stressState}
          </p>
        </div>
      </div>

      {/* Gratitude — IFS principle */}
      {insight.gratitude && (
        <div
          className="rounded-xl p-4 mb-4"
          style={{
            background: hexToRgba("rgba(34,160,88,1)", 0.03),
            border: `1px solid ${hexToRgba("rgba(34,160,88,1)", 0.1)}`,
          }}
        >
          <span className="text-[10px] font-mono block mb-2" style={{ color: "rgba(34,160,88,0.85)" }}>
            見守り型への感謝
          </span>
          <p className="text-sm leading-[1.85] italic" style={{ color: withAlpha(text, 0.82) }}>
            {insight.gratitude}
          </p>
        </div>
      )}

      {/* Growth Key */}
      <div
        className="rounded-xl p-4 mb-4"
        style={{
          background: hexToRgba(accent, 0.04),
          border: `1px solid ${hexToRgba(accent, 0.12)}`,
        }}
      >
        <span className="text-[10px] font-mono block mb-1.5" style={{ color: accent }}>
          成長の鍵
        </span>
        <p className="text-sm leading-[1.8] font-medium" style={{ color: withAlpha(text, 0.9) }}>
          {insight.growthKey}
        </p>
      </div>

      {/* Shadow — Jung */}
      <motion.button
        className="w-full rounded-xl p-3 text-left transition-all"
        style={{
          background: showShadow ? hexToRgba(primary, 0.06) : hexToRgba(primary, 0.02),
          border: `1px solid ${showShadow ? hexToRgba(accent, 0.2) : hexToRgba(border, 0.2)}`,
        }}
        onClick={() => setShowShadow(!showShadow)}
        whileTap={{ scale: 0.99 }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">{insight.shadow.emoji}</span>
          <span className="text-xs font-mono" style={{ color: withAlpha(textMuted, 0.8) }}>
            もうひとりの自分 — {insight.shadow.name}
          </span>
          <motion.span
            className="text-xs ml-auto"
            style={{ color: textMuted }}
            animate={{ rotate: showShadow ? 90 : 0 }}
          >
            ▸
          </motion.span>
        </div>
        <p className="text-[10px]" style={{ color: withAlpha(text, 0.5) }}>
          あなたが「自分らしくない」と排除したものの中に、成長の種がある
        </p>
      </motion.button>

      <AnimatePresence>
        {showShadow && (
          <motion.div
            className="mt-3 space-y-3"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="rounded-lg p-3" style={{ background: hexToRgba(primary, 0.03), border: `1px solid ${hexToRgba(border, 0.2)}` }}>
              <span className="text-[10px] font-mono block mb-1" style={{ color: withAlpha(textMuted, 0.7) }}>もうひとりの自分との緊張</span>
              <p className="text-xs leading-[1.8] italic" style={{ color: withAlpha(text, 0.78) }}>
                {insight.shadow.tension}
              </p>
            </div>
            <div className="rounded-lg p-3" style={{ background: hexToRgba("rgba(34,160,88,1)", 0.03), border: `1px solid ${hexToRgba("rgba(34,160,88,1)", 0.08)}` }}>
              <span className="text-[10px] font-mono block mb-1" style={{ color: "rgba(34,160,88,0.85)" }}>影からの贈り物</span>
              <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.82) }}>
                {insight.shadow.gift}
              </p>
            </div>
            {insight.shadow.integrationHint && (
              <div className="rounded-lg p-3" style={{ background: `linear-gradient(135deg, ${hexToRgba(accent, 0.04)} 0%, ${hexToRgba(primary, 0.03)} 100%)`, border: `1px solid ${hexToRgba(accent, 0.1)}` }}>
                <span className="text-[10px] font-mono block mb-1" style={{ color: accent }}>もうひとりの自分との統合 — 小さな一歩</span>
                <p className="text-xs leading-relaxed font-medium" style={{ color: withAlpha(text, 0.88) }}>
                  {insight.shadow.integrationHint}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quote */}
      {insight.quote && (
        <div className="mt-5 text-center">
          <p
            className="text-xs italic leading-relaxed mb-1"
            style={{ color: withAlpha(text, 0.6) }}
          >
            「{insight.quote.text}」
          </p>
          <span
            className="text-[10px]"
            style={{ color: withAlpha(textMuted, 0.5) }}
          >
            — {insight.quote.author}
          </span>
        </div>
      )}
    </SectionCard>
  );
}

// ════════════════════════════════════════════════════════
// Section: 変化の軌跡 (TraitEvolution)
// ════════════════════════════════════════════════════════

function TraitEvolutionSection({
  result,
  primary,
  accent,
  text,
  textMuted,
  border,
  gradient,
  glassBlur,
}: {
  result: TraitEvolutionResult;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
  gradient: string;
  glassBlur: string;
}) {
  const [expandedAxis, setExpandedAxis] = useState<string | null>(null);

  const stageEmoji: Record<string, string> = {
    pre_contemplation: "🌱",
    contemplation: "🔍",
    preparation: "⚙️",
    action: "🔥",
    maintenance: "🏔️",
  };

  return (
    <SectionCard border={border} gradient={gradient} glassBlur={glassBlur}>
      <SectionHeader
        label="変化の軌跡"
        sublabel="あなたの変化の記録"
        color={primary}
        mutedColor={textMuted}
      />
      {/* 変容ステージ */}
      <motion.div
        className="rounded-xl p-4 mb-4"
        style={{
          background: withAlpha(primary, 0.06),
          border: `1px solid ${withAlpha(primary, 0.15)}`,
        }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{stageEmoji[result.changeStage] ?? "📈"}</span>
          <span className="text-sm font-bold" style={{ color: text }}>
            {result.changeStageLabel}
          </span>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.8) }}>
          {result.changeStageDescription}
        </p>
      </motion.div>

      {/* サマリー */}
      <p className="text-xs leading-relaxed mb-4" style={{ color: withAlpha(text, 0.7) }}>
        {result.summary}
      </p>

      {/* 最も変化した軸 */}
      {result.mostChanged.filter(e => Math.abs(e.totalShift) > 0.1).length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-bold mb-2" style={{ color: withAlpha(accent, 0.9) }}>
            変化が大きい特性
          </h4>
          <div className="space-y-2">
            {result.mostChanged
              .filter(e => Math.abs(e.totalShift) > 0.1)
              .map((evo) => (
                <EvolutionAxisCard
                  key={evo.axis}
                  evolution={evo}
                  expanded={expandedAxis === evo.axis}
                  onToggle={() => setExpandedAxis(expandedAxis === evo.axis ? null : evo.axis)}
                  primary={primary}
                  accent={accent}
                  text={text}
                  textMuted={textMuted}
                  border={border}
                />
              ))}
          </div>
        </div>
      )}

      {/* 加速中の軸 */}
      {result.accelerating.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-bold mb-2" style={{ color: withAlpha(accent, 0.9) }}>
            ⚡ 変化が加速中
          </h4>
          <div className="space-y-1">
            {result.accelerating.map((evo) => (
              <div
                key={evo.axis}
                className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{
                  background: withAlpha(accent, 0.08),
                  border: `1px solid ${withAlpha(accent, 0.15)}`,
                }}
              >
                <span className="text-xs">⚡</span>
                <span className="text-xs" style={{ color: text }}>
                  {evo.axisLabel}
                </span>
                <span className="text-[10px] ml-auto" style={{ color: withAlpha(accent, 0.8) }}>
                  {evo.direction === "positive" ? "強まっている" :
                   evo.direction === "negative" ? "弱まっている" :
                   evo.direction === "oscillating" ? "揺れ動いている" : "安定している"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 最も安定した軸 */}
      {result.mostStable.length > 0 && (
        <div>
          <h4 className="text-xs font-bold mb-2" style={{ color: withAlpha(textMuted, 0.8) }}>
            🏔️ 不動の核
          </h4>
          <div className="space-y-1">
            {result.mostStable.slice(0, 2).map((evo) => (
              <div
                key={evo.axis}
                className="rounded-lg px-3 py-2"
                style={{
                  background: withAlpha(textMuted, 0.05),
                  border: `1px solid ${withAlpha(border, 0.1)}`,
                }}
              >
                <span className="text-xs" style={{ color: text }}>
                  {evo.axisLabel}
                </span>
                <p className="text-[10px] mt-1" style={{ color: withAlpha(text, 0.5) }}>
                  {localizeText(evo.interpretation)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function EvolutionAxisCard({
  evolution,
  expanded,
  onToggle,
  primary,
  accent,
  text,
  textMuted,
  border,
}: {
  evolution: AxisEvolution;
  expanded: boolean;
  onToggle: () => void;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
}) {
  const directionEmoji =
    evolution.direction === "positive" ? "↗️" :
    evolution.direction === "negative" ? "↙️" :
    evolution.direction === "oscillating" ? "↕️" : "→";

  const absShift = Math.abs(evolution.totalShift);
  const shiftLabel = evolution.totalShift > 0
    ? `▲ ${(absShift * 100).toFixed(0)}%`
    : evolution.totalShift < 0
      ? `▼ ${(absShift * 100).toFixed(0)}%`
      : "— 変化なし";

  return (
    <motion.button
      className="w-full text-left rounded-xl p-3"
      style={{
        background: withAlpha(primary, 0.04),
        border: `1px solid ${withAlpha(border, 0.15)}`,
      }}
      onClick={onToggle}
      whileTap={{ scale: 0.99 }}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm">{directionEmoji}</span>
        <span className="text-xs font-medium" style={{ color: text }}>
          {evolution.axisLabel}
        </span>
        <span
          className="text-[10px] font-mono ml-auto"
          style={{ color: withAlpha(accent, 0.8) }}
        >
          {shiftLabel}
        </span>
        <motion.span
          className="text-xs"
          style={{ color: textMuted }}
          animate={{ rotate: expanded ? 90 : 0 }}
        >
          ▸
        </motion.span>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className="mt-3 space-y-2"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <p className="text-xs leading-relaxed" style={{ color: withAlpha(text, 0.8) }}>
              {localizeText(evolution.interpretation)}
            </p>
            <div
              className="rounded-lg p-2"
              style={{ background: withAlpha(accent, 0.05) }}
            >
              <p className="text-[10px] font-bold mb-1" style={{ color: withAlpha(accent, 0.7) }}>
                仮説
              </p>
              <p className="text-[10px] leading-relaxed" style={{ color: withAlpha(text, 0.6) }}>
                {localizeText(evolution.hypothesis)}
              </p>
            </div>

            {/* ミニスパークライン */}
            {evolution.points.length >= 3 && (
              <div className="flex items-end gap-[2px] h-8 mt-2">
                {evolution.points.map((pt, i) => {
                  const min = Math.min(...evolution.points.map(p => p.score));
                  const max = Math.max(...evolution.points.map(p => p.score));
                  const range = max - min || 1;
                  const height = ((pt.score - min) / range) * 100;
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-sm"
                      style={{
                        height: `${Math.max(8, height)}%`,
                        background: i === evolution.points.length - 1
                          ? accent
                          : withAlpha(primary, 0.3),
                      }}
                    />
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

// ════════════════════════════════════════════════════════
// Helper: WorkStyleDimensionCard
// ════════════════════════════════════════════════════════

function WorkStyleDimensionCard({
  dimension,
  primary,
  accent,
  text,
  textMuted,
  border,
}: {
  dimension: WorkStyleDimension;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const pct = ((dimension.score + 1) / 2) * 100;

  return (
    <motion.button
      className="w-full text-left rounded-xl p-3"
      style={{
        background: hexToRgba(primary, 0.03),
        border: `1px solid ${hexToRgba(border, 0.15)}`,
      }}
      onClick={() => setExpanded(!expanded)}
      whileTap={{ scale: 0.99 }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium" style={{ color: text }}>
          {dimension.label}
        </span>
        <motion.span className="text-xs" style={{ color: textMuted }} animate={{ rotate: expanded ? 90 : 0 }}>
          ▸
        </motion.span>
      </div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] w-16 text-right" style={{ color: withAlpha(textMuted, 0.7) }}>{dimension.leftLabel}</span>
        <div className="flex-1 h-2 rounded-full overflow-hidden relative" style={{ background: hexToRgba(primary, 0.08) }}>
          <div
            className="absolute top-0 h-full rounded-full"
            style={{
              left: `${Math.min(pct, 50)}%`,
              width: `${Math.abs(pct - 50)}%`,
              background: accent,
              opacity: 0.6,
            }}
          />
          <div
            className="absolute top-0 w-0.5 h-full"
            style={{ left: "50%", background: hexToRgba(textMuted, 0.3) }}
          />
        </div>
        <span className="text-[10px] w-16" style={{ color: withAlpha(textMuted, 0.7) }}>{dimension.rightLabel}</span>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className="mt-2 space-y-2"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <p className="text-[11px] leading-relaxed" style={{ color: withAlpha(text, 0.8) }}>
              {localizeText(dimension.interpretation)}
            </p>
            <div className="rounded-lg p-2" style={{ background: hexToRgba("rgba(34,160,88,1)", 0.04) }}>
              <p className="text-[10px]" style={{ color: "rgba(34,160,88,0.85)" }}>✓ {dimension.bestScenario}</p>
            </div>
            <div className="rounded-lg p-2" style={{ background: hexToRgba("rgba(200,60,60,1)", 0.03) }}>
              <p className="text-[10px]" style={{ color: "rgba(200,60,60,0.7)" }}>✕ {dimension.worstScenario}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

// ════════════════════════════════════════════════════════
// Helper: TeamPartnerCard
// ════════════════════════════════════════════════════════

function TeamPartnerCard({
  partner,
  rank,
  primary,
  accent,
  text,
  textMuted,
  border,
}: {
  partner: { archetypeName: string; synergy: number; whySynergy: string; combinedStrength: string; frictionPoint: string; roleAllocation: string };
  rank: number;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.button
      className="w-full text-left rounded-xl p-3"
      style={{
        background: rank === 1 ? hexToRgba(accent, 0.05) : hexToRgba(primary, 0.03),
        border: `1px solid ${rank === 1 ? hexToRgba(accent, 0.15) : hexToRgba(border, 0.15)}`,
      }}
      onClick={() => setExpanded(!expanded)}
      whileTap={{ scale: 0.99 }}
    >
      <div className="flex items-center gap-2">
        <span
          className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-mono font-bold flex-shrink-0"
          style={{ background: hexToRgba(accent, 0.1), color: accent }}
        >
          {rank}
        </span>
        <span className="text-xs font-medium flex-1" style={{ color: text }}>
          {partner.archetypeName}
        </span>
        <span className="text-[10px] font-mono" style={{ color: withAlpha(accent, 0.7) }}>
          相性 {Math.round(partner.synergy * 100)}%
        </span>
        <motion.span className="text-xs" style={{ color: textMuted }} animate={{ rotate: expanded ? 90 : 0 }}>
          ▸
        </motion.span>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className="mt-2 space-y-2"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] leading-relaxed" style={{ color: withAlpha(text, 0.8) }}>{partner.whySynergy}</p>
            <div className="rounded-lg p-2" style={{ background: hexToRgba("rgba(34,160,88,1)", 0.04) }}>
              <span className="text-[10px] font-mono block mb-0.5" style={{ color: "rgba(34,160,88,0.8)" }}>組み合わせの強み</span>
              <p className="text-[10px] leading-relaxed" style={{ color: withAlpha(text, 0.75) }}>{partner.combinedStrength}</p>
            </div>
            <div className="rounded-lg p-2" style={{ background: hexToRgba(accent, 0.04) }}>
              <span className="text-[10px] font-mono block mb-0.5" style={{ color: accent }}>役割分担</span>
              <p className="text-[10px] leading-relaxed" style={{ color: withAlpha(text, 0.75) }}>{partner.roleAllocation}</p>
            </div>
            <div className="rounded-lg p-2" style={{ background: hexToRgba("rgba(220,180,60,1)", 0.04) }}>
              <span className="text-[10px] font-mono block mb-0.5" style={{ color: "rgba(220,180,60,0.8)" }}>注意点</span>
              <p className="text-[10px] leading-relaxed" style={{ color: withAlpha(text, 0.7) }}>{partner.frictionPoint}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

// ════════════════════════════════════════════════════════
// L4.8: 深層心理 — Stage3 6軸 + interactionInsights
// ════════════════════════════════════════════════════════

const STAGE3_AXES: {
  key: TraitAxisKey;
  icon: string;
  left: string;
  right: string;
  citation: string;
}[] = [
  { key: "attachment_style" as TraitAxisKey, icon: "🔗", left: "安定型", right: "不安型", citation: "Bartholomew 1991" },
  { key: "locus_of_control" as TraitAxisKey, icon: "🎯", left: "内的統制", right: "外的統制", citation: "Rotter 1966" },
  { key: "growth_mindset" as TraitAxisKey, icon: "🌱", left: "成長志向", right: "固定志向", citation: "Dweck 2006" },
  { key: "shame_vs_guilt" as TraitAxisKey, icon: "🪞", left: "罪悪型", right: "恥型", citation: "Tangney 2002" },
  { key: "rumination_tendency" as TraitAxisKey, icon: "🌀", left: "手放す", right: "反芻する", citation: "Nolen-Hoeksema 1991" },
  { key: "fairness_sensitivity" as TraitAxisKey, icon: "⚖️", left: "寛容", right: "公正敏感", citation: "Schmitt 2004" },
];

function DeepPsychologySection({
  axisScores,
  archetypeResult,
  totalObservations,
  primary,
  accent,
  text,
  textMuted,
  border,
  gradient,
  glassBlur,
}: {
  axisScores: Partial<Record<TraitAxisKey, number>>;
  archetypeResult: ArchetypeResult | null;
  totalObservations: number;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
  gradient: string;
  glassBlur: string;
}) {
  // Stage3 軸でスコアが存在するものだけ表示
  const activeAxes = STAGE3_AXES.filter(
    (a) => axisScores[a.key] !== undefined && axisScores[a.key] !== null,
  );

  const interactionInsights = archetypeResult?.interactionInsights ?? [];

  // 何も表示するものがなければ非表示
  if (activeAxes.length === 0 && interactionInsights.length === 0) return null;

  return (
    <>
      <div className="sg-divider" />
      <SectionCard border={border} gradient={gradient} glassBlur={glassBlur}>
        <SectionHeader
          label="深層心理"
          sublabel="Level 4.8 — あなたの判断原理を形づくる無意識の力"
          color={primary}
          mutedColor={textMuted}
        />

        <p
          className="text-sm leading-relaxed mb-6"
          style={{ color: withAlpha(text, 0.84) }}
        >
          表面の行動パターンの奥にある、あなたの判断を方向づけている深層の傾向。
          観測と推論の両方から浮かび上がった、より深い自己像です。
        </p>

        {/* ── Stage3 6軸バー表示 ── */}
        {activeAxes.length > 0 && (
          <div className="space-y-3 mb-6">
            {activeAxes.map((axis) => {
              const score = axisScores[axis.key] ?? 0;
              // score: -1 (left) ~ +1 (right) → barPct: 0% ~ 100%
              const barPct = ((score + 1) / 2) * 100;
              const isStrong = Math.abs(score) > 0.3;

              return (
                <div key={axis.key}>
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{axis.icon}</span>
                      <span
                        className="text-[11px] font-medium"
                        style={{ color: withAlpha(text, 0.9) }}
                      >
                        {axisLabel(axis.key)}
                      </span>
                    </div>
                    <span
                      className="text-[9px] font-mono"
                      style={{ color: withAlpha(textMuted, 0.5) }}
                    >
                      {axis.citation}
                    </span>
                  </div>

                  {/* Bar */}
                  <div className="relative h-5 rounded-full overflow-hidden" style={{ background: hexToRgba(border, 0.3) }}>
                    {/* Center line */}
                    <div
                      className="absolute top-0 bottom-0 w-px"
                      style={{ left: "50%", background: hexToRgba(textMuted, 0.3) }}
                    />
                    {/* Fill from center */}
                    <motion.div
                      className="absolute top-0 bottom-0 rounded-full"
                      style={{
                        left: score >= 0 ? "50%" : `${barPct}%`,
                        width: `${Math.abs(score) * 50}%`,
                        background: isStrong
                          ? `linear-gradient(90deg, ${hexToRgba(accent, 0.6)}, ${hexToRgba(primary, 0.7)})`
                          : hexToRgba(accent, 0.3),
                      }}
                      initial={{ scaleX: 0 }}
                      whileInView={{ scaleX: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>

                  {/* Left / Right labels */}
                  <div className="flex justify-between mt-0.5">
                    <span
                      className="text-[9px]"
                      style={{ color: withAlpha(textMuted, score < -0.1 ? 0.9 : 0.4) }}
                    >
                      {axis.left}
                    </span>
                    <span
                      className="text-[9px]"
                      style={{ color: withAlpha(textMuted, score > 0.1 ? 0.9 : 0.4) }}
                    >
                      {axis.right}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* 未観測の軸がある場合のヒント */}
            {STAGE3_AXES.length - activeAxes.length > 0 && (
              <p
                className="text-[10px] mt-2"
                style={{ color: withAlpha(textMuted, 0.5) }}
              >
                あと{STAGE3_AXES.length - activeAxes.length}つの深層軸が、観測を重ねると出現します
              </p>
            )}
          </div>
        )}

        {/* ── interactionInsights（レイヤー間相互作用）── */}
        {interactionInsights.length > 0 && (
          <div
            className="rounded-xl p-5 space-y-3"
            style={{
              background: `linear-gradient(135deg, ${hexToRgba(accent, 0.08)}, ${hexToRgba(primary, 0.05)})`,
              border: `1px solid ${hexToRgba(accent, 0.20)}`,
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">🔮</span>
              <span
                className="text-xs font-semibold tracking-wide"
                style={{ color: withAlpha(text, 0.9) }}
              >
                あなたの組み合わせが生む特性
              </span>
            </div>
            <p
              className="text-[11px] leading-relaxed"
              style={{ color: withAlpha(textMuted, 0.65) }}
            >
              4つのレイヤーの組み合わせから浮かび上がる、あなた固有の特性
            </p>
            {interactionInsights.map((insight, i) => (
              <motion.div
                key={i}
                className="flex gap-2.5 py-1"
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.08 }}
              >
                <span
                  className="text-xs mt-0.5 flex-shrink-0"
                  style={{ color: accent }}
                >
                  ▸
                </span>
                <p
                  className="text-[13px] leading-relaxed"
                  style={{ color: withAlpha(text, 0.85) }}
                >
                  {insight}
                </p>
              </motion.div>
            ))}
          </div>
        )}

        {/* 観測数が少ない場合の注記 */}
        {totalObservations < 30 && activeAxes.length > 0 && (
          <p
            className="text-[10px] leading-relaxed mt-4"
            style={{ color: withAlpha(text, 0.4) }}
          >
            深層心理の精度は観測量に比例します。直接の回答が優先され、推論は補完として使われます。
          </p>
        )}
      </SectionCard>
    </>
  );
}
