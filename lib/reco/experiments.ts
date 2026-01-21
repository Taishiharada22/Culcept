import type { Role } from "./feature";

export async function getOrAssignVariant(supabase: any, userId: string, expKey: string) {
    const { data: existing, error: selErr } = await supabase
        .from("experiment_assignments")
        .select("variant")
        .eq("user_id", userId)
        .eq("exp_key", expKey)
        .maybeSingle();

    if (!selErr && existing?.variant) return String(existing.variant);

    // A/Bを50:50で固定
    const variant = Math.random() < 0.5 ? "A" : "B";

    const { error: insErr } = await supabase.from("experiment_assignments").insert({
        user_id: userId,
        exp_key: expKey,
        variant,
    });

    if (insErr) {
        // 失敗しても動作は継続（fallback）
        return "A";
    }
    return variant;
}
