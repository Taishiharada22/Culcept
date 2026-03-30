"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTimeOfDayDetail } from "@/lib/shared/timeOfDay";
import { getArchetypeByCode } from "@/lib/stargazer/archetypeTypes";
import { getArchetypeFigureSrc } from "@/lib/stargazer/archetypeFigure";
import { getPrimaryAction, type UserState, type PrimaryAction as PrimaryActionType } from "@/lib/stargazer/primaryAction";
import { generateExtendedAtmosphere, generateAtmosphere, getDefaultAtmosphere, type AtmosphereParams, type WeatherType, type EmotionalTone } from "@/lib/ui/psycheReactiveAtmosphere";
import { computeHomeState, type HomeState, type HomeStateInput } from "@/lib/ui/homeStateEngine";
import { getCurrentChapter } from "@/lib/stargazer/narrativeThreading";
import { buildImplicitProfile, type SessionImplicitProfile } from "@/lib/stargazer/implicitSignalCapture";
import { readStoredSignals } from "@/hooks/useImplicitSignals";

/* ═══ Types ═══ */

type LiveIdentityKey = "origin" | "genome" | "presence" | "style";

type CalendarDay = {
  date: string;
  dayOfWeek: string;
  weather: { temp: number; icon: string; humidity: number };
  event?: string;
  outfit?: { name: string; category: string; emoji: string; reason: string; image?: string }[];
};

type TribeItem = {
  id: string;
  name: string;
  icon: string;
  members: number;
  description: string;
  featured_items: { id: string; image_url?: string }[];
};

type DataWave = "loading" | "critical" | "content" | "complete";

/* ═══ Helper constants ═══ */

const HOME_INNER_WEATHER_BRIDGE_KEY = "aneurasync_home_inner_weather_v1";
const HOME_INNER_WEATHER_UPDATED_EVENT = "aneurasync:inner-weather-updated";

/* ═══ Helper functions ═══ */

function getJstDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(date);
}

function normalizeHomeInnerWeather(input: any) {
  if (!input) return null;
  const weatherType = input.weatherType ?? input.weather_type;
  const emoji = input.emoji ?? input.weatherEmoji;
  const label = input.label ?? input.weatherLabel;
  const message = input.message ?? input.insight ?? input.description ?? input.weatherReport;

  if (!weatherType || !emoji || !label) return null;

  return {
    weatherType,
    emoji,
    label,
    message,
    recorded: true,
    needsInput: false,
    ctaLabel: "詳細を見る",
  };
}

function readHomeInnerWeatherBridge() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(HOME_INNER_WEATHER_BRIDGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { date?: string; weather?: unknown };
    if (parsed.date !== getJstDateKey()) return null;
    return parsed.weather ?? null;
  } catch {
    return null;
  }
}

/** Type-safe fetch wrapper */
async function fetchJson<T = any>(url: string): Promise<T | null> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return null;
  return res.json();
}

/* ═══ Exported types ═══ */

export type IdentityLiveData = Partial<Record<LiveIdentityKey, { pct: number; insight: string }>>;

export type SgData = {
  /** アーキタイプ名（日本語表示名） */
  archetype?: string;
  emoji?: string;
  confidence?: number;
  /** エントロピーベース同期率 (0-1)。信念の不確実性減少量から算出 */
  syncPercentage?: number;
  observationCount?: number;
  phase?: "new" | "observing" | "unlocked";
  figureSrc?: string | null;
  figureAlt?: string;
  archetypeEnglishName?: string | null;
  archetypeCode?: string;
  axisScores?: Record<string, number>;
} | null;

export type InnerWeatherData = {
  weatherType?: string;
  emoji?: string;
  label?: string;
  message?: string;
  recorded?: boolean;
  needsInput?: boolean;
  ctaLabel?: string;
} | null;

export type ProphecyData = {
  prediction?: string;
  category?: string;
  verified?: boolean;
  verificationLevel?: string;
} | null;

export type BlindSpotData = {
  message?: string;
  tone?: string;
  intensity?: number;
} | null;

