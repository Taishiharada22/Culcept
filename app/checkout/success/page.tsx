// app/checkout/success/page.tsx
import "server-only";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type SearchParams = { session_id?: string };

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: { persistSession: false, autoRefreshToken: false },
    }
);

export default async function CheckoutSuccessPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const sp = await searchParams; // ✅ Next.js 16 では Promise
    const sessionId = sp.session_id;

    if (!sessionId) {
        return (
            <main className="mx-auto max-w-2xl px-4 py-16">
                <h1 className="text-3xl font-extrabold">購入完了</h1>
                <p className="mt-3 text-sm font-semibold text-zinc-600">
                    session_id が見つかりませんでした。
                </p>
                <Link className="mt-6 inline-block underline" href="/drops">
                    Dropsへ
                </Link>
            </main>
        );
    }

    const { data: order } = await supabaseAdmin
        .from("orders")
        .select("id,status,paid_at,drop_id,stripe_session_id")
        .eq("stripe_session_id", sessionId)
        .maybeSingle();

    return (
        <main className="mx-auto max-w-2xl px-4 py-16">
            <h1 className="text-3xl font-extrabold">購入結果</h1>

            {!order ? (
                <>
                    <p className="mt-3 text-sm font-semibold text-zinc-600">
                        注文が見つかりませんでした（反映待ちの可能性もあります）。
                    </p>
                    <p className="mt-2 text-xs text-zinc-500">session_id: {sessionId}</p>
                </>
            ) : (
                <div className="mt-6 rounded-lg border border-zinc-200 p-5">
                    <div className="text-sm font-extrabold">ステータス: {order.status}</div>
                    {order.paid_at && <div className="mt-2 text-sm">paid_at: {order.paid_at}</div>}
                    {order.drop_id && (
                        <Link className="mt-4 inline-block underline" href={`/drops/${order.drop_id}`}>
                            Dropへ戻る
                        </Link>
                    )}
                </div>
            )}

            <Link className="mt-8 inline-block underline" href="/drops">
                Dropsへ
            </Link>
        </main>
    );
}
