// types/ai-search.ts
export type AISearchQuery = {
    query: string;
    filters?: {
        minPrice?: number;
        maxPrice?: number;
        brands?: string[];
        conditions?: string[];
        tags?: string[];
    };
};

export type AISearchResult = {
    products: Array<{
        id: string;
        title: string;
        brand: string | null;
        price: number | null;
        cover_image_url: string | null;
        relevance_score: number;
        match_reason: string;
    }>;
    query_interpretation: {
        intent: string;
        extracted_filters: Record<string, any>;
        suggested_refinements: string[];
    };
    total_results: number;
};

export type SearchSuggestion = {
    text: string;
    type: "brand" | "category" | "style" | "price_range";
};
