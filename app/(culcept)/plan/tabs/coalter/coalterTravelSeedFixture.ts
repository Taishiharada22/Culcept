/**
 * C6-A — CoAlter Travel seed fixture（**preview 専用・正規化 demo seeds・外部 API なし**）
 *
 * 役割: 既存の決定論 solver `generateTravelItineraries`（lib/coalter/travel/itinerary.ts・無改修）に
 *   渡す **正規化 seed**（intentOutput + destination/experience/lodging/move）を、箱根 1 泊 2 日の
 *   demo として用意する。solver はこれを骨格でなく**具体行程**（時刻帯付き node・anchor/wander・
 *   pareto 比較）へ解く。
 *
 * なぜ fixture か（honesty）:
 *   - solver は「caller が外部 API なしに渡す normalized seed」で動く設計（その通りに demo を渡す）。
 *   - 実運用では Web Search / Places から seed を作る（future・本番接続）。ここでは demo seed。
 *   - `placeIdCode` は opaque code（raw place 名でない）。表示名は別 map で demo 提供する。
 *   - VM/UI は `demo: true` を伴って表示する。
 *
 * demo の意図（calm/nature ペア = S2 demo 軸と整合）:
 *   - 低 fatigue・温泉中心・詰め込まない → solver は slow_pace / balanced 等の pareto 案を出す。
 */

import type {
  TravelDestinationSeed,
  TravelExperienceSeed,
  TravelLodgingSeed,
  TravelMoveSeed,
  TravelItineraryGeneratorInput,
} from "@/lib/coalter/travel/itinerary";
import type { TravelIntentOutput } from "@/lib/coalter/travel/intent";

const budget = (lo: number, hi: number) => ({ lo, hi, confidence: 0.5 });

// ── intentOutput（calm ペア・1 泊 2 日・関東・低めの fatigue 許容） ──
const HAKONE_INTENT: TravelIntentOutput = {
  inferredTravelIntent: "travel_eligible",
  travelScope: "overnight_one_night",
  suggestedConstraints: ["duration_one_night_inferred"],
  destinationSignals: ["domestic_kanto"],
  durationSignals: ["one_night"],
  budgetSignals: ["moderate"],
  // calm ペア: 移動も現地も詰め込まない（低 fatigue）
  fatigueSignals: { transitFatigue: 2, onSiteFatigue: 2, combined: 2 },
  needsNarrowing: false,
  missingSlots: [],
  confidence: 0.8,
  reasonCodes: ["travel_signal_present", "above_threshold"],
  intentVersion: "0.1.0",
};

// ── destination seeds（箱根の主目的地・anchor・自然/落ち着き） ──
const DESTINATIONS: TravelDestinationSeed[] = [
  {
    seedId: "gora",
    placeIdCode: "hakone_gora",
    region: "domestic_kanto",
    defaultFatigueLoad: 2,
    budgetEstimate: budget(3000, 8000),
    anchorLevel: "anchor",
    activityType: "sightseeing",
  },
  {
    seedId: "ashinoko",
    placeIdCode: "hakone_ashinoko",
    region: "domestic_kanto",
    defaultFatigueLoad: 2,
    budgetEstimate: budget(2000, 6000),
    anchorLevel: "anchor",
    activityType: "sightseeing",
  },
];

// ── experience seeds（温泉・美術館・自然散策・wander・低負荷） ──
const EXPERIENCES: TravelExperienceSeed[] = [
  {
    seedId: "onsen",
    placeIdCode: "hakone_onsen_daytrip",
    activityType: "experience",
    defaultFatigueLoad: 1,
    durationMinutes: 90,
    budgetEstimate: budget(1500, 3000),
    anchorLevel: "wander",
    compatibleTimeSlots: ["afternoon", "evening"],
  },
  {
    seedId: "museum",
    placeIdCode: "hakone_open_air_museum",
    activityType: "sightseeing",
    defaultFatigueLoad: 2,
    durationMinutes: 120,
    budgetEstimate: budget(1600, 2000),
    anchorLevel: "wander",
    compatibleTimeSlots: ["morning", "afternoon"],
  },
  {
    seedId: "walk",
    placeIdCode: "hakone_lakeside_walk",
    activityType: "experience",
    defaultFatigueLoad: 2,
    durationMinutes: 60,
    budgetEstimate: budget(0, 500),
    anchorLevel: "wander",
    compatibleTimeSlots: ["morning", "noon"],
  },
  // ── 性格で採否が分かれる場所（universe を fit catalog と一致させる・C6-D）──
  {
    seedId: "nightlife",
    placeIdCode: "hakone_nightlife_bar",
    activityType: "experience",
    defaultFatigueLoad: 3,
    durationMinutes: 90,
    budgetEstimate: budget(3000, 6000),
    anchorLevel: "wander",
    compatibleTimeSlots: ["evening", "night"],
  },
  {
    seedId: "thrill",
    placeIdCode: "hakone_thrill_activity",
    activityType: "experience",
    defaultFatigueLoad: 4,
    durationMinutes: 120,
    budgetEstimate: budget(4000, 8000),
    anchorLevel: "wander",
    compatibleTimeSlots: ["morning", "afternoon"],
  },
];

