import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * GET /api/rendezvous/[candidateId]/photos
 * Returns the counterpart's photos filtered by current disclosure level.
 * "current" slot photos are NEVER returned (verification only).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const { candidateId } = await params;
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const userId = auth.user.id;

    // 1. Get the candidate record to find counterpart
    const { data: candidate, error: candErr } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b")
      .eq("id", candidateId)
      .single();

    if (candErr || !candidate)
      return NextResponse.json({ ok: false, error: "Candidate not found" }, { status: 404 });

    // Verify user is part of this candidate pair
    if (candidate.user_a !== userId && candidate.user_b !== userId)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });

    const isUserA = candidate.user_a === userId;
    const counterpartId = isUserA ? candidate.user_b : candidate.user_a;

    // 2. Get or create disclosure record
    let { data: disclosure } = await supabaseAdmin
      .from("rendezvous_photo_disclosure")
      .select("*")
      .eq("candidate_id", candidateId)
      .maybeSingle();

    if (!disclosure) {
      // Create initial disclosure record
      const { data: newDisc, error: discErr } = await supabaseAdmin
        .from("rendezvous_photo_disclosure")
        .insert({
          candidate_id: candidateId,
          user_a: candidate.user_a,
          user_b: candidate.user_b,
          a_disclosure_level: 0,
          b_disclosure_level: 0,
        })
        .select("*")
        .single();

      if (discErr) {
        // May already exist from race condition
        const { data: existing } = await supabaseAdmin
          .from("rendezvous_photo_disclosure")
          .select("*")
          .eq("candidate_id", candidateId)
          .single();
        disclosure = existing;
      } else {
        disclosure = newDisc;
      }
    }

    if (!disclosure)
      return NextResponse.json({ ok: false, error: "Failed to get disclosure" }, { status: 500 });

    // 3. Determine what level of photos the current user can see of the counterpart
    // The counterpart's disclosure level toward the current user
    const viewLevel = isUserA
      ? disclosure.b_disclosure_level
      : disclosure.a_disclosure_level;

    // 4. Fetch counterpart photos where disclosure_phase <= viewLevel
    //    Never return "current" slot (verification only)
    const { data: photos, error: photoErr } = await supabaseAdmin
      .from("rendezvous_photos")
      .select("id, storage_path, slot_type, disclosure_phase, display_order, created_at")
      .eq("user_id", counterpartId)
      .lte("disclosure_phase", viewLevel)
      .neq("slot_type", "current")
      .order("display_order");

    if (photoErr)
      return NextResponse.json({ ok: false, error: photoErr.message }, { status: 500 });

    const items = (photos ?? []).map((row: any) => {
      const { data: urlData } = supabaseAdmin.storage
        .from("rendezvous-photos")
        .getPublicUrl(row.storage_path);
      return {
        id: row.id,
        url: urlData?.publicUrl ?? "",
        slotType: row.slot_type,
        disclosurePhase: row.disclosure_phase,
        displayOrder: row.display_order,
      };
    });

    return NextResponse.json({
      ok: true,
      photos: items,
      disclosureLevel: viewLevel,
      revealStatus: {
        myRevealRequested: isUserA
          ? disclosure.a_reveal_requested
          : disclosure.b_reveal_requested,
        partnerRevealRequested: isUserA
          ? disclosure.b_reveal_requested
          : disclosure.a_reveal_requested,
        revealed: !!disclosure.revealed_at,
      },
    });
  } catch (err: unknown) {
    console.error("[rendezvous/candidateId/photos] GET error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/rendezvous/[candidateId]/photos
 * Request a phase upgrade (mutual reveal).
 *
 * Body: { action: "request_reveal" }
 *
 * Phase 2 mutual reveal:
 * 1. User sets their reveal_requested = true
 * 2. If both users have requested, both disclosure_levels become 2
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const { candidateId } = await params;
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const userId = auth.user.id;
    const body = await request.json();
    const { action } = body as { action: string };

    if (action !== "request_reveal")
      return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });

    // Get candidate
    const { data: candidate } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b")
      .eq("id", candidateId)
      .single();

    if (!candidate)
      return NextResponse.json({ ok: false, error: "Candidate not found" }, { status: 404 });

    if (candidate.user_a !== userId && candidate.user_b !== userId)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });

    const isUserA = candidate.user_a === userId;

    // Get disclosure record
    const { data: disclosure } = await supabaseAdmin
      .from("rendezvous_photo_disclosure")
      .select("*")
      .eq("candidate_id", candidateId)
      .single();

    if (!disclosure)
      return NextResponse.json({ ok: false, error: "Disclosure record not found" }, { status: 404 });

    // Already revealed
    if (disclosure.revealed_at) {
      return NextResponse.json({
        ok: true,
        revealed: true,
        waitingForPartner: false,
      });
    }

    // Set current user's reveal request
    const updateField = isUserA
      ? { a_reveal_requested: true }
      : { b_reveal_requested: true };

    await supabaseAdmin
      .from("rendezvous_photo_disclosure")
      .update({ ...updateField, updated_at: new Date().toISOString() })
      .eq("id", disclosure.id);

    // Check if both have now requested
    const otherRequested = isUserA
      ? disclosure.b_reveal_requested
      : disclosure.a_reveal_requested;

    if (otherRequested) {
      // Both requested — mutual reveal
      await supabaseAdmin
        .from("rendezvous_photo_disclosure")
        .update({
          a_disclosure_level: 2,
          b_disclosure_level: 2,
          revealed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", disclosure.id);

      return NextResponse.json({
        ok: true,
        revealed: true,
        waitingForPartner: false,
      });
    }

    return NextResponse.json({
      ok: true,
      revealed: false,
      waitingForPartner: true,
    });
  } catch (err: unknown) {
    console.error("[rendezvous/candidateId/photos] POST error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
