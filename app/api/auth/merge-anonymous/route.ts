// app/api/auth/merge-anonymous/route.ts
// 後ログイン型: 匿名データの既存アカウントへの移管 API
// ログイン直後にクライアントから呼ばれる

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { mergeAnonymousIntoExistingUser } from "@/lib/auth/mergeAnonymousData";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // 現在のユーザーを取得（ログイン後のユーザー）
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 匿名ユーザーが昇格した場合（ケース1）は merge 不要
    // ケース2: 既存アカウントにログインした場合のみ merge が必要
    const body = await request.json();
    const anonymousUserId = body.anonymousUserId;

    if (!anonymousUserId) {
      return NextResponse.json(
        { error: "anonymousUserId is required" },
        { status: 400 }
      );
    }

    // 自分自身への merge は不要（昇格ケース）
    if (anonymousUserId === user.id) {
      return NextResponse.json({
        success: true,
        mergedObservations: 0,
        conflictResolved: 0,
        message: "Same user — no merge needed (upgrade case)",
      });
    }

    const result = await mergeAnonymousIntoExistingUser(
      user.id,
      anonymousUserId
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[merge-anonymous] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
