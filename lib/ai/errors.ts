import "server-only";

export type NormalizedAIOpsError = {
  code: string;
  message: string;
  detail?: unknown;
  extra?: Record<string, unknown>;
};

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "Internal auth failed.",
  internal_auth_not_configured: "Internal auth secrets are not configured.",
  service_role_unavailable: "Supabase service role client is unavailable.",
  db_connectivity_error: "Database connectivity error.",
  pending_migration_missing_table: "Required table is missing. Apply pending migrations.",
  pending_migration_missing_column: "Required column is missing. Apply pending migrations.",
  dataset_export_disabled: "Dataset export is disabled. Enable AI_EXPORT_ENABLED=true.",
  training_artifacts_disabled: "Training artifacts are disabled. Enable AI_TRAINING_ARTIFACTS_ENABLED=true.",
  auto_eval_disabled: "Auto-eval is disabled. Enable AI_AUTO_EVAL_ENABLED=true.",
  model_registry_unavailable: "model_registry table is not accessible.",
  challenger_not_found: "No active challenger model found. Bootstrap model_registry and/or pass explicit modelKey.",
  challenger_ambiguous: "Multiple active challenger models found. Specify modelKey explicitly.",
  candidate_not_eligible: "Candidate model does not meet promotion thresholds.",
  promotion_mutation_failed: "Failed to apply promotion mutation.",
  bootstrap_failed: "model_registry bootstrap failed.",
  smoke_test_failed: "Smoke test execution failed.",
  auto_eval_failed: "Auto-eval batch execution failed.",
  export_dataset_failed: "Dataset export failed.",
  training_artifact_generation_failed: "Training artifact generation failed.",
  promotion_review_failed: "Promotion review failed.",
  promotion_review_cron_failed: "Promotion review cron execution failed.",
  artifact_storage_unavailable: "Artifact storage is not configured or unavailable.",
  rollout_disabled: "Model rollout is disabled.",
  unknown_error: "An unknown error occurred.",
};

function isMissingTableError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    (normalized.includes("relation") && normalized.includes("does not exist")) ||
    normalized.includes("no such table")
  );
}

function isMissingColumnError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    (normalized.includes("column") && normalized.includes("does not exist")) ||
    normalized.includes("could not find the column")
  );
}

export function normalizeAIOpsError(
  error: unknown,
  fallbackCode?: string,
): NormalizedAIOpsError {
  if (typeof error === "string") {
    const message = ERROR_MESSAGES[error] ?? error;
    return { code: error, message };
  }

  if (error && typeof error === "object" && "code" in error) {
    const obj = error as Record<string, unknown>;
    const code = String(obj.code ?? fallbackCode ?? "unknown_error");
    const message =
      typeof obj.message === "string"
        ? obj.message
        : ERROR_MESSAGES[code] ?? code;
    return { code, message, detail: obj.detail, extra: obj.extra as Record<string, unknown> | undefined };
  }

  if (error instanceof Error) {
    const message = error.message;

    if (isMissingTableError(message)) {
      return {
        code: "pending_migration_missing_table",
        message: ERROR_MESSAGES.pending_migration_missing_table,
        detail: message,
      };
    }

    if (isMissingColumnError(message)) {
      return {
        code: "pending_migration_missing_column",
        message: ERROR_MESSAGES.pending_migration_missing_column,
        detail: message,
      };
    }

    return {
      code: fallbackCode ?? "unknown_error",
      message,
    };
  }

  return {
    code: fallbackCode ?? "unknown_error",
    message: ERROR_MESSAGES[fallbackCode ?? "unknown_error"] ?? "An unknown error occurred.",
  };
}

export function toErrorBody(
  error: NormalizedAIOpsError,
): Record<string, unknown> {
  return {
    ok: false,
    error: error.code,
    message: error.message,
    ...(error.detail !== undefined ? { detail: error.detail } : {}),
    ...(error.extra !== undefined ? error.extra : {}),
  };
}
