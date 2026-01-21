// app/_actions/saved.ts
"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

type ToggleRes = { ok: boolean; saved: boolean; error?: string };
type SimpleRes = { ok: boolean; error?: string };

function cleanId(v: unknown) {
    return String(v ?? "").trim();
}

function bad(v: string) {
    const s = String(v ?? "").trim();
    const l = s.toLowerCase();
    return !s || l === "undefined" || l === "null";
}

async function requireUser() {
    const supabase = await supabaseServer();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return { ok: false as const, supabase, user: null as any, error: authErr.message };
    if (!auth?.user) return { ok: false as const, supabase, user: null as any, error: "not signed in" };
    return { ok: true as const, supabase, user: auth.user, error: null as any };
}

/**
 * 運用ログ（任意）
 * - ops_action_logs テーブルが無ければ「静かに無視」する
 * - RLSで弾かれても「静かに無視」する（consoleには軽く出す）
 */
async function safeOpsLog(
    supabase: any,
    payload: {
        user_id?: string;
        action: string;
        entity_type?: "drop" | "shop";
        entity_id?: string;
        ok: boolean;
        error?: string;
        meta?: any;
    }
) {
    try {
        const { error } = await supabase.from("ops_action_logs").insert({
            user_id: payload.user_id ?? null,
            action: payload.action,
            entity_type: payload.entity_type ?? null,
            entity_id: payload.entity_id ?? null,
            ok: payload.ok,
            error: payload.error ?? null,
            meta: payload.meta ?? null,
        });

        if (error) {
            const code = (error as any).code;

            // テーブル無し: 42P01 → 無視
            if (code === "42P01") return;

            // RLS/権限: 42501 → 無視
            if (code === "42501") return;

            // それ以外は一応出す（本処理は落とさない）
            console.warn("[ops_action_logs] insert failed:", error);
        }
    } catch {
        // 完全に握りつぶし（運用ログは“副作用”なので本処理を落とさない）
    }
}

/* ===================== Drops ===================== */

export async function toggleSavedDropAction(dropId: string): Promise<ToggleRes> {
    const id = cleanId(dropId);
    if (bad(id)) return { ok: false, saved: false, error: "invalid dropId" };

    const ctx = await requireUser();
    if (!ctx.ok) return { ok: false, saved: false, error: ctx.error };
    const { supabase, user } = ctx;
    const userId = user.id;

    const { data: existing, error: selErr } = await supabase
        .from("saved_drops")
        .select("id")
        .eq("user_id", userId)
        .eq("drop_id", id)
        .maybeSingle();

    if (selErr) {
        await safeOpsLog(supabase, {
            user_id: userId,
            action: "toggle_saved_drop/select",
            entity_type: "drop",
            entity_id: id,
            ok: false,
            error: selErr.message,
        });
        return { ok: false, saved: false, error: selErr.message };
    }

    if (existing?.id) {
        const { error: delErr } = await supabase.from("saved_drops").delete().eq("id", existing.id);

        if (delErr) {
            await safeOpsLog(supabase, {
                user_id: userId,
                action: "toggle_saved_drop/delete",
                entity_type: "drop",
                entity_id: id,
                ok: false,
                error: delErr.message,
            });
            return { ok: false, saved: true, error: delErr.message };
        }

        // 再描画（一覧/詳細/マイ保存）
        revalidatePath("/me/saved");
        revalidatePath("/drops");
        revalidatePath(`/drops/${id}`);

        await safeOpsLog(supabase, { user_id: userId, action: "toggle_saved_drop/off", entity_type: "drop", entity_id: id, ok: true });
        return { ok: true, saved: false };
    } else {
        const { error: insErr } = await supabase.from("saved_drops").insert({ user_id: userId, drop_id: id });

        if (insErr) {
            await safeOpsLog(supabase, {
                user_id: userId,
                action: "toggle_saved_drop/insert",
                entity_type: "drop",
                entity_id: id,
                ok: false,
                error: insErr.message,
            });
            return { ok: false, saved: false, error: insErr.message };
        }

        revalidatePath("/me/saved");
        revalidatePath("/drops");
        revalidatePath(`/drops/${id}`);

        await safeOpsLog(supabase, { user_id: userId, action: "toggle_saved_drop/on", entity_type: "drop", entity_id: id, ok: true });
        return { ok: true, saved: true };
    }
}

