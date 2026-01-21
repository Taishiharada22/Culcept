// app/saves/page.tsx
import "server-only";

import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SavedRow = {
    user_id: string;
    created_at: string;
    impression_id: string;
    id: string; // drop id
    title: string | null;
    brand: string | null;
    size: string | null;
    condition: string | null;
    cover_image_url: string | null;
    purchase_url: string | null;
    url: string | null;
    display_price: string | null;
    price: string | null;
    shop_slug: string | null;
    shop_name_ja: string | null;
    shop_name_en: string | null;
    shop_avatar_url: string | null;
    shop_headline: string | null;
};

function money(v: any) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return new Intl.NumberFormat("ja-JP").format(n);
}

export default async function SavesPage() {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) redirect("/login?next=/saves");

    const { data: rows, error } = await supabase
        .from("v_saved_drops_180d")
        .select(
            "user_id,created_at,impression_id,id,title,brand,size,condition,cover_image_url,purchase_url,url,display_price,price,shop_slug,shop_name_ja,shop_name_en,shop_avatar_url,shop_headline"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(60);

    if (error) {
        return (
            <main className="mx-auto max-w-5xl py-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-extrabold">Saved</h1>
                    <Link href="/start" className="text-xs font-black text-zinc-700 hover:text-zinc-950">← Start</Link>
                </div>
                <div className="rounded-2xl border bg-white p-5">
                    <div className="text-red-600 font-extrabold">Error</div>
                    <div className="mt-2 text-sm font-semibold text-zinc-700 break-words">{error.message}</div>
                    <div className="mt-3 text-sm font-semibold text-zinc-700">
                        view が無い場合は Supabase SQL Editor で <span className="font-black">v_saved_drops_180d</span> を作ってから再読み込み。
                    </div>
                </div>
            </main>
        );
    }

    const items = (rows ?? []) as unknown as SavedRow[];

    return (
        <main className="mx-auto max-w-5xl py-6 space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-extrabold">Saved</h1>
                    <p className="text-sm font-semibold text-zinc-600">♡保存したDrop（直近180日）</p>
                </div>
                <div className="flex gap-3 text-xs font-black">
                    <Link href="/start" className="text-zinc-700 hover:text-zinc-950">Start</Link>
                    <Link href="/drops" className="text-zinc-700 hover:text-zinc-950">Drops</Link>
                    <Link href="/shops/me" className="text-zinc-700 hover:text-zinc-950">My Shop</Link>
                </div>
            </div>

            {!items.length ? (
                <div className="rounded-2xl border bg-white p-5 text-sm font-semibold text-zinc-600">
                    まだ保存がありません。<Link href="/start" className="underline">Start</Link> からおすすめを見て保存してみて。
                </div>
            ) : (
                <ul className="grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
                    {items.map((x) => {
                        const price = money(x.display_price ?? x.price);
                        const shopName = x.shop_name_ja ?? x.shop_name_en ?? x.shop_slug ?? null;
                        const href = x.impression_id ? `/drops/${x.id}?imp=${encodeURIComponent(x.impression_id)}` : `/drops/${x.id}`;

                        return (
                            <li key={`${x.impression_id}:${x.id}`} className="overflow-hidden rounded-2xl border bg-white shadow-sm hover:shadow-md transition">
                                <Link href={href} className="block no-underline">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    {x.cover_image_url ? (
                                        <img src={x.cover_image_url} alt={x.title ?? ""} className="h-56 w-full object-cover" loading="lazy" />
                                    ) : (
                                        <div className="h-56 w-full bg-zinc-50" />
                                    )}

                                    <div className="p-4 grid gap-2">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="line-clamp-2 text-base font-black text-zinc-900">{x.title ?? "(no title)"}</div>
                                                <div className="text-xs font-semibold text-zinc-600">
                                                    {[x.brand, x.size, x.condition].filter(Boolean).join(" · ") || " "}
                                                </div>
                                            </div>
                                            {price ? <div className="shrink-0 text-sm font-black text-zinc-950">¥{price}</div> : null}
                                        </div>

                                        {shopName ? (
                                            <div className="text-xs font-semibold text-zinc-500">Shop: <span className="font-black text-zinc-700">{shopName}</span></div>
                                        ) : null}
                                    </div>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </main>
    );
}
