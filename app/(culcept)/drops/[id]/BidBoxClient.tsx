// app/drops/[id]/BidBoxClient.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { placeBidAction, withdrawMyBidAction } from "./bidActions";

function fmt(n: unknown) {
    const num = typeof n === "number" ? n : Number(String(n ?? ""));
    if (!Number.isFinite(num)) return "0";
    return Math.round(num).toLocaleString("ja-JP");
}

// ✅ Client側で型を持つ（bidActions.ts 側で type export しなくて済む）
export type BidActionState = {
    ok: boolean;
    error: string | null;
    message?: string | null;
    fieldErrors?: Record<string, string | undefined>;
};

type Props = {
    dropId: string;
    minNext: number;
    isAuthed: boolean;
    loginNext: string;
    canBid: boolean; // live && not owner && not accepted && not sold
};

export default function BidBoxClient({ dropId, minNext, isAuthed, loginNext, canBid }: Props) {
    const initial: BidActionState = { ok: true, error: null, message: null, fieldErrors: {} };

    // placeBidAction(dropId, prev, formData) を bind して useActionState へ
    const action = placeBidAction.bind(null, dropId) as unknown as (
        prev: BidActionState,
        formData: FormData
    ) => Promise<BidActionState>;

    const [state, formAction, pending] = useActionState<BidActionState, FormData>(action, initial);

    if (!canBid) return null;

    if (!isAuthed) {
        return (
            <Link
                href={`/login?next=${encodeURIComponent(loginNext)}`}
                className="inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-extrabold text-white no-underline hover:bg-zinc-800"
            >
                Login to bid
            </Link>
        );
    }

    return (
        <div className="mt-4 rounded-xl border border-zinc-200 p-4">
            <form action={formAction} className="flex flex-col gap-3">
                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Your bid (JPY)</label>

                    <input
                        name="amount"
                        inputMode="numeric"
                        placeholder={`min ¥${fmt(minNext)}`}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    />

                    <div className="text-xs font-semibold text-zinc-500">最小: ¥{fmt(minNext)}（floor/現在最高+1）</div>

                    {state?.fieldErrors?.amount ? (
                        <div className="text-xs font-extrabold text-red-700">{state.fieldErrors.amount}</div>
                    ) : null}

                    {state?.error ? (
                        <div className="text-xs font-extrabold text-red-700">{state.error}</div>
                    ) : state?.message ? (
                        <div className="text-xs font-extrabold text-emerald-700">{state.message}</div>
                    ) : null}
                </div>

                <div className="flex items-center justify-between gap-3">
                    <button
                        type="submit"
                        disabled={pending}
                        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-extrabold text-white hover:bg-zinc-800 disabled:opacity-60"
                    >
                        {pending ? "Placing..." : "Place bid"}
                    </button>

                    <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                            // ✅ server action（withdraw）を client から呼ぶ
                            React.startTransition(() => {
                                void withdrawMyBidAction(dropId);
                            });
                        }}
                        className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-extrabold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                    >
                        Withdraw my bid
                    </button>
                </div>
            </form>
        </div>
    );
}
