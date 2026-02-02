// app/shops/me/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateShopCopy } from "./_lib/generateShopCopy";
import { extractSiteFacts as fetchSiteFacts } from "./_lib/extractSiteFacts";

export type ShopActionState = {
    ok: boolean;
    error: string | null;
    message?: string | null;
    fieldErrors?: Record<string, string>;
    shopId?: string | null;
    slug?: string | null;
};

const BUCKET = "shops";

function isColumnMissingError(err: any) {
    const code = String(err?.code ?? "");
    const msg = String(err?.message ?? "");
    return code === "42703" || (msg.includes("column") && msg.includes("does not exist"));
}

function extractMissingColumnName(err: any): string | null {
    const msg = String(err?.message ?? "");
    const m = msg.match(/column "([^"]+)"(?: of relation "[^"]+")? does not exist/i);
    return m?.[1] ?? null;
}

function makeSlug(raw: string) {
    const base = String(raw ?? "")
        .toLowerCase()
        .trim()
        .replace(/['"]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);

    const rand = randomUUID().replace(/[^a-z0-9]/gi, "").slice(0, 8);
    return base || `shop-${rand}`;
}

function normalizeUrl(raw: string) {
    const x = String(raw ?? "").trim();
    if (!x) return "";
    try {
        const u = new URL(x);
        if (u.protocol === "http:" || u.protocol === "https:") return x;
        return "";
    } catch {
        try {
            const u = new URL("https://" + x);
            if (u.protocol === "http:" || u.protocol === "https:") return "https://" + x;
            return "";
        } catch {
            return "";
        }
    }
}

function parseStyleTags(v: unknown): string[] {
    const s = String(v ?? "").trim();
    if (!s) return [];

    if (s.startsWith("[") && s.endsWith("]")) {
        try {
            const arr = JSON.parse(s);
            if (Array.isArray(arr)) {
                return Array.from(
                    new Set(
                        arr
                            .map((x) => String(x).trim().toLowerCase())
                            .filter(Boolean)
                            .slice(0, 20)
                    )
                );
            }
        } catch { }
    }

    return Array.from(
        new Set(
            s
                .split(/[,\n]/g)
                .map((x) => x.trim().toLowerCase())
                .filter(Boolean)
                .slice(0, 20)
        )
    );
}

function extFromMime(mime: string) {
    const m = String(mime || "").toLowerCase();
    if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
    if (m.includes("png")) return "png";
    if (m.includes("webp")) return "webp";
    if (m.includes("gif")) return "gif";
    return "bin";
}

function pickFile(formData: FormData, key: string): File | null {
    const f = formData.get(key);
    return f instanceof File && f.size > 0 ? f : null;
}

function coerceFormData(arg1: any, arg2?: any): FormData | null {
    const a = arg1 as any;
    if (a && typeof a.get === "function" && typeof a.getAll === "function") return a as FormData;
    const b = arg2 as any;
    if (b && typeof b.get === "function" && typeof b.getAll === "function") return b as FormData;
    return null;
}

function clampScore(n: any) {
    const x = Math.round(Number(n));
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(100, x));
}

function normalizeScoreMap(raw: any): Record<string, number> {
    if (!raw) return {};
    if (Array.isArray(raw)) {
        const out: Record<string, number> = {};
        for (const it of raw) {
            const tag = String(it?.tag ?? "").trim().toLowerCase();
            if (!tag) continue;
            out[tag] = clampScore(it?.score);
        }
        return out;
    }
    if (typeof raw === "object") {
        const out: Record<string, number> = {};
        for (const [k, v] of Object.entries(raw)) {
            const tag = String(k ?? "").trim().toLowerCase();
            if (!tag) continue;
            out[tag] = clampScore(v);
        }
        return out;
    }
    return {};
}

function reconcileScores(scoreMap: Record<string, number>, tags: string[], fallback = 50): Record<string, number> {
    const next: Record<string, number> = {};
    const set = new Set(tags.map((t) => String(t ?? "").trim().toLowerCase()).filter(Boolean));
    for (const t of set) {
        next[t] = t in scoreMap ? clampScore(scoreMap[t]) : clampScore(fallback);
    }
    return next;
}

async function safeUpsertShop(params: { shopId: string | null; ownerId: string; values: Record<string, any> }) {
    const { shopId, ownerId } = params;
    let values = { ...params.values };

    const minimal = {
        owner_id: ownerId,
        slug: values.slug ?? makeSlug(values.name_ja ?? "shop"),
        name_ja: values.name_ja ?? "New Shop",
        name_en: values.name_en ?? null,
        headline: values.headline ?? null,
        avatar_url: values.avatar_url ?? null,
        banner_url: values.banner_url ?? null,
        cover_url: values.cover_url ?? null,
        style_tags: values.style_tags ?? [],
        is_active: typeof values.is_active === "boolean" ? values.is_active : false,
        status: values.status ?? "draft",
        // NOT NULL 列がある環境向けに保険（列が無ければ safe が削る）
        style_scores: values.style_scores ?? values.tag_scores ?? {},
        tag_scores: values.tag_scores ?? {},
        quality: values.quality ?? 0.5,
    };

    const attemptUpdate = async (v: Record<string, any>) =>
        supabaseAdmin.from("shops").update(v as any).eq("id", shopId as string).eq("owner_id", ownerId).select("id, slug").maybeSingle();

    const attemptInsert = async (v: Record<string, any>) =>
        supabaseAdmin.from("shops").insert(v as any).select("id, slug").maybeSingle();

    for (let i = 0; i < 5; i++) {
        const { data, error } = shopId ? await attemptUpdate(values) : await attemptInsert(values);
        if (!error) return { data, error: null };

        if (isColumnMissingError(error)) {
            const missing = extractMissingColumnName(error);
            if (missing && missing in values) {
                const next = { ...values };
                delete next[missing];
                values = next;
                continue;
            }
            const { data: d2, error: e2 } = shopId ? await attemptUpdate(minimal) : await attemptInsert(minimal);
            return { data: d2, error: e2 ?? null };
        }

        return { data: null, error };
    }

    const { data: d2, error: e2 } = shopId ? await attemptUpdate(minimal) : await attemptInsert(minimal);
    return { data: d2, error: e2 ?? null };
}

async function safeUpdateShopById(params: { shopId: string; ownerId: string; values: Record<string, any> }) {
    const { shopId, ownerId } = params;
    let values = { ...params.values };

    for (let i = 0; i < 5; i++) {
        const { error } = await supabaseAdmin.from("shops").update(values as any).eq("id", shopId).eq("owner_id", ownerId);

        if (!error) return { error: null };

        if (isColumnMissingError(error)) {
            const missing = extractMissingColumnName(error);
            if (missing && missing in values) {
                const next = { ...values };
                delete next[missing];
                values = next;
                continue;
            }
        }
        return { error };
    }
    return { error: { message: "update failed (retries exceeded)" } as any };
}

async function tryUploadShopImage(ownerId: string, shopId: string, kind: "avatar" | "banner", file: File) {
    try {
        const mime = String(file.type || "application/octet-stream");
        const ext = extFromMime(mime);
        const rand = randomUUID().replace(/[^a-z0-9]/gi, "").slice(0, 10);
        const path = `${ownerId}/${shopId}/${kind}-${rand}.${ext}`;
        const buf = Buffer.from(await file.arrayBuffer());

        const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, buf, {
            contentType: mime,
            upsert: true,
            cacheControl: "3600",
        });
        if (upErr) return { publicUrl: null as string | null, warning: `画像(${kind})アップロード失敗: ${upErr.message}` };

        const pub = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
        const publicUrl = pub?.data?.publicUrl ?? null;
        if (!publicUrl) return { publicUrl: null as string | null, warning: `画像(${kind})URL取得失敗` };

        return { publicUrl, warning: null as string | null };
    } catch (e: any) {
        return { publicUrl: null as string | null, warning: `画像(${kind})処理失敗: ${String(e?.message ?? e)}` };
    }
}

