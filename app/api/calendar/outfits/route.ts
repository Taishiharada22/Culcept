// app/api/calendar/outfits/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface WeatherCondition {
    temp: number;
    condition: "sunny" | "cloudy" | "rainy" | "snowy";
    humidity: number;
}

// 天気に基づいたタグ選択
const WEATHER_TAGS: Record<string, string[]> = {
    sunny: ["tshirt", "shorts", "sneakers", "casual", "light"],
    cloudy: ["jacket", "jeans", "casual", "layered"],
    rainy: ["waterproof", "boots", "jacket", "dark"],
    snowy: ["coat", "boots", "warm", "layered", "outerwear"],
};

// 気温に基づいたタグ選択
function getTempTags(temp: number): string[] {
    if (temp >= 25) return ["tshirt", "shorts", "light", "summer"];
    if (temp >= 20) return ["shirt", "light", "casual"];
    if (temp >= 15) return ["jacket", "layered", "casual"];
    if (temp >= 10) return ["coat", "sweater", "warm"];
    return ["coat", "warm", "winter", "boots"];
}

// 疑似天気予報生成（実際はAPIを使用）
function generateWeather(date: Date): WeatherCondition {
    const day = date.getDate();
    const month = date.getMonth();

    // 季節に基づいた基本気温
    let baseTemp = 20;
    if (month >= 6 && month <= 8) baseTemp = 28; // 夏
    else if (month >= 12 || month <= 2) baseTemp = 8; // 冬
    else if (month >= 3 && month <= 5) baseTemp = 18; // 春
    else baseTemp = 18; // 秋

    // 日による変動
    const variation = Math.sin(day * 0.5) * 5;
    const temp = Math.round(baseTemp + variation);

    // 天気条件
    const conditions: WeatherCondition["condition"][] = ["sunny", "cloudy", "rainy", "sunny"];
    const conditionIndex = (day + month) % conditions.length;
    const condition = conditions[conditionIndex];

    return {
        temp,
        condition,
        humidity: 50 + Math.round(Math.random() * 30),
    };
}

/**
 * カレンダーの日別コーデ提案を取得
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        const today = new Date();
        const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

        // 今月の日数を取得
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

        // ユーザーの好みを取得（ログイン時）
        let userTags: string[] = [];
        if (auth?.user) {
            const { data: impressions } = await supabase
                .from("impressions")
                .select("curated_cards(tags)")
                .eq("user_id", auth.user.id)
                .eq("action", "like")
                .limit(50);

            const tagCounts: Record<string, number> = {};
            impressions?.forEach((imp) => {
                const tags = (imp.curated_cards as any)?.tags || [];
                tags.forEach((t: string) => {
                    tagCounts[t] = (tagCounts[t] || 0) + 1;
                });
            });

            userTags = Object.entries(tagCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([tag]) => tag);
        }

        // 各日のプランを生成
        const days = [];

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(today.getFullYear(), today.getMonth(), day);
            const dateStr = date.toISOString().split("T")[0];
            const weather = generateWeather(date);

            // 天気と気温に基づいたタグ
            const weatherTags = WEATHER_TAGS[weather.condition] || [];
            const tempTags = getTempTags(weather.temp);

            // 検索タグを組み合わせ
            const searchTags = [...new Set([...weatherTags, ...tempTags, ...userTags.slice(0, 2)])];

            // アイテムを取得
            const { data: cards } = await supabase
                .from("curated_cards")
                .select("card_id, image_url, title, tags")
                .eq("is_active", true)
                .overlaps("tags", searchTags)
                .limit(20);

            // スコアリング
            const scoredCards = (cards || []).map((card) => {
                let score = 0;
                card.tags?.forEach((t: string) => {
                    if (weatherTags.includes(t)) score += 3;
                    if (tempTags.includes(t)) score += 2;
                    if (userTags.includes(t)) score += 1;
                });
                return { ...card, score };
            });

            scoredCards.sort((a, b) => b.score - a.score);

            // カテゴリ別に選択（トップス、ボトムス、アウター）
            const outfit: {
                id: string;
                image_url: string;
                name: string;
                reason: string;
            }[] = [];

            const categoryMap: Record<string, string[]> = {
                tops: ["shirt", "tshirt", "sweater", "hoodie", "tops"],
                bottoms: ["jeans", "pants", "shorts", "bottoms"],
                outerwear: ["jacket", "coat", "outerwear"],
            };

            Object.entries(categoryMap).forEach(([category, keywords]) => {
                const item = scoredCards.find((c) =>
                    c.tags?.some((t: string) => keywords.includes(t))
                );
                if (item && outfit.length < 3) {
                    let reason = "";
                    if (weather.condition === "rainy") reason = "雨の日でも快適";
                    else if (weather.temp >= 25) reason = "暑い日にぴったり";
                    else if (weather.temp <= 10) reason = "寒さ対策に";
                    else reason = "今日のスタイルに合う";

                    outfit.push({
                        id: item.card_id,
                        image_url: item.image_url,
                        name: item.title || "Item",
                        reason,
                    });
                }
            });

            // 足りない場合は追加
            if (outfit.length < 3) {
                scoredCards.slice(0, 3 - outfit.length).forEach((card) => {
                    if (!outfit.find((o) => o.id === card.card_id)) {
                        outfit.push({
                            id: card.card_id,
                            image_url: card.image_url,
                            name: card.title || "Item",
                            reason: "おすすめアイテム",
                        });
                    }
                });
            }

            // イベント（サンプル）
            let event: string | undefined;
            if (day === 14) event = "バレンタイン";
            if (day === 25 && today.getMonth() === 11) event = "クリスマス";
            if (date.getDay() === 0) event = "週末";
            if (date.getDay() === 6) event = "お出かけ日和";

            days.push({
                date: dateStr,
                weather,
                event,
                outfit,
            });
        }

        return NextResponse.json({
            month,
            days,
        });
    } catch (error) {
        console.error("Calendar error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
