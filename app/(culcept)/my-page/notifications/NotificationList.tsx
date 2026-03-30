// app/my-page/notifications/NotificationList.tsx
"use client";

import { useState } from "react";
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

type FilterType = "all" | "unread" | "items" | "activity" | "digest";

export default function NotificationList({ items }: NotificationListProps) {
    const [filter, setFilter] = useState<FilterType>("all");
    const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

    const FILTERS: { key: FilterType; label: string; types?: string[] }[] = [
        { key: "all", label: "すべて" },
        { key: "unread", label: "未読" },
        { key: "items", label: "アイテム", types: ["new_item", "price_drop", "restock"] },
        { key: "activity", label: "アクティビティ", types: ["like", "follow", "message", "purchase"] },
        { key: "digest", label: "ダイジェスト", types: ["weekly_digest", "recommendation"] },
    ];

    const filteredItems = items.filter((item) => {
        if (deletedIds.has(item.id)) return false;

        switch (filter) {
            case "unread":
                return !item.read_at;
            case "items":
                return ["new_item", "price_drop", "restock"].includes(item.type);
            case "activity":
                return ["like", "follow", "message", "purchase"].includes(item.type);
            case "digest":
                return ["weekly_digest", "recommendation"].includes(item.type);
            default:
                return true;
        }
    });

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`/api/notifications/${id}`, {
                method: "DELETE",
            });

            if (res.ok) {
                setDeletedIds((prev) => new Set([...prev, id]));
            }
        } catch (error) {
            console.error("Delete failed:", error);
        }
    };

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

        return date.toLocaleDateString("ja-JP", {
            month: "short",
            day: "numeric",
        });
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
            label = date.toLocaleDateString("ja-JP", {
                month: "long",
                day: "numeric",
            });
        }

        if (!currentGroup || currentGroup.label !== label) {
            currentGroup = { label, items: [] };
            groupedItems.push(currentGroup);
        }
        currentGroup.items.push(item);
    });

    return (
        <div>
            {/* フィルタータブ */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-4 px-4">
                {FILTERS.map((f) => (
                    <button
                        key={f.key}
                        onClick={() => setFilter(f.key)}
                        className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                            filter === f.key
                                ? "bg-purple-600 text-white"
                                : "bg-white border text-slate-600 hover:bg-slate-50"
                        }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* 通知がない場合 */}
            {filteredItems.length === 0 && (
                <div className="text-center py-12">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-3xl">📭</span>
                    </div>
                    <p className="text-slate-600">
                        {filter === "unread" ? "未読の通知はありません" : "通知はまだありません"}
                    </p>
                </div>
            )}

            {/* グループ化された通知リスト */}
            {groupedItems.map((group) => (
                <div key={group.label} className="mb-6">
                    <h3 className="text-sm font-medium text-slate-500 mb-2">{group.label}</h3>
                    <div className="space-y-2">
                        {group.items.map((item) => (
                            <NotificationCard
                                key={item.id}
                                item={item}
                                formatDate={formatDate}
                                onDelete={handleDelete}
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
    formatDate,
    onDelete,
}: {
    item: NotificationItem;
    formatDate: (date: string) => string;
    onDelete: (id: string) => void;
}) {
    const [showActions, setShowActions] = useState(false);

    const content = (
        <div
            className={`bg-white rounded-xl border p-4 transition-all hover:shadow-sm ${
                !item.read_at ? "border-l-4 border-l-purple-500" : ""
            }`}
            onMouseEnter={() => setShowActions(true)}
            onMouseLeave={() => setShowActions(false)}
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
                        <div className="font-medium text-slate-900 line-clamp-1">
                            {item.title}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs text-slate-500">
                                {formatDate(item.created_at)}
                            </span>
                            {showActions && (
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onDelete(item.id);
                                    }}
                                    className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                                    title="削除"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    </div>
                    {item.body && (
                        <p className="text-sm text-slate-600 mt-1 line-clamp-2">{item.body}</p>
                    )}
                </div>
            </div>
        </div>
    );

    if (item.link) {
        return <Link href={item.link}>{content}</Link>;
    }

    return content;
}
