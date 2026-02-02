// app/my/notifications/page.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
        return (
            <main className="mx-auto max-w-2xl px-4 py-16">
                <p className="text-sm text-zinc-600">ログインしてください。</p>
                <Link className="mt-6 inline-block underline" href="/login">
                    Login
                </Link>
            </main>
        );
    }

    const { data: rows, error } = await supabase
        .from("notifications")
        .select("id,type,title,body,link,created_at,read_at")
        .order("created_at", { ascending: false })
        .limit(100);

    if (error) {
        return (
            <main className="mx-auto max-w-2xl px-4 py-16">
                <h1 className="text-2xl font-extrabold">通知</h1>
                <p className="mt-3 text-sm text-red-600">Error: {error.message}</p>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-2xl px-4 py-16">
            <h1 className="text-2xl font-extrabold">通知</h1>

            <div className="mt-6 space-y-3">
                {(rows ?? []).map((n) => (
                    <div key={n.id} className={`rounded-lg border p-4 ${n.read_at ? "opacity-70" : ""}`}>
                        <div className="text-xs text-zinc-500">{n.created_at}</div>
                        <div className="mt-1 text-sm font-bold">{n.title}</div>
                        {n.body && <div className="mt-1 text-sm text-zinc-700">{n.body}</div>}
                        {n.link && (
                            <Link className="mt-2 inline-block text-sm underline" href={n.link}>
                                開く
                            </Link>
                        )}
                    </div>
                ))}
                {(rows ?? []).length === 0 && <p className="text-sm text-zinc-600">まだありません。</p>}
            </div>

            <Link className="mt-8 inline-block underline" href="/my">
                My Pageへ
            </Link>
        </main>
    );
}
