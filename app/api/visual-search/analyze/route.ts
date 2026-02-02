// app/api/visual-search/analyze/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

// 色検出用のカラーマップ
const COLOR_KEYWORDS = [
    "black",
    "white",
    "grey",
    "gray",
    "navy",
    "blue",
    "red",
    "green",
    "olive",
    "brown",
    "tan",
    "beige",
    "cream",
    "burgundy",
    "pink",
    "orange",
    "yellow",
    "purple",
    "indigo",
];

// スタイルキーワード
const STYLE_KEYWORDS = [
    "casual",
    "formal",
    "street",
    "streetwear",
    "minimal",
    "vintage",
    "retro",
    "sporty",
    "smart",
    "classic",
    "modern",
    "elegant",
];

// アイテムキーワード
const ITEM_KEYWORDS = [
    "jacket",
    "blazer",
    "coat",
    "hoodie",
    "sweater",
    "cardigan",
    "shirt",
    "tshirt",
    "polo",
    "pants",
    "jeans",
    "chinos",
    "shorts",
    "skirt",
    "dress",
    "sneakers",
    "boots",
    "loafers",
    "sandals",
    "bag",
    "backpack",
    "hat",
    "cap",
    "scarf",
    "watch",
    "sunglasses",
];

/**
 * 画像からスタイルを分析（シンプル版）
 *
 * 注: 実際のAI画像分析は外部API（OpenAI Vision, Google Cloud Vision等）を使用
 * ここではデモ用にランダム/固定値を返す
 */
async function analyzeImage(imageData: string): Promise<{
    detected_styles: string[];
    detected_colors: string[];
    detected_items: string[];
}> {
    // デモ用: ランダムに特徴を検出
    // 本番環境では OpenAI Vision API や Google Cloud Vision を使用

    // Base64データの簡易的なハッシュを使って一貫した結果を返す
    const hash = imageData.slice(-100).split("").reduce((a, b) => a + b.charCodeAt(0), 0);

    const pickRandom = <T>(arr: T[], count: number, seed: number): T[] => {
        const shuffled = [...arr].sort(() => ((seed + arr.indexOf(arr[0])) % 2) - 0.5);
        return shuffled.slice(0, count);
    };

    return {
        detected_styles: pickRandom(STYLE_KEYWORDS, 2, hash),
        detected_colors: pickRandom(COLOR_KEYWORDS, 3, hash + 1),
        detected_items: pickRandom(ITEM_KEYWORDS, 3, hash + 2),
    };
}

export async function POST(request: NextRequest) {
    try {
        const { image } = await request.json();

        if (!image) {
            return NextResponse.json({ error: "Image required" }, { status: 400 });
        }

        // 画像を分析
        const analysis = await analyzeImage(image);

        // 検出した特徴に基づいてカードを検索
        const supabase = await supabaseServer();

        const searchTags = [
            ...analysis.detected_colors,
            ...analysis.detected_items,
            ...analysis.detected_styles,
        ];

        const { data: cards } = await supabase
            .from("curated_cards")
            .select("card_id, image_url, tags")
            .eq("is_active", true)
            .overlaps("tags", searchTags)
            .limit(100);

        // スコアリング
        const scoredCards =
            cards?.map((card) => {
                let score = 0;

                card.tags?.forEach((tag: string) => {
                    if (analysis.detected_colors.includes(tag)) score += 3;
                    if (analysis.detected_items.includes(tag)) score += 2;
                    if (analysis.detected_styles.includes(tag)) score += 1;
                });

                return {
                    ...card,
                    match_score: score / (searchTags.length * 2), // 0-1に正規化
                };
            }) || [];

        // トップ8を選択
        scoredCards.sort((a, b) => b.match_score - a.match_score);
        const suggestions = scoredCards.slice(0, 8);

        return NextResponse.json({
            detected_styles: analysis.detected_styles,
            detected_colors: analysis.detected_colors,
            detected_items: analysis.detected_items,
            suggestions,
        });
    } catch (error) {
        console.error("Visual search error:", error);
        return NextResponse.json(
            { error: "Analysis failed" },
            { status: 500 }
        );
    }
}
