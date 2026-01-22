// app/api/stripe/webhook/route.ts
import "server-only";
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mustEnv(name: string) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env: ${name}`);
    return v;
}

const stripe = new Stripe(mustEnv("STRIPE_SECRET_KEY"));
const webhookSecret = mustEnv("STRIPE_WEBHOOK_SECRET");

export async function POST(req: Request) {
    let event: Stripe.Event;

    try {
        const sig = req.headers.get("stripe-signature");
        if (!sig) return NextResponse.json({ ok: false, error: "Missing stripe-signature" }, { status: 400 });

        const body = await req.text(); // raw body 必須
        event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err: any) {
        return NextResponse.json({ ok: false, error: err?.message ?? "Bad signature" }, { status: 400 });
    }

    try {
        if (event.type === "checkout.session.completed") {
            const session = event.data.object as Stripe.Checkout.Session;

            if (session.payment_status !== "paid") {
                return NextResponse.json({ ok: true, ignored: true });
            }

            const md = (session.metadata ?? {}) as Record<string, string>;
            const dropId = md.drop_id ?? "";
            const buyerUserId = md.buyer_user_id ?? "";
            const sellerUserId = md.seller_user_id ?? "";
            const impressionId = md.impression_id || null; // text
            const paymentIntentId =
                typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

            const now = new Date().toISOString();

            // pendingが既にある想定：stripe_session_id で確定（冪等）
            const { data: existing, error: selErr } = await supabaseAdmin
                .from("orders")
                .select("id,status")
                .eq("stripe_session_id", session.id)
                .maybeSingle();

            if (selErr) throw selErr;

            if (existing?.status === "paid") {
                return NextResponse.json({ ok: true, already_paid: true });
            }

            if (existing) {
                const { error: updErr } = await supabaseAdmin
                    .from("orders")
                    .update({
                        status: "paid",
                        paid_at: now,
                        stripe_payment_intent: paymentIntentId,
                    })
                    .eq("id", existing.id);

                if (updErr) throw updErr;
                return NextResponse.json({ ok: true, updated: true });
            }

            // checkoutAction側insertが何らかで失敗してても救済（UNIQUE stripe_session_id 推奨）
            const amountTotal = typeof session.amount_total === "number" ? session.amount_total : 0;
            const currency = typeof session.currency === "string" ? session.currency : "jpy";

            const { error: insErr } = await supabaseAdmin.from("orders").insert({
                buyer_user_id: buyerUserId,
                seller_user_id: sellerUserId,
                drop_id: dropId,
                amount_total: amountTotal,
                currency,
                status: "paid",
                stripe_session_id: session.id,
                stripe_payment_intent: paymentIntentId,
                impression_id: impressionId,
                paid_at: now,
            });

            if (insErr) throw insErr;
            return NextResponse.json({ ok: true, inserted: true });
        }

        return NextResponse.json({ ok: true, ignored: true });
    } catch (err: any) {
        return NextResponse.json({ ok: false, error: err?.message ?? "Webhook handler failed" }, { status: 500 });
    }
}
