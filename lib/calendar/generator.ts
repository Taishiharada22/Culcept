// lib/calendar/generator.ts
// AI自動コーディネート生成ロジック

import { SupabaseClient } from "@supabase/supabase-js";

export interface WeatherInput {
    temp: number;
    condition: "sunny" | "cloudy" | "rainy" | "snowy" | "windy";
    humidity?: number;
}

export interface CalendarEvent {
    event_type: string;
    event_name: string;
}

export interface OutfitItem {
    card_id: string;
    category: string;
    image_url: string;
    title: string;
    reason: string;
}

export interface GeneratedOutfit {
    items: OutfitItem[];
    style_notes: string;
}

// 天気に基づく必須カテゴリを決定
export function getRequiredCategories(weather: WeatherInput): string[] {
    const categories: string[] = ["tops", "bottoms"];

    if (weather.temp < 10) {
        categories.push("outerwear");
        categories.push("accessories"); // マフラー等
    } else if (weather.temp < 20) {
        categories.push("light_outerwear"); // カーディガン、軽いジャケット
    }

    if (weather.condition === "rainy") {
        categories.push("rain_gear");
    }

    return categories;
}

// イベントタイプに基づくスタイル修飾子
export const EVENT_STYLE_MAP: Record<string, {
    formality: "high" | "smart_casual" | "casual" | "low";
    preferredTags: string[];
    avoidTags: string[];
}> = {
    work: {
        formality: "high",
        preferredTags: ["formal", "office", "business", "clean", "professional"],
        avoidTags: ["casual", "sporty", "streetwear"],
    },
    meeting: {
        formality: "high",
        preferredTags: ["formal", "clean", "professional", "elegant"],
        avoidTags: ["casual", "loud"],
    },
    date: {
        formality: "smart_casual",
        preferredTags: ["romantic", "clean", "smart", "stylish", "date-worthy"],
        avoidTags: ["formal", "sporty"],
    },
    party: {
        formality: "smart_casual",
        preferredTags: ["stylish", "bold", "statement", "dressy"],
        avoidTags: ["casual", "minimal"],
    },
    casual: {
        formality: "casual",
        preferredTags: ["casual", "relaxed", "comfortable", "everyday"],
        avoidTags: ["formal"],
    },
    outdoor: {
        formality: "low",
        preferredTags: ["outdoor", "sporty", "functional", "comfortable"],
        avoidTags: ["formal", "delicate"],
    },
    sports: {
        formality: "low",
        preferredTags: ["sporty", "athletic", "functional", "active"],
        avoidTags: ["formal", "dressy"],
    },
    travel: {
        formality: "casual",
        preferredTags: ["comfortable", "functional", "versatile", "travel"],
        avoidTags: ["delicate", "high-maintenance"],
    },
};

// 季節推定
export function estimateSeason(date: Date): "spring" | "summer" | "autumn" | "winter" {
    const month = date.getMonth() + 1;
    if (month >= 3 && month <= 5) return "spring";
    if (month >= 6 && month <= 8) return "summer";
    if (month >= 9 && month <= 11) return "autumn";
    return "winter";
}

// デフォルト気温推定（季節から）
export function estimateDefaultTemp(date: Date): number {
    const season = estimateSeason(date);
    switch (season) {
        case "spring": return 15;
        case "summer": return 28;
        case "autumn": return 18;
        case "winter": return 5;
    }
}

// スタイルノート生成
export function generateStyleNotes(
    weather: WeatherInput,
    event: CalendarEvent | null,
    items: OutfitItem[]
): string {
    const notes: string[] = [];

    // 天気コメント
    if (weather.temp < 10) {
        notes.push("寒い日なので暖かいアウターをチョイス");
    } else if (weather.temp > 25) {
        notes.push("暑い日なので涼しげなコーデに");
    }

    if (weather.condition === "rainy") {
        notes.push("雨対策も忘れずに");
    }

    // イベントコメント
    if (event) {
        const style = EVENT_STYLE_MAP[event.event_type];
        if (style?.formality === "high") {
            notes.push(`${event.event_name}にふさわしいきちんと感を意識`);
        } else if (event.event_type === "date") {
            notes.push("デートは清潔感と自分らしさのバランスが大切");
        }
    }

    // アイテム数コメント
    if (items.length >= 3) {
        notes.push(`${items.length}アイテムでバランスの取れたコーデ`);
    }

    return notes.join("。") + "。";
}

