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
import {
  resolveLifeOpsSourceMode,
  resolveEffectiveLifeOpsSourceMode,
  baseLifeOpsInputsForMode,
  type LifeOpsSourceMode,
} from "./lifeops-source-policy";
import { createLifeOpsFeedbackReadonlySource } from "./lifeops-feedback-readonly-source";
import { feedbackToCadence, type LifeOpsFeedbackObservation } from "./lifeops-feedback-source";
import { isLifeOpsCadenceReadAllowed, feedbackDoneToRealCadence, realCadenceToCadenceObservations } from "./lifeops-cadence-real-source";
import { createLifeOpsStructuredSourceReadonlySource, type LifeOpsStructuredSourceReadClient } from "./lifeops-structured-storage-readonly-source";
import { structuredDeadlinesToObservations, structuredCadenceToObservations } from "./lifeops-structured-source";
import type { PrmLearningEventReadClient } from "../learning/supabase-prm-learning-event-reader";
import type { ContextSnapshot } from "../../context/contextModifier";
import { PLAN_FLAGS } from "../../featureFlags";

/** preview と同じ dev 既定 context（energy/weather は client-side 領分のため fixture 注入・raw/PII なし）。 */
const FIXTURE_CONTEXT = { energy: { value: 0.6, source: "fixture" }, weather: { value: "rain", source: "fixture" } } as unknown as ContextSnapshot;

export interface LifeOpsMainlineModelResult {
  readonly model: LifeOpsPreviewModel;
  /** writer cooldown（recent）用に呼び元へ返す（c8 gated read の出力・raw row でない）。 */
  readonly observations: readonly LifeOpsFeedbackObservation[];
  /** A-4-c26: source mode（page の builder と action の selector が同一 mode で代表選定するために返す）。 */
  readonly sourceMode: LifeOpsSourceMode;
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

  // A-4-c29: 構造化 source（lifeops_structured_sources・staging apply 済み）の gated read-only 読み。
  //   gate=master ∧ LIFEOPS_STRUCTURED_SOURCE_READONLY ∧ staging ∧ !production（default OFF → query 0 → 空 channel）。
  //   row → column-restricted DTO → c26 normalizer（辞書/ISO/low の最終防壁）→ compute channel（capRaw 前合流）。
  const structuredSource = createLifeOpsStructuredSourceReadonlySource(supabase as LifeOpsStructuredSourceReadClient, userId, {
    master: PLAN_FLAGS.lifeopsRealdataReadonly,
    structured: PLAN_FLAGS.lifeopsStructuredSourceReadonly,
    supabaseUrl,
  });
  const structured = await structuredSource.readSources();
  const structuredDeadlines = structuredDeadlinesToObservations(structured.deadlines);
  const structuredCadence = structuredCadenceToObservations(structured.cadences);

  // A-4-c25: source policy（fixture kill-switch）。staging のみ fixture 可・production/不明 host は **base 候補を空に**
  //   （real channel=feedback 由来 cadence/suppression+構造化 source だけが上に乗る・real 0 件なら builder が null=card 非表示）。
  //   page 表示と action 再検証が本 helper を共有するため、偽造 candidateKey でも fixture 候補は再構築されない。
  // A-4-c34b fix: 構造化 source が 1 件でもあれば **実効 real_only**（fixture 退役）— staging で fixture deadline が
  //   代表を占有して登録 cycle が出ない盲点を解消（sparse fallback も実効 mode で正しく発動・production は恒久 real_only のまま）。
  const urlMode = resolveLifeOpsSourceMode({ supabaseUrl });
  const hasRealStructuredSource = structuredDeadlines.length > 0 || structuredCadence.length > 0;
  const sourceMode = resolveEffectiveLifeOpsSourceMode(urlMode, hasRealStructuredSource);
  const model = computeLifeOpsPreviewModel({
    world,
    date,
    nowMinute,
    nowMs,
    inputs: baseLifeOpsInputsForMode(sourceMode),
    feedbackCadence: feedbackToCadence(observations),
    realCadence,
    doneFeedback: observations,
    structuredDeadlines,
    structuredCadence,
  });
  return { model, observations, sourceMode };
}
