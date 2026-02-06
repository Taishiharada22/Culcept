// app/orders/page.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function fmt(n: unknown) {
    const num = typeof n === "number" ? n : Number(String(n ?? ""));
    if (!Number.isFinite(num)) return "0";
    return Math.round(num).toLocaleString("ja-JP");
}

export default async function OrdersPage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user ?? null;

    if (!user) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-cyan-50/20">
                <div className="max-w-2xl mx-auto px-4 py-16">
                    <div className="rounded-3xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-xl p-12 text-center">
                        <div className="text-6xl mb-6">📦</div>
                        <h1 className="text-3xl font-black text-gray-800 mb-4">Orders</h1>
                        <p className="text-gray-500 mb-8">ログインすると購入/販売履歴が見れます。</p>
                        <Link
                            href="/login"
                            className="inline-block rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-8 py-4 font-bold text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all no-underline"
                        >
                            🔓 Login
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    const [buyRes, sellRes] = await Promise.all([
        supabase
            .from("orders")
            .select("id,drop_id,status,amount_total,currency,created_at,paid_at,refunded_at,purchase_kind")
            .eq("buyer_user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(50),
        supabase
            .from("orders")
            .select("id,drop_id,status,amount_total,currency,created_at,paid_at,refunded_at,purchase_kind")
            .eq("seller_user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(50),
    ]);

    const buys = (buyRes.data ?? []) as any[];
    const sells = (sellRes.data ?? []) as any[];

    const dropIds = Array.from(new Set([...buys, ...sells].map((o) => o.drop_id).filter(Boolean)));
    let dropMap = new Map<string, any>();

    if (dropIds.length) {
        const { data: drops } = await supabase
            .from("drops")
            .select("id,title,cover_image_url")
            .in("id", dropIds);

        for (const d of drops ?? []) dropMap.set((d as any).id, d);
    }

    const OrderList = ({ rows, type }: { rows: any[]; type: "buy" | "sell" }) => (
        <ul className="grid gap-4">
            {rows.map((o, index) => {
                const d = dropMap.get(o.drop_id) ?? null;
                const title = d?.title ?? `Drop ${String(o.drop_id).slice(0, 8)}…`;
                const href = o.drop_id ? `/drops/${encodeURIComponent(o.drop_id)}` : "/drops";
                const st = String(o.status ?? "unknown");
                const kind = String(o.purchase_kind ?? "");

                return (
                    <li
                        key={o.id}
                        className="rounded-2xl bg-white/70 backdrop-blur-sm border border-white/60 shadow-lg overflow-hidden hover:shadow-xl transition-all"
                        style={{ animation: `fadeIn 0.3s ease-out ${index * 0.05}s both` }}
                    >
                        <div className="p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-4 min-w-0">
                                    {d?.cover_image_url && (
                                        <div className="w-16 h-16 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={d.cover_image_url}
                                                alt={title}
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <Link
                                            href={href}
                                            className="block truncate text-base font-bold text-gray-800 hover:text-violet-600 transition-colors no-underline"
                                        >
                                            {title}
                                        </Link>
                                        <div className="mt-1 text-xs text-gray-500">
                                            {new Date(o.created_at).toLocaleString("ja-JP")}
                                        </div>
                                    </div>
                                </div>

                                <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                                    st === "paid" ? "bg-emerald-100 text-emerald-700 border border-emerald-200" :
                                    st === "completed" ? "bg-blue-100 text-blue-700 border border-blue-200" :
                                    st === "paid_conflict" ? "bg-red-100 text-red-700 border border-red-200" :
                                    "bg-gray-100 text-gray-600 border border-gray-200"
                                }`}>
                                    {st}
                                </span>
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                <span className="rounded-xl bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 px-4 py-2 text-sm">
                                    <span className="text-gray-500">金額:</span>{" "}
                                    <span className="font-bold text-violet-700">¥{fmt(o.amount_total)}</span>
                                </span>

                                {kind && (
                                    <span className="rounded-xl bg-gray-100 border border-gray-200 px-4 py-2 text-xs">
                                        <span className="text-gray-500">種別:</span>{" "}
                                        <span className="font-bold text-gray-700">{kind}</span>
                                    </span>
                                )}

                                {o.paid_at && (
                                    <span className="text-xs text-gray-500">
                                        支払: {new Date(o.paid_at).toLocaleString("ja-JP")}
                                    </span>
                                )}

                                {st === "paid_conflict" && (
                                    <span className="rounded-xl bg-red-100 border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700">
                                        ⚠ conflict
                                    </span>
                                )}
                            </div>
                        </div>
                    </li>
                );
            })}
        </ul>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-cyan-50/20">
            {/* ヘッダー */}
            <div className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 border-b border-white/60 shadow-sm">
                <div className="max-w-4xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link
                                href="/my"
                                className="w-10 h-10 rounded-xl bg-white/50 border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 hover:text-gray-800 transition-all shadow-sm"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </Link>
                            <div>
                                <h1 className="text-xl font-bold text-gray-800">Orders</h1>
                                <p className="text-xs text-gray-400">購入・販売履歴</p>
                            </div>
                        </div>
                        <Link
                            href="/products"
                            className="rounded-xl bg-white/50 border border-white/60 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-white/80 transition-all shadow-sm no-underline"
                        >
                            ← Products
                        </Link>
                    </div>
                </div>
            </div>

            {/* メインコンテンツ */}
            <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">
                {/* 購入履歴 */}
                <section>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-black text-gray-800 flex items-center gap-3">
                            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-lg shadow-md">
                                🛒
                            </span>
                            購入履歴
                        </h2>
                        <span className="rounded-full bg-emerald-100 border border-emerald-200 px-4 py-1.5 text-sm font-bold text-emerald-700">
                            {buys.length} 件
                        </span>
                    </div>
                    {buys.length ? (
                        <OrderList rows={buys} type="buy" />
                    ) : (
                        <div className="rounded-2xl bg-white/70 backdrop-blur-sm border border-white/60 shadow-lg p-12 text-center">
                            <div className="text-5xl mb-4">🛒</div>
                            <p className="text-gray-500">まだ購入履歴がありません。</p>
                        </div>
                    )}
                </section>

                {/* 販売履歴 */}
                <section>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-black text-gray-800 flex items-center gap-3">
                            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-lg shadow-md">
                                💰
                            </span>
                            販売履歴
                        </h2>
                        <span className="rounded-full bg-amber-100 border border-amber-200 px-4 py-1.5 text-sm font-bold text-amber-700">
                            {sells.length} 件
                        </span>
                    </div>
                    {sells.length ? (
                        <OrderList rows={sells} type="sell" />
                    ) : (
                        <div className="rounded-2xl bg-white/70 backdrop-blur-sm border border-white/60 shadow-lg p-12 text-center">
                            <div className="text-5xl mb-4">💰</div>
                            <p className="text-gray-500">まだ販売履歴がありません。</p>
                        </div>
                    )}
                </section>
            </div>

        </div>
    );
}
