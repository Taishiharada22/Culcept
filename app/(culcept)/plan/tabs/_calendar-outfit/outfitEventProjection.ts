/**
 * Slice 2 (Option B-4A) — Engine Projection & Day Aggregate (pure)
 *
 * 役割:
 *   - B-3 の rich な `OutfitContextEvent[]` を 2 つの形に整える:
 *       (1) **薄い engine 互換** `ProjectedCalendarEvent[]`（将来 generateTodayProposal へ渡す入力）
 *       (2) **rich を捨てない 1 日集約** `OutfitDayContext`（理由カード / UI reason / 将来の推薦精度用）
 *   - **engine には接続しない**（generateTodayProposal を呼ばない）。 ここは互換層 + 集約のみ。
 *
 * 設計判断 (CEO/GPT B-4A):
 *   - engine 型 (`CalendarEvent` 等) を **import しない**。 client/server 境界を汚さないため、
 *     engine が受け取れる最小形をローカルに定義する（`lib/shared/outfitEngine` は /calendar/_lib +
 *     @supabase/supabase-js を巻き込むため、 型 import すら client では避ける）。
 *   - event_type は EVENT_STYLE_MAP (work/meeting/date/party/casual/outdoor/sports/travel) と整合。
 *   - **rich を event_type に潰し切らない**: 「会議あり / 移動多め / smart_casual / きちんとした場 /
 *     夜のお出かけ」等の文脈は `OutfitDayContext` に保持し、 UI 理由・将来の精度に使えるよう残す。
 *
 * 不変原則:
 *   - pure。 副作用 / I/O / engine / DB / AI なし。 入力を mutate しない。
 *   - privacy: 機微 (医療/法務/試験) の中身は出さない（B-3 で既に reasonTags から除外済み）。
 */

import type {
  OutfitActivityKind,
  OutfitContextEvent,
  OutfitFormality,
  OutfitMobility,
} from "./anchorsToOutfitEvents";

// ── (1) 薄い engine 互換型（ローカル定義、 engine を import しない） ──

/** EVENT_STYLE_MAP (lib/calendar/generator) の event_type と一致させたローカル型 */
export type ProjectedEventType =
  | "work"
  | "meeting"
  | "date"
  | "party"
  | "casual"
  | "outdoor"
  | "sports"
  | "travel";

/** engine の CalendarEvent ({ event_type, event_name }) に対応する最小形 */
export interface ProjectedCalendarEvent {
  event_type: ProjectedEventType;
  event_name: string;
}

/**
 * 1 event → event_type。
 *   - exercise / gym → sports、 outdoor 場所 → outdoor を先に確定。
 *   - meal は夜→date / それ以外→casual、 social は夜→party / それ以外→casual。
 *   - rich な business 性 (client 会食 等) は event_type には潰さず DayContext 側 (hasClientOrFormal /
 *     maxFormality) に残す。
 */
export function projectEventType(ev: OutfitContextEvent): ProjectedEventType {
  if (ev.activityKind === "exercise" || ev.placeKind === "gym") return "sports";
  if (ev.placeKind === "outdoor") return "outdoor";
  switch (ev.activityKind) {
    case "meeting":
      return "meeting";
    case "work":
      return "work";
    case "move":
      return "travel";
    case "meal":
      return ev.timeOfDay === "evening" ? "date" : "casual";
    case "social":
      return ev.timeOfDay === "evening" ? "party" : "casual";
    case "errand":
    case "rest":
    case "unknown":
    default:
      return "casual";
  }
}

/** OutfitContextEvent[] → 薄い engine 互換 event[] */
export function projectCalendarEvents(events: OutfitContextEvent[]): ProjectedCalendarEvent[] {
  return events.map((ev) => ({
    event_type: projectEventType(ev),
    event_name: ev.title && ev.title.trim().length > 0 ? ev.title : "予定",
  }));
}

// ── (2) rich を捨てない 1 日集約 ──

