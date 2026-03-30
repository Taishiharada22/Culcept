import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  generatePsycheSignature,
  type SignatureInput,
  type PsycheSignature,
} from "@/lib/stargazer/psycheSignature";
import { resolveArchetype } from "@/lib/stargazer/archetypeResolver";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

// ---------------------------------------------------------------------------
// GET — 最新の Psyche Signature を取得（DB保存済みがあればそれを返す）
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: row } = await supabase
      .from("stargazer_psyche_signature")
      .select("id, signature_type, period_start, period_end, signature_data, highlights, share_token, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      signature: row?.signature_data ?? null,
      meta: row
        ? {
            id: row.id,
            type: row.signature_type,
            periodStart: row.period_start,
            periodEnd: row.period_end,
            highlights: row.highlights,
            shareToken: row.share_token,
            createdAt: row.created_at,
          }
        : null,
    });
  } catch (err) {
    console.error("[psyche-signature] GET error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST — Psyche Signature を生成し DB に永続化
// クライアントから呼ぶ or Cron から呼ぶ
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const period = (body.period as string) ?? "weekly";

    // ── プロフィールデータ取得 ──
    const [
      { data: resolvedTypeRow },
      { data: starMapRow },
      { data: dailyStates },
    ] = await Promise.all([
      supabase
        .from("stargazer_resolved_types")
        .select("axis_scores, archetype_code")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("stargazer_star_maps")
        .select("observation_depth")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("stargazer_daily_states")
        .select("observation_date, inner_weather")
        .eq("user_id", user.id)
        .order("observation_date", { ascending: false })
        .limit(30),
    ]);

    const axisScores: Record<string, number> = {};
    if (resolvedTypeRow?.axis_scores && typeof resolvedTypeRow.axis_scores === "object") {
      for (const [k, v] of Object.entries(resolvedTypeRow.axis_scores as Record<string, unknown>)) {
        if (typeof v === "number") axisScores[k] = v;
      }
    }

    // アーキタイプ解決
    const archetypeResult = resolveArchetype(axisScores as Record<TraitAxisKey, number>);
    const archetypeCode = archetypeResult?.code ?? "PEA";

    // 期間計算
    const now = new Date();
    const periodDays = period === "monthly" ? 30 : period === "yearly" ? 365 : 7;
    const periodStart = new Date(now.getTime() - periodDays * 86400000);

    // Weather history
    const weatherHistory = (dailyStates ?? []).map((s) => ({
      date: s.observation_date as string,
      type: (s.inner_weather as string) ?? "calm",
    }));

    const signatureInput: SignatureInput = {
      archetypeCode,
      axisScores,
      weatherHistory,
      blindSpotDrops: 0,
      prophecyAccuracy: 0,
      mapProgress: typeof starMapRow?.observation_depth === "number" ? starMapRow.observation_depth / 100 : 0.3,
      discoveries: [],
      period: period as "weekly" | "monthly" | "yearly",
      periodStart: periodStart.toISOString().slice(0, 10),
      periodEnd: now.toISOString().slice(0, 10),
    };

    const signature = generatePsycheSignature(signatureInput);

    // ── DB 永続化 (signature_data JSONB に全体を格納) ──
    const { data: inserted, error: insertError } = await supabase
      .from("stargazer_psyche_signature")
      .insert({
        user_id: user.id,
        signature_type: period,
        period_start: signatureInput.periodStart,
        period_end: signatureInput.periodEnd,
        signature_data: signature,
        highlights: {
          mostExtremeAxis: signature.mostExtremeAxis ?? null,
          biggestContradiction: signature.biggestContradiction ?? null,
          topDiscoveries: signature.topDiscoveries,
        },
        share_token: signature.shareToken,
      })
      .select("id, created_at")
      .single();

    if (insertError) {
      console.error("[psyche-signature] insert error:", insertError);
    }

    return NextResponse.json({
      ok: true,
      id: inserted?.id ?? null,
      createdAt: inserted?.created_at ?? now.toISOString(),
      signature,
      archetypeCode,
    });
  } catch (err) {
    console.error("[psyche-signature] POST error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
