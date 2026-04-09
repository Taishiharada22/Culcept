import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  generateSelfDiscoveryFeedback,
} from "@/lib/rendezvous/counselor/selfDiscoveryFeedback";
import type {
  InteractionKind,
  BehaviorSignals,
} from "@/lib/rendezvous/counselor/selfDiscoveryFeedback";

// ============================================================
// Self-Discovery Feedback API
//
// POST — インタラクション後の自己発見問いを生成
// GET  — 直近のフィードバックを取得
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as {
      candidateId: string;
      interactionKind: InteractionKind;
      selfReportedFeeling: string;
      behaviorSignals?: BehaviorSignals;
    };

    if (!body.candidateId || !body.interactionKind || !body.selfReportedFeeling) {
      return NextResponse.json(
        { error: "candidateId, interactionKind, selfReportedFeeling are required" },
        { status: 400 },
      );
    }

    const feedback = await generateSelfDiscoveryFeedback({
      userId: user.id,
      candidateId: body.candidateId,
      interactionKind: body.interactionKind,
      selfReportedFeeling: body.selfReportedFeeling,
      behaviorSignals: body.behaviorSignals,
    });

    return NextResponse.json({ feedback }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[self-discovery-feedback] POST error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 直近の self-discovery feedback を取得
    const { data } = await supabase
      .from("rendezvous_counselor_sessions")
      .select("session_data, created_at")
      .eq("user_id", user.id)
      .eq("state", "self_discovery_feedback_v1")
      .order("created_at", { ascending: false })
      .limit(3);

    const feedbacks = (data ?? []).map((row) => ({
      ...(row.session_data as Record<string, unknown>),
      createdAt: row.created_at,
    }));

    return NextResponse.json({ feedbacks });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[self-discovery-feedback] GET error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
