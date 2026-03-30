"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import MiniGenomeCard from "./MiniGenomeCard";
import TemporalMirrorCard from "./TemporalMirrorCard";
import type { TemporalMirrorResult } from "@/lib/stargazer/temporalSelfMirror";
import { getActiveVanishingInsight, generateVanishingInsight, saveVanishingInsight, loadVanishingInsight, getPreviousInsights, type VanishingInsightData } from "@/lib/stargazer/vanishingInsightGenerator";
import { generateDailyOracle, type DailyOracleCard as OracleData } from "@/lib/stargazer/dailyOracleCard";
import DailyOracleCardUI from "./DailyOracleCard";

const mono = "'JetBrains Mono','SF Mono',monospace";

type GenomeCardFrontData = {
  archetypeLabel?: string | null;
  coreValue?: string | null;
  dilemma?: string | null;
  currentCuriosity?: string | null;
  lastObservedAt?: string | null;
  radarAxes?: { analytical: number; cautious: number; social: number; expressive: number; independent: number } | null;
  completeness?: number;
};

type Props = {
  greeting: string;
  sgData: {
    archetype?: string | null;
    emoji?: string | null;
    confidence?: number;
    observationCount?: number;
    figureSrc?: string | null;
    figureAlt?: string | null;
    archetypeEnglishName?: string | null;
  } | null;
  innerWeather: {
    emoji?: string;
    label?: string;
    message?: string;
    recorded?: boolean;
    needsInput?: boolean;
    ctaLabel?: string;
  } | null;
  prophecy: {
    prediction?: string;
    reasoning?: string;
    verification?: string;
    accuracy?: number;
    isVerified?: boolean;
  } | null;
  temporalMirror: TemporalMirrorResult | null;
  streak?: number;
  aiQuestion?: string | null;
  /** 今日の観測が完了しているか（ストリーク危機判定用） */
  todayObserved?: boolean;
  /** 今日Stargazer使用済みか */
  todayStargazerDone?: boolean;
  /** 今日Origin使用済みか */
  todayOriginDone?: boolean;
};

function formatRelative(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "たった今";
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}