export async function removeSavedDropAction(dropId: string): Promise<SimpleRes> {
    const id = cleanId(dropId);
    if (bad(id)) return { ok: false, error: "invalid dropId" };

    const ctx = await requireUser();
    if (!ctx.ok) return { ok: false, error: ctx.error };
    const { supabase, user } = ctx;

    const { error } = await supabase.from("saved_drops").delete().eq("user_id", user.id).eq("drop_id", id);

    if (error) {
        await safeOpsLog(supabase, {
            user_id: user.id,
            action: "remove_saved_drop",
            entity_type: "drop",
            entity_id: id,
            ok: false,
            error: error.message,
        });
        return { ok: false, error: error.message };
    }

    revalidatePath("/me/saved");
    revalidatePath("/drops");
    revalidatePath(`/drops/${id}`);

    await safeOpsLog(supabase, { user_id: user.id, action: "remove_saved_drop", entity_type: "drop", entity_id: id, ok: true });
    return { ok: true };
}

/* ===================== Shops ===================== */

export async function toggleSavedShopAction(shopSlug: string): Promise<ToggleRes> {
    const slug = cleanId(shopSlug);
    if (bad(slug)) return { ok: false, saved: false, error: "invalid shopSlug" };

    const ctx = await requireUser();
    if (!ctx.ok) return { ok: false, saved: false, error: ctx.error };
    const { supabase, user } = ctx;
    const userId = user.id;

    const { data: existing, error: selErr } = await supabase
        .from("saved_shops")
        .select("id")
        .eq("user_id", userId)
        .eq("shop_slug", slug)
        .maybeSingle();

    if (selErr) {
        await safeOpsLog(supabase, {
            user_id: userId,
            action: "toggle_saved_shop/select",
            entity_type: "shop",
            entity_id: slug,
            ok: false,
            error: selErr.message,
        });
        return { ok: false, saved: false, error: selErr.message };
    }

    const rawPath = `/shops/${slug}`;
    const encPath = `/shops/${encodeURIComponent(slug)}`;

    if (existing?.id) {
        const { error: delErr } = await supabase.from("saved_shops").delete().eq("id", existing.id);

        if (delErr) {
            await safeOpsLog(supabase, {
                user_id: userId,
                action: "toggle_saved_shop/delete",
                entity_type: "shop",
                entity_id: slug,
                ok: false,
                error: delErr.message,
            });
            return { ok: false, saved: true, error: delErr.message };
        }

        revalidatePath("/me/saved");
        revalidatePath("/drops"); // shop絞り込み一覧などを広めに
        revalidatePath("/shops"); // もし一覧があるなら
        revalidatePath(rawPath);
        revalidatePath(encPath);

        await safeOpsLog(supabase, { user_id: userId, action: "toggle_saved_shop/off", entity_type: "shop", entity_id: slug, ok: true });
        return { ok: true, saved: false };
    } else {
        const { error: insErr } = await supabase.from("saved_shops").insert({ user_id: userId, shop_slug: slug });

        if (insErr) {
            await safeOpsLog(supabase, {
                user_id: userId,
                action: "toggle_saved_shop/insert",
                entity_type: "shop",
                entity_id: slug,
                ok: false,
                error: insErr.message,
            });
            return { ok: false, saved: false, error: insErr.message };
        }

        revalidatePath("/me/saved");
        revalidatePath("/drops");
        revalidatePath("/shops");
        revalidatePath(rawPath);
        revalidatePath(encPath);

        await safeOpsLog(supabase, { user_id: userId, action: "toggle_saved_shop/on", entity_type: "shop", entity_id: slug, ok: true });
        return { ok: true, saved: true };
    }
}

export async function removeSavedShopAction(shopSlug: string): Promise<SimpleRes> {
    const slug = cleanId(shopSlug);
    if (bad(slug)) return { ok: false, error: "invalid shopSlug" };

    const ctx = await requireUser();
    if (!ctx.ok) return { ok: false, error: ctx.error };
    const { supabase, user } = ctx;

    const { error } = await supabase.from("saved_shops").delete().eq("user_id", user.id).eq("shop_slug", slug);

    if (error) {
        await safeOpsLog(supabase, {
            user_id: user.id,
            action: "remove_saved_shop",
            entity_type: "shop",
            entity_id: slug,
            ok: false,
            error: error.message,
        });
        return { ok: false, error: error.message };
    }

    const rawPath = `/shops/${slug}`;
    const encPath = `/shops/${encodeURIComponent(slug)}`;

    revalidatePath("/me/saved");
    revalidatePath("/drops");
    revalidatePath("/shops");
    revalidatePath(rawPath);
    revalidatePath(encPath);

    await safeOpsLog(supabase, { user_id: user.id, action: "remove_saved_shop", entity_type: "shop", entity_id: slug, ok: true });
    return { ok: true };
}
