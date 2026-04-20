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
} from "@/components/ui/glassmorphism-design";
import HomeQuickAccess from "@/components/home/HomeQuickAccess";
import type { WardrobeItem } from "@/app/my-style/_lib/types";
import { PREFECTURES, prefectureToOfficeCode } from "@/lib/shared/location";
import type { CalendarData, DayData, DayProposal, WornRecord, SatisfactionProfile, WeatherDrift } from "./_lib/types";
import { DAILY_WEATHER_ICONS, WEEKDAYS, SYNC_BAND_COLORS } from "./_lib/constants";
import { generateDayProposal } from "@/lib/shared/outfitEngine";
import { getRecentlyWornItemIds, saveWornRecord, getWornRecordForDate, loadWornHistory, isMemoryOnlyMode, wasHistoryTruncated } from "./_lib/rotationTracker";
import type { CalendarPersonaProfile } from "./_lib/personaBoost";
import { extractCalendarProfile } from "./_lib/personaBoost";
import { buildSatisfactionProfile } from "./_lib/satisfactionLearner";
import { generateInsights, getInsightCandidateCount } from "./_lib/insightEngine";
import { recordInsightShadow, getShadowSummary } from "./_lib/insightShadowLog";
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
import { buildProposalAxisChips } from "./_lib/proposalAxisChips";
import { computeStargazerInfluence } from "./_lib/stargazerInfluence";
import { predictRegret } from "./_lib/regretPredictor";
import type { RegretPrediction } from "./_lib/regretPredictor";
import type { OutfitExtendedOptions } from "@/lib/shared/outfitEngine";
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
import { retryFetch } from "@/lib/retryFetch";
import { useSaveToast } from "@/components/ui/SaveToastProvider";

/* ── 定数 ── */
const WARDROBE_KEY = "culcept_my_style_v3";
const passthroughLoader: ImageLoader = ({ src }) => src;


