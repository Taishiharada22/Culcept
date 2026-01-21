// lib/uploadShopImage.ts
"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

function extFromType(type: string) {
    const t = (type || "").toLowerCase();
    if (t.includes("png")) return "png";
    if (t.includes("webp")) return "webp";
    if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
    return "bin";
}

/**
 * ✅ bucket は必要。無ければ Supabase Storage に作る
 * 推奨: shop-images
 */
const BUCKET = process.env.SUPABASE_SHOP_BUCKET || "shop-images";

export async function uploadShopImage(args: {
    file: File;
    userId: string;
    kind: "avatar" | "banner";
}) {
    const { file, userId, kind } = args;

    if (!(file instanceof File) || file.size <= 0) {
        return { ok: false as const, error: "No file" };
    }

    const ext = extFromType(file.type);
    const ts = Date.now();
    const path = `shops/${userId}/${kind}-${ts}.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, file, {
            upsert: true,
            contentType: file.type || "application/octet-stream",
            cacheControl: "3600",
        });

    if (upErr) return { ok: false as const, error: upErr.message };

    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = data?.publicUrl || "";

    if (!publicUrl) return { ok: false as const, error: "Failed to get public URL" };

    return { ok: true as const, url: publicUrl };
}
