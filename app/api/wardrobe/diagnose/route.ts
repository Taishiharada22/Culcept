// app/api/wardrobe/diagnose/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface WardrobeItem {
    id: string;
    image: string;
    category: string;
    color: string;
    style: string[];
}

const CATEGORY_ESSENTIALS: Record<string, number> = {
    tops: 5,
    bottoms: 3,
    outerwear: 2,
    shoes: 3,
    accessories: 2,
};

const STYLE_NAMES: Record<string, string> = {
    casual: "カジュアル",
    formal: "フォーマル",
    street: "ストリート",
    minimal: "ミニマル",
    vintage: "ヴィンテージ",
    sporty: "スポーティ",
    smart: "スマートカジュアル",
};

const COLOR_HEX: Record<string, string> = {
    black: "#1a1a1a",
    white: "#f5f5f5",
    navy: "#1e3a5f",
    blue: "#4a90d9",
    gray: "#6b7280",
    brown: "#8b4513",
    green: "#2d5a27",
    red: "#c41e3a",
    pink: "#f472b6",
    purple: "#7c3aed",
    orange: "#ea580c",
    yellow: "#eab308",
};

/**
 * ワードローブ診断
 */
export async function POST(request: NextRequest) {
    try {
        const { items }: { items: WardrobeItem[] } = await request.json();

        if (!items || items.length < 3) {
            return NextResponse.json(
                { error: "At least 3 items required" },
                { status: 400 }
            );
        }

        // カテゴリ別にカウント
        const categoryCounts: Record<string, number> = {};
        const colorCounts: Record<string, number> = {};
        const styleCounts: Record<string, number> = {};

        items.forEach((item) => {
            categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
            colorCounts[item.color] = (colorCounts[item.color] || 0) + 1;
            item.style.forEach((s) => {
                styleCounts[s] = (styleCounts[s] || 0) + 1;
            });
        });

        // 足りないカテゴリを特定
        const missing: string[] = [];
        const categoryLabels: Record<string, string> = {
            tops: "トップス",
            bottoms: "ボトムス",
            outerwear: "アウター",
            shoes: "シューズ",
            accessories: "アクセサリー",
        };

        Object.entries(CATEGORY_ESSENTIALS).forEach(([cat, min]) => {
            const count = categoryCounts[cat] || 0;
            if (count < min) {
                missing.push(`${categoryLabels[cat]}（あと${min - count}点）`);
            }
        });

        // ドミナントスタイルを特定
        const dominantStyle = Object.entries(styleCounts).sort(
            (a, b) => b[1] - a[1]
        )[0]?.[0] || "casual";

        // カラーパレット
        const topColors = Object.entries(colorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([color]) => COLOR_HEX[color] || "#gray");

        // スタイルスコア計算
        const varietyScore = Object.keys(styleCounts).length * 10;
        const colorScore = Object.keys(colorCounts).length * 8;
        const coverageScore = Object.keys(categoryCounts).length * 15;
        const totalScore = Math.min(100, varietyScore + colorScore + coverageScore);

        // おすすめアイテムを取得
        const supabase = await supabaseServer();
        const suggestTags: string[] = [];

        // 足りないカテゴリに基づいてタグを追加
        if (!categoryCounts["outerwear"] || categoryCounts["outerwear"] < 2) {
            suggestTags.push("jacket", "coat", "outerwear");
        }
        if (!categoryCounts["shoes"] || categoryCounts["shoes"] < 2) {
            suggestTags.push("sneakers", "boots", "loafers");
        }
        if (!categoryCounts["accessories"]) {
            suggestTags.push("watch", "bag", "accessories");
        }

        // スタイルに基づいてタグを追加
        if (dominantStyle) {
            suggestTags.push(dominantStyle);
        }

        // 足りない色を追加
        const missingColors = Object.keys(COLOR_HEX).filter(
            (c) => !colorCounts[c]
        );
        if (missingColors.length > 0) {
            suggestTags.push(missingColors[0]);
        }

        // カードを検索
        const { data: cards } = await supabase
            .from("curated_cards")
            .select("card_id, image_url, tags")
            .eq("is_active", true)
            .overlaps("tags", suggestTags.length > 0 ? suggestTags : ["casual"])
            .limit(20);

        // スコアリングしてトップ8を選択
        const scoredCards = (cards || []).map((card) => {
            let score = 0;
            let reason = "";

            // 足りないカテゴリにマッチ
            const cardCategory = card.tags?.find((t: string) =>
                ["jacket", "coat", "outerwear", "sneakers", "boots", "shoes", "watch", "bag"].includes(t)
            );

            if (cardCategory) {
                if (["jacket", "coat", "outerwear"].includes(cardCategory) && (!categoryCounts["outerwear"] || categoryCounts["outerwear"] < 2)) {
                    score += 10;
                    reason = "アウターが足りません";
                }
                if (["sneakers", "boots", "shoes", "loafers"].includes(cardCategory) && (!categoryCounts["shoes"] || categoryCounts["shoes"] < 2)) {
                    score += 10;
                    reason = "シューズを増やしましょう";
                }
                if (["watch", "bag", "accessories"].includes(cardCategory) && !categoryCounts["accessories"]) {
                    score += 8;
                    reason = "アクセサリーがあると◎";
                }
            }

            // スタイルマッチ
            if (card.tags?.includes(dominantStyle)) {
                score += 5;
                reason = reason || `${STYLE_NAMES[dominantStyle]}スタイルにマッチ`;
            }

            // デフォルト理由
            if (!reason) {
                reason = "コーデの幅が広がります";
            }

            return { ...card, score, reason };
        });

        scoredCards.sort((a, b) => b.score - a.score);

        const suggestions = scoredCards.slice(0, 8).map((card, i) => ({
            card_id: card.card_id,
            image_url: card.image_url,
            reason: card.reason,
            priority: i < 2 ? "high" : i < 5 ? "medium" : "low" as "high" | "medium" | "low",
        }));

        return NextResponse.json({
            items,
            missing,
            suggestions,
            styleProfile: {
                dominant: STYLE_NAMES[dominantStyle] || dominantStyle,
                colors: topColors,
                score: totalScore,
            },
        });
    } catch (error) {
        console.error("Diagnose error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
