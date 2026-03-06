// app/api/ai-search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { expandSearchTerms, detectCategory, detectPriceRange, detectStyle } from "@/lib/ai-search/synonyms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QueryFilters = {
    brands?: string[];
    conditions?: string[];
    minPrice?: number;
    maxPrice?: number;
};

type QueryInterpretation = {
    intent: "product_search";
    keywords: string[];
    filters: QueryFilters;
};

/**
 * AI-powered natural language search
 * Parses queries like "vintage denim jacket under ¥10000"
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get("q");

        if (!query) {
            return NextResponse.json({ ok: false, error: "Missing query" }, { status: 400 });
        }

        const supabase = await supabaseServer();

        // Parse natural language query
        const interpretation = parseNaturalLanguageQuery(query);

        // Build database query
        let dbQuery = supabase
            .from("drops")
            .select("id,title,brand,size,condition,price,cover_image_url,tags")
            .eq("status", "Approved");

        // Apply extracted filters
        if (interpretation.filters.brands && interpretation.filters.brands.length > 0) {
            dbQuery = dbQuery.in("brand", interpretation.filters.brands);
        }

        if (interpretation.filters.conditions && interpretation.filters.conditions.length > 0) {
            dbQuery = dbQuery.in("condition", interpretation.filters.conditions);
        }

        if (interpretation.filters.minPrice !== undefined) {
            dbQuery = dbQuery.gte("price", interpretation.filters.minPrice);
        }

        if (interpretation.filters.maxPrice !== undefined) {
            dbQuery = dbQuery.lte("price", interpretation.filters.maxPrice);
        }

        // Text search on title, brand, tags using expanded keywords
        const allSearchTerms = [...new Set([...interpretation.keywords, ...interpretation.expandedKeywords])];

        if (allSearchTerms.length > 0) {
            // Build OR clauses for each keyword (improved search accuracy)
            const orClauses = allSearchTerms
                .slice(0, 10) // Limit to prevent too long queries
                .map(term => `title.ilike.%${term}%,brand.ilike.%${term}%`)
                .join(",");

            if (orClauses) {
                dbQuery = dbQuery.or(orClauses);
            }
        }

        // Apply category filter if detected
        if (interpretation.detectedCategory) {
            // Category could be in tags or title
            dbQuery = dbQuery.or(`tags.cs.{${interpretation.detectedCategory}}`);
        }

        dbQuery = dbQuery.limit(50);

        const { data: products, error } = await dbQuery;

        if (error) throw error;

        // Calculate relevance scores with enhanced matching
        const scoredProducts = (products || []).map((product: any) => {
            let score = 0;
            const title = (product.title || "").toLowerCase();
            const brand = (product.brand || "").toLowerCase();
            const tags: string[] = Array.isArray(product.tags) ? product.tags : [];

            // Primary keyword matching (higher weight)
            interpretation.keywords.forEach((keyword) => {
                const kw = keyword.toLowerCase();
                if (title.includes(kw)) score += 15;
                if (brand.includes(kw)) score += 8;
                if (tags.some((tag) => tag.toLowerCase().includes(kw))) score += 5;
            });

            // Expanded keyword matching (lower weight - synonym matches)
            interpretation.expandedKeywords.forEach((keyword) => {
                const kw = keyword.toLowerCase();
                if (title.includes(kw)) score += 8;
                if (brand.includes(kw)) score += 4;
                if (tags.some((tag) => tag.toLowerCase().includes(kw))) score += 3;
            });

            // Category match bonus
            if (interpretation.detectedCategory) {
                if (tags.some(tag => tag.toLowerCase() === interpretation.detectedCategory?.toLowerCase())) {
                    score += 12;
                }
                if (title.includes(interpretation.detectedCategory.toLowerCase())) {
                    score += 8;
                }
            }

            // Style match bonus
            interpretation.detectedStyles.forEach(style => {
                if (tags.some(tag => tag.toLowerCase().includes(style.toLowerCase()))) {
                    score += 6;
                }
            });

            // Price range bonus
            if (interpretation.filters.maxPrice) {
                const priceRatio = (product.price || 0) / interpretation.filters.maxPrice;
                if (priceRatio <= 1) {
                    score += Math.round((1 - priceRatio) * 8);
                }
            }

            // Condition bonus
            if (interpretation.filters.conditions?.includes(product.condition)) {
                score += 10;
            }

            // Brand bonus (make comparison robust)
            if (
                interpretation.filters.brands?.some(
                    (b) => b.toLowerCase() === (product.brand || "").toLowerCase()
                )
            ) {
                score += 20;
            }

            return {
                ...product,
                relevance_score: score,
                match_reason: generateMatchReason(product, interpretation),
            };
        });

        // Sort by relevance
        scoredProducts.sort((a: any, b: any) => (b.relevance_score || 0) - (a.relevance_score || 0));

        return NextResponse.json({
            ok: true,
            products: scoredProducts,
            query_interpretation: {
                intent: interpretation.intent,
                extracted_filters: interpretation.filters,
                detected_category: interpretation.detectedCategory,
                detected_styles: interpretation.detectedStyles,
                keywords: interpretation.keywords,
                expanded_keywords: interpretation.expandedKeywords.slice(0, 20), // Limit for response size
                suggested_refinements: generateRefinements(interpretation),
            },
            total_results: scoredProducts.length,
        });
    } catch (err: any) {
        console.error("GET /api/ai-search error:", err);
        return NextResponse.json(
            { ok: false, error: err?.message || "Internal server error" },
            { status: 500 }
        );
    }
}

function parseNaturalLanguageQuery(query: string): QueryInterpretation & {
    expandedKeywords: string[];
    detectedCategory: string | null;
    detectedStyles: string[];
} {
    const lowerQuery = query.toLowerCase();

    const interpretation: QueryInterpretation & {
        expandedKeywords: string[];
        detectedCategory: string | null;
        detectedStyles: string[];
    } = {
        intent: "product_search",
        keywords: [],
        expandedKeywords: [],
        detectedCategory: null,
        detectedStyles: [],
        filters: {},
    };

    // Use enhanced price detection from synonyms library
    const detectedPriceRange = detectPriceRange(query);
    if (detectedPriceRange) {
        if (detectedPriceRange.min > 0) {
            interpretation.filters.minPrice = detectedPriceRange.min;
        }
        if (detectedPriceRange.max < Infinity) {
            interpretation.filters.maxPrice = detectedPriceRange.max;
        }
    }

    // Fallback: Extract price range with regex
    if (!interpretation.filters.maxPrice) {
        const priceMatch = lowerQuery.match(/(?:under|below|less than|<|以下)\s*[¥$]?\s*(\d+(?:,\d{3})*)/);
        if (priceMatch) {
            interpretation.filters.maxPrice = parseInt(priceMatch[1].replace(/,/g, ""), 10);
        }
    }

    if (!interpretation.filters.minPrice) {
        const minPriceMatch = lowerQuery.match(/(?:over|above|more than|>|以上)\s*[¥$]?\s*(\d+(?:,\d{3})*)/);
        if (minPriceMatch) {
            interpretation.filters.minPrice = parseInt(minPriceMatch[1].replace(/,/g, ""), 10);
        }
    }

    // Extract condition (expanded with Japanese terms)
    const conditionMap: Record<string, string> = {
        "damaged": "damaged",
        "傷あり": "damaged",
        "ダメージ": "damaged",
        "well": "well",
        "まあまあ": "well",
        "good": "good",
        "良好": "good",
        "きれい": "good",
        "almost_new": "almost_new",
        "ほぼ新品": "almost_new",
        "未使用に近い": "almost_new",
        "new": "new",
        "新品": "new",
        "未使用": "new",
        "タグ付き": "new",
    };

    const foundConditions: string[] = [];
    for (const [term, condition] of Object.entries(conditionMap)) {
        if (lowerQuery.includes(term.toLowerCase())) {
            if (!foundConditions.includes(condition)) {
                foundConditions.push(condition);
            }
        }
    }
    if (foundConditions.length > 0) {
        interpretation.filters.conditions = foundConditions;
    }

    // Extract common brands (expanded list)
    const brands = [
        "nike", "ナイキ",
        "adidas", "アディダス",
        "supreme", "シュプリーム",
        "gucci", "グッチ",
        "prada", "プラダ",
        "louis vuitton", "ルイヴィトン", "ルイ・ヴィトン",
        "chanel", "シャネル",
        "dior", "ディオール",
        "balenciaga", "バレンシアガ",
        "yeezy", "イージー",
        "jordan", "ジョーダン",
        "vintage", "ヴィンテージ", "ビンテージ",
        "levi's", "リーバイス",
        "carhartt", "カーハート",
        "uniqlo", "ユニクロ",
        "zara", "ザラ",
        "h&m",
        "gap", "ギャップ",
        "comme des garcons", "コムデギャルソン",
        "issey miyake", "イッセイミヤケ",
        "yohji yamamoto", "ヨウジヤマモト",
        "undercover", "アンダーカバー",
        "neighborhood", "ネイバーフッド",
        "bape", "ベイプ", "a bathing ape",
        "stussy", "ステューシー",
        "the north face", "ノースフェイス",
        "patagonia", "パタゴニア",
        "arc'teryx", "アークテリクス",
    ] as const;

    const foundBrands = brands.filter((b) => lowerQuery.includes(b.toLowerCase()));
    if (foundBrands.length > 0) {
        interpretation.filters.brands = [...new Set(foundBrands.map(b => b.toLowerCase()))];
    }

    // Detect category using synonyms library
    interpretation.detectedCategory = detectCategory(query);

    // Detect styles using synonyms library
    interpretation.detectedStyles = detectStyle(query);

    // Extract and expand keywords using synonyms library
    const cleanedQuery = query
        .toLowerCase()
        .replace(/(?:under|below|less than|over|above|more than|以下|以上)\s*[¥$]?\s*\d+(?:,\d{3})*/g, "")
        .replace(/\b(?:damaged|well|good|almost_new|new|傷あり|良好|新品|未使用)\b/gi, "")
        .trim();

    const baseKeywords = cleanedQuery
        .split(/[\s、,]+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 1 && !["the", "and", "for", "with", "from", "を", "の", "で", "が", "に"].includes(w));

    interpretation.keywords = [...new Set(baseKeywords)];

    // Expand keywords with synonyms
    interpretation.expandedKeywords = expandSearchTerms(query);

    return interpretation;
}

