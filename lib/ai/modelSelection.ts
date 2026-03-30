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
  stickyMode?: StickyMode | null;
  stickySeed?: string | null;
  rolloutBucket?: number | null;
  challengerPercent?: number | null;
};

export type StickyMode = "user" | "session" | "prompt";

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
  if (!Number.isFinite(value) || value < 0) return fallback;
  return value;
}

function envString(name: string, fallback: string): string {
  const value = (process.env[name] ?? "").trim();
  return value || fallback;
}

function parseTaskTypeAllowlist(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function clampPercent(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.trunc(value)));
}

function stableHash(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index++) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function hashSeedToPercent(seed: string): number {
  return stableHash(seed) % 100;
}

export function normalizeStickyMode(value: string | null | undefined): StickyMode {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "session") return "session";
  if (normalized === "prompt") return "prompt";
  return "user";
}

function promptSeed(prompt: string): string {
  const normalized = prompt.trim();
  if (!normalized) return "prompt:empty";
  return `prompt:${stableHash(normalized)}`;
}

function isTaskSpecificEntry(
  taskTypes: string[] | null | undefined,
  taskType: string,
): boolean {
  return Array.isArray(taskTypes) && taskTypes.includes(taskType);
}

function preferTaskSpecificEntries<
  Entry extends {
    taskTypes: string[] | null;
  },
>(rows: Entry[], taskType: string): Entry[] {
  const specific = rows.filter((row) => isTaskSpecificEntry(row.taskTypes, taskType));
  return specific.length > 0 ? specific : rows;
}

export function resolveRolloutSeed(
  params: Pick<RunAIParams, "userId" | "sessionId" | "prompt">,
  stickyMode: StickyMode,
): string {
  if (stickyMode === "prompt") {
    return promptSeed(params.prompt ?? "");
  }

  if (stickyMode === "session") {
    return (
      (params.sessionId?.trim() ? `session:${params.sessionId.trim()}` : null) ??
      (params.userId?.trim() ? `user:${params.userId.trim()}` : null) ??
      promptSeed(params.prompt ?? "")
    );
  }

  return (
    (params.userId?.trim() ? `user:${params.userId.trim()}` : null) ??
    (params.sessionId?.trim() ? `session:${params.sessionId.trim()}` : null) ??
    promptSeed(params.prompt ?? "")
  );
}

export function selectModelSelectionFromEntries(args: {
  rows: Awaited<ReturnType<typeof listModelRegistryEntries>>["rows"];
  params: RunAIParams;
  stickyMode?: string | null;
  defaultChallengerPercent?: number;
}): ModelSelectionDecision {
  const stickyMode = normalizeStickyMode(args.stickyMode);
  const matchingRows = args.rows.filter((row) => isTaskTypeIncluded(row, args.params.taskType));
  const champions = preferTaskSpecificEntries(
    matchingRows.filter((row) => getEntryTrafficRole(row) === "champion"),
    args.params.taskType,
  );
  const challengers = preferTaskSpecificEntries(
    matchingRows.filter((row) => getEntryTrafficRole(row) === "challenger"),
    args.params.taskType,
  );

  if (champions.length === 0) {
    return {
      reason: "no_champion",
      selectedRole: null,
      selectedModelKey: null,
      selectedModelVersion: null,
      preferredProvider: null,
      modelOverride: null,
      stickyMode,
      stickySeed: null,
      rolloutBucket: null,
      challengerPercent: null,
    };
  }

  const champion = champions[0];

  if (champions.length > 1) {
    return {
      reason: "champion_ambiguous_fallback",
      selectedRole: "champion",
      selectedModelKey: champion.modelKey,
      selectedModelVersion: champion.modelVersion,
      preferredProvider: champion.provider,
      modelOverride: champion.providerModel,
      stickyMode,
      stickySeed: null,
      rolloutBucket: null,
      challengerPercent: null,
    };
  }

  if (challengers.length === 0) {
    return {
      reason: "champion_only",
      selectedRole: "champion",
      selectedModelKey: champion.modelKey,
      selectedModelVersion: champion.modelVersion,
      preferredProvider: champion.provider,
      modelOverride: champion.providerModel,
      stickyMode,
      stickySeed: null,
      rolloutBucket: null,
      challengerPercent: null,
    };
  }

  if (challengers.length > 1) {
    return {
      reason: "challenger_ambiguous_fallback",
      selectedRole: "champion",
      selectedModelKey: champion.modelKey,
      selectedModelVersion: champion.modelVersion,
      preferredProvider: champion.provider,
      modelOverride: champion.providerModel,
      stickyMode,
      stickySeed: null,
      rolloutBucket: null,
      challengerPercent: null,
    };
  }

  const challenger = challengers[0];
  const challengerPercent = clampPercent(
    challenger.trafficWeight ?? args.defaultChallengerPercent ?? 0,
    0,
  );

  if (challengerPercent <= 0) {
    return {
      reason: "challenger_zero_traffic",
      selectedRole: "champion",
      selectedModelKey: champion.modelKey,
      selectedModelVersion: champion.modelVersion,
      preferredProvider: champion.provider,
      modelOverride: champion.providerModel,
      stickyMode,
      stickySeed: null,
      rolloutBucket: null,
      challengerPercent,
    };
  }

  const stickySeed = resolveRolloutSeed(args.params, stickyMode);
  const rolloutBucket = hashSeedToPercent(stickySeed);
  const useChallenger = rolloutBucket < challengerPercent;
  const selected = useChallenger ? challenger : champion;

  return {
    reason: useChallenger ? "challenger_selected" : "champion_selected",
    selectedRole: useChallenger ? "challenger" : "champion",
    selectedModelKey: selected.modelKey,
    selectedModelVersion: selected.modelVersion,
    preferredProvider: selected.provider,
    modelOverride: selected.providerModel,
    stickyMode,
    stickySeed,
    rolloutBucket,
    challengerPercent,
  };
}

export async function resolveModelSelection(
  params: RunAIParams,
): Promise<ModelSelectionDecision> {
  const rolloutEnabled = envBool("AI_MODEL_ROLLOUT_ENABLED", true);
  const rolloutTaskTypes = parseTaskTypeAllowlist(
    envString("AI_MODEL_ROLLOUT_TASK_TYPES", ""),
  );
  const taskScopedEnabled = rolloutTaskTypes.includes(params.taskType);
  if (!rolloutEnabled && !taskScopedEnabled) {
    return {
      reason: rolloutTaskTypes.length > 0 ? "rollout_task_disabled" : "rollout_disabled",
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
        stickyMode: null,
        stickySeed: null,
        rolloutBucket: null,
        challengerPercent: null,
      };
    }

    return selectModelSelectionFromEntries({
      rows: registry.rows,
      params,
      stickyMode: envString("AI_MODEL_ROLLOUT_STICKY_MODE", "user"),
      defaultChallengerPercent: envNumber(
        "AI_MODEL_ROLLOUT_DEFAULT_CHALLENGER_PERCENT",
        0,
      ),
    });
  } catch (error) {
    console.warn("[ai/modelSelection] selection failed, falling back:", error);
    return {
      reason: "selection_error",
      selectedRole: null,
      selectedModelKey: null,
      selectedModelVersion: null,
      preferredProvider: null,
      modelOverride: null,
      stickyMode: null,
      stickySeed: null,
      rolloutBucket: null,
      challengerPercent: null,
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
    rolloutStickyMode: decision.stickyMode ?? null,
    rolloutStickySeed: decision.stickySeed ?? null,
    rolloutBucket: decision.rolloutBucket ?? null,
    challengerPercent: decision.challengerPercent ?? null,
  };
}
