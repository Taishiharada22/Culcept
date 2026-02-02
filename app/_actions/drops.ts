// app/_actions/drops.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMyShopId } from "@/lib/getMyShopId";

export type DropActionState = {
    ok: boolean;
    error: string | null;
    fieldErrors?: Record<string, string>;
};

const BUCKET = process.env.SUPABASE_DROP_IMAGES_BUCKET ?? "drops";
const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

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
    const parts = s
        .split(/[,\n]/g)
        .flatMap((x) => x.split(/\s+/g))
        .map((x) => x.trim())
        .filter(Boolean);
    return Array.from(new Set(parts)).slice(0, 20);
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

    const price = parsePrice(formData.get("price"));
    if (String(formData.get("price") ?? "").trim() && price == null) fieldErrors.price = "Price が不正。";

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

    const { data: created, error: createErr } = await supabaseAdmin
        .from("drops")
        .insert({
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
        } as any)
        .select("id")
        .single();

    if (createErr || !created?.id) {
        return { ok: false, error: createErr?.message ?? "Failed to create drop" };
    }

    const dropId = String(created.id);
    if (!dropId || dropId === "undefined") {
        return { ok: false, error: "dropId が取れてない（undefined）。作成レスポンスを確認して。" };
    }

    const files = filesAll.slice(0, MAX_IMAGES);
    const insertedImages: { public_url: string; path: string; sort: number }[] = [];

    try {
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
    revalidatePath("/shops/me");
    revalidatePath(`/drops/${dropId}`);

    redirect(`/drops/${dropId}/edit`);
}
