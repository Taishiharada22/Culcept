import "server-only";

// lib/stargazer/lensDiscovery.ts
// AI駆動の観測レンズ発見エンジン — Aneurasync哲学に基づくレンズの自律発見・検証・活性化

import { runAI } from "@/lib/ai";
import { parseStructuredJsonWithRecovery } from "@/lib/ai/structuredJson";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ObservationLens,
  LensDiscoveryRequest,
} from "./questionPoolTypes";
import {
  makeStargazerRunMetadata,
  type StargazerCandidateAuditEntry,
} from "./studentTrack";
import {
  buildStargazerRejectedCandidateReason,
  buildSyntheticStargazerNegativeEntry,
} from "./trainingAssets";

// ═══ Seed Lenses (DB migration reference) ═══

export const SEED_LENSES: ObservationLens[] = [
  {
    id: "lens_motivation",
    nameJa: "動機の構造",
    description:
      "行動を駆動するものは何か — 承認、安心、成長、回避のどれが中心か",
    probingTargets: ["reason", "trigger"],
    relatedAxes: [
      "cautious_vs_bold",
      "plan_vs_spontaneous",
      "social_initiative",
    ],
    exampleSituations: [
      "大きな決断をする場面",
      "新しい挑戦に踏み出す場面",
      "断る場面",
    ],
    discoverySource: "philosophy",
    status: "active",
    questionsGenerated: 0,
    qualityMetrics: {},
    avgQuality: 0.5,
  },
  {
    id: "lens_conflict",
    nameJa: "内的葛藤",
    description:
      "相反する欲求が衝突するパターン — やりたいけどやれない、の構造",
    probingTargets: ["contradiction", "exception"],
    relatedAxes: [
      "independence_vs_harmony",
      "plan_vs_spontaneous",
      "emotional_variability",
    ],
    exampleSituations: [
      "自由と安定の板挟み",
      "言いたいことを飲み込む場面",
      "義務と欲求が衝突する場面",
    ],
    discoverySource: "philosophy",
    status: "active",
    questionsGenerated: 0,
    qualityMetrics: {},
    avgQuality: 0.5,
  },
  {
    id: "lens_defense",
    nameJa: "防衛反応",
    description: "脅威を感じた時に無自覚に発動する自己防衛パターン",
    probingTargets: ["defense", "facade_gap"],
    relatedAxes: [
      "boundary_awareness",
      "stress_isolation_vs_social",
      "emotional_regulation",
    ],
    exampleSituations: [
      "批判された時",
      "期待に応えられない時",
      "自分の弱さを見せる場面",
    ],
    discoverySource: "philosophy",
    status: "active",
    questionsGenerated: 0,
    qualityMetrics: {},
    avgQuality: 0.5,
  },
  {
    id: "lens_ideal_self",
    nameJa: "理想自己と現実",
    description:
      "なりたい自分と実際の自分のギャップ、そしてそのギャップへの向き合い方",
    probingTargets: ["facade_gap", "contradiction"],
    relatedAxes: [
      "perfectionist_vs_pragmatic",
      "public_private_gap",
      "change_embrace_vs_resist",
    ],
    exampleSituations: [
      "理想の自分と比べて落ち込む場面",
      "人前で演じている場面",
      "自分に正直になれる場面",
    ],
    discoverySource: "philosophy",
    status: "active",
    questionsGenerated: 0,
    qualityMetrics: {},
    avgQuality: 0.5,
  },
  {
    id: "lens_unchosen",
    nameJa: "未選択の行動",
    description: "実際には選ばなかった行動・避けた道から見える本音",
    probingTargets: ["unchosen", "reason"],
    relatedAxes: ["cautious_vs_bold", "social_initiative", "intimacy_pace"],
    exampleSituations: [
      "誘いを断った場面",
      "言いかけてやめた場面",
      "チャンスを見送った場面",
    ],
    discoverySource: "philosophy",
    status: "active",
    questionsGenerated: 0,
    qualityMetrics: {},
    avgQuality: 0.5,
  },
  {
    id: "lens_relationship_shift",
    nameJa: "関係性の変化",
    description:
      "人との関係が時間と共にどう変わるか — 近づき方と離れ方",
    probingTargets: ["trigger", "exception"],
    relatedAxes: [
      "intimacy_pace",
      "relationship_mode_split",
      "long_term_shift_risk",
    ],
    exampleSituations: [
      "仲良くなるプロセス",
      "関係が冷める過程",
      "再会した時の距離感",
    ],
    discoverySource: "philosophy",
    status: "active",
    questionsGenerated: 0,
    qualityMetrics: {},
    avgQuality: 0.5,
  },
  {
    id: "lens_memory_trigger",
    nameJa: "記憶起点",
    description:
      "過去の特定の経験が今の判断パターンにどう影響しているか",
    probingTargets: ["memory_link", "trigger"],
    relatedAxes: [
      "reassurance_need",
      "boundary_awareness",
      "emotional_variability",
    ],
    exampleSituations: [
      "似た場面で同じ反応をする",
      "特定の言葉に過剰反応する",
      "昔の経験が今の価値観を形作った",
    ],
    discoverySource: "philosophy",
    status: "active",
    questionsGenerated: 0,
    qualityMetrics: {},
    avgQuality: 0.5,
  },
  {
    id: "lens_self_deception",
    nameJa: "自己欺瞞",
    description:
      "自分に嘘をついているパターン — 認めたくない本音",
    probingTargets: ["facade_gap", "defense"],
    relatedAxes: [
      "public_private_gap",
      "emotional_regulation",
      "control_tendency",
    ],
    exampleSituations: [
      "大丈夫と言いながら無理している場面",
      "怒りを悲しみに変換する場面",
      "本当の理由を隠す場面",
    ],
    discoverySource: "philosophy",
    status: "active",
    questionsGenerated: 0,
    qualityMetrics: {},
    avgQuality: 0.5,
  },
  {
    id: "lens_safety_condition",
    nameJa: "安心の条件",
    description:
      "何があると安心し、何がないと不安になるか — 安心の構造",
    probingTargets: ["exception", "trigger"],
    relatedAxes: [
      "reassurance_need",
      "boundary_awareness",
      "stress_isolation_vs_social",
    ],
    exampleSituations: [
      "安心できる人の条件",
      "不安になる環境",
      "一人で安心できる条件",
    ],
    discoverySource: "philosophy",
    status: "active",
    questionsGenerated: 0,
    qualityMetrics: {},
    avgQuality: 0.5,
  },
  {
    id: "lens_fatigue_pattern",
    nameJa: "疲弊パターン",
    description:
      "何に消耗し、どう回復するか — エネルギーの法則",
    probingTargets: ["trigger", "exception"],
    relatedAxes: [
      "introvert_vs_extrovert",
      "stress_isolation_vs_social",
      "emotional_regulation",
    ],
    exampleSituations: [
      "人といて疲れる場面",
      "意外と元気になる場面",
      "回復に必要な条件",
    ],
    discoverySource: "philosophy",
    status: "active",
    questionsGenerated: 0,
    qualityMetrics: {},
    avgQuality: 0.5,
  },
];