export type PtData = {
  eyeType?: string;
  eyeTypeLabel?: string;
  eyeColor?: string;
  eyeColorLabel?: string;
  hasSkin?: boolean;
  hasBody?: boolean;
  hasFace?: boolean;
  pct: number;
  insight: string;
} | null;

export type DiagData = {
  score: number;
  bodyType?: string;
  season?: string;
  insight?: string;
} | null;

export type CalendarFeedData = { month?: string; days?: CalendarDay[] } | null;

export type TribesDataType = { tribes?: TribeItem[]; myTribes?: string[] } | null;

export type HomeDataResult = {
  identityLive: IdentityLiveData;
  sgData: SgData;
  innerWeather: InnerWeatherData;
  prophecy: ProphecyData;
  blindSpot: BlindSpotData;
  ptData: PtData;
  diagData: DiagData;
  calendarFeed: CalendarFeedData;
  avatarHistory: any[];
  recommendations: any[];
  tribesData: TribesDataType;
  primaryAction: PrimaryActionType | null;
  streakDays: number;
  resonanceNarrative: string | null;
  dataWave: DataWave;
  atmosphere: AtmosphereParams;
  homeState: HomeState;
  narrativeChapter: any;
  implicitProfile: SessionImplicitProfile | null;
};

/* ═══ Query functions ═══ */

async function fetchIdentityProgress(): Promise<IdentityLiveData> {
  const d = await fetchJson<any>("/api/aneurasync/home-identity-progress");
  if (!d?.ok || !d.items) return {};
  return d.items;
}

async function fetchStargazerProfile(): Promise<SgData> {
  const d = await fetchJson<any>("/api/stargazer/profile");
  if (!d?.ok) return null;
  const count = d.observationStats?.totalAnswered ?? 0;
  const conf = d.starMap?.coreStar?.confidenceScore ?? 0;
  const phase = conf >= 0.7 ? "unlocked" : count > 0 ? "observing" : "new";
  const archetype = d.archetypeResult;
  const archetypeDef = archetype?.code ? getArchetypeByCode(archetype.code) : null;
  return {
    archetype: archetype?.name ?? "観測中",
    archetypeCode: archetype?.code ?? undefined,
    emoji: archetype?.emoji ?? "🔭",
    confidence: archetype?.confidence ?? conf,
    syncPercentage: d.syncPercentage ?? undefined,
    observationCount: count,
    phase,
    figureSrc: getArchetypeFigureSrc(archetypeDef?.englishName),
    figureAlt: archetypeDef?.name ?? archetype?.name ?? "Stargazer archetype",
    archetypeEnglishName: archetypeDef?.englishName ?? null,
    axisScores: d.axisScores ?? d.liveSky?.dimensions ?? d.starMap?.coreStar?.coreTraits ?? undefined,
  };
}

async function fetchInnerWeather() {
  // First try localStorage bridge for instant display
  const cached = readHomeInnerWeatherBridge();
  const cachedResult = cached ? normalizeHomeInnerWeather(cached) : null;

  const d = await fetchJson<any>("/api/stargazer/inner-weather");
  if (!d?.hasRecord || !d.weather) {
    return {
      weather: cachedResult ?? {
        label: "未記録",
        message: d?.prompt?.message ?? "まだ今日の Inner Weather は記録されていません。",
        recorded: false,
        needsInput: true,
        ctaLabel: d?.prompt?.label ?? "今日の心の天気を記録",
      },
      raw: null,
    };
  }
  const raw = d.weather ?? d.todayWeather ?? d;
  const weatherData = normalizeHomeInnerWeather(raw);
  return {
    weather: weatherData ?? {
      label: "未記録",
      message: "まだ今日の Inner Weather は記録されていません。",
      recorded: false,
      needsInput: true,
      ctaLabel: "今日の心の天気を記録",
    },
    raw: weatherData ? raw : null,
  };
}

