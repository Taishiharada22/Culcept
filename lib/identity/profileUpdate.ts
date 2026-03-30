import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAI } from "@/lib/ai";
import { getAIServiceClient } from "@/lib/ai/db";
import {
  parseStructuredJsonWithRecovery,
  stripMarkdownCodeFence,
} from "@/lib/ai/structuredJson";
import { loadPreviousDigest } from "@/lib/orbiter/existentialDigest";
import { makeIdentityRunMetadata } from "./studentTrack";

export type IdentityStableTrait = {
  key: string;
  label: string;
  confidence: number;
  evidenceRefs: string[];
};

export type IdentityHypothesis = {
  key: string;
  statement: string;
  confidence: number;
};

export type IdentityContradiction = {
  key: string;
  severity: number;
};

export type IdentityProfileRecord = {
  stableTraits: IdentityStableTrait[];
  volatileState: Record<string, { value: string; confidence: number }>;
  relationalStyle: {
    pace: string | null;
    distanceNeed: string | null;
    confidence: number;
  };
  decisionStyle: {
    mode: string | null;
    confidence: number;
  };
  activeHypotheses: IdentityHypothesis[];
  openQuestions: string[];
  changedSinceLast: string[];
  contradictions: IdentityContradiction[];
  consumerReadiness: {
    stargazer: boolean;
    orbiter: boolean;
    recommendations: boolean;
  };
};

export type IdentitySnapshotRow = {
  id: string;
  userId: string;
  aiRunId: string | null;
  version: number;
  profile: IdentityProfileRecord;
  profileText: string;
  previousSnapshotId: string | null;
  sourceSummary: Record<string, unknown>;
  contradictionScore: number;
  confidence: number;
  createdAt: string;
  updatedAt: string;
};

export type IdentitySourceContext = {
  stargazer: Record<string, unknown>;
  orbiter: Record<string, unknown>;
  behavior: Record<string, unknown>;
};

type RefreshIdentityProfileArgs = {
  client?: SupabaseClient | null;
  userId: string;
  sessionId?: string | null;
  trigger?: string;
  sourceWindowHours?: number;
  persistSnapshot?: boolean;
  runMetadata?: Record<string, unknown>;
};

const SYSTEM_PROMPT = `あなたは統括AIの内部プロフィール更新担当です。
Stargazer・Orbiter・行動ログから、ユーザーの長期理解を1件のJSONだけで更新してください。

必須キー:
- stableTraits
- relationalStyle
- decisionStyle
- activeHypotheses
- consumerReadiness

ルール:
- JSON以外を出さない
- markdown, 説明文, コードフェンスは禁止
- unsupported claim を書かない
- stableTraits には evidenceRefs を必ず入れる
- stableTraits の各要素は key, label, confidence, evidenceRefs を使う
- activeHypotheses の各要素は key, statement, confidence を使う
- contradictions の各要素は key, severity を使う
- changedSinceLast は previous snapshot が無ければ空配列でよい
- consumerReadiness は現時点で参照可能なら true、まだ素材不足なら false
- 日本語で簡潔に書く
- activeHypotheses は仮説だけを書く
- contradictions は矛盾が無ければ空配列でよい
- stableTraits は最大2件
- evidenceRefs は各 trait につき最大2件
- activeHypotheses は最大1件
- openQuestions は最大2件
- contradictions は最大2件
- label は短く、statement も短く保つ
- optional な項目は空配列または空オブジェクトでよい
- 全体をできるだけ短く保ち、冗長な説明を書かない`;

export const IDENTITY_PROFILE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "stableTraits",
    "relationalStyle",
    "decisionStyle",
    "activeHypotheses",
    "consumerReadiness",
  ],
  properties: {
    stableTraits: {
      type: "array",
      maxItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "label", "confidence", "evidenceRefs"],
        properties: {
          key: { type: "string" },
          label: { type: "string", maxLength: 32 },
          confidence: { type: "number" },
          evidenceRefs: {
            type: "array",
            maxItems: 2,
            items: { type: "string" },
          },
        },
      },
    },
    volatileState: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: ["value", "confidence"],
        properties: {
          value: { type: "string" },
          confidence: { type: "number" },
        },
      },
    },
    relationalStyle: {
      type: "object",
      additionalProperties: false,
      required: ["pace", "distanceNeed", "confidence"],
      properties: {
        pace: { anyOf: [{ type: "string" }, { type: "null" }] },
        distanceNeed: { anyOf: [{ type: "string" }, { type: "null" }] },
        confidence: { type: "number" },
      },
    },
    decisionStyle: {
      type: "object",
      additionalProperties: false,
      required: ["mode", "confidence"],
      properties: {
        mode: { anyOf: [{ type: "string" }, { type: "null" }] },
        confidence: { type: "number" },
      },
    },
    activeHypotheses: {
      type: "array",
      maxItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "statement", "confidence"],
        properties: {
          key: { type: "string" },
          statement: { type: "string", maxLength: 72 },
          confidence: { type: "number" },
        },
      },
    },
    openQuestions: {
      type: "array",
      maxItems: 2,
      items: { type: "string" },
    },
    changedSinceLast: {
      type: "array",
      maxItems: 2,
      items: { type: "string" },
    },
    contradictions: {
      type: "array",
      maxItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "severity"],
        properties: {
          key: { type: "string" },
          severity: { type: "number" },
        },
      },
    },
    consumerReadiness: {
      type: "object",
      additionalProperties: false,
      required: ["stargazer", "orbiter", "recommendations"],
      properties: {
        stargazer: { type: "boolean" },
        orbiter: { type: "boolean" },
        recommendations: { type: "boolean" },
      },
    },
  },
} satisfies Record<string, unknown>;

function asObjectOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeStringList(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeText(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, limit);
}

function normalizeBoolean(value: unknown): boolean {
  return value === true;
}

function normalizeConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.5;
  return Math.max(0, Math.min(1, parsed));
}

function slugifyKey(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "derived_key";
}

function summarizeNumericRecord(
  value: unknown,
  limit = 8,
): Array<{ key: string; value: number }> {
  const record = asObjectOrNull(value);
  if (!record) return [];
  return Object.entries(record)
    .map(([key, item]) => ({ key, value: Number(item) }))
    .filter((item) => Number.isFinite(item.value))
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
    .slice(0, limit)
    .map((item) => ({
      key: item.key,
      value: Number(item.value.toFixed(3)),
    }));
}

function tryParseJsonText(text: string): unknown {
  return parseStructuredJsonWithRecovery(text);
}

function extractPartialStringField(text: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`"${escapedKey}"\\s*:\\s*"([^"\\n\\r]*)`));
  return normalizeText(match?.[1]);
}

function extractPartialNumberField(text: string, key: string): number | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`"${escapedKey}"\\s*:\\s*([0-9.]+)`));
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function extractPartialBooleanField(text: string, key: string): boolean | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`"${escapedKey}"\\s*:\\s*(true|false)`));
  if (!match?.[1]) return null;
  return match[1] === "true";
}

function extractPartialArrayStrings(text: string, key: string, limit = 2): string[] {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`"${escapedKey}"\\s*:\\s*\\[([^\\]]*)`, "s"));
  if (!match?.[1]) return [];
  return Array.from(match[1].matchAll(/"([^"\n\r]*)/g))
    .map((item) => normalizeText(item[1]))
    .filter((item): item is string => Boolean(item))
    .slice(0, limit);
}

function recoverIdentityProfileFromPartialText(text: string): IdentityProfileRecord | null {
  const candidateText = stripMarkdownCodeFence(text.trim());
  if (!candidateText.startsWith("{")) return null;

  const stableLabel = extractPartialStringField(candidateText, "label");
  const stableKey =
    extractPartialStringField(candidateText, "key") ??
    (stableLabel ? slugifyKey(stableLabel) : null);
  const stableConfidence =
    extractPartialNumberField(candidateText, "confidence") ?? 0.55;
  const evidenceRefs = extractPartialArrayStrings(candidateText, "evidenceRefs", 2);

  const hypothesisStatement = extractPartialStringField(candidateText, "statement");
  const hypothesisKey =
    extractPartialStringField(candidateText, "hypothesis_key") ??
    (hypothesisStatement ? slugifyKey(hypothesisStatement) : null);
  const hypothesisConfidence =
    extractPartialNumberField(candidateText, "hypothesis_confidence") ??
    extractPartialNumberField(candidateText, "confidence") ??
    0.5;

  const recovered: IdentityProfileRecord = {
    stableTraits:
      stableKey || stableLabel
        ? [
            {
              key: stableKey ?? "recovered_trait",
              label: stableLabel ?? stableKey ?? "観察中の特性",
              confidence: normalizeConfidence(stableConfidence),
              evidenceRefs:
                evidenceRefs.length > 0 ? evidenceRefs : ["partial_output_repair"],
            },
          ]
        : [],
    volatileState: {},
    relationalStyle: {
      pace: extractPartialStringField(candidateText, "pace"),
      distanceNeed: extractPartialStringField(candidateText, "distanceNeed"),
      confidence: normalizeConfidence(
        extractPartialNumberField(candidateText, "relational_confidence") ?? 0.5,
      ),
    },
    decisionStyle: {
      mode: extractPartialStringField(candidateText, "mode"),
      confidence: normalizeConfidence(
        extractPartialNumberField(candidateText, "decision_confidence") ?? 0.5,
      ),
    },
    activeHypotheses:
      hypothesisKey && hypothesisStatement
        ? [
            {
              key: hypothesisKey,
              statement: hypothesisStatement,
              confidence: normalizeConfidence(hypothesisConfidence),
            },
          ]
        : [],
    openQuestions: extractPartialArrayStrings(candidateText, "openQuestions", 2),
    changedSinceLast: extractPartialArrayStrings(candidateText, "changedSinceLast", 2),
    contradictions: [],
    consumerReadiness: {
      stargazer: extractPartialBooleanField(candidateText, "stargazer") ?? false,
      orbiter: extractPartialBooleanField(candidateText, "orbiter") ?? false,
      recommendations:
        extractPartialBooleanField(candidateText, "recommendations") ?? false,
    },
  };

  return validateIdentityProfile(recovered);
}

