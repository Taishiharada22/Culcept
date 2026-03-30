// app/shops/me/insights/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

function fmt(n: any) {
    const num = typeof n === "number" ? n : Number(String(n ?? ""));
    if (!Number.isFinite(num)) return "0";
    return Math.round(num).toLocaleString("ja-JP");
}

type Row = {
    id: string;
    title: string | null;
    brand: string | null;
    sale_mode?: string | null;
    cover_image_url: string | null;
    display_price?: number | null;
    price?: number | null;
    hot_score?: number | null;

    clicks_total_30d?: number | null;
    clicks_buy_30d?: number | null;
    clicks_link_30d?: number | null;

    saves_30d?: number | null;
    bids_30d?: number | null;
    highest_bid_30d?: number | null;
};

export default async function MyShopInsightsPage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) redirect("/login?next=/shops/me/insights");
    const userId = auth.user.id;

    const { data: shop, error: shopErr } = await supabase
        .from("shops")
        .select("slug, shop_name_ja, shop_name_en")
        .eq("owner_id", userId)
        .maybeSingle();

    if (shopErr) {
        return (
            <div className="mx-auto max-w-6xl p-6">
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-extrabold text-red-700">{shopErr.message}</div>
            </div>
        );
    }

    if (!shop?.slug) {
        return (
            <div className="mx-auto max-w-6xl p-6 grid gap-3">
                <div className="text-xl font-black">Insights</div>
                <div className="text-sm font-semibold text-zinc-600">先にShopを作成して。</div>
                <Link href="/shops/me" className="rounded-xl border px-3 py-2 text-sm font-extrabold hover:bg-zinc-50 w-fit">
                    Shop settings
                </Link>
            </div>
        );
    }

    const slug = String(shop.slug);

    const { data: drops, error: dErr } = await supabase
        .from("v_drops_ranked_30d_v2")
        .select("id,title,brand,sale_mode,cover_image_url,display_price,price,hot_score")
        .eq("shop_slug", slug)
        .order("hot_score", { ascending: false })
        .limit(200);

    if (dErr) {
        return (
            <div className="mx-auto max-w-6xl p-6">
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-extrabold text-red-700">{dErr.message}</div>
            </div>
        );
    }

    const ids = (drops ?? []).map((x: any) => String(x.id));

    const [clickRes, saveRes, bidRes] = await Promise.all([
        ids.length
            ? supabase
                .from("v_drops_public_with_clicks_30d")
                .select("id,clicks_total_30d,clicks_buy_30d,clicks_link_30d")
                .in("id", ids)
            : Promise.resolve({ data: [], error: null } as any),
        ids.length ? supabase.from("v_drop_saves_30d").select("drop_id,saves_30d").in("drop_id", ids) : Promise.resolve({ data: [], error: null } as any),
        ids.length ? supabase.from("v_drop_bids_30d").select("drop_id,bids_30d,highest_bid_30d").in("drop_id", ids) : Promise.resolve({ data: [], error: null } as any),
    ]);

    const clicks = new Map<string, any>((clickRes.data ?? []).map((r: any) => [String(r.id), r]));
    const saves = new Map<string, any>((saveRes.data ?? []).map((r: any) => [String(r.drop_id), r]));
    const bids = new Map<string, any>((bidRes.data ?? []).map((r: any) => [String(r.drop_id), r]));

    const rows: Row[] = (drops ?? []).map((d: any) => {
        const id = String(d.id);
        const c = clicks.get(id) ?? {};
        const s = saves.get(id) ?? {};
        const b = bids.get(id) ?? {};
        return {
            id,
            title: d.title ?? null,
            brand: d.brand ?? null,
            sale_mode: d.sale_mode ?? null,
            cover_image_url: d.cover_image_url ?? null,
            display_price: d.display_price ?? null,
            price: d.price ?? null,
            hot_score: d.hot_score ?? null,
            clicks_total_30d: Number(c.clicks_total_30d ?? 0) || 0,
            clicks_buy_30d: Number(c.clicks_buy_30d ?? 0) || 0,
            clicks_link_30d: Number(c.clicks_link_30d ?? 0) || 0,
            saves_30d: Number(s.saves_30d ?? 0) || 0,
            bids_30d: Number(b.bids_30d ?? 0) || 0,
            highest_bid_30d: Number(b.highest_bid_30d ?? 0) || 0,
        };
    });

    const totalClicks = rows.reduce((a, r) => a + (r.clicks_total_30d ?? 0), 0);
    const totalSaves = rows.reduce((a, r) => a + (r.saves_30d ?? 0), 0);
    const totalBids = rows.reduce((a, r) => a + (r.bids_30d ?? 0), 0);

    // simple suggestions
    const needs = rows
        .map((r) => {
            const tips: string[] = [];
            if (!r.cover_image_url) tips.push("画像なし → まず画像追加");
            if ((r.clicks_total_30d ?? 0) >= 20 && (r.saves_30d ?? 0) === 0) tips.push("クリック多いのに保存0 → サムネ/タイトル/価格/タグ見直し");
            if ((r.saves_30d ?? 0) >= 5 && (r.clicks_buy_30d ?? 0) === 0) tips.push("保存多いのにBuy 0 → Buyリンク/説明/価格を点検");
            if (r.sale_mode === "auction" && (r.bids_30d ?? 0) === 0) tips.push("オークションで入札0 → floor/締切/写真/説明を調整");
            return { r, tips };
        })
        .filter((x) => x.tips.length > 0)
        .slice(0, 20);

    return (
        <div className="mx-auto max-w-6xl p-6 grid gap-6">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-xl font-black">Seller Insights</div>
                    <div className="text-xs font-semibold text-zinc-600">
                        shop: <span className="font-black">{slug}</span> / last 30 days
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/shops/me" className="rounded-xl border px-3 py-2 text-sm font-extrabold hover:bg-zinc-50">
                        Shop
                    </Link>
                    <Link href={`/shops/${slug}`} className="rounded-xl border px-3 py-2 text-sm font-extrabold hover:bg-zinc-50">
                        View shop
                    </Link>
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border bg-white p-4">
                    <div className="text-xs font-semibold text-zinc-600">Clicks（30d）</div>
                    <div className="text-2xl font-black">{fmt(totalClicks)}</div>
                </div>
                <div className="rounded-2xl border bg-white p-4">
                    <div className="text-xs font-semibold text-zinc-600">Saves（30d）</div>
                    <div className="text-2xl font-black">{fmt(totalSaves)}</div>
                </div>
                <div className="rounded-2xl border bg-white p-4">
                    <div className="text-xs font-semibold text-zinc-600">Bids（30d）</div>
                    <div className="text-2xl font-black">{fmt(totalBids)}</div>
                </div>
            </div>

            {needs.length > 0 ? (
                <div className="rounded-2xl border bg-white p-4 grid gap-3">
                    <div className="text-sm font-extrabold">Action items（上から優先）</div>
                    <ul className="grid gap-2">
                        {needs.map(({ r, tips }) => (
                            <li key={r.id} className="rounded-xl border border-zinc-200 bg-white p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <Link href={`/drops/${r.id}/edit`} className="text-sm font-black hover:underline">
                                        {r.title ?? String(r.id).slice(0, 8)}
                                    </Link>
                                    <Link href={`/drops/${r.id}`} className="rounded-xl border px-3 py-1 text-xs font-extrabold hover:bg-zinc-50">
                                        View
                                    </Link>
                                </div>
                                <div className="mt-2 text-xs font-semibold text-zinc-600">
                                    clicks:{fmt(r.clicks_total_30d)} / saves:{fmt(r.saves_30d)} / bids:{fmt(r.bids_30d)} / highest:{fmt(r.highest_bid_30d)}
                                </div>
                                <ul className="mt-2 grid gap-1">
                                    {tips.map((t, i) => (
                                        <li key={i} className="text-xs font-extrabold text-zinc-800">
                                            ・{t}
                                        </li>
                                    ))}
                                </ul>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : (
                <div className="rounded-2xl border bg-white p-4 text-sm font-semibold text-zinc-600">今のところ大きな改善指示はありません。</div>
            )}

            <div className="rounded-2xl border bg-white p-4">
                <div className="text-sm font-extrabold mb-3">Products（hot_score順）</div>
                <div className="grid gap-3">
                    {rows.map((r) => (
                        <div key={r.id} className="rounded-xl border border-zinc-200 bg-white p-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-sm font-black">{r.title ?? String(r.id).slice(0, 8)}</div>
                                <div className="text-xs font-semibold text-zinc-600">
                                    {r.brand ?? " "} / {r.sale_mode ?? "fixed"} / clicks:{fmt(r.clicks_total_30d)} / saves:{fmt(r.saves_30d)} / bids:{fmt(r.bids_30d)}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Link href={`/drops/${r.id}/edit`} className="rounded-xl border px-3 py-2 text-xs font-extrabold hover:bg-zinc-50">
                                    Edit
                                </Link>
                                <Link href={`/drops/${r.id}`} className="rounded-xl border px-3 py-2 text-xs font-extrabold hover:bg-zinc-50">
                                    View
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
