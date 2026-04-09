import "server-only";

export const STARGAZER_STUDENT_TASK_TYPES = [
  // Core generative tasks (original 4)
  "stargazer_question_generation",
  "stargazer_question_expansion",
  "stargazer_lens_discovery",
  "stargazer_observation_analysis",
  // User-facing insight tasks
  "stargazer_free_text_analysis",
  "stargazer_aha_insight",
  "stargazer_vanishing_insight",
  "stargazer_ai_prediction",
  "stargazer_pattern_narrative",
  // Alter/reflection tasks
  "stargazer_alter_response",
  "stargazer_alter_utterance_reading",
  "stargazer_alter_home",
  "stargazer_alter_letter",
  "stargazer_alter_letter_insight",
  "stargazer_alter_self_report",
  "stargazer_alter_session_summary",
  // Counterfactual (P4)
  "stargazer_counterfactual_live",
  // Infrastructure tasks
  "stargazer_adaptive_q2",
  "stargazer_notification_copy",
  "stargazer_partner_dynamic_questions",
  // Enhance/narrative tasks
  "stargazer_inner_weather_enhance",
  "stargazer_unseen_map_narrative",
  "stargazer_prophecy_enhance",
  "stargazer_blind_spot_enhance",
] as const;

export type StargazerStudentTaskType =
  (typeof STARGAZER_STUDENT_TASK_TYPES)[number];

export const STARGAZER_TRAINING_ARTIFACT_TYPES = [
  "stargazer_training_jsonl",
  "stargazer_teacher_jsonl",
  "stargazer_observation_jsonl",
] as const;

export type StargazerTrainingArtifactType =
  (typeof STARGAZER_TRAINING_ARTIFACT_TYPES)[number];

export type StargazerGenerationSourceStage =
  | "seed"
  | "pool_generate"
  | "growth_fill"
  | "growth_expand"
  | "growth_diversify"
  | "growth_lens_discovery";

export type StargazerCandidateEntityType = "question" | "lens";

export interface StargazerCandidateAuditEntry {
  entityType: StargazerCandidateEntityType;
  candidateIndex: number;
  candidateJson: Record<string, unknown> | null;
  normalizedOutput: Record<string, unknown> | null;
  accepted: boolean;
  acceptedEntityId?: string | null;
  rejectionReason?: string | null;
  axisId?: string | null;
  lensId?: string | null;
}

export function isStargazerStudentTask(taskType: string): taskType is StargazerStudentTaskType {
  return STARGAZER_STUDENT_TASK_TYPES.includes(
    taskType as StargazerStudentTaskType,
  );
}

export function isStargazerTrainingArtifactType(
  artifactType: string | null | undefined,
): artifactType is StargazerTrainingArtifactType {
  return STARGAZER_TRAINING_ARTIFACT_TYPES.includes(
    artifactType as StargazerTrainingArtifactType,
  );
}

export function makeStargazerRunMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    studentTrack: "stargazer",
    needsTeacher: true,
    suppressTeacher: false,
  };
}
