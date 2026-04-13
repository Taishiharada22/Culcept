import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { loadOriginClientState, persistOriginState } from "@/lib/origin/v7/server";
import type { CurrentPosition, DraftChapter, ExplorationStep } from "@/lib/origin/v7/types";
import type { OriginSessionStatus } from "@/lib/origin/v7/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const state = await loadOriginClientState(supabase, user.id);
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    console.error("[origin/state:get]", error);
    return NextResponse.json({ error: "Origin状態の取得に失敗しました" }, { status: 500 });
  }
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
      status?: OriginSessionStatus;
      currentStep?: ExplorationStep | null;
      draft?: DraftChapter | null;
      currentPosition?: CurrentPosition | null;
    };

    const result = await persistOriginState({
      supabase,
      userId: user.id,
      sessionId: body.sessionId,
      status: body.status,
      currentStep: body.currentStep,
      draft: body.draft,
      currentPosition: body.currentPosition,
    });

    return NextResponse.json({
      ok: true,
      sessionId: result.sessionId,
      status: result.status,
    });
  } catch (error) {
    console.error("[origin/state:post]", error);
    return NextResponse.json({ error: "Origin状態の保存に失敗しました" }, { status: 500 });
  }
}
