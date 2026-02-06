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
    romantic: ["romantic", "floral", "lace", "soft", "feminine"],
    edgy: ["edgy", "leather", "black", "studs", "rock", "punk"],
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
    cream: "#fffdd0",
    khaki: "#c3b091",
};

// パーソナルカラーシーズン判定
const PERSONAL_COLOR_SEASONS: Record<string, { colors: string[]; description: string; recommendedColors: string[] }> = {
    spring: {
        colors: ["coral", "peach", "warm", "yellow", "orange", "cream", "ivory"],
        description: "明るくて暖かみのある色が似合う「スプリング」タイプ",
        recommendedColors: ["コーラルピンク", "アイボリー", "キャメル", "ターコイズ", "オレンジ"],
    },
    summer: {
        colors: ["lavender", "rose", "cool", "gray", "blue", "pink", "mauve"],
        description: "ソフトで涼しげな色が似合う「サマー」タイプ",
        recommendedColors: ["ラベンダー", "ローズピンク", "スカイブルー", "グレイッシュブルー", "ミントグリーン"],
    },
    autumn: {
        colors: ["mustard", "rust", "olive", "brown", "terracotta", "khaki", "camel"],
        description: "深みのある暖色系が似合う「オータム」タイプ",
        recommendedColors: ["マスタード", "テラコッタ", "オリーブ", "キャメル", "ブリックレッド"],
    },
    winter: {
        colors: ["black", "white", "navy", "red", "purple", "silver", "bright"],
        description: "コントラストの効いた色が似合う「ウィンター」タイプ",
        recommendedColors: ["ブラック", "ピュアホワイト", "ロイヤルブルー", "マゼンタ", "シルバー"],
    },
};

// 体型タイプ判定用のスタイル傾向
const BODY_TYPE_STYLES: Record<string, { preferredStyles: string[]; advice: string; silhouette: string }> = {
    straight: {
        preferredStyles: ["formal", "smart", "minimal"],
        advice: "すっきりしたIラインやジャストサイズが得意。シンプルで上質なアイテムが映えます。",
        silhouette: "シンプル＆ベーシック",
    },
    wave: {
        preferredStyles: ["romantic", "casual", "soft"],
        advice: "ふんわりとした素材やウエストマークが得意。曲線を活かしたスタイリングがおすすめ。",
        silhouette: "フェミニン＆ソフト",
    },
    natural: {
        preferredStyles: ["casual", "street", "vintage"],
        advice: "ゆったりしたシルエットやラフな素材が得意。こなれ感のあるスタイリングが似合います。",
        silhouette: "リラックス＆カジュアル",
    },
};

// 骨格タイプ詳細（簡易）
const BODY_TYPE_DETAILS: Record<string, {
    name: string;
    description: string;
    strengths: string[];
    recommendedItems: string[];
    avoidItems: string[];
    materials: string[];
}> = {
    straight: {
        name: "ストレート",
        description: "上半身に厚みが出やすく、シンプルなIラインが映えるタイプ。",
        strengths: ["上品で大人っぽい印象", "ベーシックが映える", "立体的シルエットが得意"],
        recommendedItems: ["テーラードジャケット", "Vネック", "センタープレスパンツ", "ストレートデニム"],
        avoidItems: ["フリル・ギャザー", "過度な装飾", "オーバーサイズ"],
        materials: ["ハリのある素材", "上質なウール", "きれいめコットン"],
    },
    wave: {
        name: "ウェーブ",
        description: "華奢で柔らかな印象。ウエストマークや曲線が得意。",
        strengths: ["フェミニンが似合う", "軽い素材が得意", "細部のデザイン映え"],
        recommendedItems: ["ブラウス", "フレアスカート", "細身デニム", "ショート丈アウター"],
        avoidItems: ["重い素材", "長くて大きいシルエット", "ゴツい靴"],
        materials: ["柔らかい素材", "シフォン", "薄手ニット"],
    },
    natural: {
        name: "ナチュラル",
        description: "骨格のフレーム感が特徴。ラフな素材・ゆったりが得意。",
        strengths: ["カジュアルがハマる", "ラフさでおしゃれ", "素材感が映える"],
        recommendedItems: ["オーバーシャツ", "ワイドパンツ", "ざっくりニット", "ロングアウター"],
        avoidItems: ["タイトすぎる服", "華奢な小物だけでまとめる", "光沢強め素材"],
        materials: ["リネン", "デニム", "粗めニット"],
    },
};