function bumpParam() {
    return randomUUID().replace(/[^a-z0-9]/gi, "").slice(0, 10);
}

/** ✅ 新規Shop（draft）を追加して、その編集画面へ飛ばす */
export async function createShopDraftAction(_: FormData): Promise<void> {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) redirect("/login?next=/shops/me");

    const slug = makeSlug(`shop-${randomUUID().replace(/-/g, "").slice(0, 8)}`);

    // ✅ 新規は draft / inactive（公開は後でON）
    const base: any = {
        owner_id: user.id,
        slug,
        name_ja: "New Shop",
        name_en: null,
        url: null,
        external_url: null,
        source_url: null,
        is_active: false,
        status: "draft",
        shop_type: "curated",
        style_tags: [],
        socials: {},
        tag_scores: {},
        style_scores: {},
        quality: 0.5,
    };

    let values = { ...base };
    for (let i = 0; i < 5; i++) {
        const { data, error } = await supabaseAdmin.from("shops").insert(values as any).select("id").maybeSingle();
        if (!error && data?.id) {
            redirect(`/shops/me?shop_id=${encodeURIComponent(String(data.id))}&reset=1&v=${bumpParam()}`);
        }
        if (error && isColumnMissingError(error)) {
            const missing = extractMissingColumnName(error);
            if (missing && missing in values) {
                const next = { ...values };
                delete next[missing];
                values = next;
                continue;
            }
        }
        redirect("/shops/me?error=" + encodeURIComponent(error?.message ?? "Failed to create shop"));
    }

    redirect("/shops/me?error=" + encodeURIComponent("Failed to create shop"));
}

