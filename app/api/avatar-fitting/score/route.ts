import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { evaluateFitting, saveEvaluation } from "@/lib/avatar-fitting";
import type { ScoreRequest } from "@/lib/avatar-fitting/types";

export async function POST(request: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json() as ScoreRequest;

    if (!body.imageBase64 || !body.mimeType) {
      return NextResponse.json({ error: "imageBase64 and mimeType are required" }, { status: 400 });
    }

    const result = await evaluateFitting(supabase, user.id, body, user.user_metadata?.display_name);

    const evaluationId = await saveEvaluation(supabase, user.id, result).catch(err => {
      console.error("[avatar-fitting/score] Save failed:", err);
      return null;
    });

    return NextResponse.json({ ...result, evaluationId });
  } catch (err) {
    console.error("[avatar-fitting/score] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
