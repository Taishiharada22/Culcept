import "server-only";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { drop_id: string };

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

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

        const { data: drop, error } = await supabase
            .from("drops")
            .select("id,title,price,user_id,sale_mode,auction_status")
            .eq("id", dropId)
            .maybeSingle();

        if (error || !drop) return NextResponse.json({ ok: false, error: "drop_not_found" }, { status: 404 });

        // MVP: auctionは除外（必要なら後で拡張）
        if (drop.sale_mode === "auction") {
            return NextResponse.json({ ok: false, error: "auction_not_supported_yet" }, { status: 400 });
        }

        const price = Number(drop.price ?? 0);
        if (!Number.isFinite(price) || price <= 0) {
            return NextResponse.json({ ok: false, error: "invalid_price" }, { status: 400 });
        }

        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            currency: "jpy",
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
            // 誰が何を買ったかをWebhookで確定するためにmetadataを入れる
            metadata: {
                drop_id: drop.id,
                buyer_id: auth.user.id,
                seller_user_id: String(drop.user_id ?? ""),
            },
            success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${siteUrl}/drops/${drop.id}?canceled=1`,
        });

        return NextResponse.json({ ok: true, url: session.url, id: session.id });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
    }
}