/**
 * ✅ URLだけ手入力して保存（あなたの要件：URLだけ手で入れる）
 * 成功時は redirect して画面を確実に更新（AI生成ボタンが出ない/反映されない問題を潰す）
 */
export async function updateShopUrlOnlyAction(formData: FormData): Promise<ShopActionState> {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) redirect("/login?next=/shops/me");

    const shopId = String(formData.get("shop_id") ?? "").trim();
    if (!shopId) return { ok: false, error: "shop_id がありません" };

    const urlRaw = String(formData.get("url") ?? "").trim();
    const url = urlRaw ? normalizeUrl(urlRaw) : "";
    if (!url) return { ok: false, error: "Website URL が不正（http/https）です。" };

    const patch: Record<string, any> = {
        url,
        external_url: url,
        source_url: url,
    };

    const { error: upErr } = await safeUpdateShopById({
        shopId,
        ownerId: user.id,
        values: patch,
    });

    if (upErr) return { ok: false, error: String((upErr as any)?.message ?? upErr) };

    revalidatePath("/shops");
    revalidatePath("/shops/me");

    redirect(`/shops/me?shop_id=${encodeURIComponent(shopId)}&saved=1&note=url_saved&v=${bumpParam()}`);
}

export async function updateMyShopAction(arg1: any, arg2?: any): Promise<ShopActionState> {
    const formData = coerceFormData(arg1, arg2);
    if (!formData) return { ok: false, error: "FormData が取得できませんでした。" };

    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) redirect("/login?next=/shops/me");

    const fieldErrors: Record<string, string> = {};

    const shopId = String(formData.get("shop_id") ?? "").trim() || null;
    if (!shopId) return { ok: false, error: "shop_id がありません（新規Shopを作ってから編集して）" };

    const name_ja = String(formData.get("name_ja") ?? "").trim();
    if (!name_ja) fieldErrors.name_ja = "ショップ名（日本語）は必須。";

    const name_en = String(formData.get("name_en") ?? "").trim();
    const headline = String(formData.get("headline") ?? "").trim();
    const bio = String(formData.get("bio") ?? "").trim();

    const urlRaw = String(formData.get("external_url") ?? formData.get("url") ?? "").trim();
    const url = urlRaw ? normalizeUrl(urlRaw) : "";
    if (urlRaw && !url) fieldErrors.url = "Website が不正（http/https）。";

    const address_text = String(formData.get("address_text") ?? "").trim() || "";
    const is_active = formData.get("is_active") ? true : false;

    const slugRaw = String(formData.get("slug") ?? "").trim();
    const slug = makeSlug(slugRaw || name_ja);

    const style_tags = parseStyleTags(formData.get("style_tags"));

    let socials: any = {};
    try {
        const s = String(formData.get("socials") ?? "").trim();
        socials = s ? JSON.parse(s) : {};
    } catch {
        socials = {};
    }

    if (Object.keys(fieldErrors).length) {
        return { ok: false, error: "入力を確認して。", fieldErrors };
    }

    // ✅ 既存 score を維持しつつ、タグと整合
    let existingScoreMap: Record<string, number> = {};
    try {
        const { data: pre } = await supabaseAdmin.from("shops").select("*").eq("id", shopId).eq("owner_id", user.id).maybeSingle();
        existingScoreMap = normalizeScoreMap((pre as any)?.tag_scores ?? (pre as any)?.style_scores);
    } catch {
        existingScoreMap = {};
    }
    const nextScores = reconcileScores(existingScoreMap, style_tags, 50);

    const warns: string[] = [];

    const baseValues: Record<string, any> = {
        owner_id: user.id,
        slug,
        name_ja,
        name_en: name_en || null,
        headline: headline || null,
        bio: bio || null,

        external_url: url || null,
        url: url || null,

        source_url: url || null,
        address_text: address_text || null,

        style_tags,
        socials,
        is_active,

        status: is_active ? "published" : "draft",
        tag_scores: nextScores,
        style_scores: nextScores,
    };

    const { data: saved, error: saveErr } = await safeUpsertShop({
        shopId,
        ownerId: user.id,
        values: baseValues,
    });

    if (saveErr || !saved?.id) {
        return { ok: false, error: saveErr?.message ?? "Failed to save shop", fieldErrors };
    }

    const savedId = String(saved.id);
    const savedSlug = String(saved.slug ?? slug);

    const avatar = pickFile(formData, "avatar");
    const banner = pickFile(formData, "banner");

    if (avatar) {
        const res = await tryUploadShopImage(user.id, savedId, "avatar", avatar);
        if (res.warning) warns.push(res.warning);
        if (res.publicUrl) {
            const { error: e1 } = await supabaseAdmin.from("shops").update({ avatar_url: res.publicUrl } as any).eq("id", savedId);
            if (e1 && !isColumnMissingError(e1)) warns.push(`avatar_url 更新失敗: ${e1.message}`);
        }
    }

    if (banner) {
        const res = await tryUploadShopImage(user.id, savedId, "banner", banner);
        if (res.warning) warns.push(res.warning);
        if (res.publicUrl) {
            const { error: e2 } = await supabaseAdmin.from("shops").update({ banner_url: res.publicUrl } as any).eq("id", savedId);
            if (e2 && !isColumnMissingError(e2)) warns.push(`banner_url 更新失敗: ${e2.message}`);
        }
    }

    revalidatePath("/shops");
    revalidatePath("/shops/me");
    revalidatePath(`/shops/${savedSlug}`);

    redirect(
        `/shops/me?shop_id=${encodeURIComponent(savedId)}&saved=1&note=${encodeURIComponent(
            warns.length ? `saved_with_warns:${warns.join(" / ")}` : "saved"
        )}&v=${bumpParam()}`
    );
}

