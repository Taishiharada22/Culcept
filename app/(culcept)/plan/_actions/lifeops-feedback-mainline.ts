"use server";
/**
 * /plan — A-4-c23 Life Ops Mainline Feedback Server Action（**staging gated・production deny・dev preview action とは分離**）
 *
 * 設計: docs/life-ops-mainline-minimal-card-a4-c23-mini-design.md（§3）
 *
 * 役割: 本線「生活まわり」card の rail（後で/不要/完了※）からの form 送信を受け、**client 値を信頼せず**
 *   server で本線 card と同一の候補集合（`computeLifeOpsMainlineModel`=page と単一ソース）を再計算照合 →
 *   c15 intent を server 側で再構築 → c9 gated writer へ 1 件。結果は PRG（`/plan?lifeopsFb=` / `?lifeopsConfirm=`）。
 *   pure 部品（route/intent/writer/token/合成）は preview と共有・action 自体は分離。
 *
 * 厳守:
 *   - gate: `isLifeOpsMainlineAllowed`（**LIFEOPS_MAINLINE ∧ planRouteLive ∧ staging allowlist ∧ production deny**・default OFF）。
 *     production では flag ON でも常に false（deny 解除は別 CEO gate）。
 *   - **accept は本線で常時拒否**（`routeLifeOpsMainlineActionRequest`・偽造 POST も invalid）。done は c18 PRG 2 段階のみ。
 *   - client からは candidateKey + action + confirm の 3 値のみ（handle/category/menu/writer DTO を受けない）。
 *   - writer gate（master ∧ LIFEOPS_FEEDBACK_WRITE ∧ staging ∧ !production）+ cooldown（recent=gated read 注入）+ PRG 再送防止。
 */

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { computeLifeOpsMainlineModel } from "@/lib/plan/reality/lifeops/lifeops-mainline-model";
import { routeLifeOpsMainlineActionRequest, selectLifeOpsMainlineRepresentatives } from "@/lib/plan/reality/lifeops/lifeops-mainline-card";
import { isLifeOpsMainlineAllowed } from "@/lib/plan/reality/lifeops/lifeops-mainline-gate";
import { actionIntentToWriterInput } from "@/lib/plan/reality/lifeops/lifeops-action-intent";
import { createLifeOpsFeedbackWriter, type LifeOpsFeedbackWriteClient } from "@/lib/plan/reality/lifeops/lifeops-feedback-writer";
import { lifeOpsFeedbackHandle } from "@/lib/plan/reality/lifeops/lifeops-feedback-source";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

const PLAN_PATH = "/plan";

function exit(token: "ok" | "ok_done" | "gate_off" | "duplicate_cooldown" | "insert_failed" | "invalid" | "denied"): never {
  redirect(`${PLAN_PATH}?lifeopsFb=${token}`);
}

/**
 * 本線 card rail submit → gated 1-row write（accept 不可・done は 2 段階のみ・production hard block）。
 */
export async function submitLifeOpsMainlineFeedbackAction(formData: FormData): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  // ① mainline gate（flag OFF/production は card 自体が出ないが、偽造 POST もここで遮断）。
  if (!isLifeOpsMainlineAllowed({ mainline: PLAN_FLAGS.lifeopsMainline, planRouteLive: PLAN_FLAGS.planRouteLive, supabaseUrl })) {
    exit("gate_off");
  }
  // ② operator auth（owner-RLS・service_role 不使用）。
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) exit("denied");

  // ③ client 生値（信頼しない・lookup/確認専用の 3 値のみ）。
  const candidateKeyRaw = formData.get("candidateKey");
  const actionRaw = formData.get("action");
  const confirmRaw = formData.get("confirm");

  // ④ server 再計算（本線 card 表示と同一 helper＝候補集合がズレない）。
  const now = new Date();
  const { model, observations, sourceMode } = await computeLifeOpsMainlineModel(supabase, user.id, now);

  // ⑤ 本線 routing（**accept/enum 外は常時拒否**・done は confirm 不在→確認 redirect・一致時のみ write intent）。
  //   c26: 照合集合は card 表示と同じ selector（sparse fallback 候補も press 可能＝表示と照合の断絶なし）。
  const representatives = selectLifeOpsMainlineRepresentatives(model, sourceMode);
  const routed = routeLifeOpsMainlineActionRequest(representatives, candidateKeyRaw, actionRaw, confirmRaw);
  if (routed.kind === "confirm_redirect") {
    redirect(`${PLAN_PATH}?lifeopsConfirm=${encodeURIComponent(routed.confirmToken)}`); // stage-1: write しない
  }
  if (routed.kind === "reject") exit("invalid");

  // ⑥ writer（gate: master ∧ LIFEOPS_FEEDBACK_WRITE ∧ staging ∧ !production・cooldown・fail-open）。
  const writer = createLifeOpsFeedbackWriter(supabase as unknown as LifeOpsFeedbackWriteClient, user.id, {
    master: PLAN_FLAGS.lifeopsRealdataReadonly,
    write: PLAN_FLAGS.lifeopsFeedbackWrite,
    supabaseUrl,
  });
  const recent = observations.map((o) => ({
    handle: lifeOpsFeedbackHandle(o.categoryId, o.menu),
    action: o.action,
    actedAtMs: Date.parse(o.actedAtISO),
  }));
  const result = await writer.writeFeedback(actionIntentToWriterInput(routed.intent, now.toISOString()), { recent, nowMs: now.getTime() });
  exit(result.written ? (routed.intent.action === "done" ? "ok_done" : "ok") : result.reason);
}
