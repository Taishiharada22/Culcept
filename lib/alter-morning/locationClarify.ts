/**
 * Location Clarify Engine — 場所未指定アイテムの暗黙補完 / 質問ルール
 *
 * CEO方針:
 * - 前後が同エリアなら暗黙補完可
 * - 前後が別エリアなら質問
 * - 共同プラン化を見据えて participants / shared constraints に拡張しやすい構造
 *
 * ルール:
 * 1. 前後のアイテムが同じエリア（同じ location.label / 同じ area）
 *    → そのエリアで暗黙補完（action = "implicit_fill"）
 * 2. 前後のアイテムが別エリア、または片方だけ場所あり
 *    → 「〇〇はどこでする？」と質問（action = "ask"）
 * 3. 前後ともに場所なし
 *    → スキップ（場所情報なしで問題ない）
 */

import type {
  PlanItem,
  MainLocation,
  LocationClarifyResult,
  LocationClarifyAction,
} from "./types";
import { isSameArea, isSamePoint } from "./travelTimeTable";

/**
 * プランのアイテムリストに対して、場所未指定アイテムの clarify 判定を行う。
 *
 * @returns 各場所未指定アイテムに対する clarify 判定結果。
 *          空配列 = clarify 不要。
 */
export function evaluateLocationClarify(
  items: PlanItem[],
): LocationClarifyResult[] {
  const results: LocationClarifyResult[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // travel アイテムはスキップ
    if (item.kind === "travel") continue;

    // 場所が既に設定されている → スキップ
    if (item.location) continue;

    // 前後の場所付きアイテムを探す
    const prevLoc = findNearestLocation(items, i, "backward");
    const nextLoc = findNearestLocation(items, i, "forward");

    const action = decideAction(prevLoc, nextLoc, item);
    if (action === "skip") continue;

    const result: LocationClarifyResult = {
      itemId: item.id,
      action,
    };

    if (action === "implicit_fill" && prevLoc) {
      result.implicitArea = prevLoc.label;
      result.implicitLocation = prevLoc;
    } else if (action === "ask") {
      const taskLabel = item.what ?? item.text;
      result.askQuestion = `「${taskLabel}」はどこでする？`;
    }

    results.push(result);
  }

  return results;
}

/**
 * 暗黙補完ルールに基づいて場所を自動設定する。
 * clarify 不要のアイテムのみ補完し、質問が必要なものは返り値に残す。
 *
 * @returns 質問が必要な LocationClarifyResult のリスト（ask のみ）
 */
export function applyImplicitLocationFill(
  items: PlanItem[],
): { updatedItems: PlanItem[]; pendingClarify: LocationClarifyResult[] } {
  const clarifyResults = evaluateLocationClarify(items);
  const updated = [...items];
  const pending: LocationClarifyResult[] = [];

  for (const result of clarifyResults) {
    if (result.action === "implicit_fill" && result.implicitLocation) {
      // 暗黙補完: 場所を設定
      const idx = updated.findIndex(i => i.id === result.itemId);
      if (idx >= 0) {
        updated[idx] = {
          ...updated[idx],
          location: {
            ...result.implicitLocation,
            source: "user_inferred", // 暗黙補完であることを明示
          },
        };
      }
    } else if (result.action === "ask") {
      pending.push(result);
    }
  }

  return { updatedItems: updated, pendingClarify: pending };
}

/**
 * clarify 結果を1つの質問文にまとめる。
 */
export function buildLocationClarifyQuestion(
  pendingClarify: LocationClarifyResult[],
): string | null {
  if (pendingClarify.length === 0) return null;

  if (pendingClarify.length === 1) {
    return pendingClarify[0].askQuestion ?? null;
  }

  // 複数の場所未指定 → 1問にまとめる
  const labels = pendingClarify
    .map(r => {
      const q = r.askQuestion ?? "";
      const m = q.match(/「(.+?)」/);
      return m ? m[1] : null;
    })
    .filter(Boolean);

  if (labels.length === 0) return null;
  return `${labels.join("と")}はどこでする？`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 内部ヘルパー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function findNearestLocation(
  items: PlanItem[],
  currentIdx: number,
  direction: "forward" | "backward",
): MainLocation | null {
  const step = direction === "forward" ? 1 : -1;
  let idx = currentIdx + step;

  while (idx >= 0 && idx < items.length) {
    const item = items[idx];
    if (item.kind !== "travel" && item.location) {
      return item.location;
    }
    idx += step;
  }

  return null;
}

function decideAction(
  prevLoc: MainLocation | null,
  nextLoc: MainLocation | null,
  item: PlanItem,
): LocationClarifyAction {
  // 前後ともに場所なし → スキップ（場所情報なしで問題ない）
  if (!prevLoc && !nextLoc) return "skip";

  // 片方だけ場所あり → 質問
  if (!prevLoc || !nextLoc) {
    // ただし: 前のアイテムだけ場所があって、現在アイテムが短時間（30分以下）→ 暗黙補完
    if (prevLoc && item.durationMin <= 30) return "implicit_fill";
    return "ask";
  }

  // 両方場所あり → 同エリアなら暗黙補完、別エリアなら質問
  if (isSamePoint(prevLoc.canonicalId, nextLoc.canonicalId)) {
    return "implicit_fill";
  }

  if (isSameArea(prevLoc.label, nextLoc.label)) {
    return "implicit_fill";
  }

  // 別エリア → 質問
  return "ask";
}
