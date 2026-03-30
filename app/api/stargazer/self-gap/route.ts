import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { computeSelfGap } from "@/lib/relational/selfGap";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // context付きで axis_snapshots を取得
    const { data: snapshots } = await supabase
      .from("stargazer_axis_snapshots")
      .select("axis_id, score, confidence, context, session_date")
      .eq("user_id", user.id)
      .order("session_date", { ascending: false })
      .limit(500);

    if (!snapshots || snapshots.length === 0) {
      return NextResponse.json({
        ok: true,
        selfGap: {
          items: [],
          overallNarrative:
            "まだ観測データがありません。Stargazerで日常の観測を続けると、あなたの変化パターンが見えてきます。",
          mostShiftedAxis: null,
        },
      });
    }

    // context別にグルーピング (各contextで最新スコアを使う)
    const contextScores: Record<
      string,
      Partial<Record<TraitAxisKey, number>>
    > = {};

    for (const snap of snapshots) {
      const ctx = snap.context ?? "normal";
      if (!contextScores[ctx]) contextScores[ctx] = {};

      const axisId = snap.axis_id as TraitAxisKey;
      // session_date降順なので、最初に見つかった値が最新
      if (!(axisId in contextScores[ctx]!)) {
        contextScores[ctx]![axisId] = snap.score;
      }
    }

    const selfGap = computeSelfGap(contextScores);

    return NextResponse.json({ ok: true, selfGap });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[stargazer/self-gap] error:", message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
