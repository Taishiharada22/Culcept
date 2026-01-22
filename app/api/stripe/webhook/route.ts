// app/api/stripe/webhook/route.ts
import "server-only";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";
const stripe = getStripe();
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mustEnv(name: string) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env: ${name}`);
    return v;
}

function mustEnvOneOf(names: string[]) {
    for (const n of names) {
        const v = process.env[n];
        if (v) return v;
    }
    throw new Error(`Missing env: one of ${names.join(", ")}`);
}

const webhookSecret = mustEnv("STRIPE_WEBHOOK_SECRET");

const supabaseAdmin = createClient(
    mustEnvOneOf(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
);

async function markEvent(eventId: string, status: "ok" | "ignored" | "failed", error?: string) {
    // stripe_events が無い/列が違う場合はここで落ちるので、運用前提ならテーブル整合だけ要確認
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
    if (!sig) return NextResponse.json({ ok: false, error: "missing_signature" }, { status: 400 });

    // Stripe Webhook は raw body が必要
    const rawBody = await req.text();

    const stripe = getStripe();

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (e: any) {
        return NextResponse.json(
            { ok: false, error: e?.message ?? "invalid_signature" },
            { status: 400 }
        );
    }

    // 1) まずログ保存（unique event_id 前提で冪等）
    const ins = await supabaseAdmin.from("stripe_events").insert({
        event_id: event.id,
        type: event.type,
        stripe_created: event.created,
        livemode: event.livemode,
        payload: event as any,
    });

    // 23505 = unique violation（既に保存済み）ならOK扱いで続行
    if (ins.error && (ins.error as any).code !== "23505") {
        return NextResponse.json({ ok: false, error: "failed_to_log_event" }, { status: 500 });
    }

    try {
        // 2) 本処理（Checkout完了＝支払い確定を orders に反映）
        if (
            event.type === "checkout.session.completed" ||
            event.type === "checkout.session.async_payment_succeeded"
        ) {
            const session = event.data.object as Stripe.Checkout.Session;

            if (session.payment_status !== "paid") {
                await markEvent(event.id, "ignored", "payment_status_not_paid");
                return NextResponse.json({ ok: true, ignored: true });
            }

            const sessionId = session.id;

            const paymentIntentId =
                typeof session.payment_intent === "string"
                    ? session.payment_intent
                    : session.payment_intent?.id ?? null;

            // orders を探す：まず session_id、次に payment_intent（あるなら）
            let order:
                | { id: string; status: string | null }
                | null
                | undefined = undefined;

            {
                const { data, error } = await supabaseAdmin
                    .from("orders")
                    .select("id,status")
                    .eq("stripe_session_id", sessionId)
                    .maybeSingle();
                if (error) throw error;
                order = data ?? null;
            }

            if (!order && paymentIntentId) {
                const { data, error } = await supabaseAdmin
                    .from("orders")
                    .select("id,status")
                    .eq("stripe_payment_intent", paymentIntentId)
                    .maybeSingle();
                if (error) throw error;
                order = data ?? null;
            }

            // 無ければ（メタデータが揃ってる場合のみ）作成して paid にする
            if (!order) {
                const md = (session.metadata ?? {}) as Record<string, string>;
                const drop_id = (md.drop_id || "").trim();
                const buyer_user_id = (md.buyer_user_id || "").trim();
                const seller_user_id = (md.seller_user_id || "").trim();

                if (!drop_id || !buyer_user_id || !seller_user_id) {
                    await markEvent(event.id, "ignored", "order_not_found_and_metadata_missing");
                    return NextResponse.json({ ok: true, ignored: true, reason: "order_not_found" });
                }

                const { data: created, error: createErr } = await supabaseAdmin
                    .from("orders")
                    .insert({
                        drop_id,
                        buyer_user_id,
                        seller_user_id,
                        status: "paid",
                        paid_at: new Date().toISOString(),
                        stripe_session_id: sessionId,
                        stripe_payment_intent: paymentIntentId,
                    })
                    .select("id,status")
                    .maybeSingle();

                if (createErr) throw createErr;

                await markEvent(event.id, "ok");
                return NextResponse.json({ ok: true, created: true, order_id: created?.id ?? null });
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
                    stripe_session_id: sessionId, // 念のため上書き
                })
                .eq("id", order.id);

            if (upErr) throw upErr;

            await markEvent(event.id, "ok");
            return NextResponse.json({ ok: true, updated: true });
        }

        // その他イベントは無視（ログだけ残す）
        await markEvent(event.id, "ignored");
        return NextResponse.json({ ok: true, ignored: true });
    } catch (e: any) {
        await markEvent(event.id, "failed", e?.message ?? String(e));
        return NextResponse.json({ ok: false, error: "handler_failed" }, { status: 500 });
    }
}
