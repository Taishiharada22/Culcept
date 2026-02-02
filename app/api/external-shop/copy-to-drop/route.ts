// app/api/external-shop/copy-to-drop/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

function toNumberOrNull(v: any): number | null {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
    const body = await req.json().catch(() => null);
    const externalProductId = body?.externalProductId as string | undefined;

    if (!externalProductId || typeof externalProductId !== "string") {
        return NextResponse.json({ ok: false, error: "missing externalProductId" }, { status: 400 });
    }

    const sb = await supabaseServer();
    const { data: userRes, error: userErr } = await sb.auth.getUser();
    const user = userRes?.user;
    if (userErr || !user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    // external_products 取得
    const { data: ext, error: extErr } = await sb
        .from("external_products")
        .select("id, shop_id, source_url, product_url, title, description, price, currency, availability, image_urls, brand, sku, fetched_at")
        .eq("id", externalProductId)
        .single();

    if (extErr || !ext) {
        return NextResponse.json(
            { ok: false, error: "external_product_not_found", detail: extErr?.message ?? null },
            { status: 404 }
        );
    }

    // shop 所有チェック
    const { data: shop, error: shopErr } = await sb
        .from("external_shops")
        .select("id, owner_user_id")
        .eq("id", ext.shop_id)
        .single();

    if (shopErr || !shop) {
        return NextResponse.json(
            { ok: false, error: "external_shop_not_found", detail: shopErr?.message ?? null },
            { status: 404 }
        );
    }
    if (shop.owner_user_id !== user.id) {
        return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    // 既にあるか（DB unique があるので、ここはUX用の事前確認）
    const { data: existing } = await sb
        .from("drops")
        .select("id")
        .eq("external_product_id", ext.id)
        .maybeSingle();

    if (existing?.id) {
        return NextResponse.json({ ok: true, already: true, dropId: existing.id });
    }

    const nowIso = new Date().toISOString();

    // drops insert（あなたのdrops必須列に合わせて必要なら追加）
    const payload: any = {
        owner_user_id: user.id,
        is_public: false,

        title: ext.title ?? "(Imported item)",
        description: ext.description ?? null,
        price: toNumberOrNull(ext.price),
        currency: ext.currency ?? null,
        availability: ext.availability ?? null,
        image_urls: Array.isArray(ext.image_urls) ? ext.image_urls : [],

        external_product_id: ext.id,
        external_shop_id: ext.shop_id,
        external_source_url: ext.source_url ?? ext.product_url ?? null,
        external_imported_at: ext.fetched_at ?? nowIso,
    };

    const { data: created, error: createErr } = await sb
        .from("drops")
        .insert(payload)
        .select("id")
        .single();

    if (createErr || !created?.id) {
        return NextResponse.json(
            { ok: false, error: "drop_create_failed", detail: createErr?.message ?? null },
            { status: 500 }
        );
    }

    return NextResponse.json({ ok: true, already: false, dropId: created.id });
}
