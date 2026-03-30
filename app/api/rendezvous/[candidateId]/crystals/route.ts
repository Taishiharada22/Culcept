import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Crystal, CrystalType } from "@/lib/rendezvous/memoryCrystal";

export const runtime = "nodejs";

/**
 * GET /api/rendezvous/[candidateId]/crystals
 * Fetch memory crystals for a candidate relationship.
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

  // Verify the candidate belongs to this user
  const { data: candidate } = await supabaseAdmin
    .from("rendezvous_candidates")
    .select("id, user_a, user_b")
    .eq("id", candidateId)
    .single();

  if (!candidate) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (candidate.user_a !== user.id && candidate.user_b !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Query crystals: own crystals OR shared ones
  const { data: rows, error } = await supabaseAdmin
    .from("rendezvous_memory_crystals")
    .select("*")
    .eq("candidate_id", candidateId)
    .or(`detected_by_user_id.eq.${user.id},shared.eq.true`)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const crystals: Crystal[] = (rows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    type: r.crystal_type as CrystalType,
    name: r.crystal_name_ja as string,
    colorHex: r.color_hex as string,
    shape: r.shape as Crystal["shape"],
    messageRange: {
      start: (r.message_range_start as string) ?? "",
      end: (r.message_range_end as string) ?? "",
    },
    contextSnippet: (r.context_snippet as string) ?? undefined,
  }));

  return NextResponse.json({ ok: true, crystals });
}
