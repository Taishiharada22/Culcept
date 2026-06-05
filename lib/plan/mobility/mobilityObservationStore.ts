/**
 * lib/plan/mobility/mobilityObservationStore.ts — L1-a: 移動観測の前方記録（forward-capture）
 *
 * ★位置づけ: これは「学習本体」ではない。後で belief(L1-b) / cold-start pooling(L4) が
 *   OD × timeband × weekday で一般化できるよう、今から rich な観測ログを安全に録り始める層。
 *   過去の OD は anchor archive 不在で再構成できない → 未来の観測を溜めるのが正道。
 *
 * ★正本の所在: selectedModeStore が「現在選択」の正本。本 store の `mode` は capture 時スナップショット。
 *   L1-b では選択 mode は selectedModeStore を正とし、本 store の mode と不一致なら stale として落とす。
 *
 * ★place key: normalized locationText（crude）。placeId と同等に扱わない（Google 解決での昇格は別承認）。
 * ★privacy: どちらかの端点が sensitive なら originKey/destKey を保存しない（両方 null・privacyClass="redacted"）。
 *   OD ペアの linkage 自体が機微なため片側だけ残さない。timeband/weekday/mode は保持（非場所情報）。
 *
 * 不変: client-only / SSR・localStorage 不在/破損は fail-open / DB・network・Google API なし /
 *   versioned key + 日数・件数上限 / selectedModeStore・hypothesisFeedbackStore を壊さない /
 *   Date.now・argless new Date() 不使用（timeband は anchor 時刻、weekday は plan 日付から決定論算出）。
 */
import { isRouteTransportMode, type RouteTransportMode } from "@/lib/plan/map/routeMode";

export const MOBILITY_OBSERVATION_KEY = "aneurasync.plan.map.mobilityObservation.v1";
/** schemaVersion（root で管理。entry ごとには持たない） */
export const MOBILITY_OBSERVATION_SCHEMA_VERSION = 1 as const;
export const MAX_OBSERVATION_DAYS = 60;
export const MAX_OBSERVATION_LEGS_PER_DAY = 100;

/** 時間帯（朝/昼/夕/夜 の 4 分割。深夜は night に含む） */
export type Timeband = "morning" | "afternoon" | "evening" | "night";
/** 曜日（weekday/weekend の 2 値） */
export type WeekdayBucket = "weekday" | "weekend";
/** privacy 区分（sensitive 端点を含む leg は redacted） */
export type PrivacyClass = "normal" | "redacted";

/** 1 回の移動観測（rich context 付き）。OD は redacted 時 null。 */
export interface MobilityObservation {
  /** capture 時の選択 mode スナップショット（★正本は selectedModeStore） */
  readonly mode: RouteTransportMode;
  /** to-anchor.startTime 由来の時間帯 */
  readonly timeband: Timeband;
  /** plan 日付由来の曜日区分 */
  readonly weekday: WeekdayBucket;
  /** 出発地 place key（normalized locationText・crude）。redacted/空は null */
  readonly originKey: string | null;
  /** 到着地 place key（同上） */
  readonly destKey: string | null;
  readonly privacyClass: PrivacyClass;
}

export interface MobilityObservationStore {
  /** = schemaVersion */
  readonly version: typeof MOBILITY_OBSERVATION_SCHEMA_VERSION;
  readonly byDay: Readonly<Record<string, Readonly<Record<string, MobilityObservation>>>>;
}

export const EMPTY_OBSERVATION_STORE: MobilityObservationStore = {
  version: MOBILITY_OBSERVATION_SCHEMA_VERSION,
  byDay: {},
};

// ───────────────────────── pure helpers ─────────────────────────

/**
 * locationText の crude 正規化（NFKC → lowercase → 連続空白圧縮 → trim）。空は null。
 * ★これは placeId ではない。表記揺れを荒く吸収するだけの crude key。
 */
export function normalizeLocationText(text: string | null | undefined): string | null {
  if (typeof text !== "string") return null;
  const n = text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  return n.length === 0 ? null : n;
}

/** "HH:mm" / ISO8601 から hour[0-23] を取り出す（決定論・Date 不使用）。失敗は null。 */
export function parseHour(startTime: string | null | undefined): number | null {
  if (typeof startTime !== "string" || startTime.length === 0) return null;
  const hm = /^(\d{1,2}):(\d{2})/.exec(startTime); // "HH:mm" / "H:mm"
  if (hm) {
    const h = Number(hm[1]);
    return Number.isInteger(h) && h >= 0 && h <= 23 ? h : null;
  }
  const iso = /T(\d{2}):(\d{2})/.exec(startTime); // ISO8601 の時刻部
  if (iso) {
    const h = Number(iso[1]);
    return Number.isInteger(h) && h >= 0 && h <= 23 ? h : null;
  }
  return null;
}

