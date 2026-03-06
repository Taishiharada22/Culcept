// app/api/ai-search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

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

        // Text search on title, brand
        const searchTerms = interpretation.keywords.join(" ").trim();
        if (searchTerms) {
            // NOTE: This is a simple fallback. For better results consider:
            // - splitting into multiple OR clauses (each keyword)
            // - using Postgres full-text search (tsvector)
            // - using embeddings / pgvector
            dbQuery = dbQuery.or(`title.ilike.%${searchTerms}%,brand.ilike.%${searchTerms}%`);
        }

        dbQuery = dbQuery.limit(50);

        const { data: products, error } = await dbQuery;

        if (error) throw error;

        // Calculate relevance scores
        const scoredProducts = (products || []).map((product: any) => {
            let score = 0;
            const title = (product.title || "").toLowerCase();
            const brand = (product.brand || "").toLowerCase();
            const tags: string[] = Array.isArray(product.tags) ? product.tags : [];

            // Keyword matching
            interpretation.keywords.forEach((keyword) => {
                const kw = keyword.toLowerCase();
                if (title.includes(kw)) score += 10;
                if (brand.includes(kw)) score += 5;
                if (tags.some((tag) => tag.toLowerCase().includes(kw))) score += 3;
            });

            // Price range bonus
            if (interpretation.filters.maxPrice) {
                const priceRatio = (product.price || 0) / interpretation.filters.maxPrice;
                if (priceRatio <= 1) {
                    score += Math.round((1 - priceRatio) * 5);
                }
            }

            // Condition bonus
            if (interpretation.filters.conditions?.includes(product.condition)) {
                score += 8;
            }

            // Brand bonus (make comparison robust)
            if (
                interpretation.filters.brands?.some(
                    (b) => b.toLowerCase() === (product.brand || "").toLowerCase()
                )
            ) {
                score += 15;
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

function parseNaturalLanguageQuery(query: string): QueryInterpretation {
    const lowerQuery = query.toLowerCase();

    const interpretation: QueryInterpretation = {
        intent: "product_search",
        keywords: [],
        filters: {},
    };

    // Extract price range
    const priceMatch = lowerQuery.match(/(?:under|below|less than|<)\s*[¥$]?\s*(\d+(?:,\d{3})*)/);
    if (priceMatch) {
        interpretation.filters.maxPrice = parseInt(priceMatch[1].replace(/,/g, ""), 10);
    }

    const minPriceMatch = lowerQuery.match(/(?:over|above|more than|>)\s*[¥$]?\s*(\d+(?:,\d{3})*)/);
    if (minPriceMatch) {
        interpretation.filters.minPrice = parseInt(minPriceMatch[1].replace(/,/g, ""), 10);
    }

    // Extract condition
    const conditions = ["damaged", "well", "good", "almost_new", "new"] as const;
    const foundConditions = conditions.filter((c) => lowerQuery.includes(c));
    if (foundConditions.length > 0) {
        interpretation.filters.conditions = [...foundConditions];
    }

    // Extract common brands (expand this list)
    const brands = [
        "nike",
        "adidas",
        "supreme",
        "gucci",
        "prada",
        "louis vuitton",
        "chanel",
        "dior",
        "balenciaga",
        "yeezy",
        "jordan",
        "vintage",
        "levi's",
        "carhartt",
    ] as const;

    const foundBrands = brands.filter((b) => lowerQuery.includes(b));
    if (foundBrands.length > 0) {
        interpretation.filters.brands = [...foundBrands];
    }

    // Extract keywords (remove price and condition terms)
    const keywords = query
        .toLowerCase()
        .replace(/(?:under|below|less than|over|above|more than)\s*[¥$]?\s*\d+(?:,\d{3})*/g, "")
        .replace(/\b(?:damaged|well|good|almost_new|new)\b/g, "")
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 2 && !["the", "and", "for", "with", "from"].includes(w));

    interpretation.keywords = [...new Set(keywords)];

    return interpretation;
}

function generateMatchReason(product: any, interpretation: QueryInterpretation): string {
    const reasons: string[] = [];

    const brandLower = (product.brand || "").toLowerCase();
    if (interpretation.filters.brands?.some((b) => b.toLowerCase() === brandLower)) {
        reasons.push(`Matches brand: ${product.brand}`);
    }

    if (interpretation.filters.conditions?.includes(product.condition)) {
        reasons.push(`Condition: ${product.condition}`);
    }

    if (interpretation.filters.maxPrice && (product.price || 0) <= interpretation.filters.maxPrice) {
        reasons.push(`Within budget`);
    }

    const titleMatches = interpretation.keywords.filter((kw) =>
        (product.title || "").toLowerCase().includes(kw.toLowerCase())
    );
    if (titleMatches.length > 0) {
        reasons.push(`Keywords in title`);
    }

    return reasons.length > 0 ? reasons.join(" • ") : "General match";
}

function generateRefinements(interpretation: QueryInterpretation): string[] {
    const refinements: string[] = [];

    if (!interpretation.filters.conditions) {
        refinements.push("Add condition filter (e.g., 'good condition')");
    }

    if (!interpretation.filters.maxPrice) {
        refinements.push("Add price limit (e.g., 'under ¥10000')");
    }

    if (!interpretation.filters.brands) {
        refinements.push("Specify brand (e.g., 'Nike', 'Adidas')");
    }

    return refinements;
}
