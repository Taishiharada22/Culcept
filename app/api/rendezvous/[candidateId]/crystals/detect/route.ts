import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { detectCrystals } from "@/lib/rendezvous/memoryCrystal";
import type { Crystal, CrystalType } from "@/lib/rendezvous/memoryCrystal";

export const runtime = "nodejs";

/**
 * POST /api/rendezvous/[candidateId]/crystals/detect
 * Detect new memory crystals from recent chat messages.
 */
export async function POST(
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
  const { data: candidate } = await supabaseAdmin
    .from("rendezvous_candidates")
    .select("id, user_a, user_b, state")
    .eq("id", candidateId)
    .single();

  if (!candidate) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (candidate.user_a !== user.id && candidate.user_b !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get the chat thread
  const { data: chat } = await supabaseAdmin
    .from("rendezvous_chats")
    .select("thread_id")
    .eq("candidate_id", candidateId)
    .maybeSingle();

  if (!chat?.thread_id) {
    return NextResponse.json({ ok: true, newCrystals: [] });
  }

  // Get recent messages (last 50)
  const { data: messages } = await supabaseAdmin
    .from("rendezvous_messages")
    .select("id, sender_id, body, media_url, created_at")
    .eq("thread_id", chat.thread_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!messages || messages.length === 0) {
    return NextResponse.json({ ok: true, newCrystals: [] });
  }

  // Reverse to chronological order for detection
  const chronological = [...messages].reverse();

  // Get existing crystals
  const { data: existingRows } = await supabaseAdmin
    .from("rendezvous_memory_crystals")
    .select("*")
    .eq("candidate_id", candidateId);

  const existingCrystals: Crystal[] = (existingRows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    type: r.crystal_type as CrystalType,
    name: r.crystal_name_ja as string,
    colorHex: r.color_hex as string,
    shape: r.shape as Crystal["shape"],
    messageRange: {
      start: (r.message_range_start as string) ?? "",
      end: (r.message_range_end as string) ?? "",
    },
  }));

  // Run detection
  const newCrystals = detectCrystals(chronological, candidateId, existingCrystals);

  if (newCrystals.length === 0) {
    return NextResponse.json({ ok: true, newCrystals: [] });
  }

  // Insert new crystals into DB
  const insertRows = newCrystals.map((c) => ({
    id: c.id,
    candidate_id: candidateId,
    detected_by_user_id: user.id,
    crystal_type: c.type,
    crystal_name_ja: c.name,
    color_hex: c.colorHex,
    shape: c.shape,
    message_range_start: c.messageRange.start,
    message_range_end: c.messageRange.end,
    context_snippet: c.contextSnippet ?? null,
    shared: false,
  }));

  const { error: insertErr } = await supabaseAdmin
    .from("rendezvous_memory_crystals")
    .insert(insertRows);

  if (insertErr) {
    console.error("[crystals/detect] insert error:", insertErr);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, newCrystals });
}
