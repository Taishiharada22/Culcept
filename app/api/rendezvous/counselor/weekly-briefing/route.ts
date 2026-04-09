import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrGenerateWeeklyBriefing } from "@/lib/rendezvous/counselor/weeklyBriefing";

export async function GET(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // forceRegenerate=true クエリパラメータで強制再生成
    const forceRegenerate =
      request.nextUrl.searchParams.get("forceRegenerate") === "true";

    const briefing = await getOrGenerateWeeklyBriefing(user.id, forceRegenerate);

    return NextResponse.json({ briefing });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[counselor/weekly-briefing] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
