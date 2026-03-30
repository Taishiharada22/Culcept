import "server-only";

import type { AIProviderName } from "@/lib/ai/types";
import { IDENTITY_STUDENT_TASK_TYPES } from "./studentTrack";

export const IDENTITY_PRIMARY_MODEL_KEY = "identity_primary";
export const IDENTITY_STUDENT_MODEL_KEY = "identity_student";

export type IdentityStudentRegistryDraft = {
  modelKey?: string;
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

export function buildIdentityRegistryDraft(
  args: IdentityStudentRegistryDraft,
): Record<string, unknown> {
  return {
    model_key: args.modelKey ?? IDENTITY_STUDENT_MODEL_KEY,
    model_version: args.modelVersion,
    model_role: args.trafficRole ?? "challenger",
    provider: args.provider,
    is_active: true,
    rollout_percent: 100,
    traffic_role: args.trafficRole ?? "challenger",
    traffic_weight: args.trafficWeight ?? 0,
    task_types: [...IDENTITY_STUDENT_TASK_TYPES],
    promotion_status: args.promotionStatus ?? "candidate",
    notes: args.notes ?? null,
    metadata: {
      studentTrack: "identity",
      providerModel: args.providerModel,
      provider_model: args.providerModel,
      artifactId: args.artifactId ?? null,
      artifactType: args.artifactType ?? null,
      teacherArtifactId: args.teacherArtifactId ?? null,
      evalType: "identity_shadow",
      taskTypes: [...IDENTITY_STUDENT_TASK_TYPES],
    },
  };
}

export function buildIdentityStudentRegistryDraft(
  args: IdentityStudentRegistryDraft,
): Record<string, unknown> {
  return buildIdentityRegistryDraft({
    ...args,
    modelKey: args.modelKey ?? IDENTITY_STUDENT_MODEL_KEY,
  });
}

export function buildIdentityPrimaryRegistryDraft(
  args: Omit<IdentityStudentRegistryDraft, "modelKey">,
): Record<string, unknown> {
  return buildIdentityRegistryDraft({
    ...args,
    modelKey: IDENTITY_PRIMARY_MODEL_KEY,
    trafficRole: args.trafficRole ?? "champion",
    promotionStatus: args.promotionStatus ?? "promoted",
  });
}
