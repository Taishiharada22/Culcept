import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { loadSurfaceableForActionWithEntries, runCandidateActionRoute } from "@/lib/plan/reality/integration/candidate-action-route-support";
import { createStatusOnlyExecutor, type PlanSeedStatusUpdateClient } from "@/lib/plan/reality/integration/plan-seed-status-executor";
import type { PendingCapturedRowsReadClient } from "@/lib/plan/reality/integration/morning-capture-surface.server";
import { writeLearningEventOnAction } from "@/lib/plan/reality/integration/learning-event-write-on-action";
import {
  createSupabasePrmLearningEventRepository,
  type PrmLearningEventWriteClient,
} from "@/lib/plan/reality/learning/supabase-prm-learning-event-repository";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

/**
 * A1-6-6 Candidate Action Route — POST `{ handle, action }` → `{ ok, data }`（**status-only・user-RLS・no UI・no production**）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.11
 *   auth user（RLS）→ surfaceable candidate 再 read → handle 解決 → status-only executor
 *   （accept→consumed / dismiss→rejected / later no-op）→ redacted response。
 *
 * 厳守:
 *   - request は **{ handle, action } のみ**。response に **seedRef / UUID / raw / source_ref / secret を出さない**（redacted）。
 *   - **auth user 以外の seed を操作できない**（user-RLS client・surfaceable 再 read も executor も RLS-scoped）。
 *   - invalid handle / invalid action / no candidate / non-active → **fail-closed**（data.accepted=false・200）。
 *   - malformed JSON → 400 / no auth → 401（route-level error）。**status-only**（generateComplete / anchor は使わない）。
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const nowMs = Date.now();
  // A1-7-24: surfaceable + **pre-transition entries** を 1 read で capture（transition 前 snapshot）。
  const { surfaceable, entries } = await loadSurfaceableForActionWithEntries(supabase as unknown as PendingCapturedRowsReadClient, user.id, nowMs);
  const executor = createStatusOnlyExecutor(supabase as unknown as PlanSeedStatusUpdateClient);
  const result = await runCandidateActionRoute(body, surfaceable, executor);

  // A1-7-17/24: validly processed action 後の PRM learning event write（**flag default OFF**・await-and-swallow・fail-open）。
  //   entries は **transition 前に capture 済**ゆえ accept→consumed / dismiss→rejected でも acted candidate の context を解決でき、
  //   accept/dismiss/later の 3 action すべてで write できる（A1-7-23 bug 修正）。
  //   flag OFF → 本 block を skip（entries は未使用・surfaceable load は従来と同一 1 read ゆえ挙動不変）。
  if (PLAN_FLAGS.realityLearningEventWrite) {
    await writeLearningEventOnAction({
      flagEnabled: true,
      rawBody: body,
      response: result.data,
      entries,
      repository: createSupabasePrmLearningEventRepository(supabase as unknown as PrmLearningEventWriteClient, user.id),
      nowMs,
    });
  }

  return NextResponse.json(result);
}
