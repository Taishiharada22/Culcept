// lib/aneurasync/livingReactions.ts
// 生きた反応エンジン — AI生成 + ルールベースのハイブリッド
//
// 優先順位:
//   1. AI生成反応（/api/aneurasync/ai-reaction を非同期呼び出し）
//   2. 文脈反応（セッション記憶、過去比較、矛盾検出）
//   3. ステージ反応（関係性の深さで変わるトーン）
//   4. テンプレ反応（フォールバック）
//
// AI生成は非同期。まずルールベースで即座に返し、
// AI結果が到着したらコールバックで差し替え可能にする。

import type { RelationshipStage } from "./relationshipStage";
import type { RobotExpression } from "./relationshipStage";
import { getSessionMemory } from "./sessionIntelligence";

/* ═══════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════ */

export interface LivingReaction {
  text: string;
  expression: RobotExpression;
  /** 反応前の沈黙（ms）— ステージで制御 */
  pauseMs: number;
  /** なぜこの反応が選ばれたか（デバッグ用） */
  reason: string;
}

export interface ReactionInput {
  value: number;                    // 1-5
  category: string;                 // partner, outfit, etc.
  questionText: string;             // ロボットの質問文
  answerLabel: string;              // ユーザーの回答ラベル
  responseTimeMs: number;           // 回答にかかった時間
  stage: RelationshipStage;
  totalAnsweredToday: number;       // 今日の回答数
  consecutiveSameScore?: number;    // 同スコアが連続した回数
  previousValue?: number;           // 前の質問のスコア
  pastSameQuestionValue?: number;   // 過去に同じ質問に答えた時のスコア
  pastDaysDiff?: number;            // 何日前の同じ質問か
  isContradiction?: boolean;        // 矛盾検出されたか
  streakDays?: number;              // 連続観測日数
  timeOfDay: "late_night" | "morning" | "afternoon" | "evening";
}

/* ═══════════════════════════════════════════════
   Main Entry Point
   ═══════════════════════════════════════════════ */

export function generateLivingReaction(input: ReactionInput): LivingReaction {
  // 1. Try context-specific reactions (highest priority)
  const contextReaction = tryContextReaction(input);
  if (contextReaction) return contextReaction;

  // 2. Try stage-specific reactions
  const stageReaction = tryStageReaction(input);
  if (stageReaction) return stageReaction;

  // 3. Fallback to basic reaction
  return getFallbackReaction(input);
}

/* ═══════════════════════════════════════════════
   1. Context Reactions — 文脈で反応が変わる
   ═══════════════════════════════════════════════ */