/** ✅ 公開ON/OFF（複数公開OKの前提：DB制約はSQLで落としてね） */
export async function toggleShopActiveAction(formData: FormData) {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) redirect("/login?next=/shops/me");

    const shopId = String(formData.get("shop_id") ?? "").trim();
    const nextActive = String(formData.get("next_active") ?? "0") === "1";
    if (!shopId) redirect("/shops/me?error=" + encodeURIComponent("shop_id がありません"));

    const { data: pre } = await supabaseAdmin.from("shops").select("slug").eq("id", shopId).eq("owner_id", user.id).maybeSingle();
    const slug = pre?.slug ? String(pre.slug).trim() : "";

    let values: any = {
        is_active: nextActive,
        status: nextActive ? "published" : "draft",
    };

    for (let i = 0; i < 5; i++) {
        const { error } = await supabaseAdmin.from("shops").update(values as any).eq("id", shopId).eq("owner_id", user.id);
        if (!error) break;

        if (isColumnMissingError(error)) {
            const missing = extractMissingColumnName(error);
            if (missing && missing in values) {
                const next = { ...values };
                delete next[missing];
                values = next;
                continue;
            }
        }
        redirect("/shops/me?error=" + encodeURIComponent(error.message));
    }

    revalidatePath("/shops");
    revalidatePath("/shops/me");
    if (slug) revalidatePath(`/shops/${slug}`);

    redirect(`/shops/me?shop_id=${encodeURIComponent(shopId)}&saved=1&note=active_toggled&v=${bumpParam()}`);
}

