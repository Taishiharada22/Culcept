import "server-only";

// lib/stargazer/questionGenerator.ts
// AI質問生成エンジン — Gemini経由で観測質問を動的生成

import { runAI } from "@/lib/ai";
import { parseStructuredJsonWithRecovery } from "@/lib/ai/structuredJson";
import type { AIRunResult } from "@/lib/ai/types";
import { TRAIT_AXES, getAxisLabels, type TraitAxisKey } from "./traitAxes";
import type {
  QuestionGenerationRequest,
  GeneratedQuestion,
  SubjectContext,
  EnergyTarget,
  PhrasingStyle,
  ObservationAngle,
} from "./questionPoolTypes";
import {
  SUBJECT_LABELS,
  ENERGY_LABELS,
  PHRASING_INSTRUCTIONS,
  ANGLE_INSTRUCTIONS,
} from "./questionPoolTypes";
import type { QuestionVariant, ObservationLayer } from "./questionVariants";
import {
  makeStargazerRunMetadata,
  type StargazerCandidateAuditEntry,
} from "./studentTrack";
import {
  buildStargazerRejectedCandidateReason,
  buildSyntheticStargazerNegativeEntry,
} from "./trainingAssets";

// ═══ System Prompt ═══

const SYSTEM_PROMPT = `あなたは深層観測システムの質問設計者です。
人の性格・内面傾向を「点」ではなく「生きた分布」として理解するために、
多角的な質問を日本語で生成します。

質問設計の原則:
1. 回答＝アンケートではなく「観測の入口」。占いや性格診断ではなく、行動と判断の観測である
2. 同じ軸を様々な角度・文脈・表現で繰り返し問うことで、揺らぎの全体像を掴む
3. ユーザーが「自分って、そういう人間だったのか」と気づく質問が最高
4. 日常の具体的場面を使い、抽象的な自己申告を避ける。高校生〜40代の日本人が共感できるリアルな場面設定
5. 4つの選択肢は判断を含まない中立的な表現にする（良い/悪いの価値判断を入れない）
6. 選択肢は等間隔にせず、人が実際に感じるグラデーションに合わせる
7. 質問文は30-80文字程度。長すぎず、短すぎず
8. 選択肢テキストは10-25文字程度
9. ポエティックすぎない。地に足のついた具体的な表現を使う
10. 「あなたのタイプは?」「どちらに近いですか?」のような診断テスト的な問い方は禁止。場面を描写して行動・判断を問う

出力: JSON配列で、各要素は:
{
  "prompt": "質問文",
  "options": [
    { "label": "左極寄りの選択肢", "score": (例: -0.7) },
    { "label": "やや左極寄り", "score": (例: -0.2) },
    { "label": "やや右極寄り", "score": (例: 0.3) },
    { "label": "右極寄りの選択肢", "score": (例: 0.7) }
  ]
}

重要:
- JSON配列のみを返す
- 配列本体以外の前置き・後書き・コードフェンスは禁止
- 追加キーは禁止
- 各要素は "prompt" と "options" のみを持つ
- 各文字列値は1行のプレーンテキストにする
- 文字列値の中に改行、タブ、バッククォート、ASCIIダブルクォートを入れない
- options は必ず4件`;

const GENERATED_OPTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["label", "score"],
  properties: {
    label: { type: "string", minLength: 1, maxLength: 32 },
    score: { type: "number", minimum: -1, maximum: 1 },
  },
} satisfies Record<string, unknown>;

export const GENERATED_QUESTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["prompt", "options"],
  properties: {
    prompt: { type: "string", minLength: 10, maxLength: 150 },
    options: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: GENERATED_OPTION_JSON_SCHEMA,
    },
  },
} satisfies Record<string, unknown>;

export function buildGeneratedQuestionSchema(): Record<string, unknown> {
  return GENERATED_QUESTION_JSON_SCHEMA;
}

export function buildGeneratedQuestionArraySchema(count: number): Record<string, unknown> {
  const exactCount = Math.max(1, Math.trunc(count));
  return {
    type: "array",
    minItems: exactCount,
    maxItems: exactCount,
    items: GENERATED_QUESTION_JSON_SCHEMA,
  };
}

// ═══ User Prompt Builder ═══

