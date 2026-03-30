// POST /api/talk/threads/[threadId]/typing — タイピング状態を通知
// GET  /api/talk/threads/[threadId]/typing — 相手のタイピング状態を取得
//
// メモリ内ストレージ（揮発性）- 3秒で自動期限切れ
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// インメモリストア（サーバーレスでは限界があるが、短命データなので問題ない）
const typingState = new Map<string, { userId: string; expiresAt: number }>();

// 期限切れエントリをクリーンアップ
function cleanup() {
  const now = Date.now();
  for (const [key, val] of typingState) {
    if (val.expiresAt < now) typingState.delete(key);
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  try {
    const { threadId } = await params;
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    cleanup();
    typingState.set(`${threadId}:${user.id}`, {
      userId: user.id,
      expiresAt: Date.now() + 3000, // 3秒後に期限切れ
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  try {
    const { threadId } = await params;
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    cleanup();
    const now = Date.now();
    const typingUsers: string[] = [];
    for (const [key, val] of typingState) {
      if (key.startsWith(`${threadId}:`) && val.userId !== user.id && val.expiresAt > now) {
        typingUsers.push(val.userId);
      }
    }

    return NextResponse.json({ ok: true, typing: typingUsers.length > 0 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
