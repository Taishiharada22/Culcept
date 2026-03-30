import type { WardrobeItem } from "./types";

export const STORAGE_KEY = "culcept_my_style_v2";
export const BACKUP_STORAGE_KEY = "culcept_my_style_v2_backup";
export const LEGACY_STORAGE_KEY = "culcept_my_style_v1";
export const QUIZ_RESULT_KEY = "culcept_style_quiz_result_v1";
export const SWIPE_STATS_KEY = "culcept_swipe_stats_v1";
export const SWIPE_LEARNING_KEY = "culcept_swipe_learning_v1";

type CategoryOption = {
    value: WardrobeItem["category"];
    label: string;
    icon: string;
};

export const CATEGORIES: CategoryOption[] = [
    { value: "outerwear", label: "アウター", icon: "🧥" },
    { value: "tops", label: "トップス", icon: "👕" },
    { value: "bottoms", label: "ボトムス", icon: "👖" },
    { value: "shoes", label: "靴", icon: "👟" },
    { value: "accessories", label: "アクセサリー", icon: "💍" },
    { value: "hat", label: "帽子", icon: "🧢" },
    { value: "other", label: "その他", icon: "📦" },
];

type ColorOption = {
    value: string;
    label: string;
    hex: string;
};

export const COLOR_OPTIONS: ColorOption[] = [
    { value: "black", label: "ブラック", hex: "#1a1a1a" },
    { value: "white", label: "ホワイト", hex: "#f5f5f5" },
    { value: "gray", label: "グレー", hex: "#9e9e9e" },
    { value: "charcoal", label: "チャコール", hex: "#4a4a4a" },
    { value: "navy", label: "ネイビー", hex: "#1b2a4a" },
    { value: "blue", label: "ブルー", hex: "#2563eb" },
    { value: "lightblue", label: "ライトブルー", hex: "#93c5fd" },
    { value: "indigo", label: "インディゴ", hex: "#3730a3" },
    { value: "red", label: "レッド", hex: "#dc2626" },
    { value: "burgundy", label: "バーガンディ", hex: "#722f37" },
    { value: "pink", label: "ピンク", hex: "#ec4899" },
    { value: "orange", label: "オレンジ", hex: "#ea580c" },
    { value: "yellow", label: "イエロー", hex: "#eab308" },
    { value: "green", label: "グリーン", hex: "#16a34a" },
    { value: "olive", label: "オリーブ", hex: "#6b7f3e" },
    { value: "khaki", label: "カーキ", hex: "#a0926b" },
    { value: "brown", label: "ブラウン", hex: "#7c4a1e" },
    { value: "beige", label: "ベージュ", hex: "#d4c5a9" },
    { value: "camel", label: "キャメル", hex: "#c19a6b" },
    { value: "cream", label: "クリーム", hex: "#fffdd0" },
    { value: "purple", label: "パープル", hex: "#7c3aed" },
    { value: "lavender", label: "ラベンダー", hex: "#c4b5fd" },
];

/**
 * Resize image on a canvas to fit within maxW x maxH, then return base64 data URL.
 */
export async function resizeImage(file: File, maxW: number, maxH: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                let w = img.width;
                let h = img.height;
                if (w > maxW || h > maxH) {
                    const ratio = Math.min(maxW / w, maxH / h);
                    w = Math.round(w * ratio);
                    h = Math.round(h * ratio);
                }
                const canvas = document.createElement("canvas");
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    reject(new Error("canvas context failed"));
                    return;
                }
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL("image/jpeg", 0.85));
            };
            img.onerror = () => reject(new Error("image load failed"));
            img.src = reader.result as string;
        };
        reader.onerror = () => reject(new Error("file read failed"));
        reader.readAsDataURL(file);
    });
}

/** Short unique ID generator */
export function uid(): string {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
