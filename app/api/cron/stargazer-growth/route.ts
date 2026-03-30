import { NextResponse } from "next/server";
import { authorizeInternalRequest } from "@/lib/ai/internalAuth";
import { supabaseServer } from "@/lib/supabase/server";
import { runGrowthCycle } from "@/lib/stargazer/growthOrchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = authorizeInternalRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  try {
    const supabase = await supabaseServer();
    const result = await runGrowthCycle(supabase, "cron");
    return NextResponse.json(result);
  } catch (error) {
    console.error("[stargazer-growth] Cron error:", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}
