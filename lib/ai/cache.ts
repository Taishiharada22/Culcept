/**
 * AI Semantic Cache
 *
 * Supabase の `ai_semantic_cache` テーブルを使ったセマンティックキャッシュ。
 * タスクタイプ・プロンプト・スキーマの組み合わせから SHA-256 キーを生成し、
 * TTL 付きで結果を再利用する。
 *
 * ### キャッシュキーのバージョニング
 * `CACHE_KEY_VERSION` を更新すると全キャッシュが無効化される。
 * DB 側のレコードは TTL で自然に期限切れになるため、手動削除は不要。
 *
 * ### 統計情報
 * `getCacheStats()` でヒット数・ミス数・エラー数・ヒット率を取得できる。
 * モニタリングやヘルスチェックから利用する。
 */
import "server-only";

import { createHash } from "crypto";
import { getAIServiceClient } from "./db";
import {
  PRIMARY_AI_PROVIDER,
  type AIProviderName,
  type RunAIParams,
} from "./types";

// ---------------------------------------------------------------------------
// Cache key version — bump to invalidate all cached entries
// ---------------------------------------------------------------------------
const CACHE_KEY_VERSION = "v2";

// ---------------------------------------------------------------------------
// Cache statistics (in-memory, reset on process restart)
// ---------------------------------------------------------------------------

/** Cache performance metrics tracked in-memory. */
export interface CacheStats {
  /** Number of successful cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Number of lookup/write errors */
  errors: number;
  /** Hit rate as a ratio (0–1). Returns 0 when no requests have been made. */
  hitRate: () => number;
}

const _stats: CacheStats = {
  hits: 0,
  misses: 0,
  errors: 0,
  hitRate() {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : this.hits / total;
  },
};

/**
 * Return a snapshot of cache statistics.
 * Values are cumulative since process start.
 */
export function getCacheStats(): Readonly<{
  hits: number;
  misses: number;
  errors: number;
  hitRate: number;
}> {
  return {
    hits: _stats.hits,
    misses: _stats.misses,
    errors: _stats.errors,
    hitRate: _stats.hitRate(),
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
    structured: Record<string, unknown> | unknown[] | null;
    provider: AIProviderName;
    model: string;
    sourceAiRunId: string | null;
  } | null;
};

function normalizeCachedProvider(value: unknown): AIProviderName | null {
  return value === PRIMARY_AI_PROVIDER ? PRIMARY_AI_PROVIDER : null;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function envNumber(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
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
  return `ai:semcache:${CACHE_KEY_VERSION}:${hash}`;
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
      _stats.errors += 1;
      return {
        cacheHit: false,
        cacheKey,
        reason: "lookup_error",
        cached: null,
      };
    }

    if (!data) {
      _stats.misses += 1;
      return {
        cacheHit: false,
        cacheKey,
        reason: "cache_miss",
        cached: null,
      };
    }

    const provider = normalizeCachedProvider(data.provider);
    if (!provider) {
      _stats.misses += 1;
      return {
        cacheHit: false,
        cacheKey,
        reason: "unsupported_cached_provider",
        cached: null,
      };
    }

    _stats.hits += 1;
    return {
      cacheHit: true,
      cacheKey,
      reason: "cache_hit",
      cached: {
        text: data.response_text ?? "",
        structured: data.structured_json ?? null,
        provider,
        model: data.model ?? "",
        sourceAiRunId: data.source_ai_run_id ?? null,
      },
    };
  } catch (error) {
    console.warn("[ai/cache] unexpected lookup error:", error);
    _stats.errors += 1;
    return {
      cacheHit: false,
      cacheKey,
      reason: "lookup_exception",
      cached: null,
    };
  }
}

// Schema-error suppression: avoid flooding logs when migration is pending
let _schemaErrorLogged = false;

export async function writeSemanticCache(args: {
  cacheKey: string;
  params: RunAIParams;
  sourceAiRunId: string;
  output: {
    text: string;
    structured: Record<string, unknown> | unknown[] | null;
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
      _stats.errors += 1;
      // Schema mismatch (migration pending) — log once, then suppress
      if (error.message.includes("schema cache") || error.message.includes("column")) {
        if (!_schemaErrorLogged) {
          console.warn("[ai/cache] write failed (schema mismatch — run migration 20260305113000):", error.message);
          _schemaErrorLogged = true;
        }
      } else {
        console.warn("[ai/cache] write failed:", error.message);
      }
    }
  } catch (error) {
    _stats.errors += 1;
    console.warn("[ai/cache] unexpected write error:", error);
  }
}
