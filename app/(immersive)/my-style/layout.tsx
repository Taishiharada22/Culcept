import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { isBetaTesterEmail } from "@/lib/auth/betaTesters";

/**
 * My Style RC Gate
 *
 * 限定公開フェーズ: ベータテスターのみアクセス可能。
 * 未認証ユーザーまたは非ベータテスターは / にリダイレクト。
 *
 * 解除条件: 1週間の計測後 CEO レビューで判定。
 * 解除方法: このファイルから gate ロジックを削除し children のみ返す。
 */
export default async function MyStyleLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    if (process.env.NEXT_PUBLIC_FF_MYSTYLE_RC !== "beta") {
        // フラグ未設定 or "open" → 全員アクセス可
        return <>{children}</>;
    }

    const supabase = await supabaseServer();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email || !isBetaTesterEmail(user.email)) {
        redirect("/");
    }

    return <>{children}</>;
}
