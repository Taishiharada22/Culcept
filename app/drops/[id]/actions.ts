"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const BUCKET = "drops";

function isColumnMissingError(err: any) {
    const code = String(err?.code ?? "");
    const msg = String(err?.message ?? "");
    return code === "42703" || (msg.includes("column") && msg.includes("does not exist"));
}

export async function deleteDropAction(dropId: string) {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;

    if (!user) redirect(`/login?next=/drops/${dropId}`);

    // 所有者確認（adminで取得して照合）
    const { data: drop, error: dErr } = await supabaseAdmin
        .from("drops")
        .select("id,user_id,cover_image_path")
        .eq("id", dropId)
        .maybeSingle();

    if (dErr) throw dErr;
    if (!drop) redirect("/drops");
    if (String(drop.user_id ?? "") !== String(user!.id)) throw new Error("権限がありません。");

    // drop_images から path を集める（path列が無ければスキップ）
    const paths: string[] = [];

    const { data: imgs1, error: imgErr1 } = await supabaseAdmin
        .from("drop_images")
        .select("path")
        .eq("drop_id", dropId);

    if (!imgErr1) {
        for (const r of imgs1 ?? []) {
            const p = String((r as any)?.path ?? "");
            if (p) paths.push(p);
        }
    } else {
        if (!isColumnMissingError(imgErr1)) throw imgErr1;
    }

    // cover_image_path もあれば削除対象へ（同一なら重複OK）
    const coverPath = String((drop as any)?.cover_image_path ?? "");
    if (coverPath) paths.push(coverPath);

    // Storage削除（admin）
    if (paths.length > 0) {
        const { error: rmErr } = await supabaseAdmin.storage.from(BUCKET).remove(paths);
        if (rmErr) {
            // ここで落とすと不整合になるので、致命的でない限り継続
            // throw rmErr; ← 厳格にするなら
            console.warn("[deleteDropAction] storage remove failed:", rmErr.message);
        }
    }

    // drops 削除（drop_images は FK cascade で消える想定）
    const { error: delErr } = await supabaseAdmin.from("drops").delete().eq("id", dropId);
    if (delErr) throw delErr;

    revalidatePath("/drops");
    redirect("/drops");
}
