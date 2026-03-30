import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyCandidateBelongsToUser } from "@/lib/rendezvous/helpers";
import { buildContagionProfile } from "@/lib/rendezvous/emotionalContagion";

export const runtime = "nodejs";

/**
 * GET /api/rendezvous/[candidateId]/emotional-contagion
 * 感情伝播プロファイルを返す
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const { candidateId } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify candidate belongs to this user
  const verified = await verifyCandidateBelongsToUser(
    supabaseAdmin,
    candidateId,
    user.id,
  );

  if (!verified) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get chat thread
  const { data: chat } = await supabaseAdmin
    .from("rendezvous_chats")
    .select("thread_id")
    .eq("candidate_id", candidateId)
    .maybeSingle();

  if (!chat?.thread_id) {
    return NextResponse.json({
      ok: true,
      profile: {
        resonanceScore: 0,
        dominantFlow: "independent",
        contagionEvents: [],
        emotionalWave: [],
        peakMoments: [],
        currentTemperature: 0,
      },
    });
  }

  // Fetch recent messages (limit 200, ordered ASC)
  const { data: messages, error: msgErr } = await supabaseAdmin
    .from("rendezvous_messages")
    .select("sender_id, body, created_at")
    .eq("thread_id", chat.thread_id)
    .order("created_at", { ascending: true })
    .limit(200);

  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 });
  }

  // Build contagion profile
  const mapped = (messages ?? []).map((m: any) => ({
    text: m.body ?? "",
    sender_id: m.sender_id as string,
    created_at: m.created_at as string,
  }));

  const profile = buildContagionProfile(mapped, user.id);

  return NextResponse.json({ ok: true, profile });
}
