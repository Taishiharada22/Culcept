import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAI } from "@/lib/ai";
import { parseStructuredJsonWithRecovery } from "@/lib/ai/structuredJson";
import type {
  OrbiterContext,
  OrbiterIntelligence,
  OrbiterMemoryState,
  OrbiterMemo,
  StoredDigest,
} from "./types";
import { makeOrbiterRunMetadata } from "./studentTrack";

export type OrbiterMemorySummaryRecord = {
  summary: string;
  salientMemories: string[];
  workingHypothesis: string | null;
  nextObservation: string | null;
  confidence: number;
};

type RefreshOrbiterMemorySummaryArgs = {
  supabase: SupabaseClient;
  userId: string;
  candidateId: string;
  memoryState: OrbiterMemoryState;
  newMemos?: Omit<OrbiterMemo, "id" | "userId" | "candidateId" | "createdAt">[];
  orbiterContext: OrbiterContext;
  orbiterIntelligence: OrbiterIntelligence;
  currentDigest?: StoredDigest | null;
  sessionId?: string | null;
  persistSummary?: boolean;
  runMetadata?: Record<string, unknown>;
};

const SUMMARY_RESPONSE_KEYS = [
  "summary",
  "salientMemories",
  "workingHypothesis",
  "nextObservation",
  "confidence",
] as const;

const SYSTEM_PROMPT = `あなたはOrbiterの記憶要約担当です。
観測情報を短く整理し、この候補者についての現在理解を1件のJSONだけで返してください。

必須キー:
- summary
- salientMemories
- workingHypothesis
- nextObservation
- confidence

ルール:
- JSON以外を出さない
- markdown, 説明文, コードフェンスは禁止
- 追加キーは禁止
- summary は日本語で40-220文字程度
- salientMemories は1-4件の短い文
- workingHypothesis と nextObservation は無ければ null
- confidence は 0 から 1 の数値`;

const SUMMARY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "salientMemories",
    "workingHypothesis",
    "nextObservation",
    "confidence",
  ],
  properties: {
    summary: { type: "string" },
    salientMemories: {
      type: "array",
      items: { type: "string" },
    },
    workingHypothesis: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    nextObservation: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    confidence: { type: "number" },
  },
} satisfies Record<string, unknown>;

export const ORBITER_MEMORY_SUMMARY_JSON_SCHEMA = SUMMARY_JSON_SCHEMA;

function tryParseJsonText(text: string): unknown {
  return parseStructuredJsonWithRecovery(text);
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeText(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 4);
}

function normalizeConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.5;
  return Math.max(0, Math.min(1, parsed));
}

export function validateOrbiterMemorySummary(
  value: unknown,
): OrbiterMemorySummaryRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const summary = normalizeText(record.summary);
  const salientMemories = normalizeStringList(record.salientMemories);
  const workingHypothesis = normalizeText(record.workingHypothesis);
  const nextObservation = normalizeText(record.nextObservation);
  const confidence = normalizeConfidence(record.confidence);

  if (!summary || summary.length < 40 || summary.length > 260) {
    return null;
  }
  if (salientMemories.length === 0) {
    return null;
  }

  return {
    summary,
    salientMemories,
    workingHypothesis,
    nextObservation,
    confidence,
  };
}

function toPromptMemoRecord(
  memo:
    | OrbiterMemo
    | Omit<OrbiterMemo, "id" | "userId" | "candidateId" | "createdAt">,
): Record<string, unknown> {
  return {
    type: memo.memoType,
    content: memo.content,
    confidence: Number(memo.confidence.toFixed(2)),
  };
}