// ═══ System Prompt ═══

export const LENS_DISCOVERY_SYSTEM_PROMPT = `あなたはAneurasyncシステムの「観測レンズ設計者」です。

【中心問い】
「この機能は、ユーザーの第二の自己として必要か？」

【目的】
表面的なプロフィールではなく、判断原理・揺れ方・深層心理・無自覚な内面傾向を掴むための
新しい「観測レンズ」を発見します。

【掴むべきもの】
安心の源、引っかかり、疲れの原因、迷い時の優先軸、自然に動ける条件、
崩れやすい条件、状態による変化、未言語化の欲求と恐れ

【最高体験】
「自分って、そういう人間だったのか」とユーザー自身が気づく瞬間

【観測レンズとは】
人間の認知・行動・内面を観測するための「視点」です。
各レンズは特定の角度から人間を照らし、見えなかったパターンを浮かび上がらせます。
良いレンズは、質問を通じて、ユーザー自身が気づいていない構造を引き出します。

【発見基準 — 4つのテスト】
1. 判断原理に近づけるか？ — そのレンズを通して、ユーザーの判断原理が見えるか
2. 変化の法則を掴めるか？ — 状況・時間・相手によって変わるパターンが観測できるか
3. 自己理解が深まるか？ — 「そうだったのか」という気づきが生まれるか
4. 深い観測に繋がるか？ — そのレンズからさらに深い質問が無限に展開できるか

【出力形式】
JSON配列で、各要素は:
{
  "name_ja": "レンズ名（日本語・2-6文字）",
  "description": "何が観測できるか（日本語・1-2文）",
  "probing_targets": ["このレンズと相性のいいprobe_type（2-4個）"],
  "related_axes": ["関連する特性軸ID（2-4個）"],
  "example_situations": ["代表的な場面例（日本語・3個）"]
}

【probe_type一覧】
surface, reason, trigger, exception, contradiction, facade_gap, defense, unchosen, memory_link

【注意】
- 既存レンズと意味的に重複するものは生成しない
- 抽象的すぎるレンズ（「感情」「性格」）は避ける — 具体的な観測角度が必要
- レンズ名は人が直感的に理解できる日本語にする
- 心理学用語をそのまま使わず、日常感覚に翻訳する
- 追加キーは禁止`;

