// app/calendar/CalendarPageClient.tsx
"use client";

import * as React from "react";
import { Suspense } from "react";
import { usePassiveSensor } from "@/hooks/usePassiveSensor";
import AlterContextBanner from "@/components/home/AlterContextBanner";
import { useFootprintTracker } from "@/hooks/useFootprintTracker";
import Link from "next/link";
import Image, { type ImageLoader } from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  LightBackground,
  GlassCard,
  GlassNavbar,
  FadeInView,
  FloatingNavLight,
} from "@/components/ui/glassmorphism-design";
import { MAIN_NAV } from "@/lib/navigation";
import type { WardrobeItem } from "@/app/my-style/_lib/types";
import type { CalendarData, DayData, DayProposal, WornRecord, SatisfactionProfile, WeatherDrift } from "./_lib/types";
import { DAILY_WEATHER_ICONS, WEEKDAYS, SYNC_BAND_COLORS } from "./_lib/constants";
import { generateDayProposal } from "./_lib/outfitEngine";
import { getRecentlyWornItemIds, saveWornRecord, getWornRecordForDate, loadWornHistory } from "./_lib/rotationTracker";
import type { CalendarPersonaProfile } from "./_lib/personaBoost";
import { extractCalendarProfile } from "./_lib/personaBoost";
import { buildSatisfactionProfile } from "./_lib/satisfactionLearner";
import { generateInsights } from "./_lib/insightEngine";
import { getSeasonBlend, getDayTemperatureSplit, getSeasonalRotationHints } from "./_lib/seasonalTransition";
import { shouldCheckWeather, setLastWeatherCheck } from "./_lib/weatherDriftDetector";
import { buildTemporalProfile } from "./_lib/temporalPatterns";
import type { TemporalProfile } from "./_lib/temporalPatterns";
import { buildComboGraph } from "./_lib/comboGraph";
import type { ComboGraph } from "./_lib/comboGraph";
import { buildExtendedWeatherContext } from "./_lib/materialWeather";
import type { ExtendedWeatherContext } from "./_lib/materialWeather";
import { buildObservationContext, computeOutfitAdaptation } from "./_lib/aneurasyncIntegration";
import type { ObservationContext, OutfitAdaptation } from "./_lib/aneurasyncIntegration";
import { predictRegret } from "./_lib/regretPredictor";
import type { RegretPrediction } from "./_lib/regretPredictor";
import type { OutfitExtendedOptions } from "./_lib/outfitEngine";
import { analyzeWardrobeGaps } from "./_lib/wardrobeGapDetector";
import type { GapAnalysis } from "./_lib/wardrobeGapDetector";
import { computeOutfitDna, computeStyleCentroid, computeAdventureScore } from "./_lib/outfitDna";
import type { OutfitDnaVector } from "./_lib/outfitDna";
import { findSubstitutions } from "./_lib/itemSubstitution";
import { recordRejection, buildFeedbackSummary } from "./_lib/bidirectionalFeedback";
import type { FeedbackSummary } from "./_lib/bidirectionalFeedback";
import { getConditionStyleHint, computeRotationProfiles, describeSeasonalShift, saveMoodRecord } from "./_lib/deepTemporalIntelligence";
import type { ConditionStyleHint, ItemRotationProfile } from "./_lib/deepTemporalIntelligence";
import WardrobeGapCard from "./_components/WardrobeGapCard";
import DayCell from "./_components/DayCell";
import DayDetailSheet from "./_components/DayDetailSheet";
import WeekAtmosphereBar from "./_components/WeekAtmosphereBar";
import WeatherDriftBanner from "./_components/WeatherDriftBanner";
import SeasonalTransitionHint from "./_components/SeasonalTransitionHint";
import OnboardingTooltip from "./_components/OnboardingTooltip";
import StyleEvolutionCard from "./_components/StyleEvolutionCard";
import FeatureIntroduction from "@/components/ui/FeatureIntroduction";
import { CALENDAR_INTRO } from "@/lib/ui/featureIntroConfigs";

/* ── 定数 ── */
const WARDROBE_KEY = "culcept_my_style_v2";
const passthroughLoader: ImageLoader = ({ src }) => src;


