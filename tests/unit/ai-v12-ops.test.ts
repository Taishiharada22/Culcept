import { vi, describe, it, expect } from "vitest";

// Mock server-only (not available in test environment)
vi.mock("server-only", () => ({}));

import {
  buildBootstrapDesiredEntries,
  computeBootstrapChangedFields,
} from "../../lib/ai/bootstrapModelRegistry";
import { normalizeAIOpsError } from "../../lib/ai/errors";
import type { ModelRegistryEntry } from "../../lib/ai/modelRegistry";
import {
  hashSeedToPercent,
  resolveModelSelection,
  resolveRolloutSeed,
  selectModelSelectionFromEntries,
} from "../../lib/ai/modelSelection";
import { normalizeSmokeMode, runAISmokeTest } from "../../lib/ai/smokeTest";

function makeRegistryEntry(
  overrides: Partial<ModelRegistryEntry> = {},
): ModelRegistryEntry {
  return {
    id: overrides.id ?? "row-1",
    createdAt: overrides.createdAt ?? "2026-03-07T00:00:00.000Z",
    modelKey: overrides.modelKey ?? "aneurasync-primary",
    modelVersion: overrides.modelVersion ?? "gemini-2.5-flash",
    modelRole: overrides.modelRole ?? "champion",
    provider: overrides.provider ?? "gemini",
    isActive: overrides.isActive ?? true,
    rolloutPercent: overrides.rolloutPercent ?? 100,
    metadata: overrides.metadata ?? null,
    trafficRole: overrides.trafficRole ?? "champion",
    trafficWeight: overrides.trafficWeight ?? 100,
    taskTypes: overrides.taskTypes ?? ["summary"],
    promotionStatus: overrides.promotionStatus ?? "promoted",
    promotedAt: overrides.promotedAt ?? null,
    demotedAt: overrides.demotedAt ?? null,
    notes: overrides.notes ?? null,
    providerModel: overrides.providerModel ?? overrides.modelVersion ?? "gemini-2.5-flash",
  };
}

describe("AI Ops v12", () => {
  it("normalizeAIOpsError maps connectivity and storage failures", () => {
    const connectivity = normalizeAIOpsError(new TypeError("fetch failed"));
    expect(connectivity.code).toBe("db_connectivity_error");

    const storage = normalizeAIOpsError("storage_upload_failed: bucket missing");
    expect(storage.code).toBe("artifact_storage_unavailable");
    expect(typeof storage.detail).toBe("string");

    const noData = normalizeAIOpsError("no_data_available");
    expect(noData.code).toBe("no_data_available");
  });

  it("buildBootstrapDesiredEntries returns champion by default and optional challenger", () => {
    const championOnly = buildBootstrapDesiredEntries({
      dryRun: true,
      challenger: { enabled: false },
    });

    expect(championOnly.length).toBe(1);
    expect(championOnly[0]?.modelRole).toBe("champion");
    expect(championOnly[0]?.rolloutPercent).toBe(100);

    const withChallenger = buildBootstrapDesiredEntries({
      dryRun: true,
      challenger: {
        enabled: true,
        provider: "gemini",
        modelKey: "candidate",
        modelVersion: "gemini-2.5-flash",
        trafficWeight: 10,
        taskTypes: ["summary"],
      },
    });

    expect(withChallenger.length).toBe(2);
    expect(withChallenger[1]?.modelRole).toBe("challenger");
    expect(withChallenger[1]?.trafficWeight).toBe(10);
  });

  it("computeBootstrapChangedFields catches version and rollout changes", () => {
    const desired = buildBootstrapDesiredEntries({
      dryRun: true,
      champion: {
        modelKey: "aneurasync-primary",
        modelVersion: "gemini-2.5-flash",
        taskTypes: ["summary", "classification"],
      },
      challenger: { enabled: false },
    })[0];

    expect(desired).toBeTruthy();

    const existing = makeRegistryEntry({
      modelKey: "aneurasync-primary",
      modelVersion: "llama3.1",
      taskTypes: ["summary"],
      trafficWeight: 100,
      rolloutPercent: 100,
      metadata: { source: "old" },
    });

    const changedFields = computeBootstrapChangedFields({
      existing,
      desired: desired!,
    });

    expect(changedFields).toContain("model_version");
    expect(changedFields).toContain("task_types");
  });

  it("resolveRolloutSeed is deterministic across sticky modes", () => {
    const params = {
      userId: "user-1",
      sessionId: "session-1",
      prompt: "Summarize this prompt",
    };

    expect(resolveRolloutSeed(params, "user")).toBe("user:user-1");
    expect(resolveRolloutSeed(params, "session")).toBe("session:session-1");
    expect(resolveRolloutSeed(params, "prompt")).toMatch(/^prompt:\d+$/);
    expect(hashSeedToPercent("user:user-1")).toBe(hashSeedToPercent("user:user-1"));
  });

  it("selectModelSelectionFromEntries falls back to champion on challenger ambiguity", () => {
    const decision = selectModelSelectionFromEntries({
      rows: [
        makeRegistryEntry({
          id: "champion-1",
          modelRole: "champion",
          trafficRole: "champion",
          modelKey: "champion",
          modelVersion: "v1",
          provider: "gemini",
        }),
        makeRegistryEntry({
          id: "challenger-1",
          modelRole: "challenger",
          trafficRole: "challenger",
          modelKey: "challenger-a",
          modelVersion: "v2",
          provider: "gemini",
          trafficWeight: 10,
        }),
        makeRegistryEntry({
          id: "challenger-2",
          modelRole: "challenger",
          trafficRole: "challenger",
          modelKey: "challenger-b",
          modelVersion: "v3",
          provider: "gemini",
          trafficWeight: 15,
        }),
      ],
      params: {
        taskType: "summary",
        prompt: "Prompt A",
        userId: "user-1",
      },
      stickyMode: "user",
      defaultChallengerPercent: 5,
    });

    expect(decision.reason).toBe("challenger_ambiguous_fallback");
    expect(decision.selectedRole).toBe("champion");
    expect(decision.selectedModelKey).toBe("champion");
  });

  it("resolveModelSelection returns rollout_disabled when feature flag is off", async () => {
    const previous = process.env.AI_MODEL_ROLLOUT_ENABLED;
    process.env.AI_MODEL_ROLLOUT_ENABLED = "false";

    try {
      const decision = await resolveModelSelection({
        taskType: "summary",
        prompt: "test prompt",
      });

      expect(decision.reason).toBe("rollout_disabled");
      expect(decision.selectedRole).toBeNull();
    } finally {
      if (previous === undefined) {
        delete process.env.AI_MODEL_ROLLOUT_ENABLED;
      } else {
        process.env.AI_MODEL_ROLLOUT_ENABLED = previous;
      }
    }
  });

  it("smoke helper returns structured teacher eligibility check without side effects", async () => {
    expect(normalizeSmokeMode("teacher_eligibility")).toBe("teacher_eligibility");
    expect(normalizeSmokeMode("unknown")).toBe("all");

    const result = await runAISmokeTest({
      mode: "teacher_eligibility",
      liveProvider: false,
      mutate: false,
    });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("teacher_eligibility");
    expect(result.checks.length).toBe(1);
    expect(result.checks[0]?.mode).toBe("teacher_eligibility");
    expect(result.checks[0]?.status).toBe("passed");
  });
});
