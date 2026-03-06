import "server-only";

import { getAIServiceClient } from "./db";
import type { AIProviderName } from "./types";

export type ModelTrafficRole = "champion" | "challenger" | "shadow";

export type ModelRegistryEntry = {
  id: string;
  createdAt: string;
  modelKey: string;
  modelVersion: string;
  modelRole: string;
  provider: AIProviderName;
  isActive: boolean;
  rolloutPercent: number;
  metadata: Record<string, unknown> | null;
  trafficRole: ModelTrafficRole | null;
  trafficWeight: number | null;
  taskTypes: string[] | null;
  promotionStatus: string | null;
  promotedAt: string | null;
  demotedAt: string | null;
  notes: string | null;
  providerModel: string | null;
};

export type ListModelRegistryResult = {
  ok: boolean;
  schemaMode: "extended" | "base";
  rows: ModelRegistryEntry[];
  error?: string;
};

const BASE_SELECT =
  "id, created_at, model_key, model_version, model_role, provider, is_active, rollout_percent, metadata";
const EXTENDED_SELECT =
  "id, created_at, model_key, model_version, model_role, provider, is_active, rollout_percent, metadata, traffic_role, traffic_weight, task_types, promotion_status, promoted_at, demoted_at, notes";

function asObjectOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toTextOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function toNumberOrNull(value: unknown): number | null {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number;
}

function toIntOrNull(value: unknown): number | null {
  const number = toNumberOrNull(value);
  if (number == null) return null;
  return Math.trunc(number);
}

function clampPercent(value: number | null | undefined, fallback = 0): number {
  const candidate = value == null ? fallback : value;
  if (!Number.isFinite(candidate)) return fallback;
  return Math.max(0, Math.min(100, Math.trunc(candidate)));
}

function normalizeProvider(value: unknown): AIProviderName | null {
  if (value === "gemini" || value === "ollama") return value;
  return null;
}

function normalizeRole(value: unknown): ModelTrafficRole | null {
  const normalized = toTextOrNull(value)?.toLowerCase();
  if (!normalized) return null;
  if (normalized === "champion" || normalized === "primary" || normalized === "default") {
    return "champion";
  }
  if (normalized === "challenger") return "challenger";
  if (normalized === "shadow") return "shadow";
  return null;
}

function parseTaskTypes(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    const parsed = value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
    return parsed.length > 0 ? Array.from(new Set(parsed)) : null;
  }

  if (value && typeof value === "object") {
    const candidate = (value as Record<string, unknown>).include;
    if (Array.isArray(candidate)) {
      const parsed = candidate
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean);
      return parsed.length > 0 ? Array.from(new Set(parsed)) : null;
    }
  }

  return null;
}

function resolveProviderModel(args: {
  metadata: Record<string, unknown> | null;
  modelVersion: string;
}): string | null {
  const metadata = args.metadata;
  const fromMetadata =
    toTextOrNull(metadata?.providerModel) ??
    toTextOrNull(metadata?.provider_model) ??
    toTextOrNull(metadata?.modelName) ??
    toTextOrNull(metadata?.model_name);

  if (fromMetadata) return fromMetadata;

  const version = args.modelVersion.trim();
  if (!version) return null;
  return version;
}

function mapModelRegistryRow(row: Record<string, unknown>): ModelRegistryEntry | null {
  const provider = normalizeProvider(row.provider);
  if (!provider) return null;

  const id = toTextOrNull(row.id);
  const createdAt = toTextOrNull(row.created_at);
  const modelKey = toTextOrNull(row.model_key);
  const modelVersion = toTextOrNull(row.model_version);
  const modelRole = toTextOrNull(row.model_role);

  if (!id || !createdAt || !modelKey || !modelVersion || !modelRole) {
    return null;
  }

  const metadata = asObjectOrNull(row.metadata);

  const trafficRole = normalizeRole(row.traffic_role) ?? normalizeRole(modelRole);

  return {
    id,
    createdAt,
    modelKey,
    modelVersion,
    modelRole,
    provider,
    isActive: Boolean(row.is_active),
    rolloutPercent: clampPercent(toIntOrNull(row.rollout_percent), 0),
    metadata,
    trafficRole,
    trafficWeight: toIntOrNull(row.traffic_weight),
    taskTypes: parseTaskTypes(row.task_types),
    promotionStatus: toTextOrNull(row.promotion_status),
    promotedAt: toTextOrNull(row.promoted_at),
    demotedAt: toTextOrNull(row.demoted_at),
    notes: toTextOrNull(row.notes),
    providerModel: resolveProviderModel({
      metadata,
      modelVersion,
    }),
  };
}

function isMissingColumnError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("column") && normalized.includes("does not exist")
  ) || normalized.includes("could not find the column");
}

async function queryRows(args: {
  select: string;
  includeInactive?: boolean;
  limit?: number;
}): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  const client = getAIServiceClient();
  if (!client) {
    return { rows: [], error: "service_client_unavailable" };
  }

  let query = client
    .from("model_registry")
    .select(args.select)
    .order("created_at", { ascending: false });

  if (!args.includeInactive) {
    query = query.eq("is_active", true);
  }

  if (typeof args.limit === "number" && Number.isFinite(args.limit) && args.limit > 0) {
    query = query.limit(Math.trunc(args.limit));
  }

  const { data, error } = await query;

  if (error) {
    return { rows: [], error: error.message };
  }

  return {
    rows: ((data ?? []) as unknown as Record<string, unknown>[]),
    error: null,
  };
}

export async function listModelRegistryEntries(options?: {
  includeInactive?: boolean;
  limit?: number;
}): Promise<ListModelRegistryResult> {
  const first = await queryRows({
    select: EXTENDED_SELECT,
    includeInactive: options?.includeInactive,
    limit: options?.limit,
  });

  if (!first.error) {
    return {
      ok: true,
      schemaMode: "extended",
      rows: first.rows.map(mapModelRegistryRow).filter(Boolean) as ModelRegistryEntry[],
    };
  }

  if (!isMissingColumnError(first.error)) {
    return {
      ok: false,
      schemaMode: "extended",
      rows: [],
      error: first.error,
    };
  }

  const fallback = await queryRows({
    select: BASE_SELECT,
    includeInactive: options?.includeInactive,
    limit: options?.limit,
  });

  if (fallback.error) {
    return {
      ok: false,
      schemaMode: "base",
      rows: [],
      error: fallback.error,
    };
  }

  return {
    ok: true,
    schemaMode: "base",
    rows: fallback.rows.map(mapModelRegistryRow).filter(Boolean) as ModelRegistryEntry[],
  };
}

export function isTaskTypeIncluded(
  entry: ModelRegistryEntry,
  taskType: string,
): boolean {
  if (!entry.taskTypes || entry.taskTypes.length === 0) return true;
  return entry.taskTypes.includes(taskType);
}

export function getEntryTrafficRole(entry: ModelRegistryEntry): ModelTrafficRole {
  if (entry.trafficRole) return entry.trafficRole;
  const fromModelRole = normalizeRole(entry.modelRole);
  if (fromModelRole) return fromModelRole;
  return "champion";
}
