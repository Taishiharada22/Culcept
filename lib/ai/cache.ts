import "server-only";

import { createHash } from "crypto";
import { getAIServiceClient } from "./db";
import type { AIProviderName, RunAIParams } from "./types";

export type CacheEligibility = {
  enabled: boolean;
  eligible: boolean;
  reason: string;
};

export type CacheLookupResult = {
  cacheHit: boolean;
  cacheKey: string | null;
  reason: string;
  cached: {
    text: string;
    structured: Record<string, unknown> | null;
    provider: AIProviderName;
    model: string;
    sourceAiRunId: string | null;
  } | null;
};

function envBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function envNumber(name: string, fallback: number): number {
  const value = Number((process.env[name] ?? "").trim());
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function envTaskTypes(): Set<string> | null {
  const raw = (process.env.AI_CACHE_TASK_TYPES ?? "").trim();
  if (!raw) return null;
  const types = raw.split(",").map((t) => t.trim()).filter(Boolean);
  return types.length > 0 ? new Set(types) : null;
}

export function resolveCacheEligibility(params: RunAIParams): CacheEligibility {
  const enabled = envBool("AI_CACHE_ENABLED", true);
  if (!enabled) {
    return { enabled: false, eligible: false, reason: "cache_disabled" };
  }

  const allowedTaskTypes = envTaskTypes();
  if (allowedTaskTypes && !allowedTaskTypes.has(params.taskType)) {
    return { enabled: true, eligible: false, reason: "task_type_excluded" };
  }

  if (params.metadata?.skipCache === true) {
    return { enabled: true, eligible: false, reason: "skip_cache_requested" };
  }

  return { enabled: true, eligible: true, reason: "eligible" };
}

export function buildAICacheKey(params: RunAIParams): string | null {
  const eligibility = resolveCacheEligibility(params);
  if (!eligibility.eligible) return null;

  const hashInput = JSON.stringify({
    taskType: params.taskType,
    prompt: params.prompt,
    systemPrompt: params.systemPrompt ?? "",
    jsonSchema: params.jsonSchema ?? null,
    requireJson: params.requireJson ?? false,
  });

  const hash = createHash("sha256").update(hashInput).digest("hex");
  return `ai:semcache:v1:${hash}`;
}

export async function lookupSemanticCache(
  params: RunAIParams,
): Promise<CacheLookupResult> {
  const cacheKey = buildAICacheKey(params);
  if (!cacheKey) {
    return {
      cacheHit: false,
      cacheKey: null,
      reason: "not_eligible",
      cached: null,
    };
  }

  const client = getAIServiceClient();
  if (!client) {
    return {
      cacheHit: false,
      cacheKey,
      reason: "service_client_unavailable",
      cached: null,
    };
  }

  const ttlSeconds = envNumber("AI_CACHE_TTL_SECONDS", 3600);

  try {
    const cutoff = new Date(Date.now() - ttlSeconds * 1000).toISOString();

    const { data, error } = await client
      .from("ai_semantic_cache")
      .select("cache_key, response_text, structured_json, provider, model, source_ai_run_id, created_at")
      .eq("cache_key", cacheKey)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("[ai/cache] lookup failed:", error.message);
      return {
        cacheHit: false,
        cacheKey,
        reason: "lookup_error",
        cached: null,
      };
    }

    if (!data) {
      return {
        cacheHit: false,
        cacheKey,
        reason: "cache_miss",
        cached: null,
      };
    }

    return {
      cacheHit: true,
      cacheKey,
      reason: "cache_hit",
      cached: {
        text: data.response_text ?? "",
        structured: data.structured_json ?? null,
        provider: data.provider as AIProviderName,
        model: data.model ?? "",
        sourceAiRunId: data.source_ai_run_id ?? null,
      },
    };
  } catch (error) {
    console.warn("[ai/cache] unexpected lookup error:", error);
    return {
      cacheHit: false,
      cacheKey,
      reason: "lookup_exception",
      cached: null,
    };
  }
}

export async function writeSemanticCache(args: {
  cacheKey: string;
  params: RunAIParams;
  sourceAiRunId: string;
  output: {
    text: string;
    structured: Record<string, unknown> | null;
    provider: AIProviderName;
    model: string;
  };
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const client = getAIServiceClient();
    if (!client) return;

    const row = {
      cache_key: args.cacheKey,
      task_type: args.params.taskType,
      prompt_text: args.params.prompt,
      system_prompt: args.params.systemPrompt ?? null,
      response_text: args.output.text,
      structured_json: args.output.structured,
      provider: args.output.provider,
      model: args.output.model,
      source_ai_run_id: args.sourceAiRunId,
      metadata: args.metadata ?? null,
    };

    const { error } = await client
      .from("ai_semantic_cache")
      .upsert(row, { onConflict: "cache_key" });

    if (error) {
      console.warn("[ai/cache] write failed:", error.message);
    }
  } catch (error) {
    console.warn("[ai/cache] unexpected write error:", error);
  }
}
