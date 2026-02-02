// app/checkout/success/page.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import SuccessClient from "./SuccessClient";

type SP = Record<string, string | string[] | undefined>;
function spStr(v: unknown) {
    return String(Array.isArray(v) ? v[0] : v ?? "").trim();
}

export const dynamic = "force-dynamic";

export default async function CheckoutSuccessPage({
    searchParams,
}: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    const sp = (await searchParams) ?? ({} as SP);
    const sessionId = spStr(sp.session_id);
    const imp = spStr(sp.imp) || null;

    if (!sessionId) {
        return (
            <div className="grid gap-3">
                <h1 className="text-2xl font-extrabold">Checkout success</h1>
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                    Missing session_id
                </p>
                <Link href="/drops" className="text-sm font-extrabold text-zinc-700 hover:text-zinc-950">
                    ← Back to Products
                </Link>
            </div>
        );
    }

    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const me = auth?.user ?? null;

    if (!me) {
        const next = `/checkout/success?session_id=${encodeURIComponent(sessionId)}${imp ? `&imp=${encodeURIComponent(imp)}` : ""}`;
        return (
            <div className="grid gap-3">
                <h1 className="text-2xl font-extrabold">Checkout success</h1>
                <p className="text-sm font-semibold text-zinc-700">Login required.</p>
                <Link
                    href={`/login?next=${encodeURIComponent(next)}`}
                    className="inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-extrabold text-white no-underline hover:bg-zinc-800"
                >
                    Login
                </Link>
            </div>
        );
    }

    const { data: order, error } = await supabase
        .from("orders")
        .select("id,drop_id,status,amount_total,currency,paid_at,created_at")
        .eq("stripe_session_id", sessionId)
        .maybeSingle();

    const status = String((order as any)?.status ?? "pending");
    const dropId = String((order as any)?.drop_id ?? "");

    const canLinkDrop = !!dropId && dropId !== "undefined";
    const dropHref = canLinkDrop ? `/drops/${encodeURIComponent(dropId)}${imp ? `?imp=${encodeURIComponent(imp)}` : ""}` : null;

    return (
        <div className="grid gap-4">
            <h1 className="text-2xl font-extrabold tracking-tight">Payment status</h1>

            {error ? (
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                    orders read error: {error.message}
                </p>
            ) : null}

            {status === "paid" ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                    <div className="text-sm font-extrabold text-emerald-900">Paid ✅</div>
                    <div className="mt-1 text-xs font-semibold text-emerald-900">
                        Thank you! Webhook reflected successfully.
                    </div>
                </div>
            ) : status === "paid_conflict" ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                    <div className="text-sm font-extrabold text-amber-900">Paid but conflict ⚠️</div>
                    <div className="mt-1 text-xs font-semibold text-amber-900">
                        Duplicate payment / already sold detected. We’ll handle it (refund judgement etc).
                    </div>
                </div>
            ) : status === "failed" ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
                    <div className="text-sm font-extrabold text-red-900">Payment failed</div>
                </div>
            ) : status === "expired" ? (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                    <div className="text-sm font-extrabold text-zinc-900">Session expired</div>
                </div>
            ) : (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                    <div className="text-sm font-extrabold text-zinc-900">Processing…</div>
                    <div className="mt-1 text-xs font-semibold text-zinc-600">
                        Webhook反映待ち。自動で更新します（数秒）。
                    </div>
                    <SuccessClient />
                </div>
            )}

            <div className="grid gap-2 text-xs font-semibold text-zinc-600">
                <div>session_id: <span className="font-black text-zinc-900">{sessionId}</span></div>
                <div>status: <span className="font-black text-zinc-900">{status}</span></div>
            </div>

            <div className="flex flex-wrap gap-3">
                {dropHref ? (
                    <Link
                        href={dropHref}
                        className="inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-extrabold text-white no-underline hover:bg-zinc-800"
                    >
                        View Drop
                    </Link>
                ) : null}

                <Link href="/drops" className="text-sm font-extrabold text-zinc-700 hover:text-zinc-950">
                    ← Back to Products
                </Link>
            </div>
        </div>
    );
}
