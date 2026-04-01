// app/my-page/notifications/page.tsx
import "server-only";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import NotificationList from "./NotificationList";
import { getNotificationStyle } from "./notificationStyles";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
        return (
            <main className="mx-auto max-w-2xl px-4 py-16">
                <h1 className="text-2xl font-extrabold">通知</h1>
                <p className="mt-3 text-sm text-zinc-600">ログインしてください。</p>
                <Link className="mt-6 inline-block underline" href="/login">ログイン</Link>
            </main>
        );
    }

    const { data: rows } = await supabase
        .from("notifications")
        .select("id,type,title,body,link,created_at,read_at,data")
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: false })
        .limit(50);

    const items = (rows ?? []).map((n: any) => ({
        ...n,
        style: getNotificationStyle(n.type),
    }));

    return (
        <main className="mx-auto max-w-2xl px-4 py-16">
            <h1 className="text-2xl font-extrabold">通知</h1>
            <NotificationList items={items} />
            <Link className="mt-10 inline-block text-sm text-slate-500 hover:text-slate-700 transition-colors" href="/my-page">
                ← マイページへ
            </Link>
        </main>
    );
}
