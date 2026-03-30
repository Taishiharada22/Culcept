// app/stargazer/wound/WoundClient.tsx
// 苦しみの構造 — Layer 4: なぜ同じパターンを繰り返すのか
"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { FadeInView } from "@/components/ui/glassmorphism-design";
import { CORE_WOUND_MODELS } from "@/lib/stargazer/alter";
import {
  getAllParts,
  getPartRoleLabel,
  getPartRoleDescription,
  type InnerPart,
} from "@/lib/stargazer/partsDialogue";
import { analyzeStressCascade } from "@/lib/stargazer/stressResponseCascade";
import RepetitionCycleViz from "../_components/RepetitionCycleViz";
import ArchetypeThemeProvider from "../_components/ArchetypeThemeProvider";
import { useArchetypeTheme } from "../_components/ArchetypeThemeProvider";
import { hexToRgba } from "../_utils/color";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { StressCascadeResult } from "@/lib/stargazer/stressResponseCascade";

// ── Storage keys ──

const STORAGE_AXIS_SCORES = "stargazer_axis_scores_v1";
const STORAGE_ARCHETYPE = "stargazer_archetype_v1"; // used by WoundRoot

// ── Role badge colors ──

const ROLE_BADGE_STYLE: Record<string, string> = {
  protector: "rgba(59,130,246,0.18)",
  exile: "rgba(34,197,94,0.18)",
  firefighter: "rgba(251,146,60,0.18)",
};

// ── Inner component (needs theme context) ──

interface WoundInnerProps {
  archetypeCodeOverride?: string | null;
}

