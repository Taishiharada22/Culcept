// app/admin/layout.tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/isAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await supabaseServer();

    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    // 未ログイン or 取得失敗 → いったん /start に飛ばす（好みで "/" でもOK）
    if (error || !user) {
        redirect("/start");
    }

    const email = user.email ?? null;

    if (!isAdminEmail(email)) {
        redirect("/");
    }

    return <>{children}</>;
}
