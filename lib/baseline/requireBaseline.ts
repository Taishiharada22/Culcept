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
 *
 * baseline_completed_at が null でも star_maps が存在する場合は
 * Stargazer オンボーディング完了済み = baseline も完了済み と判定する。
 */
export async function requireBaseline(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const [{ data: profile }, { data: starMapRow }] = await Promise.all([
    supabase
      .from("profiles")
      .select("baseline_completed_at")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("stargazer_star_maps")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  // baseline_completed_at が設定済み OR star_maps が存在すれば通過
  if (profile?.baseline_completed_at || starMapRow) {
    return;
  }

  redirect("/baseline");
}