function generateMatchReason(
    product: any,
    interpretation: QueryInterpretation & {
        expandedKeywords?: string[];
        detectedCategory?: string | null;
        detectedStyles?: string[];
    }
): string {
    const reasons: string[] = [];

    const brandLower = (product.brand || "").toLowerCase();
    if (interpretation.filters.brands?.some((b) => b.toLowerCase() === brandLower)) {
        reasons.push(`ブランド一致: ${product.brand}`);
    }

    if (interpretation.filters.conditions?.includes(product.condition)) {
        const conditionLabels: Record<string, string> = {
            new: "新品",
            almost_new: "ほぼ新品",
            good: "良好",
            well: "まあまあ",
            damaged: "傷あり",
        };
        reasons.push(`状態: ${conditionLabels[product.condition] || product.condition}`);
    }

    if (interpretation.filters.maxPrice && (product.price || 0) <= interpretation.filters.maxPrice) {
        reasons.push("予算内");
    }

    const titleMatches = interpretation.keywords.filter((kw) =>
        (product.title || "").toLowerCase().includes(kw.toLowerCase())
    );
    if (titleMatches.length > 0) {
        reasons.push(`キーワード一致`);
    }

    // Check expanded keywords (synonym matches)
    if (interpretation.expandedKeywords) {
        const synonymMatches = interpretation.expandedKeywords.filter((kw) =>
            (product.title || "").toLowerCase().includes(kw.toLowerCase()) ||
            (Array.isArray(product.tags) && product.tags.some((t: string) => t.toLowerCase().includes(kw.toLowerCase())))
        );
        if (synonymMatches.length > 0 && titleMatches.length === 0) {
            reasons.push("関連キーワード一致");
        }
    }

    // Category match
    if (interpretation.detectedCategory) {
        const tags: string[] = Array.isArray(product.tags) ? product.tags : [];
        if (tags.some(tag => tag.toLowerCase() === interpretation.detectedCategory?.toLowerCase())) {
            reasons.push(`カテゴリ: ${interpretation.detectedCategory}`);
        }
    }

    // Style match
    if (interpretation.detectedStyles && interpretation.detectedStyles.length > 0) {
        const tags: string[] = Array.isArray(product.tags) ? product.tags : [];
        const matchedStyles = interpretation.detectedStyles.filter(style =>
            tags.some(tag => tag.toLowerCase().includes(style.toLowerCase()))
        );
        if (matchedStyles.length > 0) {
            reasons.push(`スタイル: ${matchedStyles[0]}`);
        }
    }

    return reasons.length > 0 ? reasons.join(" • ") : "おすすめ";
}

function generateRefinements(
    interpretation: QueryInterpretation & {
        detectedCategory?: string | null;
        detectedStyles?: string[];
    }
): string[] {
    const refinements: string[] = [];

    if (!interpretation.filters.conditions) {
        refinements.push("状態を指定（例: '新品', '良好', 'ほぼ新品'）");
    }

    if (!interpretation.filters.maxPrice && !interpretation.filters.minPrice) {
        refinements.push("価格を指定（例: '1万円以下', '5000円以上'）");
    }

    if (!interpretation.filters.brands) {
        refinements.push("ブランドを指定（例: 'Nike', 'Supreme', 'ユニクロ'）");
    }

    if (!interpretation.detectedCategory) {
        refinements.push("カテゴリを指定（例: 'ジャケット', 'パンツ', 'スニーカー'）");
    }

    if (!interpretation.detectedStyles || interpretation.detectedStyles.length === 0) {
        refinements.push("スタイルを指定（例: 'カジュアル', 'ストリート', 'フォーマル'）");
    }

    return refinements.slice(0, 3); // Limit to top 3 suggestions
}
