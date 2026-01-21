// lib/getMyShopId.ts (どこでもOK)
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isColMissing(err: any) {
    const code = String(err?.code ?? "");
    const msg = String(err?.message ?? "");
    return code === "42703" || msg.includes("does not exist");
}

export async function getMyShopId(userId: string): Promise<string | null> {
    const cols = ["owner_user_id", "owner_id", "user_id"] as const;

    for (const col of cols) {
        const { data, error } = await supabaseAdmin
            .from("shops")
            .select("id, slug")
            // @ts-ignore
            .eq(col, userId)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

        if (!error && data?.id) return String(data.id);
        if (error && !isColMissing(error)) break; // 別エラーなら止める
    }

    // fallback: slug master が1つしかない前提ならこれで救う（必要なら削除OK）
    const { data: m } = await supabaseAdmin
        .from("shops")
        .select("id")
        .eq("slug", "master")
        .limit(1)
        .maybeSingle();

    return m?.id ? String(m.id) : null;
}
