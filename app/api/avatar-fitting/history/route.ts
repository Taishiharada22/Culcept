import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getEvaluationHistory } from "@/lib/avatar-fitting";

export async function GET(request: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 50);

    const history = await getEvaluationHistory(supabase, user.id, limit);
    return NextResponse.json({ history });
  } catch (err) {
    console.error("[avatar-fitting/history] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
