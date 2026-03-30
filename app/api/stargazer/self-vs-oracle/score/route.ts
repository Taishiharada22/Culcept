import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  calculateSAS,
  SAS_LEVEL_INFO,
  type DailyChallenge,
} from "@/lib/stargazer/selfVsOracle";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DB テーブル参照（マイグレーション未実行、インメモリ代替）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// self_vs_oracle_challenges テーブルから verified のチャレンジを取得
// → calculateSAS に渡して SAS スコアを計算

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// インメモリストア参照（route.ts と共有するために動的 import）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 注意: 本番では DB から取得する。ここではインメモリの challenge を
// 直接参照できないため、DB 取得をシミュレートする。

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET: SAS スコアと履歴を取得
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // TODO: DB から verified チャレンジを取得
    // const { data: challenges } = await supabase
    //   .from("self_vs_oracle_challenges")
    //   .select("*")
    //   .eq("user_id", user.id)
    //   .eq("status", "verified")
    //   .order("challenge_date", { ascending: true });

    // 暫定: 空の履歴で計算（DB 接続後に上記に差し替え）
    const challenges: DailyChallenge[] = [];

    const sas = calculateSAS(user.id, challenges);

    // レベル情報を付加
    const levelInfo = SAS_LEVEL_INFO[sas.level];

    return NextResponse.json({
      score: sas,
      levelInfo: {
        label: levelInfo.label,
        description: levelInfo.description,
      },
    });
  } catch (err) {
    console.error("[self-vs-oracle/score] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
