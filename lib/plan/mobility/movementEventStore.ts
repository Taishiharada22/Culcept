/**
 * lib/plan/mobility/movementEventStore.ts — A1-3: 実移動イベントの local store（derived only）
 *
 * ★目的: detector(A1-2) が推定した、または user が手動訂正した「実移動イベント」を per-day/per-leg で
 *   localStorage に保存する。後段（A1-4 personal pace ratio / A1-5 Day Rehearsal 反映）の正本。
 *
 * ★誠実性・安全境界（A1-0 audit / CEO 方針）— ここが本 store の肝:
 *   1. ★**raw GPS 座標を保存しない**。MovementEvent は derived metric（時刻 + 所要 + confidence + source）のみ。
 *      parse は既知 field しか読まないので、仮に raw 座標が混入しても store に入らない（型で担保）。
 *   2. ★**sensitive leg は記録しない**（MovementPrivacyClass を caller が判定し gate.sensitive で渡す）。
 *   3. ★**opt-in 未許可なら記録しない**（gate.optInGranted）。＝同意なき観測をしない。
 *   4. client-only / SSR・localStorage 不在/破損は fail-open / DB・network 不使用 / versioned key + 上限。
 *
 * 命名: これは GPS 推定 + 手動の「実移動イベント」。hypothesisFeedbackStore（予定の癖）とは別 store。
 */
import type { DetectedMovement, MovementConfidence } from "@/lib/plan/mobility/movementEventDetector";
import { isRouteTransportMode, type RouteTransportMode } from "@/lib/plan/map/routeMode";

export const MOVEMENT_EVENT_KEY = "aneurasync.plan.map.movementEvents.v1";
export const MOVEMENT_EVENT_SCHEMA_VERSION = 1 as const;
export const MAX_MOVEMENT_DAYS = 60;
export const MAX_MOVEMENT_LEGS_PER_DAY = 100;

/** 観測の出所。gps=detector 推定 / manual=user 手動訂正 / inferred=他 signal からの推定。 */
export type MovementSource = "gps" | "manual" | "inferred";

export const MOVEMENT_SOURCES: readonly MovementSource[] = ["gps", "manual", "inferred"];
export const MOVEMENT_CONFIDENCES: readonly MovementConfidence[] = ["high", "medium", "low"];

/**
 * ★derived only — raw GPS 座標を持たない（型で「永続禁止」を担保）。
 * actualDurationMin は 実出発↔実到着 の差（detector 由来）か user 訂正値。
 */
export interface MovementEvent {
  readonly actualDepartureAt: string | null; // ISO
  readonly actualArrivalAt: string | null; // ISO
  readonly completedAt: string | null; // ISO（確認/記録した時刻）
  readonly actualDurationMin: number | null; // derived（捏造しない・両端不在は null）
  readonly confidence: MovementConfidence;
  readonly source: MovementSource;
  // ★A1-6 additive 拡張（後方互換・古い event は欠落＝undefined で動く）。A1-4 が store だけで ratio を出すための tag。
  /** その leg の交通手段（pace 集約の単位）。 */
  readonly mode?: RouteTransportMode;
  /** 反復する OD クラス（home→office 等・cross-day 蓄積の単位）。sensitive 等で取れなければ省略。 */
  readonly odKey?: string;
  /** capture 時の route estimate（分・ratio の分母）。取れなければ null/省略。 */
  readonly estimateMin?: number | null;
}

export interface MovementEventStore {
  readonly version: typeof MOVEMENT_EVENT_SCHEMA_VERSION;
  readonly byDay: Readonly<Record<string, Readonly<Record<string, MovementEvent>>>>;
}

export const EMPTY_MOVEMENT_EVENT_STORE: MovementEventStore = {
  version: MOVEMENT_EVENT_SCHEMA_VERSION,
  byDay: {},
};

/** 記録ゲート: opt-in 許可 かつ sensitive でない ときだけ記録する（誠実な観測の前提）。 */
export interface MovementCaptureGate {
  readonly optInGranted: boolean;
  readonly sensitive: boolean;
}

/** opt-in 許可 ∧ 非 sensitive のときだけ true（記録可）。 */
export function isCaptureAllowed(gate: MovementCaptureGate): boolean {
  return gate.optInGranted === true && gate.sensitive !== true;
}

function isDayISO(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isIsoOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value)));
}

function isConfidence(value: unknown): value is MovementConfidence {
  return value === "high" || value === "medium" || value === "low";
}

function isSource(value: unknown): value is MovementSource {
  return value === "gps" || value === "manual" || value === "inferred";
}

