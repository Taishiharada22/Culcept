import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  runFullPatternDetection,
  type BehavioralSignal,
  type AxisSnapshot,
} from "@/lib/stargazer/patternDetectionEngine";
import { selectAllAhaInsights } from "@/lib/stargazer/ahaEngine";

// ── GET: パターン検出 + Aha Insight を返す ──
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "未認証" }, { status: 401 });

    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    // 行動シグナルと軸スナップショットを並列取得
    const [{ data: rawSignals }, { data: rawStates }] = await Promise.all([
      supabase
        .from("stargazer_behavioral_signals")
        .select("signal_type, value, context, question_id, session_date, recorded_at")
        .eq("user_id", user.id)
        .gte("recorded_at", thirtyDaysAgo)
        .order("recorded_at", { ascending: false })
        .limit(500),
      supabase
        .from("stargazer_daily_states")
        .select("state_date, axis_id, score, day_of_week, hour")
        .eq("user_id", user.id)
        .gte("state_date", thirtyDaysAgo.slice(0, 10))
        .order("state_date", { ascending: false })
        .limit(500),
    ]);

    const signals: BehavioralSignal[] = (rawSignals ?? []).map(
      (r: Record<string, unknown>) => ({
        signal_type: String(r.signal_type ?? ""),
        value: Number(r.value) || 0,
        context: r.context ? String(r.context) : null,
        question_id: r.question_id ? String(r.question_id) : null,
        session_date: String(r.session_date ?? ""),
        recorded_at: String(r.recorded_at ?? ""),
      }),
    );

    const snapshots: AxisSnapshot[] = (rawStates ?? []).map(
      (r: Record<string, unknown>) => ({
        date: String(r.state_date ?? ""),
        axisId: String(r.axis_id ?? ""),
        score: Number(r.score) || 0,
        dayOfWeek: Number(r.day_of_week) || 0,
        hour: Number(r.hour) || 12,
      }),
    );

    // パターン検出
    const patterns = runFullPatternDetection(signals, snapshots);

    // 全ターゲット向けの Aha Insight を生成
    const ahaInsights = await selectAllAhaInsights(patterns);

    return NextResponse.json({
      ok: true,
      patterns,
      ahaInsights,
      meta: {
        signalCount: signals.length,
        snapshotCount: snapshots.length,
        patternCount: patterns.length,
      },
    });
  } catch (error) {
    console.error("[behavioral-signals GET] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "未認証" }, { status: 401 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "無効なJSON" }, { status: 400 }); }

  const { signals } = body;
  if (!Array.isArray(signals) || signals.length === 0) {
    return NextResponse.json({ error: "シグナルが空です" }, { status: 400 });
  }

  // Limit batch size
  const batch = signals.slice(0, 100).map((s: Record<string, unknown>) => ({
    user_id: user.id,
    signal_type: String(s.signal_type ?? "unknown").slice(0, 50),
    value: Number(s.value) || 0,
    context: s.context ? String(s.context).slice(0, 200) : null,
    question_id: s.question_id ? String(s.question_id).slice(0, 100) : null,
    original_choice: typeof s.original_choice === "number" ? s.original_choice : null,
    final_choice: typeof s.final_choice === "number" ? s.final_choice : null,
    session_date: s.session_date ?? new Date().toISOString().slice(0, 10),
  }));

  const { error } = await supabase.from("stargazer_behavioral_signals").insert(batch);
  if (error) {
    console.error("[behavioral-signals] Insert error:", error);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, synced: batch.length });
}