export interface OutfitDayContext {
  /** 最頻の活動 (unknown 以外を優先、 同数は優先順位)、 なければ unknown */
  dominantActivity: OutfitActivityKind;
  /** その日で最も格式が高い formality (formal > office > smart_casual > casual > unknown) */
  maxFormality: OutfitFormality;
  /** その日で最も大きい mobility (high > medium > low > none > unknown) */
  mobility: OutfitMobility;
  hasMeeting: boolean;
  hasMeal: boolean;
  hasOutdoor: boolean;
  hasCafeWork: boolean;
  /** client 対応 or きちんとした場 (formal/office) があるか */
  hasClientOrFormal: boolean;
  /** 全 event の reasonTags を重複排除して統合 (privacy-safe な人間可読文脈) */
  reasonTags: string[];
  /** 対象 event 数 */
  eventCount: number;
}

const FORMALITY_RANK: Record<OutfitFormality, number> = {
  unknown: 0,
  casual: 1,
  smart_casual: 2,
  office: 3,
  formal: 4,
};

const MOBILITY_RANK: Record<OutfitMobility, number> = {
  unknown: 0,
  none: 1,
  low: 2,
  medium: 3,
  high: 4,
};

/** dominantActivity の同数時の優先順位 (より「装いを規定する」活動を上に) */
const ACTIVITY_PRIORITY: OutfitActivityKind[] = [
  "meeting",
  "work",
  "meal",
  "social",
  "exercise",
  "move",
  "errand",
  "rest",
  "unknown",
];

function pickDominantActivity(events: OutfitContextEvent[]): OutfitActivityKind {
  const counts = new Map<OutfitActivityKind, number>();
  for (const ev of events) {
    if (ev.activityKind === "unknown") continue;
    counts.set(ev.activityKind, (counts.get(ev.activityKind) ?? 0) + 1);
  }
  if (counts.size === 0) return "unknown";
  let best: OutfitActivityKind = "unknown";
  let bestCount = -1;
  for (const activity of ACTIVITY_PRIORITY) {
    const c = counts.get(activity) ?? 0;
    if (c > bestCount) {
      bestCount = c;
      best = activity;
    }
  }
  return best;
}

/** 空の日でも安全に返せる default context */
function emptyDayContext(): OutfitDayContext {
  return {
    dominantActivity: "unknown",
    maxFormality: "unknown",
    mobility: "unknown",
    hasMeeting: false,
    hasMeal: false,
    hasOutdoor: false,
    hasCafeWork: false,
    hasClientOrFormal: false,
    reasonTags: [],
    eventCount: 0,
  };
}

/**
 * OutfitContextEvent[] → その日の集約文脈。
 *   - rich な signal (formality / mobility / 各種 has* / reasonTags) を保持。
 *   - 空 events でも安全な default を返す。
 */
export function buildOutfitDayContext(events: OutfitContextEvent[]): OutfitDayContext {
  if (events.length === 0) return emptyDayContext();

  let maxFormality: OutfitFormality = "unknown";
  let mobility: OutfitMobility = "unknown";
  let hasMeeting = false;
  let hasMeal = false;
  let hasOutdoor = false;
  let hasCafeWork = false;
  let hasClientOrFormal = false;
  const tagSet = new Set<string>();

  for (const ev of events) {
    if (FORMALITY_RANK[ev.formality] > FORMALITY_RANK[maxFormality]) maxFormality = ev.formality;
    if (MOBILITY_RANK[ev.mobility] > MOBILITY_RANK[mobility]) mobility = ev.mobility;

    if (ev.activityKind === "meeting") hasMeeting = true;
    if (ev.activityKind === "meal" || ev.placeKind === "restaurant") hasMeal = true;
    if (ev.placeKind === "outdoor") hasOutdoor = true;
    if (ev.placeKind === "cafe" && (ev.activityKind === "work" || ev.activityKind === "unknown"))
      hasCafeWork = true;
    if (ev.socialContext === "client" || ev.formality === "formal" || ev.formality === "office")
      hasClientOrFormal = true;

    for (const tag of ev.reasonTags) tagSet.add(tag);
  }

  return {
    dominantActivity: pickDominantActivity(events),
    maxFormality,
    mobility,
    hasMeeting,
    hasMeal,
    hasOutdoor,
    hasCafeWork,
    hasClientOrFormal,
    reasonTags: Array.from(tagSet),
    eventCount: events.length,
  };
}
