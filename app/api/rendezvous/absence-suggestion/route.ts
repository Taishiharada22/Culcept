import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { shouldSuggestAbsence } from "@/lib/rendezvous/absenceDesign";

// ---------------------------------------------------------------------------
// GET — 不在提案の判定（読み取り専用、DB書き込みなし）
// RendezvousHome が消費。実際の受理は /api/rendezvous/absence-accept に委譲。
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = auth.user.id;

    // 最新のアクティブ候補を1件取得（最も最近のチャット相手）
    const { data: candidate } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .eq("state", "chat_opened")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!candidate) {
      return NextResponse.json({ suggestion: null });
    }

    // そのチャットの直近メッセージを取得
    const { data: chatRow } = await supabaseAdmin
      .from("rendezvous_chats")
      .select("thread_id")
      .eq("candidate_id", candidate.id)
      .maybeSingle();

    if (!chatRow?.thread_id) {
      return NextResponse.json({ suggestion: null });
    }

    const { data: messages } = await supabaseAdmin
      .from("rendezvous_messages")
      .select("created_at, sender_id")
      .eq("thread_id", chatRow.thread_id)
      .order("created_at", { ascending: false })
      .limit(50);

    // 最後の不在記録を取得（クールダウン判定用）
    const { data: lastAbsence } = await supabaseAdmin
      .from("rendezvous_absences")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const suggestion = shouldSuggestAbsence(
      (messages ?? []).map((m) => ({
        created_at: m.created_at as string,
        sender_id: m.sender_id as string,
      })),
      userId,
      (lastAbsence?.created_at as string) ?? null,
    );

    return NextResponse.json({ suggestion });
  } catch (err) {
    console.error("[absence-suggestion] error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
