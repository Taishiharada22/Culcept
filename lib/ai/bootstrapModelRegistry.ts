import "server-only";

import { getAIServiceClient } from "./db";
import { listModelRegistryEntries, getEntryTrafficRole } from "./modelRegistry";
import type { AIProviderName } from "./types";

export type BootstrapModelRegistryInput = {
  dryRun: boolean;
  champion?: {
    provider?: AIProviderName;
    modelKey?: string;
    modelVersion?: string;
    taskTypes?: string[];
  };
  challenger?: {
    enabled?: boolean;
    provider?: AIProviderName;
    modelKey?: string;
    modelVersion?: string;
    taskTypes?: string[];
    trafficWeight?: number;
    isActive?: boolean;
  };
};

export type BootstrapAction = {
  role: string;
  modelKey: string;
  modelVersion: string;
  provider: AIProviderName;
  action: "created" | "updated" | "unchanged";
  id: string | null;
  changedFields: string[];
  reason?: string;
};

export type BootstrapResult = {
  ok: boolean;
  dryRun: boolean;
  schemaMode: "extended" | "base";
  actions: BootstrapAction[];
  counts: {
    existingRows: number;
    activeRows: number;
  };
  error?: string;
};

export async function checkModelRegistryReadable(): Promise<{
  ok: boolean;
  schemaMode: "extended" | "base";
  totalRows: number;
  activeRows: number;
  error?: string;
}> {
  const registry = await listModelRegistryEntries({ includeInactive: true, limit: 200 });
  if (!registry.ok) {
    return {
      ok: false,
      schemaMode: registry.schemaMode,
      totalRows: 0,
      activeRows: 0,
      error: registry.error,
    };
  }

  return {
    ok: true,
    schemaMode: registry.schemaMode,
    totalRows: registry.rows.length,
    activeRows: registry.rows.filter((r) => r.isActive).length,
  };
}

