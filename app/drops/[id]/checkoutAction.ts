// app/drops/[id]/checkoutAction.ts
import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

// ✅ runtime export を削除（"use server" ファイルでは使えない）
// NOTE: この関数は page.tsx 側で export const runtime = "nodejs" を設定すれば動く

function mustEnv(name: string) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env: ${name}`);
    return v;
}

type AdminClient = ReturnType<typeof createClient>;

function getSupabaseAdmin(): AdminClient {
    return createClient(
        mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
        mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
        { auth: { persistSession: false, autoRefreshToken: false } }
    );
}

async function resolveSiteUrl() {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";

    const envUrl =
        process.env.NEXT_PUBLIC_SITE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

    const base = (envUrl || (host ? `${proto}://${host}` : "http://localhost:3000")).replace(/\/$/, "");
    return base;
}

function addQuery(url: string, params: Record<string, string | null | undefined>) {
    const qs = Object.entries(params)
        .filter(([, v]) => v != null && String(v).trim() !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&");
    if (!qs) return url;
    return url + (url.includes("?") ? "&" : "?") + qs;
}

type DropForCheckout = {
    id: string;
    title: string | null;
    price: number | null;
    user_id: string | null;

    purchase_url: string | null;

    sale_mode: "fixed" | "auction" | null;
    buy_now_price: number | null;
    auction_allow_buy_now: boolean | null;
    accepted_bid_id: string | null;

    sold_at: string | null;
    is_sold: boolean | null;
};

async function createPendingOrder(
    admin: AdminClient,
    params: {
        dropId: string;
        buyerId: string;
        sellerId: string | null;
        sessionId: string;
        amount: number;
        currency: string;
        purchaseKind: string;
        impressionId?: string | null;
        paymentIntent?: string | null;
        acceptedBidId?: string | null;
    }
) {
    const { error } = await admin
        .from("orders")
        .upsert(
            {
                drop_id: params.dropId,
                buyer_user_id: params.buyerId,
                seller_user_id: params.sellerId,
                status: "pending",
                currency: params.currency,
                amount_total: params.amount,
                stripe_session_id: params.sessionId,
                stripe_payment_intent: params.paymentIntent ?? null,
                purchase_kind: params.purchaseKind,
                ...(params.impressionId ? { impression_id: String(params.impressionId) } : {}),
                ...(params.acceptedBidId ? { accepted_bid_id: String(params.acceptedBidId) } : {}),
            } as any,
            { onConflict: "stripe_session_id" }
        )
        .select("id")
        .maybeSingle();

    if (error) throw error;
}

async function getAuthedUserId() {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
}

async function getDrop(admin: AdminClient, dropId: string) {
    const { data, error } = await admin
        .from("drops")
        .select(
            "id,title,price,user_id,purchase_url,sale_mode,buy_now_price,auction_allow_buy_now,accepted_bid_id,sold_at,is_sold"
        )
        .eq("id", dropId)
        .single();

    if (error) throw error;
    return data as unknown as DropForCheckout;
}

function assertNotSold(d: DropForCheckout) {
    if (d.sold_at || d.is_sold) throw new Error("already_sold");
}

function yenAmount(n: unknown) {
    const v = typeof n === "number" ? n : Number(String(n ?? ""));
    if (!Number.isFinite(v) || v <= 0) return null;
    return Math.round(v);
}

/** fixed: d.price を決済 */
export async function createDropCheckoutAction(dropId: string, imp?: string | null, _fd?: FormData) {
    "use server";

    const buyerId = await getAuthedUserId();
    if (!buyerId) {
        const next = addQuery(`/drops/${encodeURIComponent(dropId)}`, { imp: imp ?? null });
        redirect(`/login?next=${encodeURIComponent(next)}`);
    }

    const admin = getSupabaseAdmin();

    const d = await getDrop(admin, dropId);
    assertNotSold(d);

    if (d.purchase_url) throw new Error("purchase_url_exists");

    const saleMode = (d.sale_mode ?? "fixed") as "fixed" | "auction";
    if (saleMode !== "fixed") throw new Error("not_fixed_sale");

    const amount = yenAmount(d.price);
    if (!amount) throw new Error("invalid_price");

    const base = await resolveSiteUrl();
    const successUrl = `${base}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = addQuery(`${base}/drops/${encodeURIComponent(dropId)}`, { imp: imp ?? null });

    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
            {
                quantity: 1,
                price_data: {
                    currency: "jpy",
                    unit_amount: amount,
                    product_data: { name: String(d.title ?? "Drop") },
                },
            },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: buyerId,
        metadata: {
            drop_id: String(d.id),
            buyer_user_id: String(buyerId),
            seller_user_id: String(d.user_id ?? ""),
            purchase_kind: "fixed",
            ...(imp ? { impression_id: String(imp) } : {}),
        },
    });

    await createPendingOrder(admin, {
        dropId: d.id,
        buyerId,
        sellerId: d.user_id ?? null,
        sessionId: session.id,
        amount,
        currency: session.currency ?? "jpy",
        purchaseKind: "fixed",
        impressionId: imp ?? null,
    });

    if (!session.url) throw new Error("missing_session_url");
    redirect(session.url);
}

/** auction: buy_now_price を決済 */
export async function createAuctionBuyNowCheckoutAction(dropId: string, imp?: string | null, _fd?: FormData) {
    "use server";

    const buyerId = await getAuthedUserId();
    if (!buyerId) {
        const next = addQuery(`/drops/${encodeURIComponent(dropId)}`, { imp: imp ?? null });
        redirect(`/login?next=${encodeURIComponent(next)}`);
    }

    const admin = getSupabaseAdmin();

    const d = await getDrop(admin, dropId);
    assertNotSold(d);

    if (d.purchase_url) throw new Error("purchase_url_exists");

    const saleMode = (d.sale_mode ?? "fixed") as "fixed" | "auction";
    if (saleMode !== "auction") throw new Error("not_auction_sale");

    const allow = Boolean(d.auction_allow_buy_now ?? true);
    if (!allow) throw new Error("buy_now_not_allowed");

    const amount = yenAmount(d.buy_now_price);
    if (!amount) throw new Error("invalid_buy_now_price");

    const base = await resolveSiteUrl();
    const successUrl = `${base}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = addQuery(`${base}/drops/${encodeURIComponent(dropId)}`, { imp: imp ?? null });

    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
            {
                quantity: 1,
                price_data: {
                    currency: "jpy",
                    unit_amount: amount,
                    product_data: { name: String(d.title ?? "Drop") },
                },
            },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: buyerId,
        metadata: {
            drop_id: String(d.id),
            buyer_user_id: String(buyerId),
            seller_user_id: String(d.user_id ?? ""),
            purchase_kind: "auction_buy_now",
            ...(imp ? { impression_id: String(imp) } : {}),
        },
    });

    await createPendingOrder(admin, {
        dropId: d.id,
        buyerId,
        sellerId: d.user_id ?? null,
        sessionId: session.id,
        amount,
        currency: session.currency ?? "jpy",
        purchaseKind: "auction_buy_now",
        impressionId: imp ?? null,
    });

    if (!session.url) throw new Error("missing_session_url");
    redirect(session.url);
}

