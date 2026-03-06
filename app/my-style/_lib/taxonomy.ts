import type { WardrobeItem } from "./types";

export type CategoryMain = "outer" | "tops" | "bottoms" | "shoes" | "bag" | "accessory" | "other";
export type LegacyWardrobeCategory = WardrobeItem["category"];
export type SeasonCode = "ss" | "aw" | "all";
export type ThicknessCode = "thin" | "mid" | "thick";
export type FormalityCode = "casual" | "smart" | "dress";
export type DrapeCode = "structured" | "balanced" | "drapey";
export type SilhouetteCode = "slim" | "regular" | "loose" | "oversized";
export type PatternCode = "solid" | "stripe" | "check" | "jacquard" | "allover";
export type KnitGaugeCode = "high" | "mid" | "low";
export type KnitTypeCode = "rib" | "cable" | "jersey" | "boucle" | "mohair_like";
export type StretchCode = "none" | "some" | "high";
export type WaterCode = "none" | "repellent" | "waterproof";
export type TransparencyCode = "none" | "some" | "high";
export type CareCode = "machine" | "handwash" | "dry";

type Option<T extends string> = {
    value: T;
    label: string;
    tagId?: string;
};

export const CATEGORY_MAIN_OPTIONS: Option<CategoryMain>[] = [
    { value: "outer", label: "アウター", tagId: "category_main.outer" },
    { value: "tops", label: "トップス", tagId: "category_main.tops" },
    { value: "bottoms", label: "ボトムス", tagId: "category_main.bottoms" },
    { value: "shoes", label: "シューズ", tagId: "category_main.shoes" },
    { value: "bag", label: "バッグ", tagId: "category_main.bag" },
    { value: "accessory", label: "アクセ", tagId: "category_main.accessory" },
    { value: "other", label: "その他", tagId: "category_main.other" },
];

export const SUBCATEGORY_OPTIONS: Array<Option<string> & { categoryMain: CategoryMain }> = [
    { value: "subcategory.coat", label: "コート", categoryMain: "outer" },
    { value: "subcategory.jacket", label: "ジャケット", categoryMain: "outer" },
    { value: "subcategory.blouson", label: "ブルゾン", categoryMain: "outer" },
    { value: "subcategory.down", label: "ダウン", categoryMain: "outer" },
    { value: "subcategory.trench", label: "トレンチ", categoryMain: "outer" },
    { value: "subcategory.tee", label: "Tシャツ", categoryMain: "tops" },
    { value: "subcategory.shirt", label: "シャツ", categoryMain: "tops" },
    { value: "subcategory.blouse", label: "ブラウス", categoryMain: "tops" },
    { value: "subcategory.knit", label: "ニット", categoryMain: "tops" },
    { value: "subcategory.hoodie", label: "フーディ", categoryMain: "tops" },
    { value: "subcategory.sweat", label: "スウェット", categoryMain: "tops" },
    { value: "subcategory.vest", label: "ベスト", categoryMain: "tops" },
    { value: "subcategory.slacks", label: "スラックス", categoryMain: "bottoms" },
    { value: "subcategory.denim", label: "デニム", categoryMain: "bottoms" },
    { value: "subcategory.chino", label: "チノ", categoryMain: "bottoms" },
    { value: "subcategory.cargo", label: "カーゴ", categoryMain: "bottoms" },
    { value: "subcategory.skirt", label: "スカート", categoryMain: "bottoms" },
    { value: "subcategory.sandals", label: "ローファー", categoryMain: "shoes" },
    { value: "subcategory.loafer", label: "サンダル", categoryMain: "shoes" },
    { value: "subcategory.derby", label: "ダービー", categoryMain: "shoes" },
    { value: "subcategory.sneaker", label: "スニーカー", categoryMain: "shoes" },
    { value: "subcategory.boot", label: "ブーツ", categoryMain: "shoes" },
    { value: "subcategory.tote", label: "トート", categoryMain: "bag" },
    { value: "subcategory.shoulder", label: "ショルダー", categoryMain: "bag" },
    { value: "subcategory.crossbody", label: "クロスボディ", categoryMain: "bag" },
    { value: "subcategory.backpack", label: "バックパック", categoryMain: "bag" },
    { value: "subcategory.scarf", label: "スカーフ", categoryMain: "accessory" },
    { value: "subcategory.hat", label: "帽子", categoryMain: "accessory" },
    { value: "subcategory.belt", label: "ベルト", categoryMain: "accessory" },
    { value: "subcategory.jewelry", label: "ジュエリー", categoryMain: "accessory" },
    { value: "subcategory.other", label: "その他", categoryMain: "other" },
];

