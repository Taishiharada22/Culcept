// app/drops/[id]/bidActions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth/requireUser";

function mustEnv(name: string) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env: ${name}`);
    return v;
}

const supabaseAdmin = createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
);

type BidActionState = {
    ok: boolean;
    error: string | null;
    message?: string | null;
    fieldErrors?: Record<string, string | undefined>;
};

function numInt(raw: unknown) {
    const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
    if (!Number.isFinite(n)) return null;
    return Math.floor(n);
}

async function getDropForBid(dropId: string) {
    const { data, error } = await supabaseAdmin
        .from("drops")
        .select("id,user_id,sale_mode,auction_status,auction_end_at,auction_floor_price,accepted_bid_id,sold_at,is_sold")
        .eq("id", dropId)
        .single();

    if (error) throw error;
    return data as any;
}

function isPastEnd(iso: string | null) {
    if (!iso) return false;
    const ms = new Date(iso).getTime();
    return Number.isFinite(ms) ? ms <= Date.now() : false;
}

async function getHighestActiveBid(dropId: string) {
    const { data, error } = await supabaseAdmin
        .from("drop_bids")
        .select("id,amount,bidder_user_id")
        .eq("drop_id", dropId)
        .eq("status", "active")
        .order("amount", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return (data as any) ?? null;
}

export async function placeBidAction(
    dropId: string,
    _prev: BidActionState,
    formData: FormData
): Promise<BidActionState> {
    try {
        const { user } = await requireUser(`/drops/${dropId}`);

        const amountRaw = String(formData.get("amount") ?? "").trim();
        const amount = numInt(amountRaw);

        const fieldErrors: Record<string, string | undefined> = {};
        if (!amount || amount <= 0) fieldErrors.amount = "金額が不正。";

        const d = await getDropForBid(dropId);

        if (d.sold_at || d.is_sold) return { ok: false, error: "SOLDです。" };
        if ((d.sale_mode ?? "fixed") !== "auction") return { ok: false, error: "Auctionではありません。" };
        if (d.accepted_bid_id) return { ok: false, error: "すでに落札が確定しています。" };
        if (String(d.user_id ?? "") === user.id) return { ok: false, error: "Ownerは入札できません。" };

        // auction_status が active 以外なら弾く（null は active 扱い）
        const st = String(d.auction_status ?? "active");
        if (st !== "active") return { ok: false, error: "入札を受け付けていません。" };

        if (isPastEnd(d.auction_end_at ?? null)) return { ok: false, error: "締切を過ぎています。" };

        const floor = numInt(d.auction_floor_price);
        if (!floor || floor <= 0) return { ok: false, error: "floor が未設定です（owner側で設定して）。" };

        if (amount != null && amount < floor) fieldErrors.amount = `最低入札は ¥${floor.toLocaleString("ja-JP")} 以上。`;

        const highest = await getHighestActiveBid(dropId);
        if (highest?.amount != null && amount != null && amount <= Number(highest.amount)) {
            fieldErrors.amount = `現在の最高額（¥${Number(highest.amount).toLocaleString("ja-JP")}）より1円以上上で。`;
        }

        if (Object.values(fieldErrors).some(Boolean)) {
            return { ok: false, error: "入力内容を確認して。", fieldErrors };
        }

        // ✅ partial unique index があってもなくても動く方式：
        // 1) 自分の active があれば update
        const { data: updData, error: updErr } = await supabaseAdmin
            .from("drop_bids")
            .update({ amount } as any)
            .eq("drop_id", dropId)
            .eq("bidder_user_id", user.id)
            .eq("status", "active")
            .select("id")
            .maybeSingle();

        if (updErr) throw updErr;

        // 2) update でヒットしなければ insert
        if (!updData?.id) {
            const { error: insErr } = await supabaseAdmin
                .from("drop_bids")
                .insert({ drop_id: dropId, bidder_user_id: user.id, amount, status: "active" } as any)
                .select("id")
                .maybeSingle();

            // 3) 競合で insert が失敗したら update 再トライ
            if (insErr) {
                const { error: retryErr } = await supabaseAdmin
                    .from("drop_bids")
                    .update({ amount } as any)
                    .eq("drop_id", dropId)
                    .eq("bidder_user_id", user.id)
                    .eq("status", "active");

                if (retryErr) throw retryErr;
            }
        }

        revalidatePath(`/drops/${dropId}`);
        return { ok: true, error: null, message: "Bid placed." };
    } catch (e: any) {
        return { ok: false, error: String(e?.message ?? "bid failed") };
    }
}

export async function withdrawMyBidAction(dropId: string) {
    const { user } = await requireUser(`/drops/${dropId}`);

    const { data: mine, error } = await supabaseAdmin
        .from("drop_bids")
        .select("id,status")
        .eq("drop_id", dropId)
        .eq("bidder_user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

    if (error) throw error;
    if (!mine?.id) return;

    const { error: wErr } = await supabaseAdmin
        .from("drop_bids")
        .update({ status: "withdrawn" } as any)
        .eq("id", mine.id);

    if (wErr) throw wErr;

    revalidatePath(`/drops/${dropId}`);
}

export async function acceptBidAction(dropId: string, bidId: string) {
    const { user } = await requireUser(`/drops/${dropId}`);

    const d = await getDropForBid(dropId);
    if (String(d.user_id ?? "") !== user.id) throw new Error("権限がありません。");
    if (d.sold_at || d.is_sold) throw new Error("SOLDです。");
    if ((d.sale_mode ?? "fixed") !== "auction") throw new Error("Auctionではありません。");
    if (d.accepted_bid_id) throw new Error("すでに落札が確定しています。");

    // bid存在確認
    const { data: bid, error: bErr } = await supabaseAdmin
        .from("drop_bids")
        .select("id,drop_id,status")
        .eq("id", bidId)
        .maybeSingle();

    if (bErr) throw bErr;
    if (!bid?.id || String((bid as any).drop_id) !== dropId) throw new Error("bidが不正。");

    // ✅ drop に accepted_bid_id をセット & auction_status を accepted に
    const { error: dErr } = await supabaseAdmin
        .from("drops")
        .update({ accepted_bid_id: bidId, auction_status: "accepted" } as any)
        .eq("id", dropId)
        .eq("user_id", user.id);

    if (dErr) throw dErr;

    // ✅ 勝者を accepted、他の active を rejected
    const { error: a1 } = await supabaseAdmin
        .from("drop_bids")
        .update({ status: "accepted" } as any)
        .eq("id", bidId);

    if (a1) throw a1;

    const { error: a2 } = await supabaseAdmin
        .from("drop_bids")
        .update({ status: "rejected" } as any)
        .eq("drop_id", dropId)
        .eq("status", "active")
        .neq("id", bidId);

    if (a2) throw a2;

    revalidatePath(`/drops/${dropId}`);
}