function buildLensDiscoveryJsonSchema(count: number): Record<string, unknown> {
  const exactCount = Math.max(1, Math.trunc(count));
  return {
    type: "array",
    minItems: exactCount,
    maxItems: exactCount,
    items: {
      type: "object",
      additionalProperties: false,
      required: [
        "name_ja",
        "description",
        "probing_targets",
        "related_axes",
        "example_situations",
      ],
      properties: {
        name_ja: { type: "string", minLength: 2, maxLength: 12 },
        description: { type: "string", minLength: 10, maxLength: 200 },
        probing_targets: {
          type: "array",
          minItems: 2,
          maxItems: 4,
          items: { type: "string", minLength: 1, maxLength: 32 },
        },
        related_axes: {
          type: "array",
          minItems: 2,
          maxItems: 4,
          items: { type: "string", minLength: 1, maxLength: 64 },
        },
        example_situations: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: { type: "string", minLength: 2, maxLength: 80 },
        },
      },
    },
  };
}

// ═══ Lens Discovery ═══

/**
 * AI を使って新しい観測レンズを発見する。
 * 既存レンズとプール統計を文脈として渡し、未開拓の観測角度を探す。
 */
export async function discoverLenses(
  request: LensDiscoveryRequest,
): Promise<{
  lenses: ObservationLens[];
  aiRunId: string | null;
  audit: StargazerCandidateAuditEntry[];
}> {
  const existingList = request.existingLenses
    .map((l) => `- ${l.id}: ${l.nameJa}（${l.description}）`)
    .join("\n");

  const statsLines = [
    `総アクティブ質問数: ${request.poolStats.totalActive}`,
    `軸別分布: ${JSON.stringify(request.poolStats.byAxis)}`,
    `レンズ別分布: ${JSON.stringify(request.poolStats.byLens)}`,
    `プローブ別分布: ${JSON.stringify(request.poolStats.byProbeType)}`,
    `深度別分布: ${JSON.stringify(request.poolStats.byDepth)}`,
    `平均品質: ${request.poolStats.avgQuality.toFixed(2)}`,
  ].join("\n");

  const focusNote = request.focusCategory
    ? `\n【重点カテゴリ】${request.focusCategory} に関連するレンズを優先的に発見してください。`
    : "";

  const userPrompt = `以下の文脈を踏まえて、新しい観測レンズを${request.count}個発見してください。

【既存レンズ一覧（重複回避のため）】
${existingList}

【現在のプール統計】
${statsLines}
${focusNote}

既存レンズがカバーしていない観測角度、まだ問われていない人間の構造的パターンを発見してください。
特に、既存レンズの「隙間」にある、見落とされがちだが重要な内面のパターンに注目してください。`;

  const result = await runAI({
    taskType: "stargazer_lens_discovery",
    prompt: userPrompt,
    systemPrompt: LENS_DISCOVERY_SYSTEM_PROMPT,
    jsonSchema: buildLensDiscoveryJsonSchema(request.count),
    requireJson: true,
    temperature: 0.8,
    maxOutputTokens: 4096,
    preferredProvider: "gemini",
    metadata: makeStargazerRunMetadata({
      existingLensCount: request.existingLenses.length,
      poolTotalActive: request.poolStats.totalActive,
      requestedCount: request.count,
      focusCategory: request.focusCategory ?? null,
      skipCache: true,
    }),
  });

  if (!result.success) {
    console.error(
      "[lensDiscovery] AI generation failed:",
      result.errorMessage,
    );
    return {
      lenses: [],
      aiRunId: result.aiRunId,
      audit: [
        buildSyntheticStargazerNegativeEntry({
          entityType: "lens",
          rejectionReason: `provider_failure:${result.errorMessage ?? "unknown_error"}`,
          candidateJson: {
            errorMessage: result.errorMessage ?? "unknown_error",
          },
          normalizedOutput: {
            runSuccess: false,
          },
        }),
      ],
    };
  }

  // Parse response
  let parsed: unknown[];
  try {
    if (result.structured && Array.isArray(result.structured)) {
      parsed = result.structured as unknown[];
    } else if (
      result.structured &&
      typeof result.structured === "object" &&
      "lenses" in result.structured
    ) {
      parsed = (result.structured as Record<string, unknown>).lenses as unknown[];
    } else {
      const recovered = parseStructuredJsonWithRecovery(result.text);
      if (Array.isArray(recovered)) {
        parsed = recovered;
      } else if (
        recovered &&
        typeof recovered === "object" &&
        "lenses" in recovered &&
        Array.isArray((recovered as Record<string, unknown>).lenses)
      ) {
        parsed = (recovered as Record<string, unknown>).lenses as unknown[];
      } else {
        console.error("[lensDiscovery] No JSON array found in response");
        return {
          lenses: [],
          aiRunId: result.aiRunId,
          audit: [
            buildSyntheticStargazerNegativeEntry({
              entityType: "lens",
              rejectionReason: "hard_negative:malformed_output",
              candidateJson: {
                rawText: result.text,
                structured: result.structured ?? null,
              },
              normalizedOutput: {
                parsedType: "missing_array",
                fallbackUsed: result.fallbackUsed,
              },
            }),
          ],
        };
      }
    }
  } catch (e) {
    console.error("[lensDiscovery] Failed to parse AI output:", e);
    return {
      lenses: [],
      aiRunId: result.aiRunId,
      audit: [
        buildSyntheticStargazerNegativeEntry({
          entityType: "lens",
          rejectionReason: "hard_negative:parse_failure",
          candidateJson: {
            rawText: result.text,
            structured: result.structured ?? null,
            errorMessage: e instanceof Error ? e.message : "parse_failure",
          },
          normalizedOutput: {
            runSuccess: true,
            fallbackUsed: result.fallbackUsed,
          },
        }),
      ],
    };
  }

  if (!Array.isArray(parsed)) {
    console.error("[lensDiscovery] Parsed output is not an array");
    return {
      lenses: [],
      aiRunId: result.aiRunId,
      audit: [
        buildSyntheticStargazerNegativeEntry({
          entityType: "lens",
          rejectionReason: "hard_negative:malformed_output",
          candidateJson: {
            rawText: result.text,
            structured: result.structured ?? null,
          },
          normalizedOutput: {
            parsedType: typeof parsed,
            fallbackUsed: result.fallbackUsed,
          },
        }),
      ],
    };
  }

  // Validate and convert each discovered lens
  const validated: ObservationLens[] = [];
  const audit: StargazerCandidateAuditEntry[] = [];

  parsed.forEach((raw, candidateIndex) => {
    const validation = validateDiscoveredLens(raw, request.existingLenses);
    const obj =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};

    if (!validation.valid) {
      const nameHint =
        raw && typeof raw === "object" && "name_ja" in raw
          ? (raw as Record<string, unknown>).name_ja
          : "unknown";
      console.warn(
        `[lensDiscovery] Rejected lens "${nameHint}": ${validation.reason}` +
          (validation.similarTo ? ` (similar to ${validation.similarTo})` : ""),
      );
      audit.push({
        entityType: "lens",
        candidateIndex,
        candidateJson: obj,
        normalizedOutput: {
          name_ja: obj.name_ja ?? null,
          description: obj.description ?? null,
          probing_targets: obj.probing_targets ?? null,
          related_axes: obj.related_axes ?? null,
        },
        accepted: false,
        rejectionReason: buildStargazerRejectedCandidateReason(
          validation.reason ?? "validation_failed",
        ),
      });
      return;
    }

    const nameJa = String(obj.name_ja);
    const lensId = `lens_ai_${nameJa.replace(/[^a-zA-Z\u3040-\u9FFF]/g, "").slice(0, 10)}_${Date.now().toString(36)}`;

    const lens: ObservationLens = {
      id: lensId,
      nameJa,
      description: String(obj.description),
      probingTargets: (obj.probing_targets as string[]) ?? [],
      relatedAxes: (obj.related_axes as string[]) ?? [],
      exampleSituations: (obj.example_situations as string[]) ?? [],
      discoverySource: "ai_discovered",
      status: "proposed",
      questionsGenerated: 0,
      qualityMetrics: {},
      avgQuality: 0,
    };
    validated.push(lens);
    audit.push({
      entityType: "lens",
      candidateIndex,
      candidateJson: obj,
      normalizedOutput: {
        id: lens.id,
        nameJa: lens.nameJa,
        description: lens.description,
        probingTargets: lens.probingTargets,
        relatedAxes: lens.relatedAxes,
      },
      accepted: true,
      acceptedEntityId: lens.id,
      lensId: lens.id,
    });
  });

  if (validated.length === 0 && parsed.length > 0) {
    audit.push(
      buildSyntheticStargazerNegativeEntry({
        entityType: "lens",
        rejectionReason: "hard_negative:all_candidates_rejected",
        candidateJson: {
          rawSample:
            parsed[0] && typeof parsed[0] === "object" && !Array.isArray(parsed[0])
              ? (parsed[0] as Record<string, unknown>)
              : null,
          rejectedCount: audit.length,
        },
        normalizedOutput: {
          validatedCount: 0,
          parsedCount: parsed.length,
          fallbackUsed: result.fallbackUsed,
        },
        candidateIndex: parsed.length,
      }),
    );
  }

  if (result.fallbackUsed) {
    audit.push(
      buildSyntheticStargazerNegativeEntry({
        entityType: "lens",
        rejectionReason: "hard_negative:fallback_used",
        candidateJson: {
          provider: result.provider,
          model: result.model,
          parsedCount: parsed.length,
          acceptedCount: validated.length,
        },
        normalizedOutput: {
          fallbackUsed: true,
          acceptedCount: validated.length,
        },
        candidateIndex: parsed.length + 1,
      }),
    );
  }

  return { lenses: validated, aiRunId: result.aiRunId, audit };
}

