/**
 * lib/plan/mobility/hypothesisFeedbackStore.ts — v0-E: 仮説への feedback の記録（別 store）
 *
 * selectedModeStore(S1-A) は「現在の選択」正本として不変。本 store は「その選択がどんな文脈で
 * 行われたか」を記録する別 store。後で「なぜ correction だったか」を再現できるよう、
 * kind だけでなく surfacedMode / chosenMode / schemaVersion を保存する（GPT 補正）。
 *
 * ★命名・誠実性: GPS 観測ではないので true actual と呼ばない。これは hypothesis feedback。
 * 不変: client-only / SSR・localStorage 不在/破損は fail-open / DB・network 不使用 /
 *   versioned key + 日数・件数上限 / selectedModeStore を壊さない。
 */
import { isRouteTransportMode, type RouteTransportMode } from "@/lib/plan/map/routeMode";

export const HYPOTHESIS_FEEDBACK_KEY = "aneurasync.plan.map.hypothesisFeedback.v1";
/** schemaVersion（保存される。将来の migration 判定用） */
export const HYPOTHESIS_FEEDBACK_SCHEMA_VERSION = 1 as const;
export const MAX_FEEDBACK_DAYS = 60;
export const MAX_FEEDBACK_LEGS_PER_DAY = 100;

/** 選択 signal の種別（★true actual と呼ばない・GPS でない hypothesis feedback） */
export type SelectionSignalKind = "selected" | "confirmation" | "explicitCorrection";

/** 記録対象の kind（selected=通常選択は記録しない＝store には confirmation/explicitCorrection のみ） */
export type RecordedSignalKind = Exclude<SelectionSignalKind, "selected">;

/**
 * ★A0（理由観測・local reason capture）: 推奨と違う選択（explicitCorrection）をした「なぜ」。
 * ★per-leg の文脈であって人格 trait ではない（「この時はこう」・「あなたはこういう人」と言わない）。
 * ★user の 1-tap のみ（自動推論・捏造しない）・任意・可逆。free text は持たない（"other" も chip）。
 */
export type MobilityReason = "tired" | "scenery" | "cheap" | "hurry" | "mood" | "other";

/** UI 表示順（疲れ/景色/安い/急ぎ/気分/その他）。 */
export const MOBILITY_REASONS: readonly MobilityReason[] = ["tired", "scenery", "cheap", "hurry", "mood", "other"];

/** 日本語ラベル（UI 用）。 */
export const MOBILITY_REASON_LABELS: Readonly<Record<MobilityReason, string>> = {
  tired: "疲れ",
  scenery: "景色",
  cheap: "安い",
  hurry: "急ぎ",
  mood: "気分",
  other: "その他",
};

export function isMobilityReason(value: unknown): value is MobilityReason {
  return typeof value === "string" && (MOBILITY_REASONS as readonly string[]).includes(value);
}

/** feedback entry: surfacedMode/chosenMode を保存し「何への訂正か」を後で再現可能に */
export interface HypothesisFeedbackEntry {
  readonly kind: RecordedSignalKind;
  /** 仮説として表示されていた mode */
  readonly surfacedMode: RouteTransportMode;
  /** ユーザーが実際に選んだ mode */
  readonly chosenMode: RouteTransportMode;
  /** ★A0: 訂正の理由（任意・後付け・無効/不在は省略＝後方互換）。 */
  readonly reason?: MobilityReason;
}

export interface HypothesisFeedbackStore {
  /** = schemaVersion */
  readonly version: typeof HYPOTHESIS_FEEDBACK_SCHEMA_VERSION;
  readonly byDay: Readonly<Record<string, Readonly<Record<string, HypothesisFeedbackEntry>>>>;
}

export const EMPTY_FEEDBACK_STORE: HypothesisFeedbackStore = {
  version: HYPOTHESIS_FEEDBACK_SCHEMA_VERSION,
  byDay: {},
};

