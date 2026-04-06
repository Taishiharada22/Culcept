import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * サーバーコンポーネント用 — 登録済みユーザーのベースライン完了チェック。
 * 未完了なら /baseline にリダイレクトする。
 *
 * 使い方:
 *   await requireBaseline(supabase, user.id);
 *
 * 匿名ユーザーはベースライン不要なのでスキップする。
 * is_anonymous チェックは呼び出し元で済ませること。
 */
export async function requireBaseline(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("baseline_completed_at")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.baseline_completed_at) {
    redirect("/baseline");
  }
}
