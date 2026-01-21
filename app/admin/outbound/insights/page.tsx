// app/admin/outbound/insights/page.tsx
import "server-only";

import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export const dynamic = "force-dynamic";

type InsightRow = {
    drop_id: string;
    created_at: string;
    title: string | null;
    brand: string | null;
    size: string | null;
    condition: string | null;
    price: number | null;
    cover_image_url: string | null;
    purchase_url: string | null;
    link_url: string | null;

    clicks_total: number;
    clicks_buy: number;
    clicks_link: number;
    buy_click_rate: number;
    link_click_rate: number;
    last_click_at: string | null;

    has_buy_link: boolean;
    has_link: boolean;

    flag_low_buy_rate: boolean;
    flag_missing_buy_link: boolean;
    flag_high_interest: boolean;
};

type UrlRow = {
    drop_id: string;
    kind: "buy" | "link";
    url: string;
    clicks: number;
    last_click_at: string | null;
};

type SP = Record<string, string | string[] | undefined>;

function spStr(v: unknown) {
    return String(Array.isArray(v) ? v[0] : v ?? "").trim();
}

function viewNames(days: number) {
    if (days === 7) return { insights: "v_outbound_insights_7d", urls: "v_outbound_clicks_by_url_7d" };
    if (days === 90) return { insights: "v_outbound_insights_90d", urls: "v_outbound_clicks_by_url_90d" };
    return { insights: "v_outbound_insights_30d", urls: "v_outbound_clicks_by_url_30d" };
}

function fmt(n: number) {
    return Number(n ?? 0).toLocaleString();
}
function pct(x: number) {
    const v = Number.isFinite(x) ? x : 0;
    return `${Math.round(v * 100)}%`;
}

function rec(r: InsightRow) {
    if (!r.has_buy_link && r.clicks_total >= 10) return "Buyリンク追加（purchase_url）で取りこぼし回収";
    if (r.has_buy_link && r.clicks_total >= 20 && r.buy_click_rate < 0.10)
        return "Buy率低：Buyボタンを上へ/価格・状態の明記/画像1枚目を強化/説明を短く強く";
    if (r.has_buy_link && r.clicks_total >= 20 && r.clicks_link > r.clicks_buy * 3)
        return "Link偏重：Buy CTAを強化（Buyを目立たせる・Linkは下へ）";
    if (r.has_buy_link && r.clicks_total >= 10 && r.buy_click_rate >= 0.35)
        return "勝ちパターン：同系統タグ/ブランド/構図で追加して伸ばす";
    if (r.clicks_total === 0) return "まだ露出不足：タグ最適化/タイトル改善/画像増";
    return "微調整：タグ/タイトル/画像順/価格帯をA/B気味に詰める";
}

