import "server-only";

import { createHash } from "crypto";
import { getAIServiceClient } from "./db";
import { exportAIDataset, type DatasetExportFilters } from "./exportDataset";
import {
  exportStargazerTeacherDataset,
  exportStargazerTrainingDataset,
} from "@/lib/stargazer/exportDataset";
import { exportObservationDataset } from "@/lib/stargazer/exportObservationDataset";
import { isStargazerTrainingArtifactType } from "@/lib/stargazer/studentTrack";
import {
  exportOrbiterTeacherDataset,
  exportOrbiterTrainingDataset,
} from "@/lib/orbiter/exportDataset";
import { isOrbiterTrainingArtifactType } from "@/lib/orbiter/studentTrack";
import {
  exportIdentityTeacherDataset,
  exportIdentityTrainingDataset,
} from "@/lib/identity/exportDataset";
import { isIdentityTrainingArtifactType } from "@/lib/identity/studentTrack";

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

function envString(name: string, fallback: string): string {
  const value = (process.env[name] ?? "").trim();
  return value || fallback;
}

export type TrainingArtifactSummary = {
  id: string;
  artifactType: string;
  artifactVersion: string;
  rowCount: number;
  status: string;
  checksum: string;
  storeMode: string;
  storagePath: string | null;
  deduped: boolean;
};

export type TrainingArtifactResult = {
  ok: boolean;
  enabled: boolean;
  error?: string;
  rowsScanned?: number;
  summary?: TrainingArtifactSummary;
};

type ArtifactInput = DatasetExportFilters & {
  artifactType?: string;
  notes?: string;
};

