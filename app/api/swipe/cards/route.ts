// app/api/swipe/cards/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = {
    card_id: string;
    image_url: string;
    tags: string[] | null;
    is_active: boolean | null;
    created_at: string | null;
};

type SwipeCard = {
    card_id: string;
    image_url: string;
    tags?: string[] | null;
    is_active?: boolean;
    created_at?: string | null;
};

function asInt(v: string | null, def = 24) {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.max(1, Math.min(200, Math.floor(n)));
}

function uniq<T>(arr: T[]) {
    return Array.from(new Set(arr));
}

function shuffle<T>(arr: T[]) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// public/cards に実在するかチェック（symlinkでもOK）
function existsInPublicCards(filename: string): boolean {
    if (!filename) return false;
    const p = path.join(process.cwd(), "public", "cards", filename);
    try {
        return fs.existsSync(p);
    } catch {
        return false;
    }
}

// /cards/xxx.png を受けて、「実在する」候補URLに寄せる
function resolveCardsUrl(inputUrlOrId: string): { url: string; cardId: string } | null {
    const raw = String(inputUrlOrId || "").trim();
    if (!raw) return null;

    // 1) まず filename を抽出
    let filename = raw;

    // "/cards/xxx.png" 形式なら basename に
    if (filename.includes("/")) {
        // URL decode
        try {
            filename = decodeURIComponent(filename);
        } catch {
            // ignore
        }
        filename = filename.split("?")[0];
        filename = filename.substring(filename.lastIndexOf("/") + 1);
    }

    if (!filename.toLowerCase().endsWith(".png")) {
        filename = `${filename}.png`;
    }

    const base = filename.replace(/\.png$/i, "");
    const baseVariants = uniq([
        base,
        base.replace(/-/g, "_"),
        base.replace(/_/g, "-"),
        base.replace(/\s+/g, "_"),
    ]);

    const fileCandidates: string[] = [];

    for (const b of baseVariants) {
        fileCandidates.push(`${b}.png`);

        // 末尾が _2 / -2 の場合は _2_2 も試す
        if (/_2$/i.test(b)) fileCandidates.push(`${b}_2.png`); // まず _2_2 の前段を吸収
        if (/-2$/i.test(b)) fileCandidates.push(`${b.replace(/-2$/i, "_2")}_2.png`);

        // よくあるパターン： "_2" → "_2_2"
        if (/_2$/i.test(b)) fileCandidates.push(`${b}_2.png`); // b = "..._2" => "..._2_2.png"
        if (/-2$/i.test(b)) fileCandidates.push(`${b.replace(/-2$/i, "_2")}_2.png`);

        // suffix 無しでも "_2_2" / "_2" を試す
        if (!/_2(_2)?$/i.test(b) && !/-2$/i.test(b)) {
            fileCandidates.push(`${b}_2_2.png`);
            fileCandidates.push(`${b}_2.png`);
        }

        // すでに _2_2 が含まれてるなら、そのままも優先
        if (/_2_2$/i.test(b)) fileCandidates.push(`${b}.png`);
    }

    const candidates = uniq(fileCandidates);

    // 2) 実在する最初の候補を返す
    for (const f of candidates) {
        if (existsInPublicCards(f)) {
            const cid = f.replace(/\.png$/i, "");
            return { url: `/cards/${f}`, cardId: cid };
        }
    }

    return null;
}

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const limit = asInt(url.searchParams.get("limit"), 24);
        const fetchN = Math.min(200, Math.max(limit * 4, limit));

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceKey) {
            return NextResponse.json(
                { ok: false, error: "Missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" },
                { status: 200, headers: { "Cache-Control": "no-store" } }
            );
        }

        const supabase = createClient(supabaseUrl, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });

        // curated_cards から引く（必要に応じてテーブル名は合わせて）
        const { data, error } = await supabase
            .from("curated_cards")
            .select("card_id,image_url,tags,is_active,created_at")
            .eq("is_active", true)
            .limit(fetchN);

        if (error) {
            return NextResponse.json(
                { ok: false, error: `supabase error: ${error.message}` },
                { status: 200, headers: { "Cache-Control": "no-store" } }
            );
        }

        const rows = (data ?? []) as Row[];

        // 返却前に「実在するURL」に寄せる
        const out: SwipeCard[] = [];
        for (const r of shuffle(rows)) {
            const resolved =
                resolveCardsUrl(r.image_url) ??
                resolveCardsUrl(r.card_id); // image_url が壊れてても card_id から救済

            if (!resolved) continue;

            out.push({
                card_id: resolved.cardId,
                image_url: resolved.url,
                tags: Array.isArray(r.tags) ? r.tags.filter((x) => typeof x === "string") : [],
                is_active: r.is_active ?? true,
                created_at: r.created_at ?? null,
            });

            if (out.length >= limit) break;
        }

        return NextResponse.json(
            { ok: true, cards: out },
            { status: 200, headers: { "Cache-Control": "no-store" } }
        );
    } catch (e: any) {
        return NextResponse.json(
            { ok: false, error: String(e?.message ?? e) },
            { status: 200, headers: { "Cache-Control": "no-store" } }
        );
    }
}