export default async function AdminOutboundInsightsPage({
    searchParams,
}: {
    // ✅ build落ち対策：Promiseで受ける
    searchParams?: Promise<SP>;
}) {
    await requireAdmin("/admin/outbound/insights");

    const sp = (await searchParams) ?? {};
    const daysRaw = spStr(sp.days) || "30";
    const days = daysRaw === "7" ? 7 : daysRaw === "90" ? 90 : 30;
    const v = viewNames(days);

    const { data: rowsRaw, error: e1 } = await supabaseAdmin
        .from(v.insights)
        .select(
            "drop_id,created_at,title,brand,size,condition,price,cover_image_url,purchase_url,link_url,clicks_total,clicks_buy,clicks_link,buy_click_rate,link_click_rate,last_click_at,has_buy_link,has_link,flag_low_buy_rate,flag_missing_buy_link,flag_high_interest"
        )
        .order("clicks_total", { ascending: false })
        .limit(500);

    if (e1) {
        return (
            <div className="grid gap-3">
                <h1 className="text-2xl font-extrabold">Outbound Insights</h1>
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{e1.message}</p>
            </div>
        );
    }

    const rows = (rowsRaw ?? []) as unknown as InsightRow[];

    const top = rows.filter((r) => r.clicks_total > 0).slice(0, 30);
    const missingBuy = rows.filter((r) => r.flag_missing_buy_link).slice(0, 50);
    const lowBuy = rows.filter((r) => r.flag_low_buy_rate).slice(0, 50);

    const { data: urlRaw } = await supabaseAdmin
        .from(v.urls)
        .select("drop_id,kind,url,clicks,last_click_at")
        .order("clicks", { ascending: false })
        .limit(80);

    const urls = (urlRaw ?? []) as unknown as UrlRow[];

    return (
        <div className="grid gap-6">
            <div className="flex items-center justify-between gap-3">
                <div className="grid gap-1">
                    <h1 className="text-2xl font-extrabold tracking-tight">Outbound Insights (last {days}d)</h1>
                    <p className="text-xs font-semibold text-zinc-600">
                        ※ これは「購入完了率」ではなく <span className="font-black">buyリンクのクリック率</span>（導線の強さ）です
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Link
                        href={`/admin/outbound/insights?days=7`}
                        className={`rounded-md border px-3 py-2 text-xs font-black no-underline ${days === 7
                                ? "border-zinc-900 bg-zinc-900 text-white"
                                : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                            }`}
                    >
                        7d
                    </Link>
                    <Link
                        href={`/admin/outbound/insights?days=30`}
                        className={`rounded-md border px-3 py-2 text-xs font-black no-underline ${days === 30
                                ? "border-zinc-900 bg-zinc-900 text-white"
                                : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                            }`}
                    >
                        30d
                    </Link>
                    <Link
                        href={`/admin/outbound/insights?days=90`}
                        className={`rounded-md border px-3 py-2 text-xs font-black no-underline ${days === 90
                                ? "border-zinc-900 bg-zinc-900 text-white"
                                : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                            }`}
                    >
                        90d
                    </Link>

                    <a
                        href={`/api/admin/outbound/insights/export?days=${days}`}
                        className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-800 no-underline hover:bg-zinc-50"
                    >
                        Export CSV
                    </a>

                    <Link
                        href={`/admin/outbound?days=${days}`}
                        className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-800 no-underline hover:bg-zinc-50"
                    >
                        ← Outbound
                    </Link>
                    <Link
                        href="/drops"
                        className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-800 no-underline hover:bg-zinc-50"
                    >
                        ← Drops
                    </Link>
                </div>
            </div>

            {/* 1) Top */}
            <section className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black tracking-tight">Top drops (by clicks)</h2>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-zinc-200 text-left text-xs font-black text-zinc-600">
                                <th className="py-2 pr-3">Drop</th>
                                <th className="py-2 pr-3">Clicks</th>
                                <th className="py-2 pr-3">Buy</th>
                                <th className="py-2 pr-3">Link</th>
                                <th className="py-2 pr-3">Buy rate</th>
                                <th className="py-2 pr-3">Suggestion</th>
                            </tr>
                        </thead>
                        <tbody>
                            {top.length === 0 ? (
                                <tr>
                                    <td className="py-3 text-zinc-500" colSpan={6}>
                                        No data yet
                                    </td>
                                </tr>
                            ) : (
                                top.map((r) => (
                                    <tr key={r.drop_id} className="border-b border-zinc-100">
                                        <td className="py-3 pr-3">
                                            <div className="flex items-center gap-3">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                {r.cover_image_url ? (
                                                    <img
                                                        src={r.cover_image_url}
                                                        alt="cover"
                                                        className="h-10 w-10 rounded-md border border-zinc-200 object-cover"
                                                    />
                                                ) : (
                                                    <div className="h-10 w-10 rounded-md border border-zinc-200 bg-zinc-50" />
                                                )}

                                                <div className="grid">
                                                    <Link
                                                        href={`/drops/${r.drop_id}`}
                                                        className="font-extrabold text-zinc-900 no-underline hover:underline"
                                                    >
                                                        {r.title ?? r.drop_id.slice(0, 8)}
                                                    </Link>
                                                    <div className="text-xs font-semibold text-zinc-500">
                                                        {[r.brand, r.size, r.condition].filter(Boolean).join(" · ")}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-3 pr-3 font-extrabold">{fmt(r.clicks_total)}</td>
                                        <td className="py-3 pr-3">{fmt(r.clicks_buy)}</td>
                                        <td className="py-3 pr-3">{fmt(r.clicks_link)}</td>
                                        <td className="py-3 pr-3">
                                            <span className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-xs font-black text-zinc-800">
                                                {pct(r.buy_click_rate)}
                                            </span>
                                        </td>
                                        <td className="py-3 pr-3 text-xs font-semibold text-zinc-700">{rec(r)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* 2) Missing buy link */}
            <section className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black tracking-tight">Leaks (clicks but missing Buy link)</h2>
                <p className="text-xs font-semibold text-zinc-600">
                    クリックが付いてるのに purchase_url が無い = 取りこぼしの可能性が高い
                </p>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-zinc-200 text-left text-xs font-black text-zinc-600">
                                <th className="py-2 pr-3">Drop</th>
                                <th className="py-2 pr-3">Clicks</th>
                                <th className="py-2 pr-3">Edit</th>
                            </tr>
                        </thead>
                        <tbody>
                            {missingBuy.length === 0 ? (
                                <tr>
                                    <td className="py-3 text-zinc-500" colSpan={3}>
                                        None 🎉
                                    </td>
                                </tr>
                            ) : (
                                missingBuy.map((r) => (
                                    <tr key={r.drop_id} className="border-b border-zinc-100">
                                        <td className="py-3 pr-3">
                                            <Link
                                                href={`/drops/${r.drop_id}`}
                                                className="font-extrabold text-zinc-900 no-underline hover:underline"
                                            >
                                                {r.title ?? r.drop_id.slice(0, 8)}
                                            </Link>
                                            <div className="text-xs font-semibold text-zinc-500">{r.drop_id}</div>
                                        </td>
                                        <td className="py-3 pr-3 font-extrabold">{fmt(r.clicks_total)}</td>
                                        <td className="py-3 pr-3">
                                            <Link
                                                href={`/drops/${r.drop_id}/edit`}
                                                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-800 no-underline hover:bg-zinc-50"
                                            >
                                                Edit
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* 3) Low buy rate */}
            <section className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black tracking-tight">Low Buy-rate (needs CTA/offer/visual fix)</h2>
                <p className="text-xs font-semibold text-zinc-600">クリックは取れてるのにBuyに流れない = “見せ方/導線” が弱い</p>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-zinc-200 text-left text-xs font-black text-zinc-600">
                                <th className="py-2 pr-3">Drop</th>
                                <th className="py-2 pr-3">Clicks</th>
                                <th className="py-2 pr-3">Buy rate</th>
                                <th className="py-2 pr-3">Suggestion</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lowBuy.length === 0 ? (
                                <tr>
                                    <td className="py-3 text-zinc-500" colSpan={4}>
                                        None 🎉
                                    </td>
                                </tr>
                            ) : (
                                lowBuy.map((r) => (
                                    <tr key={r.drop_id} className="border-b border-zinc-100">
                                        <td className="py-3 pr-3">
                                            <Link
                                                href={`/drops/${r.drop_id}`}
                                                className="font-extrabold text-zinc-900 no-underline hover:underline"
                                            >
                                                {r.title ?? r.drop_id.slice(0, 8)}
                                            </Link>
                                            <div className="text-xs font-semibold text-zinc-500">
                                                {fmt(r.clicks_buy)} buy / {fmt(r.clicks_total)} total
                                            </div>
                                        </td>
                                        <td className="py-3 pr-3 font-extrabold">{fmt(r.clicks_total)}</td>
                                        <td className="py-3 pr-3">
                                            <span className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-xs font-black text-zinc-800">
                                                {pct(r.buy_click_rate)}
                                            </span>
                                        </td>
                                        <td className="py-3 pr-3 text-xs font-semibold text-zinc-700">{rec(r)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* 4) URL Top */}
            <section className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black tracking-tight">Top URLs (by clicks)</h2>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-zinc-200 text-left text-xs font-black text-zinc-600">
                                <th className="py-2 pr-3">Kind</th>
                                <th className="py-2 pr-3">Clicks</th>
                                <th className="py-2 pr-3">Drop</th>
                                <th className="py-2 pr-3">URL</th>
                            </tr>
                        </thead>
                        <tbody>
                            {urls.length === 0 ? (
                                <tr>
                                    <td className="py-3 text-zinc-500" colSpan={4}>
                                        No url data
                                    </td>
                                </tr>
                            ) : (
                                urls.map((u, i) => (
                                    <tr key={`${u.drop_id}-${u.kind}-${i}`} className="border-b border-zinc-100">
                                        <td className="py-3 pr-3">
                                            <span
                                                className={[
                                                    "rounded-full px-2 py-1 text-xs font-black",
                                                    u.kind === "buy"
                                                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                        : "bg-zinc-50 text-zinc-700 border border-zinc-200",
                                                ].join(" ")}
                                            >
                                                {u.kind}
                                            </span>
                                        </td>
                                        <td className="py-3 pr-3 font-extrabold">{fmt(u.clicks)}</td>
                                        <td className="py-3 pr-3">
                                            <Link
                                                href={`/drops/${u.drop_id}`}
                                                className="font-extrabold text-zinc-900 no-underline hover:underline"
                                            >
                                                {u.drop_id.slice(0, 8)}
                                            </Link>
                                        </td>
                                        <td className="py-3 pr-3">
                                            <a
                                                href={u.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-xs font-semibold text-zinc-700 hover:text-zinc-950"
                                            >
                                                {u.url.length > 120 ? u.url.slice(0, 120) + "…" : u.url}
                                            </a>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
