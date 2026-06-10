import "server-only";
/**
 * 横 R2 — A-4-c23 Life Ops Mainline Model（**server-only 合成 helper**・barrel 非 export）
 *
 * 設計: docs/life-ops-mainline-minimal-card-a4-c23-mini-design.md（§1）
 *
 * 役割: 本線 card の page（表示）と server action（照合）が**同一の候補集合**を得るための単一 helper。
 *   real anchors world（fixture context 注入）+ gated reads（feedback obs）→ c14/c20/c22 合成 → preview model。
 *
 * 厳守: createClient しない（注入）・service_role 禁止・write 0・gate は呼び元（mainline gate）が先に判定済みの前提だが、
 *   read 系 flag（master/feedback/cadence）は本 helper 内でも各 source gate に従う（default OFF → 空合成）。
 */

import { createSupabaseWorldStateSourcePorts } from "../assembly/supabase-worldstate-source-ports";
import { assembleWorldState } from "../assembly/world-state-assembler";
import { computeLifeOpsPreviewModel, type LifeOpsPreviewModel } from "./lifeops-preview-compute";
import { createLifeOpsFeedbackReadonlySource } from "./lifeops-feedback-readonly-source";
import { feedbackToCadence, type LifeOpsFeedbackObservation } from "./lifeops-feedback-source";
import { isLifeOpsCadenceReadAllowed, feedbackDoneToRealCadence, realCadenceToCadenceObservations } from "./lifeops-cadence-real-source";
import type { PrmLearningEventReadClient } from "../learning/supabase-prm-learning-event-reader";
import type { ContextSnapshot } from "../../context/contextModifier";
import { PLAN_FLAGS } from "../../featureFlags";

/** preview と同じ dev 既定 context（energy/weather は client-side 領分のため fixture 注入・raw/PII なし）。 */
const FIXTURE_CONTEXT = { energy: { value: 0.6, source: "fixture" }, weather: { value: "rain", source: "fixture" } } as unknown as ContextSnapshot;

export interface LifeOpsMainlineModelResult {
  readonly model: LifeOpsPreviewModel;
  /** writer cooldown（recent）用に呼び元へ返す（c8 gated read の出力・raw row でない）。 */
  readonly observations: readonly LifeOpsFeedbackObservation[];
}

/**
 * 本線 card 用の候補 model 合成（page 表示と action 照合の単一ソース）。
 */
export async function computeLifeOpsMainlineModel(
  supabase: unknown,
  userId: string,
  now: Date,
): Promise<LifeOpsMainlineModelResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const date = now.toISOString().slice(0, 10);
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  const nowMs = now.getTime();

  const baseWorldPorts = createSupabaseWorldStateSourcePorts(supabase as never, userId, date);
  const world = await assembleWorldState({ ...baseWorldPorts, readContext: async () => FIXTURE_CONTEXT }, date, nowMinute);

  const feedbackSource = createLifeOpsFeedbackReadonlySource(supabase as PrmLearningEventReadClient, userId, {
    master: PLAN_FLAGS.lifeopsRealdataReadonly,
    feedback: PLAN_FLAGS.lifeopsFeedbackReadonly,
    supabaseUrl,
  });
  const observations = await feedbackSource.readObservations();
  const realCadence = isLifeOpsCadenceReadAllowed({
    master: PLAN_FLAGS.lifeopsRealdataReadonly,
    cadence: PLAN_FLAGS.lifeopsCadenceReadonly,
    supabaseUrl,
  })
    ? realCadenceToCadenceObservations(feedbackDoneToRealCadence(observations, now.toISOString()))
    : [];

  const model = computeLifeOpsPreviewModel({
    world,
    date,
    nowMinute,
    nowMs,
    feedbackCadence: feedbackToCadence(observations),
    realCadence,
    doneFeedback: observations,
  });
  return { model, observations };
}