function tryContextReaction(input: ReactionInput): LivingReaction | null {
  const { value, responseTimeMs, stage, previousValue, consecutiveSameScore,
    pastSameQuestionValue, pastDaysDiff, isContradiction, streakDays, timeOfDay,
    totalAnsweredToday } = input;

  const basePause = getBasePause(stage, value, isContradiction);

  // ── 矛盾検出 ──
  if (isContradiction) {
    if (stage <= 2) {
      return {
        text: "…ちょっと面白いことに気づいた。後で話す。",
        expression: "curious",
        pauseMs: basePause,
        reason: "contradiction_early_stage",
      };
    }
    if (stage === 3) {
      return {
        text: "…ん？ さっきと矛盾してない？",
        expression: "skeptical",
        pauseMs: basePause + 400,
        reason: "contradiction_mid_stage",
      };
    }
    return {
      text: "嘘。さっきと逆のこと言ってる。どっちが本音？",
      expression: "knowing",
      pauseMs: basePause + 600,
      reason: "contradiction_deep_stage",
    };
  }

  // ── 即答 (< 1.5秒) ──
  if (responseTimeMs < 1500 && totalAnsweredToday >= 2) {
    if (stage <= 2) {
      return {
        text: "迷いなし、か。",
        expression: "listening",
        pauseMs: basePause,
        reason: "instant_answer",
      };
    }
    if (stage >= 4) {
      return {
        text: "（即答。ここは確信があるんだ。）",
        expression: "knowing",
        pauseMs: basePause,
        reason: "instant_answer_deep",
      };
    }
  }

  // ── 長い迷い (> 8秒) ──
  if (responseTimeMs > 8000) {
    if (stage <= 2) {
      return {
        text: "…ゆっくりでいいよ。",
        expression: "listening",
        pauseMs: basePause + 300,
        reason: "long_hesitation_early",
      };
    }
    if (stage >= 3) {
      return {
        text: `${input.answerLabel}を選んだけど…最初は違うの選びかけたでしょ。`,
        expression: "skeptical",
        pauseMs: basePause + 500,
        reason: "long_hesitation_deep",
      };
    }
  }

  // ── 急激なスコア変化（前の質問と ±3以上） ──
  if (previousValue !== undefined && Math.abs(value - previousValue) >= 3) {
    if (value > previousValue) {
      if (stage >= 3) {
        return {
          text: "急に上がった。さっきの重さは何だったの？",
          expression: "surprised",
          pauseMs: basePause + 300,
          reason: "sharp_increase",
        };
      }
      return {
        text: "さっきとだいぶ違うね。場面で変わるんだ。",
        expression: "curious",
        pauseMs: basePause,
        reason: "sharp_increase_early",
      };
    } else {
      if (stage >= 3) {
        return {
          text: "…急に落ちたね。この質問、何か引っかかった？",
          expression: "concerned",
          pauseMs: basePause + 500,
          reason: "sharp_decrease",
        };
      }
      return {
        text: "ここは少し重いんだね。",
        expression: "concerned",
        pauseMs: basePause,
        reason: "sharp_decrease_early",
      };
    }
  }

  // ── 同スコア連続（3回以上） ──
  if (consecutiveSameScore && consecutiveSameScore >= 3) {
    if (value === 3) {
      if (stage >= 3) {
        return {
          text: "…ずっと3。本音、隠してない？ 全部「ふつう」ってことはないでしょ。",
          expression: "skeptical",
          pauseMs: basePause + 400,
          reason: "all_threes_pushback",
        };
      }
      return {
        text: "3が続いてるね。まあ、そういう日もあるか。",
        expression: "thinking",
        pauseMs: basePause,
        reason: "all_threes_early",
      };
    }
    if (value >= 4) {
      if (stage >= 3) {
        return {
          text: `${consecutiveSameScore}連続高い。本当にいいのか、慣れで高くつけてるのか。`,
          expression: "skeptical",
          pauseMs: basePause + 300,
          reason: "all_high_pushback",
        };
      }
    }
  }

  // ── 過去との比較（同じ質問を前に答えた） ──
  if (pastSameQuestionValue !== undefined && pastDaysDiff !== undefined) {
    const diff = value - pastSameQuestionValue;
    if (Math.abs(diff) >= 2) {
      const daysLabel = pastDaysDiff === 1 ? "昨日" : `${pastDaysDiff}日前`;
      if (diff > 0) {
        return {
          text: stage >= 3
            ? `${daysLabel}は${pastSameQuestionValue}だったのに。何があった？`
            : `${daysLabel}より上がってるね。`,
          expression: stage >= 3 ? "surprised" : "curious",
          pauseMs: basePause,
          reason: "past_comparison_up",
        };
      } else {
        return {
          text: stage >= 3
            ? `${daysLabel}は良かったのに…この間に何かあった？`
            : `前より少し下がってる。`,
          expression: "concerned",
          pauseMs: basePause + 200,
          reason: "past_comparison_down",
        };
      }
    }
  }

  // ── 深夜の高スコア ──
  if (timeOfDay === "late_night" && value >= 4 && stage >= 2) {
    return {
      text: "この時間に調子いいって言えるの、珍しいタイプだね。",
      expression: "curious",
      pauseMs: basePause,
      reason: "late_night_high",
    };
  }

  // ── 毎日来てるユーザー + 高スコア ──
  if (streakDays && streakDays >= 7 && value >= 4 && totalAnsweredToday === 1 && stage >= 3) {
    return {
      text: "毎日高いね。…本当に？ それとも、ここではそう見せたい？",
      expression: "skeptical",
      pauseMs: basePause + 300,
      reason: "streak_high_pushback",
    };
  }

  return null;
}

/* ═══════════════════════════════════════════════
   2. Stage Reactions — ステージで変わるトーン
   ═══════════════════════════════════════════════ */

function tryStageReaction(input: ReactionInput): LivingReaction | null {
  const { value, stage } = input;
  const basePause = getBasePause(stage, value, false);

  // Stage-specific reaction pools
  if (stage === 1) {
    // 丁寧・肯定的
    const reactions = value >= 4
      ? ["いい感じだね。教えてくれてありがとう。", "なるほど。記録しておくね。"]
      : value <= 2
      ? ["そうか。正直に教えてくれてありがとう。", "なるほど…。ちゃんと聞いてるよ。"]
      : ["わかった。覚えておく。"];
    return {
      text: reactions[input.totalAnsweredToday % reactions.length],
      expression: value >= 4 ? "warm" : value <= 2 ? "concerned" : "listening",
      pauseMs: basePause,
      reason: "stage1_polite",
    };
  }

  if (stage === 4 || stage === 5) {
    // 言葉が少ない
    if (value >= 4) {
      return {
        text: stage === 5 ? "うん。" : "…そう。",
        expression: "knowing",
        pauseMs: basePause,
        reason: "stage4_minimal",
      };
    }
    if (value <= 2) {
      return {
        text: stage === 5 ? "…。" : "……そうか。",
        expression: "quiet",
        pauseMs: basePause + 600,
        reason: "stage4_silence",
      };
    }
  }

  return null;
}

