// app/drops/[id]/BidBox.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { acceptBidAction } from "./bidActions";
import BidBoxClient from "./BidBoxClient";

export const dynamic = "force-dynamic";

type Props = {
    dropId: string;
    isOwner: boolean;

    // page.tsx から来る可能性があるprops（使わないものも受ける）
    isAuthed?: boolean;
    loginNext?: string;
    isSold?: boolean;

    sale_mode: "fixed" | "auction";
    auction_status: string | null;
    auction_end_at: string | null;
    auction_floor_price: number | null;
    auction_allow_buy_now?: boolean | null;
    buy_now_price?: number | null;

    accepted_bid_id: string | null;
    highest_bid_now: number | null;
    is_auction_live?: boolean | null;
};

type BidRow = {
    id: string;
    amount: number | null;
    status: string | null;
    bidder_user_id: string | null;
    created_at: string | null;
};

function fmt(n: unknown) {
    const num = typeof n === "number" ? n : Number(String(n ?? ""));
    if (!Number.isFinite(num)) return "0";
    return Math.round(num).toLocaleString("ja-JP");
}

function timeLeftLabel(iso: string | null) {
    if (!iso) return null;
    const ms = new Date(iso).getTime();
    if (!Number.isFinite(ms)) return null;
    const diff = ms - Date.now();
    if (diff <= 0) return "ended";

    const m = Math.floor(diff / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);

    if (d >= 1) return `${d}d ${h % 24}h`;
    if (h >= 1) return `${h}h ${m % 60}m`;
    return `${m}m`;
}

export default async function BidBox(props: Props) {
    const {
        dropId,
        isOwner,
        sale_mode,
        auction_status,
        auction_end_at,
        auction_floor_price,
        accepted_bid_id,
        isSold,
    } = props;

    if (sale_mode !== "auction") return null;

    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const me = auth?.user ?? null;

    // bids（上位20）
    const { data: bidsRaw, error: bErr } = await supabase
        .from("drop_bids")
        .select("id,amount,status,bidder_user_id,created_at")
        .eq("drop_id", dropId)
        .order("amount", { ascending: false })
        .limit(20);

    if (bErr) {
        return (
            <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-extrabold text-red-700">
                drop_bids error: {bErr.message}
            </section>
        );
    }

    const bids = ((bidsRaw ?? []) as BidRow[]).filter(Boolean);

    const highestActive = bids.find((b) => String(b.status ?? "active") === "active");
    const highestNow = Number(highestActive?.amount ?? props.highest_bid_now ?? 0);

    const floor = Number(auction_floor_price ?? 0);
    const minNext = Math.max(floor, highestNow > 0 ? highestNow + 1 : floor);

    const endLabel = timeLeftLabel(auction_end_at);
    const isEndedByTime = endLabel === "ended";
    const hasAccepted = !!accepted_bid_id;

    const isLive =
        !isSold &&
        !hasAccepted &&
        !isEndedByTime &&
        (auction_status === "active" || auction_status === "none" || auction_status == null);

    const acceptedBid = hasAccepted ? bids.find((b) => b.id === accepted_bid_id) : null;
    const isAcceptedMe = !!(acceptedBid && me?.id && acceptedBid.bidder_user_id === me.id);

    const loginNext = props.loginNext ?? `/drops/${dropId}`;

    return (
        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-black tracking-tight">Auction</h2>
                    <div className="mt-1 text-xs font-semibold text-zinc-500">
                        {auction_end_at ? (
                            <>
                                end: <span className="font-black text-zinc-800">{new Date(auction_end_at).toLocaleString()}</span>
                                {endLabel ? (
                                    <span className="ml-2 rounded-full border border-zinc-200 px-2 py-1 font-black">left: {endLabel}</span>
                                ) : null}
                            </>
                        ) : (
                            "end: (not set)"
                        )}
                    </div>
                </div>

                <div className="text-right">
                    <div className="text-xs font-semibold text-zinc-500">highest</div>
                    <div className="text-xl font-black text-zinc-900">¥{fmt(highestNow)}</div>
                    <div className="text-xs font-semibold text-zinc-500">floor: ¥{fmt(floor)}</div>
                </div>
            </div>

            {/* 状態 */}
            <div className="mt-4">
                {isSold ? (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs font-semibold text-zinc-700">
                        SOLD
                    </div>
                ) : hasAccepted ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                        <div className="text-sm font-extrabold text-emerald-800">Accepted bid</div>
                        <div className="mt-1 text-xs font-semibold text-emerald-800">
                            amount: <span className="font-black">¥{fmt(acceptedBid?.amount ?? 0)}</span>
                            {isAcceptedMe ? (
                                <span className="ml-2 rounded-full border border-emerald-200 bg-white px-2 py-1 font-black">you</span>
                            ) : null}
                        </div>
                        <div className="mt-2 text-xs font-semibold text-zinc-600">
                            {isOwner ? "落札者が支払い完了すると SOLD になります。" : "落札者は上の “Pay accepted bid” から支払いできます。"}
                        </div>
                    </div>
                ) : isLive ? (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs font-semibold text-zinc-700">
                        live now（最低: ¥{fmt(floor)} / 次の最小: ¥{fmt(minNext)}）
                    </div>
                ) : (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs font-semibold text-zinc-700">
                        auction closed（accept済み or time end）
                    </div>
                )}
            </div>

            {/* 入札フォーム（買い手：clientでuseActionState） */}
            {!isOwner ? (
                <BidBoxClient
                    dropId={dropId}
                    minNext={minNext}
                    isAuthed={!!me}
                    loginNext={loginNext}
                    canBid={!!isLive && !hasAccepted && !isSold}
                />
            ) : null}

            {/* bids一覧（owner向け accept） */}
            {isOwner ? (
                <div className="mt-5">
                    <div className="text-sm font-extrabold text-zinc-900">Bids</div>

                    {bids.length === 0 ? (
                        <div className="mt-2 text-xs font-semibold text-zinc-500">まだ入札がありません。</div>
                    ) : (
                        <ul className="mt-3 grid gap-2">
                            {bids.map((b) => {
                                const status = String(b.status ?? "active");
                                const isAccepted = accepted_bid_id === b.id || status === "accepted";

                                return (
                                    <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3">
                                        <div className="min-w-0">
                                            <div className="text-sm font-black text-zinc-900">¥{fmt(b.amount ?? 0)}</div>
                                            <div className="mt-1 text-xs font-semibold text-zinc-500">
                                                {b.created_at ? new Date(b.created_at).toLocaleString() : ""}
                                                <span className="ml-2 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 font-black">
                                                    {status}
                                                </span>
                                                {isAccepted ? (
                                                    <span className="ml-2 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 font-black text-emerald-800">
                                                        accepted
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>

                                        {!hasAccepted && isLive && status === "active" ? (
                                            <form action={acceptBidAction.bind(null, dropId, b.id)}>
                                                <button
                                                    type="submit"
                                                    className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-extrabold text-zinc-900 hover:bg-zinc-50"
                                                >
                                                    Accept
                                                </button>
                                            </form>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            ) : null}

            {/* login link（保険） */}
            {!me && !isOwner ? (
                <div className="mt-3 text-xs font-semibold text-zinc-500">
                    <Link href={`/login?next=${encodeURIComponent(loginNext)}`} className="font-black text-zinc-900">
                        Login
                    </Link>{" "}
                    すると入札できます。
                </div>
            ) : null}
        </section>
    );
}
