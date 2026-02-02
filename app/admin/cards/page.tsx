// app/admin/cards/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Card = {
    card_id: string;
    image_url: string;
    tags: string[];
    is_active: boolean;
};

export default function AdminCardsPage() {
    const [allCards, setAllCards] = useState<Card[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<"all" | "no-tags">("all");
    const [saving, setSaving] = useState<Record<string, boolean>>({});

    useEffect(() => {
        loadCards();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const cards = useMemo(() => {
        if (filter === "no-tags") {
            return allCards.filter((c) => !c.tags || c.tags.length === 0);
        }
        return allCards;
    }, [allCards, filter]);

    const noTagCount = useMemo(() => allCards.filter((c) => !c.tags || c.tags.length === 0).length, [allCards]);

    async function loadCards() {
        setLoading(true);
        try {
            const supabase = supabaseBrowser();
            const { data, error } = await supabase
                .from("curated_cards")
                .select("card_id, image_url, tags, is_active")
                .eq("is_active", true)
                .order("card_id", { ascending: true });

            if (error) throw error;

            const normalized: Card[] =
                (data || []).map((c: any) => ({
                    card_id: String(c.card_id),
                    image_url: String(c.image_url),
                    tags: Array.isArray(c.tags)
                        ? c.tags.map(String).map((s: string) => s.trim().toLowerCase()).filter(Boolean)
                        : [],
                    is_active: Boolean(c.is_active),
                })) ?? [];

            setAllCards(normalized);
        } catch (err: any) {
            console.error("Load cards error:", err);
            alert(err?.message || "Load failed");
        } finally {
            setLoading(false);
        }
    }

    async function updateTags(cardId: string, newTags: string[]) {
        setSaving((prev) => ({ ...prev, [cardId]: true }));
        try {
            const supabase = supabaseBrowser();
            const { error } = await supabase.from("curated_cards").update({ tags: newTags }).eq("card_id", cardId);
            if (error) throw error;

            setAllCards((prev) => prev.map((c) => (c.card_id === cardId ? { ...c, tags: newTags } : c)));
            alert("✅ タグを保存しました");
        } catch (err: any) {
            console.error("Update tags error:", err);
            alert("❌ 保存失敗: " + (err?.message || "unknown"));
        } finally {
            setSaving((prev) => ({ ...prev, [cardId]: false }));
        }
    }

    function handleTagInput(cardId: string, value: string) {
        const newTags = value
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean);

        setAllCards((prev) => prev.map((c) => (c.card_id === cardId ? { ...c, tags: newTags } : c)));
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
                    <div className="mt-4 text-lg font-bold text-gray-700">カード読み込み中...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-3xl font-black text-gray-900 mb-2">🎨 カード管理</h1>
                    <p className="text-gray-600">カード画像にタグを付けて推薦精度を向上させます</p>
                </div>

                {/* Filters */}
                <div className="bg-white rounded-xl border shadow-sm p-4 mb-6">
                    <div className="flex items-center gap-4">
                        <span className="text-sm font-bold text-gray-700">フィルタ:</span>

                        <button
                            onClick={() => setFilter("all")}
                            className={`rounded-lg px-4 py-2 text-sm font-bold transition-all ${filter === "all" ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                }`}
                        >
                            全件（{allCards.length}）
                        </button>

                        <button
                            onClick={() => setFilter("no-tags")}
                            className={`rounded-lg px-4 py-2 text-sm font-bold transition-all ${filter === "no-tags" ? "bg-orange-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                }`}
                        >
                            タグ無しのみ（{noTagCount}）
                        </button>

                        <button
                            onClick={loadCards}
                            className="ml-auto rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
                        >
                            🔄 再読込
                        </button>
                    </div>
                </div>

                {/* Cards Grid */}
                {cards.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-xl border">
                        <div className="text-4xl mb-3 opacity-30">📦</div>
                        <div className="text-lg font-bold text-gray-900 mb-2">カードがありません</div>
                        <div className="text-sm text-gray-600">
                            {filter === "no-tags" ? "全てのカードにタグが付いています" : "カードをインポートしてください"}
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {cards.map((card) => (
                            <div
                                key={card.card_id}
                                className="bg-white rounded-xl border shadow-sm overflow-hidden hover:shadow-lg transition-shadow"
                            >
                                {/* Image */}
                                <div className="relative aspect-square bg-gray-100">
                                    <img
                                        src={card.image_url}
                                        alt={card.card_id}
                                        className="absolute inset-0 w-full h-full object-cover"
                                        onError={(e) => {
                                            e.currentTarget.src =
                                                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect fill='%23f3f4f6' width='400' height='400'/%3E%3Ctext fill='%239ca3af' x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='20'%3ENo Image%3C/text%3E%3C/svg%3E";
                                        }}
                                    />
                                </div>

                                {/* Card Info */}
                                <div className="p-4">
                                    <div className="text-xs font-mono text-gray-500 mb-3 break-all">{card.card_id}</div>

                                    {/* Current Tags */}
                                    {card.tags && card.tags.length > 0 && (
                                        <div className="mb-3">
                                            <div className="text-xs font-bold text-gray-700 mb-1">現在のタグ:</div>
                                            <div className="flex flex-wrap gap-1">
                                                {card.tags.map((tag, idx) => (
                                                    <span
                                                        key={idx}
                                                        className="rounded-full bg-purple-100 border border-purple-300 px-2 py-0.5 text-xs font-bold text-purple-700"
                                                    >
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Tag Input (controlled) */}
                                    <div className="mb-3">
                                        <label className="block text-xs font-bold text-gray-700 mb-1">タグ編集（カンマ区切り）:</label>
                                        <input
                                            type="text"
                                            value={card.tags?.join(", ") || ""}
                                            onChange={(e) => handleTagInput(card.card_id, e.target.value)}
                                            placeholder="jacket, denim, blue"
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
                                        />
                                    </div>

                                    {/* Save Button */}
                                    <button
                                        onClick={() => updateTags(card.card_id, card.tags)}
                                        disabled={saving[card.card_id]}
                                        className="w-full rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {saving[card.card_id] ? "保存中..." : "💾 保存"}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
