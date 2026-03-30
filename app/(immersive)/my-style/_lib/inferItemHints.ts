import type { CategoryMain } from "./taxonomy";

export type ItemInferenceHints = {
    confidence: number;
    subcategories: Array<{ value: string; label: string }>;
    materials: Array<{ value: string; label: string }>;
    surfaces: Array<{ value: string; label: string }>;
    thickness?: string;
    season?: string;
    formality?: string;
    colorValue?: string;
    colorHex?: string;
};

export async function inferItemHintsFromImage(_params: {
    imageUrl: string;
    categoryMain: CategoryMain;
    palette: Array<{ value: string; hex: string }>;
}): Promise<ItemInferenceHints | null> {
    // Stub: AI-based inference not yet implemented.
    // Returns null so the UI gracefully skips inference chips.
    return null;
}
