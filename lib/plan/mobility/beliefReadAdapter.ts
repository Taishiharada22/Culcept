// lib/plan/mobility/beliefReadAdapter.ts
//
// v0-F-lite: selectedModeStore (S1-A 履歴) → ModeBelief（pure read adapter）
//
// ★「学習エンジン」でなく「既存履歴から信念を読む adapter」。新 belief store を作らない。
// ★override / actual は未実装（v0-E/v0-F）。selected のみ＝低精度観測・uniform 重み。
//
// 純粋核 = buildModeBelief(store, legKey)。loadModeBelief は localStorage を読む薄い wrapper（fail-open）。
// production file（selectedModeStore.ts）は不変（exported parseStore/KEY を再利用するのみ）。
//
// ★legKey 安定性（実証済・正直）:
//   legKey = anchorId__anchorId。anchorsForDay は元 anchor を返す（合成 id なし）。
//   - recurring anchor: 同一 id を全日再利用 → legKey 安定 → 多日集計が効く（recurring パターンは学習可）
//   - one-off anchor: 単日固有 id → 1 観測 → gate で低 signal 沈黙
//   - 別 anchor の同一場所は別 legKey ＝集計されない（cross-anchor 汎化は L4 OD-cluster・本層でやらない）
//
// 禁則: 新 store / override / correction writeback / UI / API / DB / Date.now / weather→mode / 距離→mode / fake duration なし。

import { isRouteTransportMode, type RouteTransportMode } from "@/lib/plan/map/routeMode";
import {
  parseStore,
  SELECTED_MODE_STORE_KEY,
  type SelectedModeStore,
} from "@/lib/plan/map/selectedModeStore";
import type { ModeBelief } from "./mobilityHypothesis";

/** "unknown" は意味ある手段選択でないため belief から除外（「いつもは 移動」と言わない） */
function isMeaningfulMode(mode: RouteTransportMode): boolean {
  return mode !== "unknown";
}

function emptyBelief(legKey: string): ModeBelief {
  return { legKey, counts: {}, total: 0, topMode: null, topShare: 0 };
}

/**
 * 純粋: SelectedModeStore + legKey → ModeBelief。
 * 全 day を走査し legKey の mode を集計（selected のみ＝uniform・unknown 除外）。
 * topMode の tie は mode 名の昇順で決定的に先勝ち（split は gate の topShare 閾値で概ね沈黙）。
 */
export function buildModeBelief(store: SelectedModeStore, legKey: string): ModeBelief {
  if (typeof legKey !== "string" || legKey.length === 0) return emptyBelief(legKey);

  const counts: Partial<Record<RouteTransportMode, number>> = {};
  let total = 0;
  for (const day of Object.keys(store.byDay)) {
    const mode = store.byDay[day]?.[legKey];
    if (mode === undefined || !isRouteTransportMode(mode) || !isMeaningfulMode(mode)) continue;
    counts[mode] = (counts[mode] ?? 0) + 1;
    total += 1;
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

/** localStorage 読み（client・不在/破損は parseStore に委譲して fail-open）。pure 核は buildModeBelief。 */
function loadStore(): SelectedModeStore {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (!ls) return parseStore(null);
    return parseStore(ls.getItem(SELECTED_MODE_STORE_KEY));
  } catch {
    return parseStore(null);
  }
}

/** 実データ由来の ModeBelief（v0-D が使う・mock でない）。fail-open。 */
export function loadModeBelief(legKey: string): ModeBelief {
  return buildModeBelief(loadStore(), legKey);
}
