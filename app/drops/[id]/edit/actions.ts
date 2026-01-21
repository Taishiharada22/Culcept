"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/requireUser";
import type { DropActionState } from "../../new/type";

const BUCKET = "drops";
const MAX_TOTAL_IMAGES = 10;

// ✅ AddImagesForm 側を 20MB にしてるなら、サーバ側も合わせる（旧 addDropImagesAction 用）
const MAX_FILE_MB = 20;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const SIZE_SET = new Set(["S", "M", "L", "LL"]);
const COND_SET = new Set(["damaged", "well", "good", "almost_new"]);
const SALE_MODE_SET = new Set(["fixed", "auction"]);

function normalizeCond(raw: string) {
    const s0 = raw.trim().toLowerCase();
    if (s0 === "almost new" || s0 === "almost-new") return "almost_new";
    return s0;
}

// datetime-local（JST想定）→ timestamptz文字列へ
function parseAuctionEndAtJST(raw: string): string | null {
    const s = String(raw ?? "").trim();
    if (!s) return null;

    // 既にZ or +hh:mm付きならそれを使う
    if (/[zZ]$/.test(s) || /[+-]\d\d:\d\d$/.test(s)) return s;

    // YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) {
        const withSec = s.length === 16 ? s + ":00" : s;
        return withSec + "+09:00"; // JST固定
    }
    return null;
}

function extFromType(mime: string) {
    if (mime === "image/jpeg") return "jpg";
    if (mime === "image/png") return "png";
    if (mime === "image/webp") return "webp";
    return "img";
}

