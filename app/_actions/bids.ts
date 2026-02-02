// app/_actions/bids.ts
"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

type PlaceRes =
    | { ok: true; highest: number }
    | { ok: false; error: string };

type ListRes =
    | { ok: true; items: { id: string; amount: number; status: string; created_at: string }[]; highest: number }
    | { ok: false; error: string };

type AcceptRes =
    | { ok: true }
    | { ok: false; error: string };

function isColumnMissingError(err: any) {
    const code = String(err?.code ?? "");
    const msg = String(err?.message ?? "");
    return code === "42703" || (msg.includes("column") && msg.includes("does not exist"));
}

export async function placeBidAction(dropId: string, amountRaw: number): Promise<PlaceRes> {
    const supabase = await supabaseServer();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return { ok: false, error: authErr.message };
    if (!auth?.user) return { ok: false, error: "login required" };

    const bidderId = auth.user.id;
    const amount = Math.floor(Number(amountRaw));

    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "入札額が不正。" };

    const { data: drop, error: dropErr } = await supabase
        .from("drops")
        .select("id,user_id,sale_mode,auction_status,auction_end_at,auction_floor_price,accepted_bid_id")
        .eq("id", dropId)
        .maybeSingle();

    if (dropErr) return { ok: false, error: dropErr.message };
    if (!drop) return { ok: false, error: "Drop not found." };

    if (String(drop.user_id) === String(bidderId)) return { ok: false, error: "自分の商品には入札できない。" };
    if (String(drop.sale_mode ?? "") !== "auction") return { ok: false, error: "オークション商品ではない。" };
    if (String(drop.auction_status ?? "") !== "active") return { ok: false, error: "オークションが有効ではない。" };
    if (drop.accepted_bid_id) return { ok: false, error: "すでに落札済み。" };

    const endAt = drop.auction_end_at ? new Date(String(drop.auction_end_at)).getTime() : NaN;
    if (Number.isFinite(endAt) && endAt <= Date.now()) return { ok: false, error: "締切を過ぎている。" };

    const floor = Number(drop.auction_floor_price ?? 0);
    if (Number.isFinite(floor) && floor > 0 && amount < floor) return { ok: false, error: "最低入札額（floor）未満。" };

    // 現在の最高額を確認（active/acceptedのみ）
    const { data: top, error: topErr } = await supabase
        .from("bids")
        .select("amount")
        .eq("drop_id", dropId)
        .in("status", ["active", "accepted"])
        .order("amount", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (topErr) return { ok: false, error: topErr.message };

    const curHighest = Number(top?.amount ?? 0);
    if (Number.isFinite(curHighest) && curHighest > 0 && amount <= curHighest) {
        return { ok: false, error: "現在の最高入札額以下。" };
    }

    const { error: insErr } = await supabase
        .from("bids")
        .insert({ drop_id: dropId, bidder_id: bidderId, amount, status: "active" } as any);

    if (insErr) return { ok: false, error: insErr.message };

    revalidatePath(`/drops/${dropId}`);
    revalidatePath(`/shops/me/insights`);

    return { ok: true, highest: amount };
}

export async function listBidsForOwnerAction(dropId: string): Promise<ListRes> {
    const supabase = await supabaseServer();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return { ok: false, error: authErr.message };
    if (!auth?.user) return { ok: false, error: "login required" };

    const userId = auth.user.id;

    const { data: drop, error: dropErr } = await supabase
        .from("drops")
        .select("id,user_id")
        .eq("id", dropId)
        .maybeSingle();

    if (dropErr) return { ok: false, error: dropErr.message };
    if (!drop) return { ok: false, error: "Drop not found." };
    if (String(drop.user_id) !== String(userId)) return { ok: false, error: "権限がありません。" };

    const { data: bids, error: bidsErr } = await supabase
        .from("bids")
        .select("id,amount,status,created_at")
        .eq("drop_id", dropId)
        .order("amount", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20);

    if (bidsErr) return { ok: false, error: bidsErr.message };

    const highest = Number(bids?.[0]?.amount ?? 0);

    return {
        ok: true,
        items: (bids ?? []).map((b: any) => ({
            id: String(b.id),
            amount: Number(b.amount ?? 0),
            status: String(b.status ?? "active"),
            created_at: String(b.created_at),
        })),
        highest: Number.isFinite(highest) ? highest : 0,
    };
}

export async function acceptBidAction(dropId: string, bidId: string): Promise<AcceptRes> {
    const supabase = await supabaseServer();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return { ok: false, error: authErr.message };
    if (!auth?.user) return { ok: false, error: "login required" };

    const ownerId = auth.user.id;

    const { data: drop, error: dropErr } = await supabase
        .from("drops")
        .select("id,user_id,accepted_bid_id")
        .eq("id", dropId)
        .maybeSingle();

    if (dropErr) return { ok: false, error: dropErr.message };
    if (!drop) return { ok: false, error: "Drop not found." };
    if (String(drop.user_id) !== String(ownerId)) return { ok: false, error: "権限がありません。" };
    if (drop.accepted_bid_id) return { ok: false, error: "すでに落札済み。" };

    const { data: bid, error: bidErr } = await supabase
        .from("bids")
        .select("id,drop_id,status")
        .eq("id", bidId)
        .maybeSingle();

    if (bidErr) return { ok: false, error: bidErr.message };
    if (!bid) return { ok: false, error: "Bid not found." };
    if (String(bid.drop_id) !== String(dropId)) return { ok: false, error: "Bidが一致しない。" };

    // 1) 採用bidをacceptedへ
    const { error: u1 } = await supabase
        .from("bids")
        .update({ status: "accepted" } as any)
        .eq("id", bidId)
        .eq("drop_id", dropId);

    if (u1) return { ok: false, error: u1.message };

    // 2) 他bidをrejectedへ（activeのみ）
    const { error: u2 } = await supabase
        .from("bids")
        .update({ status: "rejected" } as any)
        .eq("drop_id", dropId)
        .neq("id", bidId)
        .eq("status", "active");

    if (u2) return { ok: false, error: u2.message };

    // 3) dropsにaccepted_bid_idを書き込む（＋status/soldは列があれば入れる）
    const patch: any = { accepted_bid_id: bidId };

    // ここは列が無い可能性があるので雑にトライ→無ければ無視
    patch.status = "sold";
    patch.auction_status = "ended";

    const { error: u3 } = await supabase
        .from("drops")
        .update(patch)
        .eq("id", dropId)
        .eq("user_id", ownerId);

    if (u3) {
        // accepted_bid_id は必須で入れたいので、列無しを避けて再トライ
        if (isColumnMissingError(u3)) {
            const { error: u4 } = await supabase
                .from("drops")
                .update({ accepted_bid_id: bidId } as any)
                .eq("id", dropId)
                .eq("user_id", ownerId);
            if (u4) return { ok: false, error: u4.message };
        } else {
            return { ok: false, error: u3.message };
        }
    }

    revalidatePath(`/drops/${dropId}`);
    revalidatePath(`/shops/me/insights`);
    return { ok: true };
}
