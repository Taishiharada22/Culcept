import type { CategoryMain } from "./taxonomy";
import type { WardrobeItem } from "./types";
import { extractDominantColors, hexToColorName } from "./imageColorExtract";

/* ── Existing interface (unchanged for backward compat) ── */

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

/* ── New: Rule-based classification for Photo Onboarding ── */

export interface ClassificationResult {
    categoryMain: CategoryMain;
    category: WardrobeItem["category"];
    color: string;
    colorName: string;
    colorHex: string;
    confidence: number;
    suggestedName: string;
}

const CATEGORY_LABELS: Record<WardrobeItem["category"], string> = {
    tops: "トップス",
    bottoms: "ボトムス",
    outerwear: "アウター",
    shoes: "靴",
    accessories: "アクセサリー",
    hat: "帽子",
    other: "その他",
};

const MAIN_TO_LEGACY: Record<CategoryMain, WardrobeItem["category"]> = {
    outer: "outerwear",
    tops: "tops",
    bottoms: "bottoms",
    shoes: "shoes",
    bag: "accessories",
    accessory: "accessories",
    other: "other",
};

/**
 * Classify a single item from a photo using rule-based heuristics.
 *
 * Uses:
 * - Image aspect ratio to guess category
 * - Dominant color extraction for color
 * - Simple brightness analysis
 *
 * Expected accuracy: ~60-70%. Correction UI handles the rest.
 */
export async function classifyItemFromImage(
    imageUrl: string,
): Promise<ClassificationResult> {
    // Load image into a canvas for analysis
    const img = await loadImage(imageUrl);
    const ratio = img.width / img.height;

    // Extract dominant colors (convert data-URL to Blob for the extractor)
    const dominantColors = await extractDominantColors(dataUrlToBlob(imageUrl), 3);
    const topColor = dominantColors[0];

    // Map to our color palette
    let color = "gray";
    let colorName = "グレー";
    let colorHex = "#9e9e9e";

    if (topColor) {
        const matched = hexToColorName(topColor.hex);
        color = matched.value;
        colorName = matched.label;
        colorHex = matched.hex;
    }

    // Classify category by aspect ratio + color heuristics
    const categoryMain = classifyCategory(ratio, color, img);
    const category = MAIN_TO_LEGACY[categoryMain];

    // Compute confidence based on how decisive the signals are
    let confidence = 0.5;
    if (ratio > 1.4 || ratio < 0.55) confidence += 0.15; // strong aspect ratio signal
    if (dominantColors.length > 0 && dominantColors[0].percentage > 30) confidence += 0.1; // clear dominant color
    confidence = Math.min(0.85, confidence);

    const suggestedName = `${colorName}${CATEGORY_LABELS[category] ?? "アイテム"}`;

    return {
        categoryMain,
        category,
        color,
        colorName,
        colorHex,
        confidence,
        suggestedName,
    };
}

function classifyCategory(
    ratio: number,
    dominantColor: string,
    img: HTMLImageElement,
): CategoryMain {
    // Strong aspect ratio signals
    if (ratio > 1.4) return "tops"; // wide = shirt/jacket spread out
    if (ratio < 0.55) return "bottoms"; // very tall = hanging pants

    // Color-based bias
    const darkColors = new Set(["black", "charcoal", "navy", "indigo"]);
    const denimColors = new Set(["indigo", "blue", "lightblue"]);

    if (denimColors.has(dominantColor) && ratio < 0.8) return "bottoms"; // blue + tallish = denim
    if (ratio < 0.7) return "bottoms"; // moderately tall

    // Small images often = accessories or shoes
    if (img.width < 300 && img.height < 300) return "accessory";

    // Default to tops (most common clothing item)
    return "tops";
}

function dataUrlToBlob(dataUrl: string): Blob {
    const [header, base64] = dataUrl.split(",");
    const mime = header?.match(/:(.*?);/)?.[1] ?? "image/jpeg";
    const bytes = atob(base64 ?? "");
    const buf = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
    return new Blob([buf], { type: mime });
}

const IMAGE_LOAD_TIMEOUT_MS = 8_000;

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        const timer = setTimeout(() => {
            img.src = "";
            reject(new Error("image_load_timeout"));
        }, IMAGE_LOAD_TIMEOUT_MS);
        img.onload = () => { clearTimeout(timer); resolve(img); };
        img.onerror = () => { clearTimeout(timer); reject(new Error("image_load_failed")); };
        img.src = src;
    });
}
