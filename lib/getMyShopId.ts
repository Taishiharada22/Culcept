// lib/getMyShopId.ts
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isColMissing(err: any) {
    const code = String(err?.code ?? "");
    const msg = String(err?.message ?? "");
    return code === "42703" || msg.includes("does not exist");
}

// created_at が無い環境の保険（order で 42703 が出ることがある）
function isOrderMissing(err: any) {
    const code = String(err?.code ?? "");
    const msg = String(err?.message ?? "");
    return code === "42703" || msg.includes("created_at") || msg.includes("does not exist");
}

export async function getMyShopId(userId: string): Promise<string | null> {
    const cols = ["owner_user_id", "owner_id", "user_id"] as const;

    for (const col of cols) {
        // まず orderありで試す（元の構造維持）
        const q1 = await supabaseAdmin
            .from("shops")
            .select("id, slug")
            // @ts-ignore
            .eq(col, userId)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

        if (!q1.error && q1.data?.id) return String(q1.data.id);

        // order が原因で落ちるDBなら、order無しで同じ列を再トライ
        if (q1.error && isOrderMissing(q1.error)) {
            const q1b = await supabaseAdmin
                .from("shops")
                .select("id, slug")
                // @ts-ignore
                .eq(col, userId)
                .limit(1)
                .maybeSingle();

            if (!q1b.error && q1b.data?.id) return String(q1b.data.id);

            // 列が無いなら次の列へ、別エラーなら止める
            if (q1b.error && !isColMissing(q1b.error)) break;
            continue;
        }

        // 列が無いなら次の列へ
        if (q1.error && isColMissing(q1.error)) continue;

        // 別エラーなら止める
        if (q1.error && !isColMissing(q1.error)) break;
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
