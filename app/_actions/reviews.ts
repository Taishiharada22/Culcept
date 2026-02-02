// app/_actions/reviews.ts
"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import type { ReviewActionState } from "@/types/reviews";

/**
 * レビューを投稿
 */
export async function submitReviewAction(
    productId: string,
    rating: number,
    title: string | null,
    content: string | null
): Promise<ReviewActionState> {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return { ok: false, error: "Not authenticated" };
        }

        // Validate rating
        if (rating < 1 || rating > 5) {
            return { ok: false, error: "Rating must be between 1 and 5" };
        }

        // Check if product exists
        const { data: product, error: productErr } = await supabase
            .from("drops")
            .select("id,user_id")
            .eq("id", productId)
            .single();

        if (productErr || !product) {
            return { ok: false, error: "Product not found" };
        }

        // Don't allow owner to review own product
        if (product.user_id === auth.user.id) {
            return { ok: false, error: "Cannot review your own product" };
        }

        // Check if user already reviewed
        const { data: existing } = await supabase
            .from("product_reviews")
            .select("id")
            .eq("product_id", productId)
            .eq("user_id", auth.user.id)
            .maybeSingle();

        if (existing) {
            return { ok: false, error: "You have already reviewed this product" };
        }

        // Insert review
        const { data: review, error: insertErr } = await supabase
            .from("product_reviews")
            .insert({
                product_id: productId,
                user_id: auth.user.id,
                rating,
                title: title?.trim() || null,
                content: content?.trim() || null,
                verified_purchase: false, // TODO: Check if user purchased
            })
            .select()
            .single();

        if (insertErr) {
            throw insertErr;
        }

        revalidatePath(`/drops/${productId}`);
        return { ok: true, error: null, review: review as any };
    } catch (err: any) {
        console.error("submitReviewAction error:", err);
        return { ok: false, error: err.message || "Failed to submit review" };
    }
}

/**
 * レビューを削除
 */
export async function deleteReviewAction(reviewId: string): Promise<ReviewActionState> {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return { ok: false, error: "Not authenticated" };
        }

        // Get review to check ownership
        const { data: review, error: reviewErr } = await supabase
            .from("product_reviews")
            .select("user_id,product_id")
            .eq("id", reviewId)
            .single();

        if (reviewErr || !review) {
            return { ok: false, error: "Review not found" };
        }

        if (review.user_id !== auth.user.id) {
            return { ok: false, error: "Not authorized" };
        }

        // Delete
        const { error: deleteErr } = await supabase
            .from("product_reviews")
            .delete()
            .eq("id", reviewId)
            .eq("user_id", auth.user.id);

        if (deleteErr) {
            throw deleteErr;
        }

        revalidatePath(`/drops/${review.product_id}`);
        return { ok: true, error: null };
    } catch (err: any) {
        console.error("deleteReviewAction error:", err);
        return { ok: false, error: err.message || "Failed to delete review" };
    }
}

/**
 * レビューを「役立った」としてマーク
 */
export async function markReviewHelpfulAction(reviewId: string): Promise<ReviewActionState> {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return { ok: false, error: "Not authenticated" };
        }

        // Increment helpful_count
        const { error: updateErr } = await supabase.rpc("increment_review_helpful", {
            review_id: reviewId,
        });

        if (updateErr) {
            throw updateErr;
        }

        return { ok: true, error: null };
    } catch (err: any) {
        console.error("markReviewHelpfulAction error:", err);
        return { ok: false, error: err.message || "Failed to mark review as helpful" };
    }
}
