import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  getUserExchanges,
  createExchange,
  acknowledgeExchange,
  getUnacknowledgedExchangeCount,
} from "@/lib/rendezvous/exchangeProtocol";
import type { ExchangePayload } from "@/lib/rendezvous/exchangeProtocol";

// ============================================================
// Exchange Protocol API
//
// GET  — ユーザーの Exchange 一覧 + 未確認数
// POST — 新しい Exchange を作成
// PATCH — Exchange を受信確認（acknowledge）
// ============================================================

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [exchanges, unacknowledgedCount] = await Promise.all([
      getUserExchanges(user.id),
      getUnacknowledgedExchangeCount(user.id),
    ]);

    return NextResponse.json({ exchanges, unacknowledgedCount });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[counselor/exchange] GET error:", err);
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
      candidateId: string;
      toUserId: string;
      payload: ExchangePayload;
    };

    if (!body.candidateId || !body.toUserId || !body.payload) {
      return NextResponse.json(
        { error: "candidateId, toUserId, and payload are required" },
        { status: 400 },
      );
    }

    const exchange = await createExchange({
      candidateId: body.candidateId,
      fromUserId: user.id,
      toUserId: body.toUserId,
      payload: body.payload,
    });

    return NextResponse.json({ exchange }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message.includes("Phase 4+") ? 403 : 500;
    console.error("[counselor/exchange] POST error:", err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json() as { exchangeId: string };

    if (!body.exchangeId) {
      return NextResponse.json(
        { error: "exchangeId is required" },
        { status: 400 },
      );
    }

    await acknowledgeExchange(body.exchangeId, user.id);

    return NextResponse.json({ acknowledged: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[counselor/exchange] PATCH error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
