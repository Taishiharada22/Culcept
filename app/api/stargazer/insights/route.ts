import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { analyzeValueActionGaps, type ValueActionGap } from "@/lib/stargazer/valueActionGap";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // personality_insights テーブルが存在しない場合やカラム不一致を安全にハンドル
    let insights: Record<string, unknown>[] | null = null;
    try {
      const result = await supabase
        .from("personality_insights")
        .select("id, insight_type, content, source, dimension, confidence, extracted_at")
        .eq("user_id", user.id)
        .order("extracted_at", { ascending: false })
        .limit(20);
      insights = result.data;
      if (result.error) {
        console.error("Failed to fetch insights:", result.error.message);
      }
    } catch (e) {
      console.error("Failed to fetch insights (exception):", e);
    }

    const cards = (insights || []).map((ins) => ({
      id: ins.id,
      type: ins.insight_type || "pattern",
      title: (ins.content as string) || "",
      description: "",
      dimension: ins.dimension as string | undefined,
      confidence: ins.confidence,
      createdAt: (ins.extracted_at as string) ?? null,
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

    // Value-Action Gap analysis (Three Mirrors self vs footprint)
    let valueActionGaps: ValueActionGap[] = [];
    try {
      const { extractImplicitValues } = await import("@/lib/stargazer/implicitValuesExtractor");
      const { data: axisSnapshots } = await supabase
        .from("stargazer_axis_snapshots")
        .select("axis_id, score, source")
        .eq("user_id", user.id)
        .order("session_date", { ascending: false })
        .limit(200);

      if (axisSnapshots && axisSnapshots.length > 0) {
        // Separate self-report vs footprint scores
        const selfScores: Record<string, number> = {};
        const footprintScores: Record<string, number> = {};
        for (const snap of axisSnapshots) {
          const key = snap.axis_id;
          if (snap.source === "footprint" && !(key in footprintScores)) {
            footprintScores[key] = snap.score;
          } else if (!(key in selfScores)) {
            selfScores[key] = snap.score;
          }
        }

        if (Object.keys(selfScores).length >= 3 && Object.keys(footprintScores).length >= 3) {
          const valuesResult = extractImplicitValues(selfScores as any);
          if (valuesResult) {
            valueActionGaps = analyzeValueActionGaps(valuesResult, selfScores as any, footprintScores as any);
          }
        }
      }
    } catch (e) {
      console.warn("Value-action gap analysis failed:", e);
    }

    return NextResponse.json({
      ok: true,
      cards,
      totalInsights: cards.length,
      topDimensions,
      valueActionGaps,
    }, {
      headers: {
        "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("Failed to get insights:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
