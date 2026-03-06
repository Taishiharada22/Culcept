import "server-only";

import {
  getEntryTrafficRole,
  isTaskTypeIncluded,
  listModelRegistryEntries,
} from "./modelRegistry";
import type { AIProviderName, RunAIParams } from "./types";

export type ModelSelectionDecision = {
  reason: string;
  selectedRole: string | null;
  selectedModelKey: string | null;
  selectedModelVersion: string | null;
  preferredProvider: AIProviderName | null;
  modelOverride: string | null;
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
  if (!Number.isFinite(value) || value < 0) return fallback;
  return value;
}

function envString(name: string, fallback: string): string {
  const value = (process.env[name] ?? "").trim();
  return value || fallback;
}

function hashToPercent(userId: string | undefined, sessionId: string | undefined): number {
  const seed = userId ?? sessionId ?? `anon-${Date.now()}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 100;
}

export async function resolveModelSelection(
  params: RunAIParams,
): Promise<ModelSelectionDecision> {
  const rolloutEnabled = envBool("AI_MODEL_ROLLOUT_ENABLED", false);
  if (!rolloutEnabled) {
    return {
      reason: "rollout_disabled",
      selectedRole: null,
      selectedModelKey: null,
      selectedModelVersion: null,
      preferredProvider: null,
      modelOverride: null,
    };
  }

  try {
    const registry = await listModelRegistryEntries({
      includeInactive: false,
      limit: 100,
    });

    if (!registry.ok || registry.rows.length === 0) {
      return {
        reason: "registry_unavailable",
        selectedRole: null,
        selectedModelKey: null,
        selectedModelVersion: null,
        preferredProvider: null,
        modelOverride: null,
      };
    }

    const champion = registry.rows.find(
      (row) =>
        getEntryTrafficRole(row) === "champion" &&
        isTaskTypeIncluded(row, params.taskType),
    );

    const challenger = registry.rows.find(
      (row) =>
        getEntryTrafficRole(row) === "challenger" &&
        isTaskTypeIncluded(row, params.taskType),
    );

    if (!champion) {
      return {
        reason: "no_champion",
        selectedRole: null,
        selectedModelKey: null,
        selectedModelVersion: null,
        preferredProvider: null,
        modelOverride: null,
      };
    }

    if (!challenger) {
      return {
        reason: "champion_only",
        selectedRole: "champion",
        selectedModelKey: champion.modelKey,
        selectedModelVersion: champion.modelVersion,
        preferredProvider: champion.provider,
        modelOverride: champion.providerModel,
      };
    }

    const stickyMode = envString("AI_MODEL_ROLLOUT_STICKY_MODE", "user");
    const challengerPercent = challenger.trafficWeight ?? envNumber("AI_MODEL_ROLLOUT_DEFAULT_CHALLENGER_PERCENT", 0);

    if (challengerPercent <= 0) {
      return {
        reason: "challenger_zero_traffic",
        selectedRole: "champion",
        selectedModelKey: champion.modelKey,
        selectedModelVersion: champion.modelVersion,
        preferredProvider: champion.provider,
        modelOverride: champion.providerModel,
      };
    }

    const bucket = stickyMode === "user"
      ? hashToPercent(params.userId, params.sessionId)
      : hashToPercent(undefined, `${Date.now()}`);

    const isChallenger = bucket < challengerPercent;

    const selected = isChallenger ? challenger : champion;
    return {
      reason: isChallenger ? "challenger_selected" : "champion_selected",
      selectedRole: isChallenger ? "challenger" : "champion",
      selectedModelKey: selected.modelKey,
      selectedModelVersion: selected.modelVersion,
      preferredProvider: selected.provider,
      modelOverride: selected.providerModel,
    };
  } catch (error) {
    console.warn("[ai/modelSelection] selection failed, falling back:", error);
    return {
      reason: "selection_error",
      selectedRole: null,
      selectedModelKey: null,
      selectedModelVersion: null,
      preferredProvider: null,
      modelOverride: null,
    };
  }
}

export function toModelSelectionMetadata(
  decision: ModelSelectionDecision,
): Record<string, unknown> {
  return {
    modelSelectionReason: decision.reason,
    selectedRole: decision.selectedRole,
    selectedModelKey: decision.selectedModelKey,
    selectedModelVersion: decision.selectedModelVersion,
  };
}
