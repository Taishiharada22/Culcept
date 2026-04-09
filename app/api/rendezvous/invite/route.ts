import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  createInvitation,
  getTokenBalance,
  getMonthlyInviteRemaining,
  convertPointsToToken,
} from "@/lib/rendezvous/invitationTokens";
import type { ConversionType } from "@/lib/rendezvous/invitationTokens";

// ============================================================
// 招待トークン API
//
// GET   — トークン残高 + 今月の招待残数
// POST  — 招待コード生成 / ポイント→トークン変換
// ============================================================

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [balance, inviteRemaining] = await Promise.all([
      getTokenBalance(user.id),
      getMonthlyInviteRemaining(user.id),
    ]);

    return NextResponse.json({ balance, inviteRemaining });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[invite] GET error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json() as {
      action: "create_invitation" | "convert_tokens";
      inviteeEmail?: string;
      tokenType?: ConversionType;
    };

    if (body.action === "create_invitation") {
      const result = await createInvitation({
        inviterUserId: user.id,
        inviteeEmail: body.inviteeEmail,
      });
      return NextResponse.json(result, { status: 201 });
    }

    if (body.action === "convert_tokens") {
      if (!body.tokenType) {
        return NextResponse.json(
          { error: "tokenType is required for conversion" },
          { status: 400 },
        );
      }
      const balance = await convertPointsToToken(user.id, body.tokenType);
      return NextResponse.json({ balance });
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message.includes("上限") || message.includes("不足") ? 400 : 500;
    console.error("[invite] POST error:", err);
    return NextResponse.json({ error: message }, { status });
  }
}