async function fetchProphecy(): Promise<ProphecyData> {
  const d = await fetchJson<any>("/api/stargazer/prophecy");
  if (!d) return null;
  const p = d.prophecy ?? d.todayProphecy ?? d;
  return {
    prediction: p.prediction ?? p.text ?? p.prophecy_text,
    category: p.category,
    verified: !!p.verified_at,
    verificationLevel: p.verification_level ?? p.verificationLevel,
  };
}

async function fetchBlindSpot(): Promise<BlindSpotData> {
  const d = await fetchJson<any>("/api/stargazer/blind-spot");
  if (!d) return null;
  const b = d.drop ?? d.todayDrop ?? d;
  return {
    message: b.message ?? b.text ?? b.drop_text,
    tone: b.tone,
    intensity: b.intensity,
  };
}

async function fetchPhenotype(): Promise<{ ptData: PtData; diagData: DiagData }> {
  const [epData, bcData, fpData] = await Promise.all([
    fetchJson<any>("/api/eye-profile"),
    fetchJson<any>("/api/body-color/profile"),
    fetchJson<any>("/api/aneurasync/face-phenotype"),
  ]);

  const ep = epData?.eye_profile;
  const hasSkin = !!(bcData?.color_profile?.cpv?.undertone);
  const hasBody = !!(bcData?.body_profile?.cfv);
  const eyeType = ep?.eye_type;
  const eyeColor = ep?.eye_color;
  const pcSeason = bcData?.color_profile?.labels?.season;
  const fp = fpData?.face_phenotype?.phenotype;
  const hasFace = !!(fp?.face_shape?.primary || fp?.nose_impression || fp?.face_impression);

  let filled = 0;
  if (eyeType) filled++;
  if (eyeColor) filled++;
  if (hasSkin) filled++;
  if (hasBody) filled++;
  if (hasFace) filled++;
  const pct = Math.round((filled / 5) * 100);

  let insight = "分析を開始しましょう";
  if (pct >= 80) insight = "分析が高精度に到達しています";
  else if (pct >= 40) insight = "骨格・カラー分析の精度が安定しています";
  else if (pct > 0) insight = "データ蓄積中 — 追加分析で精度が向上します";

  const ptResult: PtData = {
    eyeType: eyeType ?? undefined,
    eyeTypeLabel: ep?.eye_type_label ?? undefined,
    eyeColor: eyeColor ?? undefined,
    eyeColorLabel: ep?.eye_color_label ?? undefined,
    hasSkin,
    hasBody,
    hasFace,
    pct,
    insight,
  };

  let diagResult: DiagData = null;
  if (bcData?.body_profile?.cfv || pcSeason) {
    diagResult = {
      score: pct,
      bodyType: bcData?.body_profile?.cfv?.body_type_label ?? undefined,
      season: pcSeason ?? undefined,
      insight: bcData?.body_profile?.cfv
        ? `${bcData.body_profile.cfv.body_type_label ?? "体型"} × ${pcSeason ?? "カラー"} の組み合わせで提案精度が上がります`
        : undefined,
    };
  }

  return { ptData: ptResult, diagData: diagResult };
}

async function fetchCalendar(): Promise<CalendarFeedData> {
  return fetchJson<any>("/api/calendar/month");
}

async function fetchAvatarHistory(): Promise<any[]> {
  const d = await fetchJson<any>("/api/avatar-fitting/history?limit=5");
  return d?.evaluations ?? [];
}

async function fetchRecommendations(): Promise<any[]> {
  const d = await fetchJson<any>("/api/recommendations?limit=4");
  return d?.items ?? [];
}

async function fetchTribes(): Promise<TribesDataType> {
  return fetchJson<any>("/api/tribes?limit=6");
}