/* ── メインコンポーネント ── */
export default function CalendarPageClient() {
  usePassiveSensor("calendar");
  useFootprintTracker({ feature: "calendar" });
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const [currentYear, setCurrentYear] = React.useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = React.useState(today.getMonth() + 1);
  const [calendarData, setCalendarData] = React.useState<CalendarData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [generating, setGenerating] = React.useState(false);
  const [selectedDay, setSelectedDay] = React.useState<DayData | null>(null);
  const [wardrobeItems, setWardrobeItems] = React.useState<WardrobeItem[]>([]);
  const [showWeatherSettings, setShowWeatherSettings] = React.useState(false);
  const [officeCode, setOfficeCode] = React.useState("");
  const [officeOptions, setOfficeOptions] = React.useState<Array<{ code: string; name: string }>>([]);
  const [officeLoading, setOfficeLoading] = React.useState(true);
  const [officeSaving, setOfficeSaving] = React.useState(false);
  const [officeMessage, setOfficeMessage] = React.useState<string | null>(null);
  const [personaProfile, setPersonaProfile] = React.useState<CalendarPersonaProfile | null>(null);
  const [satisfactionProfile, setSatisfactionProfile] = React.useState<SatisfactionProfile | null>(null);
  const [weatherDrifts, setWeatherDrifts] = React.useState<WeatherDrift[]>([]);

  /* ── 満足度プロファイル構築 ── */
  React.useEffect(() => {
    try {
      const profile = buildSatisfactionProfile();
      if (profile.dataPoints > 0) setSatisfactionProfile(profile);
    } catch { /* ignore */ }
  }, []);

  /* ── 6エンジン: 時間パターン・コンボグラフ ── */
  const temporalProfile = React.useMemo<TemporalProfile | null>(() => {
    try {
      const wornHistory = loadWornHistory();
      if (wornHistory.length < 3) return null;
      // dayDataMapをcalendarDataから構築
      const dayMap = new Map<string, { events?: Array<{ event_type: string }> }>();
      if (calendarData) {
        for (const d of calendarData.days) {
          dayMap.set(d.date, { events: d.events });
        }
      }
      return buildTemporalProfile(wornHistory, dayMap);
    } catch { return null; }
  }, [calendarData]);

  const comboGraph = React.useMemo<ComboGraph | null>(() => {
    try {
      const wornHistory = loadWornHistory();
      if (wornHistory.length < 3) return null;
      const dayMap = new Map<string, { weather?: import("./_lib/types").WeatherDaily | null }>();
      if (calendarData) {
        for (const d of calendarData.days) {
          dayMap.set(d.date, { weather: d.weather_daily });
        }
      }
      return buildComboGraph(wornHistory, dayMap);
    } catch { return null; }
  }, [calendarData]);

  /* ── 6エンジン: Aneurasync観測コンテキスト & 適応 ── */
  const observationContext = React.useMemo<ObservationContext | null>(() => {
    try {
      return buildObservationContext(personaProfile);
    } catch { return null; }
  }, [personaProfile]);

  /* ── ワードローブギャップ分析 ── */
  const gapAnalysis = React.useMemo<GapAnalysis | null>(() => {
    if (wardrobeItems.length === 0) return null;
    try {
      return analyzeWardrobeGaps(wardrobeItems);
    } catch { return null; }
  }, [wardrobeItems]);

  /* ── Outfit DNA スタイル重心 ── */
  const styleCentroid = React.useMemo<OutfitDnaVector | null>(() => {
    try {
      const wornHistory = loadWornHistory();
      if (wornHistory.length < 3) return null;
      // 着用済みアイテムからDNAベクトルを収集
      const dnaVectors: OutfitDnaVector[] = [];
      for (const record of wornHistory.slice(-30)) { // 直近30日
        const items = record.itemIds
          .map(id => wardrobeItems.find(w => w.id === id))
          .filter(Boolean) as WardrobeItem[];
        if (items.length >= 2) {
          dnaVectors.push(computeOutfitDna(items));
        }
      }
      if (dnaVectors.length < 3) return null;
      return computeStyleCentroid(dnaVectors);
    } catch { return null; }
  }, [wardrobeItems]);

  /* ── 双方向フィードバック統合 ── */
  const feedbackSummary = React.useMemo<FeedbackSummary | null>(() => {
    try {
      const summary = buildFeedbackSummary();
      return summary.totalDataPoints > 0 ? summary : null;
    } catch { return null; }
  }, []);

  /* ── 天気ドリフトチェック ── */
  React.useEffect(() => {
    if (!shouldCheckWeather()) return;
    const checkDrift = async () => {
      try {
        const today = new Date();
        const dates: string[] = [];
        for (let i = 0; i < 4; i++) {
          const d = new Date(today);
          d.setDate(today.getDate() + i);
          dates.push(d.toISOString().split("T")[0]);
        }
        const res = await fetch(`/api/calendar/weather-check?dates=${dates.join(",")}`);
        if (!res.ok) return;
        const data = await res.json();
        setLastWeatherCheck();
        if (data.drifts?.length > 0) {
          setWeatherDrifts(data.drifts);
        }
      } catch { /* ignore */ }
    };
    void checkDrift();
  }, []);

  /* ── データ取得 ── */
  const fetchCalendar = React.useCallback(async (): Promise<CalendarData | null> => {
    try {
      const res = await fetch(`/api/calendar/month?year=${currentYear}&month=${currentMonth}`, { cache: "no-store" });
      const data = await res.json();
      setCalendarData(data);
      return data;
    } catch (err) {
      console.error("Failed to fetch calendar:", err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [currentYear, currentMonth]);

  React.useEffect(() => { setLoading(true); void fetchCalendar(); }, [fetchCalendar]);

  // Wardrobe: bridge API 優先、localStorage フォールバック
  React.useEffect(() => {
    let active = true;
    (async () => {
      // 1. サーバーから取得
      try {
        const res = await fetch("/api/my-style/bridge", { cache: "no-store" });
        if (res.ok && active) {
          const json = await res.json();
          const remote = json?.remoteState?.wardrobe;
          if (Array.isArray(remote) && remote.length > 0) {
            setWardrobeItems(remote);
            return;
          }
        }
      } catch { /* fallback to localStorage */ }
      // 2. フォールバック: localStorage
      if (!active) return;
      try {
        const raw = localStorage.getItem(WARDROBE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        setWardrobeItems(data.wardrobe ?? []);
      } catch { setWardrobeItems([]); }
    })();
    return () => { active = false; };
  }, []);

  // PersonaGenome 取得
  React.useEffect(() => {
    let active = true;
    const loadGenome = async () => {
      try {
        const res = await fetch("/api/aneurasync/genome", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!active || !data?.genome) return;
        setPersonaProfile(extractCalendarProfile(data.genome));
      } catch {
        // PersonaGenomeが未構築でもカレンダーは正常動作
      }
    };
    void loadGenome();
    return () => { active = false; };
  }, []);

  React.useEffect(() => {
    let active = true;
    const loadOffice = async () => {
      setOfficeLoading(true); setOfficeMessage(null);
      try {
        const [subRes, officeRes] = await Promise.all([
          fetch("/api/weather/subscription", { cache: "no-store" }),
          fetch("/api/weather/offices", { cache: "no-store" }),
        ]);
        const subJson = await subRes.json().catch(() => ({}));
        const officeJson = await officeRes.json().catch(() => ({}));
        if (!active) return;
        if (subJson?.subscription?.office_code) setOfficeCode(String(subJson.subscription.office_code));
        if (Array.isArray(officeJson?.offices)) setOfficeOptions(officeJson.offices);
      } catch { if (!active) return; setOfficeOptions([]); }
      finally { if (active) setOfficeLoading(false); }
    };
    void loadOffice();
    return () => { active = false; };
  }, []);

  /* ── ハンドラー ── */
  const handleSaveOffice = async () => {
    if (!officeCode.trim()) return;
    setOfficeSaving(true); setOfficeMessage(null);
    try {
      const res = await fetch("/api/weather/subscription", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ office_code: officeCode.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) setOfficeMessage("天気設定の保存に失敗しました");
      else { setOfficeMessage("天気設定を保存しました"); await fetchCalendar(); }
    } catch { setOfficeMessage("天気設定の保存に失敗しました"); }
    finally { setOfficeSaving(false); }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/calendar/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: currentYear, month: currentMonth }),
      });
      if (res.ok) await fetchCalendar();
    } catch (err) { console.error("Failed to generate:", err); }
    finally { setGenerating(false); }
  };

  const handleSaveWornRecord = async (record: WornRecord) => {
    saveWornRecord(record);

    // 拒否トラッキング: 提案と実際着用の差分を記録
    const dayProposal = dayProposals.get(record.date);
    if (dayProposal) {
      const proposedIds = dayProposal.main.items.map(i => i.id);
      const chosenIds = record.itemIds;
      const hasDifference = proposedIds.some(id => !chosenIds.includes(id));
      if (hasDifference) {
        const dayData = calendarData?.days.find(d => d.date === record.date);
        recordRejection({
          date: record.date,
          proposedItemIds: proposedIds,
          chosenItemIds: chosenIds,
          weatherIcon: dayData?.weather_daily?.weather_icon,
          events: dayData?.events.map(e => e.event_type) ?? [],
          timestamp: Date.now(),
        });
      }
    }

    // 気分×天気×曜日 3次元データ記録
    const dayData = calendarData?.days.find(d => d.date === record.date);
    if (dayData) {
      const items = record.itemIds
        .map(id => wardrobeItems.find(w => w.id === id))
        .filter(Boolean) as WardrobeItem[];
      const fOrder: Record<string, number> = { casual: 0, smart: 1, dress: 2 };
      const avgFormality = items.length > 0
        ? items.reduce((sum, i) => sum + (fOrder[i.formality ?? "casual"] ?? 0), 0) / items.length
        : 0;
      // タグ抽出
      const tags: string[] = [];
      if (record.note) {
        for (const tag of ["暑かった", "寒かった", "動きにくかった", "褒められた", "気分が上がった"]) {
          if (record.note.includes(`[${tag}]`)) tags.push(tag);
        }
      }
      saveMoodRecord({
        date: record.date,
        dayOfWeek: new Date(record.date).getDay(),
        weatherIcon: dayData.weather_daily?.weather_icon ?? "sun",
        satisfaction: record.satisfaction,
        tags,
        formalityLevel: avgFormality,
        colorBrightness: 0.5, // 簡易デフォルト
      });
    }

    try {
      await fetch("/api/calendar/day", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: record.date,
          worn_record: {
            itemIds: record.itemIds,
            satisfaction: record.satisfaction,
            note: record.note,
          },
        }),
      });
    } catch (err) {
      console.error("Failed to save worn record to server:", err);
    }
  };

  const goToPrevMonth = () => {
    if (currentMonth === 1) { setCurrentYear(y => y - 1); setCurrentMonth(12); }
    else setCurrentMonth(m => m - 1);
  };
  const goToNextMonth = () => {
    if (currentMonth === 12) { setCurrentYear(y => y + 1); setCurrentMonth(1); }
    else setCurrentMonth(m => m + 1);
  };

  /* ── 提案生成 ── */
  const recentlyWornIds = React.useMemo(() => getRecentlyWornItemIds(7), []);

  const dayProposals = React.useMemo(() => {
    if (!calendarData || wardrobeItems.length === 0) return new Map<string, DayProposal>();
    const map = new Map<string, DayProposal>();
    for (const day of calendarData.days) {
      // 拡張天気コンテキスト構築 (湿度・風速考慮)
      const extWeather = buildExtendedWeatherContext(day.weather_daily);

      // Aneurasync適応指示
      const adaptation = observationContext
        ? computeOutfitAdaptation(observationContext, day.events)
        : null;

      // 拡張オプション
      const extOpts: OutfitExtendedOptions = {
        extWeather,
        comboGraph,
        adaptation,
      };

      const proposal = generateDayProposal(wardrobeItems, day.date, day.weather_daily, day.events, recentlyWornIds, undefined, personaProfile, satisfactionProfile, extOpts);
      if (proposal) {
        // インサイト生成 (6エンジン統合)
        const blend = getSeasonBlend(day.date);
        const dayOfWeek = new Date(day.date).getDay();
        proposal.insights = generateInsights(
          proposal.main.items,
          day.weather_daily,
          day.events,
          personaProfile,
          satisfactionProfile,
          blend,
          {
            temporal: temporalProfile,
            comboGraph,
            extWeather,
            observation: observationContext,
            adaptation,
            dayOfWeek,
          },
        );
        // 朝/午後分割
        const tempSplit = getDayTemperatureSplit(day.weather_daily);
        if (tempSplit.needsMorningLayer && proposal.main.items.length >= 3) {
          const outerItems = proposal.main.items.filter(i => (i.categoryMain || i.category) === "outer" || (i.categoryMain || i.category) === "outerwear");
          const coreItems = proposal.main.items.filter(i => (i.categoryMain || i.category) !== "outer" && (i.categoryMain || i.category) !== "outerwear");
          if (outerItems.length > 0) {
            proposal.morningAfternoonSplit = {
              morningItems: proposal.main.items,
              afternoonItems: coreItems,
            };
          }
        }
        map.set(day.date, proposal);
      }
    }
    return map;
  }, [calendarData, wardrobeItems, recentlyWornIds, personaProfile, satisfactionProfile, temporalProfile, comboGraph, observationContext]);

  /* ── カレンダーグリッド ── */
  const calendarGrid = React.useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth - 1, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const grid: (DayData | null)[] = [];
    for (let i = 0; i < firstDay; i++) grid.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayData = calendarData?.days.find(d => d.date === dateStr);
      grid.push(dayData ?? { date: dateStr, dayOfWeek: new Date(dateStr).getDay(), outfit: null, events: [], weather_daily: null });
    }
    return grid;
  }, [calendarData, currentYear, currentMonth]);

  /* ── 今週データ ── */
  const weekDays = React.useMemo(() => {
    if (!calendarData) return [];
    const todayDate = new Date(todayStr);
    const dayOfWeek = todayDate.getDay();
    const weekStart = new Date(todayDate);
    weekStart.setDate(todayDate.getDate() - dayOfWeek);
    const days: DayData[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const ds = d.toISOString().split("T")[0];
      const hit = calendarData.days.find(dd => dd.date === ds);
      if (hit) days.push(hit);
      else days.push({ date: ds, dayOfWeek: d.getDay(), outfit: null, events: [], weather_daily: null });
    }
    return days;
  }, [calendarData, todayStr]);

  /* ── 月間統計 ── */
  const monthSummary = React.useMemo(() => {
    if (!calendarData) return null;
    const days = calendarData.days;
    const wornDays = days.filter(d => d.outfit?.is_worn).length;
    const completionRate = days.length > 0 ? Math.round((wornDays / days.length) * 100) : 0;
    const rainyDays = days.filter(d => d.weather_daily?.outfit_tag === "rain" || d.weather_daily?.weather_icon === "rain").length;
    const temps = days.map(d => d.weather_daily?.temp_max).filter((t): t is number => t != null);
    const avgTemp = temps.length > 0 ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length) : null;
    const eventCount = days.reduce((sum, d) => sum + d.events.length, 0);
    return { wornDays, completionRate, rainyDays, avgTemp, eventCount };
  }, [calendarData]);

  const todayData = calendarData?.days.find(d => d.date === todayStr) ?? null;
  const todayProposal = dayProposals.get(todayStr) ?? null;
  const todayWeather = todayData?.weather_daily ?? null;

  const tomorrowStr = React.useMemo(() => {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayStr]);
  const tomorrowData = calendarData?.days.find(d => d.date === tomorrowStr) ?? null;
  const tomorrowProposal = dayProposals.get(tomorrowStr) ?? null;

  /* ── スタイリングTip ── */
  const stylingTip = React.useMemo(() => {
    const w = todayWeather;
    if (!w) return null;
    const temp = w.temp_max ?? w.temp_min ?? null;
    const isRain = w.outfit_tag === "rain" || w.weather_icon === "rain" || w.weather_icon === "storm";
    if (isRain) return { icon: "☔", text: "防水アウター＋ダークカラーが安心。足元は撥水シューズで", color: "blue" as const };
    if (w.weather_icon === "snow") return { icon: "❄️", text: "レイヤードで温度調整。インナーダウン＋ウールコートが最適", color: "indigo" as const };
    if (temp !== null && temp >= 30) return { icon: "🔥", text: "通気性のいいリネン・薄手コットン素材を。淡色が涼しげ", color: "amber" as const };
    if (temp !== null && temp >= 25) return { icon: "🌿", text: "半袖Tee＋軽めパンツでリラックス。日差し対策にハット", color: "emerald" as const };
    if (temp !== null && temp >= 15) return { icon: "🍂", text: "薄手アウター＋ロンTの重ね着がちょうどいい気温帯", color: "orange" as const };
    if (temp !== null && temp >= 5) return { icon: "🧥", text: "コート必須。マフラー＋手袋で防寒。ニット＋ボトムを暖色で", color: "violet" as const };
    if (temp !== null && temp < 5) return { icon: "🥶", text: "最大防寒: ダウン＋ヒートテック＋厚手ボトム。暖色でアクセント", color: "slate" as const };
    return { icon: "🌤️", text: "過ごしやすい天気。好きなスタイルを楽しんで", color: "gray" as const };
  }, [todayWeather]);

  const tipColorMap: Record<string, string> = {
    blue: "bg-blue-50/30 border-blue-200/30", indigo: "bg-indigo-50/30 border-indigo-200/30",
    amber: "bg-amber-50/30 border-amber-200/30", emerald: "bg-emerald-50/30 border-emerald-200/30",
    orange: "bg-orange-50/30 border-orange-200/30", violet: "bg-violet-50/30 border-violet-200/30",
    slate: "bg-slate-50/30 border-slate-200/30", gray: "bg-gray-50/30 border-gray-200/30",
  };

  const streak = React.useMemo(() => {
    if (!calendarData) return 0;
    const sorted = [...calendarData.days].filter(d => d.date <= todayStr).sort((a, b) => b.date.localeCompare(a.date));
    let count = 0;
    for (const d of sorted) { if (d.outfit?.is_worn) count++; else break; }
    return count;
  }, [calendarData, todayStr]);

  /* ── 季節アトモスフィア ── */
  const seasonalGradient = React.useMemo(() => {
    if (currentMonth >= 3 && currentMonth <= 5) return "from-pink-50/20 to-green-50/10"; // 春
    if (currentMonth >= 6 && currentMonth <= 8) return "from-cyan-50/20 to-yellow-50/10"; // 夏
    if (currentMonth >= 9 && currentMonth <= 11) return "from-orange-50/20 to-amber-50/10"; // 秋
    return "from-blue-50/20 to-slate-50/10"; // 冬
  }, [currentMonth]);

  /* ── レンダリング ── */
  return (
    <LightBackground>
      <Suspense fallback={null}><AlterContextBanner page="calendar" /></Suspense>
      {/* ── 季節アトモスフィア ── */}
      <div className={`fixed inset-0 pointer-events-none bg-gradient-to-b ${seasonalGradient} z-0`} />

      {/* ── ヘッダー ── */}
      <GlassNavbar>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="w-9 h-9 rounded-full bg-white/40 backdrop-blur-sm border border-white/50 flex items-center justify-center text-gray-400 hover:bg-white/70 transition-all">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </Link>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-gray-800">Coordinate Calendar</h1>
              <p className="text-[10px] text-gray-400 tracking-wide">SYNC-Powered Daily Styling</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <motion.button onClick={() => setShowWeatherSettings(v => !v)}
              className="w-9 h-9 rounded-full bg-white/40 backdrop-blur-sm border border-white/50 flex items-center justify-center text-gray-400 hover:bg-white/70 transition-all text-sm"
              whileTap={{ scale: 0.9 }}>🌤️</motion.button>
            <motion.button onClick={handleGenerate} disabled={generating}
              className="h-9 px-4 rounded-full bg-gradient-to-r from-violet-500/90 to-indigo-500/90 backdrop-blur-sm text-white text-xs font-semibold disabled:opacity-50 shadow-lg shadow-violet-500/20 border border-white/20"
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              {generating ? "..." : "AI生成"}
            </motion.button>
          </div>
        </div>
      </GlassNavbar>

      <div className="h-20" />

      <main className="max-w-6xl mx-auto px-4 pb-32">
        {/* ── 天気設定 ── */}
        <AnimatePresence>
          {showWeatherSettings && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-4">
              <GlassCard className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-700">天気地域設定（気象庁）</span>
                  <span className="text-[9px] text-slate-400">保存した地域コードで最新予報を取得</span>
                </div>
                <div className="flex gap-2">
                  {officeOptions.length > 0 ? (
                    <select value={officeCode} onChange={e => setOfficeCode(e.target.value)}
                      className="flex-1 rounded-xl bg-white/80 border border-slate-200/60 px-3 py-2 text-xs text-slate-700 backdrop-blur-sm" disabled={officeLoading}>
                      <option value="">地域を選択</option>
                      {officeOptions.map(opt => <option key={opt.code} value={opt.code}>{opt.name}</option>)}
                    </select>
                  ) : (
                    <input value={officeCode} onChange={e => setOfficeCode(e.target.value)} placeholder="地域コード（例: 130000）"
                      className="flex-1 rounded-xl bg-white/80 border border-slate-200/60 px-3 py-2 text-xs text-slate-700 backdrop-blur-sm" disabled={officeLoading} />
                  )}
                  <button onClick={handleSaveOffice} disabled={officeSaving || officeLoading || !officeCode.trim()}
                    className="rounded-xl bg-slate-800 text-white px-4 py-2 text-xs font-semibold hover:bg-slate-700 disabled:opacity-40 transition">
                    {officeSaving ? "..." : "保存"}
                  </button>
                </div>
                {officeMessage && <p className="mt-2 text-[10px] text-slate-500">{officeMessage}</p>}
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="flex flex-col items-center justify-center h-[60vh]">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              className="w-12 h-12 rounded-full border-2 border-violet-200 border-t-violet-500" />
            <p className="mt-4 text-sm text-gray-400">Loading...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* ── オンボーディング ── */}
            <OnboardingTooltip />

            {/* ── 天気ドリフトバナー ── */}
            {weatherDrifts.length > 0 && (
              <WeatherDriftBanner
                drifts={weatherDrifts}
                onRegenerate={async (dates) => {
                  for (const date of dates) {
                    await fetch("/api/calendar/regenerate", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ date, reason: "weather_drift" }),
                    });
                  }
                  await fetchCalendar();
                  setWeatherDrifts([]);
                }}
              />
            )}

            {/* ── 季節遷移ヒント ── */}
            {(() => {
              const blend = getSeasonBlend(todayStr);
              const hints = getSeasonalRotationHints(todayStr);
              const tempSplit = getDayTemperatureSplit(todayWeather);
              const morningMsg = tempSplit.needsMorningLayer
                ? `朝${tempSplit.morningTemp ?? "-"}°→午後${tempSplit.afternoonTemp ?? "-"}°。寒暖差${tempSplit.tempRange}°に対応したレイヤードを`
                : undefined;
              return <SeasonalTransitionHint blend={blend} hints={hints} morningAfternoonMessage={morningMsg} />;
            })()}

            {/* ── 学習ステータス ── */}
            {(satisfactionProfile && satisfactionProfile.dataPoints >= 3) || (feedbackSummary && feedbackSummary.totalDataPoints >= 3) ? (
              <div className="rounded-xl bg-emerald-50/40 border border-emerald-200/30 px-3 py-1.5 flex items-center gap-2">
                <span className="text-xs">📊</span>
                <p className="text-[9px] text-emerald-600 font-medium">
                  着用データ{satisfactionProfile?.dataPoints ?? 0}日分
                  {feedbackSummary && feedbackSummary.totalDataPoints > 0 && (
                    <span className="text-[8px] text-emerald-500"> + フィードバック{feedbackSummary.totalDataPoints}件から学習中</span>
                  )}
                </p>
              </div>
            ) : null}

            {/* ── ワードローブ分析 ── */}
            {gapAnalysis && gapAnalysis.gaps.length > 0 && (
              <FadeInView delay={0.03}>
                <WardrobeGapCard analysis={gapAnalysis} />
              </FadeInView>
            )}

            {/* ── ヒーロー：月ナビ + 天気（スワイプ対応） ── */}
            <FadeInView>
              <motion.div
                className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white/60 via-white/40 to-white/20 backdrop-blur-2xl border border-white/50 shadow-[0_8px_60px_-20px_rgba(120,100,200,0.15)] p-5"
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.15}
                onDragEnd={(_e, info) => {
                  if (info.offset.x > 80) goToPrevMonth();
                  else if (info.offset.x < -80) goToNextMonth();
                }}
              >
                <div className="pointer-events-none absolute -top-20 -right-20 w-48 h-48 rounded-full bg-gradient-to-br from-violet-300/20 to-indigo-400/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-gradient-to-br from-pink-300/15 to-rose-400/5 blur-2xl" />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <motion.button onClick={goToPrevMonth} className="w-8 h-8 rounded-full bg-white/40 border border-white/50 flex items-center justify-center text-gray-400 hover:bg-white/70 transition" whileTap={{ scale: 0.85 }}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                    </motion.button>
                    <div className="text-center">
                      <p className="text-2xl font-black tracking-tight text-gray-800">{currentMonth}<span className="text-base font-normal text-gray-400 ml-0.5">月</span></p>
                      <p className="text-[10px] text-gray-400 -mt-0.5">{currentYear}</p>
                    </div>
                    <motion.button onClick={goToNextMonth} className="w-8 h-8 rounded-full bg-white/40 border border-white/50 flex items-center justify-center text-gray-400 hover:bg-white/70 transition" whileTap={{ scale: 0.85 }}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                    </motion.button>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      {todayWeather && (
                        <>
                          <div className="flex items-baseline gap-1.5 justify-end">
                            <span className="text-3xl">{DAILY_WEATHER_ICONS[todayWeather.weather_icon] ?? "🌤️"}</span>
                            <span className="text-lg font-bold text-gray-700">{todayWeather.temp_min ?? "-"}°/{todayWeather.temp_max ?? "-"}°</span>
                          </div>
                          {todayWeather.pop_max != null && <p className="text-[10px] text-blue-400 mt-0.5">降水確率 {todayWeather.pop_max}%</p>}
                        </>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 rounded-full bg-white/50 border border-white/60 px-2.5 py-1">
                        <span className="text-[10px]">👗</span>
                        <span className="text-[10px] font-bold text-gray-600">{monthSummary?.wornDays ?? 0}</span>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-full bg-white/50 border border-white/60 px-2.5 py-1">
                        <span className="text-[10px]">📌</span>
                        <span className="text-[10px] font-bold text-gray-600">{monthSummary?.eventCount ?? 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </FadeInView>

            {/* ── 今日のSYNC提案ヒーロー ── */}
            {todayProposal && (
              <FadeInView delay={0.04}>
                <motion.button onClick={() => setSelectedDay(todayData!)}
                  className="w-full text-left relative overflow-hidden rounded-3xl bg-gradient-to-br from-white/50 via-white/30 to-violet-50/20 backdrop-blur-2xl border border-white/40 shadow-[0_12px_50px_-15px_rgba(100,80,200,0.12)] p-4 sm:p-5 group"
                  whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
                  <div className="pointer-events-none absolute -top-16 right-8 w-40 h-40 rounded-full bg-gradient-to-br from-violet-400/10 to-pink-400/5 blur-3xl group-hover:scale-110 transition-transform duration-700" />
                  <div className="relative flex items-start gap-4">
                    {/* SYNCリング */}
                    <div className="shrink-0 relative w-20 h-20 sm:w-24 sm:h-24">
                      <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                        <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="6" />
                        <circle cx="50" cy="50" r="42" fill="none"
                          stroke={SYNC_BAND_COLORS[todayProposal.main.sync.band].ring}
                          strokeWidth="6" strokeLinecap="round"
                          strokeDasharray={`${(todayProposal.main.sync.total / 100) * 264} 264`} />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-xl font-black ${SYNC_BAND_COLORS[todayProposal.main.sync.band].text}`}>
                          {todayProposal.main.sync.total}
                        </span>
                        <span className="text-[7px] text-gray-400 uppercase font-bold">SYNC</span>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 pt-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[9px] font-bold tracking-widest text-violet-500 uppercase">Today&apos;s Proposal</span>
                        <span className={`text-[8px] font-bold rounded-full px-1.5 py-0.5 ${SYNC_BAND_COLORS[todayProposal.main.sync.band].bg} ${SYNC_BAND_COLORS[todayProposal.main.sync.band].text}`}>
                          {todayProposal.main.moodTag}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-gray-700 mb-1.5 truncate">
                        {todayProposal.main.items.map(i => i.name).join(" + ")}
                      </p>
                      <p className="text-[10px] text-gray-400 line-clamp-2 mb-2">
                        {todayProposal.insights.length > 0
                          ? `${todayProposal.insights[0].icon} ${todayProposal.insights[0].text}`
                          : todayProposal.main.reason}
                      </p>
                      <div className="flex gap-1.5">
                        {todayProposal.main.items.slice(0, 4).map((item, i) => (
                          <div key={i} className="w-10 h-10 rounded-lg bg-white/60 border border-white/50 overflow-hidden shadow-sm flex items-center justify-center">
                            {item.imageUrl ? (
                              <Image src={item.imageUrl} alt="" width={40} height={40} className="w-full h-full object-contain p-0.5" loader={passthroughLoader} unoptimized />
                            ) : (
                              <span className="text-xs text-gray-300">{item.category === "tops" ? "👕" : item.category === "bottoms" ? "👖" : "👟"}</span>
                            )}
                          </div>
                        ))}
                      </div>
                      {todayProposal.main.risks.length > 0 && (
                        <div className="mt-2 flex items-center gap-1 text-[9px] text-amber-500">
                          <span>⚡</span><span>{todayProposal.main.risks[0].message}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.button>
              </FadeInView>
            )}

            {/* ── ワードローブ未登録フォールバック ── */}
            {!todayProposal && wardrobeItems.length === 0 && !loading && (
              <FadeInView delay={0.04}>
                <div className="rounded-3xl bg-gradient-to-br from-white/50 to-violet-50/20 backdrop-blur-2xl border border-white/40 p-6 text-center">
                  <p className="text-4xl mb-3">👗</p>
                  <p className="text-sm font-bold text-gray-700 mb-1">SYNC提案を受けるには</p>
                  <p className="text-xs text-gray-400 mb-4">ワードローブにアイテムを登録すると、天気・予定・好みに合わせた毎日のコーデ提案が届きます</p>
                  <Link href="/my-style" className="inline-block rounded-full bg-gray-800 text-white px-6 py-2.5 text-xs font-bold hover:bg-gray-700 transition no-underline">
                    My Style でアイテムを登録
                  </Link>
                </div>
              </FadeInView>
            )}

            {/* ── 明日のプレビュー ── */}
            {tomorrowProposal && tomorrowData && (
              <FadeInView delay={0.05}>
                <motion.button onClick={() => setSelectedDay(tomorrowData)}
                  className="w-full text-left rounded-2xl bg-white/30 backdrop-blur-xl border border-white/40 p-3 group"
                  whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="shrink-0 relative w-10 h-10">
                        <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="6" />
                          <circle cx="50" cy="50" r="42" fill="none"
                            stroke={SYNC_BAND_COLORS[tomorrowProposal.main.sync.band].ring}
                            strokeWidth="6" strokeLinecap="round"
                            strokeDasharray={`${(tomorrowProposal.main.sync.total / 100) * 264} 264`} />
                        </svg>
                        <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-black ${SYNC_BAND_COLORS[tomorrowProposal.main.sync.band].text}`}>
                          {tomorrowProposal.main.sync.total}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-[9px] font-bold tracking-widest text-gray-400 uppercase">Tomorrow</span>
                        <p className="text-xs font-bold text-gray-600 truncate">{tomorrowProposal.main.items.map(i => i.name).join(" + ")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {tomorrowData.weather_daily && (
                        <span className="text-lg">{DAILY_WEATHER_ICONS[tomorrowData.weather_daily.weather_icon] ?? "🌤️"}</span>
                      )}
                      <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </div>
                  </div>
                </motion.button>
              </FadeInView>
            )}

            {/* ── スタイリングTip ── */}
            {stylingTip && (
              <FadeInView delay={0.06}>
                <div className={`relative overflow-hidden rounded-2xl border backdrop-blur-xl p-3.5 ${tipColorMap[stylingTip.color] ?? tipColorMap.gray}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl shrink-0">{stylingTip.icon}</span>
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-0.5">Styling Tip</p>
                      <p className="text-xs text-gray-600 font-medium leading-relaxed">{stylingTip.text}</p>
                    </div>
                  </div>
                </div>
              </FadeInView>
            )}

            {/* ── 週間雰囲気 ── */}
            {weekDays.length > 0 && (
              <FadeInView delay={0.06}>
                <WeekAtmosphereBar weekDays={weekDays} />
              </FadeInView>
            )}

            {/* ── 月間サマリー ── */}
            {monthSummary && (
              <FadeInView delay={0.07}>
                <div className="rounded-2xl bg-white/40 backdrop-blur-sm border border-white/50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Monthly Summary</span>
                    <span className="text-[9px] font-bold text-violet-500">{currentYear}/{currentMonth}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="text-center">
                      <div className="relative w-10 h-10 mx-auto">
                        <svg viewBox="0 0 36 36" className="w-10 h-10 transform -rotate-90">
                          <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="3" />
                          <circle cx="18" cy="18" r="15" fill="none"
                            stroke={monthSummary.completionRate >= 70 ? "#10b981" : monthSummary.completionRate >= 40 ? "#f59e0b" : "#94a3b8"}
                            strokeWidth="3" strokeLinecap="round"
                            strokeDasharray={`${(monthSummary.completionRate / 100) * 94.2} 94.2`} />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-gray-600">{monthSummary.completionRate}%</span>
                      </div>
                      <div className="text-[8px] font-bold text-gray-400 mt-1">コーデ率</div>
                    </div>
                    <div className="text-center"><div className="text-lg font-black text-violet-600">{monthSummary.wornDays}</div><div className="text-[8px] font-bold text-gray-400">着用日</div></div>
                    <div className="text-center"><div className="text-lg font-black text-blue-600">{monthSummary.rainyDays}</div><div className="text-[8px] font-bold text-gray-400">雨の日</div></div>
                    <div className="text-center"><div className="text-lg font-black text-amber-600">{monthSummary.avgTemp ?? "-"}°</div><div className="text-[8px] font-bold text-gray-400">平均気温</div></div>
                  </div>
                </div>
              </FadeInView>
            )}

            {/* ── 週間プランナー ── */}
            {weekDays.length > 0 && (
              <FadeInView delay={0.08}>
                <div>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">This Week</span>
                    {streak > 0 && (
                      <span className="text-[9px] font-bold text-orange-500 bg-orange-50/80 rounded-full px-2 py-0.5 flex items-center gap-1 border border-orange-200/30">
                        🔥 {streak}日連続コーデ
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                    {weekDays.map(wd => {
                      const isT = wd.date === todayStr;
                      const dayNum = parseInt(wd.date.split("-")[2], 10);
                      const wIcon = wd.weather_daily ? DAILY_WEATHER_ICONS[wd.weather_daily.weather_icon] ?? "🌤️" : null;
                      const hasO = !!wd.outfit?.is_worn;
                      const wdProposal = dayProposals.get(wd.date);
                      const firstImg = wd.outfit?.outfit_items?.[0]?.image_url;
                      return (
                        <motion.button key={wd.date} onClick={() => setSelectedDay(wd)}
                          className={`shrink-0 w-[76px] rounded-2xl overflow-hidden border transition-all ${
                            isT ? "bg-violet-50/50 border-violet-300/50 shadow-sm shadow-violet-500/10"
                              : hasO ? "bg-white/50 border-white/60 shadow-sm" : "bg-white/25 border-white/30"
                          }`}
                          whileHover={{ y: -3, scale: 1.03 }} whileTap={{ scale: 0.95 }}>
                          <div className="p-2 text-center">
                            <p className={`text-[9px] font-semibold ${isT ? "text-violet-500" : "text-gray-400"}`}>{WEEKDAYS[wd.dayOfWeek]}</p>
                            <p className={`text-sm font-bold ${isT ? "text-violet-600" : "text-gray-600"}`}>{dayNum}</p>
                            {wIcon && <p className="text-sm mt-0.5">{wIcon}</p>}
                          </div>
                          <div className="h-14 bg-gray-50/30 flex items-center justify-center border-t border-white/20">
                            {firstImg ? (
                              <Image src={firstImg} alt="" width={48} height={48} className="h-12 w-12 object-contain" loader={passthroughLoader} unoptimized />
                            ) : hasO ? <span className="text-lg opacity-50">✓</span> : <span className="text-xs text-gray-300">—</span>}
                          </div>
                          {wdProposal && (
                            <div className="px-1 py-1 text-center border-t border-white/20">
                              <span className={`text-[7px] font-bold ${SYNC_BAND_COLORS[wdProposal.main.sync.band].text}`}>SYNC {wdProposal.main.sync.total}</span>
                            </div>
                          )}
                          {wd.events.length > 0 && !wdProposal && (
                            <div className="px-1.5 py-1 text-center border-t border-white/20">
                              <span className="text-[7px] font-semibold text-pink-500 truncate block">{wd.events[0].event_name || wd.events[0].event_type}</span>
                            </div>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              </FadeInView>
            )}

            {/* ── カレンダーグリッド ── */}
            <FadeInView delay={0.09}>
              <div className="rounded-3xl bg-white/30 backdrop-blur-xl border border-white/40 shadow-[0_4px_40px_-15px_rgba(100,80,180,0.1)] p-3 sm:p-4">
                <div className="grid grid-cols-7 mb-1.5">
                  {WEEKDAYS.map((day, i) => (
                    <div key={day} className={`text-center text-[10px] font-semibold py-1.5 tracking-widest uppercase ${
                      i === 0 ? "text-rose-400" : i === 6 ? "text-blue-400" : "text-gray-400"
                    }`}>{day}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                  {calendarGrid.map((day, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.008, duration: 0.3 }}>
                      {day ? (
                        <DayCell day={day} isToday={day.date === todayStr} sync={dayProposals.get(day.date)?.main.sync ?? null} onClick={() => setSelectedDay(day)} />
                      ) : (
                        <div className="aspect-square" />
                      )}
                    </motion.div>
                  ))}
                </div>
                <p className="mt-2 text-[9px] text-slate-300 text-right">出典: 気象庁</p>
              </div>
            </FadeInView>

            {/* ── 月間レポート ── */}
            {calendarData && (monthSummary?.wornDays ?? 0) > 0 && (
              <FadeInView delay={0.1}>
                <div className="rounded-2xl bg-white/25 backdrop-blur-xl border border-white/30 p-4">
                  <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-3">Monthly Report</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center rounded-xl bg-white/40 border border-white/50 p-3 backdrop-blur-sm">
                      <p className="text-2xl font-black text-violet-600">{monthSummary?.wornDays ?? 0}</p><p className="text-[9px] text-gray-400 mt-0.5">コーデ確定</p>
                    </div>
                    <div className="text-center rounded-xl bg-white/40 border border-white/50 p-3 backdrop-blur-sm">
                      <p className="text-2xl font-black text-pink-500">{monthSummary?.eventCount ?? 0}</p><p className="text-[9px] text-gray-400 mt-0.5">予定</p>
                    </div>
                    <div className="text-center rounded-xl bg-white/40 border border-white/50 p-3 backdrop-blur-sm">
                      <p className="text-2xl font-black text-orange-500">{streak > 0 ? `${streak}🔥` : "—"}</p><p className="text-[9px] text-gray-400 mt-0.5">連続ストリーク</p>
                    </div>
                  </div>
                  {/* ── 実績バッジ ── */}
                  {(() => {
                    const badges: Array<{ icon: string; label: string; color: string }> = [];
                    // ストリークバッジ
                    if (streak >= 30) badges.push({ icon: "🏆", label: "30日連続", color: "text-amber-500 bg-amber-50/60 border-amber-200/40" });
                    else if (streak >= 14) badges.push({ icon: "💎", label: "14日連続", color: "text-violet-500 bg-violet-50/60 border-violet-200/40" });
                    else if (streak >= 7) badges.push({ icon: "🔥", label: "7日連続", color: "text-orange-500 bg-orange-50/60 border-orange-200/40" });
                    else if (streak >= 3) badges.push({ icon: "✨", label: "3日連続", color: "text-pink-500 bg-pink-50/60 border-pink-200/40" });
                    // 多様性バッジ
                    const usedCategories = new Set<string>();
                    const usedColors = new Set<string>();
                    for (const d of calendarData.days) {
                      if (!d.outfit?.is_worn) continue;
                      for (const item of d.outfit.outfit_items) {
                        usedCategories.add(item.category);
                        // 色推定（簡易）
                        const name = (item.title || "").toLowerCase();
                        for (const c of ["黒","白","紺","グレー","ベージュ","ブルー","レッド","グリーン","ピンク","ブラウン"]) {
                          if (name.includes(c)) usedColors.add(c);
                        }
                      }
                    }
                    if (usedCategories.size >= 4) badges.push({ icon: "🎯", label: "全カテゴリ制覇", color: "text-emerald-500 bg-emerald-50/60 border-emerald-200/40" });
                    if (usedColors.size >= 5) badges.push({ icon: "🎨", label: "カラバリマスター", color: "text-indigo-500 bg-indigo-50/60 border-indigo-200/40" });
                    // SYNCバッジ
                    const allSyncs = Array.from(dayProposals.values()).map(p => p.main.sync.total);
                    if (allSyncs.some(s => s >= 90)) badges.push({ icon: "💫", label: "完璧な1日", color: "text-violet-500 bg-violet-50/60 border-violet-200/40" });
                    // 満足度バッジ
                    if (satisfactionProfile && satisfactionProfile.dataPoints >= 10) {
                      const allAvgs = Array.from(satisfactionProfile.itemScores.values()).map(v => v.avg);
                      const overall = allAvgs.length > 0 ? allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length : 0;
                      if (overall >= 4) badges.push({ icon: "😊", label: "ハッピー月間", color: "text-amber-500 bg-amber-50/60 border-amber-200/40" });
                    }
                    if (badges.length === 0) return null;
                    return (
                      <div className="mt-3">
                        <p className="text-[9px] text-gray-400 mb-1.5">実績バッジ</p>
                        <div className="flex flex-wrap gap-1.5">
                          {badges.map((b, i) => (
                            <span key={i} className={`inline-flex items-center gap-1 text-[9px] font-bold rounded-full px-2 py-0.5 border ${b.color}`}>
                              {b.icon} {b.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  {(() => {
                    const freq: Record<string, { count: number; title: string; img: string }> = {};
                    for (const d of calendarData.days) {
                      if (!d.outfit?.is_worn) continue;
                      for (const item of d.outfit.outfit_items) {
                        if (!freq[item.card_id]) freq[item.card_id] = { count: 0, title: item.title, img: item.image_url };
                        freq[item.card_id].count++;
                      }
                    }
                    const top = Object.values(freq).sort((a, b) => b.count - a.count).slice(0, 3);
                    if (!top.length) return null;
                    return (
                      <div className="mt-3">
                        <p className="text-[9px] text-gray-400 mb-2">よく着たアイテム</p>
                        <div className="flex gap-2">
                          {top.map((item, i) => (
                            <div key={i} className="flex items-center gap-2 rounded-xl bg-white/40 border border-white/50 px-2.5 py-1.5 backdrop-blur-sm">
                              {item.img && (
                                <div className="w-7 h-7 rounded-lg overflow-hidden bg-gray-50 shrink-0">
                                  <Image src={item.img} alt="" width={28} height={28} className="w-full h-full object-contain" loader={passthroughLoader} unoptimized />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-[9px] font-bold text-gray-600 truncate max-w-[60px]">{item.title}</p>
                                <p className="text-[8px] text-gray-400">{item.count}回</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </FadeInView>
            )}

            {/* ── スタイル進化タイムライン ── */}
            {(() => {
              const wornHistory = loadWornHistory();
              const thisMonthRecords = wornHistory.filter(r => {
                const [y, m] = r.date.split("-");
                return parseInt(y) === currentYear && parseInt(m) === currentMonth;
              });
              const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
              const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
              const prevMonthRecords = wornHistory.filter(r => {
                const [y, m] = r.date.split("-");
                return parseInt(y) === prevYear && parseInt(m) === prevMonth;
              });
              if (thisMonthRecords.length < 3) return null;
              return (
                <FadeInView delay={0.11}>
                  <StyleEvolutionCard
                    currentMonthRecords={thisMonthRecords}
                    previousMonthRecords={prevMonthRecords}
                  />
                </FadeInView>
              );
            })()}
          </div>
        )}
      </main>

      {/* ── 今日フローティングボタン ── */}
      {(currentMonth !== today.getMonth() + 1 || currentYear !== today.getFullYear()) && (
        <motion.button
          onClick={() => { setCurrentYear(today.getFullYear()); setCurrentMonth(today.getMonth() + 1); }}
          className="fixed bottom-24 right-4 z-40 w-10 h-10 rounded-full bg-violet-500/90 text-white shadow-lg shadow-violet-500/30 flex items-center justify-center border border-white/20 backdrop-blur-sm"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <span className="text-xs font-bold">今日</span>
        </motion.button>
      )}

      {/* ── 日付詳細シート ── */}
      <AnimatePresence>
        {selectedDay && (() => {
          // 選択日の拡張天気＆後悔予測を計算
          const selExtWeather = buildExtendedWeatherContext(selectedDay.weather_daily);
          const selAdaptation = observationContext
            ? computeOutfitAdaptation(observationContext, selectedDay.events)
            : null;
          const selProposal = dayProposals.get(selectedDay.date) ?? null;
          const selRegret: RegretPrediction | null = selProposal
            ? predictRegret(
                selProposal.main.items,
                selectedDay.weather_daily,
                selectedDay.events,
                selExtWeather,
                {
                  satisfactionProfile,
                  comboGraph,
                  temporalProfile,
                  dayOfWeek: new Date(selectedDay.date).getDay(),
                },
              )
            : null;

          // Outfit DNA
          const selDna = selProposal
            ? computeOutfitDna(selProposal.main.items, selExtWeather)
            : null;
          const selAdventure = selDna && styleCentroid
            ? computeAdventureScore(selDna, styleCentroid)
            : null;

          // 代替提案
          const selSubstitutions = selProposal
            ? findSubstitutions(selProposal.main.items, wardrobeItems, selectedDay.weather_daily, selExtWeather, selectedDay.events)
            : null;

          // 深層時系列: 条件付きヒント
          const selDow = new Date(selectedDay.date).getDay();
          const selWeatherIcon = selectedDay.weather_daily?.weather_icon ?? "sun";
          const selCondHint = getConditionStyleHint(selDow, selWeatherIcon);

          // 深層時系列: ローテーション最適化
          const wornHistoryForRotation = loadWornHistory();
          const allRotation = wornHistoryForRotation.length >= 3
            ? computeRotationProfiles(wornHistoryForRotation, wardrobeItems)
            : [];
          // 提案内アイテムのローテーション状況のみ + overdue/never_worn
          const selRotation = selProposal
            ? allRotation.filter(rp =>
                selProposal.main.items.some(i => i.id === rp.itemId) &&
                (rp.status === "overdue" || rp.status === "never_worn" || rp.status === "optimal")
              ).slice(0, 3)
            : [];

          // 深層時系列: 季節スタイルシフト
          const selSeasonalShift = wornHistoryForRotation.length >= 5
            ? describeSeasonalShift(wornHistoryForRotation, wardrobeItems)
            : null;

          return (
            <DayDetailSheet
              day={selectedDay}
              proposal={selProposal}
              wornRecord={getWornRecordForDate(selectedDay.date)}
              wardrobeItems={wardrobeItems}
              onClose={() => setSelectedDay(null)}
              onSaveWornRecord={handleSaveWornRecord}
              regretPrediction={selRegret}
              extWeather={selExtWeather}
              outfitDna={selDna}
              styleCentroid={styleCentroid}
              adventureScore={selAdventure}
              substitutions={selSubstitutions}
              conditionHint={selCondHint}
              rotationHighlights={selRotation}
              seasonalShift={selSeasonalShift}
            />
          );
        })()}
      </AnimatePresence>

      <FloatingNavLight items={MAIN_NAV} activeHref="/calendar" />

      <FeatureIntroduction
        {...CALENDAR_INTRO}
        onComplete={() => {}}
      />
    </LightBackground>
  );
}
