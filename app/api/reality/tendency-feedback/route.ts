import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  createSupabasePrmModelEntryReader,
  type PrmModelEntryReadClient,
} from "@/lib/plan/reality/learning/supabase-prm-model-entry-reader";
import {
  createSupabasePrmReviewDecisionRepository,
  type PrmReviewDecisionWriteClient,
} from "@/lib/plan/reality/learning/supabase-prm-review-decision-repository";
import {
  createSupabasePrmModelEntryRepository,
  createSupabasePrmModelEntryUpdater,
  type PrmModelEntryWriteClient,
  type PrmModelEntryUpdateClient,
} from "@/lib/plan/reality/learning/supabase-prm-model-entry-repository";
import { executeTendencyFeedback } from "@/lib/plan/reality/learning/tendency-feedback-core";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

/**
 * A1-7-35 Tendency Feedback Route — POST `{ tendencyKey, feedback, correctionKind? }` → redacted feedback result
 *   （**operator-only・flag default OFF・server 再読込 M3・可逆・Alter 非連結・production hard block**）
 *
 * 設計: docs/prm-confirm-correct-loop-design.md（A1-7-35）/ review-decision route 同構造
 *   auth user（owner-RLS）→ flag OFF なら disabled（write 0）→ flag ON なら **owner の M3 entry を id 付きで server 再読込**
 *   （client snapshot 不信）→ executeTendencyFeedback で tendencyKey 解決し confirm/correct/reject を **可逆**に記録:
 *   confirm→user M2(approve)+新 M3 version(supersedes)+old retracted / correct→M3 user_correction UPDATE /
 *   reject→user M2(reject)+M3 retracted。**partial failure を隠さず** redacted に明示。
 *
 * 厳守: snapshot client 不信（server 再読込）/ entry 無→fail-closed / **破壊削除なし**（retracted_at/supersedes 可逆）/
 *   certainty no high（snapshot≤tentative・DB CHECK）/ raw/personality を作らない（enum code のみ・free-text なし）/
 *   id/raw を response に出さない / flag OFF で write 0 / Alter・Home・Stargazer 本線に非連結 / production は env で OFF。
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
  if (!PLAN_FLAGS.realityTendencyFeedbackWrite) {
    return NextResponse.json({ ok: false, feedback: null, reviewed: false, modelEntryCreated: false, corrected: false, retracted: false, reason: "disabled", partialFailure: null });
  }

  // owner の M3 entry を **id 付きで server 再読込**（client snapshot を信用しない）
  const reader = createSupabasePrmModelEntryReader(supabase as unknown as PrmModelEntryReadClient, user.id);
  const entries = await reader.readModelEntriesForFeedback();

  const m2 = createSupabasePrmReviewDecisionRepository(supabase as unknown as PrmReviewDecisionWriteClient, user.id);
  const m3Insert = createSupabasePrmModelEntryRepository(supabase as unknown as PrmModelEntryWriteClient, user.id);
  const m3Update = createSupabasePrmModelEntryUpdater(supabase as unknown as PrmModelEntryUpdateClient, user.id);

  const result = await executeTendencyFeedback({ entries, rawRequest: body, m2, m3Insert, m3Update, nowMs: Date.now() });
  return NextResponse.json(result);
}