// コーディネート生成のメイン関数
export async function generateDailyOutfit(
    supabase: SupabaseClient,
    userId: string,
    date: Date,
    weather: WeatherInput,
    event: CalendarEvent | null,
    recentOutfitCardIds: string[] = []
): Promise<GeneratedOutfit> {
    // 1. ユーザーの好みを取得
    const { data: userPrefs } = await supabase
        .from("recommendation_impressions")
        .select("tags, action")
        .eq("user_id", userId)
        .in("action", ["like", "dislike"])
        .order("created_at", { ascending: false })
        .limit(100);

    const likedTags = new Set<string>();
    const dislikedTags = new Set<string>();

    for (const imp of userPrefs ?? []) {
        const tags = imp.tags ?? [];
        if (imp.action === "like") {
            tags.forEach((t: string) => likedTags.add(t));
        } else {
            tags.forEach((t: string) => dislikedTags.add(t));
        }
    }

    // 2. 候補カードを取得
    const { data: candidateCards } = await supabase
        .from("curated_cards")
        .select("card_id, image_url, tags, category")
        .eq("is_active", true)
        .limit(200);

    if (!candidateCards || candidateCards.length === 0) {
        return { items: [], style_notes: "利用可能なアイテムがありません" };
    }

    // 3. スコアリングと選択
    const eventStyle = event ? EVENT_STYLE_MAP[event.event_type] : null;

    const scoredCards = candidateCards
        .filter(card => !recentOutfitCardIds.includes(card.card_id)) // 重複回避
        .map(card => {
            let score = 50; // ベーススコア
            const tags = card.tags ?? [];

            // ユーザー好み
            for (const tag of tags) {
                if (likedTags.has(tag)) score += 10;
                if (dislikedTags.has(tag)) score -= 15;
            }

            // イベントスタイル
            if (eventStyle) {
                for (const tag of tags) {
                    if (eventStyle.preferredTags.includes(tag)) score += 15;
                    if (eventStyle.avoidTags.includes(tag)) score -= 20;
                }
            }

            // 季節適合
            const season = estimateSeason(date);
            const seasonTags: Record<string, string[]> = {
                spring: ["spring", "light", "pastel"],
                summer: ["summer", "light", "cool", "breathable"],
                autumn: ["autumn", "fall", "layering"],
                winter: ["winter", "warm", "cozy"],
            };
            for (const tag of tags) {
                if (seasonTags[season]?.includes(tag)) score += 5;
            }

            // ランダム性を少し追加
            score += Math.random() * 10;

            return { ...card, score };
        })
        .sort((a, b) => b.score - a.score);

    // 4. カテゴリ別に選択
    const selectedItems: OutfitItem[] = [];
    const usedCategories = new Set<string>();

    const requiredCategories = getRequiredCategories(weather);

    for (const category of requiredCategories) {
        const categoryCard = scoredCards.find(c => {
            const cardCategory = c.category ?? "other";
            return cardCategory.includes(category) && !usedCategories.has(c.card_id);
        });

        if (categoryCard) {
            usedCategories.add(categoryCard.card_id);
            selectedItems.push({
                card_id: categoryCard.card_id,
                category: category,
                image_url: categoryCard.image_url ?? "",
                title: `${category} item`,
                reason: generateItemReason(category, weather, event),
            });
        }
    }

    // 5. 足りない場合は上位からフィル
    while (selectedItems.length < 3 && scoredCards.length > usedCategories.size) {
        const nextCard = scoredCards.find(c => !usedCategories.has(c.card_id));
        if (nextCard) {
            usedCategories.add(nextCard.card_id);
            selectedItems.push({
                card_id: nextCard.card_id,
                category: nextCard.category ?? "other",
                image_url: nextCard.image_url ?? "",
                title: "Recommended item",
                reason: "あなたの好みにマッチ",
            });
        } else {
            break;
        }
    }

    // 6. スタイルノート生成
    const styleNotes = generateStyleNotes(weather, event, selectedItems);

    return {
        items: selectedItems,
        style_notes: styleNotes,
    };
}

function generateItemReason(
    category: string,
    weather: WeatherInput,
    event: CalendarEvent | null
): string {
    if (category === "outerwear" && weather.temp < 10) {
        return "寒さ対策に";
    }
    if (category === "light_outerwear" && weather.temp < 20) {
        return "温度調節しやすく";
    }
    if (category === "rain_gear" && weather.condition === "rainy") {
        return "雨の日も快適に";
    }
    if (event?.event_type === "work") {
        return "オフィスにふさわしい";
    }
    if (event?.event_type === "date") {
        return "デートにぴったり";
    }
    return "コーデのバランスを考えて";
}
