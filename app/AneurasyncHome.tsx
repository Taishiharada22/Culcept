"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { startDrone as startHomeDrone } from "@/lib/ui/proceduralAudio";
import { getTimeOfDayDetail } from "@/lib/shared/timeOfDay";
import { loadMutePreference } from "@/lib/ui/ambientSoundscape";
import { buildImplicitProfile } from "@/lib/stargazer/implicitSignalCapture";
import { useImplicitSignals, readStoredSignals } from "@/hooks/useImplicitSignals";
import { useHomeDerivedState } from "./_home/useHomeDerivedState";
import { useMicroInteractions } from "@/hooks/useMicroInteractions";
import { isValuesOnboardingDone } from "@/components/home/ValuesOnboardingOverlay";
import { useHomeData } from "@/hooks/useHomeData";
import { C, HOME_FLOATING_LAYOUT } from "./_home/constants";
import { buildOrbitItems } from "./_home/orbitDockConfig";
import { deriveAnswerData, deriveWhyData } from "./_home/deriveAnswerData";
import { useAlterChat } from "@/hooks/useAlterChat";

// ─── Core components (needed on first render) ───
import HomeHeader from "./_home/HomeHeader";
import HomeFooter from "./_home/HomeFooter";
import ZoneErrorBoundary from "./_home/ZoneErrorBoundary";
import LoginIntroAnimation from "@/components/home/LoginIntroAnimation";
import BottomNav from "@/components/home/BottomNav";
import OrbitDock from "@/components/home/OrbitDock";
import AskHero from "@/components/home/AskHero";
import AlterFollowup from "@/components/home/AlterFollowup";
import AnswerCard from "@/components/home/AnswerCard";
import InlineInnerWeather from "@/components/home/InlineInnerWeather";
import CompactWhyStrip from "@/components/home/CompactWhyStrip";
import RealityPort from "@/components/home/RealityPort";
import Link from "next/link";
import TalkFab from "./_components/TalkFab";
import HomeCard, { CardLabel, CardTitle, CardBody } from "@/components/ui/HomeCard";

// ─── Overlays ───
const HomeTour = dynamic(() => import("@/components/home/HomeTour"), { ssr: false });
const ValuesOnboardingOverlay = dynamic(() => import("@/components/home/ValuesOnboardingOverlay"), { ssr: false });
const InlineCelebration = dynamic(() => import("@/components/home/InlineCelebration"), { ssr: false });
const PostObservationReveal = dynamic(() => import("@/components/home/PostObservationReveal"), { ssr: false });

import "./home-animations.css";

