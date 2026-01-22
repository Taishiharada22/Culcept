// app/drops/[id]/checkoutAction.ts
"use server";

import "server-only";

import Stripe from "stripe";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

function mustEnv(name: string) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env: ${name}`);
    return v;
}

const stripe = new Stripe(mustEnv("STRIPE_SECRET_KEY"), {
    // apiVersion は固定しなくても動くが、型安定させたいなら固定してOK
    // apiVersion: "2024-06-20",
});

type DropForCheckout = {
    id: string;
    title: string | null;
    price: number | null;
    user_id: string | null;
    purchase_url: string | null;
    sale_mode: "fixed" | "auction" | null;
    auction_allow_buy_now: boolean | null;
};

export async function createDropCheckoutAction(dropId: string, impressionId: string | null, _fd: FormData) {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
        redirect(`/login?next=${encodeURIComponent(`/drops/${dropId}`)}`);
    }

    const buyerId = auth.user.id;

    // Drop取得（Adminで取る＝RLS関係なく取れる）
    const { data: d, error: dErr } = await supabaseAdmin
        .from("drops")
        .select("id,title,price,user_id,purchase_url,sale_mode,auction_allow_buy_now")
        .eq("id", dropId)
        .maybeSingle();

    if (dErr || !d) {
        redirect(`/drops/${dropId}?e=${encodeURIComponent(dErr?.message ?? "Drop not found")}`);
    }

    const drop = d as unknown as DropForCheckout;

    // 外部購入URLがあるなら Stripe ではなくそっち（念のため）
    if (drop.purchase_url) {
        redirect(drop.purchase_url);
    }

    // 自分のDropは買えない
    if (drop.user_id && drop.user_id === buyerId) {
        redirect(`/drops/${dropId}?e=${encodeURIComponent("You cannot buy your own drop.")}`);
    }

    // 固定価格のみ（auctionはBidBox側でやる）
    const saleMode = (drop.sale_mode ?? "fixed") as "fixed" | "auction";
    if (saleMode !== "fixed") {
        redirect(`/drops/${dropId}?e=${encodeURIComponent("Auction drops cannot be purchased via checkout.")}`);
    }

    const price = Number(drop.price ?? 0);
    if (!Number.isFinite(price) || price <= 0) {
        redirect(`/drops/${dropId}?e=${encodeURIComponent("Invalid price.")}`);
    }

    const sellerId = String(drop.user_id ?? "");
    if (!sellerId) {
        redirect(`/drops/${dropId}?e=${encodeURIComponent("Seller not found.")}`);
    }

    // 既に売れてたら止める（paidが1件でもあれば sold 扱い）
    const { data: sold } = await supabaseAdmin
        .from("orders")
        .select("id")
        .eq("drop_id", dropId)
        .eq("status", "paid")
        .maybeSingle();

    if (sold) {
        redirect(`/drops/${dropId}?e=${encodeURIComponent("This drop is already sold.")}`);
    }

    // Stripe Checkout Session 作成
    const session = await stripe.checkout.sessions.create({
        mode: "payment",
        // 日本円は unit_amount = 円（整数）でOK
        line_items: [
            {
                price_data: {
                    currency: "jpy",
                    unit_amount: Math.round(price),
                    product_data: {
                        name: drop.title ?? "Drop",
                        metadata: { drop_id: dropId },
                    },
                },
                quantity: 1,
            },
        ],
        success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/drops/${dropId}`,
        metadata: {
            drop_id: dropId,
            buyer_user_id: buyerId,
            seller_user_id: sellerId,
            impression_id: impressionId ?? "",
        },
        payment_intent_data: {
            metadata: {
                drop_id: dropId,
                buyer_user_id: buyerId,
                seller_user_id: sellerId,
                impression_id: impressionId ?? "",
            },
        },
    });

    if (!session.url) {
        redirect(`/drops/${dropId}?e=${encodeURIComponent("Stripe session url is missing.")}`);
    }

    // ordersに pending 作成（webhookで paid に確定）
    const { error: insErr } = await supabaseAdmin.from("orders").insert({
        buyer_user_id: buyerId,
        seller_user_id: sellerId,
        drop_id: dropId,
        amount_total: Math.round(price),
        currency: "jpy",
        status: "pending",
        stripe_session_id: session.id,
        impression_id: impressionId ?? null,
    });

    if (insErr) {
        // sessionは作れてしまってるので、ここで止めて戻す（DBが直ってない時はここで落ちる）
        redirect(`/drops/${dropId}?e=${encodeURIComponent(insErr.message)}`);
    }

    redirect(session.url);
}