function buildUserPrompt(req: QuestionGenerationRequest): string {
  const axisDef = TRAIT_AXES.find((a) => a.id === req.axisId);
  const labels = getAxisLabels(req.axisId);

  if (!axisDef || !labels) {
    throw new Error(`Unknown axis: ${req.axisId}`);
  }

  const existingNote =
    req.existingPrompts && req.existingPrompts.length > 0
      ? `\n\n以下の質問は既に存在します。これらと重複しない、異なる切り口の質問を生成してください:\n${req.existingPrompts
          .slice(0, 10)
          .map((p) => `- ${p}`)
          .join("\n")}`
      : "";

  return `以下の条件で${req.count}問の観測質問を生成してください。

【観測軸】${req.axisId}
  左極 (score < 0): ${labels.left}
  右極 (score > 0): ${labels.right}
  カテゴリ: ${axisDef.category}

【対象の関係性】${SUBJECT_LABELS[req.subject]}
【想定エネルギー状態】${ENERGY_LABELS[req.energyTarget]}
【表現スタイル】${PHRASING_INSTRUCTIONS[req.phrasingStyle]}
【観測の角度】${ANGLE_INSTRUCTIONS[req.angle]}

4つの選択肢のスコア設計:
- 選択肢1: -0.8 〜 -0.5 (強く左極「${labels.left}」寄り)
- 選択肢2: -0.3 〜 -0.1 (やや左極寄り)
- 選択肢3: +0.1 〜 +0.4 (やや右極「${labels.right}」寄り)
- 選択肢4: +0.5 〜 +0.8 (強く右極寄り)
${existingNote}

出力制約:
- JSON配列のみを返す
- コードフェンス・説明文・補足文は禁止
- 各要素は prompt と options のみ
- prompt と各 label は1行のプレーンテキストのみ
- prompt と各 label に改行、タブ、バッククォート、ASCIIダブルクォートを入れない`;
}

// ═══ Key Normalization ═══

