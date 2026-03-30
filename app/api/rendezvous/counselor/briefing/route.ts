import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyCandidateBelongsToUser } from "@/lib/rendezvous/helpers";
import { generateBriefing } from "@/lib/rendezvous/counselor/briefingGenerator";
import type {
  PreBriefingRow,
  PreConnectionBriefing,
} from "@/lib/rendezvous/counselor/types";

export async function GET(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const candidateId = req.nextUrl.searchParams.get("candidateId");
    if (!candidateId) {
      return NextResponse.json(
        { error: "candidateId query param is required" },
        { status: 400 },
      );
    }

    const userId = user.id;

    // Verify candidate belongs to requesting user
    const ownership = await verifyCandidateBelongsToUser(supabaseAdmin, candidateId, userId);
    if (!ownership) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    // Check if briefing already exists (cached)
    const { data: existing } = await supabaseAdmin
      .from("rendezvous_pre_briefings")
      .select("*")
      .eq("candidate_id", candidateId)
      .eq("user_id", userId)
      .single<PreBriefingRow>();

    if (existing) {
      return NextResponse.json({
        briefing: existing.briefing_data as PreConnectionBriefing,
        cached: true,
      });
    }

    // Generate new briefing
    const briefing = await generateBriefing({ candidateId, userId });

    // Store in DB for caching
    await supabaseAdmin.from("rendezvous_pre_briefings").insert({
      candidate_id: candidateId,
      user_id: userId,
      briefing_data: briefing as unknown as Record<string, unknown>,
    });

    return NextResponse.json({
      briefing,
      cached: false,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[counselor/briefing] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