export const SEASON_OPTIONS: Option<SeasonCode>[] = [
    { value: "ss", label: "SS", tagId: "season.ss" },
    { value: "aw", label: "AW", tagId: "season.aw" },
    { value: "all", label: "ALL", tagId: "season.all" },
];

export const THICKNESS_OPTIONS: Option<ThicknessCode>[] = [
    { value: "thin", label: "薄手", tagId: "thickness.thin" },
    { value: "mid", label: "中間", tagId: "thickness.mid" },
    { value: "thick", label: "厚手", tagId: "thickness.thick" },
];

export const FORMALITY_OPTIONS: Option<FormalityCode>[] = [
    { value: "casual", label: "カジュアル", tagId: "formality.casual" },
    { value: "smart", label: "スマート", tagId: "formality.smart" },
    { value: "dress", label: "ドレス", tagId: "formality.dress" },
];

export const MATERIAL_FAMILY_OPTIONS: Option<string>[] = [
    { value: "material.knit", label: "ニット" },
    { value: "material.wool", label: "ウール" },
    { value: "material.cotton", label: "コットン" },
    { value: "material.denim", label: "デニム" },
    { value: "material.leather", label: "レザー" },
    { value: "material.suede", label: "スエード" },
    { value: "material.tech_nylon", label: "テックナイロン" },
    { value: "material.silk", label: "シルク" },
    { value: "material.linen", label: "リネン" },
    { value: "material.fleece", label: "フリース" },
    { value: "material.down", label: "ダウン" },
    { value: "material.polyester", label: "ポリエステル" },
    { value: "material.cashmere", label: "カシミア" },
];

export const SURFACE_FINISH_OPTIONS: Option<string>[] = [
    { value: "surface.matte", label: "マット" },
    { value: "surface.subtle_sheen", label: "微光沢" },
    { value: "surface.satin_like", label: "サテン調" },
    { value: "surface.brushed", label: "起毛" },
    { value: "surface.fuzzy", label: "ふわ感" },
    { value: "surface.smooth", label: "スムース" },
    { value: "surface.grainy", label: "シボ感" },
    { value: "surface.washed", label: "ウォッシュ" },
    { value: "surface.wrinkled", label: "しわ感" },
];

export const DRAPE_OPTIONS: Option<DrapeCode>[] = [
    { value: "structured", label: "ハリあり", tagId: "drape.structured" },
    { value: "balanced", label: "バランス", tagId: "drape.balanced" },
    { value: "drapey", label: "とろみ", tagId: "drape.drapey" },
];

export const SILHOUETTE_OPTIONS: Option<SilhouetteCode>[] = [
    { value: "slim", label: "スリム", tagId: "silhouette.slim" },
    { value: "regular", label: "レギュラー", tagId: "silhouette.regular" },
    { value: "loose", label: "ルーズ", tagId: "silhouette.loose" },
    { value: "oversized", label: "オーバー", tagId: "silhouette.oversized" },
];

export const PATTERN_OPTIONS: Option<PatternCode>[] = [
    { value: "solid", label: "無地", tagId: "pattern.solid" },
    { value: "stripe", label: "ストライプ", tagId: "pattern.stripe" },
    { value: "check", label: "チェック", tagId: "pattern.check" },
    { value: "jacquard", label: "ジャカード", tagId: "pattern.jacquard" },
    { value: "allover", label: "総柄", tagId: "pattern.allover" },
];

export const KNIT_GAUGE_OPTIONS: Option<KnitGaugeCode>[] = [
    { value: "high", label: "ハイゲージ", tagId: "knit_gauge.high" },
    { value: "mid", label: "ミドルゲージ", tagId: "knit_gauge.mid" },
    { value: "low", label: "ローゲージ", tagId: "knit_gauge.low" },
];

export const KNIT_TYPE_OPTIONS: Option<KnitTypeCode>[] = [
    { value: "rib", label: "リブ", tagId: "knit_type.rib" },
    { value: "cable", label: "ケーブル", tagId: "knit_type.cable" },
    { value: "jersey", label: "天竺", tagId: "knit_type.jersey" },
    { value: "boucle", label: "ブークレ", tagId: "knit_type.boucle" },
    { value: "mohair_like", label: "モヘア調", tagId: "knit_type.mohair_like" },
];

