import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { completeOriginSession } from "@/lib/origin/v7/server";
import type { CurrentPosition, MemoryChapter } from "@/lib/origin/v7/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isMemoryChapter(value: unknown): value is MemoryChapter {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<MemoryChapter>;
  return Boolean(
    typeof maybe.id === "string" &&
      maybe.fact &&
      typeof maybe.fact === "object" &&
      typeof maybe.fact.period === "string" &&
      maybe.meaning &&
      typeof maybe.meaning === "object",
  );
}

export async function POST(request: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      sessionId?: string | null;
      chapter?: unknown;
      currentPosition?: CurrentPosition | null;
    };

    if (!isMemoryChapter(body.chapter)) {
      return NextResponse.json({ error: "Invalid chapter payload" }, { status: 400 });
    }

    const result = await completeOriginSession({
      supabase,
      userId: user.id,
      sessionId: body.sessionId,
      chapter: body.chapter,
      currentPosition: body.currentPosition,
    });

    return NextResponse.json({
      ok: true,
      sessionId: result.sessionId,
      recordId: result.recordId,
    });
  } catch (error) {
    console.error("[origin/complete]", error);
    return NextResponse.json({ error: "Originセッションの完了処理に失敗しました" }, { status: 500 });
  }
}
