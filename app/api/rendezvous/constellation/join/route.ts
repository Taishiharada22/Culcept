import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { tryFormConstellation } from "@/lib/rendezvous/constellationEngine";
import type { RendezvousCategory } from "@/lib/rendezvous/types";

// =============================================================================
// POST /api/rendezvous/constellation/join
// 星座形成に参加
// =============================================================================

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { category } = body as { category: RendezvousCategory };

    if (!category) {
      return NextResponse.json({ ok: false, error: "Missing category" }, { status: 400 });
    }

    const result = await tryFormConstellation({
      userId: auth.user.id,
      category,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[constellation/join] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