function cleanNameFromFacts(raw: string) {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    return s
        .replace(/\s*\|.*$/g, "")
        .replace(/\s*-\s*.*$/g, "")
        .replace(/\s*｜.*$/g, "")
        .replace(/\s*—\s*.*$/g, "")
        .trim()
        .slice(0, 60);
}

/** 画像URL抽出（factsやgenの候補から http(s) を拾う） */
function pickHttpUrl(...cands: any[]): string | null {
    const flat: any[] = [];
    const push = (x: any) => {
        if (!x) return;
        if (Array.isArray(x)) for (const y of x) push(y);
        else flat.push(x);
    };
    for (const c of cands) push(c);

    for (const it of flat) {
        if (!it) continue;

        if (typeof it === "string") {
            const s = it.trim();
            if (s.startsWith("http://") || s.startsWith("https://")) return s.slice(0, 500);
            continue;
        }

        if (typeof it === "object") {
            const s = String((it as any).url ?? (it as any).href ?? (it as any).src ?? (it as any).content ?? "").trim();
            if (s.startsWith("http://") || s.startsWith("https://")) return s.slice(0, 500);
        }
    }
    return null;
}

function pickBannerUrlFromFacts(facts: any): string | null {
    return pickHttpUrl(
        facts?.og?.image,
        facts?.og?.imageUrl,
        facts?.twitter?.image,
        facts?.twitter?.imageUrl,
        facts?.jsonld?.image,
        facts?.jsonld?.images,
        facts?.meta?.image,
        facts?.images
    );
}

function pickAvatarUrlFromFacts(facts: any): string | null {
    return pickHttpUrl(facts?.jsonld?.logo, facts?.og?.logo, facts?.icons, facts?.icon, facts?.favicon, facts?.meta?.icon, facts?.meta?.logo);
}

/**
 * ✅ URLから抽出 → AIで本文/タグ/画像 を生成 → shops に反映
 * 成功時は redirect してフォームを確実に再描画（「AI生成しても反映されない」を根絶）
 */
