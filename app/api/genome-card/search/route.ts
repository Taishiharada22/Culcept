// GET /api/genome-card/search?id=ANRS-XXXX-XXXX — 公開IDでユーザー検索
// Genome Card 友だち追加専用。Rendezvous とは無関係。
// profiles の RLS は自分の行のみ SELECT 可なので、
// 他ユーザー検索には service role client を使用する。
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(req: NextRequest) {
  try {
    // 認証チェック（ユーザー権限）
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const publicId = searchParams.get("id")?.trim().toUpperCase();
    if (!publicId) {
      return NextResponse.json({ error: "id parameter required" }, { status: 400 });
    }

    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // Service role で他ユーザーの profiles を検索（RLS バイパス）
    const { data: profile } = await admin
      .from("profiles")
      .select("id, public_id")
      .eq("public_id", publicId)
      .neq("id", user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ ok: true, found: false });
    }

    // 表示名: auth.users metadata から取得
    let displayName: string | null = null;
    let avatarUrl: string | null = null;
    const { data: authUser } = await admin.auth.admin.getUserById(profile.id);
    displayName = (authUser?.user?.user_metadata?.display_name as string) ?? null;
    avatarUrl = (authUser?.user?.user_metadata?.avatar_url as string) ?? null;

    // 既存コネクション確認（自分が関与するレコードなので user 権限で OK）
    const { data: existing } = await supabase
      .from("genome_connections")
      .select("id, status")
      .or(`and(requester_id.eq.${user.id},target_id.eq.${profile.id}),and(requester_id.eq.${profile.id},target_id.eq.${user.id})`)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      found: true,
      user: {
        id: profile.id,
        displayName: displayName ?? profile.public_id,
        avatarUrl,
        publicId: profile.public_id,
      },
      connectionStatus: existing?.status ?? null,
    });
  } catch (error) {
    console.error("[genome-card/search] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
