import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/rendezvous/stories — 承認済みストーリー一覧
 * POST /api/rendezvous/stories — 新規投稿
 */

export async function GET() {
  try {
    const supabase = await supabaseServer();

    const { data, error } = await supabase
      .from("rendezvous_success_stories")
      .select("id, category, title, body, emoji, anonymized_context, created_at")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    return NextResponse.json({ ok: true, stories: data ?? [] });
  } catch (err: any) {
    console.error("[stories] GET error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title, content: storyBody, category, emoji } = body;

    if (!title || !storyBody) {
      return NextResponse.json(
        { ok: false, error: "title and content are required" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("rendezvous_success_stories")
      .insert({
        user_id: auth.user.id,
        title: title.slice(0, 100),
        body: storyBody.slice(0, 2000),
        category: category ?? "friendship",
        emoji: emoji ?? "✨",
        status: "pending",
      })
      .select("id")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, storyId: data.id });
  } catch (err: any) {
    console.error("[stories] POST error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
