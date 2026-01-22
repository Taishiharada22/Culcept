// app/checkout/success/page.tsx
import "server-only";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function mustEnv(name: string) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env: ${name}`);
    return v;
}

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL || mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function CheckoutSuccessPage({
    searchParams,
}: {
    searchParams: { session_id?: string };
}) {
    const sessionId = String(searchParams.session_id ?? "").trim();

    if (!sessionId) {
        return (
            <main className="mx-auto max-w-2xl px-4 py-16">
                <h1 className="text-3xl font-extrabold">購入完了</h1>
                <p className="mt-3 text-sm font-semibold text-zinc-600">session_id が見つかりませんでした。</p>
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
                        注文が見つかりませんでした（反映待ちの可能性があります）。
                    </p>
                    <p className="mt-2 text-xs text-zinc-500">session_id: {sessionId}</p>
                    <p className="mt-3 text-xs text-zinc-500">
                        数秒後に更新しても見つからない場合は、Webhook/DB紐付けを確認してください。
                    </p>
                </>
            ) : (
                <div className="mt-6 rounded-lg border border-zinc-200 p-5">
                    <div className="text-sm font-extrabold">ステータス: {order.status}</div>
                    {order.paid_at && <div className="mt-2 text-sm">paid_at: {String(order.paid_at)}</div>}

                    {order.status === "pending" && (
                        <div className="mt-3 text-xs text-zinc-500">
                            決済反映中の可能性があります。数秒後に更新してください。
                        </div>
                    )}

                    {order.drop_id && (
                        <Link className="mt-4 inline-block underline" href={`/drops/${order.drop_id}`}>
                            Dropへ戻る
                        </Link>
                    )}
                </div>
            )}

            <div className="mt-8 flex gap-4">
                <Link className="inline-block underline" href="/drops">
                    Dropsへ
                </Link>
                <Link className="inline-block underline" href={`/checkout/success?session_id=${encodeURIComponent(sessionId)}`}>
                    更新
                </Link>
            </div>
        </main>
    );
}
