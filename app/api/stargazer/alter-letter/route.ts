import { NextRequest, NextResponse } from "next/server";
import { checkStargazerTier } from "@/lib/stargazer/tierGuard";
import { loadAlterGrowthState } from "@/lib/stargazer/alterGrowth";
import {
  shouldGenerateLetter,
  generateAlterLetter,
  saveAlterLetter,
  getUnreadLetter,
  markLetterAsRead,
  getLastLetterSessionCount,
  getPreviousLetterInsights,
} from "@/lib/stargazer/alterLetters";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/stargazer/alter-letter
 * ユーザーの最新の未読手紙を返す。なければ null。
 */
export async function GET() {
  try {
    const tierCheck = await checkStargazerTier("alter");
    if (tierCheck instanceof NextResponse) return tierCheck;
    const { userId } = tierCheck;

    const letter = await getUnreadLetter(userId);

    return NextResponse.json({
      ok: true,
      letter: letter ?? null,
    });
  } catch (error) {
    console.error("[alter-letter] GET failed:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/stargazer/alter-letter
 * 手紙を生成して返す（shouldGenerateLetter が true の場合のみ）。
 * Body: { recentObservations?: string[] }
 */
export async function POST(req: NextRequest) {
  try {
    const tierCheck = await checkStargazerTier("alter");
    if (tierCheck instanceof NextResponse) return tierCheck;
    const { userId } = tierCheck;

    let body: { recentObservations?: string[] } = {};
    try {
      body = await req.json();
    } catch {
      // Body is optional
    }

    const recentObservations = Array.isArray(body.recentObservations)
      ? body.recentObservations.filter(
          (o): o is string => typeof o === "string",
        ).slice(0, 10)
      : [];

    // 成長状態を読み込み
    const growthState = await loadAlterGrowthState(userId);
    const sessionCount = growthState.sessionsCompleted;

    // 最後の手紙のセッション数を取得
    const lastLetterSession = await getLastLetterSessionCount(userId);

    // 生成すべきか判定
    if (!(await shouldGenerateLetter(sessionCount, lastLetterSession))) {
      return NextResponse.json({
        ok: true,
        generated: false,
        reason:
          sessionCount < 5
            ? "セッション数が不足しています"
            : "まだ次の手紙の時期ではありません",
        letter: null,
      });
    }

    // 過去の手紙のインサイトを取得（繰り返し防止）
    const previousLetters = await getPreviousLetterInsights(userId, 10);

    // 手紙を生成
    const letter = await generateAlterLetter({
      userId,
      sessionCount,
      alterGrowthState: growthState,
      recentObservations,
      previousLetters,
    });

    // DBに保存
    const saved = await saveAlterLetter(letter);

    return NextResponse.json({
      ok: true,
      generated: true,
      saved,
      letter,
    });
  } catch (error) {
    console.error("[alter-letter] POST failed:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PATCH /api/stargazer/alter-letter
 * 手紙を既読にする。
 * Body: { letterId: string }
 */
export async function PATCH(req: NextRequest) {
  try {
    const tierCheck = await checkStargazerTier("alter");
    if (tierCheck instanceof NextResponse) return tierCheck;

    let body: { letterId?: string; reaction?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const letterId = body.letterId;
    if (!letterId || typeof letterId !== "string") {
      return NextResponse.json(
        { error: "letterId は必須です" },
        { status: 400 },
      );
    }

    // reaction がある場合は反応を保存
    const VALID_REACTIONS = ["resonated", "thought_provoking", "off_target"];
    if (body.reaction && VALID_REACTIONS.includes(body.reaction)) {
      const supabase = await supabaseServer();
      const { error: reactionError } = await supabase
        .from("stargazer_alter_letters")
        .update({
          user_reaction: body.reaction,
          reacted_at: new Date().toISOString(),
        })
        .eq("id", letterId);
      // カラム未追加（マイグレーション未適用）の場合は黙って続行
      if (reactionError && reactionError.code !== "PGRST204" && reactionError.code !== "42703") {
        console.warn("[alter-letter] Reaction save failed:", reactionError.message);
      }
    }

    // 既読マークも同時に
    const success = await markLetterAsRead(letterId);

    return NextResponse.json({
      ok: true,
      marked: success,
      reaction: body.reaction ?? null,
    });
  } catch (error) {
    console.error("[alter-letter] PATCH failed:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
