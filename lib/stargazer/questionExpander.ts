import "server-only";

// lib/stargazer/questionExpander.ts
// Question Depth/Probe Expansion Engine
// depth_score (1-6) と probe_type は独立次元
// depth_score = 内面への踏み込み度, probe_type = 掘る角度

import { runAI } from "@/lib/ai";
import { getAxisLabels, type TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";
import type {
  QuestionExpansionRequest,
  GeneratedQuestion,
  ContextSnapshot,
  ProbeTypeExtended,
} from "./questionPoolTypes";
import {
  PROBE_TYPE_LABELS,
  PROBE_TYPE_INSTRUCTIONS,
} from "./questionPoolTypes";
import type { ObservationLayer } from "./questionVariants";
import {
  buildGeneratedQuestionArraySchema,
  parseGeneratedQuestionPayload,
  validateGeneratedQuestion,
} from "./questionGenerator";
import {
  makeStargazerRunMetadata,
  type StargazerCandidateAuditEntry,
} from "./studentTrack";
import {
  buildStargazerRejectedCandidateReason,
  buildSyntheticStargazerNegativeEntry,
} from "./trainingAssets";

// ═══ Constants ═══

const EXPANDER_SYSTEM_PROMPT = `あなたはStargazerの質問深化設計者です。
表面的な回答に留まらず、ユーザー自身が気づいていない内面の構造を浮き彫りにする質問を設計します。

深化の原則:
1. depth_score = 内面への踏み込み度。probe_type = 掘る角度。両方指定される
2. 浅い層の質問が「参照文脈」。それを踏まえて深い角度から切り込む
3. 同じ probe_type でも depth が違えば問い方が変わる
   - defense × depth 2: 「自分を守りたくなる場面は？」
   - defense × depth 5: 「守っているつもりで、実は相手を遠ざけていたことは？」
4. 質問はアンケートではなく「観測の入口」
5. 4つの選択肢は判断を含まない中立的な表現にする
6. 選択肢は等間隔にせず、人が実際に感じるグラデーションに合わせる
7. 質問文は30-80文字。選択肢は10-25文字

出力: JSON配列で、各要素は必ず以下の形式にしてください:
{
  "prompt": "質問文（日本語）",
  "options": [
    { "label": "左極寄りの選択肢", "score": -0.7 },
    { "label": "やや左極寄り", "score": -0.2 },
    { "label": "やや右極寄り", "score": 0.3 },
    { "label": "右極寄りの選択肢", "score": 0.7 }
  ]
}

重要:
- キー名は必ず "prompt", "options", "label", "score" を使用してください
- 追加キーは禁止
- reasoning などの自由記述は禁止`;

const DEPTH_MEANING: Record<number, string> = {
  1: "日常の直感的反応レベル",
  2: "理由や動機が見えるレベル",
  3: "形成過程・原体験に触れるレベル",
  4: "条件分岐・文脈依存が見えるレベル",
  5: "無自覚なパターン・矛盾が浮き彫りになるレベル",
  6: "核心の価値観・本音に到達するレベル",
};

// ═══ Key Normalization ═══

/**
 * Normalize AI-generated question keys to the canonical schema.
 * Gemini may use: question/text/質問 instead of prompt,
 *                 choices/answers/選択肢 instead of options, etc.
 */
function normalizeQuestionKeys(raw: Record<string, unknown>): Record<string, unknown> {
  // prompt normalization: prompt > question > text > 質問 > 質問文
  const prompt =
    raw.prompt ??
    raw.question ??
    raw.text ??
    raw["質問"] ??
    raw["質問文"] ??
    raw.content ??
    undefined;

  // options normalization: options > choices > answers > 選択肢
  const options =
    raw.options ??
    raw.choices ??
    raw.answers ??
    raw["選択肢"] ??
    undefined;

  // reasoning normalization
  const reasoning =
    raw.reasoning ??
    raw.reason ??
    raw.explanation ??
    raw["理由"] ??
    raw["解説"] ??
    undefined;

  return { ...raw, prompt, options, reasoning };
}

// ═══ Expansion Prompt Builder ═══

export function buildExpansionPrompt(
  request: QuestionExpansionRequest,
): string {
  const { lens, targetDepth, probeType, axisId, subject, shallowerQuestions, count, existingPrompts } = request;

  const labels = getAxisLabels(axisId);
  if (!labels) {
    throw new Error(`Unknown axis: ${axisId}`);
  }

  // Probe type instruction: use known instructions or freeform
  const knownProbeTypes = Object.keys(PROBE_TYPE_INSTRUCTIONS) as Array<
    keyof typeof PROBE_TYPE_INSTRUCTIONS
  >;
  const probeInstruction = knownProbeTypes.includes(
    probeType as keyof typeof PROBE_TYPE_INSTRUCTIONS,
  )
    ? PROBE_TYPE_INSTRUCTIONS[probeType as keyof typeof PROBE_TYPE_INSTRUCTIONS]
    : `「${probeType}」という独自の角度から内面を掘り下げる`;

  // Shallower questions reference
  const shallowerRef =
    shallowerQuestions.length > 0
      ? shallowerQuestions
          .map(
            (q, i) =>
              `  ${i + 1}. [depth=${q.depth}, probe=${q.probeType}] ${q.prompt}`,
          )
          .join("\n")
      : "  (なし — 初回深化)";

  // Dedup note
  const dedupNote =
    existingPrompts && existingPrompts.length > 0
      ? `\n\n以下の質問は既に存在します。重複しない質問を生成してください:\n${existingPrompts
          .slice(0, 15)
          .map((p) => `- ${p}`)
          .join("\n")}`
      : "";

  const depthMeaning = DEPTH_MEANING[targetDepth] ?? `深度${targetDepth}`;

  return `以下の条件で${count}問の深化質問を生成してください。

【レンズ】${lens.nameJa}: ${lens.description}
【軸】${labels.left} ↔ ${labels.right}
【掘り方】${probeInstruction}
【対象】${subject}
【深度】${targetDepth}/6 — ${depthMeaning}

【浅い質問（参照）】
${shallowerRef}

4つの選択肢のスコア設計:
- 選択肢1: -0.8 〜 -0.5 (強く左極「${labels.left}」寄り)
- 選択肢2: -0.3 〜 -0.1 (やや左極寄り)
- 選択肢3: +0.1 〜 +0.4 (やや右極「${labels.right}」寄り)
- 選択肢4: +0.5 〜 +0.8 (強く右極寄り)
${dedupNote}`;
}

// ═══ Main Expansion Function ═══

/**
 * Generate deeper questions based on shallower reference questions.
 * Uses AI (Gemini) to produce depth-aware, probe-typed questions.
 */
export async function expandQuestions(
  request: QuestionExpansionRequest,
): Promise<{
  questions: GeneratedQuestion[];
  aiRunId: string | null;
  audit: StargazerCandidateAuditEntry[];
}> {
  const userPrompt = buildExpansionPrompt(request);

  const result = await runAI({
    taskType: "stargazer_question_expansion",
    prompt: userPrompt,
    systemPrompt: EXPANDER_SYSTEM_PROMPT,
    jsonSchema: buildGeneratedQuestionArraySchema(request.count),
    requireJson: true,
    temperature: 0.85,
    maxOutputTokens: 4096,
    preferredProvider: "gemini",
    metadata: makeStargazerRunMetadata({
      lensId: request.lens.id,
      axisId: request.axisId,
      subject: request.subject,
      targetDepth: request.targetDepth,
      probeType: request.probeType,
      requestedCount: request.count,
      skipCache: true,
    }),
  });

  if (!result.success) {
    console.error(
      "[questionExpander] AI expansion failed:",
      result.errorMessage,
    );
    return {
      questions: [],
      aiRunId: result.aiRunId,
      audit: [
        buildSyntheticStargazerNegativeEntry({
          entityType: "question",
          rejectionReason: `provider_failure:${result.errorMessage ?? "unknown_error"}`,
          candidateJson: {
            errorMessage: result.errorMessage ?? "unknown_error",
          },
          normalizedOutput: {
            runSuccess: false,
          },
          axisId: request.axisId,
          lensId: request.lens.id,
        }),
      ],
    };
  }

  // Parse response — log raw output structure for debugging
  let parsed: unknown;
  try {
    parsed = parseGeneratedQuestionPayload(result);
  } catch (e) {
    console.error("[questionExpander] Failed to parse AI output:", e);
    return {
      questions: [],
      aiRunId: result.aiRunId,
      audit: [
        buildSyntheticStargazerNegativeEntry({
          entityType: "question",
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
          axisId: request.axisId,
          lensId: request.lens.id,
        }),
      ],
    };
  }

  // Log raw structure for debugging
  if (Array.isArray(parsed) && parsed.length > 0) {
    const sampleKeys = Object.keys(parsed[0] ?? {});
    console.info(
      `[questionExpander] Parsed ${parsed.length} items, sample keys: [${sampleKeys.join(", ")}]`,
    );
  }

  if (!Array.isArray(parsed)) {
    console.error("[questionExpander] Parsed output is not an array:", typeof parsed);
    return {
      questions: [],
      aiRunId: result.aiRunId,
      audit: [
        buildSyntheticStargazerNegativeEntry({
          entityType: "question",
          rejectionReason: "hard_negative:malformed_output",
          candidateJson: {
            rawText: result.text,
            structured: result.structured ?? null,
          },
          normalizedOutput: {
            parsedType: typeof parsed,
            fallbackUsed: result.fallbackUsed,
          },
          axisId: request.axisId,
          lensId: request.lens.id,
        }),
      ],
    };
  }

  // Validate each question (with key normalization)
  const validated: GeneratedQuestion[] = [];
  const audit: StargazerCandidateAuditEntry[] = [];
  parsed.forEach((raw, candidateIndex) => {
    const rawRecord =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    const normalized = normalizeQuestionKeys(rawRecord);
    const q: GeneratedQuestion = {
      prompt: String(normalized.prompt ?? ""),
      options: Array.isArray(normalized.options)
        ? (normalized.options as Record<string, unknown>[]).map((o) => ({
            label: String(o.label ?? o.text ?? ""),
            score: Number(o.score ?? o.value ?? 0),
          }))
        : [],
      reasoning: normalized.reasoning != null ? String(normalized.reasoning) : undefined,
    };

    const validation = validateGeneratedQuestion(q, request.axisId);
    if (validation.valid) {
      validated.push(q);
      audit.push({
        entityType: "question",
        candidateIndex,
        candidateJson: rawRecord,
        normalizedOutput: {
          prompt: q.prompt,
          options: q.options,
          reasoning: q.reasoning ?? null,
        },
        accepted: true,
        axisId: request.axisId,
        lensId: request.lens.id,
      });
    } else {
      console.warn(
        `[questionExpander] Rejected question: ${validation.reason}`,
        q.prompt?.slice(0, 40),
      );
      audit.push({
        entityType: "question",
        candidateIndex,
        candidateJson: rawRecord,
        normalizedOutput: {
          prompt: q.prompt,
          options: q.options,
          reasoning: q.reasoning ?? null,
        },
        accepted: false,
        rejectionReason: buildStargazerRejectedCandidateReason(
          validation.reason ?? "validation_failed",
        ),
        axisId: request.axisId,
        lensId: request.lens.id,
      });
    }
  });

  if (validated.length === 0 && parsed.length > 0) {
    console.error(
      "[questionExpander] All questions rejected. Raw sample:",
      JSON.stringify(parsed[0]).slice(0, 300),
    );
    audit.push(
      buildSyntheticStargazerNegativeEntry({
        entityType: "question",
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
        axisId: request.axisId,
        lensId: request.lens.id,
      }),
    );
  }

  if (result.fallbackUsed) {
    audit.push(
      buildSyntheticStargazerNegativeEntry({
        entityType: "question",
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
        axisId: request.axisId,
        lensId: request.lens.id,
      }),
    );
  }

  return {
    questions: validated,
    aiRunId: result.aiRunId,
    audit,
  };
}

// ═══ UX Hint Generator ═══

/**
 * Generate a UX hint based on depth_score.
 * Deeper questions get gentler framing to reduce skip rate.
 */
export function generateUxHint(depthScore: number): string | undefined {
  if (depthScore >= 5) {
    return "答えにくければスキップしてOKです";
  }
  if (depthScore >= 3) {
    return "少し深い角度から聞いてみます";
  }
  return undefined;
}

// ═══ Convert to DB Insert (expanded pool) ═══

/**
 * Convert a GeneratedQuestion from expansion into the DB row format
 * for the stargazer_question_pool table.
 */
export function toExpandedPoolInsert(
  generated: GeneratedQuestion,
  request: QuestionExpansionRequest,
  questionKey: string,
  batchId: string,
  aiRunId?: string | null,
): Record<string, unknown> {
  const observationLayer: ObservationLayer =
    request.subject === "self" ? "state" : "context_bound";

  const parentQuestionKeys = request.shallowerQuestions.map(
    (sq) => `${sq.probeType}_d${sq.depth}`,
  );

  const contextSnapshot: ContextSnapshot = {
    generatedAt: new Date().toISOString(),
    generationBatchId: batchId,
    parentAnswers: request.shallowerQuestions.map((sq) => ({
      questionKey: `${sq.probeType}_d${sq.depth}`,
      prompt: sq.prompt,
      chosenOptionLabel: "",
      score: 0,
      probeType: sq.probeType,
      depthScore: sq.depth,
    })),
    lensContext: {
      lensId: request.lens.id,
      lensNameJa: request.lens.nameJa,
      relatedAxes: request.lens.relatedAxes,
    },
  };

  const variant = {
    id: questionKey,
    axisId: request.axisId,
    prompt: generated.prompt,
    options: generated.options.map((opt, i) => ({
      id: String.fromCharCode(97 + i), // a, b, c, d
      label: opt.label,
      score: Math.round(opt.score * 1000) / 1000,
    })),
    layer: observationLayer,
    ...(request.subject !== "self" ? { context: request.subject } : {}),
  };

  return {
    question_key: questionKey,
    variant_json: variant,
    axis_id: request.axisId,
    observation_layer: observationLayer,
    subject: request.subject,
    source: "ai_expand",
    generation_batch_id: batchId,
    ai_run_id: aiRunId ?? null,
    quality_score: 0.5,
    question_status: "active",
    // Growth Engine fields
    primary_lens_id: request.lens.id,
    secondary_lens_ids: [],
    depth_score: request.targetDepth,
    probe_type: request.probeType,
    parent_question_keys: parentQuestionKeys,
    context_snapshot: contextSnapshot,
    ux_hint: generateUxHint(request.targetDepth),
  };
}