export const STRETCH_OPTIONS: Option<StretchCode>[] = [
    { value: "none", label: "なし", tagId: "stretch.none" },
    { value: "some", label: "ややあり", tagId: "stretch.some" },
    { value: "high", label: "高い", tagId: "stretch.high" },
];

export const WATER_OPTIONS: Option<WaterCode>[] = [
    { value: "none", label: "なし", tagId: "water.none" },
    { value: "repellent", label: "撥水", tagId: "water.repellent" },
    { value: "waterproof", label: "防水", tagId: "water.waterproof" },
];

export const TRANSPARENCY_OPTIONS: Option<TransparencyCode>[] = [
    { value: "none", label: "なし", tagId: "transparency.none" },
    { value: "some", label: "ややあり", tagId: "transparency.some" },
    { value: "high", label: "高い", tagId: "transparency.high" },
];

export const CARE_OPTIONS: Option<CareCode>[] = [
    { value: "machine", label: "洗濯機OK", tagId: "care.machine" },
    { value: "handwash", label: "手洗い", tagId: "care.handwash" },
    { value: "dry", label: "ドライ", tagId: "care.dry" },
];

export function getSubcategoryOptionsByMain(main: CategoryMain) {
    return SUBCATEGORY_OPTIONS.filter((x) => x.categoryMain === main);
}

export function getSubcategoryLabel(value: string) {
    return SUBCATEGORY_OPTIONS.find((x) => x.value === value)?.label ?? value;
}

export function getCategoryMainLabel(value: CategoryMain) {
    return CATEGORY_MAIN_OPTIONS.find((x) => x.value === value)?.label ?? value;
}

export function inferLegacyCategory(main: CategoryMain, subcategory: string): LegacyWardrobeCategory {
    if (main === "outer") return "outerwear";
    if (main === "tops") return "tops";
    if (main === "bottoms") return "bottoms";
    if (main === "shoes") return "shoes";
    if (main === "bag") return "accessories";
    if (main === "accessory") {
        return subcategory === "subcategory.hat" ? "hat" : "accessories";
    }
    return "other";
}

export function inferCategoryMainFromLegacy(category: LegacyWardrobeCategory): CategoryMain {
    if (category === "outerwear") return "outer";
    if (category === "tops") return "tops";
    if (category === "bottoms") return "bottoms";
    if (category === "shoes") return "shoes";
    if (category === "accessories" || category === "hat") return "accessory";
    return "other";
}

export function defaultSubcategory(main: CategoryMain) {
    return getSubcategoryOptionsByMain(main)[0]?.value ?? "subcategory.other";
}

export function isKnitSubcategory(subcategory: string) {
    return subcategory === "subcategory.knit";
}

export type WardrobeQualityInput = {
    imageUrl?: string | null;
    categoryMain?: CategoryMain | null;
    subcategory?: string | null;
    colorName?: string | null;
    season?: SeasonCode | null;
    thickness?: ThicknessCode | null;
    formality?: FormalityCode | null;
    materialFamily?: string[] | null;
    surfaceFinish?: string[] | null;
    drape?: DrapeCode | null;
    silhouette?: SilhouetteCode | null;
    pattern?: PatternCode | null;
    knitGauge?: KnitGaugeCode | null;
    knitType?: KnitTypeCode | null;
    stretch?: StretchCode | null;
    warmth?: 1 | 2 | 3 | null;
    water?: WaterCode | null;
    transparency?: TransparencyCode | null;
    care?: CareCode | null;
    memo?: string | null;
};

export type WardrobeQualityResult = {
    score: number;
    requiredMissing: string[];
    recommendedMissing: string[];
    optionalMissing: string[];
    badges: string[];
};

function hasText(v: unknown) {
    return typeof v === "string" ? v.trim().length > 0 : false;
}

