// app/drops/[id]/bidActions.ts
"use server";

import { requireUser } from "@/lib/auth/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type BidActionState = {
    ok: boolean;
    error?: string | null;
    message?: string | null;
};

export async function placeBidAction(dropId: string, _prev: BidActionState, formData: FormData): Promise<BidActionState> {
    try {
        const { user } = await requireUser(`/login?next=/drops/${dropId}`);

        const amountRaw = String(formData.get("amount") ?? "").trim();
        const amountNum = Number(amountRaw);
        if (!Number.isFinite(amountNum) || amountNum <= 0) return { ok: false, error: "入札額が不正。" };
        const amount = Math.floor(amountNum);

        const { data: drop, error: dErr } = await supabaseAdmin
            .from("drops")
            .select("id,sale_mode,auction_floor_price,auction_end_at,auction_status")
            .eq("id", dropId)
            .maybeSingle();

        if (dErr) throw dErr;
        if (!drop) return { ok: false, error: "Drop not found." };
        if (drop.sale_mode !== "auction") return { ok: false, error: "この商品はオークション設定ではありません。" };
        if (drop.auction_status !== "active") return { ok: false, error: "オークションが終了しています。" };

        const end = drop.auction_end_at ? new Date(drop.auction_end_at).getTime() : NaN;
        if (!Number.isFinite(end) || Date.now() >= end) return { ok: false, error: "オークションが終了しています。" };

        const floor = Number(drop.auction_floor_price ?? 0);
        const { data: top } = await supabaseAdmin
            .from("drop_bids")
            .select("amount")
            .eq("drop_id", dropId)
            .eq("status", "active")
            .order("amount", { ascending: false })
            .limit(1)
            .maybeSingle();

        const topAmt = Number(top?.amount ?? 0);
        const min = Math.max(floor, topAmt + 1);

        if (amount < min) return { ok: false, error: `入札額が低いです。最低 ¥${min.toLocaleString()} 以上にしてください。` };

        const { error: insErr } = await supabaseAdmin.from("drop_bids").insert({
            drop_id: dropId,
            bidder_id: user.id,
            amount,
            status: "active",
        } as any);

        if (insErr) throw insErr;

        return { ok: true, message: "Bid placed." };
    } catch (e: any) {
        return { ok: false, error: String(e?.message ?? "入札に失敗した。") };
    }
}