export function validateIdentityProfile(value: unknown): IdentityProfileRecord | null {
  const record = asObjectOrNull(value);
  if (!record) return null;

  const stableTraits = (Array.isArray(record.stableTraits) ? record.stableTraits : [])
    .map((item) => {
      const row = asObjectOrNull(item);
      if (!row) return null;
      const label =
        normalizeText(row.label) ??
        normalizeText(row.trait) ??
        normalizeText(row.statement) ??
        normalizeText(row.description);
      const key = normalizeText(row.key) ?? (label ? slugifyKey(label) : null);
      const evidenceRefs = normalizeStringList(row.evidenceRefs, 6);
      if (!key || !label || evidenceRefs.length === 0) return null;
      return {
        key,
        label,
        confidence: normalizeConfidence(row.confidence ?? 0.6),
        evidenceRefs,
      } satisfies IdentityStableTrait;
    })
    .filter((item): item is IdentityStableTrait => Boolean(item))
    .slice(0, 8);

  const volatileStateInput = asObjectOrNull(record.volatileState) ?? {};
  const volatileState = Object.fromEntries(
    Object.entries(volatileStateInput)
      .map(([key, value]) => {
        const row = asObjectOrNull(value);
        const normalizedKey = normalizeText(key);
        const normalizedValue =
          normalizeText(row?.value) ?? normalizeText(value);
        if (!normalizedKey || !normalizedValue) return null;
        return [
          normalizedKey,
          {
            value: normalizedValue,
            confidence: normalizeConfidence(row?.confidence ?? 0.5),
          },
        ] as const;
      })
      .filter(
        (
          item,
        ): item is readonly [string, { value: string; confidence: number }] =>
          Boolean(item),
      ),
  );

  const relationalStyleInput = asObjectOrNull(record.relationalStyle) ?? {};
  const decisionStyleInput = asObjectOrNull(record.decisionStyle) ?? {};

  const activeHypotheses = (Array.isArray(record.activeHypotheses)
    ? record.activeHypotheses
    : []
  )
    .map((item) => {
      const row = asObjectOrNull(item);
      if (!row) return null;
      const statement =
        normalizeText(row.statement) ??
        normalizeText(row.hypothesis) ??
        normalizeText(row.label) ??
        normalizeText(row.text);
      const key = normalizeText(row.key) ?? (statement ? slugifyKey(statement) : null);
      if (!key || !statement) return null;
      return {
        key,
        statement,
        confidence: normalizeConfidence(row.confidence ?? 0.6),
      } satisfies IdentityHypothesis;
    })
    .filter((item): item is IdentityHypothesis => Boolean(item))
    .slice(0, 6);

  const contradictions = (Array.isArray(record.contradictions)
    ? record.contradictions
    : []
  )
    .map((item) => {
      const row = asObjectOrNull(item);
      if (!row) return null;
      const key =
        normalizeText(row.key) ??
        normalizeText(row.issue) ??
        normalizeText(row.label) ??
        normalizeText(row.description);
      if (!key) return null;
      return {
        key: slugifyKey(key),
        severity: normalizeConfidence(row.severity),
      } satisfies IdentityContradiction;
    })
    .filter((item): item is IdentityContradiction => Boolean(item))
    .slice(0, 6);

  const consumerReadinessInput = asObjectOrNull(record.consumerReadiness) ?? {};

  if (stableTraits.length === 0 && activeHypotheses.length === 0) {
    return null;
  }

  return {
    stableTraits,
    volatileState,
    relationalStyle: {
      pace:
        normalizeText(relationalStyleInput.pace) ??
        normalizeText(relationalStyleInput.relationalPace),
      distanceNeed:
        normalizeText(relationalStyleInput.distanceNeed) ??
        normalizeText(relationalStyleInput.distance),
      confidence: normalizeConfidence(relationalStyleInput.confidence ?? 0.6),
    },
    decisionStyle: {
      mode:
        normalizeText(decisionStyleInput.mode) ??
        normalizeText(decisionStyleInput.style),
      confidence: normalizeConfidence(decisionStyleInput.confidence ?? 0.6),
    },
    activeHypotheses,
    openQuestions: normalizeStringList(record.openQuestions, 8),
    changedSinceLast: normalizeStringList(record.changedSinceLast, 8),
    contradictions,
    consumerReadiness: {
      stargazer: normalizeBoolean(consumerReadinessInput.stargazer),
      orbiter: normalizeBoolean(consumerReadinessInput.orbiter),
      recommendations: normalizeBoolean(consumerReadinessInput.recommendations),
    },
  };
}

