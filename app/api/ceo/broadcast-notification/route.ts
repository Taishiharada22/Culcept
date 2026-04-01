// 運営通知送信API（CEO専用）
// 全ユーザー一括 or 指定ユーザーに運営通知を送信する
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isCeoEmail } from "@/lib/auth/isCeo";

export const runtime = "nodejs";

const ALLOWED_TYPES = [
    "system_announcement",
    "account_notice",
    "policy_update",
    "maintenance_notice",
    "safety_notice",
] as const;

export async function POST(request: NextRequest) {
    try {
        // CEO認証（メールアドレスベース — 他のCEO APIと統一）
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user || !isCeoEmail(auth.user.email)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await request.json();
        const { type, title, body: notifBody, link, user_ids } = body;

        if (!type || !title) {
            return NextResponse.json({ error: "type and title are required" }, { status: 400 });
        }

        if (!ALLOWED_TYPES.includes(type)) {
            return NextResponse.json({ error: `Invalid type. Allowed: ${ALLOWED_TYPES.join(", ")}` }, { status: 400 });
        }

        // 二重送信防止: 直近1分以内に同一 type+title の broadcast があれば拒否
        const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
        const { data: recent } = await supabaseAdmin
            .from("notifications")
            .select("id")
            .eq("type", type)
            .eq("title", title)
            .gte("created_at", oneMinuteAgo)
            .contains("data", { broadcast: true })
            .limit(1);

        if (recent && recent.length > 0) {
            return NextResponse.json(
                { error: "同じ内容の通知が直近1分以内に送信されています。誤送信防止のため、少し待ってから再送してください。" },
                { status: 429 },
            );
        }

        // 送信対象を決定
        let targetUserIds: string[];

        if (user_ids && Array.isArray(user_ids) && user_ids.length > 0) {
            // 指定ユーザーに限定送信
            // メールアドレスが含まれていればUUIDに解決する
            const isEmail = (s: string) => s.includes("@");
            const emails = user_ids.filter(isEmail);
            const uuids = user_ids.filter((s: string) => !isEmail(s));

            if (emails.length > 0) {
                const { data } = await supabaseAdmin.auth.admin.listUsers();
                const emailSet = new Set(emails.map((e: string) => e.toLowerCase()));
                for (const u of data?.users ?? []) {
                    if (u.email && emailSet.has(u.email.toLowerCase())) {
                        uuids.push(u.id);
                    }
                }
            }

            targetUserIds = uuids;
        } else {
            // 全アクティブユーザーに一括送信
            const { data: users, error: usersError } = await supabaseAdmin
                .from("profiles")
                .select("id")
                .not("onboarded_at", "is", null);

            if (usersError) {
                return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
            }

            targetUserIds = (users ?? []).map((u: { id: string }) => u.id);
        }

        if (targetUserIds.length === 0) {
            return NextResponse.json({ ok: true, sent: 0, total: 0 });
        }

        // 送信単位を一意に識別する broadcast_id
        const broadcastId = randomUUID();

        // 一括INSERT（バッチ）
        const notifications = targetUserIds.map((uid) => ({
            user_id: uid,
            type,
            title,
            body: notifBody || null,
            link: link || null,
            data: { sent_by: auth.user!.id, broadcast: true, broadcast_id: broadcastId },
            read_at: null,
        }));

        // 500件ずつバッチINSERT
        let inserted = 0;
        for (let i = 0; i < notifications.length; i += 500) {
            const batch = notifications.slice(i, i + 500);
            const { error: insertError } = await supabaseAdmin
                .from("notifications")
                .insert(batch);

            if (insertError) {
                console.error("[broadcast] batch insert failed:", insertError);
            } else {
                inserted += batch.length;
            }
        }

        return NextResponse.json({
            ok: true,
            sent: inserted,
            total: targetUserIds.length,
            broadcast_id: broadcastId,
            targeted: !!(user_ids && user_ids.length > 0),
        });
    } catch (error) {
        console.error("[broadcast] error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