export async function generateTrainingArtifact(
  filters: ArtifactInput,
): Promise<TrainingArtifactResult> {
  const artifactsEnabled = envBool("AI_TRAINING_ARTIFACTS_ENABLED", true);
  if (!artifactsEnabled) {
    return {
      ok: false,
      enabled: false,
      error: "training_artifacts_disabled",
      rowsScanned: 0,
    };
  }

  const exportEnabled = envBool("AI_EXPORT_ENABLED", true);
  if (!exportEnabled) {
    return {
      ok: false,
      enabled: false,
      error: "dataset_export_disabled",
      rowsScanned: 0,
    };
  }

  const maxRows = envNumber("AI_TRAINING_ARTIFACT_MAX_ROWS", 1000);
  const storeMode = envString("AI_TRAINING_ARTIFACT_STORE_MODE", "db");
  const artifactType = filters.artifactType ?? "fine_tune_jsonl";

  let payloadJson: Record<string, unknown>[];
  let rowsScanned: number;

  if (artifactType === "stargazer_training_jsonl") {
    const exportResult = await exportStargazerTrainingDataset({
      ...filters,
      limit: filters.limit ?? maxRows,
    });

    if (!exportResult.enabled) {
      return {
        ok: false,
        enabled: false,
        error: "dataset_export_disabled",
        rowsScanned: 0,
      };
    }

    if (exportResult.rows.length === 0) {
      return {
        ok: false,
        enabled: true,
        error: "no_data_available",
        rowsScanned: exportResult.totalCandidatesScanned,
      };
    }

    payloadJson = exportResult.rows as unknown as Record<string, unknown>[];
    rowsScanned = exportResult.totalCandidatesScanned;
  } else if (artifactType === "stargazer_teacher_jsonl") {
    const exportResult = await exportStargazerTeacherDataset({
      ...filters,
      limit: filters.limit ?? maxRows,
    });

    if (!exportResult.enabled) {
      return {
        ok: false,
        enabled: false,
        error: "dataset_export_disabled",
        rowsScanned: 0,
      };
    }

    if (exportResult.rows.length === 0) {
      return {
        ok: false,
        enabled: true,
        error: "no_data_available",
        rowsScanned: exportResult.totalRunsScanned,
      };
    }

    payloadJson = exportResult.rows
      .filter((row) => (row.teacherResponse ?? row.responseText ?? "").trim().length > 0)
      .map((row) => ({
        messages: [
          ...(row.systemPrompt ? [{ role: "system", content: row.systemPrompt }] : []),
          { role: "user", content: row.promptText },
          {
            role: "assistant",
            content: row.teacherResponse ?? row.responseText ?? "",
          },
        ],
        metadata: {
          track: "stargazer",
          taskType: row.taskType,
          aiRunId: row.aiRunId,
          provider: row.provider,
          model: row.model,
          acceptedEntityIds: row.acceptedEntityIds,
          rejectedCount: row.rejectedCount,
          outcomeSummary: row.outcomeSummary,
          evals: row.evals,
        },
      }));
    rowsScanned = exportResult.totalRunsScanned;

    if (payloadJson.length === 0) {
      return {
        ok: false,
        enabled: true,
        error: "no_data_available",
        rowsScanned,
      };
    }
  } else if (artifactType === "stargazer_observation_jsonl") {
    const exportResult = await exportObservationDataset({
      lookbackDays: filters.lookbackHours ? Math.ceil(filters.lookbackHours / 24) : 30,
      limit: filters.limit ?? maxRows,
    });

    if (!exportResult.ok) {
      return {
        ok: false,
        enabled: true,
        error: exportResult.error ?? "export_failed",
        rowsScanned: exportResult.totalSessionsScanned,
      };
    }

    if (exportResult.rows.length === 0) {
      return {
        ok: false,
        enabled: true,
        error: "no_observation_data",
        rowsScanned: exportResult.totalSessionsScanned,
      };
    }

    payloadJson = exportResult.rows as unknown as Record<string, unknown>[];
    rowsScanned = exportResult.totalSessionsScanned;
  } else if (artifactType === "orbiter_training_jsonl") {
    const exportResult = await exportOrbiterTrainingDataset({
      ...filters,
      limit: filters.limit ?? maxRows,
    });

    if (!exportResult.enabled) {
      return {
        ok: false,
        enabled: false,
        error: "dataset_export_disabled",
        rowsScanned: 0,
      };
    }

    if (exportResult.rows.length === 0) {
      return {
        ok: false,
        enabled: true,
        error: "no_data_available",
        rowsScanned: exportResult.totalRunsScanned,
      };
    }

    payloadJson = exportResult.rows as unknown as Record<string, unknown>[];
    rowsScanned = exportResult.totalRunsScanned;
  } else if (artifactType === "orbiter_teacher_jsonl") {
    const exportResult = await exportOrbiterTeacherDataset({
      ...filters,
      limit: filters.limit ?? maxRows,
    });

    if (!exportResult.enabled) {
      return {
        ok: false,
        enabled: false,
        error: "dataset_export_disabled",
        rowsScanned: 0,
      };
    }

    if (exportResult.rows.length === 0) {
      return {
        ok: false,
        enabled: true,
        error: "no_data_available",
        rowsScanned: exportResult.totalRunsScanned,
      };
    }

    payloadJson = exportResult.rows.map((row) => ({
      messages: [
        ...(row.systemPrompt ? [{ role: "system", content: row.systemPrompt }] : []),
        { role: "user", content: row.promptText },
        {
          role: "assistant",
          content: row.teacherResponse ?? row.responseText ?? "",
        },
      ],
      metadata: {
        track: "orbiter",
        taskType: row.taskType,
        aiRunId: row.aiRunId,
        userId: row.userId,
        candidateId: row.candidateId,
        isShadow: row.isShadow,
        selectedRole: row.selectedRole,
        shadowOfAiRunId: row.shadowOfAiRunId,
        provider: row.provider,
        model: row.model,
        teacherProvider: row.teacherProvider,
        teacherModel: row.teacherModel,
        summaryText: row.summaryText,
        evals: row.evals,
      },
    }));
    rowsScanned = exportResult.totalRunsScanned;

    if (payloadJson.length === 0) {
      return {
        ok: false,
        enabled: true,
        error: "no_data_available",
        rowsScanned,
      };
    }
  } else if (artifactType === "identity_training_jsonl") {
    const exportResult = await exportIdentityTrainingDataset({
      ...filters,
      limit: filters.limit ?? maxRows,
    });

    if (!exportResult.enabled) {
      return {
        ok: false,
        enabled: false,
        error: "dataset_export_disabled",
        rowsScanned: 0,
      };
    }

    if (exportResult.rows.length === 0) {
      return {
        ok: false,
        enabled: true,
        error: "no_data_available",
        rowsScanned: exportResult.totalRunsScanned,
      };
    }

    payloadJson = exportResult.rows as unknown as Record<string, unknown>[];
    rowsScanned = exportResult.totalRunsScanned;
  } else if (artifactType === "identity_teacher_jsonl") {
    const exportResult = await exportIdentityTeacherDataset({
      ...filters,
      limit: filters.limit ?? maxRows,
    });

    if (!exportResult.enabled) {
      return {
        ok: false,
        enabled: false,
        error: "dataset_export_disabled",
        rowsScanned: 0,
      };
    }

    if (exportResult.rows.length === 0) {
      return {
        ok: false,
        enabled: true,
        error: "no_data_available",
        rowsScanned: exportResult.totalRunsScanned,
      };
    }

    payloadJson = exportResult.rows.map((row) => ({
      messages: [
        ...(row.systemPrompt ? [{ role: "system", content: row.systemPrompt }] : []),
        { role: "user", content: row.promptText },
        {
          role: "assistant",
          content: row.teacherResponse ?? row.responseText ?? "",
        },
      ],
      metadata: {
        track: "identity",
        taskType: row.taskType,
        aiRunId: row.aiRunId,
        userId: row.userId,
        isShadow: row.isShadow,
        selectedRole: row.selectedRole,
        shadowOfAiRunId: row.shadowOfAiRunId,
        provider: row.provider,
        model: row.model,
        teacherProvider: row.teacherProvider,
        teacherModel: row.teacherModel,
        profileText: row.profileText,
        snapshotId: row.snapshotId,
        evals: row.evals,
      },
    }));
    rowsScanned = exportResult.totalRunsScanned;

    if (payloadJson.length === 0) {
      return {
        ok: false,
        enabled: true,
        error: "no_data_available",
        rowsScanned,
      };
    }
  } else {
    const exportResult = await exportAIDataset({
      ...filters,
      limit: filters.limit ?? maxRows,
    });

    if (!exportResult.enabled) {
      return {
        ok: false,
        enabled: false,
        error: "dataset_export_disabled",
        rowsScanned: 0,
      };
    }

    if (exportResult.rows.length === 0) {
      return {
        ok: false,
        enabled: true,
        error: "no_data_available",
        rowsScanned: exportResult.totalRunsScanned,
      };
    }

    payloadJson = exportResult.rows.map((row) => ({
      messages: [
        ...(row.systemPrompt ? [{ role: "system", content: row.systemPrompt }] : []),
        { role: "user", content: row.promptText },
        { role: "assistant", content: row.teacherResponse ?? row.responseText },
      ],
      metadata: {
        taskType: row.taskType,
        provider: row.provider,
        model: row.model,
        evalScore: row.evalScore,
      },
    }));
    rowsScanned = exportResult.totalRunsScanned;
  }

  const payloadString = JSON.stringify(payloadJson);
  const checksum = createHash("sha256").update(payloadString).digest("hex").slice(0, 16);
  const artifactVersion = `v${Date.now()}-${checksum}`;

  const client = getAIServiceClient();
  if (!client) {
    return {
      ok: false,
      enabled: true,
      error: "service_role_unavailable",
      rowsScanned,
    };
  }

  // Check for duplicate checksum
  const { data: existing } = await client
    .from("ai_training_artifacts")
    .select("id, artifact_type, artifact_version, row_count, status, checksum")
    .eq("checksum", checksum)
    .eq("artifact_type", artifactType)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return {
      ok: true,
      enabled: true,
      rowsScanned,
      summary: {
        id: existing.id,
        artifactType: existing.artifact_type,
        artifactVersion: existing.artifact_version,
        rowCount: existing.row_count,
        status: existing.status,
        checksum: existing.checksum,
        storeMode,
        storagePath: null,
        deduped: true,
      },
    };
  }

  const row: Record<string, unknown> = {
    artifact_type: artifactType,
    artifact_version: artifactVersion,
    source_filters: filters,
    row_count: payloadJson.length,
    status: "generated",
    checksum,
    notes: filters.notes ?? null,
    metadata: {
      storeMode,
      totalRunsScanned: rowsScanned,
      studentTrack: isStargazerTrainingArtifactType(artifactType)
        ? "stargazer"
        : isOrbiterTrainingArtifactType(artifactType)
          ? "orbiter"
          : isIdentityTrainingArtifactType(artifactType)
            ? "identity"
          : null,
    },
  };

  if (storeMode === "db") {
    row.payload_json = payloadJson;
  }

  const { data: inserted, error: insertError } = await client
    .from("ai_training_artifacts")
    .insert(row)
    .select("id")
    .single();

  if (insertError) {
    console.error("[ai/trainingArtifacts] insert failed:", insertError.message);
    return {
      ok: false,
      enabled: true,
      error: insertError.message,
      rowsScanned,
    };
  }

  return {
    ok: true,
    enabled: true,
    rowsScanned,
    summary: {
      id: inserted.id,
      artifactType,
      artifactVersion,
      rowCount: payloadJson.length,
      status: "generated",
      checksum,
      storeMode,
      storagePath: null,
      deduped: false,
    },
  };
}