// ワードローブ分析用のカテゴリ
const WARDROBE_CATEGORIES = [
    "tops",
    "bottoms",
    "outerwear",
    "shoes",
    "accessories",
];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
    tops: ["shirt", "tshirt", "blouse", "sweater", "hoodie", "top", "knit", "polo"],
    bottoms: ["pants", "jeans", "skirt", "shorts", "trousers", "chinos"],
    outerwear: ["jacket", "coat", "blazer", "cardigan", "vest", "parka"],
    shoes: ["sneakers", "boots", "loafers", "heels", "sandals", "oxford"],
    accessories: ["bag", "hat", "scarf", "watch", "jewelry", "belt", "sunglasses"],
};

/**
 * スタイルプロファイル取得
 */
export async function GET(request: NextRequest) {
    try {
        const lite = request.nextUrl.searchParams.get("lite") === "1";
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // スワイプ履歴を recommendation_actions から取得
        const { data: actions } = await supabase
            .from("recommendation_actions")
            .select("impression_id, action, meta, created_at, rec_version")
            .eq("user_id", auth.user.id)
            .order("created_at", { ascending: false })
            .limit(800);

        const getActionKind = (action: any): "like" | "dislike" | "neutral" | "skip" | "other" => {
            const orig = String(action?.meta?.original_action ?? "").toLowerCase();
            if (orig === "like" || orig === "dislike" || orig === "neutral" || orig === "skip") return orig as any;
            const act = String(action?.action ?? "").toLowerCase();
            if (act === "save") return "like";
            if (act === "skip") return "dislike";
            if (act === "neutral") return "neutral";
            return "other";
        };

        const likeCount = (actions ?? []).filter((a: any) => getActionKind(a) === "like").length;
        const dislikeCount = (actions ?? []).filter((a: any) => getActionKind(a) === "dislike").length;
        const neutralCount = (actions ?? []).filter((a: any) => getActionKind(a) === "neutral").length;
        const totalCount = likeCount + dislikeCount + neutralCount;

        const history = {
            total: totalCount,
            likes: likeCount,
            dislikes: dislikeCount,
            neutral: neutralCount,
            likeRate: totalCount > 0 ? Math.round((likeCount / totalCount) * 100) : 0,
        };

        if (lite) {
            return NextResponse.json({ profile: null, history });
        }

        if (!actions || actions.length < 10) {
            return NextResponse.json({
                profile: null,
                history,
                message: "Not enough data",
            });
        }

        const impressionIds = Array.from(
            new Set(
                (actions ?? [])
                    .map((a: any) => String(a.impression_id ?? ""))
                    .filter(Boolean)
            )
        );

        const { data: impressions } = await supabase
            .from("recommendation_impressions")
            .select("id, payload")
            .in("id", impressionIds);

        const impMap = new Map<string, any>();
        for (const imp of impressions ?? []) {
            impMap.set(String(imp.id), imp.payload ?? {});
        }

        // 統計計算
        const likes = (actions ?? []).filter((a: any) => getActionKind(a) === "like");
        const dislikes = (actions ?? []).filter((a: any) => getActionKind(a) === "dislike");

        // スタイル分析
        const styleCounts: Record<string, number> = {};
        const colorCounts: Record<string, number> = {};
        const categoryCounts: Record<string, number> = {};
        const prices: number[] = [];
        const likedTags: string[] = [];

        likes.forEach((action: any) => {
            const payload = impMap.get(String(action.impression_id)) || {};
            const tags = Array.isArray(payload?.tags) ? payload.tags : [];
            const price = payload?.price;

            if (price) prices.push(price);
            likedTags.push(...tags.map((t: string) => String(t).toLowerCase()));

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

            // カテゴリ検出
            Object.entries(CATEGORY_KEYWORDS).forEach(([category, keywords]) => {
                if (tags.some((t: string) => keywords.includes(t.toLowerCase()))) {
                    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
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
                name: color,
                count,
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 6);

        // パーソナルカラー判定
        const personalColorScores: Record<string, number> = {
            spring: 0,
            summer: 0,
            autumn: 0,
            winter: 0,
        };

        Object.entries(colorCounts).forEach(([color, count]) => {
            Object.entries(PERSONAL_COLOR_SEASONS).forEach(([season, data]) => {
                if (data.colors.some((c) => color.includes(c) || c.includes(color))) {
                    personalColorScores[season] += count;
                }
            });
        });

        const personalColorSeason = Object.entries(personalColorScores)
            .sort((a, b) => b[1] - a[1])[0][0];

        const personalColor = PERSONAL_COLOR_SEASONS[personalColorSeason];
        const personalColorTotal = Object.values(personalColorScores).reduce((a, b) => a + b, 0) || 1;
        const personalColorConfidence = Math.round((personalColorScores[personalColorSeason] / personalColorTotal) * 100);

        // 体型タイプ判定（好みのスタイルから推測）
        const bodyTypeScores: Record<string, number> = {
            straight: 0,
            wave: 0,
            natural: 0,
        };

        dominantStyles.forEach((style) => {
            Object.entries(BODY_TYPE_STYLES).forEach(([bodyType, data]) => {
                if (data.preferredStyles.includes(style.style)) {
                    bodyTypeScores[bodyType] += style.score;
                }
            });
        });

        const bodyType = Object.entries(bodyTypeScores)
            .sort((a, b) => b[1] - a[1])[0][0];

        const bodyTypeInfo = BODY_TYPE_STYLES[bodyType];
        const bodyTypeDetails = BODY_TYPE_DETAILS[bodyType] ?? BODY_TYPE_DETAILS.straight;
        const bodyTypeTotal = Object.values(bodyTypeScores).reduce((a, b) => a + b, 0) || 1;
        const bodyTypeConfidence = Math.round((bodyTypeScores[bodyType] / bodyTypeTotal) * 100);

        // 価格帯
        const priceRange = prices.length > 0
            ? {
                min: Math.min(...prices),
                max: Math.max(...prices),
                avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
            }
            : {
                min: 3000,
                max: 30000,
                avg: 12000,
            };

        // ワードローブ分析
        const totalCategoryItems = Object.values(categoryCounts).reduce((a, b) => a + b, 0) || 1;
        const wardrobeAnalysis = Object.entries(categoryCounts)
            .map(([category, count]) => ({
                category,
                count,
                percentage: Math.round((count / totalCategoryItems) * 100),
            }))
            .sort((a, b) => b.count - a.count);

        // ワードローブの偏りを検出
        const wardrobeGaps: string[] = [];
        const idealDistribution: Record<string, number> = {
            tops: 30,
            bottoms: 25,
            outerwear: 15,
            shoes: 15,
            accessories: 15,
        };

        Object.entries(idealDistribution).forEach(([category, ideal]) => {
            const actual = wardrobeAnalysis.find((w) => w.category === category)?.percentage || 0;
            if (actual < ideal - 10) {
                const categoryNames: Record<string, string> = {
                    tops: "トップス",
                    bottoms: "ボトムス",
                    outerwear: "アウター",
                    shoes: "シューズ",
                    accessories: "アクセサリー",
                };
                wardrobeGaps.push(categoryNames[category] || category);
            }
        });

        // スタイル進化（月別の傾向を簡易計算）
        const monthlyStyles: Record<string, Record<string, number>> = {};
        likes.forEach((imp) => {
            const month = new Date(imp.created_at).toISOString().slice(0, 7);
            const payload = impMap.get(String(imp.impression_id)) || {};
            const tags = Array.isArray(payload?.tags) ? payload.tags : [];

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
            romantic: 26,
            edgy: 24,
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

        // AI洞察（強化版）
        const recommendations = [];
        const topStyle = dominantStyles[0]?.style;

        // スタイル別アドバイス
        if (topStyle === "casual") {
            recommendations.push({
                text: "カジュアルが好きなあなたには、スマートカジュアルにステップアップするのがおすすめ！ジャケットを1枚取り入れるだけで印象が変わります。",
                confidence: 0.85,
                type: "style_upgrade",
            });
        }
        if (topStyle === "street") {
            recommendations.push({
                text: "ストリートの中でも、モノトーンを増やすとより洗練された印象に。小物で差をつけましょう。",
                confidence: 0.78,
                type: "style_refinement",
            });
        }
        if (topStyle === "minimal") {
            recommendations.push({
                text: "ミニマルスタイルを極めていますね。素材の質感にこだわると、さらにワンランク上のコーデに。",
                confidence: 0.82,
                type: "quality_focus",
            });
        }

        // カラーアドバイス
        if (colorCounts["black"] > 3) {
            recommendations.push({
                text: "黒が多めですね。差し色を1点加えるとコーデにメリハリが出ます。おすすめはあなたのパーソナルカラーに合う色です。",
                confidence: 0.72,
                type: "color_advice",
            });
        }

        // ワードローブアドバイス
        if (wardrobeGaps.length > 0) {
            recommendations.push({
                text: `ワードローブに${wardrobeGaps.join("・")}が少なめです。バランスよく揃えると着回しの幅が広がります。`,
                confidence: 0.75,
                type: "wardrobe_balance",
            });
        }

        // パーソナルカラーアドバイス
        recommendations.push({
            text: `あなたは${personalColor.description}の可能性が高いです。${personalColor.recommendedColors.slice(0, 3).join("・")}などがおすすめです。`,
            confidence: 0.7,
            type: "personal_color",
        });

        // 体型アドバイス
        recommendations.push({
            text: `好みの傾向から「${bodyTypeInfo.silhouette}」スタイルが似合いそうです。${bodyTypeInfo.advice}`,
            confidence: 0.68,
            type: "body_type",
        });

        // 一般的なアドバイス
        recommendations.push({
            text: "あなたの好みに合った新着アイテムを常にチェックしています。AIスタイリストでさらに詳しいコーデ提案を受けられます！",
            confidence: 0.95,
            type: "general",
        });

        // 深掘りインサイト（推定）
        const tagCount = new Map<string, number>();
        likedTags.forEach((t) => tagCount.set(t, (tagCount.get(t) || 0) + 1));
        const scoreByKeywords = (keywords: string[]) =>
            keywords.reduce((sum, kw) => sum + (tagCount.get(kw) || 0), 0);

        const materialScores = {
            denim: scoreByKeywords(["denim", "jeans"]),
            leather: scoreByKeywords(["leather", "suede"]),
            knit: scoreByKeywords(["knit", "sweater", "wool"]),
            linen: scoreByKeywords(["linen"]),
        };
        const silhouetteScores = {
            relaxed: scoreByKeywords(["oversized", "relaxed", "wide", "loose"]),
            sharp: scoreByKeywords(["slim", "skinny", "tapered", "fitted"]),
        };
        const statementScores = {
            bold: scoreByKeywords(["graphic", "logo", "pattern", "stripe", "check", "floral"]),
            basic: scoreByKeywords(["plain", "basic", "minimal", "solid"]),
        };

        const deepInsights: { title: string; text: string; confidence: number; evidence?: string }[] = [];
        const topMaterial = Object.entries(materialScores).sort((a, b) => b[1] - a[1])[0];
        if (topMaterial && topMaterial[1] >= 2) {
            const nameMap: Record<string, string> = {
                denim: "デニム",
                leather: "レザー",
                knit: "ニット",
                linen: "リネン",
            };
            deepInsights.push({
                title: "素材志向",
                text: `${nameMap[topMaterial[0]]}系素材を好む傾向。素材感で個性を出すタイプです。`,
                confidence: 0.72,
                evidence: `${nameMap[topMaterial[0]]}タグが多め`,
            });
        }

        if (silhouetteScores.relaxed + silhouetteScores.sharp > 0) {
            const relaxed = silhouetteScores.relaxed >= silhouetteScores.sharp;
            deepInsights.push({
                title: "シルエット嗜好",
                text: relaxed
                    ? "ゆとりのあるシルエットで抜け感を作るタイプ。"
                    : "シャープなラインで整えるタイプ。",
                confidence: 0.68,
                evidence: relaxed ? "oversized/relaxed系が多め" : "slim/tapered系が多め",
            });
        }

        if (statementScores.bold + statementScores.basic > 0) {
            const bold = statementScores.bold > statementScores.basic;
            deepInsights.push({
                title: "表現バランス",
                text: bold
                    ? "柄やロゴで主役を作りたいタイプ。1点主役のコーデが似合います。"
                    : "ベーシック中心で洗練を作るタイプ。",
                confidence: 0.64,
                evidence: bold ? "graphic/patternが多め" : "plain/minimalが多め",
            });
        }

        if (priceRange.avg) {
            if (priceRange.avg < 7000) {
                deepInsights.push({
                    title: "価格感度",
                    text: "コスパ重視の堅実派。素材とシルエットで差をつけると良い。",
                    confidence: 0.62,
                    evidence: `平均価格 ¥${priceRange.avg.toLocaleString()}`,
                });
            } else if (priceRange.avg > 25000) {
                deepInsights.push({
                    title: "価格感度",
                    text: "品質やブランド価値を重視する傾向。上質な素材がハマります。",
                    confidence: 0.62,
                    evidence: `平均価格 ¥${priceRange.avg.toLocaleString()}`,
                });
            }
        }

        const diagnosisScore = Math.round((bodyTypeConfidence + personalColorConfidence) / 2);

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
                // 新しい分析結果
                personalColor: {
                    season: personalColorSeason,
                    description: personalColor.description,
                    recommendedColors: personalColor.recommendedColors,
                    confidence: personalColorConfidence,
                },
                bodyType: {
                    type: bodyType,
                    silhouette: bodyTypeInfo.silhouette,
                    advice: bodyTypeInfo.advice,
                    name: bodyTypeDetails.name,
                    description: bodyTypeDetails.description,
                    strengths: bodyTypeDetails.strengths,
                    recommendedItems: bodyTypeDetails.recommendedItems,
                    avoidItems: bodyTypeDetails.avoidItems,
                    materials: bodyTypeDetails.materials,
                    confidence: bodyTypeConfidence,
                },
                wardrobeAnalysis: {
                    distribution: wardrobeAnalysis,
                    gaps: wardrobeGaps,
                    totalItems: likes.length,
                },
                deepInsights,
                diagnosisScore,
            },
            history,
        });
    } catch (error) {
        console.error("Style profile error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
