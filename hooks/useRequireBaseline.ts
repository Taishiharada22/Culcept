"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * クライアントコンポーネント用 — ベースライン未完了ならリダイレクト。
 * 登録済み（非匿名）ユーザーが baseline_completed_at 未設定なら /baseline に飛ばす。
 *
 * @returns "loading" | "ok" | "redirecting"
 */
export function useRequireBaseline(): "loading" | "ok" | "redirecting" {
  const [status, setStatus] = useState<"loading" | "ok" | "redirecting">("loading");
  const router = useRouter();

  useEffect(() => {
    const check = async () => {
      const sb = supabaseBrowser();
      const { data: { user } } = await sb.auth.getUser();

      // 未ログインまたは匿名 → ベースライン不要
      if (!user || user.is_anonymous) {
        setStatus("ok");
        return;
      }

      const { data: profile } = await sb
        .from("profiles")
        .select("baseline_completed_at")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile?.baseline_completed_at) {
        setStatus("redirecting");
        router.replace("/baseline");
        return;
      }

      setStatus("ok");
    };
    check();
  }, [router]);

  return status;
}
