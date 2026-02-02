// app/_actions/follows.ts
"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import type { FollowActionState } from "@/types/follows";

/**
 * ストアをフォロー
 */
export async function followShopAction(shopSlug: string): Promise<FollowActionState> {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return { ok: false, error: "Not authenticated" };
        }

        // Check if shop exists
        const { data: shop, error: shopErr } = await supabase
            .from("shops")
            .select("slug")
            .eq("slug", shopSlug)
            .single();

        if (shopErr || !shop) {
            return { ok: false, error: "Shop not found" };
        }

        // Check if already following
        const { data: existing } = await supabase
            .from("shop_follows")
            .select("id")
            .eq("user_id", auth.user.id)
            .eq("shop_slug", shopSlug)
            .maybeSingle();

        if (existing) {
            return { ok: false, error: "Already following" };
        }

        // Insert follow
        const { error: insertErr } = await supabase
            .from("shop_follows")
            .insert({
                user_id: auth.user.id,
                shop_slug: shopSlug,
            });

        if (insertErr) {
            throw insertErr;
        }

        revalidatePath(`/shops/${shopSlug}`);
        revalidatePath("/me/following");
        return { ok: true, error: null, isFollowing: true };
    } catch (err: any) {
        console.error("followShopAction error:", err);
        return { ok: false, error: err.message || "Failed to follow shop" };
    }
}

/**
 * ストアのフォローを解除
 */
export async function unfollowShopAction(shopSlug: string): Promise<FollowActionState> {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return { ok: false, error: "Not authenticated" };
        }

        // Delete follow
        const { error: deleteErr } = await supabase
            .from("shop_follows")
            .delete()
            .eq("user_id", auth.user.id)
            .eq("shop_slug", shopSlug);

        if (deleteErr) {
            throw deleteErr;
        }

        revalidatePath(`/shops/${shopSlug}`);
        revalidatePath("/me/following");
        return { ok: true, error: null, isFollowing: false };
    } catch (err: any) {
        console.error("unfollowShopAction error:", err);
        return { ok: false, error: err.message || "Failed to unfollow shop" };
    }
}
