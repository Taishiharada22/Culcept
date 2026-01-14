"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { DropActionState } from "../../new/type";

const BUCKET = "drops";
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
        try {
            const u = new URL("https://" + x);
            if (u.protocol === "http:" || u.protocol === "https:") return "https://" + x;
            return "";
        } catch {
            return "";
        }
    }
}

async function assertOwner(dropId: string, userId: string) {
    const { data, error } = await supabaseAdmin.from("drops").select("id,user_id").eq("id", dropId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Drop not found.");
    if (String(data.user_id) !== String(userId)) throw new Error("権限がありません。");
}

/** cover更新：列が足りなくても落とさない */
async function refreshCoverSafe(dropId: string, userId: string) {
    // 1) まず path+url 取ってみる
    let first: any = null;
    const { data: d1, error: e1 } = await supabaseAdmin
        .from("drop_images")
        .select("path,public_url,sort,user_id")
        .eq("drop_id", dropId)
        .order("sort", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (!e1) first = d1;
    else if (isColumnMissingError(e1)) {
        // path/user_id が無い場合
        const { data: d2, error: e2 } = await supabaseAdmin
            .from("drop_images")
            .select("public_url,sort")
            .eq("drop_id", dropId)
            .order("sort", { ascending: true })
            .limit(1)
            .maybeSingle();
        if (e2) throw e2;
        first = d2;
    } else {
        throw e1;
    }

    const cover_image_path = first?.path ?? null;
    const cover_image_url = first?.public_url ?? null;

    // 2) drops を更新（両方→片方→何もしない）
    const { error: covErr1 } = await supabaseAdmin.from("drops").update({ cover_image_path, cover_image_url }).eq("id", dropId);
    if (!covErr1) return;

    if (isColumnMissingError(covErr1)) {
        // urlだけ
        const { error: covErr2 } = await supabaseAdmin.from("drops").update({ cover_image_url }).eq("id", dropId);
        if (!covErr2) return;

        if (isColumnMissingError(covErr2)) {
            const { error: covErr3 } = await supabaseAdmin.from("drops").update({ cover_image_path }).eq("id", dropId);
            if (covErr3 && !isColumnMissingError(covErr3)) throw covErr3;
            return;
        }
        throw covErr2;
    }

    throw covErr1;
}

/** メタ情報更新 */
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
        const { user } = await requireUser(`/drops/${dropId}/edit`);
        await assertOwner(dropId, user.id);

        const { error } = await supabaseAdmin
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
            .eq("id", dropId);

        if (error) throw error;

        revalidatePath("/drops");
        revalidatePath(`/drops/${dropId}`);
        revalidatePath(`/drops/${dropId}/edit`);

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
        const { user } = await requireUser(`/drops/${dropId}/edit`);
        await assertOwner(dropId, user.id);

        // 既存枚数
        const { data: existing, error: exErr } = await supabaseAdmin
            .from("drop_images")
            .select("id,sort")
            .eq("drop_id", dropId)
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

        const rowsFull: Array<{ drop_id: string; user_id: string; sort: number; path: string; public_url: string }> = [];

        for (let i = 0; i < imgs.length; i++) {
            const img = imgs[i];
            const mime = String(img.type ?? "");
            const ext = extFromType(mime);
            const name = `${crypto.randomUUID()}.${ext}`;
            const path = `${dropId}/${name}`;

            const buf = Buffer.from(await img.arrayBuffer());

            const { error: upErr } = await supabaseAdmin.storage
                .from(BUCKET)
                .upload(path, buf, { contentType: mime, upsert: false, cacheControl: "3600" });
            if (upErr) throw upErr;

            const pub = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
            const publicUrl = pub.data.publicUrl;

            rowsFull.push({ drop_id: dropId, user_id: user.id, sort: maxSort + 1 + i, path, public_url: publicUrl });
        }

        // drop_images insert（path/user_id 無いDBでも落ちない）
        const { error: insErr1 } = await supabaseAdmin.from("drop_images").insert(rowsFull as any);
        if (insErr1) {
            if (isColumnMissingError(insErr1)) {
                const rowsNoPath = rowsFull.map((r) => ({
                    drop_id: r.drop_id,
                    user_id: r.user_id,
                    sort: r.sort,
                    public_url: r.public_url,
                }));
                const { error: insErr2 } = await supabaseAdmin.from("drop_images").insert(rowsNoPath as any);

                if (insErr2 && isColumnMissingError(insErr2)) {
                    const rowsMin = rowsFull.map((r) => ({
                        drop_id: r.drop_id,
                        sort: r.sort,
                        public_url: r.public_url,
                    }));
                    const { error: insErr3 } = await supabaseAdmin.from("drop_images").insert(rowsMin as any);
                    if (insErr3) throw insErr3;
                } else if (insErr2) {
                    throw insErr2;
                }
            } else {
                throw insErr1;
            }
        }

        await refreshCoverSafe(dropId, user.id);

        revalidatePath("/drops");
        revalidatePath(`/drops/${dropId}`);
        revalidatePath(`/drops/${dropId}/edit`);

        redirect(`/drops/${dropId}/edit`);
    } catch (e: any) {
        const msg = String(e?.message ?? "");
        return { ok: false, error: msg || "画像追加に失敗した。", fieldErrors: {} };
    }
}

