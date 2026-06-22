/**
 * lib/plan/postVisit/postVisitStore.ts
 *   — 評価OS / Stage 0: post-visit 観測の最小 localStorage shadow store（dormant）
 *
 * ★shadow only: 記録するだけ。ranking/推薦/UI 表示順に一切影響しない。
 * ★flag OFF / SSR / production では完全 no-op（読みは [] / null、書きは無動作）。
 * ★redaction の defense-in-depth: PERSISTED_OBSERVATION_KEYS の **whitelist のみ**シリアライズ。
 *   生 GPS/住所/場所名/notes/正確な滞在分が万一渡っても **永続化されない**。
 * ★fail-soft: 壊れた JSON / quota / storage 無効は握りつぶして fallback。versioned envelope。
 */
import {
  isPostVisitCheckEnabled,
  PERSISTED_OBSERVATION_KEYS,
  type PostVisitObservation,
  type PostVisitResponse,
  type ReasonChipKey,
  type PostVisitTrigger,
  type DwellSignal,
} from "./postVisitObservation";

export const POST_VISIT_OBS_KEY = "aneurasync.postvisit.v1";

const SCHEMA_VERSION = 1;
const MAX_OBSERVATIONS = 500; // ローカル上限（古いものから捨てる）
const MAX_ELICIT_LOG = 100;

/** elicit/skip の最小ログ（suppress の after_skip / recent_same を derive するため）。 */
export interface ElicitEvent {
  readonly placeKey: string;
  readonly at: number;
  readonly outcome: "answered" | "skipped";
}

interface Envelope {
  v: number;
  observations: PostVisitObservation[];
  elicitLog: ElicitEvent[];
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readEnvelope(): Envelope {
  const empty: Envelope = { v: SCHEMA_VERSION, observations: [], elicitLog: [] };
  if (!isBrowser()) return empty;
  try {
    const raw = window.localStorage.getItem(POST_VISIT_OBS_KEY);
    if (raw == null) return empty;
    const data = JSON.parse(raw) as unknown;
    if (data == null || typeof data !== "object") return empty;
    const env = data as Partial<Envelope>;
    return {
      v: SCHEMA_VERSION,
      observations: Array.isArray(env.observations) ? env.observations.map(sanitizeObservation).filter((o): o is PostVisitObservation => o != null) : [],
      elicitLog: Array.isArray(env.elicitLog) ? env.elicitLog.filter(isElicitEvent) : [],
    };
  } catch {
    return empty; // 壊れた JSON / storage 無効 → fallback
  }
}

function writeEnvelope(env: Envelope): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(POST_VISIT_OBS_KEY, JSON.stringify(env));
  } catch {
    /* fail-soft: quota / storage 無効 → no-op */
  }
}

const RESPONSE_SET: ReadonlySet<string> = new Set<PostVisitResponse>(["keep", "conditional", "not_today", "no_more"]);
const TRIGGER_SET: ReadonlySet<string> = new Set<PostVisitTrigger>(["lens_proposed", "first_visit", "important_plan", "discovery_domain", "early_leave", "long_stay"]);
const DWELL_SET: ReadonlySet<string> = new Set<DwellSignal>(["early", "long", "asplanned"]);
const REASON_SET: ReadonlySet<string> = new Set<ReasonChipKey>(["content_good", "calm", "crowded", "felt_pricey", "was_tired", "service", "solo", "with_someone", "ok_noon", "not_night", "rain_inconvenient", "commute_tiring", "other"]);

/**
 * ★redaction whitelist serialize: 許可キーだけで観測を作り直す。
 *   入力に余計なキー（name/address/coords/notes/dwellMinutes 等）があっても **出力に残らない**。
 */
