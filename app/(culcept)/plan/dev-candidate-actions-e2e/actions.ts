"use server";
/**
 * A1-6-9 E2E Functional Smoke Preview — server actions（**dev/staging 限定・三重ガード + auth + user-RLS・real DB**・§9.15）
 *
 * 役割: `/plan/dev-candidate-actions-e2e` の real candidate setup / surface / reflected plan / cleanup を、
 *   **認証済 user-RLS client** で行う（service_role なし）。**production では三重ガードで全 action が forbidden**。
 *
 * 厳守:
 *   - 各 action 冒頭で **三重ガード**（`isCandidateActionsPreviewHostAllowed`）→ 不許可なら即 return（production は flag 未設定で forbidden）。
 *   - **auth.getUser() の user.id のみ使用**（client から userId を受け取らない・user-RLS）。**service_role なし**。
 *   - **sentinel `desired_date`** で test seed を isolation（cleanup は sentinel のみ削除）。raw 不使用。
 *   - 返り値に **seedRef / UUID / raw / source_ref を出さない**（candidate DTO は redacted・plan item は opaque handle id のみ）。
 */

import { supabaseServer } from "@/lib/supabase/server";
import { isCandidateActionsPreviewHostAllowed } from "@/lib/plan/reality/candidateActionsPreviewHost";
import {
  buildCaptureSurfaceFromProjected,
  loadPendingProjected,
  DEFAULT_SURFACE_DAY_CONTEXT,
  type PendingCapturedRowsReadClient,
} from "@/lib/plan/reality/integration/morning-capture-surface.server";
import { createConsumedSeedRepository, type ConsumedSeedReadClient } from "@/lib/plan/reality/integration/consumed-seed-repository-supabase";
import { reflectConsumedSeedsIntoMorningPlan } from "@/lib/plan/reality/consumed-seed-morning-reflection";
import type { CandidateSurfaceDTO } from "@/lib/plan/reality/integration/candidate-surface";
import type { MorningPlan } from "@/lib/alter-morning/types";

/** test seed の sentinel（cleanup/isolation 用・実 seed と衝突しない遠未来日）。 */
const SENTINEL_DATE = "2099-12-31";

/** 三重ガード（staging/dev のみ・production は flag 未設定で false）。 */
function previewAllowed(): boolean {
  return isCandidateActionsPreviewHostAllowed({
    hostMode: process.env.REALITY_CANDIDATE_ACTIONS_DEV_HOST,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  });
}

export interface E2EActionResult {
  readonly ok: boolean;
  readonly error?: string;
}

/** plan item の **safe 表示**（opaque handle id / 時刻 / 表示テキストのみ・seedRef/raw なし）。 */
export interface E2ESafePlanItem {
  readonly id: string;
  readonly startTime: string | null;
  readonly text: string;
}

export interface E2EPreviewState {
  readonly candidate: CandidateSurfaceDTO | null;
  readonly planItems: readonly E2ESafePlanItem[];
}

/**
 * A1-6-9: sentinel test seed（active）+ duration evidence（high）を **直接 insert**（owner-RLS・service_role なし）。
 *   これにより surface が候補化し、banner で accept/dismiss/later → real route POST を E2E 検証できる。
 */
export async function setupE2ETestCandidate(): Promise<E2EActionResult> {
  if (!previewAllowed()) return { ok: false, error: "forbidden" };
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };
  const { data: seed, error: seedErr } = await supabase
    .from("plan_seeds")
    .insert({
      user_id: user.id,
      desired_date: SENTINEL_DATE,
      desired_time_hint: "afternoon",
      action_shape: "full_go",
      confidence: 0.9,
      status: "active",
      source: "manual",
    })
    .select("id")
    .single();
  if (seedErr || !seed) return { ok: false, error: "seed_insert_failed" };
  const { error: evErr } = await supabase.from("plan_seed_duration_evidences").insert({
    seed_id: (seed as { id: string }).id,
    user_id: user.id,
    duration_min: 60,
    source: "seed_explicit",
    confidence: "high",
  });
  if (evErr) return { ok: false, error: "evidence_insert_failed" };
  return { ok: true };
}

/**
 * A1-6-9: **un-gated surface**（buildCaptureSurfaceFromProjected, gateAllow=true・flag 非依存＝triple-guard が gate）→ candidate DTO（redacted）+
 *   **reflected plan**（consumed reader → A1-6-7 merge・sentinel date で isolation）→ safe plan items。
 *   read-only（user-RLS）。返り値に seedRef/raw なし。
 */
export async function getE2EPreviewState(): Promise<E2EPreviewState> {
  if (!previewAllowed()) return { candidate: null, planItems: [] };
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { candidate: null, planItems: [] };
  const nowMs = Date.now();
  const candidate = await buildCaptureSurfaceFromProjected(
    true, // gateAllow（triple-guard が gate ゆえ flag に依存しない）
    () => loadPendingProjected(supabase as unknown as PendingCapturedRowsReadClient, user.id),
    {
      date: SENTINEL_DATE,
      activeWindow: DEFAULT_SURFACE_DAY_CONTEXT.activeWindow,
      bandBounds: DEFAULT_SURFACE_DAY_CONTEXT.bandBounds,
      existing: [],
    },
    nowMs
  );
  const repo = createConsumedSeedRepository(supabase as unknown as ConsumedSeedReadClient, user.id);
  const seeds = await repo.readReflectableConsumedSeeds({ date: SENTINEL_DATE });
  const basePlan = { date: SENTINEL_DATE, items: [] } as unknown as MorningPlan;
  const reflected = reflectConsumedSeedsIntoMorningPlan(basePlan, seeds);
  const planItems: E2ESafePlanItem[] = reflected.items.map((it) => ({
    id: it.id, // opaque handle（seedRef でない）
    startTime: it.startTime ?? null,
    text: it.text,
  }));
  return { candidate, planItems };
}

/**
 * A1-6-9: sentinel test seed を **全削除**（owner-RLS・evidence は composite FK ON DELETE CASCADE で連鎖）→ remaining 数（0 期待）。
 */
export async function cleanupE2ETestCandidates(): Promise<{ remaining: number }> {
  if (!previewAllowed()) return { remaining: -1 };
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { remaining: -1 };
  await supabase.from("plan_seeds").delete().eq("user_id", user.id).eq("desired_date", SENTINEL_DATE);
  const { data } = await supabase
    .from("plan_seeds")
    .select("id")
    .eq("user_id", user.id)
    .eq("desired_date", SENTINEL_DATE);
  return { remaining: data?.length ?? 0 };
}