function isMovementEvent(value: unknown): value is MovementEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const durationOk = v.actualDurationMin === null || (typeof v.actualDurationMin === "number" && Number.isFinite(v.actualDurationMin) && v.actualDurationMin >= 0);
  // ★additive 拡張は optional: undefined は OK・存在時のみ検証（後方互換）。
  const modeOk = v.mode === undefined || isRouteTransportMode(v.mode);
  const odKeyOk = v.odKey === undefined || (typeof v.odKey === "string" && v.odKey.length > 0);
  const estimateOk =
    v.estimateMin === undefined ||
    v.estimateMin === null ||
    (typeof v.estimateMin === "number" && Number.isFinite(v.estimateMin) && v.estimateMin >= 0);
  return (
    isIsoOrNull(v.actualDepartureAt) &&
    isIsoOrNull(v.actualArrivalAt) &&
    isIsoOrNull(v.completedAt) &&
    durationOk &&
    isConfidence(v.confidence) &&
    isSource(v.source) &&
    modeOk &&
    odKeyOk &&
    estimateOk
  );
}

/** ★既知 field だけを読み出す＝raw 座標等の余計な field は store に入らない（誠実性担保）。additive 拡張は存在時のみ。 */
function pickEvent(v: MovementEvent): MovementEvent {
  const base: MovementEvent = {
    actualDepartureAt: v.actualDepartureAt,
    actualArrivalAt: v.actualArrivalAt,
    completedAt: v.completedAt,
    actualDurationMin: v.actualDurationMin,
    confidence: v.confidence,
    source: v.source,
  };
  return {
    ...base,
    ...(v.mode !== undefined ? { mode: v.mode } : {}),
    ...(v.odKey !== undefined ? { odKey: v.odKey } : {}),
    ...(v.estimateMin !== undefined ? { estimateMin: v.estimateMin } : {}),
  };
}

export function parseMovementEventStore(raw: string | null): MovementEventStore {
  if (!raw) return EMPTY_MOVEMENT_EVENT_STORE;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_MOVEMENT_EVENT_STORE;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { version?: unknown }).version !== MOVEMENT_EVENT_SCHEMA_VERSION
  ) {
    return EMPTY_MOVEMENT_EVENT_STORE;
  }
  const rawByDay = (parsed as { byDay?: unknown }).byDay;
  if (typeof rawByDay !== "object" || rawByDay === null) return EMPTY_MOVEMENT_EVENT_STORE;
  const byDay: Record<string, Record<string, MovementEvent>> = {};
  for (const [day, legs] of Object.entries(rawByDay as Record<string, unknown>)) {
    if (!isDayISO(day)) continue;
    if (typeof legs !== "object" || legs === null) continue;
    const clean: Record<string, MovementEvent> = {};
    for (const [legKey, entry] of Object.entries(legs as Record<string, unknown>)) {
      if (typeof legKey !== "string" || legKey.length === 0) continue;
      if (!isMovementEvent(entry)) continue;
      clean[legKey] = pickEvent(entry); // ★既知 field のみ
    }
    if (Object.keys(clean).length > 0) byDay[day] = clean;
  }
  return { version: MOVEMENT_EVENT_SCHEMA_VERSION, byDay };
}

export function applyMovementCaps(store: MovementEventStore): MovementEventStore {
  const keptDays = Object.keys(store.byDay).sort().slice(-MAX_MOVEMENT_DAYS);
  const byDay: Record<string, Record<string, MovementEvent>> = {};
  for (const day of keptDays) {
    const legs = store.byDay[day];
    const keptLegs = Object.keys(legs).slice(0, MAX_MOVEMENT_LEGS_PER_DAY);
    const clean: Record<string, MovementEvent> = {};
    for (const k of keptLegs) clean[k] = legs[k];
    byDay[day] = clean;
  }
  return { version: MOVEMENT_EVENT_SCHEMA_VERSION, byDay };
}

/** same day / same leg は最後の 1 件に上書き（純粋）。 */
export function setMovementEvent(
  store: MovementEventStore,
  dayISO: string,
  legKey: string,
  event: MovementEvent,
): MovementEventStore {
  if (!isDayISO(dayISO) || typeof legKey !== "string" || legKey.length === 0 || !isMovementEvent(event)) {
    return store;
  }
  const prevDay = store.byDay[dayISO] ?? {};
  return applyMovementCaps({
    version: MOVEMENT_EVENT_SCHEMA_VERSION,
    byDay: { ...store.byDay, [dayISO]: { ...prevDay, [legKey]: pickEvent(event) } },
  });
}

export function getMovementEvent(
  store: MovementEventStore,
  dayISO: string,
  legKey: string,
): MovementEvent | null {
  return store.byDay[dayISO]?.[legKey] ?? null;
}

/** capture 時の文脈タグ（A1-4 集約用・additive）。 */
export interface MovementEventMeta {
  readonly mode?: RouteTransportMode;
  readonly odKey?: string;
  readonly estimateMin?: number | null;
}

