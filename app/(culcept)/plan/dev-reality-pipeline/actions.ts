"use server";
/**
 * /plan/dev-reality-pipeline — A-4-c17 Life Ops Gated Writer Wiring（**non-cadence actions only**）
 *
 * 設計: docs/life-ops-gated-writer-wiring-a4-c17-mini-design.md
 *
 * 役割: preview の action rail（採用/後で/不要）からの form 送信を受け、**client 値を信頼せず**
 *   server で代表候補を再計算照合 → c15 intent を server 側で再構築 → c9 gated writer へ 1 件渡す。
 *   結果は PRG（redirect + query token）で固定辞書表示（本線保存と誤解させない）。
 *
 * 厳守:
 *   - **done は 2 段階のみ**（A-4-c18: confirm 不在→write せず確認 redirect・confirm 一致+候補再照合の時だけ write。
 *     1 クリック write 経路は構造的に不存在・自動 done なし）。accept/later/dismiss は c17 resolver（不変更）。
 *   - gate stack: host 三重ガード → REALITY_PIPELINE_PREVIEW → operator auth → action allowlist → 候補照合 →
 *     writer gate（master ∧ LIFEOPS_FEEDBACK_WRITE ∧ staging ∧ !production）。**production は flag ON でも常に false**。
 *   - handle/categoryId/menu を client から受けない（candidateKey + action の 2 値のみ・lookup 専用）。
 *   - cooldown: 既存 writer guard（recent は gated read から注入・read gate OFF なら []=縮退を許容）+ PRG で再送防止。
 *   - write 結果を candidate pipeline へ即時反映しない（redirect 後の表示も既定 read は OFF）。
 */

import { notFound, redirect } from "next/navigation";
import { isCandidateActionsPreviewHostAllowed } from "@/lib/plan/reality/candidateActionsPreviewHost";
import { supabaseServer } from "@/lib/supabase/server";
import { createSupabaseWorldStateSourcePorts } from "@/lib/plan/reality/assembly/supabase-worldstate-source-ports";
import { assembleWorldState } from "@/lib/plan/reality/assembly/world-state-assembler";
import { computeLifeOpsPreviewModel } from "@/lib/plan/reality/lifeops/lifeops-preview-compute";
import { routeLifeOpsActionRequest } from "@/lib/plan/reality/lifeops/lifeops-action-request";
import { actionIntentToWriterInput } from "@/lib/plan/reality/lifeops/lifeops-action-intent";
import { createLifeOpsFeedbackWriter, type LifeOpsFeedbackWriteClient } from "@/lib/plan/reality/lifeops/lifeops-feedback-writer";
import { createLifeOpsFeedbackReadonlySource } from "@/lib/plan/reality/lifeops/lifeops-feedback-readonly-source";
import { lifeOpsFeedbackHandle, feedbackToCadence } from "@/lib/plan/reality/lifeops/lifeops-feedback-source";
import type { PrmLearningEventReadClient } from "@/lib/plan/reality/learning/supabase-prm-learning-event-reader";
import type { ContextSnapshot } from "@/lib/plan/context/contextModifier";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

/** page と同じ dev 既定 context（fixture 注入・raw/PII なし）。 */
const FIXTURE_CONTEXT = { energy: { value: 0.6, source: "fixture" }, weather: { value: "rain", source: "fixture" } } as unknown as ContextSnapshot;

const PAGE_PATH = "/plan/dev-reality-pipeline";

function exit(token: "ok" | "ok_done" | "gate_off" | "duplicate_cooldown" | "insert_failed" | "invalid" | "denied"): never {
  redirect(`${PAGE_PATH}?lifeopsFb=${token}`);
}

/**
 * action rail（採用/後で/不要）submit → gated 1-row write（**done は構造的に到達不能**）。
 */
export async function submitLifeOpsFeedbackAction(formData: FormData): Promise<void> {
  // ① host 三重ガード（page と同一・production で構造的不可視）。
  if (
    !isCandidateActionsPreviewHostAllowed({
      hostMode: process.env.REALITY_CANDIDATE_ACTIONS_DEV_HOST,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
    })
  ) {
    notFound();
  }
  // ② preview flag（server default OFF）。
  if (!PLAN_FLAGS.realityPipelinePreview) exit("gate_off");

  // ③ operator auth（owner-RLS・service_role 不使用）。
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) exit("denied");

  // ④ client 生値（信頼しない・lookup/確認専用の 3 値のみ。handle/category/menu/writer DTO は受けない）。
  const candidateKeyRaw = formData.get("candidateKey");
  const actionRaw = formData.get("action");
  const confirmRaw = formData.get("confirm"); // A-4-c18: done の明示確認 token（stage-1 では不在）

  // ⑤ server 再計算（page と同一 chain: real anchors world + fixture context + gated feedbackCadence）。
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  const nowMs = now.getTime();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const baseWorldPorts = createSupabaseWorldStateSourcePorts(supabase, user.id, date);
  const world = await assembleWorldState({ ...baseWorldPorts, readContext: async () => FIXTURE_CONTEXT }, date, nowMinute);
  const feedbackSource = createLifeOpsFeedbackReadonlySource(supabase as unknown as PrmLearningEventReadClient, user.id, {
    master: PLAN_FLAGS.lifeopsRealdataReadonly,
    feedback: PLAN_FLAGS.lifeopsFeedbackReadonly,
    supabaseUrl,
  });
  const recentObservations = await feedbackSource.readObservations(); // gate OFF → []（cooldown 縮退を許容・PRG が再送防止）
  const model = computeLifeOpsPreviewModel({ world, date, nowMinute, nowMs, feedbackCadence: feedbackToCadence(recentObservations) });

  // ⑥ routing（pure・A-4-c18: done は 2 段階＝confirm 不在なら write せず確認へ・偽造/陳腐化は reject）。
  const routed = routeLifeOpsActionRequest(model.repCandidates, candidateKeyRaw, actionRaw, confirmRaw);
  if (routed.kind === "confirm_redirect") {
    redirect(`${PAGE_PATH}?lifeopsConfirm=${encodeURIComponent(routed.confirmToken)}`); // stage-1: **write しない**
  }
  if (routed.kind === "reject") exit("invalid");
  const resolved = { intent: routed.intent };

  // ⑦ writer（gate: master ∧ write ∧ staging ∧ !production・cooldown guard・fail-open）。
  const writer = createLifeOpsFeedbackWriter(supabase as unknown as LifeOpsFeedbackWriteClient, user.id, {
    master: PLAN_FLAGS.lifeopsRealdataReadonly,
    write: PLAN_FLAGS.lifeopsFeedbackWrite,
    supabaseUrl,
  });
  const recent = recentObservations.map((o) => ({
    handle: lifeOpsFeedbackHandle(o.categoryId, o.menu),
    action: o.action,
    actedAtMs: Date.parse(o.actedAtISO),
  }));
  const result = await writer.writeFeedback(actionIntentToWriterInput(resolved.intent, now.toISOString()), { recent, nowMs });
  exit(result.written ? (resolved.intent.action === "done" ? "ok_done" : "ok") : result.reason);
}
