// app/my-page/notifications/page.tsx
import "server-only";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import NotificationList from "./NotificationList";

export const dynamic = "force-dynamic";

// 通知タイプのアイコンとカラー
const NOTIFICATION_STYLES: Record<string, { icon: string; color: string; bg: string }> = {
    new_item: { icon: "🆕", color: "text-blue-600", bg: "bg-blue-50" },
    price_drop: { icon: "💰", color: "text-green-600", bg: "bg-green-50" },
    restock: { icon: "📦", color: "text-amber-600", bg: "bg-amber-50" },
    like: { icon: "❤️", color: "text-pink-600", bg: "bg-pink-50" },
    follow: { icon: "👤", color: "text-purple-600", bg: "bg-purple-50" },
    message: { icon: "💬", color: "text-indigo-600", bg: "bg-indigo-50" },
    purchase: { icon: "🛒", color: "text-emerald-600", bg: "bg-emerald-50" },
    recommendation: { icon: "✨", color: "text-violet-600", bg: "bg-violet-50" },
    weekly_digest: { icon: "📊", color: "text-slate-600", bg: "bg-slate-50" },
    default: { icon: "🔔", color: "text-slate-600", bg: "bg-slate-50" },
};

export default async function NotificationsPage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
        return (
            <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
                <div className="mx-auto max-w-2xl px-4 py-16 text-center">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-3xl">🔔</span>
                    </div>
                    <h1 className="text-2xl font-bold">通知</h1>
                    <p className="mt-3 text-slate-600">通知を見るにはログインが必要です</p>
                    <Link
                        className="mt-6 inline-block px-6 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors"
                        href="/login"
                    >
                        ログイン
                    </Link>
                </div>
            </main>
        );
    }

    // 通知を取得
    const { data: items } = await supabase
        .from("notifications")
        .select("id, type, title, body, link, created_at, read_at, data")
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: false })
        .limit(100);

    // 未読をまとめて既読にする
    const unreadIds = (items ?? []).filter((n: any) => !n.read_at).map((n: any) => n.id);
    if (unreadIds.length) {
        await supabase
            .from("notifications")
            .update({ read_at: new Date().toISOString() })
            .in("id", unreadIds);
    }

    // 統計情報
    const stats = {
        total: items?.length ?? 0,
        unread: unreadIds.length,
        today: items?.filter((n: any) => {
            const today = new Date();
            const notifDate = new Date(n.created_at);
            return notifDate.toDateString() === today.toDateString();
        }).length ?? 0,
    };

    // 通知をスタイル付きで整形
    const styledItems = (items ?? []).map((n: any) => ({
        ...n,
        style: NOTIFICATION_STYLES[n.type] || NOTIFICATION_STYLES.default,
    }));

    return (
        <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
            <div className="mx-auto max-w-2xl px-4 py-8">
                {/* ヘッダー */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/my-page"
                            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold">通知</h1>
                            <p className="text-sm text-slate-600">
                                {stats.unread > 0
                                    ? `${stats.unread}件の新しい通知`
                                    : "すべて既読"}
                            </p>
                        </div>
                    </div>
                    <Link
                        href="/settings/notifications"
                        className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                        title="通知設定"
                    >
                        <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </Link>
                </div>

                {/* 統計カード */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                    <div className="bg-white rounded-xl border p-4 text-center">
                        <div className="text-2xl font-bold text-purple-600">{stats.total}</div>
                        <div className="text-xs text-slate-600">合計</div>
                    </div>
                    <div className="bg-white rounded-xl border p-4 text-center">
                        <div className="text-2xl font-bold text-blue-600">{stats.unread}</div>
                        <div className="text-xs text-slate-600">未読</div>
                    </div>
                    <div className="bg-white rounded-xl border p-4 text-center">
                        <div className="text-2xl font-bold text-green-600">{stats.today}</div>
                        <div className="text-xs text-slate-600">今日</div>
                    </div>
                </div>

                {/* 通知リスト */}
                <NotificationList items={styledItems} />
            </div>
        </main>
    );
}
