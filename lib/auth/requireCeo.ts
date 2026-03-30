// lib/auth/requireCeo.ts
import "server-only";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { isCeoEmail } from "./isCeo";

/**
 * サーバーコンポーネントでCEOアクセスを強制する。
 * CEO以外は "/" にリダイレクト。未ログインは "/start" にリダイレクト。
 */
export async function requireCeo() {
  const supabase = await supabaseServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/start");
  }

  if (!isCeoEmail(user.email)) {
    redirect("/");
  }

  return user;
}