export async function generateMyShopFromWebsiteAction(formData: FormData): Promise<ShopActionState> {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) redirect("/login?next=/shops/me");

    const overwrite = String(formData.get("overwrite") ?? "0") === "1";
    const shopIdFromForm = String(formData.get("shop_id") ?? "").trim();
    if (!shopIdFromForm) return { ok: false, error: "shop_id がありません（生成対象が不明）" };

    const { data: shop, error: shopErr } = await supabaseAdmin.from("shops").select("*").eq("id", shopIdFromForm).eq("owner_id", user.id).maybeSingle();
    if (shopErr || !shop?.id) return { ok: false, error: shopErr?.message ?? "Shop not found" };

    const shopId = String((shop as any).id);
    const slug = String((shop as any).slug ?? "").trim();

    const rawUrl = String((shop as any).external_url ?? (shop as any).url ?? "").trim();
    const siteUrl = rawUrl ? normalizeUrl(rawUrl) : "";
    if (!siteUrl) return { ok: false, error: "公式サイトURLが未設定です（URL保存してからAI生成して）。" };

    let facts: any;
    try {
        facts = await fetchSiteFacts(siteUrl);
    } catch (e: any) {
        return { ok: false, error: `公式サイト取得/抽出に失敗: ${String(e?.message ?? e)}` };
    }

    let gen: any;
    try {
        gen = await generateShopCopy(facts);
    } catch (e: any) {
        return { ok: false, error: `AI生成に失敗: ${String(e?.message ?? e)}` };
    }

    const currentNameJa = String((shop as any).name_ja ?? "").trim();
    const currentHeadline = String((shop as any).headline ?? "").trim();
    const currentBio = String((shop as any).bio ?? "").trim();
    const currentBanner = String((shop as any).banner_url ?? "").trim();
    const currentAvatar = String((shop as any).avatar_url ?? "").trim();
    const currentAddress = String((shop as any).address_text ?? "").trim();

    const inferredName =
        cleanNameFromFacts((facts as any)?.jsonld?.name) ||
        cleanNameFromFacts((facts as any)?.og?.siteName) ||
        cleanNameFromFacts((facts as any)?.og?.title) ||
        "";

    const nextNameJa = overwrite ? inferredName || currentNameJa : currentNameJa || inferredName || "";
    const nextHeadline = overwrite ? gen.headline || "" : currentHeadline || gen.headline || "";
    const nextBio = overwrite ? gen.intro || "" : currentBio || gen.intro || "";

    const suggested = Array.isArray(gen.suggested_tags) ? gen.suggested_tags : [];
    const genScores = normalizeScoreMap(gen.tag_scores ?? gen.style_scores);
    const baseTags = suggested.length ? suggested : Array.isArray((shop as any).style_tags) ? (shop as any).style_tags : [];
    const nextScores = reconcileScores(genScores, baseTags, 50);

    // ✅ 画像候補（facts優先 + genが返せばそれも）
    const bannerFromFacts = pickBannerUrlFromFacts(facts);
    const avatarFromFacts = pickAvatarUrlFromFacts(facts);
    const bannerFromGen = pickHttpUrl(gen?.hero_image_url, gen?.banner_url, gen?.cover_url);
    const avatarFromGen = pickHttpUrl(gen?.logo_url, gen?.avatar_url);

    const patch: Record<string, any> = {
        name_ja: (nextNameJa ? nextNameJa.slice(0, 80) : "New Shop") || "New Shop",
        headline: nextHeadline ? nextHeadline.slice(0, 120) : null,
        bio: nextBio ? nextBio.slice(0, 3000) : null,
        source_url: (facts as any).finalUrl || (facts as any).sourceUrl || siteUrl,

        suggested_tags: suggested,
        tag_scores: nextScores,
        style_scores: nextScores,
    };

    // ✅ 画像：未設定なら自動セット。overwrite=1 なら上書きOK
    if ((overwrite || !currentBanner) && (bannerFromGen || bannerFromFacts)) {
        const v = String(bannerFromGen || bannerFromFacts).slice(0, 500);
        patch.banner_url = v;
        patch.cover_url = v; // cover_url もある環境向け
    }
    if ((overwrite || !currentAvatar) && (avatarFromGen || avatarFromFacts)) {
        patch.avatar_url = String(avatarFromGen || avatarFromFacts).slice(0, 500);
    }

    if (!currentAddress && gen?.address_text) patch.address_text = String(gen.address_text).slice(0, 200);

    const { error: upErr } = await safeUpdateShopById({
        shopId,
        ownerId: user.id,
        values: patch,
    });

    if (upErr) return { ok: false, error: String((upErr as any)?.message ?? upErr) };

    revalidatePath("/shops");
    revalidatePath("/shops/me");
    if (slug) revalidatePath(`/shops/${slug}`);

    redirect(`/shops/me?shop_id=${encodeURIComponent(shopId)}&saved=1&note=ai_done&v=${bumpParam()}`);
}

/**
 * ✅ 1フォームで「URL保存」「AI生成」「通常保存」を切り替える
 * ShopFormはこれ1つだけ action に指定すればOK
 */
export async function shopFormAction(arg1: any, arg2?: any): Promise<ShopActionState> {
    const formData = coerceFormData(arg1, arg2);
    if (!formData) return { ok: false, error: "FormData が取得できませんでした。" };

    const intent = String(formData.get("_intent") ?? "").trim();
    if (intent === "save_url") return updateShopUrlOnlyAction(formData);
    if (intent === "ai_generate") return generateMyShopFromWebsiteAction(formData);
    return updateMyShopAction(formData);
}

