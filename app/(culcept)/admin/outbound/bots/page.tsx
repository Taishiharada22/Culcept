// app/admin/outbound/bots/page.tsx
import "server-only";

import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export const dynamic = "force-dynamic";

type Overview = {
    raw_total: number;
    bot_guess_total: number;
    human_guess_total: number;
};

type UaRow = { user_agent: string; clicks: number };
type IpRow = { ip: string; clicks: number; last_seen: string | null };

function fmt(n: number) {
    return Number(n ?? 0).toLocaleString();
}

export default async function AdminOutboundBotsPage() {
    await requireAdmin("/admin/outbound/bots");

    const { data: ovRaw, error: e1 } = await supabaseAdmin.from("v_outbound_bot_overview_30d").select("*").single();
    if (e1) {
        return (
            <div className="grid gap-3">
                <h1 className="text-2xl font-extrabold">Outbound Bots</h1>
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{e1.message}</p>
            </div>
        );
    }
    const ov = ovRaw as Overview;

    const { data: uas } = await supabaseAdmin.from("v_outbound_bot_top_ua_30d").select("user_agent,clicks");
    const { data: ips } = await supabaseAdmin.from("v_outbound_bot_top_ip_30d").select("ip,clicks,last_seen");

    return (
        <div className="grid gap-6">
            <div className="flex items-center justify-between gap-3">
                <div className="grid gap-1">
                    <h1 className="text-2xl font-extrabold tracking-tight">Outbound Bots (30d)</h1>
                    <p className="text-xs font-semibold text-zinc-600">※ bot推定はUAベースの簡易判定 + clean viewで10秒連打は除外</p>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href="/admin/outbound"
                        className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-800 no-underline hover:bg-zinc-50"
                    >
                        ← Outbound
                    </Link>
                    <Link
                        href="/admin/outbound/insights"
                        className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-800 no-underline hover:bg-zinc-50"
                    >
                        Insights →
                    </Link>
                </div>
            </div>

            <section className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black tracking-tight">Overview</h2>
                <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-zinc-200 p-4">
                        <div className="text-xs font-semibold text-zinc-500">Raw total</div>
                        <div className="mt-1 text-2xl font-black">{fmt(ov.raw_total)}</div>
                    </div>
                    <div className="rounded-lg border border-zinc-200 p-4">
                        <div className="text-xs font-semibold text-zinc-500">Bot guessed</div>
                        <div className="mt-1 text-2xl font-black">{fmt(ov.bot_guess_total)}</div>
                    </div>
                    <div className="rounded-lg border border-zinc-200 p-4">
                        <div className="text-xs font-semibold text-zinc-500">Human guessed</div>
                        <div className="mt-1 text-2xl font-black">{fmt(ov.human_guess_total)}</div>
                    </div>
                </div>
            </section>

            <section className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black tracking-tight">Top bot User-Agents</h2>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-zinc-200 text-left text-xs font-black text-zinc-600">
                                <th className="py-2 pr-3">Clicks</th>
                                <th className="py-2 pr-3">User-Agent</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(uas ?? []).length === 0 ? (
                                <tr><td className="py-3 text-zinc-500" colSpan={2}>No bot UA</td></tr>
                            ) : (
                                (uas as UaRow[]).map((r, i) => (
                                    <tr key={i} className="border-b border-zinc-100">
                                        <td className="py-3 pr-3 font-extrabold">{fmt(r.clicks)}</td>
                                        <td className="py-3 pr-3 text-xs font-semibold text-zinc-700">{r.user_agent}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black tracking-tight">Top bot IPs</h2>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-zinc-200 text-left text-xs font-black text-zinc-600">
                                <th className="py-2 pr-3">Clicks</th>
                                <th className="py-2 pr-3">IP</th>
                                <th className="py-2 pr-3">Last seen</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(ips ?? []).length === 0 ? (
                                <tr><td className="py-3 text-zinc-500" colSpan={3}>No bot IP</td></tr>
                            ) : (
                                (ips as IpRow[]).map((r, i) => (
                                    <tr key={i} className="border-b border-zinc-100">
                                        <td className="py-3 pr-3 font-extrabold">{fmt(r.clicks)}</td>
                                        <td className="py-3 pr-3 text-xs font-semibold text-zinc-700">{r.ip}</td>
                                        <td className="py-3 pr-3 text-xs text-zinc-600">
                                            {r.last_seen ? new Date(r.last_seen).toLocaleString() : "-"}
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
