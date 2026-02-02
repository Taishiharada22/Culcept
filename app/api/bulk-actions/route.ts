// app/api/bulk-actions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BulkActionPayload = {
    action: "publish" | "unpublish" | "delete" | "update_price" | "update_tags";
    product_ids: string[];
    payload?: any;
};

export async function POST(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json(
                { ok: false, error: "Not authenticated" },
                { status: 401 }
            );
        }

        const body: BulkActionPayload = await req.json();
        const { action, product_ids, payload } = body;

        if (!action || !Array.isArray(product_ids) || product_ids.length === 0) {
            return NextResponse.json(
                { ok: false, error: "Invalid request" },
                { status: 400 }
            );
        }

        // Verify ownership of all products
        const { data: products, error: verifyErr } = await supabase
            .from("drops")
            .select("id,user_id")
            .in("id", product_ids);

        if (verifyErr) {
            throw verifyErr;
        }

        const ownedIds = (products || [])
            .filter((p: any) => p.user_id === auth.user.id)
            .map((p: any) => p.id);

        if (ownedIds.length === 0) {
            return NextResponse.json(
                { ok: false, error: "No owned products found" },
                { status: 403 }
            );
        }

        let processed = 0;
        let failed = 0;
        const details: Array<{ id: string; success: boolean; error?: string }> = [];

        // Execute action based on type
        switch (action) {
            case "publish": {
                const { error } = await supabase
                    .from("drops")
                    .update({ status: "published", is_published: true } as any)
                    .in("id", ownedIds)
                    .eq("user_id", auth.user.id);

                if (error) {
                    throw error;
                }

                processed = ownedIds.length;
                break;
            }

            case "unpublish": {
                const { error } = await supabase
                    .from("drops")
                    .update({ status: "draft", is_published: false } as any)
                    .in("id", ownedIds)
                    .eq("user_id", auth.user.id);

                if (error) {
                    throw error;
                }

                processed = ownedIds.length;
                break;
            }

            case "delete": {
                const { error } = await supabase
                    .from("drops")
                    .delete()
                    .in("id", ownedIds)
                    .eq("user_id", auth.user.id);

                if (error) {
                    throw error;
                }

                processed = ownedIds.length;
                break;
            }

            case "update_price": {
                const { type, value } = payload || {};

                if (!type || typeof value !== "number") {
                    return NextResponse.json(
                        { ok: false, error: "Invalid price payload" },
                        { status: 400 }
                    );
                }

                if (type === "fixed") {
                    // Set all to fixed price
                    const { error } = await supabase
                        .from("drops")
                        .update({ price: value } as any)
                        .in("id", ownedIds)
                        .eq("user_id", auth.user.id);

                    if (error) {
                        throw error;
                    }

                    processed = ownedIds.length;
                } else if (type === "percentage") {
                    // Update each product individually for percentage
                    for (const id of ownedIds) {
                        try {
                            const { data: product } = await supabase
                                .from("drops")
                                .select("price")
                                .eq("id", id)
                                .single();

                            if (product && product.price) {
                                const oldPrice = Number(product.price);
                                const newPrice = Math.round(oldPrice * (1 + value / 100));

                                await supabase
                                    .from("drops")
                                    .update({ price: newPrice } as any)
                                    .eq("id", id)
                                    .eq("user_id", auth.user.id);

                                processed++;
                            }
                        } catch (err: any) {
                            failed++;
                            details.push({ id, success: false, error: err.message });
                        }
                    }
                }
                break;
            }

            case "update_tags": {
                const { action: tagAction, tags } = payload || {};

                if (!tagAction || !Array.isArray(tags)) {
                    return NextResponse.json(
                        { ok: false, error: "Invalid tags payload" },
                        { status: 400 }
                    );
                }

                for (const id of ownedIds) {
                    try {
                        const { data: product } = await supabase
                            .from("drops")
                            .select("tags")
                            .eq("id", id)
                            .single();

                        let newTags: string[] = [];
                        const existingTags = Array.isArray(product?.tags) ? product.tags : [];

                        if (tagAction === "add") {
                            newTags = [...new Set([...existingTags, ...tags])];
                        } else if (tagAction === "remove") {
                            newTags = existingTags.filter((t: string) => !tags.includes(t));
                        } else if (tagAction === "replace") {
                            newTags = tags;
                        }

                        await supabase
                            .from("drops")
                            .update({ tags: newTags } as any)
                            .eq("id", id)
                            .eq("user_id", auth.user.id);

                        processed++;
                    } catch (err: any) {
                        failed++;
                        details.push({ id, success: false, error: err.message });
                    }
                }
                break;
            }

            default:
                return NextResponse.json(
                    { ok: false, error: "Unknown action" },
                    { status: 400 }
                );
        }

        // Revalidate paths
        revalidatePath("/drops");
        revalidatePath("/shops/me");

        return NextResponse.json({
            ok: true,
            processed,
            failed,
            details: details.length > 0 ? details : undefined,
        });
    } catch (err: any) {
        console.error("POST /api/bulk-actions error:", err);
        return NextResponse.json(
            { ok: false, error: err.message || "Internal server error" },
            { status: 500 }
        );
    }
}
