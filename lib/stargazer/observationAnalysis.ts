import "server-only";

import { runAI } from "@/lib/ai";
import { makeStargazerRunMetadata } from "./studentTrack";
import type { TraitAxisKey } from "./traitAxes";

// ============================================================
// Stargazer Observation Analysis
//
// 観測セッションの回答データを分析し、
// 「何がわかったか」「次に聞くべきこと」を推論するAIタスク。
//
// このタスクの出力は teacher 評価の対象となり、
// student の学習データとして蓄積される。
// ============================================================

export interface ObservationSessionInput {
  context: string; // friends, romantic_partner, spouse, family, coworkers
  answers: {
    prompt: string;
    selectedOptionId: string;
    inferredAxes: { key: string; weight: number }[];
  }[];
  preProfile: Partial<Record<TraitAxisKey, number>>;
  postProfile: Partial<Record<TraitAxisKey, number>>;
  profileDelta: { axis: string; before: number; after: number; delta: number }[];
  cumulativeObservationCount: number;
}

export interface ObservationAnalysisResult {
  ok: boolean;
  aiRunId: string | null;
  analysis: {
    /** このセッションで新たにわかったこと */
    discoveries: string[];
    /** プロファイルの変化に対する解釈 */
    deltaInterpretation: string;
    /** 次のセッションで優先的に探るべき領域 */
    nextPriorities: string[];
    /** 観測の質スコア (0-1): この質問セットがユーザー理解を深めたか */
    sessionQualityScore: number;
    /** 収束度の評価 */
    convergenceAssessment: string;
  } | null;
  error?: string;
}

const CONTEXT_LABELS: Record<string, string> = {
  friends: "友達",
  friendship: "友人といる時",
  romantic: "恋愛の場面",
  romantic_partner: "恋人といる時",
  partner: "パートナーといる時",
  spouse: "配偶者といる時",
  family: "家族",
  coworkers: "仕事仲間",
  one_on_one: "二人きりの時",
  online: "オンラインの場面",
  cocreation: "共創の場面",
  community: "コミュニティの中",
};

/**
 * 観測セッションを分析し、学習データとして AI run を記録する
 */
export async function analyzeObservationSession(
  input: ObservationSessionInput,
): Promise<ObservationAnalysisResult> {
  const contextLabel = CONTEXT_LABELS[input.context] ?? input.context;

  // プロファイル差分の要約
  const deltaDesc = input.profileDelta.length > 0
    ? input.profileDelta.slice(0, 5).map((d) =>
        `${d.axis}: ${d.before.toFixed(2)} → ${d.after.toFixed(2)} (${d.delta > 0 ? "+" : ""}${d.delta.toFixed(2)})`,
      ).join("\n")
    : "変化なし";

  // 回答の要約
  const answersDesc = input.answers.map((a, i) =>
    `Q${i + 1}: "${a.prompt}" → 選択: ${a.selectedOptionId} (軸: ${a.inferredAxes.map((ax) => ax.key).join(", ") || "未推定"})`,
  ).join("\n");

  try {
    const result = await runAI({
      taskType: "stargazer_observation_analysis",
      prompt: `## 観測セッション分析

### コンテキスト
- 関係性: ${contextLabel}
- 累計観測数: ${input.cumulativeObservationCount}回

### 今回の回答 (${input.answers.length}問)
${answersDesc}

### プロファイル変化
${deltaDesc}

### 分析タスク
以下をJSON形式で出力してください:
{
  "discoveries": ["このセッションで新たにわかったこと (2-4個)"],
  "deltaInterpretation": "プロファイル変化の解釈 (1-2文)",
  "nextPriorities": ["次に探るべき領域 (2-3個)"],
  "sessionQualityScore": 0.0-1.0,
  "convergenceAssessment": "収束度の評価 (1文)"
}`,
      systemPrompt: `あなたはStargazerの観測分析エンジンです。

## 分析の原則
1. 回答パターンから「この人は○○な状況で△△する傾向がある」という具体的な発見を抽出する
2. プロファイル変化が大きい軸は「新たな側面が見えた」、小さい軸は「既知の傾向が確認された」と解釈する
3. sessionQualityScore は「この質問セットがユーザー理解を深めたか」を評価する:
   - 1.0: 全問が新しい発見に繋がった
   - 0.7: 多くの質問が有意な情報をもたらした
   - 0.4: 半分は既知の確認、半分は新発見
   - 0.1: ほとんど新しい情報がなかった
4. nextPriorities は「まだ分からないこと」「矛盾がありそうなこと」を優先する
5. 日本語で出力する`,
      requireJson: true,
      temperature: 0.3, // 分析タスクは再現性重視
      maxOutputTokens: 2048,
      preferredProvider: "gemini",
      timeoutMs: 30_000,
      metadata: makeStargazerRunMetadata({
        observationContext: input.context,
        answerCount: input.answers.length,
        cumulativeCount: input.cumulativeObservationCount,
        deltaAxesCount: input.profileDelta.length,
      }),
    });

    const structured = result.structured as Record<string, unknown> | null;
    if (structured) {
      return {
        ok: true,
        aiRunId: result.aiRunId,
        analysis: {
          discoveries: Array.isArray(structured.discoveries)
            ? (structured.discoveries as string[]).slice(0, 5)
            : [],
          deltaInterpretation: String(structured.deltaInterpretation ?? ""),
          nextPriorities: Array.isArray(structured.nextPriorities)
            ? (structured.nextPriorities as string[]).slice(0, 5)
            : [],
          sessionQualityScore: Math.max(0, Math.min(1, Number(structured.sessionQualityScore) || 0.5)),
          convergenceAssessment: String(structured.convergenceAssessment ?? ""),
        },
      };
    }

    return { ok: true, aiRunId: result.aiRunId, analysis: null };
  } catch (err) {
    console.error("[observationAnalysis] failed:", err);
    return { ok: false, aiRunId: null, analysis: null, error: String(err) };
  }
}
