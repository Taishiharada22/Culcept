// app/api/aneurasync/genome/route.ts
// PersonaGenome GET — assembleForUser 共有関数に委譲

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { assembleGenomeForUser } from "@/lib/genome/assembleForUser";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await assembleGenomeForUser(supabase, user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("aneurasync genome error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
