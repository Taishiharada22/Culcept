/**
 * lib/plan/postVisit/postVisitContext.ts
 *   — 評価OS / Stage 4-A: post-visit 観測に付ける **文脈スナップショット** の最小 pure 型 + redaction
 *
 * ★狙い: 観測を「場所単体の評価」から「**どの状態で**合った/合わなかったか」へ。将来の複合融合エンジン
 *   （疲労×天気×gap×同行者×…→満足度）の教師データにする。本 stage は **保存形式の土台のみ**。
 * ★絶対原則（保存値は全て coarse / nullable / redacted）:
 *   - 生 GPS・住所・locationText 原文・notes 原文・相手名・正確な滞在時間・**exact gap minutes** は保存しない。
 *   - 全フィールドは固定 enum bucket か null のみ。自由文字列・数値は持たない（型で禁止）。
 *   - sensitiveCategory は **suppress 判定にのみ使い、ここには保存しない**。
 * ★Fit-Arc は当面これを使わない（場所単体 readout のまま）。Stage 4-B で shadow Context Fit readout を作る。
 * ★pure: Date を内部で呼ばない（hour/分は呼び出し側が渡す）。
 */

// ── coarse buckets（自由値を許さない固定集合）──
export type TimeOfDayBucket = "early_morning" | "morning" | "midday" | "afternoon" | "evening" | "night";
export type DayTypeBucket = "weekday" | "weekend";
/** ★exact minutes は保存しない。次予定までの余裕の粗いバケット。none=次予定なし。 */
export type GapBucket = "none" | "under_30" | "30_60" | "60_120" | "over_120";
export type WeatherBucket = "clear" | "rain" | "snow" | "hot" | "cold" | "other";
export type FatigueBucket = "low" | "mid" | "high";
/** 同行者の有無のみ（★相手名・人数・関係は保存しない）。 */
export type CompanionBucket = "solo" | "with_someone";
export type MobilityLoadBucket = "light" | "moderate" | "heavy";
/** 場所カテゴリ（既に安全な enum・原文でない）。 */
export type LocationCategoryBucket = "home" | "office" | "school" | "cafe" | "outdoor" | "public" | "transit" | "unknown";
export type PostVisitSourceSurface = "calendar_past_anchor" | "location_detail" | "candidate_lens";

const TIME_OF_DAY = new Set<string>(["early_morning", "morning", "midday", "afternoon", "evening", "night"]);
const DAY_TYPE = new Set<string>(["weekday", "weekend"]);
const GAP = new Set<string>(["none", "under_30", "30_60", "60_120", "over_120"]);
const WEATHER = new Set<string>(["clear", "rain", "snow", "hot", "cold", "other"]);
const FATIGUE = new Set<string>(["low", "mid", "high"]);
const COMPANION = new Set<string>(["solo", "with_someone"]);
const MOBILITY = new Set<string>(["light", "moderate", "heavy"]);
const LOCATION_CAT = new Set<string>(["home", "office", "school", "cafe", "outdoor", "public", "transit", "unknown"]);
const SOURCE_SURFACE = new Set<string>(["calendar_past_anchor", "location_detail", "candidate_lens"]);

/**
 * 観測時の文脈スナップショット（★全 coarse / nullable / redacted）。
 * purpose(lens) / trigger は PostVisitObservation の top-level に既にあるため重複保存しない。
 */
export interface PostVisitContextSnapshot {
  readonly v: 1;
  /** どの画面由来か（provenance・必須）。 */
  readonly sourceSurface: PostVisitSourceSurface;
  readonly timeOfDay: TimeOfDayBucket | null;
  readonly dayType: DayTypeBucket | null;
  readonly gapBucket: GapBucket | null;
  readonly weatherKind: WeatherBucket | null;
  readonly fatigue: FatigueBucket | null;
  readonly companion: CompanionBucket | null;
  readonly mobilityLoad: MobilityLoadBucket | null;
  readonly locationCategory: LocationCategoryBucket | null;
}

