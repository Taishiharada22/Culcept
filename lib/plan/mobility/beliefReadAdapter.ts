// lib/plan/mobility/beliefReadAdapter.ts
//
// belief read adapter: selectedModeStore (S1-A 履歴) + hypothesisFeedback (v0-E) → ModeBelief（pure）
//
// ★「学習エンジン」でなく「既存履歴から信念を読む adapter」。新 belief store を作らない（両 store READ のみ）。
// ★v0-F: precision 重み付き集計。uniform(v0-F-lite) は feedback 空の特殊ケース。
//   selected=1 / confirmation=1（filter-bubble 上限・増幅させない）/ explicitCorrection=2（反暗示=高精度）。
//   final mode と feedback.chosenMode が食い違えば stale → selected(1) に落とす（mis-attribution 回避）。
//   ★correction は仮説 surface 後にのみ起き得る＝既に確立した belief に対してのみ。薄い surface は構造的に不能で
//     train→split沈黙→walk の滑らかな遷移になる。
//
// 純粋核 = buildWeightedModeBelief(selected, feedback, legKey)。buildModeBelief = feedback 空の薄い別名。
// load* は localStorage を読む薄い wrapper（fail-open）。MapTab は loadWeightedModeBelief を使う。
// production file（selectedModeStore.ts / hypothesisFeedbackStore.ts）は不変（exported parse/KEY を再利用）。
//
// ★legKey 安定性（実証済・正直）:
//   legKey = anchorId__anchorId。anchorsForDay は元 anchor を返す（合成 id なし）。
//   - recurring anchor: 同一 id を全日再利用 → legKey 安定 → 多日集計が効く（recurring パターンは学習可）
//   - one-off anchor: 単日固有 id → 1 観測 → gate で低 signal 沈黙
//   - 別 anchor の同一場所は別 legKey ＝集計されない（cross-anchor 汎化は L4 OD-cluster・本層でやらない）
//
// 禁則: 新 belief store / selectedModeStore・feedbackStore 破壊 / 自動 actual / UI / API / DB / Date.now / weather→mode / 距離→mode / fake duration なし。

import { isRouteTransportMode, type RouteTransportMode } from "@/lib/plan/map/routeMode";
import {
  parseStore,
  SELECTED_MODE_STORE_KEY,
  type SelectedModeStore,
} from "@/lib/plan/map/selectedModeStore";
import type { ModeBelief } from "./mobilityHypothesis";
import {
  EMPTY_FEEDBACK_STORE,
  HYPOTHESIS_FEEDBACK_KEY,
  parseFeedbackStore,
  type HypothesisFeedbackEntry,
  type HypothesisFeedbackStore,
} from "./hypothesisFeedbackStore";

/** "unknown" は意味ある手段選択でないため belief から除外（「いつもは 移動」と言わない） */
function isMeaningfulMode(mode: RouteTransportMode): boolean {
  return mode !== "unknown";
}

function emptyBelief(legKey: string): ModeBelief {
  return { legKey, counts: {}, total: 0, topMode: null, topShare: 0 };
}

// v0-F precision 重み（research 接地・CEO/GPT 承認 2026-06-05）。
const WEIGHT_SELECTED = 1; // 仮説なしの自由選択 = 暗示汚染ゼロの基準
const WEIGHT_CONFIRMATION = 1; // 仮説と同 mode = filter-bubble 上限（自由選択を超えて増幅させない）
const WEIGHT_EXPLICIT_CORRECTION = 2; // 仮説と違う mode = 反暗示 = 最も純粋な選好（系を教える）

/**
 * 1 選択の precision 重み（純粋）。
 * - feedback なし（仮説非表示時の選択 = selected）→ 1
 * - ★feedback.chosenMode ≠ 最終 mode（後で選び直した stale feedback）→ 1（mis-attribution 回避）
 * - explicitCorrection（一致）→ 2 / confirmation（一致）→ 1
 */