// ═══ Lens Validation ═══

/**
 * 発見されたレンズの構造的・意味的検証。
 * 既存レンズとの類似度が高すぎる場合はreject。
 */
export function validateDiscoveredLens(
  raw: unknown,
  existingLenses: ObservationLens[],
): { valid: boolean; reason?: string; similarTo?: string } {
  if (!raw || typeof raw !== "object") {
    return { valid: false, reason: "not an object" };
  }

  const obj = raw as Record<string, unknown>;

  // ── Structural checks ──
  if (!obj.name_ja || typeof obj.name_ja !== "string") {
    return { valid: false, reason: "name_ja is missing or not a string" };
  }
  if (!obj.description || typeof obj.description !== "string") {
    return { valid: false, reason: "description is missing or not a string" };
  }
  if (!Array.isArray(obj.probing_targets) || obj.probing_targets.length === 0) {
    return {
      valid: false,
      reason: "probing_targets must be a non-empty array",
    };
  }
  if (!Array.isArray(obj.related_axes) || obj.related_axes.length === 0) {
    return { valid: false, reason: "related_axes must be a non-empty array" };
  }

  const nameJa = obj.name_ja as string;
  const description = obj.description as string;
  const probingTargets = obj.probing_targets as string[];
  const relatedAxes = obj.related_axes as string[];

  // ── Length constraints ──
  if (nameJa.length < 2 || nameJa.length > 12) {
    return {
      valid: false,
      reason: `name_ja length ${nameJa.length} out of range [2, 12]`,
    };
  }
  if (description.length < 10 || description.length > 200) {
    return {
      valid: false,
      reason: `description length ${description.length} out of range [10, 200]`,
    };
  }

  // ── Semantic similarity check against existing lenses ──
  for (const existing of existingLenses) {
    const probeSim = jaccardSimilarity(probingTargets, existing.probingTargets);
    const axesSim = jaccardSimilarity(relatedAxes, existing.relatedAxes);
    const nameMatch = partialStringMatch(nameJa, existing.nameJa);
    const descMatch = partialStringMatch(description, existing.description);

    // Combined similarity: weighted average
    const combined =
      probeSim * 0.25 + axesSim * 0.25 + nameMatch * 0.3 + descMatch * 0.2;

    if (combined > 0.6) {
      return {
        valid: false,
        reason: `too similar to existing lens (combined=${combined.toFixed(2)})`,
        similarTo: existing.id,
      };
    }
  }

  return { valid: true };
}

