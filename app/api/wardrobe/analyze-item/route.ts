// app/api/wardrobe/analyze-item/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// 色の検出（簡易版）
const COLOR_KEYWORDS: Record<string, string[]> = {
    black: ["black", "noir", "charcoal", "ebony"],
    white: ["white", "ivory", "cream", "off-white"],
    navy: ["navy", "dark blue", "indigo"],
    blue: ["blue", "denim", "cobalt", "sky"],
    gray: ["gray", "grey", "silver", "slate"],
    brown: ["brown", "tan", "camel", "beige", "khaki"],
    green: ["green", "olive", "forest", "sage"],
    red: ["red", "burgundy", "maroon", "wine"],
    pink: ["pink", "rose", "blush"],
    purple: ["purple", "violet", "lavender"],
    orange: ["orange", "rust", "terracotta"],
    yellow: ["yellow", "mustard", "gold"],
};

// スタイルの検出
const STYLE_KEYWORDS: Record<string, string[]> = {
    casual: ["casual", "relaxed", "everyday", "tshirt", "jeans", "sneakers"],
    formal: ["formal", "business", "dress", "suit", "blazer", "oxford"],
    street: ["street", "urban", "hoodie", "graphic", "oversized", "sneakers"],
    minimal: ["minimal", "clean", "simple", "basic", "monochrome"],
    vintage: ["vintage", "retro", "classic", "denim", "leather"],
    sporty: ["sporty", "athletic", "active", "joggers", "track"],
    smart: ["smart", "smart casual", "chinos", "polo", "loafers"],
};

/**
 * 個別アイテムの分析
 */
export async function POST(request: NextRequest) {
    try {
        const { image, category } = await request.json();

        if (!image || !category) {
            return NextResponse.json(
                { error: "Image and category required" },
                { status: 400 }
            );
        }

        // 画像からランダムに色とスタイルを推定（実際はAI APIを使用）
        // ここでは簡易的にカテゴリに基づいて推定
        const colors = Object.keys(COLOR_KEYWORDS);
        const styles = Object.keys(STYLE_KEYWORDS);

        // カテゴリに基づいたスタイル推定
        const categoryStyleMap: Record<string, string[]> = {
            tops: ["casual", "formal", "street", "minimal"],
            bottoms: ["casual", "formal", "street", "minimal"],
            outerwear: ["casual", "formal", "street", "vintage"],
            shoes: ["casual", "formal", "street", "sporty"],
            accessories: ["minimal", "street", "vintage", "formal"],
        };

        // ランダム選択（実際のAI分析の代わり）
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        const categoryStyles = categoryStyleMap[category] || styles;
        const randomStyles = categoryStyles
            .sort(() => Math.random() - 0.5)
            .slice(0, 2);

        return NextResponse.json({
            color: randomColor,
            style: randomStyles,
            category,
            confidence: 0.85,
        });
    } catch (error) {
        console.error("Analyze item error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
