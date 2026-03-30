import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  StargazerCandidateEntityType,
  StargazerCandidateAuditEntry,
  StargazerGenerationSourceStage,
  StargazerStudentTaskType,
} from "./studentTrack";

function asObjectOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function buildSyntheticStargazerNegativeEntry(args: {
  entityType: StargazerCandidateEntityType;
  rejectionReason: string;
  candidateJson?: Record<string, unknown> | null;
  normalizedOutput?: Record<string, unknown> | null;
  candidateIndex?: number;
  axisId?: string | null;
  lensId?: string | null;
}): StargazerCandidateAuditEntry {
  return {
    entityType: args.entityType,
    candidateIndex: args.candidateIndex ?? -1,
    candidateJson: args.candidateJson ?? null,
    normalizedOutput: args.normalizedOutput ?? null,
    accepted: false,
    rejectionReason: args.rejectionReason,
    axisId: args.axisId ?? null,
    lensId: args.lensId ?? null,
  };
}

export function inferStargazerHardNegativeKind(
  rejectionReason: string | null | undefined,
): string | null {
  const normalized = (rejectionReason ?? "").trim();
  if (!normalized) return null;
  if (normalized.startsWith("rejected_candidate:")) {
    return normalized.slice("rejected_candidate:".length) || "rejected_candidate";
  }
  if (normalized.startsWith("hard_negative:")) {
    return normalized.slice("hard_negative:".length) || "hard_negative";
  }
  if (normalized.startsWith("provider_failure:")) return "provider_failure";
  if (normalized.startsWith("pool_insert_failed:")) return "pool_insert_failed";
  if (normalized === "lens_save_failed") return "lens_save_failed";
  return inferStargazerRejectedCandidateKind(normalized);
}

export function inferStargazerRejectedCandidateKind(
  rejectionReason: string | null | undefined,
): string {
  const normalized = (rejectionReason ?? "").trim().toLowerCase();
  if (!normalized) return "rejected_candidate";
  if (normalized.startsWith("rejected_candidate:")) {
    return normalized.slice("rejected_candidate:".length) || "rejected_candidate";
  }
  if (normalized.includes("prompt is missing")) return "validation_prompt_missing";
  if (normalized.startsWith("prompt length")) return "validation_prompt_length";
  if (normalized.startsWith("expected 4 options")) return "validation_option_count";
  if (normalized.includes(".label is invalid")) return "validation_option_label";
  if (normalized.includes(".score") && normalized.includes("out of range")) {
    return "validation_option_score_range";
  }
  if (normalized.includes("scores must span")) return "validation_score_span";
  if (normalized === "not an object") return "validation_not_object";
  if (normalized.includes("name_ja is missing")) return "validation_name_missing";
  if (normalized.includes("description is missing")) {
    return "validation_description_missing";
  }
  if (normalized.includes("probing_targets must be a non-empty array")) {
    return "validation_probing_targets";
  }
  if (normalized.includes("related_axes must be a non-empty array")) {
    return "validation_related_axes";
  }
  if (normalized.startsWith("name_ja length")) return "validation_name_length";
  if (normalized.startsWith("description length")) {
    return "validation_description_length";
  }
  if (normalized.includes("too similar to existing lens")) return "duplicate_or_too_similar";
  if (normalized.includes("duplicate")) return "duplicate_or_too_similar";
  if (normalized.includes("validation_failed")) return "validation_failed";
  return "rejected_candidate";
}

export function buildStargazerRejectedCandidateReason(
  rejectionReason: string | null | undefined,
): string {
  return `rejected_candidate:${inferStargazerRejectedCandidateKind(rejectionReason)}`;
}

export async function persistStargazerGenerationCandidates(args: {
  supabase: SupabaseClient;
  aiRunId?: string | null;
  batchId?: string | null;
  taskType: StargazerStudentTaskType;
  sourceStage: StargazerGenerationSourceStage;
  requestContext?: unknown;
  entries: StargazerCandidateAuditEntry[];
}): Promise<void> {
  if (args.entries.length === 0) return;

  const rows = args.entries.map((entry) => ({
    batch_id: args.batchId ?? null,
    ai_run_id: args.aiRunId ?? null,
    task_type: args.taskType,
    source_stage: args.sourceStage,
    entity_type: entry.entityType,
    axis_id: entry.axisId ?? null,
    lens_id: entry.lensId ?? null,
    candidate_index: entry.candidateIndex,
    request_context: asObjectOrNull(args.requestContext) ?? {},
    candidate_json: entry.candidateJson ?? {},
    normalized_output: entry.normalizedOutput ?? null,
    acceptance_status: entry.accepted ? "accepted" : "rejected",
    accepted_entity_id: entry.acceptedEntityId ?? null,
    rejection_reason: entry.accepted ? null : entry.rejectionReason ?? "rejected",
  }));

  const { error } = await args.supabase
    .from("stargazer_generation_candidates")
    .insert(rows);

  if (error) {
    console.warn(
      "[stargazer/trainingAssets] failed to persist generation candidates:",
      error.message,
    );
  }
}
