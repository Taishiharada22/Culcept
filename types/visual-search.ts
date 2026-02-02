// types/visual-search.ts
export type VisualSearchResult = {
    product_id: string;
    title: string;
    brand: string | null;
    price: number | null;
    cover_image_url: string | null;
    similarity_score: number; // 0-100
    match_features: string[];
};

export type ImageFeatures = {
    dominant_colors: string[];
    detected_objects: string[];
    style_tags: string[];
    estimated_category: string;
};
