"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminEmail } from "@/lib/auth/isAdmin";

function normalizeUrl(raw: string) {
    const x = String(raw ?? "").trim();
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

function isColumnMissingError(err: any) {
    const code = String(err?.code ?? "");
    const msg = String(err?.message ?? "");
    return code === "42703" || (msg.includes("column") && msg.includes("does not exist"));
}

export async function updateLuxuryLaneShopAction(formData: FormData) {
    const laneId = String(formData.get("lane_id") ?? "").trim();
    const shopUrlRaw = String(formData.get("shop_url") ?? "").trim();
    const shopSlug = String(formData.get("shop_slug") ?? "").trim();

    if (!laneId) redirect("/luxury/admin?error=" + encodeURIComponent("lane_id がありません"));

    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const email = auth?.user?.email ?? null;

    if (!auth?.user || !isAdminEmail(email)) {
        redirect("/luxury/admin?error=" + encodeURIComponent("権限がありません"));
    }

    const shopUrl = normalizeUrl(shopUrlRaw);

    const { error } = await supabaseAdmin
        .from("luxury_lanes")
        .update({
            shop_url: shopUrl || null,
            shop_slug: shopSlug || null,
        } as any)
        .eq("lane_id", laneId);

    if (error) {
        if (isColumnMissingError(error)) {
            redirect("/luxury/admin?error=" + encodeURIComponent("DBにshop_url/shop_slug列がありません。migrationを適用してください"));
        }
        redirect("/luxury/admin?error=" + encodeURIComponent(error.message ?? "保存に失敗しました"));
    }

    revalidatePath("/luxury/admin");
    revalidatePath("/luxury/result");
    redirect("/luxury/admin?saved=1");
}
