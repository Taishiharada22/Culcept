// app/api/style-profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const STYLE_KEYWORDS: Record<string, string[]> = {
    casual: ["casual", "tshirt", "jeans", "sneakers", "hoodie", "joggers"],
    formal: ["formal", "blazer", "dress", "oxford", "loafers", "trench"],
    street: ["street", "streetwear", "hoodie", "bomber", "sneakers", "graphic", "cargo"],
    minimal: ["minimal", "black", "white", "grey", "clean", "simple"],
    vintage: ["vintage", "retro", "classic", "leather", "denim", "boots"],
    sporty: ["sport", "joggers", "sneakers", "windbreaker", "athletic"],
    smart: ["smart", "chinos", "polo", "oxford", "loafers", "blazer"],
};

const COLOR_MAP: Record<string, string> = {
    black: "#1a1a1a",
    white: "#f5f5f5",
    navy: "#1e3a5f",
    blue: "#4a90d9",
    gray: "#6b7280",
    brown: "#8b4513",
    green: "#2d5a27",
    red: "#c41e3a",
    pink: "#f472b6",
    beige: "#d4c4b0",
};

/**
 * スタイルプロファイル取得
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // スワイプ履歴を取得
        const { data: impressions } = await supabase
            .from("impressions")
            .select(`
                action,
                created_at,
                curated_cards (
                    tags,
                    title
                )
            `)
            .eq("user_id", auth.user.id)
            .order("created_at", { ascending: false })
            .limit(500);

        if (!impressions || impressions.length < 10) {
            return NextResponse.json({
                profile: null,
                history: null,
                message: "Not enough data",
            });
        }

        // 統計計算
        const likes = impressions.filter((i) => i.action === "like");
        const dislikes = impressions.filter((i) => i.action === "dislike");

        // スタイル分析
        const styleCounts: Record<string, number> = {};
        const colorCounts: Record<string, number> = {};

        likes.forEach((imp) => {
            const tags = (imp.curated_cards as any)?.tags || [];

            // スタイル検出
            Object.entries(STYLE_KEYWORDS).forEach(([style, keywords]) => {
                if (tags.some((t: string) => keywords.includes(t.toLowerCase()))) {
                    styleCounts[style] = (styleCounts[style] || 0) + 1;
                }
            });

            // 色検出
            Object.keys(COLOR_MAP).forEach((color) => {
                if (tags.some((t: string) => t.toLowerCase().includes(color))) {
                    colorCounts[color] = (colorCounts[color] || 0) + 1;
                }
            });
        });

        // スタイル分布を計算
        const totalStylePoints = Object.values(styleCounts).reduce((a, b) => a + b, 0) || 1;
        const dominantStyles = Object.entries(styleCounts)
            .map(([style, count]) => ({
                style,
                score: Math.round((count / totalStylePoints) * 100),
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);

        // 足りない場合はデフォルトを追加
        if (dominantStyles.length === 0) {
            dominantStyles.push({ style: "casual", score: 50 });
        }

        // カラー分布
        const colorPreferences = Object.entries(colorCounts)
            .map(([color, count]) => ({
                color: COLOR_MAP[color] || color,
                count,
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 6);

        // 価格帯（仮）
        const priceRange = {
            min: 3000,
            max: 30000,
            avg: 12000,
        };

        // スタイル進化（月別の傾向を簡易計算）
        const monthlyStyles: Record<string, Record<string, number>> = {};
        likes.forEach((imp) => {
            const month = new Date(imp.created_at).toISOString().slice(0, 7);
            const tags = (imp.curated_cards as any)?.tags || [];

            if (!monthlyStyles[month]) {
                monthlyStyles[month] = {};
            }

            Object.entries(STYLE_KEYWORDS).forEach(([style, keywords]) => {
                if (tags.some((t: string) => keywords.includes(t.toLowerCase()))) {
                    monthlyStyles[month][style] = (monthlyStyles[month][style] || 0) + 1;
                }
            });
        });

        const styleEvolution = Object.entries(monthlyStyles)
            .map(([date, styles]) => {
                const topStyle = Object.entries(styles).sort((a, b) => b[1] - a[1])[0];
                return {
                    date,
                    style: topStyle?.[0] || "casual",
                };
            })
            .slice(0, 6);

        // ファッション年齢を計算（スタイルに基づく）
        const styleAgeMap: Record<string, number> = {
            street: 22,
            sporty: 25,
            casual: 28,
            smart: 32,
            minimal: 30,
            formal: 35,
            vintage: 27,
        };
        const avgAge = dominantStyles.reduce((sum, s) => {
            return sum + (styleAgeMap[s.style] || 28) * (s.score / 100);
        }, 0);

        // 季節傾向
        const seasonalTrends = [
            { season: "spring", styles: ["casual", "minimal"] },
            { season: "summer", styles: ["casual", "street"] },
            { season: "autumn", styles: ["smart", "vintage"] },
            { season: "winter", styles: ["formal", "minimal"] },
        ];

        // AI洞察
        const recommendations = [];
        const topStyle = dominantStyles[0]?.style;

        if (topStyle === "casual") {
            recommendations.push({
                text: "カジュアルが好きなあなたには、スマートカジュアルにステップアップするのがおすすめ！",
                confidence: 0.85,
            });
        }
        if (topStyle === "street") {
            recommendations.push({
                text: "ストリートの中でも、モノトーンを増やすとより洗練された印象に",
                confidence: 0.78,
            });
        }
        if (colorCounts["black"] > 3) {
            recommendations.push({
                text: "黒が多めですね。差し色を加えるとコーデにメリハリが出ます",
                confidence: 0.72,
            });
        }
        recommendations.push({
            text: "あなたの好みに合った新着アイテムを常にチェックしています",
            confidence: 0.95,
        });

        return NextResponse.json({
            profile: {
                userId: auth.user.id,
                dominantStyles,
                colorPreferences,
                priceRange,
                brandAffinity: [],
                seasonalTrends,
                fashionAge: Math.round(avgAge),
                styleEvolution,
                recommendations,
            },
            history: {
                total: impressions.length,
                likes: likes.length,
                dislikes: dislikes.length,
                likeRate: Math.round((likes.length / impressions.length) * 100),
            },
        });
    } catch (error) {
        console.error("Style profile error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
