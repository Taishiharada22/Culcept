import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import BaselineCollectionClient from "./BaselineCollectionClient";

/**
 * ④-A: ベースライン収集ページ（登録直後の必須ステップ）
 *
 * 条件:
 * - 未ログイン → /stargazer
 * - 匿名ユーザー → /stargazer（登録後にここに来る）
 * - baseline_completed_at が既にある → / (Home)
 * - それ以外 → ベースライン収集フォームを表示
 */
export default async function BaselinePage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/stargazer");
  }

  // 匿名ユーザーはまだ登録が必要
  if (user.is_anonymous) {
    redirect("/stargazer");
  }

  // 既にベースライン完了済み → Home
  const { data: profile } = await supabase
    .from("profiles")
    .select("baseline_completed_at, display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.baseline_completed_at) {
    redirect("/");
  }

  return <BaselineCollectionClient userName={profile?.display_name ?? null} />;
}
