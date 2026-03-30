// lib/aneurasync/observationBridge.ts
// HOME ロボ → Stargazer 観測ブリッジ
// 会話の回答をStargazerの軸スコアに変換してAPIで保存する

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type {
  ConversationCategory,
  CategoryQuestion,
  SupplementaryLens,
  QuestionKind,
} from "./conversationCategories";
import { isObservationCategory, getQuestionKind } from "./conversationCategories";
import type { DrillResult, DrillStep } from "@/lib/shared/deepDrill";
import { extractAxisHints } from "@/lib/shared/deepDrill";

/* ═══════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════ */

export interface BridgeableAnswer {
  questionId: string;
  category: ConversationCategory;
  choiceValue: number;
  drillResult?: DrillResult;
  responseTimeMs: number;
  /** 元の質問 (軸マッピング参照用) */
  question: CategoryQuestion;
  /** 深掘りの各ステップ結果 (マルチステップ対応) */
  drillSteps?: { step: DrillStep; selectedId: string; text: string }[];
}

/** API に送る拡張メタデータ */
export interface BridgeAnswerMeta {
  questionId: string;
  category: ConversationCategory;
  choiceValue: number;
  responseTimeMs: number;
  hasDrill: boolean;
  /** 追加メタ */
  questionKind: QuestionKind;
  lens?: SupplementaryLens;
  drillDepth: number;
  drillStages?: DrillStep[];
  axisMapping?: string[];
}

export interface AxisDelta {
  axis: TraitAxisKey;
  delta: number;
}

export interface BridgeResult {
  ok: boolean;
  savedCount: number;
  axisDeltas: AxisDelta[];
}

/* ═══════════════════════════════════════════════
   Axis Delta Conversion
   ═══════════════════════════════════════════════ */

/**
 * 回答を軸デルタに変換
 */
export function convertToAxisDeltas(answer: BridgeableAnswer): AxisDelta[] {
  const deltas: AxisDelta[] = [];

  // 1. 質問の axisMapping からデルタ取得
  if (answer.question.axisMapping) {
    for (const mapping of answer.question.axisMapping) {
      const delta = mapping.scoreMap[answer.choiceValue];
      if (delta !== undefined && delta !== 0) {
        deltas.push({ axis: mapping.axis, delta });
      }
    }
  }

  // 2. 深掘り結果からの軸ヒントを追加
  if (answer.drillResult && answer.drillResult.drillAnswers.length > 0) {
    const drillHints = extractAxisHints(answer.drillResult.drillAnswers);
    deltas.push(...drillHints);
  }

  // 3. 同じ軸の重複を統合 (平均)
  const merged = new Map<TraitAxisKey, number[]>();
  for (const d of deltas) {
    const existing = merged.get(d.axis) ?? [];
    existing.push(d.delta);
    merged.set(d.axis, existing);
  }

  return Array.from(merged.entries()).map(([axis, values]) => ({
    axis,
    delta: values.reduce((s, v) => s + v, 0) / values.length,
  }));
}

/* ═══════════════════════════════════════════════
   Save to Stargazer API
   ═══════════════════════════════════════════════ */

/**
 * 観測系の回答をStargazerに保存
 * ユーティリティ系 (care, preparation) はスキップ
 */