function sanitizeObservation(raw: unknown): PostVisitObservation | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.placeKey !== "string" || typeof o.lens !== "string" || typeof o.at !== "number") return null;
  if (typeof o.trigger !== "string" || !TRIGGER_SET.has(o.trigger)) return null;
  const response = typeof o.response === "string" && RESPONSE_SET.has(o.response) ? (o.response as PostVisitResponse) : null;
  const reasonChips = Array.isArray(o.reasonChips) ? o.reasonChips.filter((c): c is ReasonChipKey => typeof c === "string" && REASON_SET.has(c)) : [];
  const dwellSignal = typeof o.dwellSignal === "string" && DWELL_SET.has(o.dwellSignal) ? (o.dwellSignal as DwellSignal) : null;
  // ★whitelist のキーだけで再構築（PERSISTED_OBSERVATION_KEYS 準拠）
  void PERSISTED_OBSERVATION_KEYS;
  return {
    v: 1,
    placeKey: o.placeKey,
    lens: o.lens as PostVisitObservation["lens"],
    trigger: o.trigger as PostVisitTrigger,
    response,
    reasonChips,
    dwellSignal,
    at: o.at,
  };
}

/**
 * ★テスト/防御用 public: 任意オブジェクトを「永続化可能な observation」へ redact（whitelist のみ・pure）。
 *   生 GPS/住所/場所名/notes/正確な滞在分などの禁止キーは **出力に残らない**。不正入力は null。
 */
export function redactForPersistence(raw: unknown): PostVisitObservation | null {
  return sanitizeObservation(raw);
}

function isElicitEvent(raw: unknown): raw is ElicitEvent {
  if (raw == null || typeof raw !== "object") return false;
  const e = raw as Record<string, unknown>;
  return typeof e.placeKey === "string" && typeof e.at === "number" && (e.outcome === "answered" || e.outcome === "skipped");
}

// ── public API（全て flag OFF / SSR で no-op）──

/** 観測を読む（flag OFF / SSR → []）。 */
export function loadPostVisitObservations(): PostVisitObservation[] {
  if (!isPostVisitCheckEnabled()) return [];
  return readEnvelope().observations;
}

/** 観測を1件記録（flag OFF / SSR → no-op）。★sanitize して whitelist のみ保存。 */
export function recordPostVisitObservation(obs: PostVisitObservation): void {
  if (!isPostVisitCheckEnabled()) return;
  const clean = sanitizeObservation(obs);
  if (!clean) return;
  const env = readEnvelope();
  const observations = [...env.observations, clean].slice(-MAX_OBSERVATIONS);
  const elicitLog = [...env.elicitLog, { placeKey: clean.placeKey, at: clean.at, outcome: (clean.response != null ? "answered" : "skipped") as ElicitEvent["outcome"] }].slice(-MAX_ELICIT_LOG);
  writeEnvelope({ v: SCHEMA_VERSION, observations, elicitLog });
}

/** skip/拒否を記録（after_skip suppress の derive 用・flag OFF / SSR → no-op）。 */
export function recordPostVisitSkip(placeKey: string, at: number): void {
  if (!isPostVisitCheckEnabled()) return;
  const env = readEnvelope();
  const elicitLog = [...env.elicitLog, { placeKey, at, outcome: "skipped" as const }].slice(-MAX_ELICIT_LOG);
  writeEnvelope({ ...env, v: SCHEMA_VERSION, elicitLog });
}

/** 直近 skip 時刻（なければ null）。shouldElicit の lastSkippedAt に渡す。 */
export function lastSkipAt(placeKey?: string): number | null {
  if (!isPostVisitCheckEnabled()) return null;
  const log = readEnvelope().elicitLog.filter((e) => e.outcome === "skipped" && (placeKey == null || e.placeKey === placeKey));
  return log.length ? Math.max(...log.map((e) => e.at)) : null;
}

/** 同 placeKey を直近に聞いた時刻（answered/skipped 問わず・なければ null）。recent_same 用。 */
export function lastElicitAtForPlace(placeKey: string): number | null {
  if (!isPostVisitCheckEnabled()) return null;
  const log = readEnvelope().elicitLog.filter((e) => e.placeKey === placeKey);
  return log.length ? Math.max(...log.map((e) => e.at)) : null;
}