function precisionWeight(
  feedback: HypothesisFeedbackEntry | undefined,
  selectedMode: RouteTransportMode,
): number {
  if (!feedback) return WEIGHT_SELECTED;
  if (feedback.chosenMode !== selectedMode) return WEIGHT_SELECTED;
  return feedback.kind === "explicitCorrection" ? WEIGHT_EXPLICIT_CORRECTION : WEIGHT_CONFIRMATION;
}

/**
 * 純粋核: SelectedModeStore + HypothesisFeedbackStore + legKey → ModeBelief（precision 加重）。
 * 全 day を走査し legKey の mode を集計。各選択を 1 回だけ加重（selectedStore が mode の正本、
 * feedback は (day,legKey) で JOIN する注釈のみ＝二重計上しない）。unknown は除外。
 * topMode の tie は mode 名の昇順で決定的に先勝ち（split は gate の topShare 閾値で概ね沈黙）。
 */
export function buildWeightedModeBelief(
  selectedStore: SelectedModeStore,
  feedbackStore: HypothesisFeedbackStore,
  legKey: string,
): ModeBelief {
  if (typeof legKey !== "string" || legKey.length === 0) return emptyBelief(legKey);

  const counts: Partial<Record<RouteTransportMode, number>> = {};
  let total = 0;
  for (const day of Object.keys(selectedStore.byDay)) {
    const mode = selectedStore.byDay[day]?.[legKey];
    if (mode === undefined || !isRouteTransportMode(mode) || !isMeaningfulMode(mode)) continue;
    const w = precisionWeight(feedbackStore.byDay[day]?.[legKey], mode);
    counts[mode] = (counts[mode] ?? 0) + w;
    total += w;
  }
  if (total === 0) return emptyBelief(legKey);

  // topMode（決定的 tie-break: mode 名昇順 + 厳密 > で先勝ち）
  let topMode: RouteTransportMode | null = null;
  let topCount = 0;
  for (const m of (Object.keys(counts) as RouteTransportMode[]).sort()) {
    const c = counts[m] ?? 0;
    if (c > topCount) {
      topCount = c;
      topMode = m;
    }
  }

  return { legKey, counts, total, topMode, topShare: topMode ? topCount / total : 0 };
}

/**
 * 純粋: SelectedModeStore + legKey → ModeBelief（uniform）。
 * = feedback 空の buildWeightedModeBelief（全選択 weight 1）。v0-F-lite 互換の薄い別名。
 */
export function buildModeBelief(store: SelectedModeStore, legKey: string): ModeBelief {
  return buildWeightedModeBelief(store, EMPTY_FEEDBACK_STORE, legKey);
}

/** selectedMode の localStorage 読み（client・不在/破損は parseStore に委譲して fail-open）。 */
function loadStore(): SelectedModeStore {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (!ls) return parseStore(null);
    return parseStore(ls.getItem(SELECTED_MODE_STORE_KEY));
  } catch {
    return parseStore(null);
  }
}

/** hypothesisFeedback の localStorage 読み（client・不在/破損は parseFeedbackStore に委譲して fail-open）。 */
function loadFeedbackStore(): HypothesisFeedbackStore {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (!ls) return parseFeedbackStore(null);
    return parseFeedbackStore(ls.getItem(HYPOTHESIS_FEEDBACK_KEY));
  } catch {
    return parseFeedbackStore(null);
  }
}

/** uniform belief（feedback を読まない・v0-F-lite 互換）。現在 MapTab は loadWeightedModeBelief を使用。fail-open。 */
export function loadModeBelief(legKey: string): ModeBelief {
  return buildModeBelief(loadStore(), legKey);
}

/** ★v0-F: 実データ由来の precision 加重 ModeBelief（MapTab が使う・mock でない）。両 store fail-open。 */
export function loadWeightedModeBelief(legKey: string): ModeBelief {
  return buildWeightedModeBelief(loadStore(), loadFeedbackStore(), legKey);
}
