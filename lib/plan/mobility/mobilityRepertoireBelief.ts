/**
 * lib/plan/mobility/mobilityRepertoireBelief.ts — L1-b: OD 条件付きレパートリー belief（pure）
 *
 * L1-a の観測ログ(mobilityObservationStore)を使い、belief を odKey × timeband × weekday で
 * 条件付け、legKey-cold な leg でも OD 一般化で surface する。
 *
 * ★CEO 確定方針(2026-06-05):
 *   ① legKey 優先・cold で odKey fallback（override しない・退行ゼロ）
 *   ② 層採用は v0 の strength 判定(deriveHabitualStrength)を流用 = moderate+ の最特定層を採用（新閾値なし）
 *   ③ OD 集約も feedback JOIN で precision 加重（v0-F と一貫・selected1/confirmation1/correction2）
 *   ④ mode の正本は selectedModeStore（observation.mode は無視＝自動的に stale 回避）
 *
 * 出力は同じ ModeBelief 型 → downstream(necessityGate/explanationCopy/mobilityGuidance/card)不変。
 * 禁則: 新 belief store なし / selectedModeStore・hypothesisFeedbackStore・observation store は READ のみ /
 *   Google API / DB / network / 素朴 time-decay / 距離→mode / placeId 同等扱い なし。
 */
import { isRouteTransportMode, type RouteTransportMode } from "@/lib/plan/map/routeMode";
import { buildMobilityHypothesis, type ModeBelief } from "./mobilityHypothesis";
import { buildWeightedModeBelief, precisionWeight } from "./beliefReadAdapter";
import {
  parseStore,
  SELECTED_MODE_STORE_KEY,
  type SelectedModeStore,
} from "@/lib/plan/map/selectedModeStore";
import {
  parseFeedbackStore,
  HYPOTHESIS_FEEDBACK_KEY,
  type HypothesisFeedbackStore,
} from "./hypothesisFeedbackStore";
import {
  parseObservationStore,
  MOBILITY_OBSERVATION_KEY,
  type MobilityObservationStore,
  type Timeband,
  type WeekdayBucket,
} from "./mobilityObservationStore";

/** 開いた leg の query（MapTab が observationContext から構築・L1-b-2 配線時） */
export interface RepertoireQuery {
  readonly legKey: string;
  /** normalize(originText)__normalize(destText)。sensitive/空は null → OD 一般化不可 */
  readonly odKey: string | null;
  readonly timeband: Timeband;
  readonly weekday: WeekdayBucket;
}

/** odKey 層（最特定 → 一般）。tb/wd を条件に含めるか。 */
interface OdLevel {
  readonly tb: boolean;
  readonly wd: boolean;
}
const OD_LEVELS: readonly OdLevel[] = [
  { tb: true, wd: true }, // odKey × timeband × weekday
  { tb: false, wd: true }, // odKey × weekday
  { tb: true, wd: false }, // odKey × timeband
  { tb: false, wd: false }, // odKey
];

/** v0 strength 判定を流用: belief が moderate 以上か（= surface に値する確信）。 */
function isModerateOrStrong(belief: ModeBelief): boolean {
  const s = buildMobilityHypothesis(belief, {}).habitualStrength;
  return s === "moderate" || s === "strong";
}

/** counts → ModeBelief（v0 と同じ決定的 tie-break: mode 名昇順 + 厳密 >）。legKey は query 由来。 */
function deriveBelief(
  legKey: string,
  counts: Partial<Record<RouteTransportMode, number>>,
  total: number,
): ModeBelief {
  let topMode: RouteTransportMode | null = null;
  let topCount = 0;
  for (const m of (Object.keys(counts) as RouteTransportMode[]).sort()) {
    const c = counts[m] ?? 0;
    if (c > topCount) {
      topCount = c;
      topMode = m;
    }
  }
  return { legKey, counts, total, topMode, topShare: total > 0 && topMode ? topCount / total : 0 };
}

