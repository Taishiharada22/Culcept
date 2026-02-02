// app/admin/outbound/page.tsx
import "server-only";

import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export const dynamic = "force-dynamic";

type ByDrop = {
    drop_id: string;
    clicks_total: number;
    clicks_buy: number;
    clicks_link: number;
    last_click_at: string | null;
};

type Daily = {
    day: string;
    clicks_total: number;
    clicks_buy: number;
    clicks_link: number;
};

type DropMini = {
    id: string;
    title: string | null;
    cover_image_url: string | null;
};

type ClickRow = {
    created_at: string;
    kind: "buy" | "link";
    url: string;
    drop_id: string;
    drops?: { title?: string | null } | null;
};

type SP = Record<string, string | string[] | undefined>;

function spStr(v: unknown) {
    return String(Array.isArray(v) ? v[0] : v ?? "").trim();
}

function fmt(n: number) {
    return Number(n ?? 0).toLocaleString();
}
function pct(a: number, b: number) {
    if (!b) return "0%";
    return `${Math.round((a / b) * 100)}%`;
}

function viewNameByDays(days: number) {
    if (days === 7) return { byDrop: "v_outbound_clicks_by_drop_7d", daily: "v_outbound_clicks_daily_7d" };
    if (days === 90) return { byDrop: "v_outbound_clicks_by_drop_90d", daily: "v_outbound_clicks_daily_90d" };
    return { byDrop: "v_outbound_clicks_by_drop_30d", daily: "v_outbound_clicks_daily_30d" };
}