/**
 * to-anchor.startTime（到着時刻＝movement の保守 proxy）→ timeband。
 * 朝 5-10 / 昼 11-16 / 夕 17-21 / 夜 22-4（深夜含む）。
 * ★時刻不明（unreachable: anchor は常に妥当な startTime を持つ）は保守的に "night"。
 */
export function toTimeband(startTime: string | null | undefined): Timeband {
  const h = parseHour(startTime);
  if (h == null) return "night";
  if (h >= 5 && h <= 10) return "morning";
  if (h >= 11 && h <= 16) return "afternoon";
  if (h >= 17 && h <= 21) return "evening";
  return "night"; // 22, 23, 0-4
}

/**
 * Zeller's congruence で曜日を純算術算出（Date を一切使わない＝決定論・Date.now 不使用）。
 * 返り値 h: 0=Sat, 1=Sun, 2=Mon, ..., 6=Fri。
 */
function zellerDow(y: number, m: number, d: number): number {
  let mm = m;
  let yy = y;
  if (mm < 3) {
    mm += 12;
    yy -= 1;
  }
  const k = yy % 100;
  const j = Math.floor(yy / 100);
  return (
    (d + Math.floor((13 * (mm + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) + 5 * j) % 7
  );
}

/** dayISO(YYYY-MM-DD) → weekday/weekend（決定論・Date 不使用）。malformed は保守的に "weekday"。 */
export function toWeekdayBucket(dayISO: string): WeekdayBucket {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayISO);
  if (!m) return "weekday";
  const dow = zellerDow(Number(m[1]), Number(m[2]), Number(m[3])); // 0=Sat,1=Sun
  return dow === 0 || dow === 1 ? "weekend" : "weekday";
}

/**
 * 選択コンテキストから観測を組み立てる（純粋）。記録対象でなければ null。
 * - readOnly(過去/done leg) は新規選択でない → null
 * - mode が RouteTransportMode でない（invalid）→ null（"unknown" は valid なので記録）
 * - sensitive(どちらか)→ originKey/destKey 両方 null・privacyClass="redacted"（OD linkage 保護）
 * - timeband = to-anchor.startTime / weekday = plan 日付（共に決定論・Date.now 不使用）
 * ★observation は仮説の有無に関係なく全選択を記録する（feedback と違い hypothesis 非依存）。
 */
export function buildObservation(input: {
  mode: unknown;
  dayISO: string;
  toStartTime: string | null | undefined;
  originText: string | null | undefined;
  destText: string | null | undefined;
  originSensitive: boolean;
  destSensitive: boolean;
  readOnly: boolean;
}): MobilityObservation | null {
  if (input.readOnly) return null;
  if (!isRouteTransportMode(input.mode)) return null;
  const redacted = input.originSensitive || input.destSensitive;
  return {
    mode: input.mode,
    timeband: toTimeband(input.toStartTime),
    weekday: toWeekdayBucket(input.dayISO),
    originKey: redacted ? null : normalizeLocationText(input.originText),
    destKey: redacted ? null : normalizeLocationText(input.destText),
    privacyClass: redacted ? "redacted" : "normal",
  };
}

// ───────────────────────── store (parse/cap/set/get) ─────────────────────────

function isDayISO(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
function isTimeband(v: unknown): v is Timeband {
  return v === "morning" || v === "afternoon" || v === "evening" || v === "night";
}
function isWeekdayBucket(v: unknown): v is WeekdayBucket {
  return v === "weekday" || v === "weekend";
}
function isPrivacyClass(v: unknown): v is PrivacyClass {
  return v === "normal" || v === "redacted";
}
function isObservation(value: unknown): value is MobilityObservation {
  if (typeof value !== "object" || value === null) return false;
  const v = value as {
    mode?: unknown;
    timeband?: unknown;
    weekday?: unknown;
    originKey?: unknown;
    destKey?: unknown;
    privacyClass?: unknown;
  };
  return (
    isRouteTransportMode(v.mode) &&
    isTimeband(v.timeband) &&
    isWeekdayBucket(v.weekday) &&
    (v.originKey === null || typeof v.originKey === "string") &&
    (v.destKey === null || typeof v.destKey === "string") &&
    isPrivacyClass(v.privacyClass)
  );
}

function cloneObservation(o: MobilityObservation): MobilityObservation {
  return {
    mode: o.mode,
    timeband: o.timeband,
    weekday: o.weekday,
    originKey: o.originKey,
    destKey: o.destKey,
    privacyClass: o.privacyClass,
  };
}

export function parseObservationStore(raw: string | null): MobilityObservationStore {
  if (!raw) return EMPTY_OBSERVATION_STORE;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_OBSERVATION_STORE;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { version?: unknown }).version !== MOBILITY_OBSERVATION_SCHEMA_VERSION
  ) {
    return EMPTY_OBSERVATION_STORE;
  }
  const rawByDay = (parsed as { byDay?: unknown }).byDay;
  if (typeof rawByDay !== "object" || rawByDay === null) return EMPTY_OBSERVATION_STORE;
  const byDay: Record<string, Record<string, MobilityObservation>> = {};
  for (const [day, legs] of Object.entries(rawByDay as Record<string, unknown>)) {
    if (!isDayISO(day)) continue;
    if (typeof legs !== "object" || legs === null) continue;
    const clean: Record<string, MobilityObservation> = {};
    for (const [legKey, obs] of Object.entries(legs as Record<string, unknown>)) {
      if (typeof legKey !== "string" || legKey.length === 0) continue;
      if (!isObservation(obs)) continue;
      clean[legKey] = cloneObservation(obs);
    }
    if (Object.keys(clean).length > 0) byDay[day] = clean;
  }
  return { version: MOBILITY_OBSERVATION_SCHEMA_VERSION, byDay };
}

