/**
 * C4 — CoAlter Brain **preview** core（**pure・DB なし・保存なし・LLM なし・full pipeline 非呼出**）
 *
 * 設計正本: docs/coalter-brain-newsession-bridge-migration-gap-design.md（§4-B / §10）
 *
 * 役割: New session の会話に CoAlter が**反応する骨格**を、Legacy 脳の **DB 非依存決定論コア**
 *   （`analyzeConversation`・theme/stalemate/constraint 解析）だけで preview 生成する。
 *
 * 厳守:
 *   - **`runCoAlterPipeline` 本体を呼ばない**（DB I/O・2人固定・pair 結合のため）。
 *   - **DB / Supabase / fetch / LLM / 外部 retrieval を呼ばない**・**保存しない**（preview は返すだけ）。
 *   - **bounded surface のみ**（theme / stalemate 有無 / constraint band / 中立 text）。
 *     raw caringIntensity / extractedConstraints / recentMessages を **preview に出さない**（privacy・§6）。
 *   - pure・決定論（同入力 → 同出力・Date.now なし）。solo（participant 1）も扱える。
 */

import { analyzeConversation } from "../conversationParser";
import type { ConversationTheme } from "../types";
import {
  distinctParticipantSenders,
  mapNewSessionMessagesToTurns,
  type NewSessionMessageLike,
} from "./newSessionTurnAdapter";

/** bounded preview（共有可能な中立 surface のみ・raw 内部 signal 非搭載）。 */
export interface CoAlterBrainPreview {
  readonly kind: "brain_preview";
  readonly theme: ConversationTheme;
  readonly hasStalemate: boolean;
  readonly constraintReadiness: "low" | "medium" | "high";
  readonly turnsAnalyzed: number;
  /** 決定論で組んだ中立 preview 文（提案 card ではない・実行権限なし）。 */
  readonly previewText: string;
}

export type CoAlterBrainPreviewResult =
  | { readonly status: "preview"; readonly preview: CoAlterBrainPreview }
  | { readonly status: "insufficient" };

const THEME_JA: Record<ConversationTheme, string> = {
  movie: "映画",
  food: "食事",
  travel: "旅行",
  schedule: "予定調整",
  gift: "プレゼント",
  activity: "おでかけ",
  general: "雑談",
};

function readinessBand(score: number): "low" | "medium" | "high" {
  return score >= 0.7 ? "high" : score >= 0.4 ? "medium" : "low";
}

/**
 * New session messages → CoAlter brain preview（pure・保存なし・full pipeline 非呼出）。
 *   participant chat turn が無ければ `insufficient`。
 */
export function buildCoAlterBrainPreview(
  messages: readonly NewSessionMessageLike[],
): CoAlterBrainPreviewResult {
  const turns = mapNewSessionMessagesToTurns(messages);
  const participants = distinctParticipantSenders(turns);
  if (turns.length === 0 || participants.length === 0) return { status: "insufficient" };

  // solo は同一 id を A/B に渡す（analyzeConversation は pure・決定論）。2人目があれば B に。
  const userA = participants[0];
  const userB = participants[1] ?? participants[0];
  const analysis = analyzeConversation(turns, userA, userB);

  const constraintReadiness = readinessBand(analysis.constraintScore);
  const hasStalemate = analysis.stalemate !== null;
  const themeJa = THEME_JA[analysis.theme];
  const readinessJa =
    constraintReadiness === "high"
      ? "条件はだいたい揃っています"
      : constraintReadiness === "medium"
        ? "条件はいくつか揃っています"
        : "条件はまだ揃っていません";
  const stalemateJa = hasStalemate ? "意見が分かれている点がありそうです。" : "";
  const previewText = `この会話は「${themeJa}」についてのようです。${readinessJa}。${stalemateJa}`.trim();

  return {
    status: "preview",
    preview: {
      kind: "brain_preview",
      theme: analysis.theme,
      hasStalemate,
      constraintReadiness,
      turnsAnalyzed: turns.length,
      previewText,
    },
  };
}