/**
 * Normalize AI-generated question keys to the canonical schema.
 * Gemini may use: question/text/質問 instead of prompt,
 *                 choices/answers/選択肢 instead of options, etc.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function resolveQuestionText(raw: Record<string, unknown>): unknown {
  const questionRecord = isRecord(raw.question) ? raw.question : null;
  const payloadRecord = isRecord(raw.payload) ? raw.payload : null;
  const dataRecord = isRecord(raw.data) ? raw.data : null;
  const resultRecord = isRecord(raw.result) ? raw.result : null;
  return (
    raw.prompt ??
    raw.promptText ??
    raw.questionText ??
    raw.stem ??
    raw.title ??
    raw.text ??
    raw["質問"] ??
    raw["質問文"] ??
    raw.content ??
    questionRecord?.prompt ??
    questionRecord?.promptText ??
    questionRecord?.questionText ??
    questionRecord?.text ??
    questionRecord?.title ??
    questionRecord?.content ??
    payloadRecord?.prompt ??
    payloadRecord?.text ??
    dataRecord?.prompt ??
    dataRecord?.text ??
    resultRecord?.prompt ??
    resultRecord?.text ??
    undefined
  );
}

function resolveQuestionOptions(raw: Record<string, unknown>): unknown {
  const questionRecord = isRecord(raw.question) ? raw.question : null;
  const payloadRecord = isRecord(raw.payload) ? raw.payload : null;
  const dataRecord = isRecord(raw.data) ? raw.data : null;
  const resultRecord = isRecord(raw.result) ? raw.result : null;
  return (
    raw.options ??
    raw.choices ??
    raw.answers ??
    raw["選択肢"] ??
    questionRecord?.options ??
    questionRecord?.choices ??
    questionRecord?.answers ??
    payloadRecord?.options ??
    payloadRecord?.choices ??
    dataRecord?.options ??
    dataRecord?.choices ??
    resultRecord?.options ??
    resultRecord?.choices ??
    undefined
  );
}

function resolveQuestionReasoning(raw: Record<string, unknown>): unknown {
  const questionRecord = isRecord(raw.question) ? raw.question : null;
  return (
    raw.reasoning ??
    raw.reason ??
    raw.explanation ??
    raw.rationale ??
    raw["理由"] ??
    raw["解説"] ??
    questionRecord?.reasoning ??
    questionRecord?.reason ??
    questionRecord?.explanation ??
    questionRecord?.rationale ??
    undefined
  );
}

function isOptionLikeRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value.label === "string" && value.score != null;
}

function looksLikeOptionArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every((item) => isOptionLikeRecord(item));
}

function normalizeInlineText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[`\"]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return normalized.slice(0, maxLength);
}

function normalizeGeneratedOptions(value: unknown): GeneratedQuestion["options"] {
  if (!Array.isArray(value)) return [];
  return value.map((option) => {
    const record = isRecord(option) ? option : {};
    return {
      label: normalizeInlineText(record.label ?? record.text ?? "", 32),
      score: Number(record.score ?? record.value ?? 0),
    };
  });
}

function extractQuestionArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) {
    return looksLikeOptionArray(value) ? null : value;
  }
  if (!isRecord(value)) return null;

  const directArrayKeys = ["questions", "items", "candidates", "results", "data"];
  for (const key of directArrayKeys) {
    if (Array.isArray(value[key]) && !looksLikeOptionArray(value[key])) {
      return value[key] as unknown[];
    }
  }

  if (resolveQuestionText(value) != null || resolveQuestionOptions(value) != null) {
    return [value];
  }

  const nestedQuestion = isRecord(value.question) ? value.question : null;
  if (nestedQuestion) {
    return [nestedQuestion];
  }

  const fallbackArrayKey = Object.keys(value).find((key) => {
    const candidate = value[key];
    return Array.isArray(candidate) && !looksLikeOptionArray(candidate);
  });
  if (fallbackArrayKey) {
    return value[fallbackArrayKey] as unknown[];
  }

  return null;
}

export function parseGeneratedQuestionPayload(args: Pick<AIRunResult, "structured" | "text">): unknown[] {
  const structuredArray = extractQuestionArray(args.structured);
  if (structuredArray) return structuredArray;

  const parsedText = parseStructuredJsonWithRecovery(args.text);
  const textArray = extractQuestionArray(parsedText);
  if (textArray) return textArray;

  throw new Error("parsed_output_is_not_question_array");
}

function normalizeQuestionKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const prompt = resolveQuestionText(raw);
  const options = resolveQuestionOptions(raw);
  const reasoning = resolveQuestionReasoning(raw);
  return { ...raw, prompt, options, reasoning };
}

export function coerceGeneratedQuestion(raw: unknown): GeneratedQuestion {
  const rawRecord =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const normalized = normalizeQuestionKeys(rawRecord);
  const reasoning = normalizeInlineText(normalized.reasoning ?? "", 240);

  return {
    prompt: normalizeInlineText(normalized.prompt ?? "", 150),
    options: normalizeGeneratedOptions(normalized.options),
    reasoning: reasoning || undefined,
  };
}

// ═══ Validation ═══

export function validateGeneratedQuestion(
  q: GeneratedQuestion,
  _axisId: TraitAxisKey,
): { valid: boolean; reason?: string } {
  if (!q.prompt || typeof q.prompt !== "string") {
    return { valid: false, reason: "prompt is missing or not a string" };
  }
  if (q.prompt.length < 10 || q.prompt.length > 150) {
    return {
      valid: false,
      reason: `prompt length ${q.prompt.length} out of range [10, 150]`,
    };
  }

  if (!Array.isArray(q.options) || q.options.length !== 4) {
    return { valid: false, reason: `expected 4 options, got ${q.options?.length}` };
  }

  for (let i = 0; i < q.options.length; i++) {
    const opt = q.options[i];
    if (!opt.label || typeof opt.label !== "string") {
      return { valid: false, reason: `option[${i}].label is invalid` };
    }
    if (typeof opt.score !== "number" || opt.score < -1 || opt.score > 1) {
      return {
        valid: false,
        reason: `option[${i}].score ${opt.score} out of range [-1, 1]`,
      };
    }
  }

  // Check score ordering: should generally go from negative to positive
  const scores = q.options.map((o) => o.score);
  const hasNegative = scores.some((s) => s < 0);
  const hasPositive = scores.some((s) => s > 0);
  if (!hasNegative || !hasPositive) {
    return {
      valid: false,
      reason: "scores must span both negative and positive values",
    };
  }

  return { valid: true };
}

// ═══ Key Builder ═══

let _keyCounter = 0;

export function buildQuestionKey(
  axisId: TraitAxisKey,
  subject: SubjectContext,
  phrasingStyle: PhrasingStyle,
  index: number,
): string {
  _keyCounter++;
  const ts = Date.now().toString(36);
  return `pool_${axisId}_${subject}_${phrasingStyle}_${ts}_${index}`;
}

// ═══ Convert to DB Insert ═══

export function toPoolInsert(
  generated: GeneratedQuestion,
  request: QuestionGenerationRequest,
  questionKey: string,
  batchId: string,
  aiRunId?: string | null,
): Record<string, unknown> {
  const layer: ObservationLayer =
    request.subject === "self" ? "state" : "context_bound";

  // Pool質問のcontextは既存ProbeContextに限定しない
  // variant_jsonとしてJSONB保存するため、型は柔軟に扱う
  const variant = {
    id: questionKey,
    axisId: request.axisId,
    prompt: generated.prompt,
    options: generated.options.map((opt, i) => ({
      id: String.fromCharCode(97 + i), // a, b, c, d
      label: opt.label,
      score: Math.round(opt.score * 1000) / 1000,
    })),
    layer,
    ...(request.subject !== "self" ? { context: request.subject } : {}),
  } satisfies Omit<QuestionVariant, "context"> & { context?: string };

  return {
    question_key: questionKey,
    variant_json: variant,
    axis_id: request.axisId,
    observation_layer: layer,
    subject: request.subject,
    energy_target: request.energyTarget,
    phrasing_style: request.phrasingStyle,
    angle: request.angle,
    source: "ai",
    generation_batch_id: batchId,
    ai_run_id: aiRunId ?? null,
    quality_score: 0.5,
    primary_lens_id: request.lensId ?? null,
    secondary_lens_ids: request.secondaryLensIds ?? [],
    depth_score: request.depthScore ?? 1,
    probe_type: request.probeType ?? "surface",
    parent_question_keys: request.parentPrompts?.map(p => p.prompt.slice(0, 20)) ?? [],
    context_snapshot: null,
    ux_hint: null,
    question_status: "active",
    quality_metrics: {},
  };
}

// ═══ Main Generation Function ═══

/**
 * Generate questions for a specific dimension combination using AI (Gemini).
 * Returns validated GeneratedQuestion[] ready for DB insertion.
 */