/**
 * observation を odKey(+ 条件 tb/wd)で集約した belief（純粋）。
 * 各 observation の context(odKey/timeband/weekday)で filter し、mode は selectedStore 正本、
 * weight は feedback JOIN で precision 加重。redacted/unknown/正本欠落は除外。二重計上なし。
 */
function buildOdBelief(
  obs: MobilityObservationStore,
  selected: SelectedModeStore,
  feedback: HypothesisFeedbackStore,
  query: RepertoireQuery,
  level: OdLevel,
): ModeBelief {
  const counts: Partial<Record<RouteTransportMode, number>> = {};
  let total = 0;
  const odKey = query.odKey;
  if (odKey == null) return deriveBelief(query.legKey, counts, 0);
  for (const [day, legs] of Object.entries(obs.byDay)) {
    for (const [legKey, o] of Object.entries(legs)) {
      if (o.privacyClass === "redacted") continue; // sensitive は OD 集約から除外
      if (o.originKey == null || o.destKey == null) continue;
      if (`${o.originKey}__${o.destKey}` !== odKey) continue; // odKey 一致
      if (level.tb && o.timeband !== query.timeband) continue;
      if (level.wd && o.weekday !== query.weekday) continue;
      // ★mode は selectedStore 正本（observation.mode は使わない＝stale 自動回避）
      const mode = selected.byDay[day]?.[legKey];
      if (mode === undefined || !isRouteTransportMode(mode) || mode === "unknown") continue;
      const w = precisionWeight(feedback.byDay[day]?.[legKey], mode);
      counts[mode] = (counts[mode] ?? 0) + w;
      total += w;
    }
  }
  return deriveBelief(query.legKey, counts, total);
}

/**
 * L1-b 純粋核: legKey 優先・cold で odKey fallback（override しない・退行ゼロ）。
 * 1. legKey belief(v0 weighted)が moderate+ → それを返す（v0 と完全同一）。
 * 2. legKey cold ∧ odKey あり → OD 層を最特定の moderate+ で返す（一般化）。
 * 3. どれも moderate+ でない → cold な legKey belief を返す（後段 gate が沈黙＝v0 同一）。
 * ★empty observation → 常に legKey belief（= buildWeightedModeBelief）と同一＝退行ゼロ。
 */
export function buildRepertoireBelief(
  obs: MobilityObservationStore,
  selected: SelectedModeStore,
  feedback: HypothesisFeedbackStore,
  query: RepertoireQuery,
): ModeBelief {
  const legKeyBelief = buildWeightedModeBelief(selected, feedback, query.legKey);
  if (isModerateOrStrong(legKeyBelief)) return legKeyBelief; // legKey 優先（override しない）
  if (query.odKey != null) {
    for (const level of OD_LEVELS) {
      const odBelief = buildOdBelief(obs, selected, feedback, query, level);
      if (isModerateOrStrong(odBelief)) return odBelief; // cold legKey の OD 一般化
    }
  }
  return legKeyBelief; // 床: cold legKey belief（gate が沈黙）
}

// ───────────────────────── localStorage loaders (fail-open) ─────────────────────────

function loadSelected(): SelectedModeStore {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return parseStore(ls ? ls.getItem(SELECTED_MODE_STORE_KEY) : null);
  } catch {
    return parseStore(null);
  }
}
function loadFeedback(): HypothesisFeedbackStore {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return parseFeedbackStore(ls ? ls.getItem(HYPOTHESIS_FEEDBACK_KEY) : null);
  } catch {
    return parseFeedbackStore(null);
  }
}
function loadObservations(): MobilityObservationStore {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return parseObservationStore(ls ? ls.getItem(MOBILITY_OBSERVATION_KEY) : null);
  } catch {
    return parseObservationStore(null);
  }
}

/** ★L1-b-2 配線で MapTab が使う。実データ由来の repertoire belief（mock でない）。両 store fail-open。 */
export function loadRepertoireBelief(query: RepertoireQuery): ModeBelief {
  return buildRepertoireBelief(loadObservations(), loadSelected(), loadFeedback(), query);
}
