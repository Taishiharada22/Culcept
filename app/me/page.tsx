// app/me/page.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MePage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;

    if (!user) {
        return (
            <main className="mx-auto max-w-4xl px-4 py-10">
                <div className="rounded-2xl border bg-white p-6 shadow-sm">
                    <h1 className="text-2xl font-extrabold tracking-tight">My Page</h1>
                    <p className="mt-3 text-sm font-semibold text-zinc-600">ログインすると、自分のショップを作って編集できます。</p>
                    <Link href="/login?next=/me" className="mt-6 inline-flex rounded-md bg-zinc-900 px-4 py-2 text-sm font-black text-white">
                        Login
                    </Link>
                </div>
            </main>
        );
    }

    const { data: shop } = await supabase
        .from("shops")
        .select("slug,is_active")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    const slug = String(shop?.slug ?? "master");

    return (
        <main className="mx-auto max-w-4xl px-4 py-10">
            <div className="grid gap-2">
                <h1 className="text-2xl font-extrabold tracking-tight">My Page</h1>
                <p className="text-sm font-semibold text-zinc-600">ここから “店っぽさ” を整える。</p>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
                <Link href="/shops/me" className="rounded-2xl border bg-white p-6 shadow-sm no-underline hover:shadow-md">
                    <div className="text-xs font-black text-zinc-500">Brand</div>
                    <div className="mt-2 text-xl font-extrabold text-zinc-900">ショップを編集</div>
                    <div className="mt-2 text-sm font-semibold text-zinc-600">アバター / ヘッドライン / Bio / Style tags</div>
                    <div className="mt-4 text-xs font-semibold text-zinc-400">Open →</div>
                </Link>

                <Link href={`/shops/${slug}`} className="rounded-2xl border bg-white p-6 shadow-sm no-underline hover:shadow-md">
                    <div className="text-xs font-black text-zinc-500">Public</div>
                    <div className="mt-2 text-xl font-extrabold text-zinc-900">公開ページを見る</div>
                    <div className="mt-2 text-sm font-semibold text-zinc-600">
                        状態: <span className="font-black">{shop?.is_active ? "Public" : "Private"}</span>
                    </div>
                    <div className="mt-4 text-xs font-semibold text-zinc-400">Open →</div>
                </Link>

                <Link href="/drops/new" className="rounded-2xl border bg-white p-6 shadow-sm no-underline hover:shadow-md">
                    <div className="text-xs font-black text-zinc-500">Sell</div>
                    <div className="mt-2 text-xl font-extrabold text-zinc-900">新しいDrop</div>
                    <div className="mt-2 text-sm font-semibold text-zinc-600">出品して “誰の店か” を見せる。</div>
                    <div className="mt-4 text-xs font-semibold text-zinc-400">Open →</div>
                </Link>

                <Link href="/my-drops" className="rounded-2xl border bg-white p-6 shadow-sm no-underline hover:shadow-md">
                    <div className="text-xs font-black text-zinc-500">List</div>
                    <div className="mt-2 text-xl font-extrabold text-zinc-900">自分のDrops</div>
                    <div className="mt-2 text-sm font-semibold text-zinc-600">自分の出品一覧。</div>
                    <div className="mt-4 text-xs font-semibold text-zinc-400">Open →</div>
                </Link>
            </div>
        </main>
    );
}
