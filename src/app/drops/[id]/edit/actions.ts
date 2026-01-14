"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import type { DropActionState } from "../../new/type";

const BUCKET = "drop-images";
const MAX_TOTAL_IMAGES = 10;
const MAX_FILE_MB = 6;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

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
        // scheme無し → https を試す
        try {
            const u = new URL("https://" + x);
            if (u.protocol === "http:" || u.protocol === "https:") return "https://" + x;
            return "";
        } catch {
            return "";
        }
    }
}

/** drop の所有者チェック（RLSが弱くても守る） */
async function assertOwner(supabase: any, dropId: string, userId: string) {
    const { data, error } = await supabase
        .from("drops")
        .select("id,user_id")
        .eq("id", dropId)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Drop not found.");
    if (String(data.user_id) !== String(userId)) throw new Error("権限がありません。");
}

/** cover更新：列が足りなくても落とさない */
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

    const cover_image_path = first?.path ?? null;
    const cover_image_url = first?.public_url ?? null;

    // まず両方更新を試す
    const { error: covErr1 } = await supabase
        .from("drops")
        .update({ cover_image_path, cover_image_url })
        .eq("id", dropId)
        .eq("user_id", userId);

    if (!covErr1) return;

    // カラム欠けならフォールバック
    if (isColumnMissingError(covErr1)) {
        // urlだけ
        const { error: covErr2 } = await supabase
            .from("drops")
            .update({ cover_image_url })
            .eq("id", dropId)
            .eq("user_id", userId);

        if (!covErr2) return;

        // pathだけ
        if (isColumnMissingError(covErr2)) {
            const { error: covErr3 } = await supabase
                .from("drops")
                .update({ cover_image_path })
                .eq("id", dropId)
                .eq("user_id", userId);

            if (covErr3 && !isColumnMissingError(covErr3)) throw covErr3;
            return;
        }

        throw covErr2;
    }

    throw covErr1;
}

/** メタ情報更新（tags/purchase_url含む） */
export async function updateDropMetaAction(
    dropId: string,
    _prev: DropActionState,
    formData: FormData
): Promise<DropActionState> {
    const title = String(formData.get("title") ?? "").trim();
    const brand = String(formData.get("brand") ?? "").trim();
    const size = String(formData.get("size") ?? "").trim();
    const condition = String(formData.get("condition") ?? "").trim();

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

    let price: number | null = null;
    if (priceRaw) {
        const n = Number(priceRaw);
        if (!Number.isFinite(n) || n < 0) fieldErrors.price = "価格が不正。";
        else price = Math.floor(n);
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

        const { error } = await supabase
            .from("drops")
            .update({
                title,
                brand: brand || null,
                size: size || null,
                condition: condition || null,
                price,
                url: url || null,
                purchase_url: purchase_url || null,
                tags,
                description: description || null,
            })
            .eq("id", dropId)
            .eq("user_id", user.id);

        if (error) throw error;

        return { ok: true, error: null, message: "Saved." } as any;
    } catch (e: any) {
        const msg = String(e?.message ?? "");
        return { ok: false, error: msg || "更新に失敗した。", fieldErrors: {} };
    }
}

/** 画像を追加（既存は残す） */
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
            if (img.size > MAX_FILE_MB * 1024 * 1024) return { ok: false, error: `画像は1枚${MAX_FILE_MB}MB以下。`, fieldErrors: {} };
        }

        const rows: Array<{ drop_id: string; user_id: string; sort: number; path: string; public_url: string }> = [];

        for (let i = 0; i < imgs.length; i++) {
            const img = imgs[i];
            const mime = String(img.type ?? "");
            const ext = extFromType(mime);
            const name = `${crypto.randomUUID()}.${ext}`;
            const path = `drops/${user.id}/${dropId}/${name}`;

            const { error: upErr } = await supabase.storage
                .from(BUCKET)
                .upload(path, img, { contentType: mime, upsert: false, cacheControl: "3600" });
            if (upErr) throw upErr;

            const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
            const publicUrl = pub?.publicUrl ?? "";

            rows.push({ drop_id: dropId, user_id: user.id, sort: maxSort + 1 + i, path, public_url: publicUrl });
        }

        const { error: insErr } = await supabase.from("drop_images").insert(rows);
        if (insErr) throw insErr;

        await refreshCoverSafe(supabase, dropId, user.id);

        redirect(`/drops/${dropId}/edit`);
        return { ok: true, error: null } as any; // TS満たし（redirectで実際は到達しない）
    } catch (e: any) {
        const msg = String(e?.message ?? "");
        return { ok: false, error: msg || "画像追加に失敗した。", fieldErrors: {} };
    }
}

/** 画像を1枚削除（Storageも消す） */
export async function deleteDropImageAction(dropId: string, imageId: string) {
    const { supabase, user } = await requireUser(`/drops/${dropId}/edit`);
    await assertOwner(supabase, dropId, user.id);

    const { data: img, error } = await supabase
        .from("drop_images")
        .select("path")
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

    // sortを詰める
    const { data: rest, error: rErr } = await supabase
        .from("drop_images")
        .select("id")
        .eq("drop_id", dropId)
        .eq("user_id", user.id)
        .order("sort", { ascending: true });

    if (rErr) throw rErr;

    for (let i = 0; i < (rest ?? []).length; i++) {
        const id = (rest as any[])[i].id;
        const { error: uErr } = await supabase.from("drop_images").update({ sort: i }).eq("id", id).eq("drop_id", dropId).eq("user_id", user.id);
        if (uErr) throw uErr;
    }

    await refreshCoverSafe(supabase, dropId, user.id);

    redirect(`/drops/${dropId}/edit`);
}

/** 並び替え（order JSONで受け取り） */
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
                .update({ sort: i })
                .eq("id", id)
                .eq("drop_id", dropId)
                .eq("user_id", user.id);
            if (uErr) throw uErr;
        }

        await refreshCoverSafe(supabase, dropId, user.id);

        redirect(`/drops/${dropId}/edit`);
        return { ok: true, error: null } as any; // TS満たし（redirectで実際は到達しない）
    } catch (e: any) {
        const msg = String(e?.message ?? "");
        return { ok: false, error: msg || "並び替えに失敗した。", fieldErrors: {} };
    }
}
