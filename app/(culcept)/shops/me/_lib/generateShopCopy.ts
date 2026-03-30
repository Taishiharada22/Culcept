// app/shops/me/_lib/generateShopCopy.ts
import "server-only";

import { runAI } from "@/lib/ai";
import type { SiteFacts } from "./extractSiteFacts";

export type ShopGen = {
    headline: string;
    intro: string;
    suggested_tags: string[];
    address_text: string | null;
    hero_image_url: string | null;

    // ✅ タグごとの強み（0-100）: 一般公開で見せる用
    tag_scores?: Record<string, number>;
};

function normalizeTags(tags: string[]) {
    const norm = tags
        .map((t) => String(t || "").trim().toLowerCase())
        .map((t) => t.replace(/[^\p{L}\p{N}_-]+/gu, "-"))
        .map((t) => t.replace(/^-+|-+$/g, ""))
        .filter(Boolean)
        .slice(0, 20);
    return Array.from(new Set(norm));
}

function clampScore(n: unknown) {
    const x = Math.round(Number(n));
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(100, x));
}

function normalizeScoreMap(raw: unknown): Record<string, number> {
    if (!raw) return {};
    if (Array.isArray(raw)) {
        const out: Record<string, number> = {};
        for (const it of raw as any[]) {
            const tag = String((it as any)?.tag ?? "").trim().toLowerCase();
            if (!tag) continue;
            out[tag] = clampScore((it as any)?.score);
        }
        return out;
    }
    if (typeof raw === "object") {
        const out: Record<string, number> = {};
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
            const tag = String(k ?? "").trim().toLowerCase();
            if (!tag) continue;
            out[tag] = clampScore(v);
        }
        return out;
    }
    return {};
}

function fillScoresFromTags(tags: string[], fallback = 50): Record<string, number> {
    const out: Record<string, number> = {};
    for (const t of normalizeTags(tags)) out[t] = clampScore(fallback);
    return out;
}

function fallbackGenerate(f: SiteFacts): ShopGen {
    const headline =
        (f.og.title || f.jsonld.name || "古着ショップ").slice(0, 60);
    const base =
        f.og.description ||
        f.jsonld.description ||
        "このお店の公式サイト情報をもとに、雰囲気や特徴をまとめました。";
    const intro = String(base).trim().slice(0, 500);

    const seed = `${headline} ${intro}`.toLowerCase();
    const tags: string[] = [];
    if (seed.includes("vintage") || seed.includes("ヴィンテージ")) tags.push("vintage");
    if (seed.includes("street") || seed.includes("ストリート")) tags.push("street");
    if (seed.includes("designer") || seed.includes("デザイナー")) tags.push("designer");
    tags.push("furugi");

    const suggested_tags = normalizeTags(tags);

    return {
        headline,
        intro,
        suggested_tags,
        address_text: f.jsonld.addressText || null,
        hero_image_url: f.og.image || null,
        tag_scores: fillScoresFromTags(suggested_tags, 50),
    };
}

const SHOP_COPY_JSON_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: [
        "headline",
        "intro",
        "suggested_tags",
        "address_text",
        "hero_image_url",
        "tag_scores",
    ],
    properties: {
        headline: { type: "string", minLength: 1, maxLength: 60 },
        intro: { type: "string", minLength: 1, maxLength: 700 },
        suggested_tags: {
            type: "array",
            minItems: 1,
            maxItems: 12,
            items: { type: "string", minLength: 1, maxLength: 32 },
        },
        address_text: { anyOf: [{ type: "string", maxLength: 200 }, { type: "null" }] },
        hero_image_url: { anyOf: [{ type: "string", maxLength: 500 }, { type: "null" }] },
        tag_scores: { type: "object" },
    },
} satisfies Record<string, unknown>;

async function generateWithGemini(f: SiteFacts): Promise<ShopGen> {
    const model =
        (process.env.GEMINI_MODEL_DEFAULT ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash").trim();

    const facts = {
        og: f.og,
        jsonld: f.jsonld,
        finalUrl: f.finalUrl,
    };

    const system = `
あなたは古着ショップの紹介ページを作る編集者です。
入力は公式サイトから抽出した「事実」だけです。
禁止：原文の丸写し、長い引用。
出力：必ずJSONのみ。
`;

    const user = `
次の facts を元に、Aneurasync掲載用の文章とタグ候補を作って。
- headline: 30-50文字（雰囲気＋売り）
- intro: 200-350文字（要約＋再編集）
- suggested_tags: 5-12個（英小文字・短い）
- tag_scores: suggested_tags の各タグに対して 0-100 の強みスコア（数字のみ。例: {"vintage":82,...}）
- address_text: 住所っぽい文字列が取れたら（無ければnull）
- hero_image_url: og:imageがあれば入れて（無ければnull）
facts: ${JSON.stringify(facts)}
`;

    const result = await runAI({
        taskType: "shop_copy_generation",
        prompt: user.trim(),
        systemPrompt: system.trim(),
        jsonSchema: SHOP_COPY_JSON_SCHEMA,
        requireJson: true,
        preferredProvider: "gemini",
        allowFallback: false,
        temperature: 0.3,
        maxOutputTokens: 1024,
        metadata: {
            skipCache: true,
            userFacing: false,
            providerModel: model,
        },
    });

    if (!result.success) {
        throw new Error(result.errorMessage ?? "gemini_generation_failed");
    }

    const out =
        result.structured && typeof result.structured === "object" && !Array.isArray(result.structured)
            ? (result.structured as Record<string, unknown>)
            : JSON.parse(result.text);

    const fb = fallbackGenerate(f);

    const headline = String(out?.headline ?? "").trim().slice(0, 60) || fb.headline;
    const intro = String(out?.intro ?? "").trim().slice(0, 700) || fb.intro;

    const suggested_tags = normalizeTags(Array.isArray(out?.suggested_tags) ? out.suggested_tags : []);
    const address_text = out?.address_text ? String(out.address_text).trim().slice(0, 200) : null;
    const hero_image_url = out?.hero_image_url ? String(out.hero_image_url).trim().slice(0, 500) : (f.og.image || null);

    const tag_scores_raw = out?.tag_scores;
    const tag_scores_norm = normalizeScoreMap(tag_scores_raw);
    const tag_scores =
        suggested_tags.length
            ? Object.keys(tag_scores_norm).length
                ? tag_scores_norm
                : fillScoresFromTags(suggested_tags, 50)
            : fb.tag_scores;

    return {
        headline,
        intro,
        suggested_tags: suggested_tags.length ? suggested_tags : fb.suggested_tags,
        address_text: address_text || f.jsonld.addressText || null,
        hero_image_url,
        tag_scores,
    };
}

export async function generateShopCopy(f: SiteFacts): Promise<ShopGen> {
    try {
        return await generateWithGemini(f);
    } catch {
        // 落ちたらフォールバック
    }
    return fallbackGenerate(f);
}
