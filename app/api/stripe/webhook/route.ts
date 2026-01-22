// app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe"; // 既存の stripe instance を使う想定

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function markEvent(eventId: string, status: "ok" | "ignored" | "failed", error?: string) {
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
    const whsec = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !whsec) {
        return NextResponse.json({ ok: false, error: "missing_signature_or_secret" }, { status: 400 });
    }

    const rawBody = await req.text();

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(rawBody, sig, whsec);
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 400 });
    }

    // 1) まずログ保存（ユニーク制約で重複は自然に弾く）
    const ins = await supabaseAdmin.from("stripe_events").insert({
        event_id: event.id,
        type: event.type,
        stripe_created: event.created,
        livemode: event.livemode,
        payload: event as any,
    });

    // 23505 = unique violation（すでに保存済み）
    if (ins.error && (ins.error as any).code !== "23505") {
        return NextResponse.json({ ok: false, error: "failed_to_log_event" }, { status: 500 });
    }

    try {
        // 2) 本処理
        switch (event.type) {
            case "checkout.session.completed":
            case "checkout.session.async_payment_succeeded": {
                const session = event.data.object as Stripe.Checkout.Session;
                const sessionId = session.id;

                const paymentIntent =
                    typeof session.payment_intent === "string"
                        ? session.payment_intent
                        : session.payment_intent?.id ?? null;

                const { data: order, error: findErr } = await supabaseAdmin
                    .from("orders")
                    .select("id,status")
                    .eq("stripe_session_id", sessionId)
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
                        stripe_payment_intent: paymentIntent,
                    })
                    .eq("id", order.id);

                if (upErr) throw upErr;

                await markEvent(event.id, "ok");
                return NextResponse.json({ ok: true, updated: true });
            }

            default:
                await markEvent(event.id, "ignored");
                return NextResponse.json({ ok: true, ignored: true });
        }
    } catch (e: any) {
        await markEvent(event.id, "failed", e?.message ?? String(e));
        return NextResponse.json({ ok: false, error: "handler_failed" }, { status: 500 });
    }
}