async function fetchResonance() {
  const d = await fetchJson<any>("/api/stargazer/resonance");
  if (!d?.ok) return { narrative: null, primaryAction: null, streakDays: 0 };

  const narrative = d.resonance?.networkNarrative ?? null;
  const hints = d.primaryActionHints;

  let action: PrimaryActionType | null = null;
  let streak = 0;

  if (hints) {
    const tod = getTimeOfDayDetail();
    const userState: UserState = {
      observationCount: hints.observationCount ?? 0,
      confidence: 0,
      phase: hints.phase ?? "new",
      streakDays: hints.streakDays ?? 0,
      streakAtRisk: hints.streakAtRisk ?? false,
      streakHoursRemaining: hints.streakHoursRemaining ?? 24,
      hasVanishingInsight: hints.hasVanishingInsight ?? false,
      vanishingInsightHoursLeft: hints.vanishingInsightHoursLeft ?? 24,
      hasTodayProphecy: false,
      prophecyVerifiable: hints.prophecyVerifiable ?? false,
      hasNewContradiction: hints.hasNewContradiction ?? false,
      contradictionCount: hints.contradictionCount ?? 0,
      identityCompletionPct: 0,
      incompleteIdentityItems: [],
      hasNewMatch: false,
      hasUnreadMessage: false,
      timeOfDay: tod,
    };
    action = getPrimaryAction(userState);
    streak = hints.streakDays ?? 0;
  }

  return { narrative, primaryAction: action, streakDays: streak };
}

/* ═══ Hook ═══ */

