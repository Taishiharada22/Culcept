// app/my-page/notifications/NotificationList.tsx
"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

interface NotificationItem {
    id: string;
    type: string;
    title: string;
    body: string | null;
    link: string | null;
    created_at: string;
    read_at: string | null;
    data: Record<string, any> | null;
    style: {
        icon: string;
        color: string;
        bg: string;
    };
}

interface NotificationListProps {
    items: NotificationItem[];
}

type FilterType = "all" | "unread" | "rendezvous" | "system";

const FILTERS: { key: FilterType; label: string; emptyLabel: string; matchFn: (type: string) => boolean }[] = [
    { key: "all",        label: "すべて",      emptyLabel: "通知はまだありません",             matchFn: () => true },
    { key: "unread",     label: "未読",         emptyLabel: "未読の通知はありません",           matchFn: () => true },
    { key: "rendezvous", label: "Rendezvous",   emptyLabel: "Rendezvousの通知はまだありません", matchFn: (t) => t.startsWith("rendezvous_") || t.startsWith("verification_") },
    { key: "system",     label: "運営",          emptyLabel: "運営からの通知はまだありません",   matchFn: (t) => ["system", "system_announcement", "account_notice", "policy_update", "maintenance_notice", "safety_notice"].includes(t) },
];

export default function NotificationList({ items }: NotificationListProps) {
    const [filter, setFilter] = useState<FilterType>("all");
    const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
    const [readIds, setReadIds] = useState<Set<string>>(new Set());

    const activeFilter = FILTERS.find((x) => x.key === filter)!;

    const filteredItems = items.filter((item) => {
        if (deletedIds.has(item.id)) return false;
        if (filter === "unread") return !item.read_at && !readIds.has(item.id);
        if (filter === "all") return true;
        return activeFilter.matchFn(item.type);
    });

    const handleDelete = useCallback(async (id: string) => {
        try {
            const res = await fetch(`/api/notifications/${id}`, { method: "DELETE" });
            if (res.ok) {
                setDeletedIds((prev) => { const next = new Set(prev); next.add(id); return next; });
            }
        } catch (error) {
            console.error("Delete failed:", error);
        }
    }, []);

    const handleMarkRead = useCallback(async (id: string) => {
        // 楽観的更新: UIを先に更新してからサーバーに通知
        setReadIds((prev) => { const next = new Set(prev); next.add(id); return next; });
        try {
            const res = await fetch(`/api/notifications/${id}`, { method: "PATCH" });
            if (!res.ok) {
                // サーバー失敗時にロールバック
                setReadIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
            }
        } catch (error) {
            console.error("Mark read failed:", error);
            setReadIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
        }
    }, []);

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();

        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return "たった今";
        if (minutes < 60) return `${minutes}分前`;
        if (hours < 24) return `${hours}時間前`;
        if (days < 7) return `${days}日前`;

        return date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
    };

    // 日付でグループ化
    const groupedItems: { label: string; items: NotificationItem[] }[] = [];
    let currentGroup: { label: string; items: NotificationItem[] } | null = null;

    filteredItems.forEach((item) => {
        const date = new Date(item.created_at);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        let label: string;
        if (date.toDateString() === today.toDateString()) {
            label = "今日";
        } else if (date.toDateString() === yesterday.toDateString()) {
            label = "昨日";
        } else {
            label = date.toLocaleDateString("ja-JP", { month: "long", day: "numeric" });
        }

        if (!currentGroup || currentGroup.label !== label) {
            currentGroup = { label, items: [] };
            groupedItems.push(currentGroup);
        }
        currentGroup.items.push(item);
    });

    const unreadCount = items.filter((i) => !i.read_at && !readIds.has(i.id) && !deletedIds.has(i.id)).length;

    return (
        <div className="mt-4">
            {/* フィルタータブ */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-4 px-4" role="tablist">
                {FILTERS.map((f) => (
                    <button
                        key={f.key}
                        role="tab"
                        aria-selected={filter === f.key}
                        onClick={() => setFilter(f.key)}
                        className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                            filter === f.key
                                ? "bg-purple-600 text-white"
                                : "bg-white border text-slate-600 hover:bg-slate-50"
                        }`}
                    >
                        {f.label}
                        {f.key === "unread" && unreadCount > 0 && (
                            <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs rounded-full bg-white/20" aria-label={`${unreadCount}件の未読`}>
                                {unreadCount}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* 通知がない場合 */}
            {filteredItems.length === 0 && (
                <div className="text-center py-12">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-3xl">📭</span>
                    </div>
                    <p className="text-slate-600">{activeFilter.emptyLabel}</p>
                </div>
            )}

            {/* グループ化された通知リスト */}
            {groupedItems.map((group) => (
                <div key={group.label} className="mb-6">
                    <h3 className="text-sm font-medium text-slate-500 mb-2">{group.label}</h3>
                    <div className="space-y-2" role="list">
                        {group.items.map((item) => (
                            <NotificationCard
                                key={item.id}
                                item={item}
                                isRead={!!item.read_at || readIds.has(item.id)}
                                formatDate={formatDate}
                                onDelete={handleDelete}
                                onMarkRead={handleMarkRead}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

function NotificationCard({
    item,
    isRead,
    formatDate,
    onDelete,
    onMarkRead,
}: {
    item: NotificationItem;
    isRead: boolean;
    formatDate: (date: string) => string;
    onDelete: (id: string) => void;
    onMarkRead: (id: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);

    const handleCardClick = () => {
        if (!isRead) {
            onMarkRead(item.id);
        }
        setExpanded((prev) => !prev);
    };

    return (
        <div
            onClick={handleCardClick}
            className={`bg-white rounded-xl border p-4 transition-all hover:shadow-sm group cursor-pointer ${
                !isRead ? "border-l-4 border-l-purple-500" : ""
            }`}
            role="listitem"
            aria-label={`${isRead ? "" : "未読: "}${item.title}`}
        >
            <div className="flex gap-3">
                {/* アイコン */}
                <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${item.style.bg}`}
                >
                    <span className="text-lg">{item.style.icon}</span>
                </div>

                {/* コンテンツ */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className={`font-medium ${expanded ? "" : "line-clamp-1"} ${isRead ? "text-slate-500" : "text-slate-900"}`}>
                            {item.title}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-xs text-slate-500">
                                {formatDate(item.created_at)}
                            </span>
                            {/* モバイル用: 常時薄表示の削除ボタン */}
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onDelete(item.id);
                                }}
                                className="sm:hidden p-1 text-slate-300 hover:text-red-500 active:text-red-500 transition-colors"
                                aria-label={`「${item.title}」を削除`}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>
                    {item.body && (
                        <p className={`text-sm mt-1 ${expanded ? "" : "line-clamp-2"} ${isRead ? "text-slate-400" : "text-slate-600"}`}>
                            {item.body}
                        </p>
                    )}

                    {/* 展開時: リンク + 削除 */}
                    {expanded && (
                        <div className="mt-3 flex items-center gap-3">
                            {item.link && (
                                <Link
                                    href={item.link}
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 text-sm text-purple-600 hover:text-purple-800 font-medium"
                                >
                                    詳細を見る
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </Link>
                            )}
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onDelete(item.id);
                                }}
                                className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                                aria-label={`「${item.title}」を削除`}
                            >
                                削除
                            </button>
                        </div>
                    )}

                    {/* 非展開時: デスクトップhover削除 */}
                    {!expanded && (
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onDelete(item.id);
                            }}
                            className="mt-1.5 p-1 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 max-sm:hidden"
                            aria-label={`「${item.title}」を削除`}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