function isDayISO(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isRecordedKind(value: unknown): value is RecordedSignalKind {
  return value === "confirmation" || value === "explicitCorrection";
}

function isFeedbackEntry(value: unknown): value is HypothesisFeedbackEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { kind?: unknown; surfacedMode?: unknown; chosenMode?: unknown };
  return (
    isRecordedKind(v.kind) &&
    isRouteTransportMode(v.surfacedMode) &&
    isRouteTransportMode(v.chosenMode)
  );
}

/**
 * 選択の文脈から記録すべき feedback entry を決める（純粋）。
 * - readOnly(過去 leg・実績の器) は記録しない
 * - 仮説非表示（surfacedMode == null = sensitive/cold_start/low_signal/split 含む）は記録しない（=selected 既定・store に書かない）
 * - 仮説表示後に同じ mode → confirmation / 違う mode → explicitCorrection
 * ★すべての選択を high precision override にしない。記録するのは仮説が出ていた時だけ。
 */
export function buildFeedbackEntry(input: {
  surfacedMode: RouteTransportMode | null;
  chosenMode: RouteTransportMode;
  readOnly: boolean;
}): HypothesisFeedbackEntry | null {
  if (input.readOnly) return null;
  if (input.surfacedMode == null) return null;
  return {
    kind: input.chosenMode === input.surfacedMode ? "confirmation" : "explicitCorrection",
    surfacedMode: input.surfacedMode,
    chosenMode: input.chosenMode,
  };
}

export function parseFeedbackStore(raw: string | null): HypothesisFeedbackStore {
  if (!raw) return EMPTY_FEEDBACK_STORE;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_FEEDBACK_STORE;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { version?: unknown }).version !== HYPOTHESIS_FEEDBACK_SCHEMA_VERSION
  ) {
    return EMPTY_FEEDBACK_STORE;
  }
  const rawByDay = (parsed as { byDay?: unknown }).byDay;
  if (typeof rawByDay !== "object" || rawByDay === null) return EMPTY_FEEDBACK_STORE;
  const byDay: Record<string, Record<string, HypothesisFeedbackEntry>> = {};
  for (const [day, legs] of Object.entries(rawByDay as Record<string, unknown>)) {
    if (!isDayISO(day)) continue;
    if (typeof legs !== "object" || legs === null) continue;
    const clean: Record<string, HypothesisFeedbackEntry> = {};
    for (const [legKey, entry] of Object.entries(legs as Record<string, unknown>)) {
      if (typeof legKey !== "string" || legKey.length === 0) continue;
      if (!isFeedbackEntry(entry)) continue;
      // ★A0: reason は valid なら保持・無効/不在は drop（entry は壊さない＝後方互換）。
      const rawReason = (entry as { reason?: unknown }).reason;
      clean[legKey] = isMobilityReason(rawReason)
        ? { kind: entry.kind, surfacedMode: entry.surfacedMode, chosenMode: entry.chosenMode, reason: rawReason }
        : { kind: entry.kind, surfacedMode: entry.surfacedMode, chosenMode: entry.chosenMode };
    }
    if (Object.keys(clean).length > 0) byDay[day] = clean;
  }
  return { version: HYPOTHESIS_FEEDBACK_SCHEMA_VERSION, byDay };
}

export function applyFeedbackCaps(store: HypothesisFeedbackStore): HypothesisFeedbackStore {
  const keptDays = Object.keys(store.byDay).sort().slice(-MAX_FEEDBACK_DAYS);
  const byDay: Record<string, Record<string, HypothesisFeedbackEntry>> = {};
  for (const day of keptDays) {
    const legs = store.byDay[day];
    const keptLegs = Object.keys(legs).slice(0, MAX_FEEDBACK_LEGS_PER_DAY);
    const clean: Record<string, HypothesisFeedbackEntry> = {};
    for (const k of keptLegs) clean[k] = legs[k];
    byDay[day] = clean;
  }
  return { version: HYPOTHESIS_FEEDBACK_SCHEMA_VERSION, byDay };
}