export default function TodaysMirrorSection({
  greeting,
  sgData,
  innerWeather,
  prophecy,
  temporalMirror,
  streak = 0,
  aiQuestion,
  todayObserved = false,
  todayStargazerDone = false,
  todayOriginDone = false,
}: Props) {
  const sync = Math.round((sgData?.confidence ?? 0) * 100) || 0;
  const obsCount = sgData?.observationCount ?? 0;

  // Phase 8: Sync% tooltip expansion
  const [syncTooltipOpen, setSyncTooltipOpen] = useState(false);

  // Phase 10: Concept whisper for first-time visitors (shown for first 5 visits)
  const [showConceptWhisper, setShowConceptWhisper] = useState(false);
  useEffect(() => {
    try {
      const key = "aneurasync_visit_count";
      const count = parseInt(localStorage.getItem(key) || "0", 10) + 1;
      localStorage.setItem(key, String(count));
      if (count <= 5) setShowConceptWhisper(true);
    } catch { /* ignore */ }
  }, []);

  // 施策I: Vanishing Insight (消える洞察)
  const [vanishingInsight, setVanishingInsight] = useState<VanishingInsightData | null>(null);
  const [viOpen, setViOpen] = useState(false);
  const [viHoursLeft, setViHoursLeft] = useState(0);
  useEffect(() => {
    if (obsCount < 5) return;
    try {
      // まず既存の有効なインサイトを確認
      let active = getActiveVanishingInsight();
      if (!active) {
        // なければ生成
        const axisScores: Record<string, number> = {};
        if (sgData && (sgData as any).axisScores) {
          Object.assign(axisScores, (sgData as any).axisScores);
        }
        const prev = getPreviousInsights();
        const generated = generateVanishingInsight(axisScores, obsCount, prev);
        if (generated) {
          saveVanishingInsight(generated);
          active = generated;
        }
      }
      setVanishingInsight(active);
    } catch { /* ignore */ }
  }, [obsCount, sgData]);

  useEffect(() => {
    if (vanishingInsight) {
      setViHoursLeft(Math.max(0, Math.floor((vanishingInsight.expiresAt - Date.now()) / 3600000)));
    }
  }, [vanishingInsight]);

  // Daily Oracle Card
  const [oracleCard, setOracleCard] = useState<OracleData | null>(null);
  useEffect(() => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const oracle = generateDailyOracle({
        date: today,
        archetypeCode: (sgData as any)?.archetypeCode ?? undefined,
        observationCount: obsCount,
        vanishingInsight: vanishingInsight?.insight ?? undefined,
      });
      setOracleCard(oracle);
    } catch { /* ignore */ }
  }, [sgData, obsCount, vanishingInsight]);

  // Show onboarding result for brand-new users (0 observations)
  const [onboardingResult, setOnboardingResult] = useState<{
    name?: string; emoji?: string; tagline?: string; blindSpot?: string; confidence?: number;
  } | null>(null);
  useEffect(() => {
    if (obsCount > 0) return; // only for new users
    try {
      const raw = localStorage.getItem("aneurasync_first_archetype");
      if (raw) setOnboardingResult(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [obsCount]);

  // Fetch genome card data for MiniGenomeCard
  const [gcData, setGcData] = useState<GenomeCardFrontData | null>(null);
  useEffect(() => {
    fetch("/api/genome-card", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d?.ok || !d.card) return;
        const c = d.card;
        setGcData({
          archetypeLabel: c.archetypeLabel,
          coreValue: c.cardFront?.coreValue ?? null,
          dilemma: c.cardFront?.dilemma ?? null,
          currentCuriosity: c.cardFront?.currentCuriosity ?? null,
          lastObservedAt: c.cardFront?.lastObservedAt ?? null,
          radarAxes: c.cardBack?.radarAxes ?? null,
          completeness: c.completeness ?? 0,
        });
      })
      .catch((err) => {
        console.warn("[TodaysMirrorSection] genome-card fetch failed:", err?.message);
        setGcData(null);
      });
  }, []);

  return (
    <section
      id="section-today"
      aria-label="今日のあなた"
      style={{ padding: "32px 20px 16px", maxWidth: 780, margin: "0 auto", position: "relative" }}
    >
      {/* Section header */}
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 11, color: "#6b6b80", letterSpacing: 5, fontWeight: 600, fontFamily: mono }}>
          TODAY&apos;S MIRROR
        </span>
        <div style={{ fontSize: 14, color: "#1a1a2e", marginTop: 4, fontWeight: 700 }}>今日のあなた</div>
      </div>

      {/* ── Greeting row ── */}
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 900, letterSpacing: -1, marginBottom: 4, color: "#1a1a2e" }}>
          {greeting}
        </h2>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => setSyncTooltipOpen(!syncTooltipOpen)}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 0,
              display: "flex", alignItems: "baseline", gap: 4, color: "inherit",
            }}
            aria-label={`観測精度 ${sync}%。タップで詳細`}
          >
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: -1, color: "#1a1a2e" }}>
              {sync > 0 ? sync : "—"}<span style={{ fontSize: 11, opacity: 0.45 }}>{sync > 0 ? "%" : ""}</span>
            </span>
            <span style={{ fontSize: 7, color: "rgba(59,130,246,0.6)", letterSpacing: 3, fontFamily: mono }}>SYNC</span>
          </button>
          {(() => {
            const moonPhase = streak >= 30 ? "🌕" : streak >= 14 ? "🌓" : streak >= 7 ? "🌒" : "🌑";
            const phaseLabel = streak >= 7 ? "覚醒" : streak >= 1 ? `あと${7 - streak}日で覚醒` : "";

            if (streak > 0 && todayObserved) {
              // 今日は完了済み
              return (
                <span style={{ fontSize: 11, fontWeight: 600, color: "#22c55e", marginLeft: 4 }}>
                  {moonPhase} {streak}日連続 ✓ 今日も継続{phaseLabel ? ` — ${phaseLabel}` : ""}
                </span>
              );
            }
            if (streak > 0 && !todayObserved) {
              // ストリーク危機！
              const now = new Date();
              const hoursLeft = 23 - now.getHours();
              const minsLeft = 59 - now.getMinutes();
              const isUrgent = now.getHours() >= 21;
              return (
                <span style={{
                  fontSize: 11, fontWeight: 700, marginLeft: 4,
                  color: isUrgent ? "#EF4444" : "#F59E0B",
                  animation: isUrgent ? "primaryActionPulse 2s ease-in-out infinite" : "none",
                }}>
                  {moonPhase} {streak}日連続が途切れそう — あと{hoursLeft}h {minsLeft}m
                </span>
              );
            }
            // Day 1: show moon phase even with 0 streak
            if (obsCount > 0) {
              return (
                <span style={{ fontSize: 11, fontWeight: 500, color: "#8888a0", marginLeft: 4 }}>
                  🌑 1日目 — あと6日で覚醒フェーズ
                </span>
              );
            }
            return null;
          })()}
        </div>

        {/* Sync% tooltip (Phase 8: 信頼性の透明化) */}
        {syncTooltipOpen && (
          <div style={{
            marginTop: 8, padding: "10px 12px", borderRadius: 12,
            background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.12)",
          }}>
            <div style={{ fontSize: 11, color: "#1a1a2e", fontWeight: 600, marginBottom: 6 }}>
              観測精度について
            </div>
            <div style={{ fontSize: 11, color: "#4a4a68", lineHeight: 1.6 }}>
              {sync}% = 観測データ{obsCount}回分に基づく推定
            </div>
            <div style={{
              marginTop: 6, height: 4, borderRadius: 2, background: "rgba(0,0,0,0.06)", overflow: "hidden",
            }}>
              <div style={{
                height: "100%", borderRadius: 2, width: `${Math.min(sync, 100)}%`,
                background: "linear-gradient(90deg, #3B82F6, #6366F1)",
                transition: "width 0.6s ease",
              }} />
            </div>
            <div style={{ fontSize: 10, color: "#8888a0", marginTop: 4 }}>
              {obsCount < 50
                ? `あと${50 - obsCount}回答えると、かなり正確になるよ`
                : "あなたのことがかなり正確にわかってきた"}
            </div>
          </div>
        )}
      </div>

      {/* コンセプトウィスパー (Phase 10: 初見ユーザー向け) */}
      {showConceptWhisper && (
        <div style={{
          marginBottom: 12, padding: "8px 12px", borderRadius: 10,
          background: "rgba(139,92,246,0.04)", border: "1px solid rgba(139,92,246,0.08)",
        }}>
          <div style={{ fontSize: 11, color: "#4a4a68", lineHeight: 1.6, fontStyle: "italic" }}>
            使えば使うほど、自分でも知らなかった自分が見えてくるよ
          </div>
        </div>
      )}

      {/* ── 施策C: Daily Progress Ring ── */}
      {(() => {
        const prophecyChecked = typeof window !== "undefined" && !!localStorage.getItem("aneurasync_prophecy_feedback_today");
        const tasks = [
          { icon: "🌤", label: "天気記録", done: !!innerWeather?.recorded },
          { icon: "🧠", label: "観測", done: todayStargazerDone },
          { icon: "📝", label: "Origin", done: todayOriginDone },
          { icon: "🔮", label: "予測確認", done: prophecyChecked },
        ];
        const doneCount = tasks.filter(t => t.done).length;
        const pct = (doneCount / tasks.length) * 100;
        const allDone = doneCount === tasks.length;

        return (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, opacity: 0.8 }}>
            {/* Ring */}
            <svg width={48} height={48} viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
              <circle cx={24} cy={24} r={20} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={3} />
              <circle
                cx={24} cy={24} r={20} fill="none"
                stroke={allDone ? "#EAB308" : "#6366F1"}
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={`${pct * 1.257} ${125.7 - pct * 1.257}`}
                transform="rotate(-90 24 24)"
                style={{ transition: "stroke-dasharray 0.6s ease, stroke 0.3s" }}
              />
              <text x={24} y={26} textAnchor="middle" fontSize={allDone ? 14 : 12} fontWeight={700} fill={allDone ? "#EAB308" : "#1a1a2e"}>
                {allDone ? "✦" : `${doneCount}/${tasks.length}`}
              </text>
            </svg>
            {/* Tasks */}
            <div style={{ flex: 1, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {tasks.map(t => (
                <span key={t.label} style={{
                  fontSize: 10, padding: "3px 8px", borderRadius: 8,
                  background: t.done ? "rgba(34,197,94,0.08)" : "rgba(0,0,0,0.03)",
                  color: t.done ? "#22c55e" : "#8888a0",
                  fontWeight: t.done ? 600 : 400,
                  textDecoration: t.done ? "line-through" : "none",
                }}>
                  {t.icon} {t.label}
                </span>
              ))}
            </div>
            {allDone && (
              <span style={{ fontSize: 10, fontWeight: 700, color: "#EAB308" }}>
                完了
              </span>
            )}
          </div>
        );
      })()}

      {/* ── 施策E: 時間帯ティーザー（夜のフック） ── */}
      {(() => {
        const hour = new Date().getHours();
        if (hour >= 20 || hour < 6) {
          // 夜・深夜
          const msg = prophecy?.prediction && !innerWeather?.recorded
            ? "今日の気持ち、忘れないうちに残しておこう"
            : prophecy?.prediction
            ? "今日の予測、当たってた？"
            : hour < 6
            ? "こんな時間に起きてるんだね。静かな時間は自分と向き合うチャンスだよ"
            : "寝る前に少しだけ。明日の自分のために";
          return (
            <div style={{
              marginBottom: 12, padding: "10px 14px", borderRadius: 14,
              background: "linear-gradient(145deg, rgba(99,102,241,0.06) 0%, rgba(30,20,60,0.04) 100%)",
              border: "1px solid rgba(99,102,241,0.1)",
            }}>
              <div style={{ fontSize: 8, color: "#6366F1", letterSpacing: 2, fontFamily: mono, marginBottom: 4 }}>
                {hour < 6 ? "深夜のひとこと" : "夜のひとこと"}
              </div>
              <div style={{ fontSize: 12, color: "#1a1a2e", fontWeight: 600, lineHeight: 1.6 }}>
                {msg}
              </div>
            </div>
          );
        }
        if (hour >= 6 && hour < 12 && !todayObserved) {
          return (
            <div style={{
              marginBottom: 12, padding: "10px 14px", borderRadius: 14,
              background: "rgba(59,130,246,0.04)", border: "1px solid rgba(59,130,246,0.08)",
            }}>
              <div style={{ fontSize: 12, color: "#1a1a2e", fontWeight: 600, lineHeight: 1.6 }}>
                朝イチの素直な気持ちを記録しておこう
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* ── Onboarding result for brand-new users ── */}
      {obsCount === 0 && onboardingResult?.name && (
        <Link
          href="/stargazer"
          style={{
            display: "block",
            padding: "14px 16px",
            borderRadius: 16,
            background: "linear-gradient(145deg, rgba(99,102,241,0.08) 0%, #ffffff 50%, rgba(139,92,246,0.06) 100%)",
            border: "1.5px solid rgba(99,102,241,0.18)",
            boxShadow: "0 4px 16px rgba(99,102,241,0.1)",
            textDecoration: "none",
            color: "inherit",
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 8, color: "#b0b0c4", letterSpacing: 1.5, fontFamily: mono, marginBottom: 8, whiteSpace: "nowrap" }}>
            YOUR FIRST OBSERVATION
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 28, flexShrink: 0 }}>{onboardingResult.emoji}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#1a1a2e", lineHeight: 1.2 }}>
                {onboardingResult.name}
              </div>
              {onboardingResult.tagline && (
                <div style={{ fontSize: 12, color: "#4a4a68", lineHeight: 1.5, marginTop: 2 }}>
                  {onboardingResult.tagline}
                </div>
              )}
            </div>
          </div>
          {onboardingResult.blindSpot && (
            <div style={{
              fontSize: 11, color: "#6366a0", lineHeight: 1.5,
              padding: "8px 12px", borderRadius: 12,
              background: "rgba(99,102,241,0.06)",
              border: "1px solid rgba(99,102,241,0.1)",
              marginBottom: 10,
            }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: "#8b5cf6", letterSpacing: 1, display: "block", marginBottom: 3 }}>
                BLIND SPOT
              </span>
              {onboardingResult.blindSpot}
            </div>
          )}
          <div style={{ fontSize: 12, color: "#6366F1", fontWeight: 700 }}>
            もっと詳しく知るために、最初の質問に答えよう →
          </div>
        </Link>
      )}

      {/* ── Genome Card (左) + Weather/Prophecy (右) ── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <MiniGenomeCard
          archetypeName={gcData?.archetypeLabel ?? sgData?.archetype}
          archetypeEmoji={sgData?.emoji}
          archetypeEnglishName={sgData?.archetypeEnglishName}
          figureSrc={sgData?.figureSrc}
          coreValue={gcData?.coreValue}
          dilemma={gcData?.dilemma}
          currentInterest={gcData?.currentCuriosity}
          lastObservedAt={formatRelative(gcData?.lastObservedAt)}
          radarAxes={gcData?.radarAxes}
          completeness={gcData?.completeness}
        />

        {/* 脇役: Weather + Prophecy */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Inner Weather card */}
          {innerWeather?.recorded && innerWeather?.emoji && (
            <Link
              href="/stargazer/weather"
              style={{
                flex: 1, padding: "10px 12px", borderRadius: 12,
                background: "rgba(255,255,255,0.5)",
                border: "1px solid rgba(0,0,0,0.04)",
                textDecoration: "none", color: "inherit",
                display: "flex", flexDirection: "column", gap: 4,
              }}
            >
              <div style={{ fontSize: 8, color: "#b0b0c4", letterSpacing: 2, fontFamily: mono }}>心の天気</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 20 }}>{innerWeather.emoji}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e" }}>{innerWeather.label}</span>
              </div>
              {innerWeather.message && (
                <div style={{ fontSize: 10, color: "#4a4a68", lineHeight: 1.45 }}>
                  {innerWeather.message.length > 52 ? `${innerWeather.message.slice(0, 52)}…` : innerWeather.message}
                </div>
              )}
              <div style={{ fontSize: 8, color: "#3b82f6", fontWeight: 600 }}>{innerWeather.ctaLabel ?? "詳細を見る"} →</div>
            </Link>
          )}

          {innerWeather?.needsInput && (
            <Link
              href="/stargazer/weather"
              style={{
                flex: 1, padding: "10px 12px", borderRadius: 12,
                background: "rgba(255,255,255,0.5)",
                border: "1px solid rgba(0,0,0,0.04)",
                textDecoration: "none", color: "inherit",
                display: "flex", flexDirection: "column", gap: 5,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
              }}
            >
              <div style={{ fontSize: 8, color: "#b0b0c4", letterSpacing: 2, fontFamily: mono }}>心の天気</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 18 }}>◌</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e" }}>今日の気分を記録する</span>
              </div>
              <div style={{ fontSize: 10, color: "#4a4a68", lineHeight: 1.5 }}>
                記録を続けると、気分の波と行動パターンの関係が見えてきます
              </div>
              <div style={{ fontSize: 8, color: "#6366F1", fontWeight: 700 }}>
                {innerWeather.ctaLabel ?? "記録する"} →
              </div>
            </Link>
          )}

          {/* Daily Prophecy — link to detail page */}
          {prophecy?.prediction && (
            <Link
              href="/stargazer/prophecy"
              style={{
                flex: 1, padding: "10px 12px", borderRadius: 12,
                background: "rgba(255,255,255,0.5)",
                border: "1px solid rgba(0,0,0,0.04)",
                textDecoration: "none", color: "inherit",
                display: "flex", flexDirection: "column", justifyContent: "center", gap: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 14 }}>🔮</span>
                <span style={{ fontSize: 8, color: "#b0b0c4", letterSpacing: 2, fontFamily: mono }}>TODAY&apos;S PROPHECY</span>
              </div>
              <div style={{ fontSize: 11, color: "#1a1a2e", fontWeight: 600 }}>今日の予測を見る</div>
              <div style={{ fontSize: 8, color: "#6366F1", fontWeight: 600 }}>詳細 →</div>
            </Link>
          )}

          {/* Prophecy empty state for new users */}
          {!prophecy?.prediction && (
            <Link
              href="/stargazer"
              style={{
                flex: 1, padding: "10px 12px", borderRadius: 12,
                background: "rgba(255,255,255,0.4)",
                border: "1px solid rgba(0,0,0,0.03)",
                textDecoration: "none", color: "inherit",
                display: "flex", flexDirection: "column", gap: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 14, opacity: 0.4 }}>🔮</span>
                <span style={{ fontSize: 8, color: "#b0b0c4", letterSpacing: 2, fontFamily: mono }}>PROPHECY</span>
              </div>
              <div style={{ fontSize: 10, color: "#8888a0", lineHeight: 1.5 }}>
                もう少し答えてくれたら、明日のあなたを予測できるようになるよ
              </div>
              <div style={{ fontSize: 8, color: "#6366F1", fontWeight: 600 }}>質問に答える →</div>
            </Link>
          )}
        </div>
      </div>

      {/* ── AI Question (Stargazer×Originクロス) ── */}
      {aiQuestion && (
        <div style={{
          padding: "10px 14px", borderRadius: 10,
          background: "transparent",
          borderLeft: "2px solid rgba(139,92,246,0.2)", marginBottom: 10,
        }}>
          <div style={{ fontSize: 11, color: "#1a1a2e", lineHeight: 1.7, fontWeight: 500 }}>
            {aiQuestion}
          </div>
        </div>
      )}

      {/* ── Temporal Mirror (integrated) ── */}
      {temporalMirror?.canCompare && temporalMirror.delta && temporalMirror.previous && (
        <div style={{ marginTop: 4 }}>
          <TemporalMirrorCard
            delta={temporalMirror.delta}
            currentNarrative={temporalMirror.current.narrativeArc}
            previousNarrative={temporalMirror.previous.narrativeArc}
          />
        </div>
      )}

      {/* Vanishing Insight — collapsible (default closed) */}
      {vanishingInsight && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setViOpen(!viOpen)}
            style={{
              width: "100%",
              textAlign: "left",
              borderRadius: 12,
              background: "rgba(139,92,246,0.04)",
              border: "1px solid rgba(139,92,246,0.1)",
              padding: "10px 12px",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12 }}>✧</span>
                <span style={{ fontSize: 9, color: "#8B5CF6", fontWeight: 700, letterSpacing: 2, fontFamily: mono }}>
                  消える洞察
                </span>
                <span style={{
                  fontSize: 9, color: "#BE185D", fontWeight: 700, fontFamily: mono,
                  background: "rgba(236,72,153,0.08)", padding: "1px 5px", borderRadius: 4,
                }}>
                  {viHoursLeft}h
                </span>
              </div>
              <span style={{
                fontSize: 10, color: "#8888a0",
                transition: "transform 0.2s",
                transform: viOpen ? "rotate(180deg)" : "rotate(0deg)",
              }}>
                ▼
              </span>
            </div>

            {!viOpen && (
              <div style={{
                fontSize: 11, color: "#4a4a68", marginTop: 4,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {vanishingInsight.insight.length > 30
                  ? vanishingInsight.insight.slice(0, 30) + "…"
                  : vanishingInsight.insight}
              </div>
            )}

            <AnimatePresence>
              {viOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  style={{ overflow: "hidden" }}
                >
                  <div style={{
                    fontSize: 12, color: "#1a1a2e", lineHeight: 1.7, fontWeight: 500,
                    marginTop: 8, marginBottom: 8,
                  }}>
                    {vanishingInsight.insight}
                  </div>
                  <Link
                    href="/stargazer"
                    onClick={(e) => e.stopPropagation()}
                    style={{ fontSize: 10, color: "#8B5CF6", fontWeight: 600, textDecoration: "none" }}
                  >
                    観測を深める →
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        </div>
      )}
    </section>
  );
}
