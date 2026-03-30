// POST /api/talk/threads/[threadId]/read — 既読更新
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  try {
    const { threadId } = await params;
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Upsert 既読カーソル
    const { error } = await supabase
      .from("talk_read_cursors")
      .upsert(
        {
          user_id: user.id,
          thread_id: threadId,
          last_read_at: new Date().toISOString(),
        },
        { onConflict: "user_id,thread_id" },
      );

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("talk read POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