/* ── メインコンポーネント ── */
export default function CalendarPageClient() {
  usePassiveSensor("calendar");
  useFootprintTracker({ feature: "calendar" });
  const { showError } = useSaveToast();
  const storageWarningShown = React.useRef(false);

  // ── ストレージ劣化の検知・通知 (C4 + H3) ──
  const checkStorageHealth = React.useCallback(() => {
    if (storageWarningShown.current) return;
    if (isMemoryOnlyMode) {
      storageWarningShown.current = true;
      showError("ストレージが使用できないため、データはこのタブ内のみに保持されています");
    } else if (wasHistoryTruncated) {
      storageWarningShown.current = true;
      showError("ストレージ容量不足のため着用履歴を短縮しました");
    }
  }, [showError]);

  // Shadow log: devtools console から getShadowSummary() で確認可能
  React.useEffect(() => {
    if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
      (window as unknown as Record<string, unknown>).__insightShadow = getShadowSummary;
    }
  }, []);
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
  const [selectedPrefecture, setSelectedPrefecture] = React.useState("");
  const [officeOptions, setOfficeOptions] = React.useState<Array<{ code: string; name: string }>>([]);
  const [officeLoading, setOfficeLoading] = React.useState(true);
  const [officeSaving, setOfficeSaving] = React.useState(false);
  const [officeMessage, setOfficeMessage] = React.useState<string | null>(null);
  const [locationNotSet, setLocationNotSet] = React.useState(false);
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
  // 鮮度比較: remote savedAt < local なら local を優先（stale remote 防止）
  React.useEffect(() => {
    let active = true;
    (async () => {
      let remoteSavedAt: string | null = null;
      let remoteWardrobe: WardrobeItem[] | null = null;

      // 1. サーバーから取得
      try {
        const res = await fetch("/api/my-style/bridge", { cache: "no-store" });
        if (res.ok && active) {
          const json = await res.json();
          remoteSavedAt = json?.syncedAt ?? null;
          const remote = json?.remoteState?.wardrobe;
          if (Array.isArray(remote) && remote.length > 0) {
            remoteWardrobe = remote;
          }
          console.log(`[calendar wardrobe] bridge GET: status=200 wardrobeLen=${remoteWardrobe?.length ?? 0} syncedAt=${remoteSavedAt ?? "null"} remoteStateNull=${json?.remoteState === null}`);
        } else {
          console.warn(`[calendar wardrobe] bridge GET: status=${res?.status ?? "unknown"}`);
        }
      } catch (e) {
        console.warn("[calendar wardrobe] bridge GET failed:", e);
      }

      // 2. localStorage
      let localWardrobe: WardrobeItem[] | null = null;
      if (active) {
        try {
          const raw = localStorage.getItem(WARDROBE_KEY);
          if (raw) {
            const data = JSON.parse(raw);
            if (Array.isArray(data.wardrobe) && data.wardrobe.length > 0) {
              localWardrobe = data.wardrobe;
            }
          }
          console.log(`[calendar wardrobe] localStorage: wardrobeLen=${localWardrobe?.length ?? 0}`);
        } catch { /* continue */ }
      }

      // 3. IndexedDB: full-fidelity source (has base64 images)
      // My-Style writes full state to IndexedDB, but only image-stripped snapshots
      // to localStorage and bridge. IndexedDB is the only source with real photos.
      let idbWardrobe: WardrobeItem[] | null = null;
      if (active) {
        try {
          const { loadCachedState } = await import("@/app/(immersive)/my-style/_lib/stateCache");
          const cached = await loadCachedState<{ wardrobe?: WardrobeItem[] }>("my-style-state");
          if (cached && Array.isArray(cached.wardrobe) && cached.wardrobe.length > 0) {
            idbWardrobe = cached.wardrobe as WardrobeItem[];
            const withImages = idbWardrobe.filter(i => !!i.imageUrl).length;
            console.log(`[calendar wardrobe] IndexedDB: ${idbWardrobe.length} items, ${withImages} with images`);
          }
        } catch { /* continue without IDB */ }
      }

      // 4. Merge strategy:
      // - IndexedDB has images but may be stale (user might have added items on another device)
      // - Remote bridge is authoritative for item list but has no images
      // - Use remote as authority for which items exist, enrich with IndexedDB images
      const mergeImages = (
        authority: WardrobeItem[],
        imageSource: WardrobeItem[] | null,
      ): WardrobeItem[] => {
        if (!imageSource || imageSource.length === 0) return authority;
        const imageMap = new Map<string, string>();
        for (const item of imageSource) {
          if (item.id && item.imageUrl) imageMap.set(item.id, item.imageUrl);
        }
        let merged = 0;
        const result = authority.map((item) => {
          if (item.imageUrl) return item;
          const img = imageMap.get(item.id);
          if (img) { merged++; return { ...item, imageUrl: img }; }
          return item;
        });
        if (merged > 0) console.log(`[calendar wardrobe] 🖼 merged ${merged} images from IndexedDB into wardrobe`);
        return result;
      };

      if (active) {
        if (remoteWardrobe) {
          // Remote is authoritative, enrich with images from IndexedDB
          const enriched = mergeImages(remoteWardrobe, idbWardrobe);
          const withImages = enriched.filter(i => !!i.imageUrl).length;
          console.log(`[calendar wardrobe] ✓ source=remote+idb (${enriched.length} items, ${withImages} with images)`);
          setWardrobeItems(enriched);
          return;
        }
        // No remote — use IndexedDB directly (has images)
        if (idbWardrobe) {
          console.log(`[calendar wardrobe] ✓ source=IndexedDB (${idbWardrobe.length} items)`);
          setWardrobeItems(idbWardrobe);
          return;
        }
        // Last resort: localStorage (no images, but has item metadata)
        if (localWardrobe) {
          console.log(`[calendar wardrobe] ✓ source=localStorage (${localWardrobe.length} items, no images)`);
          setWardrobeItems(localWardrobe);
          return;
        }
      }

      console.warn("[calendar wardrobe] ✗ no wardrobe found in any source");
      if (active) setWardrobeItems([]);
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
    const loadLocation = async () => {
      setOfficeLoading(true); setOfficeMessage(null);
      try {
        const res = await fetch("/api/weather/subscription", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!active) return;
        if (json?.subscription?.prefecture) {
          setSelectedPrefecture(json.subscription.prefecture);
          setOfficeCode(json.subscription.office_code ?? "");
          setLocationNotSet(false);
        } else if (json?.subscription?.office_code) {
          // office_code はあるが prefecture 未保存（backfill前の既存ユーザー）
          // API GET が逆引きした prefecture を返すはずだが、念のためフォールバック
          setOfficeCode(json.subscription.office_code);
          setLocationNotSet(false);
        } else {
          setLocationNotSet(true);
        }
      } catch { if (!active) return; setLocationNotSet(true); }
      finally { if (active) setOfficeLoading(false); }
    };
    void loadLocation();
    return () => { active = false; };
  }, []);

  /* ── ハンドラー ── */
  const handleSaveLocation = async () => {
    if (!selectedPrefecture) return;
    setOfficeSaving(true); setOfficeMessage(null);
    try {
      const res = await fetch("/api/weather/subscription", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefecture: selectedPrefecture }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setOfficeMessage("居住地の保存に失敗しました");
      } else {
        setOfficeMessage("居住地を保存しました");
        setOfficeCode(data.subscription?.office_code ?? "");
        setLocationNotSet(false);
        await fetchCalendar();
      }
    } catch { setOfficeMessage("居住地の保存に失敗しました"); }
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
    checkStorageHealth();

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
      const result = await retryFetch("/api/calendar/day", {
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
      if (!result.ok) {
        console.error("Failed to save worn record to server:", result.error);
        showError("着用記録の保存に失敗しました");
      }
    } catch (err) {
      console.error("Failed to save worn record to server:", err);
      showError("着用記録の保存に失敗しました");
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
    if (!calendarData || wardrobeItems.length === 0) {
      console.log(`[calendar proposals] skip: calendarData=${!!calendarData} wardrobeItems=${wardrobeItems.length}`);
      return new Map<string, DayProposal>();
    }

    // ── Diagnostic: category breakdown ──
    const catBreakdown: Record<string, number> = {};
    for (const item of wardrobeItems) {
      const cat = item.categoryMain || item.category;
      catBreakdown[cat] = (catBreakdown[cat] ?? 0) + 1;
    }
    const usable = (catBreakdown["tops"] ?? 0) + (catBreakdown["bottoms"] ?? 0) + (catBreakdown["shoes"] ?? 0) + (catBreakdown["outer"] ?? 0) + (catBreakdown["outerwear"] ?? 0);
    console.log(`[calendar proposals] wardrobeItems=${wardrobeItems.length} usable=${usable} categories=${JSON.stringify(catBreakdown)}`);
    if (usable < 2) {
      console.warn(`[calendar proposals] ⚠ usable items < 2 — generateDayProposal will return null (need at least tops+bottoms)`);
    }

    const map = new Map<string, DayProposal>();
    let nullCount = 0;
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
      if (!proposal) { nullCount++; }
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
        // Shadow log: 発火状況を裏で記録（UI非表示、開発者確認用）
        recordInsightShadow(
          day.date,
          proposal.insights,
          getInsightCandidateCount(proposal.insights),
          day.events,
          day.weather_daily?.weather_icon ?? null,
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
    console.log(`[calendar proposals] generated=${map.size} nullDays=${nullCount} totalDays=${calendarData.days?.length ?? 0}`);
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

  // ── Diagnostic: rendering pipeline ──
  console.log(`[calendar render] todayStr=${todayStr} dayProposals.size=${dayProposals.size} todayProposal=${todayProposal ? "present" : "null"} loading=${loading} wardrobeItems=${wardrobeItems.length}`);

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
      <GlassNavbar innerClassName="max-w-7xl mx-auto px-4 sm:px-6 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Link href="/" className="w-8 h-8 rounded-full bg-white/40 backdrop-blur-sm border border-white/50 flex items-center justify-center text-gray-400 hover:bg-white/70 transition-all">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </Link>
            <div>
              <h1 className="text-[15px] font-bold tracking-tight text-gray-800 leading-tight">カレンダー</h1>
              <p className="text-[9px] text-gray-400 tracking-wide leading-tight">SYNC コーデ提案</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Link href="/my-style?tab=closet"
              className="h-6 rounded-full bg-white/40 backdrop-blur-sm border border-white/50 flex items-center gap-0.5 px-2 text-gray-500 hover:bg-white/70 transition-all no-underline">
              <span className="text-[10px]">👗</span>
              <span className="text-[8px] font-medium">Style</span>
            </Link>
            <motion.button onClick={() => setShowWeatherSettings(v => !v)}
              className="h-6 rounded-full bg-white/40 backdrop-blur-sm border border-white/50 flex items-center gap-0.5 px-2 text-gray-500 hover:bg-white/70 transition-all"
              whileTap={{ scale: 0.9 }}>
              <span className="text-[10px]">📍</span>
              {selectedPrefecture ? <span className="text-[8px] font-medium">{selectedPrefecture}</span> : <span className="text-[8px] text-gray-400">未設定</span>}
            </motion.button>
            {todayWeather && (
              <div className="h-6 rounded-full bg-white/40 backdrop-blur-sm border border-white/50 flex items-center gap-0.5 px-2">
                <span className="text-[10px]">{DAILY_WEATHER_ICONS[todayWeather.weather_icon] ?? "🌤️"}</span>
                <span className="text-[8px] font-bold text-gray-600">{todayWeather.temp_max ?? "-"}°</span>
              </div>
            )}
          </div>
        </div>
      </GlassNavbar>

      <div className="h-14" />

      <main className="max-w-6xl mx-auto px-4 pb-20">
        {/* ── 居住地未設定オンボーディング ── */}
        {locationNotSet && !officeLoading && (
          <FadeInView>
            <GlassCard className="p-5 mb-4 border-2 border-violet-200/60">
              <div className="flex items-start gap-3">
                <span className="text-2xl">📍</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-800 mb-1">居住地を設定しましょう</p>
                  <p className="text-[11px] text-slate-500 mb-3">お住まいの地域を選ぶと、天気予報に合わせたコーデ提案ができるようになります</p>
                  <div className="flex gap-2">
                    <select
                      value={selectedPrefecture}
                      onChange={e => setSelectedPrefecture(e.target.value)}
                      className="flex-1 rounded-xl bg-white/80 border border-slate-200/60 px-3 py-2.5 text-sm text-slate-700 backdrop-blur-sm appearance-none"
                    >
                      <option value="">都道府県を選択</option>
                      {PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <button
                      onClick={handleSaveLocation}
                      disabled={officeSaving || !selectedPrefecture}
                      className="rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white px-5 py-2.5 text-xs font-semibold disabled:opacity-40 transition shadow-lg shadow-violet-500/20"
                    >
                      {officeSaving ? "..." : "設定"}
                    </button>
                  </div>
                  {officeMessage && <p className="mt-2 text-[11px] text-slate-500">{officeMessage}</p>}
                </div>
              </div>
            </GlassCard>
          </FadeInView>
        )}

        {/* ── 天気地域設定（設定済みユーザー向け変更UI） ── */}
        <AnimatePresence>
          {showWeatherSettings && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-4">
              <GlassCard className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-700">居住地設定</span>
                  {selectedPrefecture && <span className="text-[10px] text-violet-500 font-medium">{selectedPrefecture}</span>}
                </div>
                <div className="flex gap-2">
                  <select
                    value={selectedPrefecture}
                    onChange={e => setSelectedPrefecture(e.target.value)}
                    className="flex-1 rounded-xl bg-white/80 border border-slate-200/60 px-3 py-2 text-xs text-slate-700 backdrop-blur-sm appearance-none"
                    disabled={officeLoading}
                  >
                    <option value="">都道府県を選択</option>
                    {PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <button
                    onClick={handleSaveLocation}
                    disabled={officeSaving || officeLoading || !selectedPrefecture}
                    className="rounded-xl bg-slate-800 text-white px-4 py-2 text-xs font-semibold hover:bg-slate-700 disabled:opacity-40 transition"
                  >
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
          <div className="space-y-3">
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

            {/* ══════════════════════════════════════
               PRIMARY ZONE: 今日を決める
               ══════════════════════════════════════ */}

            {/* ── 月ナビ + 天気（スワイプ対応） ── */}
            <FadeInView>
              <motion.div
                className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/60 via-white/40 to-white/20 backdrop-blur-2xl border border-white/50 shadow-[0_8px_60px_-20px_rgba(120,100,200,0.15)] p-3"
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
                      <p className="text-xl font-black tracking-tight text-gray-800">{currentMonth}<span className="text-sm font-normal text-gray-400 ml-0.5">月</span></p>
                      <p className="text-[9px] text-gray-400 -mt-0.5">{currentYear}</p>
                    </div>
                    <motion.button onClick={goToNextMonth} className="w-8 h-8 rounded-full bg-white/40 border border-white/50 flex items-center justify-center text-gray-400 hover:bg-white/70 transition" whileTap={{ scale: 0.85 }}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                    </motion.button>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      {todayWeather && (
                        <>
                          <div className="flex items-baseline gap-1 justify-end">
                            <span className="text-2xl">{DAILY_WEATHER_ICONS[todayWeather.weather_icon] ?? "🌤️"}</span>
                            <span className="text-sm font-bold text-gray-700">{todayWeather.temp_min ?? "-"}°/{todayWeather.temp_max ?? "-"}°</span>
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

            {/* ── 今日の提案ヒーロー ── */}
            {todayProposal && (() => {
              // ヒーロー主理由: practical を固定（insight リスト全体の順位とは独立）
              // CEO指示: 毎朝3秒のヒーローでは practical を主理由に固定する
              const practicalInsight = todayProposal.insights.find(i => i.tier === "practical");
              const deepInsight = todayProposal.insights.find(i => i.tier === "self-understanding" || (i.tier === "impression" && i.type !== "genome_relationship"));
              // 第3層: Genome relationship insight（条件成立日のみ存在）
              const relationshipInsight = todayProposal.insights.find(i => i.type === "genome_relationship");
              // 「この提案に効いている自分の軸」チップ
              const todayAdaptation = observationContext
                ? computeOutfitAdaptation(observationContext, todayData?.events ?? [])
                : null;
              const axisChips = buildProposalAxisChips({
                persona: personaProfile,
                satisfaction: satisfactionProfile,
                gap: gapAnalysis,
                adaptation: todayAdaptation,
                observation: observationContext,
              });
              // practical が見つからない場合のヒーロー専用フォールバック
              const heroReason = practicalInsight
                ? `${practicalInsight.icon} ${practicalInsight.text}`
                : todayWeather?.temp_max != null
                  ? `🌡️ 最高${todayWeather.temp_max}°に合わせた構成`
                  : todayProposal.main.reason;
              return (
              <FadeInView delay={0.02}>
                <motion.button onClick={() => setSelectedDay(todayData!)}
                  className="w-full text-left relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/60 via-white/40 to-violet-50/30 backdrop-blur-2xl border border-violet-200/40 shadow-[0_12px_50px_-12px_rgba(100,80,200,0.18)] px-2.5 py-2 sm:px-3 sm:py-2.5 group"
                  whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
                  {/* 第3層: relationship 特別帯 — 条件成立日のみ表示 */}
                  {relationshipInsight && (
                    <div className="mb-1.5 -mx-2.5 -mt-2 sm:-mx-3 sm:-mt-2.5 px-3 py-1.5 bg-gradient-to-r from-fuchsia-50/70 via-violet-50/50 to-indigo-50/40 border-b border-fuchsia-200/30">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">{relationshipInsight.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[8px] font-bold text-fuchsia-500/80 uppercase tracking-wider mb-px">{relationshipInsight.label}</p>
                          <p className="text-[9px] text-fuchsia-700/70 truncate leading-tight">{relationshipInsight.text}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="relative flex items-center gap-2.5">
                    {/* SYNCリング */}
                    <div className="shrink-0 relative w-14 h-14 sm:w-16 sm:h-16">
                      <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                        <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="6" />
                        <circle cx="50" cy="50" r="42" fill="none"
                          stroke={SYNC_BAND_COLORS[todayProposal.main.sync.band].ring}
                          strokeWidth="6" strokeLinecap="round"
                          strokeDasharray={`${(todayProposal.main.sync.total / 100) * 264} 264`} />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-lg font-black leading-none ${SYNC_BAND_COLORS[todayProposal.main.sync.band].text}`}>
                          {todayProposal.main.sync.total}
                        </span>
                        <span className="text-[6px] text-gray-400 uppercase font-bold">SYNC</span>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[8px] font-bold tracking-widest text-violet-500">今日の提案</span>
                        <span className={`text-[7px] font-bold rounded-full px-1.5 py-px ${SYNC_BAND_COLORS[todayProposal.main.sync.band].bg} ${SYNC_BAND_COLORS[todayProposal.main.sync.band].text}`}>
                          {todayProposal.main.moodTag}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-gray-700 mb-0.5 truncate leading-tight">
                        {todayProposal.main.items.map(i => i.name).join(" + ")}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <div className="flex gap-0.5 shrink-0">
                          {todayProposal.main.items.slice(0, 4).map((item, i) => (
                            <div key={i} className="w-7 h-7 rounded-md bg-white/60 border border-white/50 overflow-hidden flex items-center justify-center relative">
                              {item.imageUrl ? (
                                <Image src={item.imageUrl} alt="" width={28} height={28} className="w-full h-full object-contain p-0.5" loader={passthroughLoader} unoptimized />
                              ) : (
                                <div className="flex flex-col items-center justify-center">
                                  <div className="w-3.5 h-0.5 rounded-full mb-px" style={{ backgroundColor: item.colorHex || item.color || "#888", opacity: 0.6 }} />
                                  <span className="text-[8px] text-gray-300">
                                    {item.category === "tops" ? "👕" : item.category === "bottoms" ? "👖" : item.category === "outerwear" ? "🧥" : "👟"}
                                  </span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        {/* 実用理由（practical tier）を主役に — insight順位とは独立 */}
                        <p className="text-[9px] text-gray-500 truncate leading-tight">
                          {heroReason}
                        </p>
                      </div>
                      {/* リスク警告 */}
                      {todayProposal.main.risks.length > 0 && (
                        <div className="mt-0.5 flex items-center gap-1 text-[8px] text-amber-500">
                          <span>⚡</span><span className="truncate">{todayProposal.main.risks[0].message}</span>
                        </div>
                      )}
                      {/* 自己理解 or 印象インサイト（条件付き・別スタイル） */}
                      {deepInsight && !todayProposal.main.risks.length && (
                        <div className="mt-1 flex items-center gap-1.5 rounded-lg bg-violet-50/40 border border-violet-200/20 px-2 py-1">
                          <span className="text-[9px]">{deepInsight.icon}</span>
                          <p className="text-[9px] text-violet-600/80 truncate leading-tight font-medium">
                            {deepInsight.text}
                          </p>
                        </div>
                      )}
                      {/* 効いている自分の軸（チップ） */}
                      {axisChips.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {axisChips.slice(0, 3).map((chip, i) => (
                            <span key={i} className={`text-[7px] px-1.5 py-0.5 rounded-full border ${
                              chip.confidence === "high"
                                ? "bg-violet-50/60 border-violet-200/40 text-violet-500"
                                : "bg-gray-50/60 border-gray-200/40 text-gray-400"
                            }`}>
                              {chip.label}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* ヒントインライン（インサイトもリスクも深層もない場合のみ） */}
                      {stylingTip && !practicalInsight && !todayProposal.main.risks.length && !deepInsight && (
                        <div className="mt-0.5 flex items-center gap-1 text-[8px] text-gray-400/70 truncate">
                          <span className="text-[9px]">{stylingTip.icon}</span>
                          <span className="truncate">{stylingTip.text}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.button>
              </FadeInView>
              );
            })()}

            {/* ── ワードローブあるが提案生成できなかった場合 ── */}
            {!todayProposal && wardrobeItems.length > 0 && !loading && (
              <FadeInView delay={0.02}>
                <div className="rounded-2xl bg-gradient-to-br from-white/50 to-amber-50/20 backdrop-blur-2xl border border-white/40 p-4">
                  <div className="text-center">
                    <p className="text-2xl mb-2">🧩</p>
                    <p className="text-sm font-bold text-gray-700 mb-1">今日のコーデを組み立て中…</p>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      トップス・ボトムス・靴から2カテゴリ以上あると提案できます。
                      <br />現在 {wardrobeItems.length} アイテム登録済み
                    </p>
                    <Link href="/my-style?tab=closet"
                      className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold px-3 py-1.5 rounded-full"
                      style={{ background: "rgba(245,158,11,0.1)", color: "#D97706" }}>
                      アイテムを追加する →
                    </Link>
                  </div>
                </div>
              </FadeInView>
            )}

            {/* ── ワードローブ未登録 → My-Style導線 ── */}
            {!todayProposal && wardrobeItems.length === 0 && !loading && (
              <FadeInView delay={0.02}>
                <div className="rounded-2xl bg-gradient-to-br from-white/50 to-violet-50/20 backdrop-blur-2xl border border-white/40 p-4">
                  <div className="text-center mb-3">
                    <p className="text-3xl mb-2">👗</p>
                    <p className="text-sm font-bold text-gray-700 mb-0.5">コーデ提案を受けるには</p>
                    <p className="text-xs text-gray-400">まずワードローブにアイテムを登録しましょう</p>
                  </div>
                  <div className="space-y-2">
                    <Link href="/my-style?tab=closet" className="flex items-center gap-3 rounded-2xl bg-white/60 border border-white/50 p-3.5 no-underline hover:bg-white/80 transition group">
                      <span className="text-xl">👕</span>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-gray-700">トップスを登録</p>
                        <p className="text-[10px] text-gray-400">シャツ・Tシャツ・ニットなど</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </Link>
                    <Link href="/my-style?tab=closet" className="flex items-center gap-3 rounded-2xl bg-white/60 border border-white/50 p-3.5 no-underline hover:bg-white/80 transition group">
                      <span className="text-xl">👖</span>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-gray-700">ボトムスを登録</p>
                        <p className="text-[10px] text-gray-400">パンツ・スカート・デニムなど</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </Link>
                    <Link href="/my-style?tab=closet" className="flex items-center gap-3 rounded-2xl bg-white/60 border border-white/50 p-3.5 no-underline hover:bg-white/80 transition group">
                      <span className="text-xl">👟</span>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-gray-700">靴を登録</p>
                        <p className="text-[10px] text-gray-400">スニーカー・革靴・ブーツなど</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </Link>
                  </div>
                </div>
              </FadeInView>
            )}

            {/* ── 明日のプレビュー ── */}
            {tomorrowProposal && tomorrowData && (
              <FadeInView delay={0.03}>
                <motion.button onClick={() => setSelectedDay(tomorrowData)}
                  className="w-full text-left rounded-xl bg-white/20 backdrop-blur-lg border border-white/30 px-3 py-2 group"
                  whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="shrink-0 relative w-8 h-8">
                        <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="6" />
                          <circle cx="50" cy="50" r="42" fill="none"
                            stroke={SYNC_BAND_COLORS[tomorrowProposal.main.sync.band].ring}
                            strokeWidth="6" strokeLinecap="round"
                            strokeDasharray={`${(tomorrowProposal.main.sync.total / 100) * 264} 264`} />
                        </svg>
                        <span className={`absolute inset-0 flex items-center justify-center text-[8px] font-black ${SYNC_BAND_COLORS[tomorrowProposal.main.sync.band].text}`}>
                          {tomorrowProposal.main.sync.total}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-[8px] font-bold tracking-widest text-gray-400">明日の提案</span>
                        <p className="text-[11px] font-bold text-gray-500 truncate">{tomorrowProposal.main.items.map(i => i.name).join(" + ")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {tomorrowData.weather_daily && (
                        <span className="text-sm">{DAILY_WEATHER_ICONS[tomorrowData.weather_daily.weather_icon] ?? "🌤️"}</span>
                      )}
                      <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-400 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </div>
                  </div>
                </motion.button>
              </FadeInView>
            )}

            {/* ══════════════════════════════════════
               SECONDARY ZONE: 日付を見る
               ══════════════════════════════════════ */}

            {/* ── カレンダーグリッド（主役） ── */}
            <FadeInView delay={0.04}>
              <div className="rounded-2xl bg-white/25 backdrop-blur-xl border border-white/30 shadow-[0_4px_40px_-15px_rgba(100,80,180,0.06)] px-2.5 pt-2 pb-1.5 sm:px-3 sm:pt-2.5 sm:pb-2">
                <div className="grid grid-cols-7 mb-1">
                  {WEEKDAYS.map((day, i) => (
                    <div key={day} className={`text-center text-[9px] font-semibold py-1 tracking-widest uppercase ${
                      i === 0 ? "text-rose-400" : i === 6 ? "text-blue-400" : "text-gray-400"
                    }`}>{day}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
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
                <p className="mt-1 text-[8px] text-slate-300 text-right">出典: 気象庁</p>
              </div>
            </FadeInView>

            {/* ── 週間プランナー ── */}
            {weekDays.length > 0 && (
              <FadeInView delay={0.05}>
                <div>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-[10px] font-bold tracking-widest text-gray-400">今週のコーデ</span>
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

            {/* ── 週間雰囲気 ── */}
            {weekDays.length > 0 && (
              <FadeInView delay={0.06}>
                <WeekAtmosphereBar weekDays={weekDays} />
              </FadeInView>
            )}

            {/* ══════════════════════════════════════
               TERTIARY ZONE: 分析・補完
               ══════════════════════════════════════ */}

            {/* ── スタイリングヒント: 提案カード内にインライン化済み ── */}

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

            {/* ── ワードローブ分析 ── */}
            {gapAnalysis && gapAnalysis.gaps.length > 0 && (
              <FadeInView delay={0.08}>
                <WardrobeGapCard analysis={gapAnalysis} />
              </FadeInView>
            )}

            {/* ── 月間まとめ ── */}
            {monthSummary && (
              <FadeInView delay={0.09}>
                <div className="rounded-2xl bg-white/40 backdrop-blur-sm border border-white/50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold tracking-widest text-gray-400">月間まとめ</span>
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

            {/* ── 月間レポート（着用データあり時のみ） ── */}
            {calendarData && (monthSummary?.wornDays ?? 0) > 0 && (
              <FadeInView delay={0.1}>
                <div className="rounded-2xl bg-white/25 backdrop-blur-xl border border-white/30 p-3">
                  <p className="text-[10px] font-bold tracking-widest text-gray-400 mb-2">月間レポート</p>
                  <div className="grid grid-cols-3 gap-2">
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
                    if (streak >= 30) badges.push({ icon: "🏆", label: "30日連続", color: "text-amber-500 bg-amber-50/60 border-amber-200/40" });
                    else if (streak >= 14) badges.push({ icon: "💎", label: "14日連続", color: "text-violet-500 bg-violet-50/60 border-violet-200/40" });
                    else if (streak >= 7) badges.push({ icon: "🔥", label: "7日連続", color: "text-orange-500 bg-orange-50/60 border-orange-200/40" });
                    else if (streak >= 3) badges.push({ icon: "✨", label: "3日連続", color: "text-pink-500 bg-pink-50/60 border-pink-200/40" });
                    const usedCategories = new Set<string>();
                    const usedColors = new Set<string>();
                    for (const d of calendarData.days) {
                      if (!d.outfit?.is_worn) continue;
                      for (const item of d.outfit.outfit_items) {
                        usedCategories.add(item.category);
                        const name = (item.title || "").toLowerCase();
                        for (const c of ["黒","白","紺","グレー","ベージュ","ブルー","レッド","グリーン","ピンク","ブラウン"]) {
                          if (name.includes(c)) usedColors.add(c);
                        }
                      }
                    }
                    if (usedCategories.size >= 4) badges.push({ icon: "🎯", label: "全カテゴリ制覇", color: "text-emerald-500 bg-emerald-50/60 border-emerald-200/40" });
                    if (usedColors.size >= 5) badges.push({ icon: "🎨", label: "カラバリマスター", color: "text-indigo-500 bg-indigo-50/60 border-indigo-200/40" });
                    const allSyncs = Array.from(dayProposals.values()).map(p => p.main.sync.total);
                    if (allSyncs.some(s => s >= 90)) badges.push({ icon: "💫", label: "完璧な1日", color: "text-violet-500 bg-violet-50/60 border-violet-200/40" });
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

            {/* ── 学習ステータス（マイルストーン式） ── */}
            {(() => {
              const dp = satisfactionProfile?.dataPoints ?? 0;
              const fb = feedbackSummary?.totalDataPoints ?? 0;
              const total = dp + fb;
              if (total < 3) return null;

              // マイルストーン定義
              const milestones = [
                { threshold: 3,  label: "学習開始", desc: "好みの学習が始まりました", icon: "🌱" },
                { threshold: 7,  label: "傾向把握", desc: "あなたの傾向が見え始めています", icon: "🌿" },
                { threshold: 14, label: "パターン認識", desc: "曜日や天気との相関がわかってきました", icon: "🌳" },
                { threshold: 30, label: "深い理解", desc: "コンビネーションの好みまで学習済み", icon: "🌲" },
                { threshold: 60, label: "あなたの専門家", desc: "あなたのスタイルを熟知しています", icon: "✨" },
              ];

              const current = milestones.filter(m => dp >= m.threshold).pop() ?? milestones[0];
              const next = milestones.find(m => dp < m.threshold);
              const progress = next ? Math.min(100, Math.round((dp / next.threshold) * 100)) : 100;

              return (
                <FadeInView delay={0.09}>
                  <div className="rounded-xl bg-gradient-to-r from-emerald-50/50 to-teal-50/30 border border-emerald-200/30 px-3 py-2.5">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm">{current.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-emerald-700">{current.label}</span>
                          <span className="text-[8px] text-emerald-500">{dp}日分のデータ</span>
                        </div>
                        <p className="text-[9px] text-emerald-600/80">{current.desc}</p>
                      </div>
                    </div>
                    {next && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 rounded-full bg-emerald-100/60 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-400/60 transition-all duration-500" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="text-[8px] text-emerald-400 shrink-0">次: {next.label}（あと{next.threshold - dp}日）</span>
                      </div>
                    )}
                  </div>
                </FadeInView>
              );
            })()}

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

          // 効いている自分の軸
          const selAxisChips = buildProposalAxisChips({
            persona: personaProfile,
            satisfaction: satisfactionProfile,
            gap: gapAnalysis,
            adaptation: selAdaptation,
            observation: observationContext,
          });

          // Stargazer 影響度計測
          const selInfluence = computeStargazerInfluence({
            persona: personaProfile,
            satisfaction: satisfactionProfile,
            adaptation: selAdaptation,
            observation: observationContext,
            gap: gapAnalysis,
            proposalItems: selProposal?.main.items,
          });

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
              axisChips={selAxisChips}
              stargazerInfluence={selInfluence}
            />
          );
        })()}
      </AnimatePresence>

      <div className="fixed bottom-0 left-0 right-0 z-40">
        <HomeQuickAccess />
      </div>

      <FeatureIntroduction
        {...CALENDAR_INTRO}
        onComplete={() => {}}
      />
    </LightBackground>
  );
}
