import "server-only";

import { getAIServiceClient } from "./db";
import { listModelRegistryEntries, type ModelRegistryEntry } from "./modelRegistry";
import { PRIMARY_AI_PROVIDER, type AIProviderName } from "./types";

export type BootstrapRoleInput = {
  provider?: AIProviderName;
  modelKey?: string;
  modelVersion?: string;
  taskTypes?: string[];
  trafficWeight?: number;
  isActive?: boolean;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type BootstrapModelRegistryInput = {
  dryRun: boolean;
  champion?: BootstrapRoleInput;
  challenger?: BootstrapRoleInput & {
    enabled?: boolean;
  };
};

export type BootstrapDesiredEntry = {
  modelRole: "champion" | "challenger";
  provider: AIProviderName;
  modelKey: string;
  modelVersion: string;
  taskTypes: string[] | null;
  trafficWeight: number;
  rolloutPercent: number;
  isActive: boolean;
  promotionStatus: string;
  notes: string | null;
  metadata: Record<string, unknown> | null;
};

export type BootstrapAction = {
  role: "champion" | "challenger";
  modelKey: string;
  modelVersion: string;
  provider: AIProviderName;
  action: "created" | "updated" | "unchanged" | "error";
  id: string | null;
  changedFields: string[];
  reason?: string;
};

export type BootstrapResult = {
  ok: boolean;
  dryRun: boolean;
  schemaMode: "extended" | "base" | "unavailable";
  actions: BootstrapAction[];
  counts: {
    existingRows: number;
    activeRows: number;
  };
  error?: string;
};

function normalizeProvider(value: unknown, fallback: AIProviderName): AIProviderName {
  return value === PRIMARY_AI_PROVIDER ? PRIMARY_AI_PROVIDER : fallback;
}

function defaultProvider(): AIProviderName {
  return normalizeProvider(process.env.AI_DEFAULT_PROVIDER, PRIMARY_AI_PROVIDER);
}

function defaultModelVersion(_provider: AIProviderName): string {
  return (
    process.env.GEMINI_MODEL_DEFAULT ??
    process.env.GEMINI_MODEL ??
    "gemini-2.5-flash"
  ).trim();
}

function normalizeText(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeTaskTypes(values: string[] | undefined): string[] | null {
  if (!values || values.length === 0) return null;

  const normalized = values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  return normalized.length > 0 ? Array.from(new Set(normalized)) : null;
}

function normalizeMetadata(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function clampPercent(value: number | undefined, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.trunc(numeric)));
}

function sortStrings(value: string[] | null): string[] | null {
  if (!value || value.length === 0) return null;
  return [...value].sort((a, b) => a.localeCompare(b));
}

function sameArray(a: string[] | null, b: string[] | null): boolean {
  const left = sortStrings(a);
  const right = sortStrings(b);

  if (!left && !right) return true;
  if (!left || !right) return false;
  if (left.length !== right.length) return false;

  return left.every((value, index) => value === right[index]);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const json = JSON.stringify(value);
    return json ?? "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return `{${entries
    .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableJson(nestedValue)}`)
    .join(",")}}`;
}

function isMissingColumnError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    (normalized.includes("column") && normalized.includes("does not exist")) ||
    normalized.includes("could not find the column")
  );
}

function buildChampionDesired(input?: BootstrapRoleInput): BootstrapDesiredEntry {
  const provider = normalizeProvider(input?.provider, defaultProvider());
  const modelVersion = normalizeText(input?.modelVersion) ?? defaultModelVersion(provider);

  return {
    modelRole: "champion",
    provider,
    modelKey: normalizeText(input?.modelKey) ?? "aneurasync-primary",
    modelVersion,
    taskTypes: normalizeTaskTypes(input?.taskTypes),
    trafficWeight: 100,
    rolloutPercent: 100,
    isActive: typeof input?.isActive === "boolean" ? input.isActive : true,
    promotionStatus: "promoted",
    notes: normalizeText(input?.notes),
    metadata: normalizeMetadata(input?.metadata),
  };
}

function buildChallengerDesired(
  input?: BootstrapModelRegistryInput["challenger"],
): BootstrapDesiredEntry | null {
  if (!input?.enabled) return null;

  const provider = normalizeProvider(input.provider, PRIMARY_AI_PROVIDER);
  const modelVersion = normalizeText(input.modelVersion) ?? defaultModelVersion(provider);
  const weight = clampPercent(input.trafficWeight, 0);

  return {
    modelRole: "challenger",
    provider,
    modelKey: normalizeText(input.modelKey) ?? "aneurasync-challenger",
    modelVersion,
    taskTypes: normalizeTaskTypes(input.taskTypes),
    trafficWeight: weight,
    rolloutPercent: weight,
    isActive: typeof input.isActive === "boolean" ? input.isActive : true,
    promotionStatus: "candidate",
    notes: normalizeText(input.notes),
    metadata: normalizeMetadata(input.metadata),
  };
}