/* ═══════════════════════════════════════════════
   3. Fallback — テンプレ（最終手段）
   ═══════════════════════════════════════════════ */

function getFallbackReaction(input: ReactionInput): LivingReaction {
  const { value, stage, category } = input;
  const basePause = getBasePause(stage, value, false);

  const catReactions: Record<string, Record<string, string>> = {
    partner: {
      high: "人との関わり、充実してたんだ。",
      mid: "ふむ。人との距離感、見てみる。",
      low: "少し疲れたね。",
    },
    outfit: {
      high: "コーデ、噛み合ってたんだね。",
      mid: "まあまあか。覚えておく。",
      low: "合わなかったか。次の参考にする。",
    },
    care: {
      high: "自分のケア、できてるみたいだね。",
      mid: "ここはもう少し見てみたい。",
      low: "自分のこと、後回しにしてない？",
    },
    preparation: {
      high: "準備がうまくいったんだ。",
      mid: "まあまあか。",
      low: "準備不足だった？",
    },
    impression: {
      high: "いい印象だったみたい。",
      mid: "ふむ。",
      low: "思ったほどじゃなかった？",
    },
  };

  const level = value >= 4 ? "high" : value <= 2 ? "low" : "mid";
  const catR = catReactions[category];
  const text = catR?.[level] ?? (value >= 4 ? "なるほど。" : value <= 2 ? "そうか。" : "わかった。");

  return {
    text,
    expression: value >= 4 ? "warm" : value <= 2 ? "concerned" : "listening",
    pauseMs: basePause,
    reason: "fallback",
  };
}

/* ═══════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════ */

function getBasePause(stage: RelationshipStage, value: number, isContradiction?: boolean): number {
  const base: Record<RelationshipStage, number> = {
    1: 600,
    2: 900,
    3: 1200,
    4: 1800,
    5: 2400,
  };
  let pause = base[stage];
  if (value <= 2) pause += stage >= 3 ? 800 : 200;
  if (isContradiction && stage >= 3) pause += 600;
  return pause;
}

/**
 * セッション内の同スコア連続回数を算出
 */
export function countConsecutiveSameScore(value: number): number {
  const memory = getSessionMemory();
  if (memory.length === 0) return 1;
  let count = 1;
  for (let i = memory.length - 1; i >= 0; i--) {
    if (memory[i].value === value) count++;
    else break;
  }
  return count;
}

/* ═══════════════════════════════════════════════
   AI-Powered Reaction (Async Enhancement)
   ═══════════════════════════════════════════════ */

/**
 * AI生成リアクションを非同期で取得する。
 * ルールベースの即時反応と並行で呼び出し、到着したら差し替える。
 *
 * @returns AI生成テキスト or null（失敗・タイムアウト時）
 */
export async function fetchAIReaction(
  input: ReactionInput,
): Promise<{ reaction: string; expression: string } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000); // 6秒タイムアウト

    const res = await fetch("/api/aneurasync/ai-reaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      signal: controller.signal,
      body: JSON.stringify({
        category: input.category,
        value: input.value,
        questionText: input.questionText,
        answerLabel: input.answerLabel,
        responseTimeMs: input.responseTimeMs,
        stage: input.stage,
        totalAnsweredToday: input.totalAnsweredToday,
        previousValue: input.previousValue,
        pastSameQuestionValue: input.pastSameQuestionValue,
        pastDaysDiff: input.pastDaysDiff,
        isContradiction: input.isContradiction,
        streakDays: input.streakDays,
        timeOfDay: input.timeOfDay,
      }),
    });

    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.ok || !data.reaction) return null;

    return { reaction: data.reaction, expression: data.expression ?? "neutral" };
  } catch {
    return null; // タイムアウト or ネットワークエラー
  }
}

/**
 * AI強化リアクション — ルールベースで即座に返し、AI結果が到着したらコールバックで差し替え。
 *
 * 使い方:
 * ```
 * const { immediate, aiPromise } = generateEnhancedReaction(input);
 * // まず immediate を表示
 * const aiResult = await aiPromise;
 * if (aiResult) {
 *   // AI結果で差し替え
 * }
 * ```
 */
export function generateEnhancedReaction(input: ReactionInput): {
  immediate: LivingReaction;
  aiPromise: Promise<{ reaction: string; expression: string } | null>;
} {
  const immediate = generateLivingReaction(input);
  const aiPromise = fetchAIReaction(input);
  return { immediate, aiPromise };
}
