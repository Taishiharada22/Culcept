// GET /api/genome-card/my-id — 自分の公開IDを取得
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("public_id")
      .eq("id", user.id)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      publicId: profile?.public_id ?? null,
    });
  } catch (error) {
    console.error("[genome-card/my-id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