export function buildBootstrapDesiredEntries(
  input: BootstrapModelRegistryInput,
): BootstrapDesiredEntry[] {
  const champion = buildChampionDesired(input.champion);
  const challenger = buildChallengerDesired(input.challenger);

  return challenger ? [champion, challenger] : [champion];
}

function findExistingEntry(
  rows: ModelRegistryEntry[],
  desired: BootstrapDesiredEntry,
): ModelRegistryEntry | null {
  const exactMatch =
    rows.find(
      (row) =>
        row.modelRole === desired.modelRole &&
        row.modelKey === desired.modelKey &&
        row.modelVersion === desired.modelVersion,
    ) ?? null;

  if (exactMatch) return exactMatch;

  const sameRoleAndKey =
    rows.find(
      (row) =>
        row.modelRole === desired.modelRole && row.modelKey === desired.modelKey,
    ) ?? null;

  if (sameRoleAndKey) return sameRoleAndKey;

  const sameRoleActive = rows.filter(
    (row) => row.modelRole === desired.modelRole && row.isActive,
  );
  if (sameRoleActive.length === 1) return sameRoleActive[0];

  const sameRole = rows.filter((row) => row.modelRole === desired.modelRole);
  if (sameRole.length === 1) return sameRole[0];

  return null;
}

export function computeBootstrapChangedFields(args: {
  existing: ModelRegistryEntry | null;
  desired: BootstrapDesiredEntry;
}): string[] {
  if (!args.existing) {
    return [
      "provider",
      "model_version",
      "is_active",
      "rollout_percent",
      "traffic_role",
      "traffic_weight",
      "task_types",
      "promotion_status",
      "notes",
      "metadata",
    ];
  }

  const changedFields: string[] = [];
  const { existing, desired } = args;

  if (existing.provider !== desired.provider) changedFields.push("provider");
  if (existing.modelVersion !== desired.modelVersion) changedFields.push("model_version");
  if (existing.isActive !== desired.isActive) changedFields.push("is_active");
  if ((existing.rolloutPercent ?? 0) !== desired.rolloutPercent) {
    changedFields.push("rollout_percent");
  }
  if ((existing.trafficRole ?? existing.modelRole) !== desired.modelRole) {
    changedFields.push("traffic_role");
  }
  if ((existing.trafficWeight ?? existing.rolloutPercent ?? 0) !== desired.trafficWeight) {
    changedFields.push("traffic_weight");
  }
  if (!sameArray(existing.taskTypes, desired.taskTypes)) {
    changedFields.push("task_types");
  }
  if ((existing.promotionStatus ?? "") !== desired.promotionStatus) {
    changedFields.push("promotion_status");
  }
  if ((existing.notes ?? "") !== (desired.notes ?? "")) {
    changedFields.push("notes");
  }
  if (stableJson(existing.metadata ?? null) !== stableJson(desired.metadata ?? null)) {
    changedFields.push("metadata");
  }

  return changedFields;
}

function buildExtendedPayload(desired: BootstrapDesiredEntry): Record<string, unknown> {
  return {
    model_key: desired.modelKey,
    model_version: desired.modelVersion,
    model_role: desired.modelRole,
    provider: desired.provider,
    is_active: desired.isActive,
    rollout_percent: desired.rolloutPercent,
    metadata: desired.metadata,
    traffic_role: desired.modelRole,
    traffic_weight: desired.trafficWeight,
    task_types: desired.taskTypes,
    promotion_status: desired.promotionStatus,
    notes: desired.notes,
  };
}

function buildBasePayload(desired: BootstrapDesiredEntry): Record<string, unknown> {
  return {
    model_key: desired.modelKey,
    model_version: desired.modelVersion,
    model_role: desired.modelRole,
    provider: desired.provider,
    is_active: desired.isActive,
    rollout_percent: desired.rolloutPercent,
    metadata: desired.metadata,
  };
}

async function insertDesiredEntry(desired: BootstrapDesiredEntry): Promise<{
  id: string | null;
  schemaMode: "extended" | "base";
  error: string | null;
}> {
  const client = getAIServiceClient();
  if (!client) {
    return {
      id: null,
      schemaMode: "extended",
      error: "service_client_unavailable",
    };
  }

  const extendedInsert = await client
    .from("model_registry")
    .insert(buildExtendedPayload(desired))
    .select("id")
    .single();

  if (!extendedInsert.error) {
    return {
      id: typeof extendedInsert.data?.id === "string" ? extendedInsert.data.id : null,
      schemaMode: "extended",
      error: null,
    };
  }

  if (!isMissingColumnError(extendedInsert.error.message)) {
    return {
      id: null,
      schemaMode: "extended",
      error: extendedInsert.error.message,
    };
  }

  const baseInsert = await client
    .from("model_registry")
    .insert(buildBasePayload(desired))
    .select("id")
    .single();

  if (baseInsert.error) {
    return {
      id: null,
      schemaMode: "base",
      error: baseInsert.error.message,
    };
  }

  return {
    id: typeof baseInsert.data?.id === "string" ? baseInsert.data.id : null,
    schemaMode: "base",
    error: null,
  };
}

