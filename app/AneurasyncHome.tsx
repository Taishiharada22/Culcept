"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { startDrone as startHomeDrone } from "@/lib/ui/proceduralAudio";
import { getTimeOfDayDetail } from "@/lib/shared/timeOfDay";
import { loadMutePreference } from "@/lib/ui/ambientSoundscape";
import { buildImplicitProfile } from "@/lib/stargazer/implicitSignalCapture";
import { useImplicitSignals, readStoredSignals } from "@/hooks/useImplicitSignals";
import { useHomeDerivedState } from "./_home/useHomeDerivedState";
import { useMicroInteractions } from "@/hooks/useMicroInteractions";
import { isValuesOnboardingDone } from "@/components/home/ValuesOnboardingOverlay";
import { hydrateTourStates, isTourSeen } from "@/lib/tour/tourState";
import { useHomeData } from "@/hooks/useHomeData";
import { C } from "./_home/constants";
import { buildOrbitItems } from "./_home/orbitDockConfig";
import { deriveAnswerData, deriveWhyData } from "./_home/deriveAnswerData";
import { useAlterChat } from "@/hooks/useAlterChat";
import { updatePredictionVerification, loadPredictions, calculateAccuracy } from "@/lib/stargazer/predictionEngine";
import { updateLearningFromFeedback } from "@/lib/stargazer/predictionLearningLoop";
import { safeSetItem, ensureStorageSpace } from "@/lib/stargazer/localStorageHelper";

// ─── Core components (needed on first render) ───
import HomeHeader from "./_home/HomeHeader";
import ZoneErrorBoundary from "./_home/ZoneErrorBoundary";
import LoginIntroAnimation from "@/components/home/LoginIntroAnimation";
import AskHero from "@/components/home/AskHero";
import AlterFollowup from "@/components/home/AlterFollowup";
import AnswerCard from "@/components/home/AnswerCard";
import InlineInnerWeather from "@/components/home/InlineInnerWeather";
import HomeQuickAccess from "@/components/home/HomeQuickAccess";

// ─── Overlays ───
const HomeTour = dynamic(() => import("@/components/home/HomeTour"), { ssr: false });
const ValuesOnboardingOverlay = dynamic(() => import("@/components/home/ValuesOnboardingOverlay"), { ssr: false });
const InlineCelebration = dynamic(() => import("@/components/home/InlineCelebration"), { ssr: false });
const PostObservationReveal = dynamic(() => import("@/components/home/PostObservationReveal"), { ssr: false });

import "./home-animations.css";


