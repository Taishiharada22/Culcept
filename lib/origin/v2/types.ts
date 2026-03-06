// lib/origin/v2/types.ts
// Origin v2 — Life Map + Earth Trace 型定義

import type { OriginRootScene, OriginInfluence } from "../lifeTypes";

/* ─── Anchor Mood ─── */

export const ANCHOR_MOODS = ["high", "neutral", "low", "turning"] as const;
export type AnchorMood = (typeof ANCHOR_MOODS)[number];

export const ANCHOR_MOOD_META: Record<
  AnchorMood,
  { label: string; icon: string; color: string }
> = {
  high: { label: "上昇", icon: "↗️", color: "#34d399" },
  neutral: { label: "普通", icon: "→", color: "#94a3b8" },
  low: { label: "低迷", icon: "↘️", color: "#f87171" },
  turning: { label: "転機", icon: "⚡", color: "#a78bfa" },
};

/* ─── Anchor Focus ─── */

export const ANCHOR_FOCUS_OPTIONS = [
  "work",
  "study",
  "people",
  "health",
  "creative",
  "travel",
  "family",
  "self",
  "adventure",
  "rest",
] as const;
export type AnchorFocus = (typeof ANCHOR_FOCUS_OPTIONS)[number];

export const ANCHOR_FOCUS_META: Record<
  AnchorFocus,
  { label: string; icon: string }
> = {
  work: { label: "仕事", icon: "💼" },
  study: { label: "学び", icon: "📚" },
  people: { label: "人間関係", icon: "👥" },
  health: { label: "健康", icon: "💪" },
  creative: { label: "創作", icon: "🎨" },
  travel: { label: "旅", icon: "✈️" },
  family: { label: "家族", icon: "🏠" },
  self: { label: "自分探し", icon: "🔍" },
  adventure: { label: "冒険", icon: "🏔️" },
  rest: { label: "休息", icon: "☁️" },
};

/* ─── Life Anchor ─── */

export type LifeAnchor = {
  id: string;
  period: string; // "2015" / "2015-春" / "2015.03"
  place: string | null;
  mood: AnchorMood;
  focus: AnchorFocus;
  note: string | null; // optional one-liner (~50 chars)
  createdAt: string;
};

/* ─── Board-Game Tile (derived, not stored) ─── */

export type TileType =
  | "start"
  | "normal"
  | "branch"
  | "event"
  | "bonus"
  | "damage"
  | "unlock"
  | "present";

export type BoardTile = {
  id: string;
  anchorId: string;
  type: TileType;
  position: number;
  label: string;
  mood: AnchorMood;
  focus: AnchorFocus;
  note: string | null;
  connections: string[]; // IDs of connected tiles
};

export type GameBoard = {
  tiles: BoardTile[];
  totalSteps: number;
  branchCount: number;
  eventCount: number;
  unlockedAbilities: AnchorFocus[];
  currentTile: string; // ID of the "present" tile
};

/* ─── Board Tile Visual Meta ─── */

export const TILE_TYPE_META: Record<
  TileType,
  { label: string; icon: string; description: string }
> = {
  start: { label: "スタート", icon: "⭐", description: "物語のはじまり" },
  normal: { label: "マス", icon: "●", description: "人生の一歩" },
  branch: { label: "分岐点", icon: "◆", description: "気分が変わった転換点" },
  event: { label: "イベント", icon: "📌", description: "記憶に残る出来事" },
  bonus: { label: "ボーナス", icon: "🎉", description: "上昇への転換" },
  damage: { label: "ダメージ", icon: "💥", description: "試練の到来" },
  unlock: { label: "能力解放", icon: "🔓", description: "新しい領域への挑戦" },
  present: { label: "現在地", icon: "📍", description: "いま、ここ" },
};

export const MOOD_TILE_COLORS: Record<
  AnchorMood,
  { bg: string; border: string; glow: string }
> = {
  high: {
    bg: "#dcfce7",
    border: "#34d399",
    glow: "rgba(52,211,153,0.3)",
  },
  neutral: {
    bg: "#f1f5f9",
    border: "#94a3b8",
    glow: "rgba(148,163,184,0.2)",
  },
  low: {
    bg: "#fee2e2",
    border: "#f87171",
    glow: "rgba(248,113,113,0.3)",
  },
  turning: {
    bg: "#ede9fe",
    border: "#a78bfa",
    glow: "rgba(167,139,250,0.3)",
  },
};

/* ─── Earth Trace (Location) ─── */

export type CaptureMode = "single" | "session" | "night";

export type LocationPoint = {
  id: string;
  lat: number;
  lng: number;
  accuracy: number;
  capturedAt: string;
  captureMode: CaptureMode;
  sessionId: string | null;
};

export type LocationSession = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  pointCount: number;
  distanceKm: number;
};

export type EarthTraceRegion = {
  label: string;
  lat: number;
  lng: number;
  visitCount: number;
  firstVisit: string;
  lastVisit: string;
  totalDays: number;
  type: "home" | "frequent" | "visited" | "traveled";
};

export type EarthTracePrefs = {
  gpsPermissionGranted: boolean;
  autoGrabOnOpen: boolean;
  nightLogEnabled: boolean;
  lastSessionId: string | null;
  version: 1;
};

/* ─── Aggregate Data ─── */

export type OriginV2Data = {
  anchors: LifeAnchor[];
  rootScenes: OriginRootScene[];
  influences: OriginInfluence[];
  migratedFromV1: boolean;
  version: 2;
  updatedAt: string;
};

/* ─── Depth Levels ─── */

export type OriginV2DepthLevel =
  | "none"
  | "fragment"
  | "outline"
  | "story"
  | "map";

export const V2_DEPTH_META: Record<
  OriginV2DepthLevel,
  { label: string; description: string; minAnchors: number }
> = {
  none: { label: "", description: "", minAnchors: 0 },
  fragment: {
    label: "断片",
    description: "物語の欠片が集まり始めています",
    minAnchors: 1,
  },
  outline: {
    label: "輪郭",
    description: "あなたの輪郭が見え始めています",
    minAnchors: 3,
  },
  story: {
    label: "物語",
    description: "あなたの物語が形になってきました",
    minAnchors: 7,
  },
  map: {
    label: "地図",
    description: "人生の地図が広がっています",
    minAnchors: 12,
  },
};

/* ─── Synthesis Types ─── */

export type AnchorSynthesis = {
  essence: string;
  themeTags: string[];
  dominantMood: AnchorMood;
  moodTrajectory: "ascending" | "descending" | "cyclical" | "stable";
  focusEvolution: AnchorFocus[];
  stabilityScore: number; // 0-1
  explorationScore: number; // 0-1
  turningPointCount: number;
  longestStreak: { mood: AnchorMood; count: number };
  insights: string[];
};

export type GeoPattern = {
  homeBase: EarthTraceRegion | null;
  travelRadius: "local" | "regional" | "national" | "international";
  movementStyle: "settled" | "nomadic" | "explorer" | "commuter";
  regionCount: number;
  totalDistanceKm: number;
  farthestPoint: { label: string; distanceKm: number } | null;
};

export type CombinedInsight = {
  pattern: string;
  description: string;
  confidence: number;
};

/* ─── Tab Mode ─── */

export type OriginV2Tab = "lifemap" | "earthtrace";