// ═══ Activation Readiness ═══

/**
 * proposed レンズが active に昇格できるか判定する。
 * 十分な質問数・回答数・品質・多様性が必要。
 */
export async function checkActivationReadiness(
  lensId: string,
  supabase: SupabaseClient,
): Promise<{ ready: boolean; unmetCriteria: string[] }> {
  const thresholds = {
    minQuestions: 10,
    minAvgQuality: 0.4,
    minAnsweredQuestions: 5,
    minDistinctProbeTypes: 3,
    minDistinctDepthScores: 2,
    maxSimilarityToActive: 0.6,
  };

  const unmetCriteria: string[] = [];

  // Fetch questions for this lens
  const { data: questions } = await supabase
    .from("stargazer_question_pool")
    .select(
      "question_key, quality_score, times_answered, probe_type, depth_score",
    )
    .eq("primary_lens_id", lensId)
    .eq("is_active", true);

  const questionList = questions ?? [];

  // Check: minimum total questions
  if (questionList.length < thresholds.minQuestions) {
    unmetCriteria.push(
      `questions: ${questionList.length}/${thresholds.minQuestions}`,
    );
  }

  // Check: minimum answered questions
  const answeredQuestions = questionList.filter(
    (q) => (q.times_answered ?? 0) >= 1,
  );
  if (answeredQuestions.length < thresholds.minAnsweredQuestions) {
    unmetCriteria.push(
      `answered: ${answeredQuestions.length}/${thresholds.minAnsweredQuestions}`,
    );
  }

  // Check: average quality (only for questions with enough answers)
  const qualifiable = questionList.filter(
    (q) => (q.times_answered ?? 0) >= 5,
  );
  if (qualifiable.length > 0) {
    const avgQuality =
      qualifiable.reduce((sum, q) => sum + (q.quality_score ?? 0), 0) /
      qualifiable.length;
    if (avgQuality < thresholds.minAvgQuality) {
      unmetCriteria.push(
        `avgQuality: ${avgQuality.toFixed(2)}/${thresholds.minAvgQuality}`,
      );
    }
  }

  // Check: distinct probe types
  const distinctProbeTypes = new Set(questionList.map((q) => q.probe_type));
  if (distinctProbeTypes.size < thresholds.minDistinctProbeTypes) {
    unmetCriteria.push(
      `probeTypes: ${distinctProbeTypes.size}/${thresholds.minDistinctProbeTypes}`,
    );
  }

  // Check: distinct depth scores
  const distinctDepths = new Set(questionList.map((q) => q.depth_score));
  if (distinctDepths.size < thresholds.minDistinctDepthScores) {
    unmetCriteria.push(
      `depthScores: ${distinctDepths.size}/${thresholds.minDistinctDepthScores}`,
    );
  }

  // Check: similarity to active lenses
  const { data: lensRow } = await supabase
    .from("stargazer_observation_lenses")
    .select("probing_targets, related_axes, name_ja, description")
    .eq("id", lensId)
    .single();

  if (lensRow) {
    const { data: activeLenses } = await supabase
      .from("stargazer_observation_lenses")
      .select("id, probing_targets, related_axes, name_ja, description")
      .eq("status", "active");

    for (const active of activeLenses ?? []) {
      const probeSim = jaccardSimilarity(
        lensRow.probing_targets ?? [],
        active.probing_targets ?? [],
      );
      const axesSim = jaccardSimilarity(
        lensRow.related_axes ?? [],
        active.related_axes ?? [],
      );
      const nameSim = partialStringMatch(
        lensRow.name_ja ?? "",
        active.name_ja ?? "",
      );
      const descSim = partialStringMatch(
        lensRow.description ?? "",
        active.description ?? "",
      );
      const combined =
        probeSim * 0.25 + axesSim * 0.25 + nameSim * 0.3 + descSim * 0.2;

      if (combined > thresholds.maxSimilarityToActive) {
        unmetCriteria.push(
          `similarity to ${active.id}: ${combined.toFixed(2)}/${thresholds.maxSimilarityToActive}`,
        );
        break;
      }
    }
  }

  return {
    ready: unmetCriteria.length === 0,
    unmetCriteria,
  };
}

