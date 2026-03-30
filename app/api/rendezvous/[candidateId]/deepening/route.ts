import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getDeepeningMission } from "@/lib/rendezvous/deepeningMissions";

// =============================================================================
// GET /api/rendezvous/[candidateId]/deepening
// 接続後の深化ミッションを取得
// =============================================================================

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { candidateId } = await params;

    // 候補の接続日を取得
    const { data: candidate } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, state, user_a, user_b, updated_at")
      .eq("id", candidateId)
      .single();

    if (!candidate) {
      return NextResponse.json({ ok: false, error: "Candidate not found" }, { status: 404 });
    }

    // 参加者確認
    if (candidate.user_a !== auth.user.id && candidate.user_b !== auth.user.id) {
      return NextResponse.json({ ok: false, error: "Not a participant" }, { status: 403 });
    }

    // mutual_liked 以降のみミッション提供
    if (!["mutual_liked", "chat_opened"].includes(candidate.state)) {
      return NextResponse.json({ ok: true, mission: null, reason: "not_connected" });
    }

    const connectionDate = candidate.updated_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);

    const mission = await getDeepeningMission({
      candidateId,
      connectionDate,
    });

    if (!mission) {
      return NextResponse.json({ ok: true, mission: null });
    }

    // 自分がA or Bか判定
    const isA = candidate.user_a === auth.user.id;
    const myCompleted = isA ? mission.completedByA : mission.completedByB;

    return NextResponse.json({
      ok: true,
      mission: {
        id: mission.id,
        dayNumber: mission.dayNumber,
        type: mission.missionType,
        title: mission.payload.title,
        description: mission.payload.description,
        prompt: mission.payload.prompt,
        suggestion: mission.payload.suggestion,
        myCompleted,
        partnerCompleted: isA ? mission.completedByB : mission.completedByA,
      },
    });
  } catch (err) {
    console.error("[deepening] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
