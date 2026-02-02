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

const supabaseAdmin = createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
);

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
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
            return NextResponse.json({ ok: false, error: "not_signed_in" }, { status: 401 });
        }

        const body = (await req.json().catch(() => null)) as Body | null;
        const dropId = String(body?.drop_id ?? "").trim();
        if (!dropId) return NextResponse.json({ ok: false, error: "invalid_drop_id" }, { status: 400 });

        // drop 取得（sold_at を必ず取る）
        const { data: drop, error: dropErr } = await supabase
            .from("drops")
            .select("id,title,price,user_id,sale_mode,auction_status,sold_at")
            .eq("id", dropId)
            .maybeSingle();

        if (dropErr || !drop) return NextResponse.json({ ok: false, error: "drop_not_found" }, { status: 404 });

        if (drop.sale_mode === "auction") {
            return NextResponse.json({ ok: false, error: "auction_not_supported_yet" }, { status: 400 });
        }

        // ✅ SOLD判定（drop.sold_at OR paid order）
        if (drop.sold_at) {
            return NextResponse.json({ ok: false, error: "sold_out" }, { status: 409 });
        }

        const { data: paidExist, error: paidErr } = await supabase
            .from("orders")
            .select("id")
            .eq("drop_id", drop.id)
            .eq("status", "paid")
            .limit(1)
            .maybeSingle();

        if (paidErr) return NextResponse.json({ ok: false, error: "failed_to_check_sold" }, { status: 500 });
        if (paidExist) {
            return NextResponse.json({ ok: false, error: "sold_out" }, { status: 409 });
        }

        // 自分の出品は買えない
        if (String(drop.user_id) === auth.user.id) {
            return NextResponse.json({ ok: false, error: "cannot_buy_own_drop" }, { status: 400 });
        }

        const price = Number(drop.price ?? 0);
        if (!Number.isFinite(price) || price <= 0) {
            return NextResponse.json({ ok: false, error: "invalid_price" }, { status: 400 });
        }

        const siteUrl = resolveSiteUrl(req);

        const md: Record<string, string> = {
            drop_id: drop.id,
            buyer_user_id: auth.user.id,
            seller_user_id: String(drop.user_id ?? ""),
        };
        const imp = String(body?.impression_id ?? "").trim();
        if (imp) md.impression_id = imp;

        const stripe = getStripe();

        const session = await stripe.checkout.sessions.create({
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
            success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${siteUrl}/drops/${drop.id}?canceled=1`,
        });

        // ✅ orders に pending 作成（webhook が確実に拾う）
        const up = await supabaseAdmin.from("orders").upsert(
            {
                drop_id: drop.id,
                buyer_user_id: auth.user.id,
                seller_user_id: String(drop.user_id ?? ""),
                status: "pending",
                amount_total: Math.round(price),
                currency: "jpy",
                stripe_session_id: session.id,
                // impression_id はテーブルにあれば入る（無ければ無視される）
                ...(imp ? { impression_id: imp } : {}),
            } as any,
            { onConflict: "stripe_session_id" }
        );

        if (up.error) {
            // Session は作れてるが order 作れないと webhook が拾えないのでここは落とす
            return NextResponse.json({ ok: false, error: "failed_to_create_order" }, { status: 500 });
        }

        return NextResponse.json({ ok: true, url: session.url, id: session.id });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
    }
}