function WoundInner({ archetypeCodeOverride }: WoundInnerProps) {
  const { theme } = useArchetypeTheme();

  const archetypeCode = archetypeCodeOverride ?? null;
  const [axisScores, setAxisScores] = useState<Partial<Record<TraitAxisKey, number>>>({});
  const [expandedPart, setExpandedPart] = useState<string | null>(null);
  const [cascade, setCascade] = useState<StressCascadeResult | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- mount-time hydration from localStorage */
    setMounted(true);
    try {
      const raw = localStorage.getItem(STORAGE_AXIS_SCORES);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<TraitAxisKey, number>>;
        setAxisScores(parsed);
        const result = analyzeStressCascade(parsed);
        setCascade(result);
      }
    } catch {
      // parse error
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  if (!mounted || !theme) return null;

  const { primary, accent, text, textMuted, border } = theme.palette;

  const wound = archetypeCode ? CORE_WOUND_MODELS[archetypeCode] : null;
  const allParts = getAllParts();

  const stressDirectionLabel: Record<string, string> = {
    regress_left: "左極に退行",
    regress_right: "右極に退行",
    amplify: "増幅",
    freeze: "凍結",
  };

  return (
    <div
      className="min-h-screen relative z-10"
      style={{ fontFamily: "var(--font-body, system-ui)" }}
    >
      <div className="max-w-lg mx-auto px-4 py-16 pb-32 space-y-8">

        {/* ── Page Header ── */}
        <FadeInView>
          <div className="text-center mb-8">
            <p
              className="text-[10px] font-mono-sg tracking-[0.3em] uppercase mb-3"
              style={{ color: textMuted }}
            >
              深層観測 · 苦しみの構造
            </p>
            <h1
              className="font-display text-3xl font-medium mb-3"
              style={{ color: text }}
            >
              苦しみの構造
            </h1>
            <p
              className="text-sm leading-relaxed max-w-xs mx-auto"
              style={{ color: textMuted }}
            >
              なぜ同じパターンを繰り返すのか。<br />
              傷の構造を静かに観測する。
            </p>
            {/* Divider */}
            <div className="flex items-center gap-3 mt-6">
              <div
                className="flex-1 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${hexToRgba(primary, 0.3)})` }}
              />
              <div
                className="w-1 h-1 rounded-full"
                style={{ background: hexToRgba(accent, 0.6) }}
              />
              <div
                className="flex-1 h-px"
                style={{ background: `linear-gradient(90deg, ${hexToRgba(primary, 0.3)}, transparent)` }}
              />
            </div>
          </div>
        </FadeInView>

        {/* ── Section 1: Core Wound ── */}
        <FadeInView delay={0.1}>
          <motion.div
            className="rounded-2xl overflow-hidden"
            style={{
              background: theme.gradient.card,
              border: `1px solid ${border}`,
              backdropFilter: `blur(${theme.glassEffect.blur})`,
            }}
          >
            <div className="p-6 sm:p-8">
              {/* Header */}
              <div className="flex items-center gap-3 mb-5">
                <div
                  className="flex-1 h-px"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${hexToRgba(primary, 0.3)})`,
                  }}
                />
                <span
                  className="text-[10px] font-mono-sg tracking-[0.25em] uppercase"
                  style={{ color: textMuted }}
                >
                  核心の傷
                </span>
                <div
                  className="flex-1 h-px"
                  style={{
                    background: `linear-gradient(90deg, ${hexToRgba(primary, 0.3)}, transparent)`,
                  }}
                />
              </div>

              <h2
                className="text-sm font-medium mb-1 text-center"
                style={{ color: text }}
              >
                核心的な傷
              </h2>
              <p
                className="text-[11px] text-center mb-5"
                style={{ color: textMuted }}
              >
                すべてのループの源にあるもの
              </p>

              {wound ? (
                <div className="space-y-3">
                  {/* Wound statement */}
                  <motion.div
                    className="rounded-xl p-4"
                    style={{
                      background: hexToRgba(accent, 0.06),
                      border: `1px solid ${hexToRgba(accent, 0.18)}`,
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    <p
                      className="text-sm leading-relaxed font-display italic"
                      style={{ color: text }}
                    >
                      「{wound.wound}」
                    </p>
                  </motion.div>

                  {/* Trigger & Defense */}
                  <div className="grid grid-cols-2 gap-2">
                    <div
                      className="rounded-lg p-3"
                      style={{
                        background: hexToRgba(primary, 0.04),
                        border: `1px solid ${hexToRgba(border, 0.2)}`,
                      }}
                    >
                      <p
                        className="text-[10px] font-mono-sg tracking-wider uppercase mb-1"
                        style={{ color: textMuted }}
                      >
                        発動
                      </p>
                      <p
                        className="text-[11px] leading-snug"
                        style={{ color: text, opacity: 0.85 }}
                      >
                        {wound.trigger}
                      </p>
                    </div>
                    <div
                      className="rounded-lg p-3"
                      style={{
                        background: hexToRgba(primary, 0.04),
                        border: `1px solid ${hexToRgba(border, 0.2)}`,
                      }}
                    >
                      <p
                        className="text-[10px] font-mono-sg tracking-wider uppercase mb-1"
                        style={{ color: textMuted }}
                      >
                        防衛
                      </p>
                      <p
                        className="text-[11px] leading-snug"
                        style={{ color: text, opacity: 0.85 }}
                      >
                        {wound.defense}
                      </p>
                    </div>
                  </div>

                  {/* Healed state */}
                  <div
                    className="rounded-xl p-3 flex items-start gap-3"
                    style={{
                      background: hexToRgba(primary, 0.04),
                      border: `1px dashed ${hexToRgba(accent, 0.2)}`,
                    }}
                  >
                    <span className="text-sm mt-0.5">✦</span>
                    <div>
                      <p
                        className="text-[10px] font-mono-sg tracking-wider uppercase mb-1"
                        style={{ color: accent }}
                      >
                        癒えた状態
                      </p>
                      <p
                        className="text-[11px] leading-snug"
                        style={{ color: text, opacity: 0.8 }}
                      >
                        {wound.healed}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-xl p-5 text-center"
                  style={{
                    background: hexToRgba(primary, 0.04),
                    border: `1px solid ${hexToRgba(border, 0.2)}`,
                  }}
                >
                  <p className="text-xs mb-2" style={{ color: textMuted }}>
                    観測データが不足しています
                  </p>
                  <p className="text-[11px]" style={{ color: textMuted, opacity: 0.7 }}>
                    観測を続けると、核心的な傷のパターンが浮かび上がってきます。
                  </p>
                  <Link
                    href="/stargazer"
                    className="inline-block mt-3 text-[11px] underline underline-offset-2"
                    style={{ color: accent }}
                  >
                    観測を始める →
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        </FadeInView>

        {/* ── Section 2: Repetition Cycle ── */}
        <FadeInView delay={0.15}>
          <RepetitionCycleViz archetypeCode={archetypeCode} />
        </FadeInView>

        {/* ── Section 3: Inner Parts ── */}
        <FadeInView delay={0.2}>
          <div>
            {/* Section header */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className="flex-1 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${hexToRgba(primary, 0.25)})` }}
              />
              <div className="text-center">
                <p
                  className="text-[10px] font-mono-sg tracking-[0.25em] uppercase"
                  style={{ color: textMuted }}
                >
                  内なるパーツ
                </p>
                <h2
                  className="text-sm font-medium"
                  style={{ color: text }}
                >
                  あなたの中のパーツたち
                </h2>
              </div>
              <div
                className="flex-1 h-px"
                style={{ background: `linear-gradient(90deg, ${hexToRgba(primary, 0.25)}, transparent)` }}
              />
            </div>
            <p
              className="text-[11px] text-center mb-5"
              style={{ color: textMuted }}
            >
              それぞれが、あなたを守るために存在している
            </p>

            <div className="space-y-3">
              {allParts.map((part) => (
                <PartCard
                  key={part.name}
                  part={part}
                  isExpanded={expandedPart === part.name}
                  onToggle={() =>
                    setExpandedPart(expandedPart === part.name ? null : part.name)
                  }
                  primary={primary}
                  accent={accent}
                  text={text}
                  textMuted={textMuted}
                  border={border}
                />
              ))}
            </div>
          </div>
        </FadeInView>

        {/* ── Section 4: Stress Cascade ── */}
        <FadeInView delay={0.25}>
          <motion.div
            className="rounded-2xl overflow-hidden"
            style={{
              background: theme.gradient.card,
              border: `1px solid ${border}`,
              backdropFilter: `blur(${theme.glassEffect.blur})`,
            }}
          >
            <div className="p-6 sm:p-8">
              {/* Header */}
              <div className="flex items-center gap-3 mb-5">
                <div
                  className="flex-1 h-px"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${hexToRgba(primary, 0.3)})`,
                  }}
                />
                <span
                  className="text-[10px] font-mono-sg tracking-[0.25em] uppercase"
                  style={{ color: textMuted }}
                >
                  ストレスの連鎖
                </span>
                <div
                  className="flex-1 h-px"
                  style={{
                    background: `linear-gradient(90deg, ${hexToRgba(primary, 0.3)}, transparent)`,
                  }}
                />
              </div>

              <h2
                className="text-sm font-medium text-center mb-1"
                style={{ color: text }}
              >
                ストレスの連鎖反応
              </h2>
              <p
                className="text-[11px] text-center mb-5"
                style={{ color: textMuted }}
              >
                崩れる順序
              </p>

              {cascade ? (
                <div className="space-y-4">
                  {/* Summary */}
                  <div
                    className="rounded-xl p-4"
                    style={{
                      background: hexToRgba(accent, 0.05),
                      border: `1px solid ${hexToRgba(accent, 0.15)}`,
                    }}
                  >
                    <p
                      className="text-xs leading-relaxed"
                      style={{ color: text, opacity: 0.85 }}
                    >
                      {cascade.summary}
                    </p>
                  </div>

                  {/* Cascade steps */}
                  <div className="space-y-2">
                    {cascade.cascade.map((step) => (
                      <div
                        key={step.axis}
                        className="rounded-xl p-4"
                        style={{
                          background: hexToRgba(primary, 0.04),
                          border: `1px solid ${hexToRgba(border, 0.2)}`,
                        }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className="rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shrink-0"
                            style={{
                              background: hexToRgba(accent, 0.15),
                              color: accent,
                            }}
                          >
                            {step.stage}
                          </div>
                          <p
                            className="text-[11px] font-medium"
                            style={{ color: text }}
                          >
                            {step.axisLabel}
                          </p>
                          <span
                            className="ml-auto text-[10px] font-mono-sg"
                            style={{ color: textMuted }}
                          >
                            {stressDirectionLabel[step.stressDirection] ?? step.stressDirection}
                          </span>
                        </div>
                        <p
                          className="text-[11px] leading-relaxed mb-2"
                          style={{ color: text, opacity: 0.78 }}
                        >
                          {step.description}
                        </p>
                        <div
                          className="rounded-lg p-2"
                          style={{
                            background: hexToRgba(primary, 0.03),
                            border: `1px dashed ${hexToRgba(border, 0.2)}`,
                          }}
                        >
                          <p
                            className="text-[10px] leading-relaxed"
                            style={{ color: textMuted }}
                          >
                            回復のヒント: {step.recoveryHint}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Last standing */}
                  {cascade.lastStanding && (
                    <div
                      className="rounded-xl p-4"
                      style={{
                        background: hexToRgba(accent, 0.06),
                        border: `1px solid ${hexToRgba(accent, 0.2)}`,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm">✦</span>
                        <p
                          className="text-[11px] font-medium"
                          style={{ color: accent }}
                        >
                          最後まで崩れない軸
                        </p>
                      </div>
                      <p
                        className="text-[11px] font-medium mb-1"
                        style={{ color: text }}
                      >
                        {cascade.lastStanding.axisLabel}
                      </p>
                      <p
                        className="text-[11px] leading-relaxed"
                        style={{ color: textMuted }}
                      >
                        {cascade.lastStanding.description}
                      </p>
                    </div>
                  )}

                  {/* Resilience profile */}
                  <div
                    className="rounded-xl p-4"
                    style={{
                      background: hexToRgba(primary, 0.04),
                      border: `1px solid ${hexToRgba(border, 0.15)}`,
                    }}
                  >
                    <p
                      className="text-[10px] font-mono-sg tracking-wider uppercase mb-2"
                      style={{ color: textMuted }}
                    >
                      レジリエンスプロファイル
                    </p>
                    <p
                      className="text-xs leading-relaxed"
                      style={{ color: text, opacity: 0.82 }}
                    >
                      {cascade.resilienceProfile}
                    </p>
                  </div>

                  {/* Early warnings */}
                  {cascade.earlyWarnings.length > 0 && (
                    <div
                      className="rounded-xl p-4"
                      style={{
                        background: hexToRgba(primary, 0.04),
                        border: `1px solid ${hexToRgba(border, 0.15)}`,
                      }}
                    >
                      <p
                        className="text-[10px] font-mono-sg tracking-wider uppercase mb-2"
                        style={{ color: textMuted }}
                      >
                        早期警告サイン
                      </p>
                      <ul className="space-y-1">
                        {cascade.earlyWarnings.map((w, i) => (
                          <li
                            key={i}
                            className="text-[11px] leading-relaxed flex items-start gap-2"
                            style={{ color: text, opacity: 0.78 }}
                          >
                            <span style={{ color: accent }} className="mt-0.5">•</span>
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className="rounded-xl p-5 text-center"
                  style={{
                    background: hexToRgba(primary, 0.04),
                    border: `1px solid ${hexToRgba(border, 0.2)}`,
                  }}
                >
                  <p className="text-xs mb-2" style={{ color: textMuted }}>
                    軸スコアが不足しています
                  </p>
                  <p
                    className="text-[11px] leading-relaxed"
                    style={{ color: textMuted, opacity: 0.7 }}
                  >
                    観測を積み重ねると、ストレス下でどの順序で崩れやすいかが<br />
                    パターンとして浮かび上がってきます。
                  </p>
                  <Link
                    href="/stargazer"
                    className="inline-block mt-3 text-[11px] underline underline-offset-2"
                    style={{ color: accent }}
                  >
                    観測を続ける →
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        </FadeInView>

        {/* ── Back link ── */}
        <FadeInView delay={0.3}>
          <div className="text-center pt-4">
            <Link
              href="/stargazer"
              className="text-[11px] font-mono-sg tracking-wider uppercase underline underline-offset-4"
              style={{ color: textMuted }}
            >
              ← 深層観測へ戻る
            </Link>
          </div>
        </FadeInView>
      </div>
    </div>
  );
}

// ── Part Card component ──

interface PartCardProps {
  part: InnerPart;
  isExpanded: boolean;
  onToggle: () => void;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
}

function PartCard({
  part,
  isExpanded,
  onToggle,
  primary,
  accent,
  text,
  textMuted,
  border,
}: PartCardProps) {
  const roleLabel = getPartRoleLabel(part.role);
  const roleDesc = getPartRoleDescription(part.role);
  const roleBg = ROLE_BADGE_STYLE[part.role] ?? "rgba(120,120,150,0.15)";

  return (
    <motion.div
      className="rounded-2xl overflow-hidden cursor-pointer"
      style={{
        background: `linear-gradient(135deg, ${hexToRgba(primary, 0.05)} 0%, rgba(255,255,255,0.02) 100%)`,
        border: `1px solid ${part.color.replace("0.7", "0.3")}`,
        backdropFilter: "blur(12px)",
      }}
      onClick={onToggle}
      layout
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Header row */}
      <div className="p-4 flex items-center gap-3">
        {/* Color dot */}
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: part.color }}
        />

        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-medium leading-tight"
            style={{ color: text }}
          >
            {part.name}
          </p>
          <p
            className="text-[10px] mt-0.5"
            style={{ color: textMuted }}
          >
            {part.coreMessage}
          </p>
        </div>

        {/* Role badge */}
        <div
          className="rounded-full px-2 py-0.5 shrink-0"
          style={{ background: roleBg }}
        >
          <span
            className="text-[10px] font-medium"
            style={{ color: text, opacity: 0.85 }}
          >
            {roleLabel}
          </span>
        </div>

        {/* Chevron */}
        <motion.span
          className="text-[10px] shrink-0"
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
            <div
              className="h-px mb-4"
              style={{ background: part.color.replace("0.7", "0.15") }}
            />

            {/* Voice */}
            <div
              className="rounded-xl p-4 mb-3"
              style={{
                background: hexToRgba(primary, 0.04),
                border: `1px solid ${part.color.replace("0.7", "0.12")}`,
              }}
            >
              <p
                className="text-[10px] font-mono-sg tracking-wider uppercase mb-2"
                style={{ color: textMuted }}
              >
                このパーツの声
              </p>
              <p
                className="text-xs leading-relaxed italic"
                style={{ color: text, opacity: 0.85 }}
              >
                「{part.voice}」
              </p>
            </div>

            {/* Protecting & Fears */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div
                className="rounded-lg p-3"
                style={{
                  background: hexToRgba(primary, 0.04),
                  border: `1px solid ${hexToRgba(border, 0.15)}`,
                }}
              >
                <p
                  className="text-[10px] font-mono-sg tracking-wider uppercase mb-1"
                  style={{ color: textMuted }}
                >
                  守っているもの
                </p>
                <p
                  className="text-[11px] leading-snug"
                  style={{ color: text, opacity: 0.82 }}
                >
                  {part.protecting}
                </p>
              </div>
              <div
                className="rounded-lg p-3"
                style={{
                  background: hexToRgba(primary, 0.04),
                  border: `1px solid ${hexToRgba(border, 0.15)}`,
                }}
              >
                <p
                  className="text-[10px] font-mono-sg tracking-wider uppercase mb-1"
                  style={{ color: textMuted }}
                >
                  恐れていること
                </p>
                <p
                  className="text-[11px] leading-snug"
                  style={{ color: text, opacity: 0.82 }}
                >
                  {part.fears}
                </p>
              </div>
            </div>

            {/* Role description */}
            <p
              className="text-[10px]"
              style={{ color: textMuted, opacity: 0.7 }}
            >
              役割タイプ「{roleLabel}」— {roleDesc}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Root export ──
// Reads archetype from localStorage, then passes into ArchetypeThemeProvider

function WoundRoot() {
  const [archetypeCode, setArchetypeCode] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- mount-time hydration from localStorage */
    try {
      const raw = localStorage.getItem(STORAGE_ARCHETYPE);
      if (raw) setArchetypeCode(raw.replace(/"/g, ""));
    } catch {
      // localStorage unavailable
    }
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  if (!ready) return null;

  return (
    <ArchetypeThemeProvider archetypeCode={archetypeCode as import("@/lib/stargazer/archetypeTypes").ArchetypeCode | null}>
      <WoundInner archetypeCodeOverride={archetypeCode} />
    </ArchetypeThemeProvider>
  );
}

export default function WoundClient() {
  return <WoundRoot />;
}