export default async function AdminOutboundPage({
    searchParams,
}: {
    // ✅ Next.js 側の PageProps と整合させる（Promise で受ける）
    searchParams?: Promise<SP>;
}) {
    await requireAdmin("/admin/outbound");

    const sp = (await searchParams) ?? {};
    const daysRaw = spStr(sp.days) || "30";
    const days = daysRaw === "7" ? 7 : daysRaw === "90" ? 90 : 30;
    const views = viewNameByDays(days);

    const { data: byDropRaw, error: e1 } = await supabaseAdmin
        .from(views.byDrop)
        .select("drop_id,clicks_total,clicks_buy,clicks_link,last_click_at")
        .order("clicks_total", { ascending: false })
        .limit(200);

    if (e1) {
        return (
            <div className="grid gap-3">
                <h1 className="text-2xl font-extrabold">Outbound</h1>
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                    {e1.message}
                </p>
            </div>
        );
    }

    const byDrop = (byDropRaw ?? []) as unknown as ByDrop[];
    const dropIds = byDrop.map((r) => r.drop_id).filter(Boolean);

    let dropMap = new Map<string, DropMini>();
    if (dropIds.length > 0) {
        const { data: drops, error: eDrops } = await supabaseAdmin
            .from("drops")
            .select("id,title,cover_image_url")
            .in("id", dropIds);

        if (!eDrops) {
            for (const d of (drops ?? []) as any[]) {
                dropMap.set(String(d.id), {
                    id: String(d.id),
                    title: d.title ?? null,
                    cover_image_url: d.cover_image_url ?? null,
                });
            }
        } else {
            console.warn("drops mini fetch error:", eDrops.message);
        }
    }

    const { data: dailyRaw, error: e2 } = await supabaseAdmin
        .from(views.daily)
        .select("day,clicks_total,clicks_buy,clicks_link")
        .order("day", { ascending: false });

    if (e2) console.warn("daily view error:", e2.message);
    const daily = (dailyRaw ?? []) as unknown as Daily[];

    const { data: recentRaw, error: e3 } = await supabaseAdmin
        .from("outbound_clicks")
        .select("created_at,kind,url,drop_id,drops(title)")
        .order("created_at", { ascending: false })
        .limit(50);

    if (e3) console.warn("recent clicks fetch error:", e3.message);
    const recent = (recentRaw ?? []) as unknown as ClickRow[];

    const totalClicks = byDrop.reduce((s, r) => s + Number(r.clicks_total ?? 0), 0);
    const totalBuy = byDrop.reduce((s, r) => s + Number(r.clicks_buy ?? 0), 0);
    const totalLink = byDrop.reduce((s, r) => s + Number(r.clicks_link ?? 0), 0);

    return (
        <div className="grid gap-6">
            <div className="flex items-center justify-between gap-3">
                <h1 className="text-2xl font-extrabold tracking-tight">Outbound (last {days}d)</h1>

                <div className="flex items-center gap-2">
                    <Link
                        href={`/admin/outbound?days=7`}
                        className={`rounded-md border px-3 py-2 text-xs font-black no-underline ${days === 7
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                            }`}
                    >
                        7d
                    </Link>
                    <Link
                        href={`/admin/outbound?days=30`}
                        className={`rounded-md border px-3 py-2 text-xs font-black no-underline ${days === 30
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                            }`}
                    >
                        30d
                    </Link>
                    <Link
                        href={`/admin/outbound?days=90`}
                        className={`rounded-md border px-3 py-2 text-xs font-black no-underline ${days === 90
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                            }`}
                    >
                        90d
                    </Link>

                    <a
                        href={`/api/admin/outbound/export?days=${days}`}
                        className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-800 no-underline hover:bg-zinc-50"
                    >
                        Export CSV
                    </a>

                    <Link
                        href={`/admin/outbound/insights?days=${days}`}
                        className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-black text-white no-underline hover:bg-zinc-800"
                    >
                        Insights →
                    </Link>

                    <Link
                        href="/drops"
                        className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-800 no-underline hover:bg-zinc-50"
                    >
                        ← Products
                    </Link>
                </div>
            </div>

            <section className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black tracking-tight">Summary</h2>
                <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-zinc-200 p-4">
                        <div className="text-xs font-semibold text-zinc-500">Clicks total</div>
                        <div className="mt-1 text-2xl font-black">{fmt(totalClicks)}</div>
                    </div>
                    <div className="rounded-lg border border-zinc-200 p-4">
                        <div className="text-xs font-semibold text-zinc-500">Buy clicks</div>
                        <div className="mt-1 text-2xl font-black">{fmt(totalBuy)}</div>
                        <div className="mt-1 text-xs font-semibold text-zinc-500">Share: {pct(totalBuy, totalClicks)}</div>
                    </div>
                    <div className="rounded-lg border border-zinc-200 p-4">
                        <div className="text-xs font-semibold text-zinc-500">Link clicks</div>
                        <div className="mt-1 text-2xl font-black">{fmt(totalLink)}</div>
                        <div className="mt-1 text-xs font-semibold text-zinc-500">Share: {pct(totalLink, totalClicks)}</div>
                    </div>
                </div>
            </section>

            <section className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black tracking-tight">By drop</h2>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-zinc-200 text-left text-xs font-black text-zinc-600">
                                <th className="py-2 pr-3">Drop</th>
                                <th className="py-2 pr-3">Total</th>
                                <th className="py-2 pr-3">Buy</th>
                                <th className="py-2 pr-3">Link</th>
                                <th className="py-2 pr-3">Buy rate</th>
                                <th className="py-2 pr-3">Last</th>
                            </tr>
                        </thead>
                        <tbody>
                            {byDrop.length === 0 ? (
                                <tr>
                                    <td className="py-3 text-zinc-500" colSpan={6}>
                                        No data
                                    </td>
                                </tr>
                            ) : (
                                byDrop.map((r) => {
                                    const meta = dropMap.get(r.drop_id);
                                    const title = meta?.title ?? r.drop_id.slice(0, 8);
                                    const last = r.last_click_at ? new Date(r.last_click_at).toLocaleString() : "-";
                                    return (
                                        <tr key={r.drop_id} className="border-b border-zinc-100">
                                            <td className="py-3 pr-3">
                                                <div className="flex items-center gap-3">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    {meta?.cover_image_url ? (
                                                        <img
                                                            src={meta.cover_image_url}
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
                                                            {title}
                                                        </Link>
                                                        <div className="text-xs font-semibold text-zinc-500">{r.drop_id}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3 pr-3 font-extrabold">{fmt(Number(r.clicks_total ?? 0))}</td>
                                            <td className="py-3 pr-3">{fmt(Number(r.clicks_buy ?? 0))}</td>
                                            <td className="py-3 pr-3">{fmt(Number(r.clicks_link ?? 0))}</td>
                                            <td className="py-3 pr-3">
                                                {pct(Number(r.clicks_buy ?? 0), Number(r.clicks_total ?? 0))}
                                            </td>
                                            <td className="py-3 pr-3 text-xs text-zinc-600">{last}</td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black tracking-tight">Daily</h2>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-zinc-200 text-left text-xs font-black text-zinc-600">
                                <th className="py-2 pr-3">Day</th>
                                <th className="py-2 pr-3">Total</th>
                                <th className="py-2 pr-3">Buy</th>
                                <th className="py-2 pr-3">Link</th>
                                <th className="py-2 pr-3">Buy rate</th>
                            </tr>
                        </thead>
                        <tbody>
                            {daily.length === 0 ? (
                                <tr>
                                    <td className="py-3 text-zinc-500" colSpan={5}>
                                        No daily data
                                    </td>
                                </tr>
                            ) : (
                                daily.map((d) => (
                                    <tr key={d.day} className="border-b border-zinc-100">
                                        <td className="py-3 pr-3 font-extrabold">{d.day}</td>
                                        <td className="py-3 pr-3">{fmt(Number(d.clicks_total ?? 0))}</td>
                                        <td className="py-3 pr-3">{fmt(Number(d.clicks_buy ?? 0))}</td>
                                        <td className="py-3 pr-3">{fmt(Number(d.clicks_link ?? 0))}</td>
                                        <td className="py-3 pr-3">
                                            {pct(Number(d.clicks_buy ?? 0), Number(d.clicks_total ?? 0))}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black tracking-tight">Recent clicks</h2>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-zinc-200 text-left text-xs font-black text-zinc-600">
                                <th className="py-2 pr-3">Time</th>
                                <th className="py-2 pr-3">Kind</th>
                                <th className="py-2 pr-3">Drop</th>
                                <th className="py-2 pr-3">URL</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recent.length === 0 ? (
                                <tr>
                                    <td className="py-3 text-zinc-500" colSpan={4}>
                                        No recent clicks
                                    </td>
                                </tr>
                            ) : (
                                recent.map((r, i) => (
                                    <tr key={`${r.created_at}-${i}`} className="border-b border-zinc-100">
                                        <td className="py-3 pr-3 text-xs text-zinc-600">
                                            {new Date(r.created_at).toLocaleString()}
                                        </td>
                                        <td className="py-3 pr-3">
                                            <span
                                                className={[
                                                    "rounded-full px-2 py-1 text-xs font-black",
                                                    r.kind === "buy"
                                                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                        : "bg-zinc-50 text-zinc-700 border border-zinc-200",
                                                ].join(" ")}
                                            >
                                                {r.kind}
                                            </span>
                                        </td>
                                        <td className="py-3 pr-3">
                                            <Link
                                                href={`/drops/${r.drop_id}`}
                                                className="font-extrabold text-zinc-900 no-underline hover:underline"
                                            >
                                                {r.drops?.title ?? dropMap.get(r.drop_id)?.title ?? r.drop_id.slice(0, 8)}
                                            </Link>
                                            <div className="text-xs font-semibold text-zinc-500">{r.drop_id}</div>
                                        </td>
                                        <td className="py-3 pr-3">
                                            <a
                                                href={r.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-xs font-semibold text-zinc-700 hover:text-zinc-950"
                                            >
                                                {r.url.length > 120 ? r.url.slice(0, 120) + "…" : r.url}
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