/** auction: accepted bid の金額を決済（drop_bids: bidder_user_id 前提） */
export async function createAuctionAcceptedBidCheckoutAction(dropId: string, imp?: string | null, _fd?: FormData) {
    "use server";

    const buyerId = await getAuthedUserId();
    if (!buyerId) {
        const next = addQuery(`/drops/${encodeURIComponent(dropId)}`, { imp: imp ?? null });
        redirect(`/login?next=${encodeURIComponent(next)}`);
    }

    const admin = getSupabaseAdmin();

    const d = await getDrop(admin, dropId);
    assertNotSold(d);

    if (d.purchase_url) throw new Error("purchase_url_exists");

    const saleMode = (d.sale_mode ?? "fixed") as "fixed" | "auction";
    if (saleMode !== "auction") throw new Error("not_auction_sale");

    if (!d.accepted_bid_id) throw new Error("no_accepted_bid");

    const { data: bid, error: bidErr } = await admin
        .from("drop_bids")
        .select("id,drop_id,bidder_user_id,amount")
        .eq("id", d.accepted_bid_id)
        .single();

    if (bidErr) throw bidErr;

    const bidDropId = String((bid as any)?.drop_id ?? "");
    const bidUserId = String((bid as any)?.bidder_user_id ?? "");
    const bidAmount = yenAmount((bid as any)?.amount);

    if (!bidDropId || bidDropId !== d.id) throw new Error("accepted_bid_drop_mismatch");
    if (!bidUserId || bidUserId !== buyerId) throw new Error("not_accepted_bidder");
    if (!bidAmount) throw new Error("invalid_accepted_bid_amount");

    const base = await resolveSiteUrl();
    const successUrl = `${base}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = addQuery(`${base}/drops/${encodeURIComponent(dropId)}`, { imp: imp ?? null });

    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
            {
                quantity: 1,
                price_data: {
                    currency: "jpy",
                    unit_amount: bidAmount,
                    product_data: { name: String(d.title ?? "Drop") },
                },
            },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: buyerId,
        metadata: {
            drop_id: String(d.id),
            buyer_user_id: String(buyerId),
            seller_user_id: String(d.user_id ?? ""),
            purchase_kind: "auction_accepted_bid",
            accepted_bid_id: String(d.accepted_bid_id),
            ...(imp ? { impression_id: String(imp) } : {}),
        },
    });

    await createPendingOrder(admin, {
        dropId: d.id,
        buyerId,
        sellerId: d.user_id ?? null,
        sessionId: session.id,
        amount: bidAmount,
        currency: session.currency ?? "jpy",
        purchaseKind: "auction_accepted_bid",
        impressionId: imp ?? null,
        acceptedBidId: d.accepted_bid_id,
    });

    if (!session.url) throw new Error("missing_session_url");
    redirect(session.url);
}