function buildPrompt(args: RefreshOrbiterMemorySummaryArgs): string {
  const latestMemos = args.memoryState.memos.slice(0, 8);
  const newMemos = (args.newMemos ?? []).slice(0, 4);
  const digestSections =
    args.currentDigest?.sections?.slice(0, 3).map((section) => ({
      title: section.title,
      content: section.content,
    })) ?? [];
  const currentHypothesis = args.memoryState.latestHypothesis?.content ?? null;
  const hypothesis = currentHypothesis
    ? currentHypothesis
    : args.orbiterIntelligence.memoryDigest?.hasHypothesis
      ? "仮説あり"
      : "仮説なし";
  const context = {
    candidateId: args.candidateId,
    visitCount: args.orbiterContext.visitCount,
    candidateState: args.orbiterContext.candidateState,
    hasReflection: args.orbiterContext.hasReflection,
    time: {
      daysSinceDelivery: args.orbiterContext.daysSinceDelivery,
      daysUntilExpiry: args.orbiterContext.daysUntilExpiry ?? null,
      hoursSinceLastVisit: args.orbiterContext.hoursSinceLastVisit ?? null,
    },
    orbiter: {
      headline: args.orbiterIntelligence.headline.message,
      trajectory: args.orbiterIntelligence.trajectoryForecast?.typeLabel ?? null,
      nextMove: args.orbiterIntelligence.nextMove?.suggestion ?? null,
      memoryDigest: {
        hasHypothesis:
          args.orbiterIntelligence.memoryDigest?.hasHypothesis ?? false,
        revisionCount:
          args.orbiterIntelligence.memoryDigest?.revisionCount ?? 0,
        latestMilestone:
          args.orbiterIntelligence.memoryDigest?.latestMilestone ?? null,
      },
      currentHypothesis: hypothesis,
    },
    digest: args.currentDigest
      ? {
          essence: args.currentDigest.essence,
          sections: digestSections,
        }
      : null,
    latestMemos: latestMemos.map(toPromptMemoRecord),
    newMemosThisVisit: newMemos.map(toPromptMemoRecord),
  };

  return [
    "以下のJSON context を読み、候補者ごとの記憶要約を1件だけ返してください。",
    `出力キーは ${SUMMARY_RESPONSE_KEYS.join(", ")} のみです。`,
    "JSONオブジェクト1つだけを返してください。",
    "",
    "context_json:",
    JSON.stringify(context, null, 2),
  ].join("\n");
}

function parseSummaryCandidate(args: {
  structured: unknown;
  text: string;
}): OrbiterMemorySummaryRecord | null {
  const structuredSummary = validateOrbiterMemorySummary(args.structured);
  if (structuredSummary) return structuredSummary;

  try {
    const parsedText = tryParseJsonText(args.text);
    return validateOrbiterMemorySummary(parsedText);
  } catch {
    return null;
  }
}

