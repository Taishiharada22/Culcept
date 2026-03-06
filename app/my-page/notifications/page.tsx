// app/my-page/notifications/page.tsx
import "server-only";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
        return (
            <main className="mx-auto max-w-2xl px-4 py-16">
                <h1 className="text-2xl font-extrabold">Notifications</h1>
                <p className="mt-3 text-sm text-zinc-600">ログインしてください。</p>
                <Link className="mt-6 inline-block underline" href="/login">Login</Link>
            </main>
        );
    }

    const { data: items } = await supabase
        .from("notifications")
        .select("id,type,title,body,link,created_at,read_at")
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: false })
        .limit(50);

    // 既読化（ページ開いたら未読をまとめて既読にする）
    const unreadIds = (items ?? []).filter((n: any) => !n.read_at).map((n: any) => n.id);
    if (unreadIds.length) {
        await supabase
            .from("notifications")
            .update({ read_at: new Date().toISOString() })
            .in("id", unreadIds);
    }

    return (
        <main className="mx-auto max-w-2xl px-4 py-16">
            <h1 className="text-2xl font-extrabold">Notifications</h1>

            {!items?.length ? (
                <p className="mt-4 text-sm text-zinc-600">通知はまだありません。</p>
            ) : (
                <ul className="mt-6 space-y-3">
                    {items.map((n: any) => (
                        <li key={n.id} className="rounded-lg border border-zinc-200 p-4">
                            <div className="text-sm font-extrabold">
                                {n.read_at ? "✓ " : "● "}
                                {n.title}
                            </div>
                            {n.body ? <div className="mt-1 text-xs text-zinc-600">{n.body}</div> : null}
                            <div className="mt-2 text-xs text-zinc-500">{new Date(n.created_at).toLocaleString()}</div>
                            {n.link ? (
                                <Link className="mt-2 inline-block text-sm underline" href={n.link}>
                                    開く
                                </Link>
                            ) : null}
                        </li>
                    ))}
                </ul>
            )}

            <Link className="mt-10 inline-block underline" href="/my-page">
                My Pageへ
            </Link>
        </main>
    );
}
