import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminEmail } from "@/lib/admin";
import { notFound, redirect } from "next/navigation";

type ClickRow = {
    created_at: string;
    drop_id: string;
    kind: "buy" | "link";
    url: string;
};

export default async function AdminOutboundPage() {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (!user) redirect("/login?next=/admin/outbound");
    if (!isAdminEmail(user.email)) return notFound();

    const { data: clicks, error } = await supabaseAdmin
        .from("outbound_clicks")
        .select("created_at,drop_id,kind,url")
        .order("created_at", { ascending: false })
        .limit(5000);

    if (error) {
        return (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                {error.message}
            </div>
        );
    }

    const rows = (clicks ?? []) as ClickRow[];

    // 集計（サーバーでJS集計：確実に動く）
    const map = new Map<string, { dropId: string; buy: number; link: number; lastAt: string }>();
    for (const r of rows) {
        const k = r.drop_id;
        const cur = map.get(k) ?? { dropId: k, buy: 0, link: 0, lastAt: r.created_at };
        if (r.kind === "buy") cur.buy += 1;
        else cur.link += 1;
        if (r.created_at > cur.lastAt) cur.lastAt = r.created_at;
        map.set(k, cur);
    }

    const agg = Array.from(map.values()).sort((a, b) => (b.buy + b.link) - (a.buy + a.link)).slice(0, 200);

    return (
        <main className="mx-auto max-w-5xl px-4 py-10">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-extrabold tracking-tight">Admin: Outbound</h1>
                <div className="flex items-center gap-3">
                    <Link href="/admin/reports" className="text-sm font-extrabold text-zinc-700 no-underline hover:text-zinc-950">
                        Reports
                    </Link>
                    <Link href="/drops" className="text-sm font-extrabold text-zinc-700 no-underline hover:text-zinc-950">
                        ← Drops
                    </Link>
                </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
                <div className="grid gap-0">
                    {agg.map((x) => (
                        <div key={x.dropId} className="flex items-center justify-between gap-3 border-b border-zinc-200 p-4">
                            <div className="grid gap-1">
                                <Link
                                    href={`/drops/${x.dropId}`}
                                    className="text-sm font-black text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900"
                                >
                                    {x.dropId}
                                </Link>
                                <div className="text-xs font-semibold text-zinc-500">last: {new Date(x.lastAt).toLocaleString()}</div>
                            </div>
                            <div className="flex items-center gap-3 text-xs font-extrabold">
                                <span className="rounded-full border border-zinc-200 px-3 py-1">buy: {x.buy}</span>
                                <span className="rounded-full border border-zinc-200 px-3 py-1">link: {x.link}</span>
                                <span className="rounded-full bg-zinc-900 px-3 py-1 text-white">total: {x.buy + x.link}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {agg.length === 0 ? (
                    <div className="p-6 text-sm font-semibold text-zinc-600">No clicks yet.</div>
                ) : null}
            </div>
        </main>
    );
}