async function upsertOrbiterMemorySummary(args: {
  supabase: SupabaseClient;
  userId: string;
  candidateId: string;
  aiRunId: string | null;
  summary: OrbiterMemorySummaryRecord;
  promptText: string;
  sourceMemoCount: number;
  sourceNewMemoCount: number;
  digestEssence?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await args.supabase
    .from("orbiter_memory_summaries")
    .upsert(
      {
        user_id: args.userId,
        candidate_id: args.candidateId,
        ai_run_id: args.aiRunId,
        summary_text: args.summary.summary,
        summary_json: args.summary,
        source_memo_count: args.sourceMemoCount,
        source_new_memo_count: args.sourceNewMemoCount,
        quality_metrics: {
          salientMemoryCount: args.summary.salientMemories.length,
          hasWorkingHypothesis: Boolean(args.summary.workingHypothesis),
          hasNextObservation: Boolean(args.summary.nextObservation),
          confidence: args.summary.confidence,
          digestEssence: args.digestEssence ?? null,
          promptLength: args.promptText.length,
        },
        updated_at: now,
      },
      { onConflict: "user_id,candidate_id" },
    );

  if (error) {
    console.warn(
      "[orbiter/memorySummary] failed to upsert summary:",
      error.message,
    );
  }
}

export async function refreshOrbiterMemorySummary(
  args: RefreshOrbiterMemorySummaryArgs,
): Promise<{
  ok: boolean;
  stored: boolean;
  aiRunId: string | null;
  summary: OrbiterMemorySummaryRecord | null;
  reason?: string;
}> {
  const shouldPersistSummary = args.persistSummary !== false;
  const summaryRequestId = randomUUID();
  const prompt = buildPrompt(args);
  const strictRecoveryPrompt = `${prompt}\n\nImportant recovery note: your previous output was malformed. Return strictly valid JSON only. Use double-quoted keys and strings, no trailing commas, and no markdown fences.`;
  const rawFallbackPrompt = `${prompt}\n\nFallback note: return only one JSON object with the required keys. Do not use markdown fences.`;
  const attemptSpecs = [
    {
      mode: "strict",
      prompt,
      requireJson: true,
      jsonSchema: SUMMARY_JSON_SCHEMA,
      promptVariant: "strict_base_prompt",
      schemaVariant: "json_schema_enforced_v1",
    },
    {
      mode: "strict_retry",
      prompt: strictRecoveryPrompt,
      requireJson: true,
      jsonSchema: SUMMARY_JSON_SCHEMA,
      promptVariant: "strict_retry_prompt",
      schemaVariant: "json_schema_enforced_v1",
    },
    {
      mode: "raw_fallback",
      prompt: rawFallbackPrompt,
      requireJson: false,
      jsonSchema: undefined,
      promptVariant: "raw_fallback_prompt",
      schemaVariant: "raw_json_recovery",
    },
  ] as const;

  let lastAiRunId: string | null = null;
  let lastReason = "provider_failed";

  for (const [index, attempt] of attemptSpecs.entries()) {
    const baseMetadata = {
      ...(args.runMetadata ?? {}),
      candidateId: args.candidateId,
      visitCount: args.orbiterContext.visitCount,
      memoCount: args.memoryState.memos.length,
      newMemoCount: (args.newMemos ?? []).length,
      hasDigest: Boolean(args.currentDigest),
      persistSummary: shouldPersistSummary,
      skipCache: true,
      summaryRequestId,
      summaryAttempt: attempt.mode,
      summaryAttemptIndex: index + 1,
      summaryPromptVariant: attempt.promptVariant,
      summarySchemaVariant: attempt.schemaVariant,
    } satisfies Record<string, unknown>;

    const result = await runAI({
      taskType: "orbiter_memory_summary",
      prompt: attempt.prompt,
      systemPrompt: SYSTEM_PROMPT,
      jsonSchema: attempt.jsonSchema,
      requireJson: attempt.requireJson,
      temperature: 0.4,
      maxOutputTokens: 1024,
      preferredProvider: "gemini",
      allowFallback: false,
      userId: args.userId,
      sessionId: args.sessionId ?? undefined,
      metadata: makeOrbiterRunMetadata(baseMetadata),
    });

    lastAiRunId = result.aiRunId;

    if (!result.success) {
      lastReason = result.errorMessage ?? "provider_failed";
      continue;
    }

    const summary = parseSummaryCandidate({
      structured: result.structured,
      text: result.text,
    });
    if (!summary) {
      lastReason = "invalid_summary_payload";
      continue;
    }

    if (shouldPersistSummary) {
      await upsertOrbiterMemorySummary({
        supabase: args.supabase,
        userId: args.userId,
        candidateId: args.candidateId,
        aiRunId: result.aiRunId,
        summary,
        promptText: attempt.prompt,
        sourceMemoCount: args.memoryState.memos.length,
        sourceNewMemoCount: (args.newMemos ?? []).length,
        digestEssence: args.currentDigest?.essence ?? null,
      });
    }

    return {
      ok: true,
      stored: shouldPersistSummary,
      aiRunId: result.aiRunId,
      summary,
    };
  }

  return {
    ok: false,
    stored: false,
    aiRunId: lastAiRunId,
    summary: null,
    reason: lastReason,
  };
}