export async function bootstrapModelRegistry(
  input: BootstrapModelRegistryInput,
): Promise<BootstrapResult> {
  const registry = await listModelRegistryEntries({ includeInactive: true, limit: 200 });
  const schemaMode = registry.schemaMode;

  if (!registry.ok) {
    return {
      ok: false,
      dryRun: input.dryRun,
      schemaMode,
      actions: [],
      counts: { existingRows: 0, activeRows: 0 },
      error: registry.error ?? "model_registry_unavailable",
    };
  }

  const existingRows = registry.rows.length;
  const activeRows = registry.rows.filter((r) => r.isActive).length;
  const actions: BootstrapAction[] = [];

  // Champion
  const championProvider = input.champion?.provider ?? "ollama";
  const championModelKey = input.champion?.modelKey ?? "aneurasync-primary";
  const championModelVersion = input.champion?.modelVersion ?? "llama3.1";
  const championTaskTypes = input.champion?.taskTypes ?? null;

  const existingChampion = registry.rows.find(
    (r) =>
      r.modelKey === championModelKey &&
      getEntryTrafficRole(r) === "champion",
  );

  if (existingChampion) {
    const changedFields: string[] = [];

    if (existingChampion.provider !== championProvider) changedFields.push("provider");
    if (!existingChampion.isActive) changedFields.push("is_active");

    if (changedFields.length === 0) {
      actions.push({
        role: "champion",
        modelKey: championModelKey,
        modelVersion: championModelVersion,
        provider: championProvider,
        action: "unchanged",
        id: existingChampion.id,
        changedFields: [],
      });
    } else {
      if (!input.dryRun) {
        const client = getAIServiceClient();
        if (client) {
          await client
            .from("model_registry")
            .update({
              provider: championProvider,
              is_active: true,
              model_version: championModelVersion,
            })
            .eq("id", existingChampion.id);
        }
      }

      actions.push({
        role: "champion",
        modelKey: championModelKey,
        modelVersion: championModelVersion,
        provider: championProvider,
        action: input.dryRun ? "unchanged" : "updated",
        id: existingChampion.id,
        changedFields,
        reason: input.dryRun ? "dry_run" : undefined,
      });
    }
  } else {
    const row: Record<string, unknown> = {
      model_key: championModelKey,
      model_version: championModelVersion,
      model_role: "champion",
      provider: championProvider,
      is_active: true,
      rollout_percent: 100,
      metadata: { bootstrapped: true, createdAt: new Date().toISOString() },
    };

    if (schemaMode === "extended") {
      row.traffic_role = "champion";
      row.traffic_weight = 100;
      row.task_types = championTaskTypes;
      row.promotion_status = "promoted";
      row.notes = "bootstrapped champion";
    }

    const changedFields = Object.keys(row);
    let insertedId: string | null = null;

    if (!input.dryRun) {
      const client = getAIServiceClient();
      if (client) {
        const { data, error } = await client
          .from("model_registry")
          .insert(row)
          .select("id")
          .single();

        if (error) {
          return {
            ok: false,
            dryRun: input.dryRun,
            schemaMode,
            actions: [],
            counts: { existingRows, activeRows },
            error: error.message,
          };
        }
        insertedId = data?.id ?? null;
      }
    }

    actions.push({
      role: "champion",
      modelKey: championModelKey,
      modelVersion: championModelVersion,
      provider: championProvider,
      action: input.dryRun ? "created" : "created",
      id: insertedId,
      changedFields,
      reason: input.dryRun ? "dry_run" : undefined,
    });
  }

  // Challenger (optional)
  if (input.challenger?.enabled) {
    const challengerProvider = input.challenger.provider ?? "gemini";
    const challengerModelKey = input.challenger.modelKey ?? "aneurasync-challenger";
    const challengerModelVersion = input.challenger.modelVersion ?? "gemini-2.0-flash";
    const challengerTrafficWeight = input.challenger.trafficWeight ?? 10;
    const challengerTaskTypes = input.challenger.taskTypes ?? null;
    const challengerIsActive = input.challenger.isActive ?? true;

    const existingChallenger = registry.rows.find(
      (r) =>
        r.modelKey === challengerModelKey &&
        getEntryTrafficRole(r) === "challenger",
    );

    if (!existingChallenger && !input.dryRun) {
      const client = getAIServiceClient();
      if (client) {
        const row: Record<string, unknown> = {
          model_key: challengerModelKey,
          model_version: challengerModelVersion,
          model_role: "challenger",
          provider: challengerProvider,
          is_active: challengerIsActive,
          rollout_percent: challengerTrafficWeight,
          metadata: { bootstrapped: true, createdAt: new Date().toISOString() },
        };

        if (schemaMode === "extended") {
          row.traffic_role = "challenger";
          row.traffic_weight = challengerTrafficWeight;
          row.task_types = challengerTaskTypes;
          row.promotion_status = "candidate";
          row.notes = "bootstrapped challenger";
        }

        const { data } = await client
          .from("model_registry")
          .insert(row)
          .select("id")
          .single();

        actions.push({
          role: "challenger",
          modelKey: challengerModelKey,
          modelVersion: challengerModelVersion,
          provider: challengerProvider,
          action: "created",
          id: data?.id ?? null,
          changedFields: Object.keys(row),
        });
      }
    } else if (existingChallenger) {
      actions.push({
        role: "challenger",
        modelKey: challengerModelKey,
        modelVersion: challengerModelVersion,
        provider: challengerProvider,
        action: "unchanged",
        id: existingChallenger.id,
        changedFields: [],
      });
    } else {
      actions.push({
        role: "challenger",
        modelKey: challengerModelKey,
        modelVersion: challengerModelVersion,
        provider: challengerProvider,
        action: "created",
        id: null,
        changedFields: [],
        reason: "dry_run",
      });
    }
  }

  return {
    ok: true,
    dryRun: input.dryRun,
    schemaMode,
    actions,
    counts: { existingRows, activeRows },
  };
}