export function useHomeData(): HomeDataResult {
  // ── Wave 1: Critical Path (identity + stargazer) ──
  const { data: identityLive = {} } = useQuery({
    queryKey: ["home", "identity-progress"],
    queryFn: fetchIdentityProgress,
    staleTime: 30_000, // 30s — identity data changes rarely during session
  });

  const { data: sgData = null } = useQuery({
    queryKey: ["home", "stargazer-profile"],
    queryFn: fetchStargazerProfile,
    staleTime: 30_000,
  });

  // ── Wave 2: Daily content ──
  const { data: innerWeatherResult } = useQuery({
    queryKey: ["home", "inner-weather"],
    queryFn: fetchInnerWeather,
    staleTime: 15_000, // 15s — inner weather can be updated during session
    refetchOnWindowFocus: true, // Refresh on tab focus (replaces manual event listeners)
  });
  const innerWeather: InnerWeatherData = innerWeatherResult?.weather ?? null;

  // ── Narrative Chapter (client-side, from localStorage snapshots) ──
  const narrativeChapter = useMemo(() => {
    try { return getCurrentChapter(); } catch { return null; }
  }, [sgData?.observationCount]);

  // ── Implicit Profile (client-side, from localStorage signals) ──
  const implicitProfile = useMemo<SessionImplicitProfile | null>(() => {
    try {
      const stored = readStoredSignals();
      if (!stored) return null;
      return buildImplicitProfile(stored);
    } catch { return null; }
  }, [sgData]);

  const { data: prophecy = null } = useQuery({
    queryKey: ["home", "prophecy"],
    queryFn: fetchProphecy,
    staleTime: 60_000,
  });

  const { data: blindSpot = null } = useQuery({
    queryKey: ["home", "blind-spot"],
    queryFn: fetchBlindSpot,
    staleTime: 60_000,
  });

  // ── Wave 3: Enhancement ──
  const { data: phenotypeResult } = useQuery({
    queryKey: ["home", "phenotype"],
    queryFn: fetchPhenotype,
    staleTime: 5 * 60_000, // 5min — phenotype data is stable
  });
  const ptData = phenotypeResult?.ptData ?? null;
  const diagData = phenotypeResult?.diagData ?? null;

  const { data: calendarFeed = null } = useQuery({
    queryKey: ["home", "calendar"],
    queryFn: fetchCalendar,
    staleTime: 5 * 60_000,
  });

  const { data: avatarHistory = [] } = useQuery({
    queryKey: ["home", "avatar-history"],
    queryFn: fetchAvatarHistory,
    staleTime: 5 * 60_000,
  });

  const { data: recommendations = [] } = useQuery({
    queryKey: ["home", "recommendations"],
    queryFn: fetchRecommendations,
    staleTime: 60_000,
  });

  const { data: tribesData = null } = useQuery({
    queryKey: ["home", "tribes"],
    queryFn: fetchTribes,
    staleTime: 5 * 60_000,
  });

  const { data: resonanceResult } = useQuery({
    queryKey: ["home", "resonance"],
    queryFn: fetchResonance,
    staleTime: 60_000,
  });
  const primaryAction = resonanceResult?.primaryAction ?? null;
  const streakDays = resonanceResult?.streakDays ?? 0;
  const resonanceNarrative = resonanceResult?.narrative ?? null;

  // ── Home State Engine (integrates all signals) ──
  const homeState = useMemo<HomeState>(() => {
    const input: HomeStateInput = {
      observationCount: sgData?.observationCount ?? 0,
      confidence: sgData?.confidence ?? 0,
      streakDays,
      hasNewContradiction: !!(blindSpot && (blindSpot as any).isNew),
      hasVerifiableProphecy: !!(prophecy && !prophecy.verified),
      vanishingInsightHoursLeft: (resonanceResult as any)?.vanishingInsightHoursLeft ?? null,
      predictionAccuracy: sgData?.confidence ?? 0,
      predictionAccuracyPrevWeek: null,
      narrativeChapter,
      narrativePhase: (narrativeChapter as any)?.currentPhase ?? null,
      hour: new Date().getHours(),
      implicitProfile,
      todayMilestoneUnlocked: false,
      hasNewGhost: false,
      hasTemporalShift: false,
      hasConvergentInsight: false,
      observedToday: !!(innerWeather as any)?.recorded,
    };
    return computeHomeState(input);
  }, [sgData, streakDays, blindSpot, prophecy, resonanceResult, narrativeChapter, implicitProfile, innerWeather]);

  // Derive atmosphere from inner weather + HomeState overrides
  const atmosphere = useMemo<AtmosphereParams>(() => {
    const raw = innerWeatherResult?.raw;
    if (!raw) return getDefaultAtmosphere();
    try {
      return generateExtendedAtmosphere(
        {
          weatherType: raw.weatherType as WeatherType,
          energyLevel: raw.energyLevel ?? 0,
          stressLevel: raw.stressLevel ?? 0.3,
          emotionalTone: (raw.emotionalTone ?? "calm") as EmotionalTone,
          socialBattery: raw.socialBattery ?? 0.5,
        },
        {
          contradictionIntensity: homeState.atmosphereOverrides.intensity * 0.5,
          streakMomentum: streakDays > 0 ? Math.min(streakDays / 30, 1) : 0,
          narrativePhase: homeState.atmosphereOverrides.narrativeColor ? (narrativeChapter as any)?.currentPhase : undefined,
          predictionAccuracyTrend: 0,
          particleMode: homeState.atmosphereOverrides.particleMode,
          overrideIntensity: homeState.atmosphereOverrides.intensity,
        },
      );
    } catch {
      return getDefaultAtmosphere();
    }
  }, [innerWeatherResult?.raw, homeState, streakDays, narrativeChapter]);

  // ── DataWave computation ──
  const dataWave = useMemo<DataWave>(() => {
    if (sgData && Object.keys(identityLive).length > 0) {
      if (blindSpot !== null || prophecy !== null) {
        if (ptData !== null || calendarFeed !== null) return "complete";
        return "content";
      }
      return "critical";
    }
    return "loading";
  }, [sgData, identityLive, blindSpot, prophecy, ptData, calendarFeed]);

  // ── Inner Weather bridge event listener (for cross-component updates) ──
  useEffect(() => {
    const onUpdate = () => {
      // React Query will automatically refetch when this event fires
      // because we set refetchOnWindowFocus: true
      // For custom event, manually trigger refetch via window dispatch
    };
    window.addEventListener(HOME_INNER_WEATHER_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(HOME_INNER_WEATHER_UPDATED_EVENT, onUpdate);
  }, []);

  return {
    identityLive,
    sgData,
    innerWeather,
    prophecy,
    blindSpot,
    ptData,
    diagData,
    calendarFeed,
    avatarHistory,
    recommendations,
    tribesData,
    primaryAction,
    streakDays,
    resonanceNarrative,
    dataWave,
    atmosphere,
    homeState,
    narrativeChapter,
    implicitProfile,
  };
}
