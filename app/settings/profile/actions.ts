// app/settings/profile/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type ProfileActionState = {
    ok: boolean;
    error: string | null;
    message?: string | null;
    fieldErrors?: Record<string, string>;
};

const AVATAR_BUCKET = process.env.SUPABASE_USER_AVATAR_BUCKET || "user-avatars";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function pickFile(formData: FormData, key: string): File | null {
    const v = formData.get(key);
    if (!(v instanceof File)) return null;
    if (!v || v.size <= 0) return null;
    return v;
}

function extFromType(type: string) {
    const t = (type || "").toLowerCase();
    if (t.includes("png")) return "png";
    if (t.includes("webp")) return "webp";
    if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
    return "bin";
}

function normalizeUrl(raw: string) {
    const v = String(raw ?? "").trim();
    if (!v) return "";
    try {
        const u = new URL(v);
        return u.protocol === "http:" || u.protocol === "https:" ? v : "";
    } catch {
        try {
            const u = new URL(`https://${v}`);
            return u.protocol === "https:" ? u.toString() : "";
        } catch {
            return "";
        }
    }
}

async function uploadUserAvatar(args: { file: File; userId: string }) {
    const { file, userId } = args;
    if (file.size > MAX_AVATAR_BYTES) {
        return { ok: false as const, error: "ファイルサイズは5MB以下にしてください。" };
    }
    if (file.type && !ALLOWED_AVATAR_TYPES.has(file.type)) {
        return { ok: false as const, error: "対応していない画像形式です。" };
    }

    const ext = extFromType(file.type);
    const path = `users/${userId}/avatar-${Date.now()}.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
        .from(AVATAR_BUCKET)
        .upload(path, file, {
            upsert: true,
            contentType: file.type || "application/octet-stream",
            cacheControl: "3600",
        });

    if (upErr) return { ok: false as const, error: upErr.message };

    const { data } = supabaseAdmin.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    const publicUrl = data?.publicUrl || "";

    if (!publicUrl) return { ok: false as const, error: "公開URLの取得に失敗しました。" };

    return { ok: true as const, url: publicUrl };
}

export async function updateProfileAction(
    _prev: ProfileActionState,
    formData: FormData
): Promise<ProfileActionState> {
    const displayName = String(formData.get("display_name") ?? "").trim();
    const avatarUrlRaw = String(formData.get("avatar_url") ?? "").trim();
    const avatarFile = pickFile(formData, "avatar_file");
    const bio = String(formData.get("bio") ?? "").trim();
    const location = String(formData.get("location") ?? "").trim();
    const websiteRaw = String(formData.get("website") ?? "").trim();

    const fieldErrors: Record<string, string> = {};

    if (displayName.length > 60) fieldErrors.display_name = "表示名は60文字以内にしてください。";
    if (bio.length > 160) fieldErrors.bio = "自己紹介は160文字以内にしてください。";
    if (location.length > 60) fieldErrors.location = "ロケーションは60文字以内にしてください。";
    if (websiteRaw && !normalizeUrl(websiteRaw)) fieldErrors.website = "有効なURLを入力してください。";
    if (avatarUrlRaw && !normalizeUrl(avatarUrlRaw)) fieldErrors.avatar_url = "有効なURLを入力してください。";

    if (Object.keys(fieldErrors).length > 0) {
        return {
            ok: false,
            error: "入力内容を確認してください。",
            fieldErrors,
        };
    }

    const supabase = await supabaseServer();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) return { ok: false, error: authError.message };
    if (!auth?.user) return { ok: false, error: "ログインしてください。" };

    let avatar_url = normalizeUrl(avatarUrlRaw) || null;
    const website = normalizeUrl(websiteRaw) || null;
    const nameValue = displayName || null;

    if (avatarFile) {
        const upload = await uploadUserAvatar({ file: avatarFile, userId: auth.user.id });
        if (!upload.ok) {
            return { ok: false, error: `アバター画像のアップロードに失敗しました: ${upload.error}` };
        }
        avatar_url = upload.url;
    }

    const { error } = await supabase.auth.updateUser({
        data: {
            name: nameValue,
            display_name: nameValue,
            avatar_url,
            bio: bio || null,
            location: location || null,
            website,
        },
    });

    if (error) {
        return { ok: false, error: error.message };
    }

    revalidatePath("/my");
    revalidatePath("/settings/profile");

    return { ok: true, error: null, message: "保存しました。" };
}