export async function generateQuestions(
  request: QuestionGenerationRequest,
): Promise<{
  questions: GeneratedQuestion[];
  aiRunId: string | null;
  rawText: string;
  audit: StargazerCandidateAuditEntry[];
}> {
  const userPrompt = buildUserPrompt(request);

  const result = await runAI({
    taskType: "stargazer_question_generation",
    prompt: userPrompt,
    systemPrompt: SYSTEM_PROMPT,
    jsonSchema: buildGeneratedQuestionArraySchema(request.count),
    requireJson: true,
    temperature: 0.8,
    maxOutputTokens: 4096,
    preferredProvider: "gemini",
    metadata: makeStargazerRunMetadata({
      axisId: request.axisId,
      subject: request.subject,
      energyTarget: request.energyTarget,
      phrasingStyle: request.phrasingStyle,
      angle: request.angle,
      requestedCount: request.count,
      skipCache: true,
    }),
  });

  if (!result.success) {
    console.error("[questionGenerator] AI generation failed:", result.errorMessage);
    return {
      questions: [],
      aiRunId: result.aiRunId,
      rawText: "",
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
          lensId: request.lensId ?? null,
        }),
      ],
    };
  }

  // Parse response
  let parsed: unknown;
  try {
    parsed = parseGeneratedQuestionPayload(result);
  } catch (e) {
    console.error("[questionGenerator] Failed to parse AI output:", e);
    return {
      questions: [],
      aiRunId: result.aiRunId,
      rawText: result.text,
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
          lensId: request.lensId ?? null,
        }),
      ],
    };
  }

  if (!Array.isArray(parsed)) {
    console.error("[questionGenerator] Parsed output is not an array");
    return {
      questions: [],
      aiRunId: result.aiRunId,
      rawText: result.text,
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
          lensId: request.lensId ?? null,
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
    const q = coerceGeneratedQuestion(rawRecord);

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
        lensId: request.lensId ?? null,
      });
    } else {
      console.warn(
        `[questionGenerator] Rejected question: ${validation.reason}`,
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
        lensId: request.lensId ?? null,
      });
    }
  });

  if (validated.length === 0 && parsed.length > 0) {
    console.error(
      "[questionGenerator] All questions rejected. Raw sample:",
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
        lensId: request.lensId ?? null,
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
        lensId: request.lensId ?? null,
      }),
    );
  }

  return {
    questions: validated,
    aiRunId: result.aiRunId,
    rawText: result.text,
    audit,
  };
}