export function parseIdentityProfile(args: {
  structured: unknown;
  text: string;
}): IdentityProfileRecord | null {
  const structured = validateIdentityProfile(args.structured);
  if (structured) return structured;

  try {
    const parsed = tryParseJsonText(args.text);
    const profile = validateIdentityProfile(parsed);
    if (profile) return profile;
  } catch {
    // Fall through to partial recovery below.
  }

  try {
    return recoverIdentityProfileFromPartialText(args.text);
  } catch {
    return null;
  }
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

export function buildProfileText(profile: IdentityProfileRecord): string {
  const parts: string[] = [];
  const topTraits = profile.stableTraits.slice(0, 2).map((item) => item.label);
  if (topTraits.length > 0) {
    parts.push(topTraits.join(" / "));
  }
  const hypothesis = profile.activeHypotheses[0]?.statement;
  if (hypothesis) {
    parts.push(hypothesis);
  }
  const openQuestion = profile.openQuestions[0];
  if (openQuestion) {
    parts.push(`未解決: ${openQuestion}`);
  }
  return truncate(parts.join("。"), 280);
}

export function computeContradictionScore(profile: IdentityProfileRecord): number {
  if (profile.contradictions.length === 0) return 0;
  const total = profile.contradictions.reduce(
    (sum, item) => sum + item.severity,
    0,
  );
  return Math.max(0, Math.min(1, total / profile.contradictions.length));
}

export function computeProfileConfidence(profile: IdentityProfileRecord): number {
  const values = [
    ...profile.stableTraits.map((item) => item.confidence),
    ...profile.activeHypotheses.map((item) => item.confidence),
    profile.relationalStyle.confidence,
    profile.decisionStyle.confidence,
  ].filter((value) => Number.isFinite(value));
  if (values.length === 0) return 0.5;
  return Math.max(0, Math.min(1, values.reduce((sum, value) => sum + value, 0) / values.length));
}

function summarizeAxisSnapshots(
  rows: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const byAxis = new Map<
    string,
    {
      totalScore: number;
      totalConfidence: number;
      count: number;
      latestAt: string | null;
      latestLayer: string | null;
      latestContext: string | null;
    }
  >();

  for (const row of rows) {
    const axisId = normalizeText(row.axis_id);
    if (!axisId) continue;
    const current =
      byAxis.get(axisId) ?? {
        totalScore: 0,
        totalConfidence: 0,
        count: 0,
        latestAt: null,
        latestLayer: null,
        latestContext: null,
      };
    current.totalScore += Number(row.score ?? 0);
    current.totalConfidence += Number(row.confidence ?? 0);
    current.count += 1;
    const createdAt =
      normalizeText(row.created_at) ??
      normalizeText(row.session_date) ??
      current.latestAt;
    if (createdAt && (!current.latestAt || createdAt.localeCompare(current.latestAt) > 0)) {
      current.latestAt = createdAt;
      current.latestLayer = normalizeText(row.observation_layer);
      current.latestContext = normalizeText(row.context);
    }
    byAxis.set(axisId, current);
  }

  return Array.from(byAxis.entries())
    .map(([axisId, summary]) => ({
      axisId,
      avgScore:
        summary.count > 0
          ? Number((summary.totalScore / summary.count).toFixed(3))
          : 0,
      avgConfidence:
        summary.count > 0
          ? Number((summary.totalConfidence / summary.count).toFixed(3))
          : 0,
      count: summary.count,
      latestLayer: summary.latestLayer,
      latestContext: summary.latestContext,
      latestAt: summary.latestAt,
    }))
    .sort((left, right) => Math.abs(Number(right.avgScore)) - Math.abs(Number(left.avgScore)))
    .slice(0, 8);
}

async function loadLatestIdentitySnapshot(
  supabase: SupabaseClient,
  userId: string,
): Promise<IdentitySnapshotRow | null> {
  const { data, error } = await supabase
    .from("identity_profile_snapshots")
    .select(
      "id, user_id, ai_run_id, version, profile_json, profile_text, previous_snapshot_id, source_summary, contradiction_score, confidence, created_at, updated_at",
    )
    .eq("user_id", userId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;

  const profile = validateIdentityProfile(data.profile_json);
  if (!profile) return null;

  return {
    id: data.id,
    userId: data.user_id,
    aiRunId: data.ai_run_id ?? null,
    version: Number(data.version ?? 1),
    profile,
    profileText: data.profile_text ?? "",
    previousSnapshotId: data.previous_snapshot_id ?? null,
    sourceSummary: asObjectOrNull(data.source_summary) ?? {},
    contradictionScore: Number(data.contradiction_score ?? 0),
    confidence: Number(data.confidence ?? 0),
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

async function loadIdentitySourceContext(args: {
  supabase: SupabaseClient;
  userId: string;
  sourceWindowHours: number;
}): Promise<{ source: IdentitySourceContext; sourceSummary: Record<string, unknown> }> {
  const cutoff = new Date(
    Date.now() - args.sourceWindowHours * 60 * 60 * 1000,
  ).toISOString();

  const [
    profileResult,
    resolvedTypeResult,
    axisSnapshotsResult,
    dailyStatesResult,
    observationsResult,
    memorySummariesResult,
    recommendationRatingsResult,
    recommendationActionsResult,
    rendezvousStatesResult,
    currentDigest,
  ] = await Promise.all([
    args.supabase
      .from("stargazer_profiles")
      .select("*")
      .eq("user_id", args.userId)
      .maybeSingle(),
    args.supabase
      .from("stargazer_resolved_types")
      .select("*")
      .eq("user_id", args.userId)
      .maybeSingle(),
    args.supabase
      .from("stargazer_axis_snapshots")
      .select(
        "axis_id, score, confidence, context, observation_layer, session_date, created_at",
      )
      .eq("user_id", args.userId)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(48),
    args.supabase
      .from("stargazer_daily_states")
      .select("*")
      .eq("user_id", args.userId)
      .order("observation_date", { ascending: false })
      .limit(7),
    args.supabase
      .from("stargazer_observations")
      .select("question_id, answer, response_time_ms, answered_at, created_at")
      .eq("user_id", args.userId)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(20),
    args.supabase
      .from("orbiter_memory_summaries")
      .select(
        "candidate_id, summary_text, summary_json, source_memo_count, source_new_memo_count, quality_metrics, updated_at",
      )
      .eq("user_id", args.userId)
      .order("updated_at", { ascending: false })
      .limit(6),
    args.supabase
      .from("recommendation_ratings")
      .select("rating, created_at")
      .eq("user_id", args.userId)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(100),
    args.supabase
      .from("recommendation_actions")
      .select("action, created_at")
      .eq("user_id", args.userId)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(100),
    args.supabase
      .from("rendezvous_user_states")
      .select("state, updated_at")
      .eq("user_id", args.userId)
      .order("updated_at", { ascending: false })
      .limit(50),
    loadPreviousDigest(args.supabase, args.userId),
  ]);

  for (const result of [
    profileResult,
    resolvedTypeResult,
    axisSnapshotsResult,
    dailyStatesResult,
    observationsResult,
    memorySummariesResult,
    recommendationRatingsResult,
    recommendationActionsResult,
    rendezvousStatesResult,
  ]) {
    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  const axisSnapshots = ((axisSnapshotsResult.data ?? []) as Array<Record<string, unknown>>);
  const observations = ((observationsResult.data ?? []) as Array<Record<string, unknown>>);
  const memorySummaries = ((memorySummariesResult.data ?? []) as Array<Record<string, unknown>>);
  const ratingRows = ((recommendationRatingsResult.data ?? []) as Array<Record<string, unknown>>);
  const actionRows = ((recommendationActionsResult.data ?? []) as Array<Record<string, unknown>>);
  const rendezvousStateRows = ((rendezvousStatesResult.data ?? []) as Array<Record<string, unknown>>);

  const recommendationSummary = {
    ratings: {
      total: ratingRows.length,
      liked: ratingRows.filter((row) => Number(row.rating ?? 0) > 0).length,
      disliked: ratingRows.filter((row) => Number(row.rating ?? 0) < 0).length,
      neutral: ratingRows.filter((row) => Number(row.rating ?? 0) === 0).length,
    },
    actions: Object.entries(
      actionRows.reduce<Record<string, number>>((acc, row) => {
        const action = normalizeText(row.action) ?? "unknown";
        acc[action] = (acc[action] ?? 0) + 1;
        return acc;
      }, {}),
    )
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([action, count]) => ({ action, count })),
  };

  const rendezvousStateSummary = Object.entries(
    rendezvousStateRows.reduce<Record<string, number>>((acc, row) => {
      const state = normalizeText(row.state) ?? "unknown";
      acc[state] = (acc[state] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .sort((left, right) => right[1] - left[1])
    .map(([state, count]) => ({ state, count }));

  const source: IdentitySourceContext = {
    stargazer: {
      profile: profileResult.data ?? null,
      resolvedType: resolvedTypeResult.data ?? null,
      topAxisSignals: summarizeAxisSnapshots(axisSnapshots),
      recentDailyStates: (dailyStatesResult.data ?? []).slice(0, 5),
      recentObservations: observations.slice(0, 10),
    },
    orbiter: {
      digest: currentDigest
        ? {
            essence: currentDigest.essence,
            sections: currentDigest.sections.slice(0, 4),
            createdAt: currentDigest.createdAt,
          }
        : null,
      recentMemorySummaries: memorySummaries.map((row) => ({
        candidateId: row.candidate_id,
        summaryText: truncate(String(row.summary_text ?? ""), 240),
        sourceMemoCount: Number(row.source_memo_count ?? 0),
        sourceNewMemoCount: Number(row.source_new_memo_count ?? 0),
        qualityMetrics: asObjectOrNull(row.quality_metrics) ?? {},
        updatedAt: row.updated_at,
      })),
    },
    behavior: {
      recommendationSummary,
      rendezvousStates: rendezvousStateSummary,
    },
  };

  const stargazerProfile = asObjectOrNull(profileResult.data) ?? null;
  const resolvedType = asObjectOrNull(resolvedTypeResult.data) ?? null;
  const recentObservationSummary = {
    total: observations.length,
    avgResponseTimeMs:
      observations.length > 0
        ? Math.round(
            observations.reduce(
              (sum, row) => sum + Number(row.response_time_ms ?? 0),
              0,
            ) / observations.length,
          )
        : null,
    questionIds: observations
      .map((row) => normalizeText(row.question_id))
      .filter((value): value is string => Boolean(value))
      .slice(0, 8),
    answerTypes: Array.from(
      new Set(
        observations
          .map((row) => normalizeText(asObjectOrNull(row.answer)?.type))
          .filter((value): value is string => Boolean(value)),
      ),
    ).slice(0, 6),
  };

  const compactSource: IdentitySourceContext = {
    stargazer: {
      profile: stargazerProfile
        ? {
            tags: normalizeStringList(stargazerProfile.tags, 6),
            observationMode: normalizeText(stargazerProfile.observation_mode),
            totalSessions: Number(stargazerProfile.total_sessions ?? 0),
            lastObservationAt:
              normalizeText(stargazerProfile.last_observation_at) ??
              normalizeText(stargazerProfile.updated_at),
            topDimensions: summarizeNumericRecord(stargazerProfile.dimensions),
          }
        : null,
      resolvedType: resolvedType
        ? {
            archetypeCode: normalizeText(resolvedType.archetype_code),
            confidence: normalizeConfidence(resolvedType.confidence),
            topMatches: Array.isArray(resolvedType.top_matches)
              ? resolvedType.top_matches.slice(0, 3)
              : [],
            topAxisScores: summarizeNumericRecord(resolvedType.axis_scores),
          }
        : null,
      topAxisSignals: summarizeAxisSnapshots(axisSnapshots),
      recentDailyStates: ((dailyStatesResult.data ?? []) as Array<Record<string, unknown>>)
        .slice(0, 3)
        .map((row) => ({
          observationDate: row.observation_date,
          selfAlignment: row.self_alignment,
          interpersonalEnergy: row.interpersonal_energy,
          emotionalTemp: row.emotional_temp,
          boundarySense: row.boundary_sense,
        })),
      recentObservations: recentObservationSummary,
    },
    orbiter: source.orbiter,
    behavior: source.behavior,
  };

  return {
    source: compactSource,
    sourceSummary: {
      sourceWindowHours: args.sourceWindowHours,
      stargazerAxisSignals: summarizeAxisSnapshots(axisSnapshots).length,
      stargazerDailyStates: (dailyStatesResult.data ?? []).length,
      stargazerObservations: observations.length,
      orbiterMemorySummaries: memorySummaries.length,
      hasOrbiterDigest: Boolean(currentDigest),
      recommendationRatings: ratingRows.length,
      recommendationActions: actionRows.length,
      rendezvousStateRows: rendezvousStateRows.length,
    },
  };
}

function buildPrompt(args: {
  source: IdentitySourceContext;
  previousSnapshot: IdentitySnapshotRow | null;
  compact?: boolean;
}): string {
  const previousSnapshotSummary = args.previousSnapshot
    ? {
        version: args.previousSnapshot.version,
        profileText: args.previousSnapshot.profileText,
        stableTraits: args.previousSnapshot.profile.stableTraits.slice(0, 5),
        activeHypotheses: args.previousSnapshot.profile.activeHypotheses.slice(0, 4),
        openQuestions: args.previousSnapshot.profile.openQuestions.slice(0, 5),
        contradictions: args.previousSnapshot.profile.contradictions.slice(0, 5),
        consumerReadiness: args.previousSnapshot.profile.consumerReadiness,
      }
    : null;

  const payload = {
    previousSnapshot: previousSnapshotSummary,
    sources: args.source,
  };

  if (args.compact) {
    return [
      "JSON context から内部プロフィールを更新してください。",
      "返答はJSONオブジェクト1つだけです。",
      "根拠が薄い場合は stableTraits 1件・activeHypotheses 0-1件に抑えてください。",
      `context_json:${JSON.stringify(payload)}`,
    ].join("\n");
  }

  return [
    "以下のJSON context から、ユーザーの内部プロフィールを更新してください。",
    "出力は指定されたJSONオブジェクト1つだけです。",
    "",
    "context_json:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function buildLowDensityTemplatePrompt(args: {
  basePrompt: string;
  retry?: boolean;
}): string {
  const template =
    '{"stableTraits":[{"key":"trait_key","label":"短い特性","confidence":0.55,"evidenceRefs":["source_ref"]}],"volatileState":{},"relationalStyle":{"pace":null,"distanceNeed":null,"confidence":0.5},"decisionStyle":{"mode":null,"confidence":0.5},"activeHypotheses":[],"openQuestions":[],"changedSinceLast":[],"contradictions":[],"consumerReadiness":{"stargazer":false,"orbiter":false,"recommendations":false}}';
  return [
    args.basePrompt,
    args.retry
      ? "前回はJSONが壊れていました。今回は1行のJSONだけを返してください。"
      : "素材が少ないので、短い1行JSONを優先してください。",
    "わからない項目は null / [] / {} を使ってください。",
    "stableTraits は 1 件だけで十分です。根拠が弱ければ activeHypotheses は空配列で構いません。",
    `shape_example:${template}`,
  ].join("\n");
}

function deriveConsumerReadinessFromSourceSummary(sourceSummary: Record<string, unknown>): {
  stargazer: boolean;
  orbiter: boolean;
  recommendations: boolean;
} {
  return {
    stargazer:
      Number(sourceSummary.stargazerAxisSignals ?? 0) > 0 ||
      Number(sourceSummary.stargazerDailyStates ?? 0) > 0 ||
      Number(sourceSummary.stargazerObservations ?? 0) > 0,
    orbiter:
      Number(sourceSummary.orbiterMemorySummaries ?? 0) > 0 ||
      Number(sourceSummary.hasOrbiterDigest ?? 0) > 0,
    recommendations:
      Number(sourceSummary.recommendationRatings ?? 0) > 0 ||
      Number(sourceSummary.recommendationActions ?? 0) > 0,
  };
}

function buildLowDensityRecoveredProfile(args: {
  previousSnapshot: IdentitySnapshotRow | null;
  source: IdentitySourceContext;
  sourceSummary: Record<string, unknown>;
}): IdentityProfileRecord | null {
  const consumerReadiness = deriveConsumerReadinessFromSourceSummary(args.sourceSummary);

  if (args.previousSnapshot) {
    const previous = args.previousSnapshot.profile;
    return validateIdentityProfile({
      ...previous,
      stableTraits: previous.stableTraits.slice(0, 2).map((trait) => ({
        ...trait,
        evidenceRefs: trait.evidenceRefs.slice(0, 2),
      })),
      activeHypotheses: previous.activeHypotheses.slice(0, 1),
      openQuestions: previous.openQuestions.slice(0, 2),
      changedSinceLast: [],
      contradictions: previous.contradictions.slice(0, 2),
      consumerReadiness: {
        stargazer: consumerReadiness.stargazer || previous.consumerReadiness.stargazer,
        orbiter: consumerReadiness.orbiter || previous.consumerReadiness.orbiter,
        recommendations:
          consumerReadiness.recommendations ||
          previous.consumerReadiness.recommendations,
      },
    });
  }

  const stargazer = asObjectOrNull(args.source.stargazer);
  const stargazerProfile = asObjectOrNull(stargazer?.profile);
  const resolvedType = asObjectOrNull(stargazer?.resolvedType);
  const topAxisSignals = Array.isArray(stargazer?.topAxisSignals)
    ? (stargazer?.topAxisSignals as Array<Record<string, unknown>>)
    : [];
  const orbiter = asObjectOrNull(args.source.orbiter);
  const recentMemorySummaries = Array.isArray(orbiter?.recentMemorySummaries)
    ? (orbiter?.recentMemorySummaries as Array<Record<string, unknown>>)
    : [];

  const tag = normalizeStringList(stargazerProfile?.tags, 1)[0] ?? null;
  const archetypeCodeValue =
    normalizeText(resolvedType?.archetypeCode) ??
    normalizeText(resolvedType?.archetype_code);
  const topAxisId = normalizeText(topAxisSignals[0]?.axisId);
  const orbiterSummary = normalizeText(recentMemorySummaries[0]?.summaryText);

  const stableTraitLabel =
    tag ??
    archetypeCodeValue ??
    (topAxisId ? `${topAxisId} 傾向` : null) ??
    (orbiterSummary ? truncate(orbiterSummary, 20) : null);
  const stableEvidenceRef =
    (tag && "stargazer_profile_tags") ||
    (archetypeCodeValue && "stargazer_resolved_type") ||
    (topAxisId && `axis:${topAxisId}`) ||
    (orbiterSummary && "orbiter_memory_summary") ||
    "low_density_recovery";

  return validateIdentityProfile({
    stableTraits: stableTraitLabel
      ? [
          {
            key: slugifyKey(stableTraitLabel),
            label: stableTraitLabel,
            confidence: 0.45,
            evidenceRefs: [stableEvidenceRef],
          },
        ]
      : [],
    volatileState: {},
    relationalStyle: {
      pace: null,
      distanceNeed: null,
      confidence: 0.4,
    },
    decisionStyle: {
      mode: null,
      confidence: 0.4,
    },
    activeHypotheses:
      stableTraitLabel == null
        ? [
            {
              key: "low_density_pending",
              statement: "観測が少なく仮説形成中",
              confidence: 0.35,
            },
          ]
        : [],
    openQuestions: ["追加観測で更新"],
    changedSinceLast: [],
    contradictions: [],
    consumerReadiness,
  });
}

async function persistRecoveredIdentityProfileToRun(args: {
  supabase: SupabaseClient;
  aiRunId: string;
  profile: IdentityProfileRecord;
  recoveryStrategy: string;
}): Promise<void> {
  const { data, error } = await args.supabase
    .from("ai_runs")
    .select("metadata")
    .eq("id", args.aiRunId)
    .maybeSingle();

  if (error) {
    console.warn(
      "[identity/profileUpdate] failed to load ai_run for recovery:",
      error.message,
    );
    return;
  }

  const metadata = asObjectOrNull(data?.metadata) ?? {};
  const { error: updateError } = await args.supabase
    .from("ai_runs")
    .update({
      structured_json: args.profile,
      metadata: {
        ...metadata,
        profileRecoveredFromMalformedPayload: true,
        profileRecoveryStrategy: args.recoveryStrategy,
      },
    })
    .eq("id", args.aiRunId);

  if (updateError) {
    console.warn(
      "[identity/profileUpdate] failed to persist recovered profile:",
      updateError.message,
    );
  }
}

function computeSourceSignalCount(sourceSummary: Record<string, unknown>): number {
  return (
    Number(sourceSummary.stargazerAxisSignals ?? 0) +
    Number(sourceSummary.stargazerDailyStates ?? 0) +
    Number(sourceSummary.stargazerObservations ?? 0) +
    Number(sourceSummary.orbiterMemorySummaries ?? 0) +
    Number(sourceSummary.recommendationRatings ?? 0) +
    Number(sourceSummary.recommendationActions ?? 0) +
    Number(sourceSummary.rendezvousStateRows ?? 0)
  );
}

function getSourceDensityBucket(sourceSummary: Record<string, unknown>): string {
  const total = computeSourceSignalCount(sourceSummary);
  if (total <= 3) return "very_low";
  if (total <= 10) return "low";
  if (total <= 20) return "medium";
  if (total <= 40) return "high";
  return "very_high";
}

async function persistIdentitySnapshot(args: {
  supabase: SupabaseClient;
  userId: string;
  aiRunId: string | null;
  previousSnapshot: IdentitySnapshotRow | null;
  profile: IdentityProfileRecord;
  sourceSummary: Record<string, unknown>;
}): Promise<IdentitySnapshotRow> {
  const now = new Date().toISOString();
  const version = (args.previousSnapshot?.version ?? 0) + 1;
  const profileText = buildProfileText(args.profile);
  const contradictionScore = computeContradictionScore(args.profile);
  const confidence = computeProfileConfidence(args.profile);
  const consumerReadiness = args.profile.consumerReadiness;

  const { data, error } = await args.supabase
    .from("identity_profile_snapshots")
    .insert({
      user_id: args.userId,
      ai_run_id: args.aiRunId,
      version,
      profile_json: args.profile,
      profile_text: profileText,
      previous_snapshot_id: args.previousSnapshot?.id ?? null,
      source_summary: args.sourceSummary,
      contradiction_score: contradictionScore,
      consumer_readiness: consumerReadiness,
      confidence,
      updated_at: now,
    })
    .select(
      "id, user_id, ai_run_id, version, profile_json, profile_text, previous_snapshot_id, source_summary, contradiction_score, confidence, created_at, updated_at",
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const validated = validateIdentityProfile(data.profile_json);
  if (!validated) {
    throw new Error("stored_identity_profile_invalid");
  }

  return {
    id: data.id,
    userId: data.user_id,
    aiRunId: data.ai_run_id ?? null,
    version: Number(data.version ?? version),
    profile: validated,
    profileText: data.profile_text ?? profileText,
    previousSnapshotId: data.previous_snapshot_id ?? null,
    sourceSummary: asObjectOrNull(data.source_summary) ?? {},
    contradictionScore: Number(data.contradiction_score ?? contradictionScore),
    confidence: Number(data.confidence ?? confidence),
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function refreshIdentityProfile(
  args: RefreshIdentityProfileArgs,
): Promise<{
  ok: boolean;
  stored: boolean;
  aiRunId: string | null;
  snapshot: IdentitySnapshotRow | null;
  sourceSummary: Record<string, unknown>;
  reason?: string;
}> {
  const supabase = args.client ?? getAIServiceClient();
  if (!supabase) {
    return {
      ok: false,
      stored: false,
      aiRunId: null,
      snapshot: null,
      sourceSummary: {},
      reason: "service_role_unavailable",
    };
  }

  const sourceWindowHours = Math.max(24, Math.trunc(args.sourceWindowHours ?? 24 * 14));
  const shouldPersistSnapshot = args.persistSnapshot !== false;
  const previousSnapshot = await loadLatestIdentitySnapshot(supabase, args.userId);
  const { source, sourceSummary } = await loadIdentitySourceContext({
    supabase,
    userId: args.userId,
    sourceWindowHours,
  });
  const profileRequestId = randomUUID();
  const sourceDensityBucket = getSourceDensityBucket(sourceSummary);
  const useLowDensityRoute = sourceDensityBucket === "very_low";
  const basePrompt = buildPrompt({
    source,
    previousSnapshot,
    compact: useLowDensityRoute,
  });
  const strictRetryPrompt = `${basePrompt}\n\nImportant recovery note: your previous output was malformed. Return strictly valid JSON only. Use double-quoted keys and strings, no trailing commas, and no markdown fences. Keep the output short.`;
  const rawFallbackPrompt = `${basePrompt}\n\nFallback note: return only one JSON object with the required keys. Do not use markdown fences. Prioritize a short, parseable JSON object.`;
  const lowDensityTemplatePrompt = buildLowDensityTemplatePrompt({
    basePrompt,
  });
  const lowDensityTemplateRetryPrompt = buildLowDensityTemplatePrompt({
    basePrompt,
    retry: true,
  });
  const lowDensityFinalRecoveryPrompt = [
    basePrompt,
    "最終回復です。1行JSONだけを返してください。",
    "文字列は短く、引用符や記号を入れすぎないでください。",
    "不明な項目は null / [] / {} を使ってください。",
    '最小形: {"stableTraits":[{"key":"trait_key","label":"短い特性","confidence":0.55,"evidenceRefs":["source_ref"]}],"volatileState":{},"relationalStyle":{"pace":null,"distanceNeed":null,"confidence":0.5},"decisionStyle":{"mode":null,"confidence":0.5},"activeHypotheses":[],"openQuestions":[],"changedSinceLast":[],"contradictions":[],"consumerReadiness":{"stargazer":false,"orbiter":false,"recommendations":false}}',
  ].join("\n");
  const attemptSpecs = useLowDensityRoute
    ? ([
        {
          mode: "raw_fallback",
          prompt: lowDensityTemplatePrompt,
          requireJson: false,
          jsonSchema: undefined,
          promptVariant: "identity_low_density_template_raw_v2",
          schemaVariant: "identity_template_recovery_v1",
          temperature: 0.1,
          maxOutputTokens: 768,
        },
        {
          mode: "strict_retry",
          prompt: lowDensityTemplateRetryPrompt,
          requireJson: false,
          jsonSchema: undefined,
          promptVariant: "identity_low_density_template_retry_v1",
          schemaVariant: "identity_template_recovery_v1",
          temperature: 0.05,
          maxOutputTokens: 640,
        },
        {
          mode: "raw_fallback",
          prompt: lowDensityFinalRecoveryPrompt,
          requireJson: false,
          jsonSchema: undefined,
          promptVariant: "identity_low_density_final_raw_v1",
          schemaVariant: "identity_raw_json_recovery_v4",
          temperature: 0.05,
          maxOutputTokens: 512,
        },
      ] as const)
    : ([
        {
          mode: "strict",
          prompt: basePrompt,
          requireJson: true,
          jsonSchema: IDENTITY_PROFILE_JSON_SCHEMA,
          promptVariant: "identity_base_prompt_v2",
          schemaVariant: "identity_json_schema_v2",
          temperature: 0.3,
          maxOutputTokens: 2048,
        },
        {
          mode: "strict_retry",
          prompt: strictRetryPrompt,
          requireJson: true,
          jsonSchema: IDENTITY_PROFILE_JSON_SCHEMA,
          promptVariant: "identity_strict_retry_v2",
          schemaVariant: "identity_json_schema_v2",
          temperature: 0.2,
          maxOutputTokens: 1536,
        },
        {
          mode: "raw_fallback",
          prompt: rawFallbackPrompt,
          requireJson: false,
          jsonSchema: undefined,
          promptVariant: "identity_raw_fallback_v2",
          schemaVariant: "identity_raw_json_recovery_v2",
          temperature: 0.15,
          maxOutputTokens: 1536,
        },
      ] as const);

  let profile: IdentityProfileRecord | null = null;
  let aiRunId: string | null = null;
  let lastReason = "identity_profile_update_failed";
  let recoverableAiRunId: string | null = null;

  for (const [index, attempt] of attemptSpecs.entries()) {
    const result = await runAI({
      taskType: "identity_profile_update",
      prompt: attempt.prompt,
      systemPrompt: SYSTEM_PROMPT,
      jsonSchema: attempt.jsonSchema,
      requireJson: attempt.requireJson,
      temperature: attempt.temperature,
      maxOutputTokens: attempt.maxOutputTokens,
      preferredProvider: "gemini",
      allowFallback: false,
      userId: args.userId,
      sessionId: args.sessionId ?? undefined,
      metadata: makeIdentityRunMetadata({
        ...(args.runMetadata ?? {}),
        trigger: args.trigger ?? "manual",
        profileRequestId,
        profileAttempt: attempt.mode,
        profileAttemptIndex: index + 1,
        profilePromptVariant: attempt.promptVariant,
        profileSchemaVariant: attempt.schemaVariant,
        profileRouteStrategy: useLowDensityRoute
          ? "low_density_template_first"
          : "standard_json_mode",
        sourceWindowHours,
        sourceCounts: sourceSummary,
        sourceDensityBucket,
        previousSnapshotId: previousSnapshot?.id ?? null,
        persistSnapshot: shouldPersistSnapshot,
        userFacing: false,
      }),
    });

    aiRunId = result.aiRunId;

    if (!result.success) {
      lastReason = result.errorMessage ?? "identity_profile_update_failed";
      continue;
    }

    profile = parseIdentityProfile({
      structured: result.structured,
      text: result.text,
    });

    if (profile) {
      break;
    }

    recoverableAiRunId = result.aiRunId;
    lastReason = "invalid_identity_profile_payload";
  }

  if (!profile && useLowDensityRoute && recoverableAiRunId) {
    const recoveredProfile = buildLowDensityRecoveredProfile({
      previousSnapshot,
      source,
      sourceSummary,
    });
    if (recoveredProfile) {
      profile = recoveredProfile;
      aiRunId = recoverableAiRunId;
      await persistRecoveredIdentityProfileToRun({
        supabase,
        aiRunId: recoverableAiRunId,
        profile: recoveredProfile,
        recoveryStrategy: "low_density_source_recovery_v1",
      });
    }
  }

  if (!profile) {
    return {
      ok: false,
      stored: false,
      aiRunId,
      snapshot: null,
      sourceSummary,
      reason: lastReason,
    };
  }

  if (!shouldPersistSnapshot) {
    return {
      ok: true,
      stored: false,
      aiRunId,
      snapshot: null,
      sourceSummary,
    };
  }

  const snapshot = await persistIdentitySnapshot({
    supabase,
    userId: args.userId,
    aiRunId,
    previousSnapshot,
    profile,
    sourceSummary,
  });

  return {
    ok: true,
    stored: true,
    aiRunId,
    snapshot,
    sourceSummary,
  };
}
