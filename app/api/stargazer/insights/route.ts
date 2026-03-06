import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: insights, error } = await supabase
      .from("personality_insights")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Failed to fetch insights:", error);
    }

    const cards = (insights || []).map((ins) => ({
      id: ins.id,
      type: ins.insight_type || "pattern",
      title: ins.title || "",
      description: ins.description || "",
      dimension: ins.dimension,
      confidence: ins.confidence,
      createdAt: ins.created_at,
    }));

    // Get top dimensions
    const dimCounts: Record<string, number> = {};
    cards.forEach((c) => {
      if (c.dimension) dimCounts[c.dimension] = (dimCounts[c.dimension] || 0) + 1;
    });
    const topDimensions = Object.entries(dimCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([d]) => d);

    return NextResponse.json({
      ok: true,
      cards,
      totalInsights: cards.length,
      topDimensions,
    });
  } catch (error) {
    console.error("Failed to get insights:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