async function updateDesiredEntry(args: {
  id: string;
  desired: BootstrapDesiredEntry;
}): Promise<{
  schemaMode: "extended" | "base";
  error: string | null;
}> {
  const client = getAIServiceClient();
  if (!client) {
    return {
      schemaMode: "extended",
      error: "service_client_unavailable",
    };
  }

  const extendedUpdate = await client
    .from("model_registry")
    .update(buildExtendedPayload(args.desired))
    .eq("id", args.id);

  if (!extendedUpdate.error) {
    return {
      schemaMode: "extended",
      error: null,
    };
  }

  if (!isMissingColumnError(extendedUpdate.error.message)) {
    return {
      schemaMode: "extended",
      error: extendedUpdate.error.message,
    };
  }

  const baseUpdate = await client
    .from("model_registry")
    .update(buildBasePayload(args.desired))
    .eq("id", args.id);

  if (baseUpdate.error) {
    return {
      schemaMode: "base",
      error: baseUpdate.error.message,
    };
  }

  return {
    schemaMode: "base",
    error: null,
  };
}

export async function checkModelRegistryReadable(): Promise<{
  ok: boolean;
  schemaMode: "extended" | "base" | "unavailable";
  totalRows: number;
  activeRows: number;
  error?: string;
}> {
  const registry = await listModelRegistryEntries({ includeInactive: true, limit: 500 });

  if (!registry.ok) {
    return {
      ok: false,
      schemaMode: "unavailable",
      totalRows: 0,
      activeRows: 0,
      error: registry.error,
    };
  }

  return {
    ok: true,
    schemaMode: registry.schemaMode,
    totalRows: registry.rows.length,
    activeRows: registry.rows.filter((row) => row.isActive).length,
  };
}

export async function bootstrapModelRegistry(
  input: BootstrapModelRegistryInput,
): Promise<BootstrapResult> {
  const registry = await listModelRegistryEntries({ includeInactive: true, limit: 500 });

  if (!registry.ok) {
    return {
      ok: false,
      dryRun: input.dryRun,
      schemaMode: "unavailable",
      actions: [],
      counts: { existingRows: 0, activeRows: 0 },
      error: registry.error ?? "model_registry_unavailable",
    };
  }

  const desiredEntries = buildBootstrapDesiredEntries(input);
  const actions: BootstrapAction[] = [];
  let schemaMode: "extended" | "base" | "unavailable" = registry.schemaMode;

  for (const desired of desiredEntries) {
    const existing = findExistingEntry(registry.rows, desired);
    const changedFields = computeBootstrapChangedFields({ existing, desired });

    if (!existing) {
      if (input.dryRun) {
        actions.push({
          role: desired.modelRole,
          modelKey: desired.modelKey,
          modelVersion: desired.modelVersion,
          provider: desired.provider,
          action: "created",
          id: null,
          changedFields,
          reason: "dry_run",
        });
        continue;
      }

      const inserted = await insertDesiredEntry(desired);
      schemaMode = inserted.schemaMode;

      if (inserted.error) {
        actions.push({
          role: desired.modelRole,
          modelKey: desired.modelKey,
          modelVersion: desired.modelVersion,
          provider: desired.provider,
          action: "error",
          id: null,
          changedFields,
          reason: inserted.error,
        });
        continue;
      }

      actions.push({
        role: desired.modelRole,
        modelKey: desired.modelKey,
        modelVersion: desired.modelVersion,
        provider: desired.provider,
        action: "created",
        id: inserted.id,
        changedFields,
      });
      continue;
    }

    if (changedFields.length === 0) {
      actions.push({
        role: desired.modelRole,
        modelKey: desired.modelKey,
        modelVersion: desired.modelVersion,
        provider: desired.provider,
        action: "unchanged",
        id: existing.id,
        changedFields: [],
      });
      continue;
    }

    if (input.dryRun) {
      actions.push({
        role: desired.modelRole,
        modelKey: desired.modelKey,
        modelVersion: desired.modelVersion,
        provider: desired.provider,
        action: "updated",
        id: existing.id,
        changedFields,
        reason: "dry_run",
      });
      continue;
    }

    const updated = await updateDesiredEntry({
      id: existing.id,
      desired,
    });
    schemaMode = updated.schemaMode;

    if (updated.error) {
      actions.push({
        role: desired.modelRole,
        modelKey: desired.modelKey,
        modelVersion: desired.modelVersion,
        provider: desired.provider,
        action: "error",
        id: existing.id,
        changedFields,
        reason: updated.error,
      });
      continue;
    }

    actions.push({
      role: desired.modelRole,
      modelKey: desired.modelKey,
      modelVersion: desired.modelVersion,
      provider: desired.provider,
      action: "updated",
      id: existing.id,
      changedFields,
    });
  }

  const firstError = actions.find((action) => action.action === "error");

  return {
    ok: !firstError,
    dryRun: input.dryRun,
    schemaMode,
    actions,
    counts: {
      existingRows: registry.rows.length,
      activeRows: registry.rows.filter((row) => row.isActive).length,
    },
    error: firstError?.reason,
  };
}
