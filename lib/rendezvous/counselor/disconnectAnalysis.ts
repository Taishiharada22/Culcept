import "server-only";

import { runAI } from "@/lib/ai";
import { supabaseServer } from "@/lib/supabase/server";
import type {
  DisconnectReasonCode,
  DisconnectAnalysis,
  TendencyInsight,
} from "./types";
import { DISCONNECT_REASON_LABELS as REASON_LABELS } from "./types";

// ============================================================
// 切断分析エンジン
// 接続が終了した理由を分析し、切られた側に「傾向の発見」として届ける
// ============================================================

type AnalyzeDisconnectParams = {
  candidateId: string;
  disconnectedByUserId: string;
  reasonCode: DisconnectReasonCode;
  reasonDetail?: string;
};

type StargazerProfile = {
  userId: string;
  axisScores: Record<string, number>;
  resolvedType: string | null;
};

type AIDisconnectOutput = {
  mismatchPoints: Array<{
    dimension: string;
    label: string;
    description: string;
  }>;
  communicationGap: string | null;
  deeperInsight: string;
  tendency: string;
  explanation: string;
  reframe: string;
  relatedAxes: string[];
};

const DISCONNECT_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    mismatchPoints: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dimension: { type: "string" },
          label: { type: "string" },
          description: { type: "string" },
        },
        required: ["dimension", "label", "description"],
      },
    },
    communicationGap: { type: "string", nullable: true },
    deeperInsight: { type: "string" },
    tendency: { type: "string" },
    explanation: { type: "string" },
    reframe: { type: "string" },
    relatedAxes: { type: "array", items: { type: "string" } },
  },
  required: [
    "mismatchPoints",
    "deeperInsight",
    "tendency",
    "explanation",
    "reframe",
    "relatedAxes",
  ],
} as const;

// ---------- ヘルパー ----------

async function fetchStargazerProfile(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  userId: string,
): Promise<StargazerProfile | null> {
  const { data } = await supabase
    .from("stargazer_profiles")
    .select("user_id, axis_scores, resolved_type")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;

  return {
    userId: data.user_id,
    axisScores: (data.axis_scores ?? {}) as Record<string, number>,
    resolvedType: data.resolved_type ?? null,
  };
}

/** プロンプトを組み立てる */
export function buildDisconnectPrompt(params: {
  disconnectedProfile: StargazerProfile | null;
  disconnectorProfile: StargazerProfile | null;
  reasonCode: DisconnectReasonCode;
  reasonDetail?: string;
  reasonCodes: string[];
  cautionCodes: string[];
}): string {
  const {
    disconnectedProfile,
    disconnectorProfile,
    reasonCode,
    reasonDetail,
    reasonCodes,
    cautionCodes,
  } = params;

  const reasonLabel = REASON_LABELS[reasonCode] ?? reasonCode;

  const disconnectedAxes = disconnectedProfile
    ? JSON.stringify(disconnectedProfile.axisScores, null, 2)
    : "（プロフィール未取得）";
  const disconnectedType = disconnectedProfile?.resolvedType ?? "未判定";

  const disconnectorAxes = disconnectorProfile
    ? JSON.stringify(disconnectorProfile.axisScores, null, 2)
    : "（プロフィール未取得）";
  const disconnectorType = disconnectorProfile?.resolvedType ?? "未判定";

  return `
## タスク
接続が終了した理由を分析し、切られた側のユーザーに「自分の傾向の発見」として届けるための分析を生成してください。

## 絶対ルール
- 「拒否された理由」として絶対にフレーミングしない
- 「傾向の発見」「自己理解の深まり」として表現する
- 温かく、共感的で、建設的なトーンを保つ
- reframe では、この傾向が欠点ではないことを本心から伝える
- 具体的な Stargazer 軸名を参照する
- 全て日本語で出力

## 切断理由
- コード: ${reasonCode}
- ラベル: ${reasonLabel}
${reasonDetail ? `- 詳細: ${reasonDetail}` : ""}

## マッチング時の評価
- 理由コード: ${reasonCodes.join(", ") || "なし"}
- 注意コード: ${cautionCodes.join(", ") || "なし"}

## 切られた側のプロフィール
- タイプ: ${disconnectedType}
- 軸スコア:
${disconnectedAxes}

## 切った側のプロフィール
- タイプ: ${disconnectorType}
- 軸スコア:
${disconnectorAxes}

## 出力
上記を踏まえて、以下を JSON で返してください:
- mismatchPoints: 噛み合わなかったポイント（1-3個）
- communicationGap: コミュニケーションスタイルの違い（あれば）
- deeperInsight: 深層的な理由の推論（1文）
- tendency: 切られた側の傾向（1文、「あなたは〜」で始める）
- explanation: その傾向の説明（2-3文、共感的トーン）
- reframe: この傾向は欠点ではないという補足（1-2文）
- relatedAxes: 関連する Stargazer 軸名（1-3個）
`.trim();
}

// ---------- メイン ----------

