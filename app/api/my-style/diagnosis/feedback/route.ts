import { NextRequest, NextResponse } from "next/server";

import { supabaseServer } from "@/lib/supabase/server";
import { appendDiagnosisFeedback } from "@/lib/my-style/diagnosisStore";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({}));
    const rating = Math.max(1, Math.min(5, Number(payload?.rating ?? 0)));
    const accurate = Boolean(payload?.accurate);
    const notes = String(payload?.notes ?? "").trim().slice(0, 1000);
    const diagnosticProfileId = String(payload?.diagnostic_profile_id ?? "").trim() || null;

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ ok: false, error: "rating must be 1..5" }, { status: 400 });
    }

    const entry = await appendDiagnosisFeedback({
      supabase,
      userId: auth.user.id,
      diagnosticProfileId,
      rating,
      accurate,
      notes,
    });

    return NextResponse.json({ ok: true, feedback: entry });
  } catch (error: any) {
    console.error("my-style diagnosis feedback POST error", error);
    return NextResponse.json({ ok: false, error: String(error?.message ?? "Internal error") }, { status: 500 });
  }
}

