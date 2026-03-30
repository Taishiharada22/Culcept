import "server-only";

export type NormalizedAIOpsError = {
  code: string;
  message: string;
  detail?: unknown;
  extra?: Record<string, unknown>;
};

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "Internal auth failed.",
  internal_auth_not_configured:
    "AI_INTERNAL_API_KEY or CRON_SECRET is not configured.",
  service_role_unavailable:
    "Supabase service role client is unavailable. Verify NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
  db_connectivity_error:
    "Database connectivity failed. Verify Supabase network reachability and service-role credentials.",
  pending_migration_missing_table:
    "Required table is missing. Apply pending Supabase migrations before enabling this feature.",
  pending_migration_missing_column:
    "Required column is missing. Apply pending Supabase migrations before enabling this feature.",
  dataset_export_disabled:
    "Dataset export is disabled. Enable AI_EXPORT_ENABLED=true.",
  training_artifacts_disabled:
    "Training artifact generation is disabled. Enable AI_TRAINING_ARTIFACTS_ENABLED=true.",
  no_data_available:
    "No qualifying AI data was available for this operation.",
  auto_eval_disabled:
    "Auto-eval is disabled. Enable AI_AUTO_EVAL_ENABLED=true.",
  model_registry_unavailable:
    "model_registry access failed. Verify DB connectivity and required migrations.",
  shadow_model_not_configured:
    "No active Stargazer shadow model is configured in model_registry.",
  shadow_model_ambiguous:
    "Multiple active Stargazer shadow models were found. Narrow the target model before promotion review.",
  challenger_not_found:
    "No active challenger model found. Bootstrap model_registry and/or pass explicit modelKey.",
  challenger_ambiguous:
    "Multiple active challenger models found. Specify modelKey explicitly.",
  candidate_not_eligible:
    "Candidate model does not meet promotion thresholds.",
  promotion_mutation_failed: "Failed to apply promotion mutation.",
  bootstrap_failed: "model_registry bootstrap failed.",
  smoke_test_failed: "Smoke test execution failed.",
  auto_eval_failed: "Auto-eval batch execution failed.",
  export_dataset_failed: "Dataset export failed.",
  training_artifact_generation_failed:
    "Training artifact generation failed.",
  promotion_review_failed: "Promotion review failed.",
  promotion_review_cron_failed:
    "Promotion review cron execution failed.",
  artifact_storage_unavailable:
    "Artifact storage upload failed. Verify artifact bucket and storage permissions.",
  rollout_disabled: "Model rollout is disabled.",
  unknown_error: "An unknown error occurred.",
};

function normalizeMessage(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;

  try {
    return JSON.stringify(value);
  } catch {
    return "unknown_error";
  }
}

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

function isDbConnectivityError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("fetch failed") ||
    normalized.includes("network") ||
    normalized.includes("econn") ||
    normalized.includes("connect timeout") ||
    normalized.includes("connection refused")
  );
}

function normalizeKnownStringError(
  message: string,
  fallbackCode?: string,
): NormalizedAIOpsError {
  if (ERROR_MESSAGES[message]) {
    return {
      code: message,
      message: ERROR_MESSAGES[message],
    };
  }

  if (message === "service_client_unavailable") {
    return {
      code: "service_role_unavailable",
      message: ERROR_MESSAGES.service_role_unavailable,
    };
  }

  if (message === "export_disabled" || message === "dataset_export_disabled") {
    return {
      code: "dataset_export_disabled",
      message: ERROR_MESSAGES.dataset_export_disabled,
    };
  }

  if (message === "training_artifacts_disabled") {
    return {
      code: "training_artifacts_disabled",
      message: ERROR_MESSAGES.training_artifacts_disabled,
    };
  }

  if (message === "no_data_available") {
    return {
      code: "no_data_available",
      message: ERROR_MESSAGES.no_data_available,
    };
  }

  if (message === "model_registry_unavailable") {
    return {
      code: "model_registry_unavailable",
      message: ERROR_MESSAGES.model_registry_unavailable,
    };
  }

  if (message.startsWith("storage_upload_failed")) {
    return {
      code: "artifact_storage_unavailable",
      message: ERROR_MESSAGES.artifact_storage_unavailable,
      detail: message,
    };
  }

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

  if (isDbConnectivityError(message)) {
    return {
      code: "db_connectivity_error",
      message: ERROR_MESSAGES.db_connectivity_error,
      detail: message,
    };
  }

  return {
    code: fallbackCode ?? "unknown_error",
    message,
  };
}

export function normalizeAIOpsError(
  error: unknown,
  fallbackCode?: string,
): NormalizedAIOpsError {
  if (error && typeof error === "object" && "code" in error) {
    const objectError = error as Record<string, unknown>;
    const code = String(objectError.code ?? fallbackCode ?? "unknown_error");
    const normalized = normalizeKnownStringError(code, fallbackCode);

    return {
      code: normalized.code,
      message:
        typeof objectError.message === "string"
          ? objectError.message
          : normalized.message,
      detail: objectError.detail ?? normalized.detail,
      extra:
        objectError.extra &&
        typeof objectError.extra === "object" &&
        !Array.isArray(objectError.extra)
          ? (objectError.extra as Record<string, unknown>)
          : undefined,
    };
  }

  const message = normalizeMessage(error);
  return normalizeKnownStringError(message, fallbackCode);
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
