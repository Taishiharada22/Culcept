import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const USER_AVATAR_BUCKET = process.env.SUPABASE_USER_AVATAR_BUCKET || "user-avatars";
const BODY_BUCKET = process.env.SUPABASE_BODY_BUCKET || "body-avatars";

type PostgrestLikeError = {
    code?: string | null;
    message?: string | null;
};

function isMissingRelationError(error: PostgrestLikeError | null | undefined) {
    const code = String(error?.code ?? "");
    const message = String(error?.message ?? "").toLowerCase();
    return (
        code === "42P01" ||
        code === "PGRST205" ||
        message.includes("does not exist") ||
        message.includes("could not find the table") ||
        message.includes("relation") && message.includes("does not exist")
    );
}

function isMissingColumnError(error: PostgrestLikeError | null | undefined) {
    const code = String(error?.code ?? "");
    const message = String(error?.message ?? "").toLowerCase();
    return code === "42703" || (message.includes("column") && message.includes("does not exist"));
}

function isMissingBucketError(error: PostgrestLikeError | null | undefined) {
    const code = String(error?.code ?? "");
    const message = String(error?.message ?? "").toLowerCase();
    return code === "404" || message.includes("bucket not found") || message.includes("not found");
}

function failOnUnexpected(error: PostgrestLikeError | null | undefined, context: string) {
    if (!error || isMissingRelationError(error) || isMissingColumnError(error)) return;
    throw new Error(`${context}: ${error.message ?? "unknown error"}`);
}

async function deleteRows(
    table: string,
    args: {
        column?: string;
        value?: string;
        or?: string;
    },
) {
    let query = supabaseAdmin.from(table).delete();
    if (args.or) query = query.or(args.or);
    else if (args.column && args.value) query = query.eq(args.column, args.value);
    const { error } = await query;
    failOnUnexpected(error, `${table} delete failed`);
}

async function updateRows(
    table: string,
    values: Record<string, unknown>,
    args: {
        column?: string;
        value?: string;
        or?: string;
    },
) {
    let query = supabaseAdmin.from(table).update(values);
    if (args.or) query = query.or(args.or);
    else if (args.column && args.value) query = query.eq(args.column, args.value);
    const { error } = await query;
    failOnUnexpected(error, `${table} update failed`);
}

async function listStoragePaths(bucket: string, folder: string): Promise<string[]> {
    const { data, error } = await supabaseAdmin.storage.from(bucket).list(folder, {
        limit: 1000,
        sortBy: { column: "name", order: "asc" },
    });

    if (error) {
        if (isMissingBucketError(error)) return [];
        throw new Error(`${bucket} list failed: ${error.message ?? "unknown error"}`);
    }

    const paths: string[] = [];

    for (const entry of data ?? []) {
        const name = String(entry?.name ?? "").trim();
        if (!name) continue;
        const fullPath = folder ? `${folder}/${name}` : name;
        const hasFileId = typeof entry?.id === "string" && entry.id.length > 0;
        if (hasFileId) {
            paths.push(fullPath);
            continue;
        }
        paths.push(...await listStoragePaths(bucket, fullPath));
    }

    return paths;
}

async function removeStoragePaths(bucket: string, paths: string[]) {
    if (paths.length === 0) return;
    for (let index = 0; index < paths.length; index += 100) {
        const chunk = paths.slice(index, index + 100);
        const { error } = await supabaseAdmin.storage.from(bucket).remove(chunk);
        if (error && !isMissingBucketError(error)) {
            throw new Error(`${bucket} remove failed: ${error.message ?? "unknown error"}`);
        }
    }
}

async function cleanupStorage(userId: string) {
    const targets = [
        { bucket: USER_AVATAR_BUCKET, folder: `users/${userId}` },
        { bucket: BODY_BUCKET, folder: `avatars/${userId}` },
        { bucket: BODY_BUCKET, folder: `real-face/${userId}` },
        { bucket: "rendezvous-photos", folder: userId },
        { bucket: "identity-verification", folder: userId },
    ];

    for (const target of targets) {
        const paths = await listStoragePaths(target.bucket, target.folder);
        await removeStoragePaths(target.bucket, paths);
    }
}

async function cleanupNonCascadeRows(userId: string) {
    await deleteRows("stargazer_axis_snapshots", { column: "user_id", value: userId });
    await deleteRows("stargazer_daily_states", { column: "user_id", value: userId });
    await deleteRows("stargazer_question_shown", { column: "user_id", value: userId });
    await deleteRows("rendezvous_success_stories", { column: "user_id", value: userId });
    await deleteRows("rendezvous_referrals", {
        or: `referrer_id.eq.${userId},referred_id.eq.${userId}`,
    });
    await deleteRows("rendezvous_session_messages", { column: "sender_id", value: userId });
    await deleteRows("rendezvous_sessions", {
        or: `user_a.eq.${userId},user_b.eq.${userId}`,
    });
    await deleteRows("rendezvous_missions", {
        or: `user_a.eq.${userId},user_b.eq.${userId}`,
    });
    await deleteRows("rendezvous_constellation_messages", { column: "sender_id", value: userId });
    await deleteRows("rendezvous_constellation_decisions", { column: "user_id", value: userId });
    await deleteRows("rendezvous_game_participants", { column: "user_id", value: userId });
    await updateRows("rendezvous_candidates", { unmatched_by: null }, { column: "unmatched_by", value: userId });
}

async function runCleanupStep(label: string, task: () => Promise<void>) {
    try {
        await task();
    } catch (error) {
        console.warn(`[account/delete] cleanup skipped: ${label}`, error);
    }
}

export async function DELETE() {
    try {
        const supabase = await supabaseServer();
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
            return NextResponse.json({ ok: false, error: authError.message }, { status: 401 });
        }
        if (!user) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        await runCleanupStep("storage", () => cleanupStorage(user.id));
        await runCleanupStep("non-cascade rows", () => cleanupNonCascadeRows(user.id));

        const { error: hardDeleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
        if (hardDeleteError) {
            console.warn("[account/delete] hard delete unavailable, falling back to soft delete:", hardDeleteError);
            const { error: softDeleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id, true);
            if (softDeleteError) {
                return NextResponse.json(
                    { ok: false, error: softDeleteError.message || hardDeleteError.message },
                    { status: 500 },
                );
            }

            return NextResponse.json({ ok: true, mode: "soft" });
        }

        return NextResponse.json({ ok: true, mode: "hard" });
    } catch (error) {
        console.error("[account/delete] error:", error);
        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : "アカウント削除に失敗しました",
            },
            { status: 500 },
        );
    }
}
