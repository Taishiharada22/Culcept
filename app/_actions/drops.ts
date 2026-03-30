// app/_actions/drops.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMyShopId } from "@/lib/getMyShopId";
import { upsertGarmentFitProfileFromFormData } from "@/lib/drops/fitProfileServer";

export type DropActionState = {
    ok: boolean;
    error: string | null;
    fieldErrors?: Record<string, string>;
};

const BUCKET = process.env.SUPABASE_DROP_IMAGES_BUCKET ?? "drops";
const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const SALE_MODE_SET = new Set(["fixed", "auction"]);

function isColumnMissingError(err: any) {
    const code = String(err?.code ?? "");
    const msg = String(err?.message ?? "");
    return code === "42703" || (msg.includes("column") && msg.includes("does not exist"));
}

function makeSlug(title: string) {
    const base = String(title ?? "")
        .toLowerCase()
        .trim()
        .replace(/['"]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);

    const rand = randomUUID().replace(/[^a-z0-9]/gi, "").slice(0, 10);
    return base || `drop-${rand}`;
}

function getDisplayName(user: any) {
    const meta = user?.user_metadata ?? {};
    const raw =
        meta.display_name ||
        meta.name ||
        meta.full_name ||
        user?.email?.split("@")?.[0] ||
        "user";
    return String(raw).trim().slice(0, 60) || "user";
}

function parsePrice(v: unknown): number | null {
    const s = String(v ?? "").trim();
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return Math.floor(n);
}

function parseTags(v: unknown): string[] {
    const s = String(v ?? "").trim();
    if (!s) return [];
    if (s.startsWith("[")) {
        try {
            const arr = JSON.parse(s);
            if (Array.isArray(arr)) {
                return Array.from(
                    new Set(
                        arr
                            .map((x) => String(x ?? "").trim().toLowerCase())
                            .filter(Boolean)
                    )
                ).slice(0, 20);
            }
        } catch {
            // JSON以外のケースは下のプレーンテキスト分岐で処理する
        }
    }
    const parts = s
        .split(/[,\n]/g)
        .flatMap((x) => x.split(/\s+/g))
        .map((x) => x.trim())
        .filter(Boolean);
    return Array.from(new Set(parts)).slice(0, 20);
}

function parseAuctionEndAtJST(raw: string): string | null {
    const s = String(raw ?? "").trim();
    if (!s) return null;
    if (/[zZ]$/.test(s) || /[+-]\d\d:\d\d$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) {
        const withSec = s.length === 16 ? `${s}:00` : s;
        return `${withSec}+09:00`;
    }
    return null;
}

function extFromMime(mime: string) {
    const m = String(mime || "").toLowerCase();
    if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
    if (m.includes("png")) return "png";
    if (m.includes("webp")) return "webp";
    return "bin";
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

function pickFiles(formData: FormData): File[] {
    const a = formData.getAll("images");
    const b = formData.getAll("files");
    const all = [...a, ...b].filter((x): x is File => x instanceof File);
    return all.filter((f) => f.size > 0);
}

function coerceFormData(arg1: any, arg2?: any): FormData | null {
    const a = arg1 as any;
    if (a && typeof a.get === "function" && typeof a.getAll === "function") return a as FormData;
    const b = arg2 as any;
    if (b && typeof b.get === "function" && typeof b.getAll === "function") return b as FormData;
    return null;
}

async function insertDropImagesSafe(rows: any[]) {
    // まず全部入りで試す（user_id/pathあり）
    const { error } = await supabaseAdmin.from("drop_images").insert(rows as any);
    if (!error) return;

    // column missing の場合は段階的に落とす
    if (isColumnMissingError(error)) {
        // path を落とす
        const rowsNoPath = rows.map((r) => {
            const x = { ...r };
            delete x.path;
            return x;
        });
        const { error: e2 } = await supabaseAdmin.from("drop_images").insert(rowsNoPath as any);
        if (!e2) return;

        if (isColumnMissingError(e2)) {
            // user_id も無いDBの場合
            const rowsNoUser = rowsNoPath.map((r) => {
                const x = { ...r };
                delete x.user_id;
                return x;
            });
            const { error: e3 } = await supabaseAdmin.from("drop_images").insert(rowsNoUser as any);
            if (e3) throw new Error(e3.message);
            return;
        }

        throw new Error(e2.message);
    }

    throw new Error(error.message);
}

export async function createDropAction(arg1: any, arg2?: any): Promise<DropActionState> {
    const formData = coerceFormData(arg1, arg2);
    if (!formData) return { ok: false, error: "FormData が取得できませんでした。" };

    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;

    if (!user) redirect("/login?next=/drops/new");

    const uid = String(user?.id ?? "");
    if (!uid || uid === "undefined") {
        return { ok: false, error: "ログイン情報が取れてない（user.id が undefined）。/login から入り直して。" };
    }

    const fieldErrors: Record<string, string> = {};

    const title = String(formData.get("title") ?? "").trim();
    if (!title) fieldErrors.title = "Title は必須。";

    const brand = String(formData.get("brand") ?? "").trim() || null;
    const size = String(formData.get("size") ?? "").trim() || null;
    const condition = String(formData.get("condition") ?? "").trim() || null;

    const saleModeRaw = String(formData.get("sale_mode") ?? "fixed").trim().toLowerCase();
    const sale_mode = SALE_MODE_SET.has(saleModeRaw) ? (saleModeRaw as "fixed" | "auction") : "fixed";

    const priceRaw = String(formData.get("price") ?? "").trim();
    const buyNowRaw = String(formData.get("buy_now_price") ?? "").trim();
    const auction_allow_buy_now = String(formData.get("auction_allow_buy_now") ?? "") === "on";

    let price: number | null = null;
    let buy_now_price: number | null = null;

    if (sale_mode === "fixed") {
        price = parsePrice(priceRaw);
        if (price == null || price <= 0) fieldErrors.price = "価格は 1円以上で入力して。";
    } else {
        if (auction_allow_buy_now) {
            const src = buyNowRaw || priceRaw;
            if (!src) fieldErrors.buy_now_price = "即決価格を入力して。";
            else {
                buy_now_price = parsePrice(src);
                if (buy_now_price == null || buy_now_price <= 0) fieldErrors.buy_now_price = "即決価格は 1円以上で入力して。";
            }
        }
    }

    const floorRaw = String(formData.get("auction_floor_price") ?? "").trim();
    let auction_floor_price: number | null = null;
    if (sale_mode === "auction") {
        auction_floor_price = parsePrice(floorRaw);
        if (auction_floor_price == null || auction_floor_price <= 0) fieldErrors.auction_floor_price = "オークション初値は 1円以上で入力して。";
    }

    const auctionEndRaw = String(formData.get("auction_end_at") ?? "").trim();
    let auction_end_at: string | null = null;
    if (sale_mode === "auction") {
        const parsed = parseAuctionEndAtJST(auctionEndRaw);
        if (!parsed) fieldErrors.auction_end_at = "終了時間が不正。";
        else {
            const ms = new Date(parsed).getTime();
            if (!Number.isFinite(ms)) fieldErrors.auction_end_at = "終了時間が不正。";
            else if (ms < Date.now() + 5 * 60 * 1000) fieldErrors.auction_end_at = "終了時間は今から5分以上先を指定して。";
            else auction_end_at = parsed;
        }
    }

    const urlRaw = String(formData.get("url") ?? "").trim();
    const purchaseRaw = String(formData.get("purchase_url") ?? "").trim();
    const url = urlRaw ? normalizeUrl(urlRaw) : "";
    const purchase_url = purchaseRaw ? normalizeUrl(purchaseRaw) : "";
    if (urlRaw && !url) fieldErrors.url = "Link が不正（http/https 形式 or ドメイン）。";
    if (purchaseRaw && !purchase_url) fieldErrors.purchase_url = "Buy link が不正（http/https 形式 or ドメイン）。";

    const description = String(formData.get("description") ?? "").trim() || null;
    const tags = parseTags(formData.get("tags"));

    const filesAll = pickFiles(formData);

    if (filesAll.length > MAX_IMAGES) fieldErrors.images = `画像は最大 ${MAX_IMAGES} 枚まで。`;
    for (const f of filesAll.slice(0, MAX_IMAGES)) {
        if (f.size > MAX_IMAGE_BYTES) {
            fieldErrors.images = `画像サイズが大きすぎる（最大 ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB）。`;
            break;
        }
        const mime = String(f.type || "").toLowerCase();
        if (mime && !ALLOWED_MIME.has(mime)) {
            fieldErrors.images = "対応画像形式は jpg/png/webp のみ。";
            break;
        }
    }

    if (Object.keys(fieldErrors).length) {
        return { ok: false, error: "入力を確認して。", fieldErrors };
    }

    const slug = makeSlug(title);
    const display_name = getDisplayName(user);

    // ✅ shops の列差分（owner_user_id / owner_id / user_id）を吸収する“正規ルート”
    const shopId = await getMyShopId(uid).catch(() => null);

    const createPatch: Record<string, unknown> = {
        title,
        slug,
        display_name,
        user_id: uid,
        shop_id: shopId,
        brand,
        size,
        condition,
        price,
        url: url || null,
        purchase_url: purchase_url || null,
        description,
        tags,
        cover_image_url: null,
        sale_mode,
        auction_allow_buy_now: sale_mode === "auction" ? auction_allow_buy_now : true,
        auction_floor_price: sale_mode === "auction" ? auction_floor_price : null,
        auction_end_at: sale_mode === "auction" ? auction_end_at : null,
        auction_status: sale_mode === "auction" ? "active" : "none",
        buy_now_price: sale_mode === "auction" ? (auction_allow_buy_now ? buy_now_price : null) : null,
    };

    let created: { id: string } | null = null;
    const insertWithBuyNow = await supabaseAdmin.from("drops").insert(createPatch as any).select("id").single();

    if (!insertWithBuyNow.error) {
        created = insertWithBuyNow.data;
    } else if (isColumnMissingError(insertWithBuyNow.error)) {
        const fallbackPatch: Record<string, unknown> = { ...createPatch };
        delete fallbackPatch.buy_now_price;
        if (sale_mode === "auction") {
            fallbackPatch.price = auction_allow_buy_now ? buy_now_price : null;
        }
        const insertFallback = await supabaseAdmin.from("drops").insert(fallbackPatch as any).select("id").single();
        if (insertFallback.error) {
            return { ok: false, error: insertFallback.error.message ?? "Failed to create drop" };
        }
        created = insertFallback.data;
    } else {
        return { ok: false, error: insertWithBuyNow.error?.message ?? "Failed to create drop" };
    }

    if (!created?.id) {
        return { ok: false, error: "Failed to create drop" };
    }

    const dropId = String(created.id);
    if (!dropId || dropId === "undefined") {
        return { ok: false, error: "dropId が取れてない（undefined）。作成レスポンスを確認して。" };
    }

    const files = filesAll.slice(0, MAX_IMAGES);
    const insertedImages: { public_url: string; path: string; sort: number }[] = [];

    try {
        await upsertGarmentFitProfileFromFormData(dropId, formData);

        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const mime = String(f.type || "application/octet-stream").toLowerCase();
            if (mime && !ALLOWED_MIME.has(mime)) throw new Error("Unsupported image type");

            const ext = extFromMime(mime);
            const rand = randomUUID().replace(/[^a-z0-9]/gi, "").slice(0, 12);

            const path = `${uid}/${dropId}/${String(i).padStart(2, "0")}-${rand}.${ext}`;
            const buf = Buffer.from(await f.arrayBuffer());

            const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, buf, {
                contentType: mime,
                upsert: false,
                cacheControl: "3600",
            });
            if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

            const pubRes = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
            const public_url = pubRes?.data?.publicUrl ?? "";
            if (!public_url) throw new Error("Failed to get public url");

            insertedImages.push({ public_url, path, sort: i });
        }

        if (insertedImages.length) {
            const rows = insertedImages.map((x) => ({
                drop_id: dropId,
                user_id: uid,
                sort: x.sort,
                public_url: x.public_url,
                path: x.path,
            }));

            await insertDropImagesSafe(rows);

            const cover = insertedImages[0]?.public_url ?? null;
            if (cover) {
                const { error: upErr2 } = await supabaseAdmin.from("drops").update({ cover_image_url: cover }).eq("id", dropId);
                if (upErr2) throw new Error(upErr2.message);
            }
        }
    } catch (e: any) {
        try {
            const paths = insertedImages.map((x) => x.path).filter(Boolean) as string[];
            if (paths.length) await supabaseAdmin.storage.from(BUCKET).remove(paths);
        } catch { }
        try {
            await supabaseAdmin.from("drops").delete().eq("id", dropId);
        } catch { }
        return { ok: false, error: e?.message ?? "Upload failed" };
    }

    revalidatePath("/drops");
    revalidatePath("/auction");
    revalidatePath("/shops/me");
    revalidatePath(`/drops/${dropId}`);

    redirect(`/drops/${dropId}/edit`);
}
