"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { startDrone as startHomeDrone } from "@/lib/ui/proceduralAudio";
import { getTimeOfDayDetail } from "@/lib/shared/timeOfDay";
import { loadMutePreference } from "@/lib/ui/ambientSoundscape";
import { buildImplicitProfile } from "@/lib/stargazer/implicitSignalCapture";
import { useImplicitSignals, readStoredSignals } from "@/hooks/useImplicitSignals";
import { useHomeDerivedState } from "./_home/useHomeDerivedState";
import { useMicroInteractions } from "@/hooks/useMicroInteractions";
import { hydrateTourStates, isTourSeen } from "@/lib/tour/tourState";
import { useHomeData } from "@/hooks/useHomeData";
import { C } from "./_home/constants";
import { buildOrbitItems } from "./_home/orbitDockConfig";
import { deriveAnswerData, deriveWhyData } from "./_home/deriveAnswerData";
import { useAlterChat } from "@/hooks/useAlterChat";
import { updatePredictionVerification, loadPredictions, calculateAccuracy } from "@/lib/stargazer/predictionEngine";
import { updateLearningFromFeedback } from "@/lib/stargazer/predictionLearningLoop";
import { safeSetItem, ensureStorageSpace } from "@/lib/stargazer/localStorageHelper";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useIsAnonymous } from "@/hooks/useIsAnonymous";

// ─── Core components (needed on first render) ───
import HomeHeader from "./_home/HomeHeader";
import ZoneErrorBoundary from "./_home/ZoneErrorBoundary";
import LoginIntroAnimation from "@/components/home/LoginIntroAnimation";
import AskHero from "@/components/home/AskHero";
import LocationOptInBanner from "@/components/alter-morning/LocationOptInBanner";
import AneurasyncLogo from "@/components/ui/AneurasyncLogo";
import type { AlterInsightCard } from "@/lib/stargazer/alterInsightCardBuilder";
import AnswerCard from "@/components/home/AnswerCard";
import InlineInnerWeather from "@/components/home/InlineInnerWeather";
import ContextReel from "@/components/home/ContextReel";
import HomeQuickAccess from "@/components/home/HomeQuickAccess";
import DailyFlowChip from "@/components/home/DailyFlowChip";
import OutfitCalendarEntry from "@/components/home/morning/OutfitCalendarEntry";
import PlanOutfitViewer from "@/components/home/morning/PlanOutfitViewer";
import TodayPlanBadge from "@/components/home/morning/TodayPlanBadge";
import RendezvousQuickStatus from "@/components/rendezvous/RendezvousQuickStatus";

// ─── Overlays ───
const HomeTour = dynamic(() => import("@/components/home/HomeTour"), { ssr: false });
const InlineCelebration = dynamic(() => import("@/components/home/InlineCelebration"), { ssr: false });
const PostObservationReveal = dynamic(() => import("@/components/home/PostObservationReveal"), { ssr: false });

import "./home-animations.css";


/* ═══ MAIN COMPONENT ═══ */
interface AneurasyncHomeProps {
  /**
   * W3-PR-13 M3: visualFlow flag gate（server-side eval 済み boolean）。
   * page.tsx (server) で ALTER_MORNING_FLAGS.visualFlow(user.id) を評価した値。
   * false の時は MorningMapView の dynamic import 自体が fire しない。
   */
  visualFlowEnabled?: boolean;
}

