import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/push/register
 * Push通知トークンの登録・更新
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { token, platform } = body as {
      token: string;
      platform: "web" | "ios" | "android";
    };

    if (!token || !platform) {
      return NextResponse.json({ error: "Missing token or platform" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("push_notification_tokens")
      .upsert(
        {
          user_id: auth.user.id,
          token,
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,token" },
      );

    if (error) {
      console.error("[push/register] error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[push/register] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/push/register
 * Push通知トークンの解除
 */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { token } = body as { token: string };

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    await supabaseAdmin
      .from("push_notification_tokens")
      .delete()
      .eq("user_id", auth.user.id)
      .eq("token", token);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[push/unregister] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
