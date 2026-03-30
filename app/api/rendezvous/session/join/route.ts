import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { joinSessionQueue } from "@/lib/rendezvous/sessionMatcher";
import type { RendezvousCategory } from "@/lib/rendezvous/types";

// =============================================================================
// POST /api/rendezvous/session/join
// セッションキューに参加（マッチすれば即セッション開始）
// =============================================================================

const VALID_CATEGORIES: RendezvousCategory[] = ["romantic", "friendship", "cocreation", "community", "partner"];

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { category, mode } = body as { category: string; mode?: "text" | "voice" };

    if (!category || !VALID_CATEGORIES.includes(category as RendezvousCategory)) {
      return NextResponse.json({ ok: false, error: "Invalid category" }, { status: 400 });
    }

    const result = await joinSessionQueue({
      userId: auth.user.id,
      category: category as RendezvousCategory,
      mode: mode ?? "text",
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[session/join] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