export default function AneurasyncHome({
  visualFlowEnabled = false,
}: AneurasyncHomeProps = {}) {
  const [introComplete, setIntroComplete] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  useImplicitSignals(scrollRef);
  const { trigger: triggerMicro } = useMicroInteractions();
  const isMobile = useIsMobile();
  const isAnonymousResult = useIsAnonymous();
  const isAnonymous = isAnonymousResult === true;

  // 匿名ユーザーのラリー上限: 3回
  const ANON_RALLY_LIMIT = 3;

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
      } catch { }
    })();
  }, []);

  // ── localStorage 容量チェック（初回のみ） ──
  useEffect(() => { try { ensureStorageSpace(); } catch { } }, []);

  // ── Data fetching ──
  const homeData = useHomeData();
  const {
    identityLive, sgData, innerWeather, prophecy, blindSpot,
    ptData, calendarFeed,
    streakDays, atmosphere, homeState, implicitProfile,
    alterInsights,
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
    } catch { }
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
      console.log("[tour] hydrated — home_main:", homeDone);
      if (homeDone) {
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
  // Plan & Outfit Retrieval: 日付選択 → 一時表示 Viewer
  const [retrievalViewer, setRetrievalViewer] = useState<{ isOpen: boolean; selectedDate: string | null; openedAt: number }>({ isOpen: false, selectedDate: null, openedAt: 0 });
  const handleOutfitDateSelect = useCallback((date: string) => {
    setRetrievalViewer({ isOpen: true, selectedDate: date, openedAt: Date.now() });
  }, []);
  const handleRetrievalClose = useCallback(() => {
    // 閉じるは非表示であってデータ削除ではない — selectedDate は保持
    setRetrievalViewer((prev) => ({ ...prev, isOpen: false }));
  }, []);
  // CEO方針: コーデ確定後は Alter エリアからカードを退避
  const [morningCardsDismissed, setMorningCardsDismissed] = useState(false);
  const handleOutfitCommit = useCallback(() => {
    setMorningCardsDismissed(true);
  }, []);
  // 今日のプランバッジ → PlanOutfitViewer を今日の日付で開く
  const handleTodayPlanOpen = useCallback(() => {
    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const today = jst.toISOString().slice(0, 10);
    setRetrievalViewer({ isOpen: true, selectedDate: today, openedAt: Date.now() });
  }, []);
  // 送信済みテキスト追跡（再注入防止用）
  const lastSentTextRef = useRef<string | null>(null);
  // Conversation Starter: focus重複発火ガード（1時間帯で1回だけ）
  const starterFiredRef = useRef<string | null>(null);

  // Hydration safety for composer chips
  const [composerMounted, setComposerMounted] = useState(false);
  useEffect(() => { setComposerMounted(true); }, []);

  // ── Follow-up / Journal prompt / Insight state ──
  const [followUpData, setFollowUpData] = useState<{
    targetItem: import("@/lib/alter-morning/types").PlanItem;
    message: string;
  } | null>(null);
  const [journalData, setJournalData] = useState<{ message: string } | null>(null);
  const [insightData, setInsightData] = useState<import("@/lib/alter-morning/types").ProactiveInsight | null>(null);

  // Proactive Insight: Home表示時に1回だけ生成（Phase 4）
  useEffect(() => {
    import("@/lib/alter-morning/proactiveInsights").then(({ generateMorningInsight }) => {
      const insight = generateMorningInsight();
      if (insight) setInsightData(insight);
    });
  }, []);

  // Follow-up / Journal をプランがある時にチェック
  useEffect(() => {
    if (!alterChat.morningPlan?.confirmed) return;
    // 動的import（バンドルサイズ最適化）
    import("@/lib/alter-morning/followUpTracker").then(({ checkFollowUp }) => {
      const decision = checkFollowUp(alterChat.morningPlan!);
      if (decision.shouldFollowUp && decision.targetItem && decision.message) {
        setFollowUpData({ targetItem: decision.targetItem, message: decision.message });
      }
    });
    import("@/lib/alter-morning/journalPrompt").then(({ checkJournalPrompt }) => {
      const decision = checkJournalPrompt();
      if (decision.shouldPrompt && decision.message) {
        setJournalData({ message: decision.message });
      }
    });
  }, [alterChat.morningPlan?.confirmed]);

  const composerHasConversation = composerMounted && alterChat.messages.length > 0;
  const anonLimitReached = isAnonymous && alterChat.roundCount >= ANON_RALLY_LIMIT;
  const composerIsLimitReached = composerMounted && alterChat.limitReached;

  // ── 会話モード（モバイル専用）: フォーカス中 or テキスト入力中 → ホームUIを消して会話に集中 ──
  // デスクトップ(≥768px)では常に false → 通常UIのまま
  // composerMounted ガード: SSR/hydration 時の不整合を防止
  // hasText 継続仕様: テキストが残っている間は会話モードを維持（キーボード閉じても戻さない）
  const isComposing = composerMounted && isMobile && (composerFocused || composerQuery.trim().length > 0);

  // ── 入力モード時コンテキストライン（フォーカスイン時にロック、途中で切り替えない） ──
  const prevIsComposingRef = useRef(false);
  const [composingCtxLine, setComposingCtxLine] = useState("");

  useEffect(() => {
    // false → true の遷移時のみ計算
    if (isComposing && !prevIsComposingRef.current) {
      const WEATHER_CTX: Record<string, string> = {
        // API返却ラベル
        穏やか: "今日は落ち着いて考えやすい状態です",
        エネルギッシュ: "今日は攻めの判断で考えます",
        モヤモヤ: "今日は少し慎重寄りで考えます",
        低空飛行: "今日はゆっくり整理して考えます",
        イライラ: "今日は冷静に切り分けて考えます",
        // クイックプリセットラベル
        絶好調: "今日は勢いに乗って考えます",
        元気: "今日は落ち着いて考えやすい状態です",
        普通: "いつも通りの視点で考えます",
        ダルい: "今日はゆっくり整理して考えます",
        もうダメ: "今日は無理せず整理だけします",
      };

      if (innerWeather?.recorded && innerWeather.label) {
        // P1: 内面天気あり → 今日の状態をふまえた文言
        setComposingCtxLine(WEATHER_CTX[innerWeather.label] ?? "今日の状態をふまえて考えます");
      } else if (alterChat.messages.length > 0) {
        // P2: 同一会話で直前文脈あり → 継続感
        setComposingCtxLine("前の流れもふまえて考えます");
      } else if ((sgData?.observationCount ?? 0) > 0) {
        // P3: 観測データあり → 個人化の証拠
        setComposingCtxLine("あなたの判断パターンをもとに考えます");
      } else {
        // P4: フォールバック
        setComposingCtxLine("あなた向けに整理します");
      }
    }
    prevIsComposingRef.current = isComposing;
  }, [isComposing, innerWeather, alterChat.messages.length, sgData?.observationCount]);

  // ── 入力欄を確実にクリアするヘルパー ──
  const forceClearComposer = () => {
    setComposerQuery("");
    // React の制御コンポーネントに加え、DOM 値も直接クリア
    // （iOS Safari + IME で React state と DOM が不整合になるケースへの防御）
    if (composerRef.current) {
      composerRef.current.value = "";
      composerRef.current.style.height = "auto";
    }
  };

  const handleComposerSubmit = (text?: string) => {
    const q = (text ?? composerQuery).trim();
    if (!q || alterChat.loading || composerIsLimitReached) return;

    // 送信テキストをスナップショットとして記録（再注入防止用）
    lastSentTextRef.current = q;

    // 匿名ユーザーのラリー上限 → ユーザーメッセージ表示 + Alterがリミットメッセージで返答
    if (anonLimitReached) {
      alterChat.injectMessage(q, "user");
      forceClearComposer();
      setTimeout(() => {
        alterChat.injectMessage(
          "ここまでの会話で、あなたのことが少し見えてきました。\n\n" +
          "これ以上の会話を続けるには、無料のアカウント登録が必要です。\n" +
          "ここまでの観測データや会話は、登録後にすべて引き継がれます。"
        );
      }, 1500);
      return;
    }

    // 送信用スナップショットを確定し、入力欄を即時クリア
    alterChat.sendMessage(q);
    forceClearComposer();
  };

  // ── ContextReel カードタップ: composerSeed 即投入 + focus ──
  const handleInsightCardAction = useCallback((card: AlterInsightCard) => {
    if (card.composerSeed) {
      setComposerQuery(card.composerSeed);
      // 次 tick で focus + 高さ調整
      requestAnimationFrame(() => {
        if (composerRef.current) {
          composerRef.current.focus();
          composerRef.current.style.height = "auto";
          composerRef.current.style.height = `${Math.min(composerRef.current.scrollHeight, 96)}px`;
        }
      });
      return;
    }
    if (card.href) {
      window.location.href = card.href;
    }
  }, []);

  const handleComposerChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    // 送信済みテキストが onChange で再注入されるのを防止
    // （ブラウザ autocomplete / IME 確定 / undo で復活するケース）
    if (lastSentTextRef.current && newValue === lastSentTextRef.current) {
      // ユーザーが意図的に同じ文を再入力した場合は許容（ref をクリア済みのため通る）
      return;
    }
    // ユーザーが新しい文字を打ち始めたら送信テキスト追跡をリセット
    if (lastSentTextRef.current && newValue !== lastSentTextRef.current) {
      lastSentTextRef.current = null;
    }
    setComposerQuery(newValue);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  };

  // ── 送信済みテキスト再注入の最終防御 ──
  // loading 開始直後（sendMessage 内で setLoading(true) 後）に
  // composerQuery がまだ送信テキストと同一なら強制クリア
  useEffect(() => {
    if (alterChat.loading && lastSentTextRef.current && composerQuery === lastSentTextRef.current) {
      forceClearComposer();
    }
    // loading が false に戻ったら追跡をリセット（次の送信に備える）
    if (!alterChat.loading && lastSentTextRef.current) {
      lastSentTextRef.current = null;
    }
  }, [alterChat.loading, composerQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Alter 導入メッセージ（時間帯別、人間っぽく） ──
  const alterGreeting = useMemo(() => {
    const hour = new Date().getHours();
    const name = greeting.split("、")[1]?.replace("さん", "") || "";
    const nameStr = name ? `、${name}さん` : "";
    const nameOrAnata = name ? `${name}さん` : "あなた";
    const obs = sgData?.observationCount ?? 0;
    const relationLine = obs >= 80
      ? `${obs}回の対話から、${nameOrAnata}の考え方が見えてきた。`
      : obs >= 30
        ? `${nameOrAnata}のこと、だいぶ分かってきた。`
        : obs > 0
          ? `${nameOrAnata}のこと、もっと聞かせて。`
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
    } catch { }
    if (greetCharIdx <= greetFullText.length) {
      const t = setTimeout(() => {
        setGreetDisplay(greetFullText.slice(0, greetCharIdx));
        setGreetCharIdx((c) => c + 1);
      }, 50 + Math.random() * 30);
      return () => clearTimeout(t);
    }
    setGreetTyped(true);
    try { sessionStorage.setItem("alter_greet_typed", new Date().toISOString().slice(0, 10)); } catch { }
  }, [greetCharIdx, greetFullText, composerHasConversation]);

  // ── Suggestion chips（4個、コンパクトラベル） ──
  const SUGGESTION_CHIPS = useMemo(() => [
    { label: "今日どう動く？", icon: "⚡" },
    { label: "なんでこうなる？", icon: "🔍" },
    { label: "仕事の進め方", icon: "💼" },
    { label: "今日の服", icon: "👔" },
  ], []);

  // ── Composer タイプライター placeholder ──
  const PLACEHOLDER_LINES = useMemo(() => [
    "Alterに話しかける…",
    "今日どう動けばいい？",
    "最近の自分、どう変わった？",
    "この判断、合ってる？",
    "なんかモヤモヤする…",
  ], []);
  const [phIdx, setPhIdx] = useState(0);
  const [phText, setPhText] = useState("");
  const [phCharIdx, setPhCharIdx] = useState(0);
  const [phPhase, setPhPhase] = useState<"typing" | "hold" | "erasing">("typing");

  useEffect(() => {
    // Don't run typewriter when user is typing or has conversation
    if (composerFocused || composerQuery || composerHasConversation) return;
    const line = PLACEHOLDER_LINES[phIdx % PLACEHOLDER_LINES.length];

    if (phPhase === "typing") {
      if (phCharIdx <= line.length) {
        const t = setTimeout(() => {
          setPhText(line.slice(0, phCharIdx));
          setPhCharIdx(c => c + 1);
        }, 60 + Math.random() * 40);
        return () => clearTimeout(t);
      }
      setPhPhase("hold");
    } else if (phPhase === "hold") {
      const t = setTimeout(() => setPhPhase("erasing"), 2500);
      return () => clearTimeout(t);
    } else if (phPhase === "erasing") {
      if (phCharIdx > 0) {
        const t = setTimeout(() => {
          setPhCharIdx(c => c - 1);
          setPhText(line.slice(0, phCharIdx - 1));
        }, 25);
        return () => clearTimeout(t);
      }
      setPhPhase("typing");
      setPhIdx(i => (i + 1) % PLACEHOLDER_LINES.length);
    }
  }, [phIdx, phCharIdx, phPhase, composerFocused, composerQuery, composerHasConversation, PLACEHOLDER_LINES]);

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden z-50 font-sans flex flex-col" style={{ background: "#f8f6f3", color: C.t1 }}>
      {/* ═══ HEADER ═══ */}
      <HomeHeader
        scrollAlpha={ha}
        onScrollTop={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
      />

      {/* ═══ LOGIN INTRO ═══ */}
      <LoginIntroAnimation onComplete={() => setIntroComplete(true)} />

      {/* ═══ ALTER HEADER BAR — スクロール外に固定 ═══ */}
      <div
        className="flex-shrink-0 px-5 pt-2 pb-1 flex items-center gap-2"
        style={{ background: "#f8f6f3", paddingTop: 56, position: "relative", zIndex: 10 }}
      >
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
        {/* 入力モード時: コンテキストライン */}
        {isComposing && (
          <span
            className="text-[11px] leading-snug"
            style={{ color: "rgba(99,102,241,0.5)" }}
          >
            {composingCtxLine}
          </span>
        )}
        {/* 通常時: Sync + DailyFlowChip */}
        {!isComposing && (
          <>
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
            <div className="ml-auto flex items-center gap-1.5">
              <OutfitCalendarEntry onDateSelect={handleOutfitDateSelect} />
              <DailyFlowChip
                instrumentUsedToday={instrumentUsedToday}
                innerWeatherRecorded={!!innerWeather?.recorded}
                observationCount={sgData?.observationCount ?? 0}
              />
            </div>
          </>
        )}
      </div>

      {/* ═══ SCROLL AREA — 1枚の会話キャンバス ═══ */}
      <div ref={scrollRef} data-tour="ask-hero" className="flex-1 min-h-0 overflow-y-auto" style={{ position: "relative", zIndex: 1 }}>
        <div style={{ color: C.t1 }}>

          {/* ── 通常時: 天気 + AnswerCard（スクロール内） ── */}
          <div
            className="transition-all duration-200 overflow-hidden"
            style={{
              opacity: isComposing ? 0 : 1,
              maxHeight: isComposing ? 0 : 600,
            }}
          >
            {/* ── 心の天気（フル入力）── AnswerCardの上 ── */}
            <div data-tour="inner-weather">
              <InlineInnerWeather innerWeather={innerWeather} />
            </div>

            {/* ── 文脈レール: 今日の一手（compact） ── */}
            <ZoneErrorBoundary zoneName="answer">
              <div data-tour="answer-card">
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
              </div>
            </ZoneErrorBoundary>
          </div>

          {/* ═══ Rendezvous ステータス（コンパクト通知） ═══ */}
          {!isComposing && !composerHasConversation && !isAnonymous && (
            <RendezvousQuickStatus />
          )}

          {/* ═══ Plan & Outfit Retrieval Viewer（会話とは独立） ═══ */}
          {retrievalViewer.isOpen && retrievalViewer.selectedDate && (
            <PlanOutfitViewer
              key={`viewer-${retrievalViewer.openedAt}`}
              selectedDate={retrievalViewer.selectedDate}
              onClose={handleRetrievalClose}
              onAskAlter={(date) => {
                handleRetrievalClose();
                handleComposerSubmit(`${date} の予定について相談したい`);
              }}
            />
          )}

          {/* ═══ 挨拶（未会話時のみ。入力モード中も残り、初メッセージで消える） ═══ */}
          {!composerHasConversation && (
            <div
              className="flex flex-col items-center justify-center px-8 pb-2 transition-all duration-200"
              style={{
                // 入力モード時: 上コンテンツが消えても画面中央を維持
                minHeight: isComposing ? "calc(100dvh - 180px)" : undefined,
                paddingTop: isComposing ? 0 : 40,
              }}
            >
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

          {/* ═══ コンテキストリール + 匿名ユーザー向け気づき/登録CTA ═══ */}
          {!composerHasConversation && !isComposing && (
            <>
              {/* 匿名ユーザー: 気づきカード + 新規登録CTA */}
              {isAnonymous && (
                <div className="px-5 mb-3">
                  <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white p-4">
                    <p className="mb-1 text-[10px] font-medium tracking-wide text-indigo-400">
                      気づき
                    </p>
                    <p className="mb-3 text-xs leading-relaxed text-[#121830]">
                      {alterInsights?.cards?.[0]?.text
                        ?? "あなたの観測データから、まだ見えていない傾向が見つかりました。"}
                    </p>
                    <a
                      href="/login?mode=signup&next=/"
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#121830] px-4 py-2 text-[11px] font-medium text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
                    >
                      無料で新規登録する
                    </a>
                  </div>
                </div>
              )}

              {/* 気づきカード（登録済み: フル表示 / 匿名: CTAの下に表示） */}
              {alterInsights?.cards && alterInsights.cards.length > 0 && (
                <ContextReel
                  cards={alterInsights.cards}
                  onCardAction={handleInsightCardAction}
                />
              )}
            </>
          )}

          {/* ═══ Location Opt-in Banner (PR B-2d-b) ═══
                CEO/GPT 2026-05-02: ユーザーが明示的に「位置情報を使う」を押した時のみ
                getCurrentPosition を発火する。banner 表示は effectiveOptInState === "not_asked"
                のときのみ。
                Aneurasync の "押し付けない" 世界観に合わせ、modal は使わず inline banner で。 */}
          <AnimatePresence>
            {alterChat.showLocationOptInBanner && (
              <motion.div
                key="location-opt-in-banner"
                className="px-4 py-2"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
              >
                <LocationOptInBanner
                  mode={alterChat.locationOptInBannerMode}
                  onGrant={alterChat.handleLocationOptInGrant}
                  onSnooze={alterChat.handleLocationOptInSnooze}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ═══ 会話トランスクリプト ═══ */}
          <ZoneErrorBoundary zoneName="ask">
            <div>
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
                alterCounselorSoftLink={alterChat.lastCounselorSoftLink}
                morningPlan={alterChat.morningPlan}
                morningPhase={alterChat.morningPhase}
                morningPersonalizeHints={alterChat.morningPersonalizeHints}
                morningEvents={alterChat.morningPersistedEvents ?? undefined}
                visualFlowEnabled={visualFlowEnabled}
                onMorningPlanConfirm={(plan) => {
                  alterChat.setMorningPlan(plan);
                  // プラン確定後、コーデ提案を聞く
                  alterChat.sendMessage("これでいく");
                  // ジャーナル誘導の優先度を上げる
                  import("@/lib/alter-morning/journalPrompt").then(({ markPlanCreatedToday }) => {
                    markPlanCreatedToday();
                  });
                  // 曜日パターンに記録（Phase 4）
                  import("@/lib/alter-morning/weekdayPatterns").then(({ recordPlanCreated }) => {
                    recordPlanCreated(plan.items.length);
                  });
                  // Conversation Starter: プラン確定を記録
                  import("@/lib/alter-morning/conversationStarter").then(({ markPlanConfirmed }) => {
                    markPlanConfirmed();
                  });
                }}
                onMorningPlanChange={() => {
                  alterChat.sendMessage("変更する");
                }}
                morningWeather={(() => {
                  // calendarFeed から今日の天気を抽出（JST基準）
                  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
                  const today = jst.toISOString().slice(0, 10);
                  const todayDay = calendarFeed?.days?.find((d: any) => d.date === today);
                  if (!todayDay?.weather) return null;
                  const w = todayDay.weather;
                  const icon = (w.icon ?? "").toLowerCase();
                  const condition: "sunny" | "cloudy" | "rain" | "snow" =
                    icon.includes("rain") ? "rain" :
                    icon.includes("snow") ? "snow" :
                    icon.includes("cloud") ? "cloudy" : "sunny";
                  return {
                    tempMax: typeof w.temp === "number" ? w.temp + 3 : null,
                    tempMin: typeof w.temp === "number" ? w.temp - 3 : null,
                    condition,
                    pop: null,
                  };
                })()}
                followUp={followUpData}
                onFollowUpRespond={(itemId, status) => {
                  import("@/lib/alter-morning/followUpTracker").then(({ recordFollowUp }) => {
                    recordFollowUp();
                  });
                  // 曜日パターンにタスク結果を記録（Phase 4）
                  import("@/lib/alter-morning/weekdayPatterns").then(({ recordTaskOutcome }) => {
                    recordTaskOutcome(status);
                  });
                  setFollowUpData(null);
                  // タスク完了を反映
                  if (status === "done" && alterChat.morningPlan) {
                    alterChat.setMorningPlan({
                      ...alterChat.morningPlan,
                      items: alterChat.morningPlan.items.map((item) =>
                        item.id === itemId ? { ...item, completed: true } : item
                      ),
                    });
                  }
                }}
                onFollowUpDismiss={() => setFollowUpData(null)}
                journalPrompt={journalData}
                onJournalDismiss={() => setJournalData(null)}
                morningInsight={insightData}
                onInsightDismiss={() => setInsightData(null)}
                composerFocused={composerFocused}
                scrollRef={scrollRef}
                onOutfitCommit={handleOutfitCommit}
                morningCardsDismissed={morningCardsDismissed}
                morningDialogState={alterChat.morningDialogState}
                onPlaceSelect={alterChat.selectPlaceCandidate}
                placeSelectionPending={alterChat.placeSelectionPending}
                placeSelectionFeedback={alterChat.placeSelectionFeedback}
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

        {/* ── 今日のプランバッジ（プラン存在時は常に表示 — 📋 で確認） ── */}
        <div className="flex justify-end px-3 pb-1">
          <TodayPlanBadge onOpen={handleTodayPlanOpen} />
        </div>

        {/* ── Composer（外枠全体が入力エリア） ── */}
        <div
          className="flex items-center gap-3 mx-3 mb-1.5 px-4 rounded-2xl transition-all duration-200 cursor-text"
          style={{
            background: composerFocused ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.88)",
            border: composerFocused
              ? "1.5px solid rgba(99,102,241,0.5)"
              : "1.5px solid rgba(99,102,241,0.25)",
            boxShadow: composerFocused
              ? "0 4px 20px rgba(99,102,241,0.15)"
              : "0 2px 8px rgba(0,0,0,0.06)",
          }}
          onClick={() => composerRef.current?.focus()}
        >
          <AneurasyncLogo
            size={30}
            color="#6366F1"
            animate={alterChat.loading}
            style={{ opacity: composerFocused ? 0.9 : 0.5, transition: "opacity 0.2s" }}
          />
          <div
            data-composer-wrapper=""
            className="flex-1 min-w-0 relative flex items-center"
          >
            <textarea
              data-composer-textarea=""
              ref={composerRef}
              rows={1}
              value={composerQuery}
              onChange={handleComposerChange}
              onFocus={() => {
                setComposerFocused(true);
                // Conversation Starter: 時間帯×プラン状態に応じた先行メッセージを注入
                // useRef ガードで同一時間帯の重複発火を防止
                import("@/lib/alter-morning/conversationStarter").then(
                  ({ getStarterDecision, markStarterShown }) => {
                    const decision = getStarterDecision();
                    if (!decision.shouldShow) return;
                    // ref + localStorage の二重ガード: 同一slot内では1回のみ
                    const key = `${decision.slot}_${decision.planStatus}`;
                    if (starterFiredRef.current === key) return;
                    starterFiredRef.current = key;
                    markStarterShown(decision.slot);
                    alterChat.injectMessage(decision.message);
                  }
                );
              }}
              onBlur={() => setTimeout(() => setComposerFocused(false), 200)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleComposerSubmit();
                }
              }}
              placeholder=""
              aria-label="Alterに質問する"
              className="w-full text-text1 text-[15px] resize-none"
              style={{
                maxHeight: 96,
                border: "none",
                outline: "none",
                boxShadow: "none",
                background: "transparent",
                padding: "10px 0",
                margin: 0,
                lineHeight: "20px",
                WebkitAppearance: "none",
                appearance: "none",
                WebkitTapHighlightColor: "transparent",
              }}
              disabled={composerIsLimitReached}
            />
            {/* タイプライター placeholder（textareaが空のとき表示） */}
            {!composerQuery && !composerFocused && (
              <span className="absolute inset-0 pointer-events-none text-[15px] text-text4 flex items-center" style={{ lineHeight: "20px" }}>
                {phText}
                <span
                  className="inline-block w-[1.5px] h-[15px] ml-[1px]"
                  style={{ background: "rgba(99,102,241,0.4)", animation: "alter-cursor-blink 1s step-end infinite" }}
                />
              </span>
            )}
          </div>
          <AnimatePresence mode="wait">
            {alterChat.loading ? (
              <motion.button
                key="stop"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                onClick={() => alterChat.abort?.()}
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)" }}
                whileTap={{ scale: 0.9 }}
              >
                <span className="block w-3 h-3 rounded-sm" style={{ background: "rgba(239,68,68,0.8)" }} />
              </motion.button>
            ) : composerQuery.trim() ? (
              <motion.button
                key="send"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                onClick={() => handleComposerSubmit()}
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #6366F1, #8B5CF6)" }}
              >
                →
              </motion.button>
            ) : null}
          </AnimatePresence>
        </div>

        {/* ── QuickAccess（会話モード中は非表示） ── */}
        <div
          className="transition-all duration-200 relative"
          style={{
            opacity: isComposing ? 0 : 1,
            maxHeight: isComposing ? 0 : 80,
            pointerEvents: isComposing ? "none" : "auto",
            overflow: isComposing ? "hidden" : "visible",
          }}
        >
          <div data-tour="quick-access"><HomeQuickAccess /></div>
        </div>
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
        }}
      />

    </div>
  );
}