// ── lodging seeds（温泉宿・2 案で pareto 比較: 落ち着き宿 / 眺望宿） ──
const LODGINGS: TravelLodgingSeed[] = [
  {
    seedId: "ryokan_calm",
    placeIdCode: "hakone_ryokan_calm",
    region: "domestic_kanto",
    budgetEstimate: budget(14000, 22000),
    anchorLevel: "anchor",
  },
  {
    seedId: "ryokan_view",
    placeIdCode: "hakone_ryokan_view",
    region: "domestic_kanto",
    budgetEstimate: budget(20000, 30000),
    anchorLevel: "anchor",
  },
];

// ── move seeds（移動・所要は目安・train/walk） ──
const MOVES: TravelMoveSeed[] = [
  { seedId: "m_in", fromPlaceIdCode: "origin", toPlaceIdCode: "hakone_gora", transport: "train", durationMinutes: 100, costEstimate: budget(1200, 2500) },
  { seedId: "m_museum", fromPlaceIdCode: "hakone_gora", toPlaceIdCode: "hakone_open_air_museum", transport: "train", durationMinutes: 10, costEstimate: budget(0, 300) },
  { seedId: "m_lodge_c", fromPlaceIdCode: "hakone_gora", toPlaceIdCode: "hakone_ryokan_calm", transport: "walk", durationMinutes: 10, costEstimate: budget(0, 0) },
  { seedId: "m_lodge_v", fromPlaceIdCode: "hakone_gora", toPlaceIdCode: "hakone_ryokan_view", transport: "bus", durationMinutes: 20, costEstimate: budget(0, 400) },
  { seedId: "m_ashi", fromPlaceIdCode: "hakone_gora", toPlaceIdCode: "hakone_ashinoko", transport: "bus", durationMinutes: 35, costEstimate: budget(0, 700) },
  { seedId: "m_walk", fromPlaceIdCode: "hakone_ashinoko", toPlaceIdCode: "hakone_lakeside_walk", transport: "walk", durationMinutes: 5, costEstimate: budget(0, 0) },
  { seedId: "m_onsen", fromPlaceIdCode: "hakone_gora", toPlaceIdCode: "hakone_onsen_daytrip", transport: "walk", durationMinutes: 8, costEstimate: budget(0, 0) },
  { seedId: "m_night", fromPlaceIdCode: "hakone_gora", toPlaceIdCode: "hakone_nightlife_bar", transport: "walk", durationMinutes: 12, costEstimate: budget(0, 0) },
  { seedId: "m_thrill", fromPlaceIdCode: "hakone_gora", toPlaceIdCode: "hakone_thrill_activity", transport: "bus", durationMinutes: 25, costEstimate: budget(0, 600) },
];

/** solver への完全な入力（無改修の generateTravelItineraries に渡す）。 */
export const COALTER_DEMO_TRAVEL_SEEDS: TravelItineraryGeneratorInput = {
  intentOutput: HAKONE_INTENT,
  destinationSeeds: DESTINATIONS,
  experienceSeeds: EXPERIENCES,
  lodgingSeeds: LODGINGS,
  moveSeeds: MOVES,
  pairTogethernessOverride: "together_main_separate_some",
  maxCandidates: 3,
};

/**
 * placeIdCode → 表示名（**demo 表示専用**）。solver は opaque code のみ扱い、
 *   人間可読名は表示層が demo map で与える（実運用は Places/Web 由来）。
 */
export const COALTER_DEMO_PLACE_LABELS: Record<string, string> = {
  origin: "出発地",
  hakone_gora: "強羅エリア",
  hakone_ashinoko: "芦ノ湖",
  hakone_onsen_daytrip: "日帰り温泉",
  hakone_open_air_museum: "彫刻の森（美術館）",
  hakone_lakeside_walk: "湖畔の散策路",
  hakone_ryokan_calm: "強羅の落ち着いた温泉宿",
  hakone_ryokan_view: "眺望の温泉宿",
  hakone_nightlife_bar: "夜のにぎやかなバー",
  hakone_thrill_activity: "アクティブ体験（アスレチック）",
};