function normalizeTag(s: string) {
    return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeTags(arr: unknown): string[] {
    const a = Array.isArray(arr) ? arr : [];
    const out: string[] = [];
    for (const x of a) {
        const t = normalizeTag(String(x ?? ""));
        if (!t) continue;
        if (!out.includes(t)) out.push(t);
        if (out.length >= 15) break;
    }
    return out;
}

function isColumnMissingError(err: any) {
    const code = String(err?.code ?? "");
    const msg = String(err?.message ?? "");
    return code === "42703" || (msg.includes("column") && msg.includes("does not exist"));
}

function normalizeUrl(raw: string) {
    const x = raw.trim();
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

async function assertOwner(supabase: any, dropId: string, userId: string) {
    const { data, error } = await supabase.from("drops").select("id,user_id").eq("id", dropId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Drop not found.");
    if (String(data.user_id) !== String(userId)) throw new Error("権限がありません。");
}

async function refreshCoverSafe(supabase: any, dropId: string, userId: string) {
    const { data: first, error } = await supabase
        .from("drop_images")
        .select("path,public_url")
        .eq("drop_id", dropId)
        .eq("user_id", userId)
        .order("sort", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (error) throw error;

    const cover_image_url = first?.public_url ?? null;

    const { error: covErr1 } = await supabase
        .from("drops")
        .update({ cover_image_url })
        .eq("id", dropId)
        .eq("user_id", userId);

    if (covErr1 && !isColumnMissingError(covErr1)) throw covErr1;
}

/** ✅ PublishBar用：公開状態を切り替える（status列が無ければis_publishedにフォールバック） */
export async function setDropStatusAction(dropId: string, nextStatus: string) {
    const { supabase, user } = await requireUser(`/drops/${dropId}/edit`);
    await assertOwner(supabase, dropId, user.id);

    // 1) status を更新（本命）
    const { error } = await supabase
        .from("drops")
        .update({ status: nextStatus } as any)
        .eq("id", dropId)
        .eq("user_id", user.id);

    if (!error) {
        revalidatePath(`/drops/${dropId}`);
        revalidatePath(`/drops/${dropId}/edit`);
        return;
    }

    // 2) status列が無いDBなら is_published にフォールバック
    if (isColumnMissingError(error)) {
        const isPublished = String(nextStatus) === "published";

        const { error: e2 } = await supabase
            .from("drops")
            .update({ is_published: isPublished } as any)
            .eq("id", dropId)
            .eq("user_id", user.id);

        if (e2) throw e2;

        revalidatePath(`/drops/${dropId}`);
        revalidatePath(`/drops/${dropId}/edit`);
        return;
    }

    throw error;
}

/** ✅ AddImagesForm（署名URLアップロード）用：Storageに上げた画像をDB登録する */
export async function registerDropImagesAction(
    dropId: string,
    uploaded: Array<{ path: string; publicUrl: string }>
): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
        const { supabase, user } = await requireUser(`/drops/${dropId}/edit`);
        await assertOwner(supabase, dropId, user.id);

        const list = Array.isArray(uploaded) ? uploaded : [];
        const cleaned = list
            .map((x) => ({
                path: String(x?.path ?? "").trim(),
                publicUrl: String(x?.publicUrl ?? "").trim(),
            }))
            .filter((x) => x.path && x.publicUrl);

        if (!cleaned.length) return { ok: false, error: "登録する画像データが空。" };

        const { data: existing, error: exErr } = await supabase
            .from("drop_images")
            .select("id,sort")
            .eq("drop_id", dropId)
            .eq("user_id", user.id)
            .order("sort", { ascending: true });

        if (exErr) throw exErr;

        const currentCount = (existing ?? []).length;
        if (currentCount + cleaned.length > MAX_TOTAL_IMAGES) {
            return { ok: false, error: `画像は合計${MAX_TOTAL_IMAGES}枚まで（現在 ${currentCount} 枚）。` };
        }

        const maxSort = (existing ?? []).reduce((m: number, r: any) => Math.max(m, Number(r.sort ?? 0)), -1);

        const rows: Array<{
            drop_id: string;
            user_id: string;
            sort: number;
            sort_order?: number;
            path: string;
            public_url: string;
        }> = [];

        for (let i = 0; i < cleaned.length; i++) {
            const nextSort = maxSort + 1 + i;
            rows.push({
                drop_id: dropId,
                user_id: user.id,
                sort: nextSort,
                sort_order: nextSort,
                path: cleaned[i].path,
                public_url: cleaned[i].publicUrl,
            });
        }

        const { error: insErr } = await supabase.from("drop_images").insert(rows as any);
        if (insErr) throw insErr;

        await refreshCoverSafe(supabase, dropId, user.id);

        revalidatePath(`/drops/${dropId}`);
        revalidatePath(`/drops/${dropId}/edit`);

        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: String(e?.message ?? "register failed") };
    }
}

/** メタ更新（Fixed/Auction対応） */
export async function updateDropMetaAction(
    dropId: string,
    _prev: DropActionState,
    formData: FormData
): Promise<DropActionState> {
    const title = String(formData.get("title") ?? "").trim();
    const brand = String(formData.get("brand") ?? "").trim();

    const sizeRaw = String(formData.get("size") ?? "").trim().toUpperCase();
    const condRaw = normalizeCond(String(formData.get("condition") ?? ""));

    const size = sizeRaw ? (SIZE_SET.has(sizeRaw) ? sizeRaw : "") : "";
    const condition = condRaw ? (COND_SET.has(condRaw) ? condRaw : "") : "";

    const saleModeRaw = String(formData.get("sale_mode") ?? "fixed").trim().toLowerCase();
    const sale_mode = SALE_MODE_SET.has(saleModeRaw) ? (saleModeRaw as "fixed" | "auction") : "fixed";

    const priceRaw = String(formData.get("price") ?? "").trim();

    const urlRaw = String(formData.get("url") ?? "").trim();
    const purchaseRaw = String(formData.get("purchase_url") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();

    const tagsRaw = String(formData.get("tags") ?? "[]");
    let tags: string[] = [];
    try {
        tags = normalizeTags(JSON.parse(tagsRaw));
    } catch {
        tags = [];
    }

    const fieldErrors: Record<string, string | undefined> = {};
    if (!title) fieldErrors.title = "タイトルを入力して。";
    if (sizeRaw && !SIZE_SET.has(sizeRaw)) fieldErrors.size = "サイズが不正。";
    if (condRaw && !COND_SET.has(condRaw)) fieldErrors.condition = "コンディションが不正。";

    let price: number | null = null;
    if (priceRaw) {
        const n = Number(priceRaw);
        if (!Number.isFinite(n) || n < 0) fieldErrors.price = "価格が不正。";
        else price = Math.floor(n);
    }

    // auction fields
    const auction_allow_buy_now = String(formData.get("auction_allow_buy_now") ?? "") === "on";

    const floorRaw = String(formData.get("auction_floor_price") ?? "").trim();
    let auction_floor_price: number | null = null;
    if (sale_mode === "auction") {
        const n = Number(floorRaw);
        if (!Number.isFinite(n) || n <= 0) fieldErrors.auction_floor_price = "最低入札（floor）は 1円以上で入力して。";
        else auction_floor_price = Math.floor(n);
    }

    const endRaw = String(formData.get("auction_end_at") ?? "").trim();
    let auction_end_at: string | null = null;
    if (sale_mode === "auction") {
        const parsed = parseAuctionEndAtJST(endRaw);
        if (!parsed) fieldErrors.auction_end_at = "締切日時が不正（datetime形式）。";
        else {
            const ms = new Date(parsed).getTime();
            if (!Number.isFinite(ms)) fieldErrors.auction_end_at = "締切日時が不正。";
            else {
                const now = Date.now();
                if (ms < now + 5 * 60 * 1000) fieldErrors.auction_end_at = "締切は「今から5分以上先」を指定して。";
                else auction_end_at = parsed;
            }
        }
    }

    const url = urlRaw ? normalizeUrl(urlRaw) : "";
    const purchase_url = purchaseRaw ? normalizeUrl(purchaseRaw) : "";

    if (urlRaw && !url) fieldErrors.url = "Link が不正（http/https 形式、またはドメイン）。";
    if (purchaseRaw && !purchase_url) fieldErrors.purchase_url = "Buy link が不正（http/https 形式、またはドメイン）。";

    if (Object.values(fieldErrors).some(Boolean)) {
        return { ok: false, error: "入力内容を確認して。", fieldErrors };
    }

    try {
        const { supabase, user } = await requireUser(`/drops/${dropId}/edit`);
        await assertOwner(supabase, dropId, user.id);

        const auction_status = sale_mode === "auction" ? "active" : "none";

        const patch: any = {
            title,
            brand: brand || null,
            size: size || null,
            condition: condition || null,
            price,
            url: url || null,
            purchase_url: purchase_url || null,
            tags,
            description: description || null,

            sale_mode,
            auction_allow_buy_now: sale_mode === "auction" ? auction_allow_buy_now : true,
            auction_floor_price: sale_mode === "auction" ? auction_floor_price : null,
            auction_end_at: sale_mode === "auction" ? auction_end_at : null,
            auction_status,
        };

        if (sale_mode === "fixed") patch.accepted_bid_id = null;

        const { error } = await supabase.from("drops").update(patch).eq("id", dropId).eq("user_id", user.id);
        if (error) throw error;

        revalidatePath(`/drops/${dropId}`);
        revalidatePath(`/drops/${dropId}/edit`);

        return { ok: true, error: null, message: "Saved." } as any;
    } catch (e: any) {
        return { ok: false, error: String(e?.message ?? "更新に失敗した。"), fieldErrors: {} };
    }
}

/** 画像追加（旧：Server Actionで直接uploadするルート。今は署名URL方式が主なら使わなくてもOK） */
export async function addDropImagesAction(
    dropId: string,
    _prev: DropActionState,
    formData: FormData
): Promise<DropActionState> {
    try {
        const { supabase, user } = await requireUser(`/drops/${dropId}/edit`);
        await assertOwner(supabase, dropId, user.id);

        const { data: existing, error: exErr } = await supabase
            .from("drop_images")
            .select("id,sort")
            .eq("drop_id", dropId)
            .eq("user_id", user.id)
            .order("sort", { ascending: true });

        if (exErr) throw exErr;

        const currentCount = (existing ?? []).length;
        const maxSort = (existing ?? []).reduce((m: number, r: any) => Math.max(m, Number(r.sort ?? 0)), -1);

        const files = formData.getAll("images");
        const imgs: File[] = [];
        for (const f of files) if (f instanceof File && f.size > 0) imgs.push(f);

        if (imgs.length === 0) return { ok: false, error: "画像が選ばれてない。", fieldErrors: {} };
        if (currentCount + imgs.length > MAX_TOTAL_IMAGES)
            return { ok: false, error: `画像は合計${MAX_TOTAL_IMAGES}枚まで。`, fieldErrors: {} };

        for (const img of imgs) {
            const mime = String(img.type ?? "");
            if (!ALLOWED_MIME.has(mime)) return { ok: false, error: "画像は jpg/png/webp のみ。", fieldErrors: {} };
            if (img.size > MAX_FILE_MB * 1024 * 1024)
                return { ok: false, error: `画像は1枚${MAX_FILE_MB}MB以下。`, fieldErrors: {} };
        }

        const rows: Array<{
            drop_id: string;
            user_id: string;
            sort: number;
            sort_order?: number;
            path: string;
            public_url: string;
        }> = [];

        for (let i = 0; i < imgs.length; i++) {
            const img = imgs[i];
            const mime = String(img.type ?? "");
            const ext = extFromType(mime);
            const name = `${crypto.randomUUID()}.${ext}`;

            // ※ 既存実装に合わせて「drops/」プレフィックスを維持
            const path = `drops/${user.id}/${dropId}/${name}`;

            const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, img, {
                contentType: mime,
                upsert: false,
                cacheControl: "3600",
            });
            if (upErr) throw upErr;

            const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
            const publicUrl = pub?.publicUrl ?? "";

            const nextSort = maxSort + 1 + i;
            rows.push({ drop_id: dropId, user_id: user.id, sort: nextSort, sort_order: nextSort, path, public_url: publicUrl });
        }

        const { error: insErr } = await supabase.from("drop_images").insert(rows as any);
        if (insErr) throw insErr;

        await refreshCoverSafe(supabase, dropId, user.id);

        revalidatePath(`/drops/${dropId}`);
        revalidatePath(`/drops/${dropId}/edit`);

        return { ok: true, error: null, message: "Images added." } as any;
    } catch (e: any) {
        return { ok: false, error: String(e?.message ?? "画像追加に失敗した。"), fieldErrors: {} };
    }
}

/** 画像削除（redirectしない版） */
export async function deleteDropImageAction(dropId: string, imageId: string) {
    const { supabase, user } = await requireUser(`/drops/${dropId}/edit`);
    await assertOwner(supabase, dropId, user.id);

    const { data: img, error } = await supabase
        .from("drop_images")
        .select("id,path")
        .eq("id", imageId)
        .eq("drop_id", dropId)
        .eq("user_id", user.id)
        .single();

    if (error) throw error;

    const path = String(img?.path ?? "");
    if (path) await supabase.storage.from(BUCKET).remove([path]);

    const { error: delErr } = await supabase
        .from("drop_images")
        .delete()
        .eq("id", imageId)
        .eq("drop_id", dropId)
        .eq("user_id", user.id);
    if (delErr) throw delErr;

    const { data: rest, error: rErr } = await supabase
        .from("drop_images")
        .select("id")
        .eq("drop_id", dropId)
        .eq("user_id", user.id)
        .order("sort", { ascending: true });

    if (rErr) throw rErr;

    for (let i = 0; i < (rest ?? []).length; i++) {
        const id = (rest as any[])[i].id;
        const { error: uErr } = await supabase
            .from("drop_images")
            .update({ sort: i, sort_order: i } as any)
            .eq("id", id)
            .eq("drop_id", dropId)
            .eq("user_id", user.id);
        if (uErr) throw uErr;
    }

    await refreshCoverSafe(supabase, dropId, user.id);

    revalidatePath(`/drops/${dropId}`);
    revalidatePath(`/drops/${dropId}/edit`);
}

/** 並び替え（redirectしない版） */
export async function reorderDropImagesAction(
    dropId: string,
    _prev: DropActionState,
    formData: FormData
): Promise<DropActionState> {
    try {
        const { supabase, user } = await requireUser(`/drops/${dropId}/edit`);
        await assertOwner(supabase, dropId, user.id);

        const raw = String(formData.get("order") ?? "").trim();
        if (!raw) return { ok: false, error: "並び順データが空。", fieldErrors: {} };

        let ids: string[] = [];
        try {
            ids = JSON.parse(raw);
            if (!Array.isArray(ids)) throw new Error("not array");
        } catch {
            return { ok: false, error: "並び順データが壊れてる。", fieldErrors: {} };
        }

        const { data: imgs, error: imgErr } = await supabase
            .from("drop_images")
            .select("id")
            .eq("drop_id", dropId)
            .eq("user_id", user.id);
        if (imgErr) throw imgErr;

        const allowed = new Set((imgs ?? []).map((x: any) => x.id));
        const filtered = ids.filter((id) => allowed.has(id));

        if (filtered.length !== allowed.size) {
            const { data: cur, error: cErr } = await supabase
                .from("drop_images")
                .select("id")
                .eq("drop_id", dropId)
                .eq("user_id", user.id)
                .order("sort", { ascending: true });
            if (cErr) throw cErr;
            ids = (cur ?? []).map((x: any) => x.id);
        } else {
            ids = filtered;
        }

        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const { error: uErr } = await supabase
                .from("drop_images")
                .update({ sort: i, sort_order: i } as any)
                .eq("id", id)
                .eq("drop_id", dropId)
                .eq("user_id", user.id);
            if (uErr) throw uErr;
        }

        await refreshCoverSafe(supabase, dropId, user.id);

        revalidatePath(`/drops/${dropId}`);
        revalidatePath(`/drops/${dropId}/edit`);

        return { ok: true, error: null, message: "Order saved." } as any;
    } catch (e: any) {
        return { ok: false, error: String(e?.message ?? "並び替えに失敗した。"), fieldErrors: {} };
    }
}