/* ═══ MAIN COMPONENT ═══ */
export default function AneurasyncHome() {
  const [introComplete, setIntroComplete] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  useImplicitSignals(scrollRef);
  const { trigger: triggerMicro } = useMicroInteractions();

  const [greeting, setGreeting] = useState(() => {
    const tod = getTimeOfDayDetail();
    const greetingMap: Record<string, string> = {
      late_night: "深夜の観測",
      morning: "おはよう",
      afternoon: "こんにちは",
      late_afternoon: "こんにちは",
      evening: "こんばんは",
    };
    return greetingMap[tod] ?? "こんにちは";
  });

  // ── ユーザー名を取得して挨拶に反映 ──
  const nameAppended = useRef(false);
  useEffect(() => {
    if (nameAppended.current) return;
    (async () => {
      try {
        const sb = (await import("@/lib/supabase/client")).supabaseBrowser();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return;
        const meta = user.user_metadata ?? {};
        const name = meta.display_name || meta.name || meta.full_name || user.email?.split("@")[0];
        if (name && !nameAppended.current) {
          nameAppended.current = true;
          setGreeting((prev) => `${prev}、${name}さん`);
        }
      } catch {}
    })();
  }, []);

  // ── localStorage 容量チェック（初回のみ） ──
  useEffect(() => { try { ensureStorageSpace(); } catch {} }, []);

  // ── Data fetching ──
  const homeData = useHomeData();
  const {
    identityLive, sgData, innerWeather, prophecy, blindSpot,
    ptData, calendarFeed,
    streakDays, atmosphere, homeState, implicitProfile,
  } = homeData;

  // ── Derived state ──
  const { temporalMirror, convergentInsight } = useHomeDerivedState(homeData);

  // ── Instrument tracking ──
  const [instrumentUsedToday, setInstrumentUsedToday] = useState({ stargazer: false, origin: false, phenotype: false, calendar: false, style: false });
  useEffect(() => {
    import("@/lib/instrumentStreak").then(({ readInstrumentUsage }) => {
      setInstrumentUsedToday(readInstrumentUsage());
    });
  }, []);

  // ── OrbitDock items ──
  const orbitItems = useMemo(() => buildOrbitItems({
    sgData, identityLive, ptData, instrumentUsedToday, innerWeather, calendarFeed,
  }), [sgData, identityLive, ptData, instrumentUsedToday, innerWeather, calendarFeed]);

  // ── Alter context for Home (pass personality-relevant data to Alter API) ──
  const homeAlterContext = useMemo(() => ({
    insight: convergentInsight?.todayInsight?.unifiedInsight ?? null,
    temporalDelta: temporalMirror?.delta?.deltaNarrative ?? null,
    blindSpot: blindSpot?.message ?? null,
    prophecy: prophecy?.prediction ?? null,
    prophecyAccuracy: (prophecy as any)?.accuracy ?? null,
    weather: innerWeather ? {
      emoji: innerWeather.emoji,
      label: innerWeather.label,
      message: innerWeather.message,
    } : null,
    observationCount: sgData?.observationCount ?? 0,
    confidence: sgData?.confidence ?? 0,
    archetype: sgData?.archetype ?? null,
  }), [convergentInsight, temporalMirror, blindSpot, prophecy, innerWeather, sgData]);

  // ── Alter chat (Home embedded) ──
  const alterChat = useAlterChat({ homeContext: homeAlterContext });

  // ── Answer/Why data ──
  const answerData = useMemo(() => deriveAnswerData({
    convergentInsight, temporalMirror, blindSpot, prophecy, innerWeather, sgData,
  }), [convergentInsight, temporalMirror, blindSpot, prophecy, innerWeather, sgData]);

  const whyData = useMemo(() => deriveWhyData({
    convergentInsight, temporalMirror, blindSpot, prophecy, innerWeather, sgData,
  }), [convergentInsight, temporalMirror, blindSpot, prophecy, innerWeather, sgData]);

  // ── ALTER フィードバック状態 ──
  const [alterFeedback, setAlterFeedback] = useState<"correct" | "partially" | "wrong" | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const raw = localStorage.getItem("alter_proposal_feedback");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.date === today ? parsed.feedback : null;
    } catch { return null; }
  });

  const handleAlterFeedback = (fb: "correct" | "partially" | "wrong") => {
    const today = new Date().toISOString().slice(0, 10);
    safeSetItem("alter_proposal_feedback", JSON.stringify({ date: today, feedback: fb }));
    setAlterFeedback(fb);
    // predictionEngine にも記録（todayPrediction があれば）
    try {
      const predictions = loadPredictions(5);
      const todayPred = predictions.find(p => !p.verified);
      if (todayPred) {
        updatePredictionVerification(todayPred.id, fb);
        updateLearningFromFeedback(todayPred.id, fb);
      }
    } catch { /* silent */ }
  };

  // ── Alter の一言（観測ベースの状態表示） ──
  const alterOneLiner = useMemo(() => {
    const obs = sgData?.observationCount ?? 0;
    const archetypeName = sgData?.archetype;
    // Inner weather + observation context → 判断への影響を示す
    if (innerWeather?.recorded && innerWeather.label) {
      const weatherShift: Record<string, string> = {
        穏やか: "平常モードで判断中",
        エネルギッシュ: "攻めの判断モードに切り替え中",
        モヤモヤ: "慎重モードにシフト中",
        低空飛行: "負荷を下げた判断モード",
        イライラ: "冷却モードで判断中",
      };
      const shift = weatherShift[innerWeather.label] ?? `${innerWeather.label}を反映中`;
      return `${innerWeather.emoji ?? ""} ${shift}。${obs > 0 ? `${obs}回の観測ベース` : ""}`;
    }
    // Blind spot — most compelling when available
    if (blindSpot?.message) return blindSpot.message;
    // Constellation-based
    if (obs >= 50 && archetypeName) return `${archetypeName}型の判断特性で応答中`;
    if (obs > 0) return `${obs}回の観測データをもとに、もうひとりのあなたが答えます`;
    return "観測データを踏まえて、もうひとりのあなた（Alter）が答えます";
  }, [sgData, innerWeather, blindSpot]);

  // ── Genome completeness ──
  const genomeCompleteness = useMemo(() => Math.round(
    ((sgData?.observationCount ?? 0) > 0 ? 20 : 0) +
    ((ptData?.pct ?? 0) > 0 ? 20 : 0) +
    (((identityLive as any)?.origin?.pct ?? 0) > 0 ? 20 : 0) +
    (((identityLive as any)?.style?.pct ?? 0) > 0 ? 20 : 0) +
    (((identityLive as any)?.presence?.pct ?? 0) > 0 ? 20 : 0)
  ), [sgData, ptData, identityLive]);

  // ── Genome Card data (radar) ──
  const [gcData, setGcData] = useState<{
    archetypeLabel?: string | null;
    archetypeEnglishName?: string | null;
    archetypeCode?: string | null;
    archetypeEmoji?: string | null;
    shadowEnglishName?: string | null;
    shadowEmoji?: string | null;
    figureSrc?: string | null;
    coreValue?: string | null;
    radarAxes?: { analytical: number; cautious: number; social: number; expressive: number; independent: number } | null;
  } | null>(null);
  useEffect(() => {
    fetch("/api/genome-card", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d?.ok || !d.card) return;
        const c = d.card;
        setGcData({
          archetypeLabel: c.archetypeLabel,
          archetypeEnglishName: c.archetypeEnglishName ?? c.cardFront?.archetypeEnglishName ?? null,
          archetypeCode: c.archetypeCode ?? null,
          archetypeEmoji: c.archetypeEmoji ?? null,
          shadowEnglishName: c.shadowEnglishName ?? null,
          shadowEmoji: c.shadowEmoji ?? null,
          figureSrc: c.figureSrc ?? null,
          coreValue: c.cardFront?.coreValue ?? null,
          radarAxes: c.cardBack?.radarAxes ?? null,
        });
      })
      .catch(() => setGcData(null));
  }, []);

  // ── Tour / Onboarding ──
  const [showHomeTour, setShowHomeTour] = useState(false);
  const [showValuesOnboarding, setShowValuesOnboarding] = useState(false);

  // ── Celebrations ──
  const [celebration, setCelebration] = useState<"weather" | "observation" | null>(null);
  const [showPostReveal, setShowPostReveal] = useState(false);
  const prevObsCount = useRef(sgData?.observationCount ?? 0);
  const prevConfidence = useRef(sgData?.confidence ?? 0);

  useEffect(() => {
    const onWeather = () => setCelebration("weather");
    window.addEventListener("aneurasync:inner-weather-updated", onWeather);
    return () => window.removeEventListener("aneurasync:inner-weather-updated", onWeather);
  }, []);

  useEffect(() => {
    const curr = sgData?.observationCount ?? 0;
    if (curr > prevObsCount.current && prevObsCount.current > 0) {
      setCelebration("observation");
      triggerMicro("answer_submitted");
      setTimeout(() => setShowPostReveal(true), 4200);
    }
    prevObsCount.current = curr;
  }, [sgData?.observationCount]);

  // ── Sound ──
  const [isSoundMuted] = useState(() => typeof window !== "undefined" ? loadMutePreference() : true);

  useEffect(() => {
    if (!innerWeather?.weatherType || isSoundMuted) return;
    const weatherToDrone: Record<string, "warm" | "soft" | "deep"> = {
      sunny: "warm", cloudy: "soft", rainy: "deep", stormy: "deep",
      foggy: "soft", windy: "soft", snow: "soft", aurora: "warm",
    };
    const droneType = weatherToDrone[innerWeather.weatherType] ?? "warm";
    const handle = startHomeDrone(droneType, 3000);
    return () => { handle?.stop(2000); };
  }, [innerWeather?.weatherType, isSoundMuted]);

  // ── Implicit signals ──
  useEffect(() => {
    if (!sgData) return;
    try {
      const stored = readStoredSignals();
      const signals = stored ?? {
        scrollVelocity: null, positionBias: 0, sessionRhythm: 0,
        insightDwellTimeMs: 0, rereadCount: 0, deviceTilt: null,
      };
      const profile = buildImplicitProfile(signals);
      if (profile.signalQuality > 0.3) {
        console.log("[Aneurasync] Implicit signals:", profile.impliedTraits.length, "traits detected, quality:", profile.signalQuality.toFixed(2));
      }
    } catch {}
  }, [sgData]);

  // ── Scroll tracking ──
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const fn = () => setScrollY(el.scrollTop);
    el.addEventListener("scroll", fn, { passive: true });
    return () => el.removeEventListener("scroll", fn);
  }, []);

  // ── Home Tour trigger (DB hydrate → 判定) ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    hydrateTourStates().then(() => {
      if (cancelled) return;
      const homeDone = isTourSeen("home_main");
      const valuesDone = isTourSeen("home_values");
      console.log("[tour] hydrated — home_main:", homeDone, "home_values:", valuesDone);
      if (homeDone) {
        if (!valuesDone) {
          setTimeout(() => { if (!cancelled) setShowValuesOnboarding(true); }, 800);
        }
        return;
      }
      setTimeout(() => { if (!cancelled) setShowHomeTour(true); }, 1500);
    });
    return () => { cancelled = true; };
  }, []);

  const ha = Math.min(scrollY / 150, 1);
  const syncPercent = Math.round((sgData?.confidence ?? 0) * 100);
  const obsCount = sgData?.observationCount ?? 0;

  // ── Composer state（AskHeroから分離、fixed bottom に配置） ──
  const [composerQuery, setComposerQuery] = useState("");
  const [composerFocused, setComposerFocused] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Hydration safety for composer chips
  const [composerMounted, setComposerMounted] = useState(false);
  useEffect(() => { setComposerMounted(true); }, []);

  const composerHasConversation = composerMounted && alterChat.messages.length > 0;
  const composerIsLimitReached = composerMounted && alterChat.limitReached;

  const handleComposerSubmit = (text?: string) => {
    const q = (text ?? composerQuery).trim();
    if (!q || alterChat.loading || composerIsLimitReached) return;
    alterChat.sendMessage(q);
    setComposerQuery("");
    if (composerRef.current) {
      composerRef.current.style.height = "auto";
    }
  };

  const handleComposerChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setComposerQuery(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  };

  // ── Alter 導入メッセージ（時間帯別、人間っぽく） ──
  const alterGreeting = useMemo(() => {
    const hour = new Date().getHours();
    const name = greeting.split("、")[1]?.replace("さん", "") || "";
    const nameStr = name ? `、${name}` : "";
    const obs = sgData?.observationCount ?? 0;
    const relationLine = obs >= 80
      ? `${obs}回の対話から、${name || "あなた"}の考え方が見えてきた。`
      : obs >= 30
        ? `${name || "あなた"}のこと、だいぶ分かってきた。`
        : obs > 0
          ? `${name || "あなた"}のこと、もっと聞かせて。`
          : "何でも聞いて。一緒に考えるよ。";
    if (hour >= 5 && hour < 12) return { line1: `おはよう${nameStr}。`, line2: relationLine };
    if (hour >= 12 && hour < 17) return { line1: `こんにちは${nameStr}。`, line2: relationLine };
    if (hour >= 17 && hour < 23) return { line1: `お疲れさま${nameStr}。`, line2: relationLine };
    return { line1: `まだ起きてるんだ${nameStr}。`, line2: relationLine };
  }, [greeting, sgData?.observationCount]);

  // ── 導入メッセージのタイプライター（1日1回のみ） ──
  const [greetTyped, setGreetTyped] = useState(false);
  const [greetDisplay, setGreetDisplay] = useState("");
  const [greetCharIdx, setGreetCharIdx] = useState(0);
  const greetFullText = `${alterGreeting.line1}\n${alterGreeting.line2}`;

  useEffect(() => {
    if (composerHasConversation) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const stored = sessionStorage.getItem("alter_greet_typed");
      if (stored === today) { setGreetDisplay(greetFullText); setGreetTyped(true); return; }
    } catch {}
    if (greetCharIdx <= greetFullText.length) {
      const t = setTimeout(() => {
        setGreetDisplay(greetFullText.slice(0, greetCharIdx));
        setGreetCharIdx((c) => c + 1);
      }, 50 + Math.random() * 30);
      return () => clearTimeout(t);
    }
    setGreetTyped(true);
    try { sessionStorage.setItem("alter_greet_typed", new Date().toISOString().slice(0, 10)); } catch {}
  }, [greetCharIdx, greetFullText, composerHasConversation]);

  // ── Suggestion chips（4個、コンパクトラベル） ──
  const SUGGESTION_CHIPS = useMemo(() => [
    { label: "今日どう動く？", icon: "⚡" },
    { label: "なんでこうなる？", icon: "🔍" },
    { label: "仕事の進め方", icon: "💼" },
    { label: "今日の服", icon: "👔" },
  ], []);

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden z-50 font-sans flex flex-col" style={{ background: "#f8f6f3", color: C.t1 }}>
      {/* ═══ HEADER ═══ */}
      <HomeHeader
        scrollAlpha={ha}
        onScrollTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
      />

      {/* ═══ LOGIN INTRO ═══ */}
      <LoginIntroAnimation onComplete={() => setIntroComplete(true)} />

      {/* ═══ SCROLL AREA — 1枚の会話キャンバス ═══ */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto" style={{ position: "relative", zIndex: 1 }}>
        <div style={{ background: atmosphere.bgGradient, color: C.t1, transition: "background 2s ease", paddingTop: 56 }}>

          {/* ── 上部バー: ALTER + Sync + 内面天気 ── */}
          <div className="px-5 pt-2 pb-1 flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div
                className="w-[3px] h-5 rounded-full"
                style={{ background: "linear-gradient(180deg, #6366F1, #8B5CF6)" }}
              />
              <span
                className="text-[14px] font-black tracking-[0.12em]"
                style={{ color: "#4338CA" }}
              >
                ALTER
              </span>
            </div>
            {syncPercent > 0 && (
              <span
                className="text-[9px] font-mono px-1.5 py-0.5 rounded-full"
                style={{
                  background: "rgba(99,102,241,0.08)",
                  color: "#6366F1",
                  border: "1px solid rgba(99,102,241,0.12)",
                }}
              >
                Sync {syncPercent}%
              </span>
            )}
            <div className="ml-auto">
              <InlineInnerWeather innerWeather={innerWeather} compact />
            </div>
          </div>

          {/* ── 文脈レール: 今日の一手（compact） ── */}
          <ZoneErrorBoundary zoneName="answer">
            <AlterFollowup />
            <AnswerCard
              proposal={answerData.proposal}
              confidence={answerData.confidence}
              alternative={answerData.alternative}
              caution={answerData.caution}
              sources={answerData.sources}
              observationCount={answerData.observationCount}
              onFeedback={handleAlterFeedback}
              feedbackGiven={alterFeedback}
              compact
            />
          </ZoneErrorBoundary>

          {/* ═══ 中央導入メッセージ（未会話時のみ） ═══ */}
          {!composerHasConversation && (
            <div className="flex flex-col items-center justify-center px-8 pt-12 pb-4">
              <p
                className="text-[16px] font-semibold text-text1 leading-relaxed text-center whitespace-pre-line"
                style={{ minHeight: 48 }}
              >
                {greetDisplay}
                {!greetTyped && (
                  <span
                    className="inline-block w-[2px] h-[16px] ml-[1px] align-middle"
                    style={{
                      background: "#6366F1",
                      animation: "alter-cursor-blink 1s step-end infinite",
                    }}
                  />
                )}
              </p>
            </div>
          )}

          {/* ═══ 会話トランスクリプト ═══ */}
          <ZoneErrorBoundary zoneName="ask">
            <div data-tour="ask-hero">
              <AskHero
                observationCount={sgData?.observationCount ?? 0}
                alterMessages={alterChat.messages}
                alterLoading={alterChat.loading}
                alterError={alterChat.error}
                alterRoundCount={alterChat.roundCount}
                alterLimitReached={alterChat.limitReached}
                alterRemainingRounds={alterChat.remainingRounds}
                alterSessionId={alterChat.sessionId}
                alterActionShape={alterChat.lastActionShape}
                alterDomain={alterChat.lastDomain}
                alterIsEmotional={alterChat.lastIsEmotional}
                alterResponseId={alterChat.lastResponseId}
                alterFeedbackMeta={alterChat.lastFeedbackMeta}
                composerFocused={composerFocused}
                scrollRef={scrollRef}
                nudge={{
                  stargazerDoneToday: instrumentUsedToday.stargazer,
                  innerWeatherRecorded: !!innerWeather?.recorded,
                  originTodoDone: instrumentUsedToday.origin,
                  calendarCheckedToday: instrumentUsedToday.calendar,
                  originJournalDone: instrumentUsedToday.origin,
                }}
              />
            </div>
          </ZoneErrorBoundary>

          {/* ─── BOTTOM SPACER ─── */}
          <div style={{ height: 200 }} />
        </div>
      </div>

      {/* ══════ FIXED BOTTOM: chips → composer → QuickAccess ══════ */}
      <div className="flex-shrink-0" style={{ position: "relative", zIndex: 60 }}>
        {/* ── Suggestion chips（コンパクト、1行） ── */}
        <div
          className="px-3 pb-1.5 flex gap-1.5 transition-all duration-200"
          style={{
            opacity: (composerHasConversation || composerFocused) ? 0 : 1,
            maxHeight: (composerHasConversation || composerFocused) ? 0 : 36,
            overflow: "hidden",
            pointerEvents: (composerHasConversation || composerFocused) ? "none" : "auto",
          }}
        >
          {SUGGESTION_CHIPS.map((chip) => (
            <button
              key={chip.label}
              onClick={() => handleComposerSubmit(chip.label)}
              className="flex items-center gap-0.5 px-2 py-1 rounded-full text-[10px] font-medium transition-all active:scale-95 whitespace-nowrap"
              style={{
                background: "rgba(99,102,241,0.06)",
                border: "1px solid rgba(99,102,241,0.14)",
                color: "#4338CA",
              }}
            >
              <span className="text-[10px]">{chip.icon}</span>
              {chip.label}
            </button>
          ))}
        </div>

        {/* ── Composer ── */}
        <div
          className="flex items-end gap-3 mx-3 mb-1.5 px-4 py-3 rounded-xl transition-all duration-200"
          style={{
            background: "rgba(255,255,255,0.7)",
            border: composerFocused
              ? "1.5px solid rgba(99,102,241,0.4)"
              : "1.5px solid rgba(99,102,241,0.18)",
            boxShadow: composerFocused
              ? "0 4px 16px rgba(99,102,241,0.12)"
              : "0 1px 4px rgba(99,102,241,0.06)",
          }}
        >
          <span
            className="text-xl flex-shrink-0 transition-opacity duration-200"
            style={{ color: "#6366F1", opacity: composerFocused ? 0.9 : 0.5 }}
          >
            ✦
          </span>
          <div className="flex-1 relative min-w-0">
            <textarea
              ref={composerRef}
              rows={1}
              value={composerQuery}
              onChange={handleComposerChange}
              onFocus={() => setComposerFocused(true)}
              onBlur={() => setTimeout(() => setComposerFocused(false), 200)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleComposerSubmit();
                }
              }}
              placeholder="Alterに話しかける…"
              aria-label="Alterに質問する"
              className="w-full bg-transparent text-text1 placeholder:text-text4 outline-none text-[15px] resize-none leading-relaxed"
              style={{ maxHeight: 96 }}
              disabled={alterChat.loading || composerIsLimitReached}
            />
          </div>
          <AnimatePresence>
            {composerQuery.trim() && !alterChat.loading && (
              <motion.button
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                onClick={() => handleComposerSubmit()}
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs"
                style={{ background: "linear-gradient(135deg, #6366F1, #8B5CF6)" }}
              >
                →
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* ── QuickAccess ── */}
        <HomeQuickAccess />
      </div>

      {/* ═══ OVERLAYS ═══ */}
      {celebration && (
        <InlineCelebration
          type={celebration}
          streakDays={streakDays}
          onDismiss={() => setCelebration(null)}
        />
      )}
      {showPostReveal && (
        <PostObservationReveal
          syncDelta={Math.round(((sgData?.confidence ?? 0) - prevConfidence.current) * 100)}
          discoveryText={blindSpot?.message ?? convergentInsight?.todayInsight?.unifiedInsight}
          onDismiss={() => {
            setShowPostReveal(false);
            prevConfidence.current = sgData?.confidence ?? 0;
          }}
        />
      )}
      <HomeTour
        active={showHomeTour}
        onComplete={() => {
          setShowHomeTour(false);
          if (!isValuesOnboardingDone()) {
            setTimeout(() => setShowValuesOnboarding(true), 600);
          }
        }}
      />
      <ValuesOnboardingOverlay
        active={showValuesOnboarding}
        onComplete={() => setShowValuesOnboarding(false)}
      />
    </div>
  );
}
