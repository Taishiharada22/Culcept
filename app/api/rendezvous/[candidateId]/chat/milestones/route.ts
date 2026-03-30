import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/rendezvous/[candidateId]/chat/milestones
 * 到達済みマイルストーン一覧
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const { candidateId } = await params;
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: milestones } = await supabaseAdmin
      .from("rendezvous_chat_milestones")
      .select("milestone_type, reached_at, reflection_answer")
      .eq("candidate_id", candidateId)
      .order("reached_at", { ascending: true });

    return NextResponse.json({ ok: true, milestones: milestones ?? [] });
  } catch (err: any) {
    console.error("[milestones GET] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/rendezvous/[candidateId]/chat/milestones
 * マイルストーン到達 + リフレクション回答
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const { candidateId } = await params;
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { milestoneType, reflectionAnswer } = body;

    if (!milestoneType) {
      return NextResponse.json({ error: "milestoneType required" }, { status: 400 });
    }

    // Upsert (unique constraint on candidate_id + milestone_type)
    const { error } = await supabaseAdmin
      .from("rendezvous_chat_milestones")
      .upsert(
        {
          candidate_id: candidateId,
          milestone_type: milestoneType,
          reflection_answer: reflectionAnswer ?? null,
        },
        { onConflict: "candidate_id,milestone_type" },
      );

    if (error) {
      console.error("[milestones POST] upsert error:", error);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[milestones POST] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
