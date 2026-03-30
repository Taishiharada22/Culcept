import "server-only";

export const IDENTITY_STUDENT_TASK_TYPES = [
  "identity_profile_update",
] as const;

export type IdentityStudentTaskType =
  (typeof IDENTITY_STUDENT_TASK_TYPES)[number];

export const IDENTITY_TRAINING_ARTIFACT_TYPES = [
  "identity_training_jsonl",
  "identity_teacher_jsonl",
] as const;

export type IdentityTrainingArtifactType =
  (typeof IDENTITY_TRAINING_ARTIFACT_TYPES)[number];

export function isIdentityStudentTask(
  taskType: string,
): taskType is IdentityStudentTaskType {
  return IDENTITY_STUDENT_TASK_TYPES.includes(
    taskType as IdentityStudentTaskType,
  );
}

export function isIdentityTrainingArtifactType(
  artifactType: string | null | undefined,
): artifactType is IdentityTrainingArtifactType {
  return IDENTITY_TRAINING_ARTIFACT_TYPES.includes(
    artifactType as IdentityTrainingArtifactType,
  );
}

export function makeIdentityRunMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    studentTrack: "identity",
    needsTeacher: true,
    suppressTeacher: false,
  };
}
