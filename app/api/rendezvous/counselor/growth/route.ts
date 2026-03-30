import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { generateGrowthInsights } from "@/lib/rendezvous/counselor/growthInsights";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const insights = await generateGrowthInsights(user.id);

    return NextResponse.json({ insights });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[counselor/growth] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
