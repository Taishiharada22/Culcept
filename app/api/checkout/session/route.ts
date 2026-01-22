// app/api/checkout/session/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { drop_id: string; impression_id?: string | null };

function mustEnv(name: string) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env: ${name}`);
    return v;
}

function supabaseAdmin() {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) throw new Error("Missing env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");

    return createClient(url, mustEnv("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

function resolveSiteUrl(req: Request) {
    const envUrl =
        process.env.NEXT_PUBLIC_SITE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
    if (envUrl) return envUrl.replace(/\/$/, "");
    const origin = req.headers.get("origin");
    if (origin) return origin.replace(/\/$/, "");
    return "http://localhost:3000";
}

export async function POST(req: Request) {
    const admin = supabaseAdmin();

    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ ok: false, error: "not_signed_in" }, { status: 401 });
        }

        const body = (await req.json().catch(() => null)) as Body | null;
        const dropId = String(body?.drop_id ?? "").trim();
        if (!dropId) return NextResponse.json({ ok: false, error: "invalid_drop_id" }, { status: 400 });

        const { data: drop, error } = await supabase
            .from("drops")
            .select("id,title,price,user_id,sale_mode,auction_status")
            .eq("id", dropId)
            .maybeSingle();

        if (error || !drop) return NextResponse.json({ ok: false, error: "drop_not_found" }, { status: 404 });

        if (drop.sale_mode === "auction") {
            return NextResponse.json({ ok: false, error: "auction_not_supported_yet" }, { status: 400 });
        }

        // 自分のdropを自分で買うのは禁止（推奨）
        if (String(drop.user_id ?? "") === auth.user.id) {
            return NextResponse.json({ ok: false, error: "self_purchase_not_allowed" }, { status: 400 });
        }

        const price = Number(drop.price ?? 0);
        if (!Number.isFinite(price) || price <= 0) {
            return NextResponse.json({ ok: false, error: "invalid_price" }, { status: 400 });
        }

        // ===== ここが肝：すでに active (pending/paid) があるなら弾く =====
        const { data: active, error: activeErr } = await admin
            .from("orders")
            .select("id,status,buyer_user_id")
            .eq("drop_id", drop.id)
            .in("status", ["pending", "paid"])
            .maybeSingle();

        if (activeErr) {
            return NextResponse.json({ ok: false, error: "orders_check_failed" }, { status: 500 });
        }
        if (active?.status === "paid") {
            return NextResponse.json({ ok: false, error: "sold_out" }, { status: 409 });
        }
        if (active?.status === "pending") {
            return NextResponse.json(
                { ok: false, error: "checkout_in_progress", order_id: active.id },
                { status: 409 }
            );
        }

        const siteUrl = resolveSiteUrl(req);

        // metadata は webhook と完全一致させる
        const md: Record<string, string> = {
            drop_id: drop.id,
            buyer_user_id: auth.user.id,
            seller_user_id: String(drop.user_id ?? ""),
        };
        const imp = String(body?.impression_id ?? "").trim();
        if (imp) md.impression_id = imp;

        // ===== 予約（pending order）を先に作って drop をロック =====
        const tmpSessionId = `tmp_${crypto.randomUUID()}`;
        const { data: order, error: insErr } = await admin
            .from("orders")
            .insert({
                drop_id: drop.id,
                buyer_user_id: auth.user.id,
                seller_user_id: String(drop.user_id ?? ""),
                status: "pending",
                stripe_session_id: tmpSessionId,
                stripe_payment_intent: null,
                paid_at: null,
            })
            .select("id")
            .single();

        if (insErr || !order) {
            // unique制約に当たったら誰かが先に予約した
            const code = (insErr as any)?.code;
            if (code === "23505") {
                return NextResponse.json({ ok: false, error: "checkout_in_progress" }, { status: 409 });
            }
            return NextResponse.json({ ok: false, error: "order_create_failed" }, { status: 500 });
        }

        const stripe = getStripe();

        // ===== Stripe Checkout 作成 =====
        let session;
        try {
            session = await stripe.checkout.sessions.create({
                mode: "payment",
                line_items: [
                    {
                        quantity: 1,
                        price_data: {
                            currency: "jpy",
                            unit_amount: Math.round(price),
                            product_data: {
                                name: drop.title ?? `Drop ${drop.id.slice(0, 8)}`,
                                metadata: { drop_id: drop.id },
                            },
                        },
                    },
                ],
                metadata: md,
                payment_intent_data: { metadata: md },
                client_reference_id: order.id, // 後でデバッグしやすい
                success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${siteUrl}/drops/${drop.id}?canceled=1`,
            });
        } catch (e: any) {
            // Stripe作成に失敗したら予約を解放
            await admin.from("orders").update({ status: "expired" }).eq("id", order.id);
            return NextResponse.json({ ok: false, error: e?.message ?? "stripe_error" }, { status: 500 });
        }

        // ===== 予約行を「本物の session.id」に置き換え =====
        const { error: upErr } = await admin
            .from("orders")
            .update({ stripe_session_id: session.id })
            .eq("id", order.id);

        if (upErr) {
            // 最悪ここで失敗しても、予約はpendingのまま残る（cronでexpireされる）
            return NextResponse.json({ ok: false, error: "order_link_failed" }, { status: 500 });
        }

        return NextResponse.json({ ok: true, url: session.url, id: session.id, order_id: order.id });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
    }
}