/** same day / same leg は最後の1件に上書き（重複しない） */
export function setFeedback(
  store: HypothesisFeedbackStore,
  dayISO: string,
  legKey: string,
  entry: HypothesisFeedbackEntry,
): HypothesisFeedbackStore {
  if (!isDayISO(dayISO) || typeof legKey !== "string" || legKey.length === 0 || !isFeedbackEntry(entry)) {
    return store;
  }
  const prevDay = store.byDay[dayISO] ?? {};
  return applyFeedbackCaps({
    version: HYPOTHESIS_FEEDBACK_SCHEMA_VERSION,
    byDay: { ...store.byDay, [dayISO]: { ...prevDay, [legKey]: entry } },
  });
}

export function getFeedback(
  store: HypothesisFeedbackStore,
  dayISO: string,
  legKey: string,
): HypothesisFeedbackEntry | null {
  return store.byDay[dayISO]?.[legKey] ?? null;
}

/** ★A0: entry に reason を載せた新 entry を返す（純粋）。reason=null で解除（field 省略）。 */
export function withReason(entry: HypothesisFeedbackEntry, reason: MobilityReason | null): HypothesisFeedbackEntry {
  if (reason == null) {
    return { kind: entry.kind, surfacedMode: entry.surfacedMode, chosenMode: entry.chosenMode };
  }
  return { kind: entry.kind, surfacedMode: entry.surfacedMode, chosenMode: entry.chosenMode, reason };
}

/**
 * ★A0: 既存 entry の reason を更新（純粋）。entry が無い leg は no-op（correction が無い所に reason を付けない）。
 * reason=null で解除（可逆）。
 */
export function setFeedbackReason(
  store: HypothesisFeedbackStore,
  dayISO: string,
  legKey: string,
  reason: MobilityReason | null,
): HypothesisFeedbackStore {
  const existing = getFeedback(store, dayISO, legKey);
  if (existing == null) return store; // correction が記録されている leg だけに付く
  return setFeedback(store, dayISO, legKey, withReason(existing, reason));
}

function getStorage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

function readFeedbackStore(): HypothesisFeedbackStore {
  const ls = getStorage();
  if (!ls) return EMPTY_FEEDBACK_STORE;
  try {
    return parseFeedbackStore(ls.getItem(HYPOTHESIS_FEEDBACK_KEY));
  } catch {
    return EMPTY_FEEDBACK_STORE;
  }
}

/** feedback を保存（client・fail-open）。entry が null（記録対象でない）なら何もしない。 */
export function saveHypothesisFeedback(
  dayISO: string,
  legKey: string,
  entry: HypothesisFeedbackEntry | null,
): void {
  if (entry == null) return;
  const ls = getStorage();
  if (!ls) return;
  try {
    ls.setItem(HYPOTHESIS_FEEDBACK_KEY, JSON.stringify(setFeedback(readFeedbackStore(), dayISO, legKey, entry)));
  } catch {
    /* quota 等は fail-open */
  }
}

/** v0-F が読む用（client・fail-open）。 */
export function loadHypothesisFeedback(dayISO: string, legKey: string): HypothesisFeedbackEntry | null {
  return getFeedback(readFeedbackStore(), dayISO, legKey);
}

/** ★A0-2: store 全体を読む（client・fail-open）。reason insight 集約用（pure 層に store を渡す）。 */
export function loadHypothesisFeedbackStore(): HypothesisFeedbackStore {
  return readFeedbackStore();
}

/**
 * ★A0: 既存 correction entry に reason を保存（client・fail-open）。reason=null で解除。
 * entry が無い leg は no-op（setFeedbackReason が判定）。DB・network 不使用・既存 entry を壊さない。
 */
export function saveHypothesisFeedbackReason(dayISO: string, legKey: string, reason: MobilityReason | null): void {
  const ls = getStorage();
  if (!ls) return;
  try {
    ls.setItem(HYPOTHESIS_FEEDBACK_KEY, JSON.stringify(setFeedbackReason(readFeedbackStore(), dayISO, legKey, reason)));
  } catch {
    /* quota 等は fail-open */
  }
}