/** 画像を1枚削除（Storageも消す） */
export async function deleteDropImageAction(dropId: string, imageId: string) {
    const { user } = await requireUser(`/drops/${dropId}/edit`);
    await assertOwner(dropId, user.id);

    // path 列が無いDBでも落ちないように
    let path = "";
    const { data: img1, error: e1 } = await supabaseAdmin
        .from("drop_images")
        .select("path")
        .eq("id", imageId)
        .eq("drop_id", dropId)
        .maybeSingle();

    if (!e1 && img1) path = String((img1 as any).path ?? "");
    else if (e1 && !isColumnMissingError(e1)) throw e1;

    if (path) await supabaseAdmin.storage.from(BUCKET).remove([path]);

    const { error: delErr } = await supabaseAdmin
        .from("drop_images")
        .delete()
        .eq("id", imageId)
        .eq("drop_id", dropId);

    if (delErr) throw delErr;

    // sortを詰める
    const { data: rest, error: rErr } = await supabaseAdmin
        .from("drop_images")
        .select("id")
        .eq("drop_id", dropId)
        .order("sort", { ascending: true });

    if (rErr) throw rErr;

    for (let i = 0; i < (rest ?? []).length; i++) {
        const id = (rest as any[])[i].id;
        const { error: uErr } = await supabaseAdmin.from("drop_images").update({ sort: i }).eq("id", id).eq("drop_id", dropId);
        if (uErr) throw uErr;
    }

    await refreshCoverSafe(dropId, user.id);

    revalidatePath("/drops");
    revalidatePath(`/drops/${dropId}`);
    revalidatePath(`/drops/${dropId}/edit`);

    redirect(`/drops/${dropId}/edit`);
}

/** 並び替え（order JSONで受け取り） */
export async function reorderDropImagesAction(
    dropId: string,
    _prev: DropActionState,
    formData: FormData
): Promise<DropActionState> {
    try {
        const { user } = await requireUser(`/drops/${dropId}/edit`);
        await assertOwner(dropId, user.id);

        const raw = String(formData.get("order") ?? "").trim();
        if (!raw) return { ok: false, error: "並び順データが空。", fieldErrors: {} };

        let ids: string[] = [];
        try {
            ids = JSON.parse(raw);
            if (!Array.isArray(ids)) throw new Error("not array");
        } catch {
            return { ok: false, error: "並び順データが壊れてる。", fieldErrors: {} };
        }

        const { data: imgs, error: imgErr } = await supabaseAdmin
            .from("drop_images")
            .select("id")
            .eq("drop_id", dropId);

        if (imgErr) throw imgErr;

        const allowed = new Set((imgs ?? []).map((x: any) => x.id));
        const filtered = ids.filter((id) => allowed.has(id));

        // 不正混入ならDB順に戻す
        if (filtered.length !== allowed.size) {
            const { data: cur, error: cErr } = await supabaseAdmin
                .from("drop_images")
                .select("id")
                .eq("drop_id", dropId)
                .order("sort", { ascending: true });
            if (cErr) throw cErr;
            ids = (cur ?? []).map((x: any) => x.id);
        } else {
            ids = filtered;
        }

        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const { error: uErr } = await supabaseAdmin
                .from("drop_images")
                .update({ sort: i })
                .eq("id", id)
                .eq("drop_id", dropId);
            if (uErr) throw uErr;
        }

        await refreshCoverSafe(dropId, user.id);

        revalidatePath("/drops");
        revalidatePath(`/drops/${dropId}`);
        revalidatePath(`/drops/${dropId}/edit`);

        redirect(`/drops/${dropId}/edit`);
    } catch (e: any) {
        const msg = String(e?.message ?? "");
        return { ok: false, error: msg || "並び替えに失敗した。", fieldErrors: {} };
    }
}
