import "server-only";

export const ORBITER_STUDENT_TASK_TYPES = [
  "orbiter_memory_summary",
] as const;

export type OrbiterStudentTaskType =
  (typeof ORBITER_STUDENT_TASK_TYPES)[number];

export const ORBITER_TRAINING_ARTIFACT_TYPES = [
  "orbiter_training_jsonl",
  "orbiter_teacher_jsonl",
] as const;

export type OrbiterTrainingArtifactType =
  (typeof ORBITER_TRAINING_ARTIFACT_TYPES)[number];

export function isOrbiterStudentTask(
  taskType: string,
): taskType is OrbiterStudentTaskType {
  return ORBITER_STUDENT_TASK_TYPES.includes(
    taskType as OrbiterStudentTaskType,
  );
}

export function isOrbiterTrainingArtifactType(
  artifactType: string | null | undefined,
): artifactType is OrbiterTrainingArtifactType {
  return ORBITER_TRAINING_ARTIFACT_TYPES.includes(
    artifactType as OrbiterTrainingArtifactType,
  );
}

export function makeOrbiterRunMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    studentTrack: "orbiter",
    needsTeacher: true,
    suppressTeacher: false,
  };
}
