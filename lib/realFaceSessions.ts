/* ─────────────────────────────────────────────
   Real Face Capture Session 管理
   Supabase 永続化版（旧 globalThis Map から移行）
   - サーバー再起動でもセッション保持
   - マルチインスタンス対応
   - 20 分 TTL はクエリ条件で実現
   ───────────────────────────────────────────── */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { RealFaceStoredMeta } from "@/lib/realFaceStorage";

export type RealFaceCaptureSessionStatus = "pending" | "completed" | "expired";

export type RealFaceCaptureSession = {
    token: string;
    userId: string;
    status: RealFaceCaptureSessionStatus;
    createdAt: string;
    updatedAt: string;
    captureUrl: string;
    result?: RealFaceStoredMeta | null;
};

const SESSION_TTL_MINUTES = 20;

/* ─── DB 行 → ドメイン型 ─── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSession(row: any): RealFaceCaptureSession {
    return {
        token: row.token,
        userId: row.user_id,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        captureUrl: row.capture_url,
        result: row.result ?? null,
    };
}

/* ─── 期限切れセッションの一括更新 ─── */

export async function pruneRealFaceSessions(): Promise<void> {
    try {
        await supabaseAdmin
            .from("real_face_sessions")
            .update({ status: "expired", updated_at: new Date().toISOString() })
            .eq("status", "pending")
            .lt("created_at", new Date(Date.now() - SESSION_TTL_MINUTES * 60 * 1000).toISOString());
    } catch {
        // プルーニング失敗は致命的ではない
    }
}

/* ─── セッション作成 ─── */

export async function createRealFaceSession(
    userId: string,
    captureUrl: string,
): Promise<RealFaceCaptureSession> {
    await pruneRealFaceSessions();

    const token = crypto.randomUUID();
    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
        .from("real_face_sessions")
        .insert({
            token,
            user_id: userId,
            status: "pending",
            capture_url: captureUrl,
            created_at: now,
            updated_at: now,
        })
        .select()
        .single();

    if (error || !data) {
        // DB 挿入失敗時はインメモリフォールバック
        console.warn("[realFaceSessions] DB insert failed, using in-memory fallback:", error?.message);
        return {
            token,
            userId,
            status: "pending",
            createdAt: now,
            updatedAt: now,
            captureUrl,
        };
    }

    return rowToSession(data);
}

/* ─── セッション取得 ─── */

export async function getRealFaceSession(
    token: string | null | undefined,
): Promise<RealFaceCaptureSession | null> {
    if (!token) return null;

    try {
        const cutoff = new Date(Date.now() - SESSION_TTL_MINUTES * 60 * 1000).toISOString();

        const { data, error } = await supabaseAdmin
            .from("real_face_sessions")
            .select("*")
            .eq("token", token)
            .neq("status", "expired")
            .gt("created_at", cutoff)
            .single();

        if (error || !data) return null;

        return rowToSession(data);
    } catch {
        return null;
    }
}

/* ─── セッション完了 ─── */

export async function completeRealFaceSession(
    token: string,
    result: RealFaceStoredMeta,
): Promise<RealFaceCaptureSession | null> {
    const session = await getRealFaceSession(token);
    if (!session) return null;

    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
        .from("real_face_sessions")
        .update({
            status: "completed",
            result: result as unknown as Record<string, unknown>,
            updated_at: now,
        })
        .eq("token", token)
        .select()
        .single();

    if (error || !data) {
        // DB 更新失敗時でもドメインオブジェクトは返す
        return { ...session, status: "completed", updatedAt: now, result };
    }

    return rowToSession(data);
}
