"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { DropActionState } from "./type";

const BUCKET = "drops";

function s(v: FormDataEntryValue | null) {
    return typeof v === "string" ? v.trim() : "";
}

function normalizeUrl(raw: string) {
    const x = raw.trim();
    if (!x) return "";
    try {
        new URL(x);
        return x;
    } catch {
        try {
            new URL("https://" + x);
            return "https://" + x;
        } catch {
            return "";
        }
    }
}

function parseTags(json: string): string[] {
    if (!json) return [];
    try {
        const v = JSON.parse(json);
        if (!Array.isArray(v)) return [];
        return v
            .map((x) => String(x ?? "").trim().toLowerCase())
            .filter(Boolean)
            .slice(0, 20);
    } catch {
        return [];
    }
}

function isColumnMissingError(err: any) {
    const code = String(err?.code ?? "");
    const msg = String(err?.message ?? "");
    return code === "42703" || (msg.includes("column") && msg.includes("does not exist"));
}

async function uploadImages(dropId: string, userId: string, files: File[]) {
    const uploaded: { sort: number; public_url: string; path: string }[] = [];

    for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (!f || f.size === 0) continue;
        if (!String(f.type || "").startsWith("image/")) continue;

        const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
        const safeExt = ext.length <= 6 ? ext : "jpg";
        const path = `${dropId}/${crypto.randomUUID()}.${safeExt}`;

        const buf = Buffer.from(await f.arrayBuffer());
        const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, buf, {
            contentType: f.type || "image/jpeg",
            upsert: false,
        });
        if (upErr) throw upErr;

        const pub = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
        const public_url = pub.data.publicUrl;

        uploaded.push({ sort: i, public_url, path });
    }

    if (uploaded.length > 0) {
        // drop_images insert（path/user_id 列が無いDBでも落ちない）
        const rowsFull = uploaded.map((x) => ({
            drop_id: dropId,
            user_id: userId,
            sort: x.sort,
            public_url: x.public_url,
            path: x.path,
        }));

        const { error: insErr1 } = await supabaseAdmin.from("drop_images").insert(rowsFull as any);

        if (insErr1) {
            if (isColumnMissingError(insErr1)) {
                // まず path 抜き
                const rowsNoPath = uploaded.map((x) => ({
                    drop_id: dropId,
                    user_id: userId,
                    sort: x.sort,
                    public_url: x.public_url,
                }));
                const { error: insErr2 } = await supabaseAdmin.from("drop_images").insert(rowsNoPath as any);

                if (insErr2 && isColumnMissingError(insErr2)) {
                    // user_id も無い場合
                    const rowsMin = uploaded.map((x) => ({
                        drop_id: dropId,
                        sort: x.sort,
                        public_url: x.public_url,
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

        // cover
        const cover = uploaded[0]?.public_url ?? null;
        if (cover) {
            const { error: updErr } = await supabaseAdmin.from("drops").update({ cover_image_url: cover }).eq("id", dropId);
            if (updErr && !isColumnMissingError(updErr)) throw updErr;
        }
    }

    return uploaded;
}

export async function createDropAction(
    _prev: DropActionState,
    formData: FormData
): Promise<DropActionState> {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;

    if (!user) return { ok: false, error: "ログインしてください。" };

    const title = s(formData.get("title"));
    const brand = s(formData.get("brand"));
    const size = s(formData.get("size"));
    const condition = s(formData.get("condition"));
    const priceRaw = s(formData.get("price"));
    const urlRaw = s(formData.get("url"));
    const purchaseRaw = s(formData.get("purchase_url"));
    const description = s(formData.get("description"));
    const tagsJson = s(formData.get("tags"));

    const fieldErrors: Record<string, string> = {};

    if (!title || title.length < 2) fieldErrors.title = "Title は2文字以上を推奨。";

    let price: number | null = null;
    if (priceRaw) {
        const n = Number(priceRaw);
        if (!Number.isFinite(n) || n < 0) fieldErrors.price = "Price は0以上の数字にして。";
        else price = Math.floor(n);
    }

    const url = urlRaw ? normalizeUrl(urlRaw) : "";
    if (urlRaw && !url) fieldErrors.url = "URL形式が不正。https:// を含めて。";

    const purchase_url = purchaseRaw ? normalizeUrl(purchaseRaw) : "";
    if (purchaseRaw && !purchase_url) fieldErrors.purchase_url = "URL形式が不正。https:// を含めて。";

    const tags = parseTags(tagsJson);

    if (Object.keys(fieldErrors).length > 0) return { ok: false, error: "入力を確認して。", fieldErrors };

    // insert drop
    const { data: inserted, error: insErr } = await supabaseAdmin
        .from("drops")
        .insert({
            user_id: user.id,
            title,
            brand: brand || null,
            size: size || null,
            condition: condition || null,
            price,
            url: url || null,
            purchase_url: purchase_url || null,
            description: description || null,
            tags: tags.length ? tags : null,
        } as any)
        .select("id")
        .single();

    if (insErr || !inserted?.id) return { ok: false, error: insErr?.message ?? "作成に失敗した。" };

    const dropId = inserted.id as string;

    // images (optional)
    const files = formData.getAll("images").filter((x): x is File => x instanceof File);
    const limited = files.slice(0, 12);

    try {
        if (limited.length > 0) {
            await uploadImages(dropId, user.id, limited);
        }
    } catch (e: any) {
        return { ok: false, error: `画像アップロードに失敗: ${e?.message ?? "unknown"}` };
    }

    revalidatePath("/drops");
    revalidatePath(`/drops/${dropId}`);

    redirect(`/drops/${dropId}`);
}
