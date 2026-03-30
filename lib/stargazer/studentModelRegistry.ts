import "server-only";

import type { AIProviderName } from "@/lib/ai/types";
import { STARGAZER_STUDENT_TASK_TYPES } from "./studentTrack";

export const STARGAZER_STUDENT_MODEL_KEY = "stargazer_student";

export type StargazerStudentRegistryDraft = {
  modelVersion: string;
  provider: AIProviderName;
  providerModel: string;
  artifactId?: string | null;
  artifactType?: string | null;
  teacherArtifactId?: string | null;
  trafficRole?: "champion" | "challenger" | "shadow";
  trafficWeight?: number;
  promotionStatus?: "candidate" | "promoted" | "demoted";
  notes?: string | null;
};

export function buildStargazerStudentRegistryDraft(
  args: StargazerStudentRegistryDraft,
): Record<string, unknown> {
  return {
    model_key: STARGAZER_STUDENT_MODEL_KEY,
    model_version: args.modelVersion,
    model_role: args.trafficRole ?? "challenger",
    provider: args.provider,
    is_active: true,
    rollout_percent: 100,
    traffic_role: args.trafficRole ?? "challenger",
    traffic_weight: args.trafficWeight ?? 0,
    task_types: [...STARGAZER_STUDENT_TASK_TYPES],
    promotion_status: args.promotionStatus ?? "candidate",
    notes: args.notes ?? null,
    metadata: {
      studentTrack: "stargazer",
      providerModel: args.providerModel,
      provider_model: args.providerModel,
      artifactId: args.artifactId ?? null,
      artifactType: args.artifactType ?? null,
      teacherArtifactId: args.teacherArtifactId ?? null,
      evalType: "stargazer_downstream",
      taskTypes: [...STARGAZER_STUDENT_TASK_TYPES],
    },
  };
}

