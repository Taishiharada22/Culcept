// app/shops/me/SellerRecoPanel.tsx
"use client";

import { useEffect, useState } from "react";

export default function SellerRecoPanel() {
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [data, setData] = useState<any>(null);

    async function load() {
        setLoading(true);
        setErr(null);
        try {
            const res = await fetch("/api/recommendations?role=seller&limit=10", { cache: "no-store" });
            const j = await res.json().catch(() => null);
            if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
            setData(j);
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    const items = Array.isArray(data?.items) ? data.items : [];

    return (
        <div className="rounded-2xl border bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Seller Recommendations</div>
                <button onClick={load} className="text-xs font-semibold rounded-md border px-3 py-1 hover:bg-neutral-50" type="button">
                    Refresh
                </button>
            </div>

            {loading ? <div className="text-sm text-neutral-500">loading...</div> : null}
            {err ? <div className="text-sm font-semibold text-red-700">{err}</div> : null}

            {!loading && !err && items.length === 0 ? (
                <div className="text-sm text-neutral-500">まだおすすめがありません。</div>
            ) : null}

            {!loading && !err && items.length ? (
                <ul className="space-y-2">
                    {items.map((it: any, idx: number) => (
                        <li key={String(it?.id ?? idx)} className="rounded-xl border p-3">
                            <div className="text-sm font-semibold">{String(it?.title ?? it?.name ?? "Item")}</div>
                            {it?.reason ? <div className="text-xs text-neutral-600 mt-1">{String(it.reason)}</div> : null}
                            {typeof it?.score === "number" ? <div className="text-xs text-neutral-400 mt-1">score: {it.score}</div> : null}
                        </li>
                    ))}
                </ul>
            ) : null}

            {/* fallback: debug */}
            {!loading && !err && data && !items.length ? (
                <pre className="text-[11px] overflow-auto rounded-xl border bg-neutral-50 p-3">{JSON.stringify(data, null, 2)}</pre>
            ) : null}
        </div>
    );
}