export function applyObservationCaps(store: MobilityObservationStore): MobilityObservationStore {
  const keptDays = Object.keys(store.byDay).sort().slice(-MAX_OBSERVATION_DAYS);
  const byDay: Record<string, Record<string, MobilityObservation>> = {};
  for (const day of keptDays) {
    const legs = store.byDay[day];
    const keptLegs = Object.keys(legs).slice(0, MAX_OBSERVATION_LEGS_PER_DAY);
    const clean: Record<string, MobilityObservation> = {};
    for (const k of keptLegs) clean[k] = legs[k];
    byDay[day] = clean;
  }
  return { version: MOBILITY_OBSERVATION_SCHEMA_VERSION, byDay };
}

/** same day / same leg は最後の1件に上書き（重複しない） */
export function setObservation(
  store: MobilityObservationStore,
  dayISO: string,
  legKey: string,
  obs: MobilityObservation,
): MobilityObservationStore {
  if (!isDayISO(dayISO) || typeof legKey !== "string" || legKey.length === 0 || !isObservation(obs)) {
    return store;
  }
  const prevDay = store.byDay[dayISO] ?? {};
  return applyObservationCaps({
    version: MOBILITY_OBSERVATION_SCHEMA_VERSION,
    byDay: { ...store.byDay, [dayISO]: { ...prevDay, [legKey]: obs } },
  });
}

export function getObservation(
  store: MobilityObservationStore,
  dayISO: string,
  legKey: string,
): MobilityObservation | null {
  return store.byDay[dayISO]?.[legKey] ?? null;
}

// ───────────────────────── localStorage I/O (fail-open) ─────────────────────────

function getStorage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

function readObservationStore(): MobilityObservationStore {
  const ls = getStorage();
  if (!ls) return EMPTY_OBSERVATION_STORE;
  try {
    return parseObservationStore(ls.getItem(MOBILITY_OBSERVATION_KEY));
  } catch {
    return EMPTY_OBSERVATION_STORE;
  }
}

/** 観測を保存（client・fail-open・DB/network なし）。obs が null（記録対象でない）なら no-op。 */
export function saveMobilityObservation(
  dayISO: string,
  legKey: string,
  obs: MobilityObservation | null,
): void {
  if (obs == null) return;
  const ls = getStorage();
  if (!ls) return;
  try {
    ls.setItem(
      MOBILITY_OBSERVATION_KEY,
      JSON.stringify(setObservation(readObservationStore(), dayISO, legKey, obs)),
    );
  } catch {
    /* quota 等は fail-open */
  }
}

/** L1-b が読む用（client・fail-open）。 */
export function loadMobilityObservation(dayISO: string, legKey: string): MobilityObservation | null {
  return getObservation(readObservationStore(), dayISO, legKey);
}
