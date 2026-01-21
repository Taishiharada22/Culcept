"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type ShopActionState = {
    ok: boolean;
    error: string | null;
    message?: string | null;
    fieldErrors?: Record<string, string>;
    shopId?: string | null;
    slug?: string | null;
};

const BUCKET = "shops"; // 使ってなければ作る（任意）。無い場合は画像アップロードだけスキップされる。

function isColumnMissingError(err: any) {
    const code = String(err?.code ?? "");
    const msg = String(err?.message ?? "");
    return code === "42703" || (msg.includes("column") && msg.includes("does not exist"));
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

    // JSON配列（TagEditor）を優先
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

    // CSV fallback
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

async function safeUpsertShop(params: {
    shopId: string | null;
    ownerId: string;
    values: Record<string, any>;
}) {
    const { shopId, ownerId, values } = params;

    // まず “全部入り” で試す → 列が無いなら最小構成でリトライ
    const minimal = {
        owner_id: ownerId,
        slug: values.slug ?? null,
        name_ja: values.name_ja ?? null,
        name_en: values.name_en ?? null,
        headline: values.headline ?? null,
        avatar_url: values.avatar_url ?? null,
        style_tags: values.style_tags ?? [],
        is_active: typeof values.is_active === "boolean" ? values.is_active : false,
    };

    if (shopId) {
        const { data, error } = await supabaseAdmin
            .from("shops")
            .update(values as any)
            .eq("id", shopId)
            .eq("owner_id", ownerId)
            .select("id, slug")
            .maybeSingle();

        if (!error) return { data, error: null };

        if (isColumnMissingError(error)) {
            const { data: d2, error: e2 } = await supabaseAdmin
                .from("shops")
                .update(minimal as any)
                .eq("id", shopId)
                .eq("owner_id", ownerId)
                .select("id, slug")
                .maybeSingle();
            return { data: d2, error: e2 ?? null };
        }
        return { data: null, error };
    }

    const { data, error } = await supabaseAdmin
        .from("shops")
        .insert(values as any)
        .select("id, slug")
        .maybeSingle();

    if (!error) return { data, error: null };

    if (isColumnMissingError(error)) {
        const { data: d2, error: e2 } = await supabaseAdmin
            .from("shops")
            .insert(minimal as any)
            .select("id, slug")
            .maybeSingle();
        return { data: d2, error: e2 ?? null };
    }

    return { data: null, error };
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

export async function updateMyShopAction(arg1: any, arg2?: any): Promise<ShopActionState> {
    const formData = coerceFormData(arg1, arg2);
    if (!formData) return { ok: false, error: "FormData が取得できませんでした。" };

    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) redirect("/login?next=/shops/me");

    const fieldErrors: Record<string, string> = {};

    const name_ja = String(formData.get("name_ja") ?? "").trim();
    if (!name_ja) fieldErrors.name_ja = "ショップ名（日本語）は必須。";

    const name_en = String(formData.get("name_en") ?? "").trim();
    const headline = String(formData.get("headline") ?? "").trim();
    const bio = String(formData.get("bio") ?? "").trim();
    const urlRaw = String(formData.get("url") ?? "").trim();
    const url = urlRaw ? normalizeUrl(urlRaw) : "";
    if (urlRaw && !url) fieldErrors.url = "Website が不正（http/https）。";

    const is_active = formData.get("is_active") ? true : false;

    const slugRaw = String(formData.get("slug") ?? "").trim();
    const slug = makeSlug(slugRaw || name_ja);

    const style_tags = parseStyleTags(formData.get("style_tags"));

    // socials は JSON
    let socials: any = {};
    try {
        const s = String(formData.get("socials") ?? "").trim();
        socials = s ? JSON.parse(s) : {};
    } catch {
        socials = {};
    }

    // 既存shopを特定
    const shopIdFromForm = String(formData.get("shop_id") ?? "").trim() || null;
    const { data: existing } = await supabaseAdmin
        .from("shops")
        .select("id, slug")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    const shopId = shopIdFromForm || (existing?.id ? String(existing.id) : null);

    if (Object.keys(fieldErrors).length) {
        return { ok: false, error: "入力を確認して。", fieldErrors };
    }

    const warns: string[] = [];

    const baseValues: Record<string, any> = {
        owner_id: user.id,
        slug,
        name_ja,
        name_en: name_en || null,
        headline: headline || null,
        bio: bio || null,
        url: url || null,
        style_tags,
        socials,
        is_active,
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
    let savedSlug = String(saved.slug ?? slug);

    // 画像（任意）：失敗しても shop 保存は成功扱いで進める
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

    revalidatePath("/shops/me");
    revalidatePath(`/shops/${savedSlug}`);

    return {
        ok: true,
        error: null,
        message: warns.length ? `保存しました（注意: ${warns.join(" / ")}）` : "保存しました",
        fieldErrors: {},
        shopId: savedId,
        slug: savedSlug,
    };
}

export async function toggleShopActiveAction(formData: FormData) {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) redirect("/login?next=/shops/me");

    const shopId = String(formData.get("shop_id") ?? "").trim();
    const nextActive = String(formData.get("next_active") ?? "0") === "1";

    if (!shopId) redirect("/shops/me?error=" + encodeURIComponent("shop_id がありません"));

    const { error } = await supabaseAdmin
        .from("shops")
        .update({ is_active: nextActive } as any)
        .eq("id", shopId)
        .eq("owner_id", user.id);

    if (error) redirect("/shops/me?error=" + encodeURIComponent(error.message));

    revalidatePath("/shops/me");
    redirect("/shops/me?saved=1");
}
