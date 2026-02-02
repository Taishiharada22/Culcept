// app/api/stylist/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { buildUserProfile } from "@/lib/recommendations/content-based";

export const runtime = "nodejs";

interface CardSuggestion {
    card_id: string;
    image_url: string;
    tags: string[];
    reason: string;
}

// スタイルキーワードマッピング
const STYLE_KEYWORDS: Record<string, string[]> = {
    casual: ["casual", "tshirt", "jeans", "sneakers", "hoodie", "joggers"],
    formal: ["formal", "blazer", "dress", "oxford", "loafers", "trench"],
    street: ["street", "streetwear", "hoodie", "bomber", "sneakers", "graphic", "cargo"],
    minimal: ["minimal", "black", "white", "grey", "clean", "simple"],
    vintage: ["vintage", "retro", "classic", "leather", "denim", "boots"],
    sporty: ["sport", "joggers", "sneakers", "windbreaker", "athletic"],
    smart: ["smart", "chinos", "polo", "oxford", "loafers", "blazer"],
};

// 日本語キーワードからスタイルを検出
const JP_STYLE_MAP: Record<string, string[]> = {
    カジュアル: ["casual"],
    フォーマル: ["formal"],
    ストリート: ["street"],
    ミニマル: ["minimal"],
    ヴィンテージ: ["vintage"],
    ビンテージ: ["vintage"],
    スポーティ: ["sporty"],
    スマート: ["smart"],
    シンプル: ["minimal"],
    きれいめ: ["smart", "formal"],
    モノトーン: ["minimal", "black", "white"],
    デニム: ["denim", "jeans"],
    レザー: ["leather"],
    アウター: ["jacket", "coat", "outerwear"],
    トップス: ["shirt", "tops", "sweater"],
    ボトムス: ["pants", "bottoms", "jeans"],
};

function detectStyles(message: string): string[] {
    const lowerMessage = message.toLowerCase();
    const detectedStyles: Set<string> = new Set();

    // 日本語キーワードチェック
    for (const [jp, styles] of Object.entries(JP_STYLE_MAP)) {
        if (message.includes(jp)) {
            styles.forEach((s) => detectedStyles.add(s));
        }
    }

    // 英語キーワードチェック
    for (const [style, keywords] of Object.entries(STYLE_KEYWORDS)) {
        for (const kw of keywords) {
            if (lowerMessage.includes(kw)) {
                detectedStyles.add(style);
                break;
            }
        }
    }

    return [...detectedStyles];
}

function generateResponse(
    styles: string[],
    suggestions: CardSuggestion[],
    userTags: string[]
): string {
    if (suggestions.length === 0) {
        return "申し訳ありません、ご希望に合うアイテムが見つかりませんでした。別のスタイルやキーワードでお試しください！";
    }

    const styleNames: Record<string, string> = {
        casual: "カジュアル",
        formal: "フォーマル",
        street: "ストリート",
        minimal: "ミニマル",
        vintage: "ヴィンテージ",
        sporty: "スポーティ",
        smart: "スマートカジュアル",
    };

    const detectedStyleText = styles
        .map((s) => styleNames[s] || s)
        .filter(Boolean)
        .join("・");

    let response = "";

    if (detectedStyleText) {
        response += `${detectedStyleText}スタイルですね！✨\n\n`;
    }

    if (userTags.length > 0) {
        response += `あなたの好みの「${userTags.slice(0, 3).join("」「")}」も考慮して、`;
    }

    response += `${suggestions.length}点のおすすめを選びました👇\n\n`;

    response += "これらのアイテムを組み合わせると素敵なコーデになりますよ！";

    if (suggestions.length >= 2) {
        response += "\n\n💡 コーデのポイント: ";
        if (styles.includes("minimal")) {
            response += "色数を抑えて、シルエットを意識するとよりミニマルに仕上がります。";
        } else if (styles.includes("street")) {
            response += "オーバーサイズ感を意識して、スニーカーで足元をキメましょう。";
        } else if (styles.includes("formal")) {
            response += "サイズ感をジャストに合わせて、清潔感を大切に。";
        } else {
            response += "バランスよく組み合わせて、自分らしさを出してみてください。";
        }
    }

    return response;
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        const { message } = await request.json();

        if (!message) {
            return NextResponse.json({ error: "Message required" }, { status: 400 });
        }

        // スタイル検出
        const detectedStyles = detectStyles(message);

        // ユーザープロファイル取得（ログイン時のみ）
        let userTags: string[] = [];
        if (auth?.user) {
            const profile = await buildUserProfile(auth.user.id);
            userTags = [...profile.tagPreferences.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([tag]) => tag);
        }

        // 検索するタグを決定
        const searchTags: string[] = [];

        // スタイルに基づくタグ
        detectedStyles.forEach((style) => {
            const keywords = STYLE_KEYWORDS[style];
            if (keywords) {
                searchTags.push(...keywords.slice(0, 3));
            }
        });

        // ユーザーの好みタグも追加
        if (userTags.length > 0) {
            searchTags.push(...userTags.slice(0, 2));
        }

        // タグがない場合はデフォルト
        if (searchTags.length === 0) {
            searchTags.push("casual", "jacket", "shirt");
        }

        // カードを検索
        const { data: cards } = await supabase
            .from("curated_cards")
            .select("card_id, image_url, tags")
            .eq("is_active", true)
            .overlaps("tags", searchTags)
            .limit(50);

        // スコアリング
        const scoredCards =
            cards?.map((card) => {
                let score = 0;
                const matchedTags: string[] = [];

                card.tags?.forEach((tag: string) => {
                    if (searchTags.includes(tag)) {
                        score += 2;
                        matchedTags.push(tag);
                    }
                    if (userTags.includes(tag)) {
                        score += 1;
                    }
                });

                return { ...card, score, matchedTags };
            }) || [];

        // トップ4を選択（多様性を確保）
        scoredCards.sort((a, b) => b.score - a.score);

        const selectedCards: typeof scoredCards = [];
        const usedCategories = new Set<string>();

        for (const card of scoredCards) {
            if (selectedCards.length >= 4) break;

            const category = card.tags?.find((t: string) =>
                ["jacket", "shirt", "pants", "shoes", "accessories"].includes(t)
            );

            if (!category || !usedCategories.has(category)) {
                selectedCards.push(card);
                if (category) usedCategories.add(category);
            }
        }

        // 提案を作成
        const suggestions: CardSuggestion[] = selectedCards.map((card) => ({
            card_id: card.card_id,
            image_url: card.image_url,
            tags: card.tags || [],
            reason:
                card.matchedTags.length > 0
                    ? `${card.matchedTags.slice(0, 2).join(" + ")}にマッチ`
                    : "おすすめアイテム",
        }));

        // レスポンス生成
        const responseMessage = generateResponse(detectedStyles, suggestions, userTags);

        return NextResponse.json({
            message: responseMessage,
            suggestions,
            detected_styles: detectedStyles,
        });
    } catch (error) {
        console.error("Stylist chat error:", error);
        return NextResponse.json(
            { error: "Internal error", message: "エラーが発生しました。" },
            { status: 500 }
        );
    }
}
