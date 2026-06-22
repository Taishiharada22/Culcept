/**
 * GET /api/coalter/sessions/:sessionId/preview
 *   C5-E: CoAlter **非永続 brain preview**（read-only・DB write なし・保存なし）。
 *
 * 薄い wrapper: `supabaseServer()`（user-RLS client）を `handleCoAlterPreview` に注入するだけ。
 * 全 invariant は handleCoAlterPreview 側（docs/coalter-c5-implementation-preflight.md §5）。
 *
 * **POST なし**（preview は read 派生・write しない）。service_role/coalter insert/persistence なし。
 */

import type { NextRequest } from "next/server";

import { supabaseServer } from "@/lib/supabase/server";
import { handleCoAlterPreview } from "@/app/api/coalter/_lib/coalterPreviewHandler";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const supabase = await supabaseServer();
  return handleCoAlterPreview(sessionId, { supabase });
}
