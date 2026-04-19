/**
 * CoAlter Stage 1 Understand — RelationalFusion
 *
 * (PersonObservation × 2 + RelationshipObservation + ConversationObservation)
 *   → RelationalLens の rule-based 決定論 fusion。
 *
 * [CEO lock 2026-04-20 M0-2 #1] 完全決定論: 乱数 / 現在時刻参照なし。
 * [CEO lock 2026-04-20 M0-2 #2] 欠損時は degrade、補完しない。
 *   - avoidElements は明示観測（breakingConditions / unresolvedThreads / rupture）
 *     のみを載せる。推測で埋めない。
 *   - dominantDynamic は判定不能なら空文字で返す（narration は skip 判断可）。
 *
 * M0-2 scope: LLM なし、rule-based、shadow 限定、既存 runtime 未接続。
 */

import type {
  ConversationObservation,
  PersonObservation,
  RelationalLens,
  RelationalTemperature,
  RelationshipObservation,
} from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Public API
// ═══════════════════════════════════════════════════════════════════════════

export function fuseRelationalLens(
  relationship: RelationshipObservation,
  personA: PersonObservation,
  personB: PersonObservation,
  conversation: ConversationObservation,
): RelationalLens {
  return {
    temperature: deriveTemperature(relationship, conversation),
    dominantDynamic: deriveDominantDynamic(relationship, conversation),
    careAxes: deriveCareAxes(personA, personB),
    avoidElements: deriveAvoidElements(relationship, personA, personB),
    interactionPace: deriveInteractionPace(relationship, conversation),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Deriver 群
// ═══════════════════════════════════════════════════════════════════════════

/**
 * temperature:
 *   優先順位: relationship.currentTemperature > conversation.energyLevel 経由の推定。
 *   両方欠損なら "neutral" に固定（推測で warm/cool に寄せない）。
 */
function deriveTemperature(
  relationship: RelationshipObservation,
  conversation: ConversationObservation,
): RelationalTemperature {
  if (relationship.currentTemperature) return relationship.currentTemperature;
  // conversation.energyLevel は relationship.currentTemperature と別次元なので
  // 初期値 "neutral" を返す。energyLevel → temperature の自動推定は禁止。
  void conversation;
  return "neutral";
}

/**
 * dominantDynamic:
 *   「今日は A が主導、B が共感受容」のような 1 文要約。
 *   判定材料:
 *     - relationship.interactionPattern.initiator
 *     - conversation.caringIntensity の差
 *   材料不足時は空文字（narration で skip）。
 */
function deriveDominantDynamic(
  relationship: RelationshipObservation,
  conversation: ConversationObservation,
): string {
  const init = relationship.interactionPattern.initiator;
  const caring = conversation.caringIntensity;

  // initiator が "a" / "b" で、caringIntensity が読み取れる場合のみ判定。
  if (init === "a" || init === "b") {
    const initiator = init;
    const receiver = init === "a" ? "b" : "a";
    const initiatorLabel = init === "a" ? "A" : "B";
    const receiverLabel = init === "a" ? "B" : "A";
    const initiatorCaring = caring[initiator];
    const receiverCaring = caring[receiver];
    // caring の差が 0.15 以上開いているなら「受容」、それ以外は「併走」。
    if (receiverCaring - initiatorCaring >= 0.15) {
      return `今日は ${initiatorLabel} が主導、${receiverLabel} が共感受容`;
    }
    return `今日は ${initiatorLabel} が主導、${receiverLabel} が併走`;
  }
  // initiator = "balanced" のときは caringIntensity 差で決める。
  if (init === "balanced") {
    const diff = caring.a - caring.b;
    if (Math.abs(diff) < 0.1) return "今日は対等に並走";
    if (diff > 0) return "今日は A が前に出て、B がそれに乗る";
    return "今日は B が前に出て、A がそれに乗る";
  }
  // 判定不能 → 空（lock #2）
  return "";
}

/**
 * careAxes:
 *   「B の疲労への配慮」のような、対相手への配慮軸を 2 人分最大 4 本まで。
 *   判定材料: 各人の stargazer.fatigueTriggers を 1 人あたり 2 本まで採用。
 *   各 axis は "X の {fatigueTrigger} への配慮" 形式に統一。
 *   fatigueTriggers が空なら採用しない（捏造しない）。
 */
function deriveCareAxes(personA: PersonObservation, personB: PersonObservation): string[] {
  const axes: string[] = [];
  axes.push(...buildCareAxesFor(personA, "A"));
  axes.push(...buildCareAxesFor(personB, "B"));
  // 決定論: 入力順依存を避けるため、person label → fatigueTrigger 昇順でソート済み。
  return axes;
}

function buildCareAxesFor(person: PersonObservation, label: "A" | "B"): string[] {
  const triggers = [...person.stargazer.fatigueTriggers]
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .sort((x, y) => (x < y ? -1 : 1));
  return triggers.slice(0, 2).map((t) => `${label} の「${t}」への配慮`);
}

/**
 * avoidElements:
 *   絶対に外すべき要素（veto 合流）。
 *   材料:
 *     - 各人の stargazer.breakingConditions
 *     - relationship.unresolvedThreads
 *     - relationship.rupturesAndRepairs のうち kind==="rupture"（未修復）
 *   形式: "X: {breakingCondition}" / "未解決: {topic}" / "過去の擦れ違い: {summary}"
 *   lock A: rupture summary は narration 内部参照前提だが、
 *   avoidElements に含まれるのは short label 化するため Stage 1 lens 内に留まる。
 *   ログ (diagnostics) には一切出ない。
 */
function deriveAvoidElements(
  relationship: RelationshipObservation,
  personA: PersonObservation,
  personB: PersonObservation,
): string[] {
  const set = new Set<string>();

  for (const cond of personA.stargazer.breakingConditions) {
    const t = cond.trim();
    if (t) set.add(`A: ${t}`);
  }
  for (const cond of personB.stargazer.breakingConditions) {
    const t = cond.trim();
    if (t) set.add(`B: ${t}`);
  }
  for (const th of relationship.unresolvedThreads) {
    const t = th.topic.trim();
    if (t) set.add(`未解決: ${t}`);
  }
  // rupture だけ採用（repair は avoid 対象ではない）
  const unhealedRuptures = relationship.rupturesAndRepairs
    .filter((e) => e.kind === "rupture")
    .map((e) => e.summary.trim())
    .filter((s) => s.length > 0);
  // 同時刻に repair があれば打ち消す設計は M0-3 で。ここでは rupture をそのまま。
  for (const s of unhealedRuptures) set.add(`過去の擦れ違い: ${s}`);

  return Array.from(set).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
}

/**
 * interactionPace:
 *   relationship.interactionPattern.pace を最優先。
 *   観測なしなら conversation.turns から粗く推定するのではなく "steady" に落とす（lock #2）。
 */
function deriveInteractionPace(
  relationship: RelationshipObservation,
  conversation: ConversationObservation,
): "quick" | "steady" | "slow" {
  void conversation;
  return relationship.interactionPattern.pace;
}
