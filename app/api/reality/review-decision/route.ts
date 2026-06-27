import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  createSupabasePrmLearningEventReader,
  type PrmLearningEventReadClient,
} from "@/lib/plan/reality/learning/supabase-prm-learning-event-reader";
import { aggregateDryRunEvents } from "@/lib/plan/reality/learning/dry-run-aggregation";
import { projectPrmDryRun } from "@/lib/plan/reality/learning/prm-dry-run-projection";
import {
  createSupabasePrmReviewDecisionRepository,
  type PrmReviewDecisionWriteClient,
} from "@/lib/plan/reality/learning/supabase-prm-review-decision-repository";
import {
  createSupabasePrmModelEntryRepository,
  type PrmModelEntryWriteClient,
} from "@/lib/plan/reality/learning/supabase-prm-model-entry-repository";
import { executeReviewDecision } from "@/lib/plan/reality/learning/review-flow-route-core";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { isRealityWriteConnectionAllowed } from "@/lib/plan/reality/realityWriteConnectionGuard";

/**
 * A1-7-33 Review Decision Route — POST `{ proposalFingerprint, decision }` → redacted review result
 *   （**operator-only・flag default OFF・server 再導出 proposal・M2→M3・production hard block**）
 *
 * 設計: docs/prm-review-flow-route-design.md
 *   auth user（owner-RLS）→ flag OFF なら disabled（write 0）→ flag ON なら learning events を read し
 *   aggregate(dedupeSameDay)→project で **proposal を server 再導出**（client snapshot 不信）→ executeReviewDecision
 *   （fingerprint 解決・blocked fail-closed・M2 insert・approve なら M3 entry[review_decision_id FK]・partial failure 明示）。
 *
 * 厳守: snapshot client 不信 / blocked fail-closed / reviewer operator 固定 / M3 は review_decision_id 必須 /
 *   certainty no high（DB CHECK + ≤tentative）/ owner-RLS（service_role なし）/ raw/seedRef/id を response に出さない /
 *   flag OFF で write 0 / production は env で OFF（hard block）。
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

  // flag OFF → no-op（M2/M3 write 0・既存挙動不変）
  // P18: flag に加え接続先 guard を AND（staging-positive ∧ all-production-deny）。
  //   plod(clean prod)/aljav(legacy)/不明 host では flag ON でも write 0（fail-closed 二重防御）。
  const realityWriteUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!PLAN_FLAGS.realityReviewWrite || !isRealityWriteConnectionAllowed(realityWriteUrl)) {
    return NextResponse.json({ ok: false, reviewed: false, decision: null, modelEntryCreated: false, reason: "disabled", partialFailure: null });
  }

  // owner の learning events を read → server で proposal 再導出（client snapshot を信用しない）
  const reader = createSupabasePrmLearningEventReader(supabase as unknown as PrmLearningEventReadClient, user.id);
  const events = await reader.readLearningEvents();
  const projection = projectPrmDryRun(aggregateDryRunEvents(events, { dedupeSameDay: true }));

  const m2 = createSupabasePrmReviewDecisionRepository(supabase as unknown as PrmReviewDecisionWriteClient, user.id);
  const m3 = createSupabasePrmModelEntryRepository(supabase as unknown as PrmModelEntryWriteClient, user.id);

  const result = await executeReviewDecision({ proposals: projection.proposals, rawRequest: body, m2, m3, nowMs: Date.now() });
  return NextResponse.json(result);
}