function withMeta(base: MovementEvent, meta?: MovementEventMeta): MovementEvent {
  if (!meta) return base;
  return {
    ...base,
    ...(meta.mode !== undefined ? { mode: meta.mode } : {}),
    ...(meta.odKey !== undefined ? { odKey: meta.odKey } : {}),
    ...(meta.estimateMin !== undefined ? { estimateMin: meta.estimateMin } : {}),
  };
}

/** detector 出力(epoch ms) を保存可能な MovementEvent(ISO・derived) に変換（純粋）。 */
export function buildMovementEventFromDetection(
  detected: DetectedMovement,
  completedAtMs: number,
  meta?: MovementEventMeta,
): MovementEvent {
  return withMeta(
    {
      actualDepartureAt:
        detected.actualDepartureAtMs != null ? new Date(detected.actualDepartureAtMs).toISOString() : null,
      actualArrivalAt:
        detected.actualArrivalAtMs != null ? new Date(detected.actualArrivalAtMs).toISOString() : null,
      completedAt: new Date(completedAtMs).toISOString(),
      actualDurationMin: detected.actualDurationMin,
      confidence: detected.confidence,
      source: detected.source,
    },
    meta,
  );
}

/**
 * ★A1-6a 手動ログ: user が入力した「実際の所要（分）」から MovementEvent を作る（純粋）。
 * source="manual"・confidence="high"（user 自己申告）。出発/到着時刻は持たない（duration のみ）。
 * actualDurationMin が無効（null/負/非有限）なら null を返す（捏造しない）。
 */
export function buildMovementEventManual(input: {
  actualDurationMin: number;
  completedAtMs: number;
  meta?: MovementEventMeta;
}): MovementEvent | null {
  if (!Number.isFinite(input.actualDurationMin) || input.actualDurationMin < 0) return null;
  return withMeta(
    {
      actualDepartureAt: null,
      actualArrivalAt: null,
      completedAt: new Date(input.completedAtMs).toISOString(),
      actualDurationMin: Math.round(input.actualDurationMin),
      confidence: "high",
      source: "manual",
    },
    input.meta,
  );
}

function getStorage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

function readMovementEventStore(): MovementEventStore {
  const ls = getStorage();
  if (!ls) return EMPTY_MOVEMENT_EVENT_STORE;
  try {
    return parseMovementEventStore(ls.getItem(MOVEMENT_EVENT_KEY));
  } catch {
    return EMPTY_MOVEMENT_EVENT_STORE;
  }
}

/**
 * 実移動イベントを保存（client・fail-open）。
 * ★gate を満たさない（opt-in 未許可 or sensitive）なら **何も記録しない**（同意なき/機微な観測をしない）。
 */
export function recordMovementEvent(
  dayISO: string,
  legKey: string,
  event: MovementEvent,
  gate: MovementCaptureGate,
): void {
  if (!isCaptureAllowed(gate)) return; // ★sensitive blackout / opt-in gate
  const ls = getStorage();
  if (!ls) return;
  try {
    ls.setItem(
      MOVEMENT_EVENT_KEY,
      JSON.stringify(setMovementEvent(readMovementEventStore(), dayISO, legKey, event)),
    );
  } catch {
    /* quota 等は fail-open */
  }
}

/** 1 leg の実移動イベントを読む（client・fail-open）。 */
export function loadMovementEvent(dayISO: string, legKey: string): MovementEvent | null {
  return getMovementEvent(readMovementEventStore(), dayISO, legKey);
}

/** store 全体を読む（client・fail-open）。A1-4 personal pace ratio 集約用（pure 層に渡す）。 */
export function loadMovementEventStore(): MovementEventStore {
  return readMovementEventStore();
}

/** 1 leg の実移動イベントを取り除いた store を返す（純粋・可逆 UX 用）。 */
export function removeMovementEvent(
  store: MovementEventStore,
  dayISO: string,
  legKey: string,
): MovementEventStore {
  const day = store.byDay[dayISO];
  if (!day || !(legKey in day)) return store;
  const nextDay: Record<string, MovementEvent> = {};
  for (const [k, v] of Object.entries(day)) if (k !== legKey) nextDay[k] = v;
  const byDay: Record<string, Record<string, MovementEvent>> = { ...store.byDay };
  if (Object.keys(nextDay).length > 0) byDay[dayISO] = nextDay;
  else delete byDay[dayISO];
  return { version: MOVEMENT_EVENT_SCHEMA_VERSION, byDay };
}

/** ★A1-6a 取消: 1 leg の記録を削除（client・fail-open・可逆）。 */
export function deleteMovementEvent(dayISO: string, legKey: string): void {
  const ls = getStorage();
  if (!ls) return;
  try {
    ls.setItem(MOVEMENT_EVENT_KEY, JSON.stringify(removeMovementEvent(readMovementEventStore(), dayISO, legKey)));
  } catch {
    /* fail-open */
  }
}
