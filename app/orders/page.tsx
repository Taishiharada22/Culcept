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
            <div className="grid gap-3">
                <h1 className="text-2xl font-extrabold tracking-tight">Orders</h1>
                <p className="text-sm font-semibold text-zinc-700">ログインすると購入/販売履歴が見れます。</p>
                <Link
                    href="/login"
                    className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-extrabold text-white no-underline hover:bg-zinc-800"
                >
                    Login
                </Link>
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

    const OrderList = ({ rows }: { rows: any[] }) => (
        <ul className="grid gap-3">
            {rows.map((o) => {
                const d = dropMap.get(o.drop_id) ?? null;
                const title = d?.title ?? `Drop ${String(o.drop_id).slice(0, 8)}…`;
                const href = o.drop_id ? `/drops/${encodeURIComponent(o.drop_id)}` : "/drops";
                const st = String(o.status ?? "unknown");
                const kind = String(o.purchase_kind ?? "");

                return (
                    <li key={o.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <Link href={href} className="block truncate text-sm font-extrabold text-zinc-900 hover:opacity-90">
                                    {title}
                                </Link>
                                <div className="mt-1 text-xs font-semibold text-zinc-500">
                                    {new Date(o.created_at).toLocaleString()}
                                </div>
                            </div>

                            <span className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-[11px] font-black text-zinc-700">
                                {st}
                            </span>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-600">
                            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">
                                amount: <span className="font-black text-zinc-900">{fmt(o.amount_total)}</span>{" "}
                                {String(o.currency ?? "jpy").toUpperCase()}
                            </span>

                            {kind ? (
                                <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">
                                    kind: <span className="font-black text-zinc-900">{kind}</span>
                                </span>
                            ) : null}

                            {o.paid_at ? (
                                <span className="text-xs font-semibold text-zinc-500">paid: {new Date(o.paid_at).toLocaleString()}</span>
                            ) : null}

                            {st === "paid_conflict" ? (
                                <span className="text-xs font-extrabold text-red-700">
                                    ⚠ conflict（同一Productsで複数paidの可能性）
                                </span>
                            ) : null}
                        </div>
                    </li>
                );
            })}
        </ul>
    );

    return (
        <div className="grid gap-6">
            <div className="flex items-center justify-between gap-3">
                <h1 className="text-2xl font-extrabold tracking-tight">Orders</h1>
                <Link href="/drops" className="text-sm font-extrabold text-zinc-700 hover:text-zinc-950">
                    ← Products
                </Link>
            </div>

            <section className="grid gap-3">
                <h2 className="text-lg font-extrabold tracking-tight">Purchases</h2>
                {buys.length ? <OrderList rows={buys} /> : <div className="text-sm font-semibold text-zinc-600">まだ購入履歴がありません。</div>}
            </section>

            <section className="grid gap-3">
                <h2 className="text-lg font-extrabold tracking-tight">Sales</h2>
                {sells.length ? <OrderList rows={sells} /> : <div className="text-sm font-semibold text-zinc-600">まだ販売履歴がありません。</div>}
            </section>
        </div>
    );
}
