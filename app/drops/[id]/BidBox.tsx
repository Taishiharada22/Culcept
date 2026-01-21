"use client";

import * as React from "react";
import { acceptBidAction, listBidsForOwnerAction, placeBidAction } from "@/app/_actions/bids";

type OwnerBid = { id: string; amount: number; status: string; created_at: string };

function fmt(n: any) {
    const num = typeof n === "number" ? n : Number(String(n ?? ""));
    if (!Number.isFinite(num)) return "";
    return Math.round(num).toLocaleString("ja-JP");
}

function leftLabel(endAt: string | null) {
    if (!endAt) return "";
    const ms = new Date(endAt).getTime();
    if (!Number.isFinite(ms)) return "";
    const diff = ms - Date.now();
    if (diff <= 0) return "締切済み";
    const m = Math.floor(diff / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `残り ${d}日`;
    if (h > 0) return `残り ${h}時間`;
    return `残り ${m}分`;
}

export default function BidBox({
    dropId,
    isOwner,
    sale_mode,
    auction_status,
    auction_end_at,
    auction_floor_price,
    accepted_bid_id,
    highest_bid_now,
}: {
    dropId: string;
    isOwner: boolean;
    sale_mode: "fixed" | "auction" | string | null;
    auction_status: string | null;
    auction_end_at: string | null;
    auction_floor_price: number | null;
    accepted_bid_id: string | null;
    highest_bid_now: number;
}) {
    const [err, setErr] = React.useState<string | null>(null);
    const [info, setInfo] = React.useState<string | null>(null);
    const [pending, startTransition] = React.useTransition();

    const [amount, setAmount] = React.useState("");
    const [highest, setHighest] = React.useState<number>(Number(highest_bid_now ?? 0) || 0);

    const [ownerBids, setOwnerBids] = React.useState<OwnerBid[]>([]);
    const [acceptedId, setAcceptedId] = React.useState<string | null>(accepted_bid_id ?? null);

    const ended = (() => {
        if (!auction_end_at) return false;
        const ms = new Date(auction_end_at).getTime();
        return Number.isFinite(ms) ? ms <= Date.now() : false;
    })();

    const isAuction = String(sale_mode ?? "") === "auction";
    const isLive = isAuction && String(auction_status ?? "") === "active" && !ended && !acceptedId;

    async function refreshOwnerBids() {
        if (!isOwner) return;
        const res = await listBidsForOwnerAction(dropId);
        if (!res.ok) {
            setErr(res.error);
            return;
        }
        setOwnerBids(res.items);
        setHighest(res.highest ?? 0);
    }

    React.useEffect(() => {
        if (isOwner && isAuction) {
            refreshOwnerBids().catch(() => { });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOwner, dropId, isAuction]);

    if (!isAuction) return null;

    return (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 grid gap-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm font-extrabold">Auction</div>
                    <div className="text-xs font-semibold text-zinc-600">
                        状態：<span className="font-black">{String(auction_status ?? "unknown")}</span>
                        {auction_end_at ? (
                            <span className="ml-2">
                                / <span className="font-black">{leftLabel(auction_end_at)}</span>
                            </span>
                        ) : null}
                    </div>
                </div>

                {acceptedId ? (
                    <span className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-black text-zinc-800">
                        SOLD
                    </span>
                ) : isLive ? (
                    <span className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-black text-zinc-800">
                        LIVE
                    </span>
                ) : (
                    <span className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-black text-zinc-800">
                        STOP
                    </span>
                )}
            </div>

            <div className="grid gap-1 text-sm">
                <div className="text-xs font-semibold text-zinc-600">
                    floor: <span className="font-black text-zinc-900">¥{fmt(auction_floor_price ?? 0)}</span>
                </div>
                <div className="text-xs font-semibold text-zinc-600">
                    highest: <span className="font-black text-zinc-900">¥{fmt(highest ?? 0)}</span>
                </div>
            </div>

            {err ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-extrabold text-red-700 whitespace-pre-wrap">
                    {err}
                </div>
            ) : null}
            {info ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-extrabold text-emerald-800 whitespace-pre-wrap">
                    {info}
                </div>
            ) : null}

            {/* Bidder UI */}
            {!isOwner ? (
                <div className="grid gap-2">
                    <div className="text-xs font-semibold text-zinc-600">入札額（円）</div>
                    <div className="flex items-center gap-2">
                        <input
                            value={amount}
                            onChange={(e) => setAmount(e.currentTarget.value)}
                            inputMode="numeric"
                            placeholder="例）12000"
                            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold"
                            disabled={pending || !isLive}
                        />
                        <button
                            type="button"
                            disabled={pending || !isLive}
                            onClick={() => {
                                setErr(null);
                                setInfo(null);
                                startTransition(async () => {
                                    const n = Number(amount);
                                    const res = await placeBidAction(dropId, n);
                                    if (!res.ok) {
                                        setErr(res.error);
                                        return;
                                    }
                                    setHighest(res.highest);
                                    setAmount("");
                                    setInfo("入札しました。");
                                });
                            }}
                            className="shrink-0 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-extrabold text-white hover:bg-zinc-800 disabled:opacity-60"
                        >
                            {pending ? "…" : "Bid"}
                        </button>
                    </div>

                    {!isLive ? <div className="text-xs font-semibold text-zinc-500">※ 入札はLIVE時のみ</div> : null}
                </div>
            ) : null}

            {/* Owner UI */}
            {isOwner ? (
                <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-extrabold">Bids（owner）</div>
                        <button
                            type="button"
                            onClick={() => {
                                setErr(null);
                                setInfo(null);
                                startTransition(async () => {
                                    await refreshOwnerBids();
                                    setInfo("更新しました。");
                                });
                            }}
                            className="rounded-xl border px-3 py-2 text-xs font-extrabold hover:bg-zinc-50 disabled:opacity-60"
                            disabled={pending}
                        >
                            Refresh
                        </button>
                    </div>

                    {ownerBids.length === 0 ? (
                        <div className="text-xs font-semibold text-zinc-600">まだ入札がありません。</div>
                    ) : (
                        <ul className="grid gap-2">
                            {ownerBids.map((b) => (
                                <li key={b.id} className="rounded-xl border border-zinc-200 bg-white p-3 flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-sm font-black">¥{fmt(b.amount)}</div>
                                        <div className="text-xs font-semibold text-zinc-600">
                                            {b.status} / {new Date(b.created_at).toLocaleString("ja-JP")}
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        disabled={pending || !!acceptedId || !isLive}
                                        onClick={() => {
                                            setErr(null);
                                            setInfo(null);
                                            startTransition(async () => {
                                                const res = await acceptBidAction(dropId, b.id);
                                                if (!res.ok) {
                                                    setErr(res.error);
                                                    return;
                                                }
                                                setAcceptedId(b.id);
                                                setInfo("落札を確定しました。");
                                                await refreshOwnerBids();
                                            });
                                        }}
                                        className="shrink-0 rounded-xl bg-black px-3 py-2 text-xs font-extrabold text-white hover:opacity-90 disabled:opacity-60"
                                    >
                                        Accept
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="text-xs font-semibold text-zinc-500">Acceptすると落札確定（accepted_bid_id更新）</div>
                </div>
            ) : null}
        </div>
    );
}
