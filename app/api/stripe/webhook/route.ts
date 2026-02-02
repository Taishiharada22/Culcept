// app/api/stripe/webhook/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

async function markOrderStatusBySession(sessionId: string, patch: Record<string, any>) {
    return await supabaseAdmin
        .from("orders")
        .update(patch)
        .eq("stripe_session_id", sessionId)
        .select("id,drop_id,status")
        .maybeSingle();
}

export async function POST(req: Request) {
    try {
        const stripe = getStripe();

        const sig = req.headers.get("stripe-signature");
        if (!sig) return NextResponse.json({ ok: false, error: "missing_stripe_signature" }, { status: 400 });

        const secret = mustEnv("STRIPE_WEBHOOK_SECRET");
        const rawBody = await req.text();

        let event: Stripe.Event;
        try {
            event = stripe.webhooks.constructEvent(rawBody, sig, secret);
        } catch (e: any) {
            return NextResponse.json({ ok: false, error: `invalid_signature: ${e?.message ?? "unknown"}` }, { status: 400 });
        }

        // ✅ paid
        const isSessionPaidEvent =
            event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded";

        if (isSessionPaidEvent) {
            const session = event.data.object as Stripe.Checkout.Session;

            if (session.payment_status && session.payment_status !== "paid") {
                return NextResponse.json({ ok: true, skipped: "payment_not_paid" });
            }

            const md = session.metadata ?? {};
            const dropId = String(md.drop_id ?? "").trim();
            const buyerId = String(md.buyer_user_id ?? "").trim();
            const sellerId = String(md.seller_user_id ?? "").trim();
            const purchaseKind = String(md.purchase_kind ?? "").trim() || "unknown";
            const acceptedBidId = String(md.accepted_bid_id ?? "").trim() || null;

            const paymentIntent =
                typeof session.payment_intent === "string"
                    ? session.payment_intent
                    : (session.payment_intent as any)?.id ?? null;

            if (!dropId || !buyerId) {
                return NextResponse.json({ ok: false, error: "missing_metadata(drop_id/buyer_user_id)" }, { status: 400 });
            }

            // order を session で取得（無ければ作る）
            const { data: existingOrder } = await supabaseAdmin
                .from("orders")
                .select("id,drop_id,status,buyer_user_id,seller_user_id")
                .eq("stripe_session_id", session.id)
                .maybeSingle();

            let orderId = (existingOrder as any)?.id ?? null;

            if (!orderId) {
                const ins = await supabaseAdmin
                    .from("orders")
                    .upsert(
                        {
                            drop_id: dropId,
                            buyer_user_id: buyerId,
                            seller_user_id: sellerId || null,
                            status: "pending",
                            currency: session.currency ?? "jpy",
                            amount_total: session.amount_total ?? null,
                            stripe_session_id: session.id,
                            stripe_payment_intent: paymentIntent,
                            purchase_kind: purchaseKind,
                            ...(md.impression_id ? { impression_id: String(md.impression_id) } : {}),
                            ...(acceptedBidId ? { accepted_bid_id: acceptedBidId } : {}),
                        } as any,
                        { onConflict: "stripe_session_id" }
                    )
                    .select("id")
                    .maybeSingle();

                if (ins.error) throw ins.error;
                orderId = (ins.data as any)?.id ?? null;
            }

            // 同一dropで既に paid が別sessionに存在するなら競合扱い
            const { data: otherPaid } = await supabaseAdmin
                .from("orders")
                .select("id")
                .eq("drop_id", dropId)
                .eq("status", "paid")
                .neq("stripe_session_id", session.id)
                .limit(1)
                .maybeSingle();

            if (otherPaid) {
                await markOrderStatusBySession(session.id, {
                    status: "paid_conflict",
                    stripe_payment_intent: paymentIntent,
                    paid_at: new Date().toISOString(),
                });
                return NextResponse.json({ ok: true, conflict: true });
            }

            const now = new Date().toISOString();

            const upd = await markOrderStatusBySession(session.id, {
                status: "paid",
                stripe_payment_intent: paymentIntent,
                paid_at: now,
            });
            if (upd.error) throw upd.error;

            // drop を sold 化（sold_at が null の時だけ）
            const soldPatch: Record<string, any> = {
                sold_at: now,
                is_sold: true,
                sold_to_user_id: buyerId,
                sold_order_id: orderId,
            };

            // auction系なら auction_status も進める（任意）
            if (purchaseKind === "auction_buy_now") soldPatch.auction_status = "sold";
            if (purchaseKind === "auction_accepted_bid") soldPatch.auction_status = "sold";

            const soldUp = await supabaseAdmin
                .from("drops")
                .update(soldPatch)
                .eq("id", dropId)
                .is("sold_at", null);

            if (soldUp.error) throw soldUp.error;

            return NextResponse.json({ ok: true, purchase_kind: purchaseKind });
        }

        // ✅ expired
        if (event.type === "checkout.session.expired") {
            const session = event.data.object as Stripe.Checkout.Session;
            await markOrderStatusBySession(session.id, { status: "expired" });
            return NextResponse.json({ ok: true });
        }

        // ✅ async failed
        if (event.type === "checkout.session.async_payment_failed") {
            const session = event.data.object as Stripe.Checkout.Session;
            await markOrderStatusBySession(session.id, { status: "failed" });
            return NextResponse.json({ ok: true });
        }

        // ✅ refunded（フル返金 & sold_order_id一致時のみ drop を戻す）
        if (event.type === "charge.refunded") {
            const ch = event.data.object as Stripe.Charge;

            const pi = typeof ch.payment_intent === "string" ? ch.payment_intent : (ch.payment_intent as any)?.id ?? null;
            if (!pi) return NextResponse.json({ ok: true, skipped: "no_payment_intent" });

            const fullRefund = Number(ch.amount_refunded ?? 0) >= Number(ch.amount ?? 0);

            const { data: order } = await supabaseAdmin
                .from("orders")
                .select("id,drop_id")
                .eq("stripe_payment_intent", pi)
                .maybeSingle();

            await supabaseAdmin
                .from("orders")
                .update({ status: "refunded", refunded_at: new Date().toISOString() })
                .eq("stripe_payment_intent", pi);

            if (fullRefund && order?.id && order?.drop_id) {
                await supabaseAdmin
                    .from("drops")
                    .update({
                        sold_at: null,
                        is_sold: false,
                        sold_to_user_id: null,
                        sold_order_id: null,
                        auction_status: "active", // auctionだった場合に戻す（任意）
                    } as any)
                    .eq("id", order.drop_id)
                    .eq("sold_order_id", order.id);
            }

            return NextResponse.json({ ok: true, full_refund: fullRefund });
        }

        return NextResponse.json({ ok: true });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
    }
}
