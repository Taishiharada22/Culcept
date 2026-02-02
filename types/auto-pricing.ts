// types/auto-pricing.ts
export type PricingSuggestion = {
    product_id: string;
    current_price: number | null;
    suggested_price: number;
    confidence: "high" | "medium" | "low";
    reasoning: {
        market_average: number;
        similar_products_count: number;
        condition_adjustment: number;
        brand_premium: number;
        demand_factor: number;
    };
    price_range: {
        min: number;
        max: number;
        optimal: number;
    };
    market_insights: {
        trending_up: boolean;
        competition_level: "high" | "medium" | "low";
        recent_sales: number;
    };
};

export type PriceHistory = {
    date: string;
    price: number;
    source: "manual" | "auto_adjusted" | "market_sync";
};

export type MarketData = {
    category: string;
    average_price: number;
    median_price: number;
    price_distribution: {
        p10: number;
        p25: number;
        p50: number;
        p75: number;
        p90: number;
    };
    total_listings: number;
    active_listings: number;
    avg_time_to_sell: number; // days
};
