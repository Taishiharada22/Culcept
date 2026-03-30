import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { saveFeedback } from "@/lib/avatar-fitting";
import type { FeedbackRequest } from "@/lib/avatar-fitting/types";

export async function POST(request: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json() as FeedbackRequest;

    if (!body.evaluationId || body.userRating == null) {
      return NextResponse.json({ error: "evaluationId and userRating are required" }, { status: 400 });
    }

    const feedbackId = await saveFeedback(supabase, user.id, body.evaluationId, {
      userRating: body.userRating,
      sizeSatisfaction: body.sizeSatisfaction,
      visualSatisfaction: body.visualSatisfaction,
      purchased: body.purchased,
      comment: body.comment,
    });

    if (!feedbackId) {
      return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
    }

    return NextResponse.json({ feedbackId });
  } catch (err) {
    console.error("[avatar-fitting/feedback] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