export async function saveToStargazer(
  answers: BridgeableAnswer[]
): Promise<BridgeResult> {
  // 観測系のみフィルタ
  const observationAnswers = answers.filter((a) =>
    isObservationCategory(a.category)
  );

  if (observationAnswers.length === 0) {
    return { ok: true, savedCount: 0, axisDeltas: [] };
  }

  // 全回答の軸デルタを集約
  const allDeltas: AxisDelta[] = [];
  for (const answer of observationAnswers) {
    const deltas = convertToAxisDeltas(answer);
    allDeltas.push(...deltas);
  }

  // 同じ軸を統合
  const mergedDeltas = mergeAxisDeltas(allDeltas);

  try {
    const res = await fetch("/api/stargazer/observations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        type: "home_bridge",
        answers: observationAnswers.map((a): BridgeAnswerMeta => ({
          questionId: a.questionId,
          category: a.category,
          choiceValue: a.choiceValue,
          responseTimeMs: a.responseTimeMs,
          hasDrill: !!a.drillResult,
          questionKind: getQuestionKind(a.question),
          lens: a.question.lens,
          drillDepth: a.drillSteps?.length ?? (a.drillResult ? 1 : 0),
          drillStages: a.drillSteps?.map((ds) => ds.step),
          axisMapping: a.question.axisMapping?.map((m) => m.axis),
        })),
        axisDeltas: mergedDeltas,
        source: "home_robot",
        timestamp: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      console.warn("[observationBridge] API response not ok:", res.status);
      return { ok: false, savedCount: 0, axisDeltas: mergedDeltas };
    }

    return {
      ok: true,
      savedCount: observationAnswers.length,
      axisDeltas: mergedDeltas,
    };
  } catch (err) {
    console.warn("[observationBridge] Failed to save:", err);
    return { ok: false, savedCount: 0, axisDeltas: mergedDeltas };
  }
}

/* ═══════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════ */

function mergeAxisDeltas(deltas: AxisDelta[]): AxisDelta[] {
  const map = new Map<TraitAxisKey, number[]>();
  for (const d of deltas) {
    const existing = map.get(d.axis) ?? [];
    existing.push(d.delta);
    map.set(d.axis, existing);
  }

  return Array.from(map.entries()).map(([axis, values]) => ({
    axis,
    delta: values.reduce((s, v) => s + v, 0) / values.length,
  }));
}

/* ═══════════════════════════════════════════════
   Free Chat Delta Merge
   会話AIから推論されたデルタを0.5x重みで統合し、
   Stargazer observations APIに送信する
   ═══════════════════════════════════════════════ */

const FREE_CHAT_DELTAS_KEY = "culcept_free_chat_deltas_v1";
const FREE_CHAT_WEIGHT = 0.5;

type InferredDelta = { axis: string; delta: number };

/**
 * localStorage に蓄積された free chat デルタを読み出し、
 * 0.5x 重み付けして Stargazer observations API に送信する。
 * 送信後、localStorage のデルタはクリアされる。
 */
export async function mergeFreeChatDeltas(): Promise<BridgeResult> {
  let rawDeltas: InferredDelta[] = [];
  try {
    const raw = localStorage.getItem(FREE_CHAT_DELTAS_KEY);
    rawDeltas = raw ? JSON.parse(raw) : [];
  } catch {
    return { ok: true, savedCount: 0, axisDeltas: [] };
  }

  if (rawDeltas.length === 0) {
    return { ok: true, savedCount: 0, axisDeltas: [] };
  }

  // Apply 0.5x weight and merge same axes
  const weighted: AxisDelta[] = rawDeltas
    .filter((d) => typeof d.axis === "string" && typeof d.delta === "number")
    .map((d) => ({
      axis: d.axis as TraitAxisKey,
      delta: d.delta * FREE_CHAT_WEIGHT,
    }));

  const merged = mergeAxisDeltas(weighted);

  if (merged.length === 0) {
    localStorage.removeItem(FREE_CHAT_DELTAS_KEY);
    return { ok: true, savedCount: 0, axisDeltas: [] };
  }

  try {
    const res = await fetch("/api/stargazer/observations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        type: "home_bridge",
        answers: [],
        axisDeltas: merged,
        source: "free_chat",
        timestamp: new Date().toISOString(),
      }),
    });

    // Clear stored deltas regardless of result
    localStorage.removeItem(FREE_CHAT_DELTAS_KEY);

    if (!res.ok) {
      console.warn("[observationBridge] Free chat delta merge API failed:", res.status);
      return { ok: false, savedCount: 0, axisDeltas: merged };
    }

    console.log(`[observationBridge] Merged ${merged.length} free chat axis deltas (0.5x weight)`);
    return { ok: true, savedCount: merged.length, axisDeltas: merged };
  } catch (err) {
    console.warn("[observationBridge] Free chat delta merge failed:", err);
    localStorage.removeItem(FREE_CHAT_DELTAS_KEY);
    return { ok: false, savedCount: 0, axisDeltas: merged };
  }
}
