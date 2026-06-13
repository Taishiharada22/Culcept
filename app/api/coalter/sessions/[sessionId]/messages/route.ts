/**
 * POST /api/coalter/sessions/:sessionId/messages
 *   CoAlter local-only human send（user-RLS・author は server stamp・local-only gate）。
 *
 * 薄い wrapper: `supabaseServer()`（user-RLS client）を `handleCoAlterSend` に注入するだけ。
 * 全 invariant は handleCoAlterSend 側（docs/coalter-send-route-preflight.md）。
 *
 * **service_role なし / system 送信なし / read receipt/realtime/typing なし / `/talk` 不触**。
 */

import type { NextRequest } from "next/server";

import { supabaseServer } from "@/lib/supabase/server";
import { handleCoAlterList, handleCoAlterSend } from "@/app/api/coalter/_lib/sendRouteHandler";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const supabase = await supabaseServer();
  return handleCoAlterList(sessionId, { supabase });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const supabase = await supabaseServer();
  return handleCoAlterSend(req, sessionId, { supabase });
}
