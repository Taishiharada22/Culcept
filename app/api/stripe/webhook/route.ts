import "server-only";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { getStripe, getWebhookSecret } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mustEnv(name: string) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env: ${name}`);
    return v;
}

const stripe = getStripe();
const webhookSecret = getWebhookSecret();

const supabaseAdmin = createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
);

async function markEvent(
    eventId: string,
    status: "ok" | "ignored" | "failed",
    error?: string
) {
    // stripe_events が無いなら、まずテーブル作成が必要（下にSQL置く）
    await supabaseAdmin
        .from("stripe_events")
        .update({
            processed_at: new Date().toISOString(),
            process_status: status,
            process_error: error ?? null,
        })
        .eq("event_id", eventId);
}

export async function POST(req: Request) {
    const sig = req.headers.get("stripe-signature");
    if (!sig) {
        return NextResponse.json({ ok: false, error: "missing_signature" }, { status: 400 });
    }

    const rawBody = await req.text();

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message ?? "invalid_signature" }, { status: 400 });
    }

    // 1) まずログ保存（unique event_idで冪等）
    const ins = await supabaseAdmin.from("stripe_events").insert({
        event_id: event.id,
        type: event.type,
        stripe_created: event.created,
        livemode: event.livemode,
        payload: event as any,
    });

    // 23505 = unique violation（既に保存済み）
    if (ins.error && (ins.error as any).code !== "23505") {
        return NextResponse.json({ ok: false, error: "failed_to_log_event" }, { status: 500 });
    }

    try {
        if (
            event.type === "checkout.session.completed" ||
            event.type === "checkout.session.async_payment_succeeded"
        ) {
            const session = event.data.object as Stripe.Checkout.Session;

            if (session.payment_status !== "paid") {
                await markEvent(event.id, "ignored", "payment_status_not_paid");
                return NextResponse.json({ ok: true, ignored: true });
            }

            const paymentIntentId =
                typeof session.payment_intent === "string"
                    ? session.payment_intent
                    : session.payment_intent?.id ?? null;

            const { data: order, error: findErr } = await supabaseAdmin
                .from("orders")
                .select("id,status")
                .eq("stripe_session_id", session.id)
                .maybeSingle();

            if (findErr) throw findErr;

            if (!order) {
                await markEvent(event.id, "ignored", "order_not_found_for_session");
                return NextResponse.json({ ok: true, ignored: true, reason: "order_not_found" });
            }

            if (order.status === "paid") {
                await markEvent(event.id, "ok");
                return NextResponse.json({ ok: true, already_paid: true });
            }

            const { error: upErr } = await supabaseAdmin
                .from("orders")
                .update({
                    status: "paid",
                    paid_at: new Date().toISOString(),
                    stripe_payment_intent: paymentIntentId,
                })
                .eq("id", order.id);

            if (upErr) throw upErr;

            await markEvent(event.id, "ok");
            return NextResponse.json({ ok: true, updated: true });
        }

        await markEvent(event.id, "ignored");
        return NextResponse.json({ ok: true, ignored: true });
    } catch (e: any) {
        await markEvent(event.id, "failed", e?.message ?? String(e));
        return NextResponse.json({ ok: false, error: "handler_failed" }, { status: 500 });
    }
}
