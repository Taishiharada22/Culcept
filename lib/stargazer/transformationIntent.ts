// lib/stargazer/transformationIntent.ts
// 変容意図の管理 — ユーザーが「何を変えたいか」を記録し、進捗を追跡する

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";
import { safeLSSet } from "@/lib/safeLocalStorage";

export interface TransformationIntent {
  intentId: string;
  /** 変えたい軸 */
  axisTarget: TraitAxisKey;
  /** 記録時点のスコア */
  initialScore: number;
  /** 望む変化の方向: "left" = labelLeft方向, "right" = labelRight方向 */
  desiredDirection: "left" | "right";
  /** 変えたい理由（ユーザー自由入力） */
  reason: string;
  /** 作成日 */
  createdAt: string;
  /** 進捗チェックポイント */
  checkpoints: { date: string; score: number; note?: string }[];
}

const STORAGE_KEY = "stargazer_transformation_intents_v1";

export function loadIntents(): TransformationIntent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveIntent(intent: TransformationIntent): void {
  const intents = loadIntents();
  intents.push(intent);
  safeLSSet(STORAGE_KEY, JSON.stringify(intents));
}

export function removeIntent(intentId: string): void {
  const intents = loadIntents().filter((i) => i.intentId !== intentId);
  safeLSSet(STORAGE_KEY, JSON.stringify(intents));
}

export function addCheckpoint(
  intentId: string,
  score: number,
  note?: string,
): void {
  const intents = loadIntents();
  const intent = intents.find((i) => i.intentId === intentId);
  if (intent) {
    intent.checkpoints.push({
      date: new Date().toISOString(),
      score,
      note,
    });
    safeLSSet(STORAGE_KEY, JSON.stringify(intents));
  }
}

export function checkProgress(
  intent: TransformationIntent,
  currentScore: number,
): {
  progress: number;
  direction: "toward" | "away" | "neutral";
  description: string;
} {
  const diff = currentScore - intent.initialScore;
  const isToward =
    (intent.desiredDirection === "right" && diff > 0) ||
    (intent.desiredDirection === "left" && diff < 0);
  const absDiff = Math.abs(diff);

  const def = TRAIT_AXES.find((a) => a.id === intent.axisTarget);
  const targetLabel =
    intent.desiredDirection === "right"
      ? (def?.labelRight ?? "右")
      : (def?.labelLeft ?? "左");

  if (absDiff < 0.05) {
    return {
      progress: 0,
      direction: "neutral",
      description: `「${targetLabel}」方向への変化はまだ観測されていません。`,
    };
  }

  if (isToward) {
    return {
      progress: Math.min(1, absDiff / 0.5),
      direction: "toward",
      description: `「${targetLabel}」方向に ${(absDiff * 100).toFixed(0)}% の変化が観測されています。`,
    };
  }

  return {
    progress: -Math.min(1, absDiff / 0.5),
    direction: "away",
    description: `意図とは逆方向に変化しています。これ自体が重要な発見かもしれません。`,
  };
}