export async function analyzeDisconnect(
  params: AnalyzeDisconnectParams,
): Promise<DisconnectAnalysis> {
  const { candidateId, disconnectedByUserId, reasonCode, reasonDetail } =
    params;
  const supabase = await supabaseServer();

  // 1. Candidate 行を取得して両ユーザーを特定
  const { data: candidate } = await supabase
    .from("rendezvous_candidates")
    .select(
      "user_a, user_b, reason_codes, caution_codes, a_to_b_score, b_to_a_score",
    )
    .eq("id", candidateId)
    .single();

  if (!candidate) {
    throw new Error(`Candidate not found: ${candidateId}`);
  }

  const disconnectedUserId =
    candidate.user_a === disconnectedByUserId
      ? candidate.user_b
      : candidate.user_a;

  // 2. 両者の Stargazer プロフィールを取得
  const [disconnectedProfile, disconnectorProfile] = await Promise.all([
    fetchStargazerProfile(supabase, disconnectedUserId),
    fetchStargazerProfile(supabase, disconnectedByUserId),
  ]);

  // 3. AI 分析
  const prompt = buildDisconnectPrompt({
    disconnectedProfile,
    disconnectorProfile,
    reasonCode,
    reasonDetail,
    reasonCodes: (candidate.reason_codes ?? []) as string[],
    cautionCodes: (candidate.caution_codes ?? []) as string[],
  });

  const aiResult = await runAI({
    taskType: "rendezvous_disconnect_analysis",
    prompt,
    systemPrompt:
      "あなたは Aneurasync の AI カウンセラーです。人と人の接続における「すれ違い」を分析し、自己理解を深めるサポートをします。決して否定的な表現は使わず、全てを成長の機会として捉えます。",
    jsonSchema: DISCONNECT_ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
    requireJson: true,
    temperature: 0.7,
    userId: disconnectedUserId,
  });

  let aiOutput: AIDisconnectOutput;
  try {
    aiOutput = (
      aiResult.structured
        ? aiResult.structured
        : JSON.parse(aiResult.text)
    ) as AIDisconnectOutput;
  } catch {
    // AI 失敗時のフォールバック
    aiOutput = {
      mismatchPoints: [
        {
          dimension: "general",
          label: "接続のリズム",
          description:
            "お互いの接続に対するリズムやペースに違いがあったようです。",
        },
      ],
      communicationGap: null,
      deeperInsight:
        "接続において求めるものの形が少し異なっていた可能性があります。",
      tendency:
        "あなたは人との接続において、自分なりのペースを大切にする傾向があります。",
      explanation:
        "これは自分の心地よさを大切にできている証拠でもあります。ただ、相手との間でそのリズムが噛み合わないこともあります。",
      reframe:
        "自分のペースを持っていることは、長い関係を築く上で大きな強みです。",
      relatedAxes: [],
    };
  }

  // 過去の同様パターン数を取得
  const { count: patternCount } = await supabase
    .from("rendezvous_tendency_patterns")
    .select("id", { count: "exact", head: true })
    .eq("user_id", disconnectedUserId);

  const tendencyInsight: TendencyInsight = {
    tendency: aiOutput.tendency,
    explanation: aiOutput.explanation,
    reframe: aiOutput.reframe,
    relatedAxes: aiOutput.relatedAxes,
    patternCount: (patternCount ?? 0) + 1,
    confidence: aiResult.success ? 0.8 : 0.3,
  };

  const analysis: DisconnectAnalysis = {
    id: "", // DB 挿入後に上書き
    candidateId,
    disconnectedByUserId,
    disconnectedUserId,
    reasonCode,
    reasonDetail: reasonDetail ?? null,
    structuralAnalysis: {
      mismatchPoints: aiOutput.mismatchPoints,
      communicationGap: aiOutput.communicationGap,
      deeperInsight: aiOutput.deeperInsight,
    },
    tendencyInsight,
    createdAt: new Date().toISOString(),
  };

  // 4. DB に保存
  const { data: inserted } = await supabase
    .from("rendezvous_disconnect_analyses")
    .insert({
      candidate_id: candidateId,
      disconnected_by_user_id: disconnectedByUserId,
      disconnected_user_id: disconnectedUserId,
      reason_code: reasonCode,
      reason_detail: reasonDetail ?? null,
      structural_analysis: analysis.structuralAnalysis,
      tendency_insight: tendencyInsight,
    })
    .select("id")
    .single();

  if (inserted) {
    analysis.id = inserted.id;
  }

  // 5. 傾向パターンを更新
  const patternKey = derivePatternKey(reasonCode, aiOutput.relatedAxes);
  await supabase.rpc("upsert_tendency_pattern", {
    p_user_id: disconnectedUserId,
    p_pattern_key: patternKey,
    p_pattern_data: {
      tendency: aiOutput.tendency,
      relatedAxes: aiOutput.relatedAxes,
      reasonCode,
    },
  }).then(
    () => {},
    // RPC が存在しない場合は手動 upsert にフォールバック
    async () => {
      const { data: existing } = await supabase
        .from("rendezvous_tendency_patterns")
        .select("id, occurrence_count")
        .eq("user_id", disconnectedUserId)
        .eq("pattern_key", patternKey)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("rendezvous_tendency_patterns")
          .update({
            occurrence_count: existing.occurrence_count + 1,
            last_detected_at: new Date().toISOString(),
            pattern_data: {
              tendency: aiOutput.tendency,
              relatedAxes: aiOutput.relatedAxes,
              reasonCode,
            },
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("rendezvous_tendency_patterns").insert({
          user_id: disconnectedUserId,
          pattern_key: patternKey,
          pattern_data: {
            tendency: aiOutput.tendency,
            relatedAxes: aiOutput.relatedAxes,
            reasonCode,
          },
          occurrence_count: 1,
          improving: false,
          first_detected_at: new Date().toISOString(),
          last_detected_at: new Date().toISOString(),
        });
      }
    },
  );

  return analysis;
}

/** 理由コードと関連軸からパターンキーを導出 */
function derivePatternKey(
  reasonCode: DisconnectReasonCode,
  relatedAxes: string[],
): string {
  const axisPart =
    relatedAxes.length > 0
      ? `_${relatedAxes[0].toLowerCase().replace(/\s+/g, "_")}`
      : "";
  return `${reasonCode}${axisPart}`;
}