/** snapshot の永続化 whitelist（これ以外のキーは保存しない＝defense-in-depth）。 */
export const PERSISTED_CONTEXT_KEYS = [
  "v", "sourceSurface", "timeOfDay", "dayType", "gapBucket", "weatherKind", "fatigue", "companion", "mobilityLoad", "locationCategory",
] as const;

// ── bucket helpers（pure・Date 不使用）──

/** 時刻(0-23) → timeOfDay。null は null。 */
export function timeOfDayBucketFromHour(hour: number | null | undefined): TimeOfDayBucket | null {
  if (hour == null || !Number.isFinite(hour)) return null;
  const h = Math.floor(hour);
  if (h < 5) return "night";
  if (h < 9) return "early_morning";
  if (h < 12) return "morning";
  if (h < 14) return "midday";
  if (h < 18) return "afternoon";
  if (h < 22) return "evening";
  return "night";
}

/** 曜日(0=日..6=土) → weekday/weekend。null は null。 */
export function dayTypeBucketFromDow(dow: number | null | undefined): DayTypeBucket | null {
  if (dow == null || !Number.isFinite(dow)) return null;
  const d = ((Math.floor(dow) % 7) + 7) % 7;
  return d === 0 || d === 6 ? "weekend" : "weekday";
}

/** 次予定までの分（exact は呼び出し側のみ・ここで即 bucket 化して exact は捨てる）。null=次予定なし→"none"。 */
export function gapBucketFromMinutes(minutesToNext: number | null | undefined): GapBucket {
  if (minutesToNext == null || !Number.isFinite(minutesToNext)) return "none";
  const m = Math.max(0, minutesToNext);
  if (m < 30) return "under_30";
  if (m < 60) return "30_60";
  if (m < 120) return "60_120";
  return "over_120";
}

/** 同行者人数/有無 → solo/with_someone。0 or null/undefined → solo。 */
export function companionBucketFromCount(count: number | null | undefined): CompanionBucket {
  return count != null && count > 0 ? "with_someone" : "solo";
}

/** locationCategory 文字列 → bucket（未知は unknown・null は null）。 */
export function locationCategoryBucket(cat: string | null | undefined): LocationCategoryBucket | null {
  if (cat == null) return null;
  return LOCATION_CAT.has(cat) ? (cat as LocationCategoryBucket) : "unknown";
}

// ── redaction / validation ──

function bucketOrNull<T extends string>(v: unknown, set: ReadonlySet<string>): T | null {
  return typeof v === "string" && set.has(v) ? (v as T) : null;
}

/**
 * 任意入力 → 安全な PostVisitContextSnapshot（pure・redaction firewall）。
 *   - sourceSurface が不正なら **null**（snapshot 自体を捨てる＝provenance 不明は記録しない）。
 *   - その他の field は不正/未知なら null に落とす（自由値・PII を一切残さない）。
 */
export function sanitizeContextSnapshot(raw: unknown): PostVisitContextSnapshot | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.sourceSurface !== "string" || !SOURCE_SURFACE.has(o.sourceSurface)) return null;
  return {
    v: 1,
    sourceSurface: o.sourceSurface as PostVisitSourceSurface,
    timeOfDay: bucketOrNull<TimeOfDayBucket>(o.timeOfDay, TIME_OF_DAY),
    dayType: bucketOrNull<DayTypeBucket>(o.dayType, DAY_TYPE),
    gapBucket: bucketOrNull<GapBucket>(o.gapBucket, GAP),
    weatherKind: bucketOrNull<WeatherBucket>(o.weatherKind, WEATHER),
    fatigue: bucketOrNull<FatigueBucket>(o.fatigue, FATIGUE),
    companion: bucketOrNull<CompanionBucket>(o.companion, COMPANION),
    mobilityLoad: bucketOrNull<MobilityLoadBucket>(o.mobilityLoad, MOBILITY),
    locationCategory: bucketOrNull<LocationCategoryBucket>(o.locationCategory, LOCATION_CAT),
  };
}

export function isPostVisitContextSnapshot(raw: unknown): raw is PostVisitContextSnapshot {
  return sanitizeContextSnapshot(raw) != null;
}
