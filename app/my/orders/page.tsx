// app/my/orders/page.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined) {
    return Array.isArray(v) ? v[0] : v;
}

export default async function MyOrdersPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const sp = await searchParams;
    const tab = first(sp.tab) === "sales" ? "sales" : "purchases";

    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
        return (
            <main className="mx-auto max-w-2xl px-4 py-16">
                <p className="text-sm text-zinc-600">ログインしてください。</p>
                <Link className="mt-6 inline-block underline" href="/login">
                    Login
                </Link>
            </main>
        );
    }

    const userId = auth.user.id;

    const baseSelect = "id,status,paid_at,created_at,drop_id,amount_total,currency,stripe_session_id";

    const q = supabase
        .from("orders")
        .select(baseSelect)
        .order("created_at", { ascending: false })
        .limit(50);

    const { data: rows, error } =
        tab === "sales"
            ? await q.eq("seller_user_id", userId)
            : await q.eq("buyer_user_id", userId);

    if (error) {
        return (
            <main className="mx-auto max-w-2xl px-4 py-16">
                <h1 className="text-2xl font-extrabold">Orders</h1>
                <p className="mt-3 text-sm text-red-600">Error: {error.message}</p>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-2xl px-4 py-16">
            <div className="flex items-center gap-3">
                <h1 className="text-2xl font-extrabold">{tab === "sales" ? "販売履歴" : "購入履歴"}</h1>
                <Link className="text-sm underline" href={`/my/orders?tab=${tab === "sales" ? "purchases" : "sales"}`}>
                    {tab === "sales" ? "購入履歴へ" : "販売履歴へ"}
                </Link>
            </div>

            <div className="mt-6 space-y-3">
                {(rows ?? []).map((o) => (
                    <div key={o.id} className="rounded-lg border p-4">
                        <div className="text-sm font-bold">status: {o.status}</div>
                        <div className="mt-1 text-xs text-zinc-600">order_id: {o.id}</div>
                        {o.paid_at && <div className="mt-1 text-xs text-zinc-600">paid_at: {o.paid_at}</div>}
                        <div className="mt-2 flex gap-3">
                            {o.drop_id && (
                                <Link className="text-sm underline" href={`/drops/${o.drop_id}`}>
                                    Productsを見る
                                </Link>
                            )}
                            {o.stripe_session_id && (
                                <span className="text-xs text-zinc-500">session: {o.stripe_session_id}</span>
                            )}
                        </div>
                    </div>
                ))}
                {(rows ?? []).length === 0 && <p className="text-sm text-zinc-600">まだありません。</p>}
            </div>

            <Link className="mt-8 inline-block underline" href="/my">
                My Pageへ
            </Link>
        </main>
    );
}