// ═══ Lens Lifecycle ═══

/**
 * レンズを active に昇格させる。
 */
export async function activateLens(
  lensId: string,
  supabase: SupabaseClient,
): Promise<void> {
  const { error } = await supabase
    .from("stargazer_observation_lenses")
    .update({
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", lensId);

  if (error) {
    console.error(`[lensDiscovery] Failed to activate lens ${lensId}:`, error);
    throw error;
  }

  console.info(`[lensDiscovery] Lens activated: ${lensId}`);
}

/**
 * レンズを cooling 状態に移行させる（一時休止）。
 * 品質低下やユーザーの飽きが検出された場合に使用。
 */
export async function coolLens(
  lensId: string,
  reason: string,
  supabase: SupabaseClient,
): Promise<void> {
  // Read existing quality_metrics to merge the cooling reason
  const { data: existing } = await supabase
    .from("stargazer_observation_lenses")
    .select("quality_metrics")
    .eq("id", lensId)
    .single();

  const currentMetrics =
    (existing?.quality_metrics as Record<string, unknown>) ?? {};

  const { error } = await supabase
    .from("stargazer_observation_lenses")
    .update({
      status: "cooling",
      quality_metrics: {
        ...currentMetrics,
        coolingReason: reason,
        cooledAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", lensId);

  if (error) {
    console.error(`[lensDiscovery] Failed to cool lens ${lensId}:`, error);
    throw error;
  }

  console.info(`[lensDiscovery] Lens cooled: ${lensId} (reason: ${reason})`);
}

/**
 * 発見されたレンズをDBに保存する。
 */
export async function saveLens(
  lens: ObservationLens,
  batchId: string,
  supabase: SupabaseClient,
): Promise<void> {
  const { error } = await supabase
    .from("stargazer_observation_lenses")
    .insert({
      id: lens.id,
      name_ja: lens.nameJa,
      description: lens.description,
      probing_targets: lens.probingTargets,
      related_axes: lens.relatedAxes,
      example_situations: lens.exampleSituations,
      discovery_source: lens.discoverySource,
      generation_batch_id: batchId,
      status: lens.status,
      questions_generated: lens.questionsGenerated,
      quality_metrics: lens.qualityMetrics,
      avg_quality: lens.avgQuality,
    });

  if (error) {
    console.error(`[lensDiscovery] Failed to save lens ${lens.id}:`, error);
    throw error;
  }

  console.info(`[lensDiscovery] Lens saved: ${lens.id} (${lens.nameJa})`);
}

// ═══ Similarity Helpers ═══

/**
 * Jaccard similarity between two string arrays.
 * Returns 0-1 where 1 means identical sets.
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Partial string match using character bigram overlap.
 * Returns 0-1 where 1 means identical bigram sets.
 */
function partialStringMatch(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const bigramsA = extractBigrams(a);
  const bigramsB = extractBigrams(b);

  if (bigramsA.size === 0 && bigramsB.size === 0) return 0;

  let intersection = 0;
  for (const bigram of bigramsA) {
    if (bigramsB.has(bigram)) intersection++;
  }

  const union = new Set([...bigramsA, ...bigramsB]).size;
  return union === 0 ? 0 : intersection / union;
}

function extractBigrams(s: string): Set<string> {
  const bigrams = new Set<string>();
  const normalized = s.replace(/\s+/g, "");
  for (let i = 0; i < normalized.length - 1; i++) {
    bigrams.add(normalized.slice(i, i + 2));
  }
  return bigrams;
}
