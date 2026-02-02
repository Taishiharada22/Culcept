// app/drops/[id]/actions.ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/requireUser";
import type { DropActionState } from "../new/type";

async function assertOwner(supabase: any, dropId: string, userId: string) {
    const { data, error } = await supabase.from("drops").select("id,user_id").eq("id", dropId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Drop not found.");
    if (String(data.user_id) !== String(userId)) throw new Error("権限がありません。");
}

function toInt(raw: unknown) {
    const n = Number(String(raw ?? "").trim());
    if (!Number.isFinite(n)) return null;
    return Math.floor(n);
}

/** drop削除（既存の動きがあれば合わせて調整してOK） */
export async function deleteDropAction(dropId: string) {
    const { supabase, user } = await requireUser(`/drops/${dropId}`);
    await assertOwner(supabase, dropId, user.id);

    const { error } = await supabase.from("drops").delete().eq("id", dropId).eq("user_id", user.id);
    if (error) throw error;

    revalidatePath("/drops");
    redirect("/drops");
}

/** 入札（オファー） */
export async function placeBidAction(dropId: string, _prev: DropActionState, formData: FormData): Promise<DropActionState> {
    const amount = toInt(formData.get("amount"));

    if (amount == null || amount <= 0) {
        return { ok: false, error: "入力内容を確認して。", fieldErrors: { amount: "入札額が不正。" } } as any;
    }

    try {
        const { supabase, user } = await requireUser(`/drops/${dropId}`);

        const { data: d, error: dErr } = await supabase
            .from("drops")
            .select("id,sale_mode,auction_floor_price,auction_end_at,auction_status")
            .eq("id", dropId)
            .maybeSingle();

        if (dErr) throw dErr;
        if (!d) return { ok: false, error: "Not found", fieldErrors: {} } as any;
        if (String(d.sale_mode ?? "fixed") !== "auction") return { ok: false, error: "Auctionではありません。", fieldErrors: {} } as any;

        const endAt = d.auction_end_at ? new Date(String(d.auction_end_at)).getTime() : NaN;
        const now = Date.now();
        if (!Number.isFinite(endAt) || endAt <= now) {
            await supabase.from("drops").update({ auction_status: "ended" }).eq("id", dropId);
            return { ok: false, error: "オークションは終了しました。", fieldErrors: {} } as any;
        }
        if (String(d.auction_status ?? "active") !== "active") {
            return { ok: false, error: "現在入札できません（status）。", fieldErrors: {} } as any;
        }

        const floor = toInt(d.auction_floor_price) ?? 0;

        const { data: top, error: topErr } = await supabase
            .from("drop_bids")
            .select("amount")
            .eq("drop_id", dropId)
            .eq("status", "active")
            .order("amount", { ascending: false })
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

        if (topErr) throw topErr;

        const highest = toInt(top?.amount) ?? 0;
        const minBid = Math.max(floor, highest + 1);

        if (amount < minBid) {
            return {
                ok: false,
                error: "入札額が低い。",
                fieldErrors: { amount: `最低 ¥${minBid.toLocaleString()} 以上で入力して。` },
            } as any;
        }

        const { error: insErr } = await supabase.from("drop_bids").insert({
            drop_id: dropId,
            bidder_id: user.id,
            amount,
            status: "active",
        } as any);

        if (insErr) throw insErr;

        revalidatePath(`/drops/${dropId}`);
        revalidatePath("/drops");
        return { ok: true, error: null, message: "Bid placed." } as any;
    } catch (e: any) {
        return { ok: false, error: String(e?.message ?? "入札に失敗した。"), fieldErrors: {} } as any;
    }
}


/** 売り手：延長（デフォ24h） */
export async function extendAuctionAction(dropId: string, formData: FormData) {
    const { supabase, user } = await requireUser(`/drops/${dropId}`);
    await assertOwner(supabase, dropId, user.id);

    const extendHours = Math.max(1, toInt(formData.get("extend_hours")) ?? 24);

    const { data: d, error: dErr } = await supabase
        .from("drops")
        .select("sale_mode,auction_end_at")
        .eq("id", dropId)
        .eq("user_id", user.id)
        .maybeSingle();

    if (dErr) throw dErr;
    if (!d) throw new Error("Drop not found.");

    const now = Date.now();
    const cur = d.auction_end_at ? new Date(String(d.auction_end_at)).getTime() : NaN;
    const base = Number.isFinite(cur) ? Math.max(cur, now) : now;
    const next = new Date(base + extendHours * 3600 * 1000).toISOString();

    const { error } = await supabase
        .from("drops")
        .update({
            sale_mode: "auction",
            auction_status: "active",
            auction_end_at: next,
        })
        .eq("id", dropId)
        .eq("user_id", user.id);

    if (error) throw error;

    revalidatePath(`/drops/${dropId}`);
    revalidatePath("/drops");
    redirect(`/drops/${dropId}`);
}

/** 売り手：固定販売へ戻す（priceは維持、auction項目だけクリア） */
export async function convertToFixedAction(dropId: string) {
    const { supabase, user } = await requireUser(`/drops/${dropId}`);
    await assertOwner(supabase, dropId, user.id);

    const { error } = await supabase
        .from("drops")
        .update({
            sale_mode: "fixed",
            auction_status: "none",
            auction_floor_price: null,
            auction_end_at: null,
            auction_allow_buy_now: true,
            accepted_bid_id: null,
        })
        .eq("id", dropId)
        .eq("user_id", user.id);

    if (error) throw error;

    revalidatePath(`/drops/${dropId}`);
    revalidatePath("/drops");
    redirect(`/drops/${dropId}`);
}

/** 売り手：最高オファーを採用（推奨機能） */
export async function acceptHighestBidAction(dropId: string) {
    const { supabase, user } = await requireUser(`/drops/${dropId}`);
    await assertOwner(supabase, dropId, user.id);

    // 最高bid
    const { data: top, error: topErr } = await supabase
        .from("drop_bids")
        .select("id,amount")
        .eq("drop_id", dropId)
        .eq("status", "active")
        .order("amount", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (topErr) throw topErr;
    if (!top) throw new Error("まだ入札がありません。");

    const bidId = String(top.id);
    const amount = toInt(top.amount) ?? null;
    if (amount == null) throw new Error("bid amount が不正。");

    // drop更新：採用→固定販売へ（価格を採用額に揃える）
    const { error: upErr } = await supabase
        .from("drops")
        .update({
            accepted_bid_id: bidId,
            auction_status: "accepted",
            sale_mode: "fixed",
            price: amount,
            auction_floor_price: null,
            auction_end_at: null,
            auction_allow_buy_now: true,
        })
        .eq("id", dropId)
        .eq("user_id", user.id);

    if (upErr) throw upErr;

    // bid status更新（採用/他はrejected）
    await supabase.from("drop_bids").update({ status: "accepted" } as any).eq("id", bidId).eq("drop_id", dropId);
    await supabase.from("drop_bids").update({ status: "rejected" } as any).eq("drop_id", dropId).neq("id", bidId).eq("status", "active");

    revalidatePath(`/drops/${dropId}`);
    revalidatePath("/drops");
    redirect(`/drops/${dropId}`);
}