/* ═══ INLINE: First Observation Card (temporary, 24h) ═══ */
function FirstObservationCard() {
  const [data, setData] = useState<{
    name: string;
    englishName?: string;
    emoji: string;
    tagline: string;
    blindSpot: string | null;
    confidence: number;
  } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("aneurasync_first_archetype");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const createdAt = new Date(parsed.createdAt).getTime();
      if (Date.now() - createdAt > 24 * 60 * 60 * 1000) {
        localStorage.removeItem("aneurasync_first_archetype");
        localStorage.removeItem("aneurasync_first_insight");
        return;
      }
      setData(parsed);
    } catch { /* noop */ }
  }, []);

  if (!data) return null;

  const hoursLeft = Math.max(0, Math.ceil(
    (24 - (Date.now() - new Date(localStorage.getItem("aneurasync_first_archetype") ? JSON.parse(localStorage.getItem("aneurasync_first_archetype")!).createdAt : "").getTime()) / (60 * 60 * 1000))
  ));

  return (
    <section className="px-4 pb-3">
      <HomeCard tier="primary" href="/stargazer">
        <div className="absolute top-3 right-3 text-[9px] text-indigo/50 font-mono tracking-wide">
          {hoursLeft > 0 ? `${hoursLeft}h で消えます` : "まもなく消えます"}
        </div>
        <CardLabel tier="primary">YOUR FIRST OBSERVATION</CardLabel>
        <div className="flex items-center gap-2.5 mt-3 mb-2">
          {data.englishName ? (
            <img
              src={`/samples/figure/${data.englishName.toLowerCase()}.png`}
              alt={data.name}
              className="w-12 h-12 object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <span className="text-[28px]">{data.emoji}</span>
          )}
          <div>
            <CardTitle tier="primary">{data.name}</CardTitle>
            <p className="text-[11px] text-text3 italic mt-0.5">{data.tagline}</p>
          </div>
        </div>
        {data.blindSpot && (
          <div className="mt-2.5 pt-2.5 border-t border-indigo/[0.08]">
            <CardLabel tier="primary">BLIND SPOT</CardLabel>
            <CardBody tier="primary">{data.blindSpot}</CardBody>
          </div>
        )}
        <p className="mt-2.5 text-[11px] text-text4">
          10問の回答から判定したよ。精度は{Math.round(data.confidence * 100)}%。答えるほど正確になるよ
        </p>
      </HomeCard>
    </section>
  );
}


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

  // ── Home Tour trigger ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const done = localStorage.getItem("aneurasync_home_tour_done_v2");
    if (done) {
      if (!isValuesOnboardingDone()) {
        const t = setTimeout(() => setShowValuesOnboarding(true), 800);
        return () => clearTimeout(t);
      }
      return;
    }
    const timer = setTimeout(() => setShowHomeTour(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  const ha = Math.min(scrollY / 150, 1);
  const syncPercent = Math.round((sgData?.confidence ?? 0) * 100);
  const obsCount = sgData?.observationCount ?? 0;

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden z-50 font-sans" style={{ background: "#f8f6f3", color: C.t1 }}>
      {/* ═══ HEADER ═══ */}
      <HomeHeader
        scrollAlpha={ha}
        onScrollTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
      />

      {/* ═══ LOGIN INTRO ═══ */}
      <LoginIntroAnimation onComplete={() => setIntroComplete(true)} />

      {/* ═══ SCROLLABLE CONTENT ═══ */}
      <div ref={scrollRef} className="h-screen overflow-y-auto relative z-1">
        <div style={{ background: atmosphere.bgGradient, color: C.t1, transition: "background 2s ease", paddingTop: 56 }}>

          {/* ─── 1. ORBIT DOCK — 上部クイック導線 ─── */}
          <ZoneErrorBoundary zoneName="orbit">
            <div data-tour="orbit-dock">
              <OrbitDock items={orbitItems} />
            </div>
          </ZoneErrorBoundary>

          {/* ─── 2. GREETING + SYNC — 挨拶 ─── */}
          <section className="px-4 pt-1 pb-1">
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold text-text1">{greeting}</h2>
              {syncPercent > 0 && (
                <span
                  className="text-[9px] font-mono px-2 py-0.5 rounded-full"
                  style={{
                    background: "rgba(99,102,241,0.08)",
                    color: "#6366F1",
                    border: "1px solid rgba(99,102,241,0.12)",
                  }}
                >
                  Sync {syncPercent}%
                </span>
              )}
            </div>
          </section>

          {/* ─── 3. ALTER の一言 — 観測ベースの状態表示 ─── */}
          <section className="px-4 pb-2" data-tour="alter-oneliner">
            <p className="text-[13px] leading-relaxed" style={{ color: "#4338CA", opacity: 0.7 }}>
              {alterOneLiner}
            </p>
          </section>

          {/* ─── 4. INNER WEATHER — 1行圧縮の状態入力 ─── */}
          <InlineInnerWeather innerWeather={innerWeather} />

          {/* ─── 5. COMPACT WHY — なぜこの答えか（1行サマリー + 展開） ─── */}
          <ZoneErrorBoundary zoneName="why">
            <CompactWhyStrip
              sources={whyData.sources}
              shiftedAxis={whyData.shiftedAxis}
              trendSummary={whyData.trendSummary}
              observationCount={whyData.observationCount}
              innerWeatherRecorded={!!innerWeather?.recorded}
            />
          </ZoneErrorBoundary>

          {/* ─── 5.5. ALTER FOLLOWUP — 前回の提案フォローアップ ─── */}
          <AlterFollowup />

          {/* ─── 6. ASK HERO — ★★★ Alter 本体（格別な中核） ─── */}
          <ZoneErrorBoundary zoneName="ask">
            <div data-tour="ask-hero">
              <AskHero
                syncPercent={syncPercent}
                greeting={greeting}
                observationCount={sgData?.observationCount ?? 0}
                alterMessages={alterChat.messages}
                alterLoading={alterChat.loading}
                alterError={alterChat.error}
                alterRoundCount={alterChat.roundCount}
                alterLimitReached={alterChat.limitReached}
                alterRemainingRounds={alterChat.remainingRounds}
                alterSessionId={alterChat.sessionId}
                onAsk={alterChat.sendMessage}
                alterActionShape={alterChat.lastActionShape}
                alterDomain={alterChat.lastDomain}
                alterIsEmotional={alterChat.lastIsEmotional}
                hideGreeting
                hideContextWhisper
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

          {/* ─── First Observation Card (24h temporary) ─── */}
          <FirstObservationCard />

          {/* ══════ SCROLL 後 ══════ */}

          {/* ─── 7. ALTER の視点 — 控えめな補助情報 ─── */}
          {!alterChat.isActive && (
            <ZoneErrorBoundary zoneName="answer">
              <section className="px-4 pt-3 pb-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px]" style={{ color: "#6366F1", opacity: 0.6 }}>✦</span>
                  <span className="text-[9px] font-mono tracking-wider" style={{ color: "#6366F1", opacity: 0.5 }}>
                    ALTER の視点
                  </span>
                  <div className="flex-1 h-px bg-black/[0.08]" />
                </div>
              </section>
              <AnswerCard
                proposal={answerData.proposal}
                confidence={answerData.confidence}
                alternative={answerData.alternative}
                caution={answerData.caution}
                sources={answerData.sources}
                observationCount={answerData.observationCount}
              />
            </ZoneErrorBoundary>
          )}

          {/* ─── 8. RENDEZVOUS — ★ 主役：観測が出会いになる ─── */}
          <section className="px-4 pt-4 pb-1" data-tour="rendezvous">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px]" style={{ color: "#A855F7", opacity: 0.6 }}>∞</span>
              <span className="text-[9px] font-mono tracking-wider" style={{ color: "#A855F7", opacity: 0.5 }}>
                つながる
              </span>
              <div className="flex-1 h-px bg-black/[0.08]" />
            </div>
          </section>
          <ZoneErrorBoundary zoneName="reality">
            <RealityPort
              observationCount={obsCount}
              syncPercent={syncPercent}
            />
          </ZoneErrorBoundary>

          {/* ─── 9. DEEP IDENTITY — Genome / Card / Presence ─── */}
          <section className="px-4 pb-4" data-tour="deep-identity">
            <div className="flex items-center gap-2 mb-2.5 mt-1">
              <span className="text-[9px] font-mono tracking-wider" style={{ color: "#8B5CF6", opacity: 0.5 }}>DEEP IDENTITY</span>
              <div className="flex-1 h-px bg-black/[0.08]" />
              <span className="text-[9px]" style={{ color: "#8B5CF6", opacity: 0.4 }}>深層プロファイル</span>
            </div>

            {/* Genome + Card + Presence — 3列 */}
            <div className="flex gap-2 mb-2.5">
              {/* Genome */}
              <Link
                href="/aneurasync/genome"
                className="flex-1 rounded-xl p-3 transition-all active:scale-[0.97]"
                style={{
                  background: "linear-gradient(150deg, rgba(139,92,246,0.05), rgba(255,255,255,0.85))",
                  border: "1px solid rgba(139,92,246,0.1)",
                }}
              >
                <div className="flex flex-col items-center gap-1.5 text-center">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: "rgba(139,92,246,0.08)" }}
                  >
                    <span className="text-base">🧬</span>
                  </div>
                  <span className="text-[10px] font-bold text-text1">Genome</span>
                  <span className="text-[8px] text-text3 leading-tight">性格・価値観</span>
                </div>
              </Link>

              {/* Card (archetype badge) */}
              <Link
                href="/genome-card"
                className="flex-1 rounded-xl p-3 transition-all active:scale-[0.97]"
                style={{
                  background: "linear-gradient(150deg, rgba(139,92,246,0.05), rgba(255,255,255,0.85))",
                  border: "1px solid rgba(139,92,246,0.1)",
                }}
              >
                <div className="flex flex-col items-center gap-1.5 text-center">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: "rgba(139,92,246,0.08)" }}
                  >
                    <span className="text-base">{sgData?.emoji ?? "◇"}</span>
                  </div>
                  <span className="text-[10px] font-bold text-text1">Card</span>
                  <span className="text-[8px] text-text3 leading-tight">{sgData?.archetype ? sgData.archetype.slice(0, 5) : "カード交換"}</span>
                </div>
              </Link>

              {/* Presence */}
              <Link
                href="/sns/profile"
                className="flex-1 rounded-xl p-3 transition-all active:scale-[0.97]"
                style={{
                  background: "linear-gradient(150deg, rgba(59,130,246,0.05), rgba(255,255,255,0.85))",
                  border: "1px solid rgba(59,130,246,0.1)",
                }}
              >
                <div className="flex flex-col items-center gap-1.5 text-center">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: "rgba(59,130,246,0.08)" }}
                  >
                    <span className="text-base">🪞</span>
                  </div>
                  <span className="text-[10px] font-bold text-text1">Presence</span>
                  <span className="text-[8px] text-text3 leading-tight">人物ミラー</span>
                </div>
              </Link>
            </div>

            {/* Genome completeness bar */}
            {genomeCompleteness > 0 && genomeCompleteness < 100 && (
              <div className="flex items-center gap-2 px-1">
                <span className="text-[8px] text-text4 flex-shrink-0">解析 {genomeCompleteness}%</span>
                <div className="flex-1 h-[2px] rounded-full overflow-hidden" style={{ background: "rgba(139,92,246,0.06)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${genomeCompleteness}%`,
                      background: "linear-gradient(90deg, rgba(139,92,246,0.4), rgba(139,92,246,0.15))",
                    }}
                  />
                </div>
              </div>
            )}
          </section>

          {/* ─── FOOTER ─── */}
          <div className="pb-[72px]" />
          <HomeFooter />
        </div>

        {/* Talk FAB (scroll 下部でも accessible) */}
        <TalkFab
          bottom={HOME_FLOATING_LAYOUT.talkFabBottom}
          mobileBottom={HOME_FLOATING_LAYOUT.talkFabMobileBottom}
        />
      </div>

      {/* ═══ BOTTOM NAV ═══ */}
      <BottomNav />

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
