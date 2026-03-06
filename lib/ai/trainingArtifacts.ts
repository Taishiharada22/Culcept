import "server-only";

import { createHash } from "crypto";
import { getAIServiceClient } from "./db";
import { exportAIDataset, type DatasetExportFilters } from "./exportDataset";

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
  const artifactsEnabled = envBool("AI_TRAINING_ARTIFACTS_ENABLED", false);
  if (!artifactsEnabled) {
    return {
      ok: false,
      enabled: false,
      error: "training_artifacts_disabled",
      rowsScanned: 0,
    };
  }

  const exportEnabled = envBool("AI_EXPORT_ENABLED", false);
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

  const artifactType = filters.artifactType ?? "fine_tune_jsonl";
  const payloadJson = exportResult.rows.map((row) => ({
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

  const payloadString = JSON.stringify(payloadJson);
  const checksum = createHash("sha256").update(payloadString).digest("hex").slice(0, 16);
  const artifactVersion = `v${Date.now()}-${checksum}`;

  const client = getAIServiceClient();
  if (!client) {
    return {
      ok: false,
      enabled: true,
      error: "service_role_unavailable",
      rowsScanned: exportResult.totalRunsScanned,
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
      rowsScanned: exportResult.totalRunsScanned,
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
    row_count: exportResult.rows.length,
    status: "generated",
    checksum,
    notes: filters.notes ?? null,
    metadata: {
      storeMode,
      totalRunsScanned: exportResult.totalRunsScanned,
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
      rowsScanned: exportResult.totalRunsScanned,
    };
  }

  return {
    ok: true,
    enabled: true,
    rowsScanned: exportResult.totalRunsScanned,
    summary: {
      id: inserted.id,
      artifactType,
      artifactVersion,
      rowCount: exportResult.rows.length,
      status: "generated",
      checksum,
      storeMode,
      storagePath: null,
      deduped: false,
    },
  };
}
