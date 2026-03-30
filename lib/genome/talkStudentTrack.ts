// lib/genome/talkStudentTrack.ts
// Talk Conversation Insight の student LLM トラック
//
// フロー:
// 1. Gemini (teacher) が会話インサイトを生成
// 2. runAI() が自動的に teacher_outputs に保存
// 3. このファイルの関数で student 学習用データを生成
// 4. student の品質が閾値を超えたら champion 昇格
//
// taskType: "talk_conversation_insight"

export const TALK_TASK_TYPE = "talk_conversation_insight";

export const TALK_TRAINING_ARTIFACT_TYPES = [
  "talk_insight_training_jsonl",
  "talk_insight_teacher_jsonl",
] as const;

export type TalkTrainingArtifactType = typeof TALK_TRAINING_ARTIFACT_TYPES[number];

export function isTalkTrainingArtifactType(type: string): type is TalkTrainingArtifactType {
  return TALK_TRAINING_ARTIFACT_TYPES.includes(type as TalkTrainingArtifactType);
}

/**
 * Talk Insight Student の品質評価基準
 *
 * teacher (Gemini Pro) の出力と比較して:
 * - communicationStyle が具体的か（曖昧な「バランス型」ではなく、行動可能なアドバイスか）
 * - landmines が人格攻撃にならないか（安全性チェック）
 * - 全体の日本語品質
 */
export interface TalkStudentEvalCriteria {
  /** communicationStyle.hint が20文字以上の具体的なアドバイスか */
  hintSpecificity: boolean;
  /** landmines が3つ以下か */
  landmineCount: boolean;
  /** bestCompliment が空でないか */
  hasCompliment: boolean;
  /** JSON構造が正しいか */
  validJson: boolean;
}

/**
 * Student出力を評価
 * @returns 0-1 のスコア（0.7以上で昇格候補）
 */
export function evaluateTalkStudentOutput(
  studentOutput: string,
): { score: number; criteria: TalkStudentEvalCriteria } {
  try {
    const parsed = JSON.parse(studentOutput);
    const criteria: TalkStudentEvalCriteria = {
      hintSpecificity: typeof parsed.communicationStyle?.hint === "string" && parsed.communicationStyle.hint.length >= 20,
      landmineCount: Array.isArray(parsed.landmines) && parsed.landmines.length <= 3,
      hasCompliment: typeof parsed.bestCompliment === "string" && parsed.bestCompliment.length > 0,
      validJson: true,
    };

    const passed = Object.values(criteria).filter(Boolean).length;
    const total = Object.keys(criteria).length;
    return { score: passed / total, criteria };
  } catch {
    return {
      score: 0,
      criteria: { hintSpecificity: false, landmineCount: false, hasCompliment: false, validJson: false },
    };
  }
}

/**
 * 昇格判定
 * - 最低50サンプル
 * - 平均スコア 0.7 以上
 * - パス率 80% 以上
 */
export const TALK_PROMOTION_THRESHOLDS = {
  min_sample_size: 50,
  min_avg_score: 0.7,
  min_pass_rate: 0.8,
  max_fallback_rate: 0.1,
} as const;