export function calcWardrobeQuality(input: WardrobeQualityInput): WardrobeQualityResult {
    const requiredChecks = [
        ["画像", !!input.imageUrl],
        ["カテゴリ", !!input.categoryMain],
        ["サブカテゴリ", hasText(input.subcategory)],
        ["色", hasText(input.colorName)],
        ["季節", hasText(input.season)],
        ["厚み", hasText(input.thickness)],
        ["TPO", hasText(input.formality)],
    ] as const;
    const requiredMissing = requiredChecks.filter((x) => !x[1]).map((x) => x[0]);
    const requiredFilled = requiredChecks.length - requiredMissing.length;

    const knit = isKnitSubcategory(String(input.subcategory ?? ""));
    const recommendedChecks = [
        ["素材", Array.isArray(input.materialFamily) && input.materialFamily.length > 0],
        ["質感", Array.isArray(input.surfaceFinish) && input.surfaceFinish.length > 0],
        ["落ち感", hasText(input.drape)],
        ["シルエット", hasText(input.silhouette)],
        ["柄", hasText(input.pattern)],
        ["ゲージ", knit ? hasText(input.knitGauge) : true],
        ["編み", knit ? hasText(input.knitType) : true],
    ] as const;
    const recommendedEffective = recommendedChecks.filter((x) => !(knit === false && (x[0] === "ゲージ" || x[0] === "編み")));
    const recommendedMissing = recommendedEffective.filter((x) => !x[1]).map((x) => x[0]);
    const recommendedFilled = recommendedEffective.length - recommendedMissing.length;

    const optionalChecks = [
        ["伸縮", hasText(input.stretch)],
        ["保温", typeof input.warmth === "number"],
        ["防水", hasText(input.water)],
        ["透け感", hasText(input.transparency)],
        ["ケア", hasText(input.care)],
        ["メモ", hasText(input.memo)],
    ] as const;
    const optionalMissing = optionalChecks.filter((x) => !x[1]).map((x) => x[0]);
    const optionalFilled = optionalChecks.length - optionalMissing.length;

    const requiredScore = (requiredFilled / requiredChecks.length) * 40;
    const recommendedScore = recommendedEffective.length > 0 ? (recommendedFilled / recommendedEffective.length) * 50 : 50;
    const optionalScore = (optionalFilled / optionalChecks.length) * 10;
    const score = Math.round(Math.max(0, Math.min(100, requiredScore + recommendedScore + optionalScore)));

    const badges: string[] = [];
    if (requiredMissing.includes("厚み")) badges.push("厚み 未設定");
    if (requiredMissing.includes("TPO")) badges.push("TPO 未設定");
    if (recommendedMissing.includes("素材")) badges.push("素材 未設定");
    if (recommendedMissing.includes("質感")) badges.push("質感 未設定");
    if (recommendedMissing.includes("落ち感")) badges.push("落ち感 未設定");
    if (recommendedMissing.includes("シルエット")) badges.push("シルエット 未設定");
    if (recommendedMissing.includes("ゲージ")) badges.push("ゲージ 未設定");
    if (recommendedMissing.includes("編み")) badges.push("編み 未設定");

    return {
        score,
        requiredMissing,
        recommendedMissing,
        optionalMissing,
        badges: [...new Set(badges)],
    };
}

export function qualityLabel(score: number) {
    if (score >= 90) return "プロ級";
    if (score >= 70) return "かなり当たる";
    if (score >= 40) return "最低限";
    return "入力不足";
}

export function optionLabel<T extends string>(list: Array<Option<T>>, value?: string | null) {
    if (!value) return "";
    return list.find((x) => x.value === value)?.label ?? String(value);
}

export function collectTagIdsFromItem(item: WardrobeItem): string[] {
    const tags: string[] = [];
    if (item.categoryMain) tags.push(`category_main.${item.categoryMain}`);
    if (item.subcategory) tags.push(item.subcategory);
    if (item.season) tags.push(`season.${item.season}`);
    if (item.thickness) tags.push(`thickness.${item.thickness}`);
    if (item.formality) tags.push(`formality.${item.formality}`);
    if (item.drape) tags.push(`drape.${item.drape}`);
    if (item.silhouette) tags.push(`silhouette.${item.silhouette}`);
    if (item.pattern) tags.push(`pattern.${item.pattern}`);
    for (const t of item.materialFamily ?? []) tags.push(t);
    for (const t of item.surfaceFinish ?? []) tags.push(t);
    if (item.knitProfile?.gauge) tags.push(`knit_gauge.${item.knitProfile.gauge}`);
    if (item.knitProfile?.type) tags.push(`knit_type.${item.knitProfile.type}`);
    if (item.attributes?.stretch) tags.push(`stretch.${item.attributes.stretch}`);
    if (typeof item.attributes?.warmth === "number") tags.push(`warmth.${item.attributes.warmth}`);
    if (item.attributes?.water) tags.push(`water.${item.attributes.water}`);
    if (item.attributes?.transparency) tags.push(`transparency.${item.attributes.transparency}`);
    if (item.attributes?.care) tags.push(`care.${item.attributes.care}`);
    return [...new Set(tags.map((x) => String(x).trim()).filter(Boolean))];
}