export async function approveSuggestedTagsAction(formData: FormData): Promise<ShopActionState> {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) redirect("/login?next=/shops/me");

    const rawShopId = String(formData.get("shop_id") ?? "").trim();
    if (!rawShopId) return { ok: false, error: "shop_id がありません" };

    const picked = formData
        .getAll("tag")
        .map((x) => String(x).trim().toLowerCase())
        .filter(Boolean);

    const { data: shop, error: sErr } = await supabaseAdmin.from("shops").select("*").eq("id", rawShopId).eq("owner_id", user.id).maybeSingle();
    if (sErr || !shop?.id) return { ok: false, error: sErr?.message ?? "Shop not found" };

    const cur = Array.isArray((shop as any).style_tags) ? (shop as any).style_tags : [];
    const merged = Array.from(new Set([...cur, ...picked])).slice(0, 20);

    const existingScores = normalizeScoreMap((shop as any).tag_scores ?? (shop as any).style_scores);
    const nextScores = reconcileScores(existingScores, merged, 50);

    const { error: upErr } = await safeUpdateShopById({
        shopId: rawShopId,
        ownerId: user.id,
        values: { style_tags: merged, suggested_tags: [], tag_scores: nextScores, style_scores: nextScores } as any,
    });

    if (upErr) return { ok: false, error: String((upErr as any)?.message ?? upErr) };

    revalidatePath("/shops");
    revalidatePath("/shops/me");
    if ((shop as any).slug) revalidatePath(`/shops/${(shop as any).slug}`);

    redirect(`/shops/me?shop_id=${encodeURIComponent(rawShopId)}&saved=1&note=tags_approved&v=${bumpParam()}`);
}

export async function bulkUpdateShopTagsAction(formData: FormData): Promise<void> {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) redirect("/login?next=/shops/me");

    const returnShopId = String(formData.get("return_shop_id") ?? "").trim();

    const scopeAll = String(formData.get("scope_all") ?? "") === "1";
    const targets = formData
        .getAll("target_shop_id")
        .map((x) => String(x).trim())
        .filter(Boolean);

    const mode = String(formData.get("mode") ?? "add");
    const tags = parseStyleTags(formData.get("tags"));

    if (!tags.length) {
        redirect(`/shops/me?shop_id=${encodeURIComponent(returnShopId)}&error=${encodeURIComponent("no_tags")}`);
    }

    const q = supabaseAdmin.from("shops").select("*").eq("owner_id", user.id).order("created_at", { ascending: false }).limit(50);
    const { data: rows, error } = scopeAll ? await q : await q.in("id", targets);

    if (error) {
        redirect(`/shops/me?shop_id=${encodeURIComponent(returnShopId)}&error=${encodeURIComponent(error.message)}`);
    }

    const shops = (rows ?? []) as any[];

    if (!scopeAll && !targets.length) {
        redirect(`/shops/me?shop_id=${encodeURIComponent(returnShopId)}&error=${encodeURIComponent("対象Shopが選択されていません")}`);
    }

    for (const s of shops) {
        const sid = String(s?.id ?? "");
        if (!sid) continue;

        const curTags = Array.isArray(s?.style_tags) ? (s.style_tags as string[]) : [];
        let next: string[] = curTags;

        if (mode === "replace") {
            next = tags;
        } else if (mode === "remove") {
            const rm = new Set(tags);
            next = curTags.filter((t) => !rm.has(String(t ?? "").trim().toLowerCase()));
        } else {
            next = Array.from(new Set([...curTags.map((x) => String(x ?? "").trim().toLowerCase()), ...tags])).filter(Boolean);
        }

        next = next.slice(0, 20);

        const existingScores = normalizeScoreMap(s?.tag_scores ?? s?.style_scores);
        const nextScores = reconcileScores(existingScores, next, 50);

        const { error: upErr } = await safeUpdateShopById({
            shopId: sid,
            ownerId: user.id,
            values: { style_tags: next, tag_scores: nextScores, style_scores: nextScores } as any,
        });

        if (upErr) continue;

        const slug = String(s?.slug ?? "").trim();
        if (slug) revalidatePath(`/shops/${slug}`);
    }

    revalidatePath("/shops");
    revalidatePath("/shops/me");

    redirect(`/shops/me?shop_id=${encodeURIComponent(returnShopId)}&saved=1&note=bulk_tags_done&v=${bumpParam()}`);
}
