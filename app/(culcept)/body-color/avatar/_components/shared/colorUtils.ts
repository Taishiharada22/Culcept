import type {
    SeasonChoice,
    UndertoneChoice,
    ColorSubtypeOption,
    ColorPaletteInputs,
    FusedColorSource,
    FusedColorResult,
    FusionHistoryEntry,
    AvatarProfileRecord,
} from "./types";
import type { UserBodyAvatarProfile } from "@/types/body-color";
import type { PhotoColorAnalysisResult } from "@/lib/personalColorPhotoAnalysis";
import type { RealFaceDiagnosisResult } from "@/lib/realFacePersonalColor";
import {
    DEFAULT_COLOR_PALETTE,
    SEASON_AXIS_PRESETS,
    SEASON_RECOMMENDATIONS,
} from "./constants";

export function toNum(value: string) {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

export function toStr(value: any) {
    if (value === null || value === undefined) return "";
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "string") return value;
    return "";
}

export function asNonEmptyString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function normalizeStringRecord(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const entries = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string");
    return Object.fromEntries(entries);
}

export function normalizeHex(value: unknown, fallback: string) {
    const raw = String(value ?? "").trim().toUpperCase();
    if (/^#[0-9A-F]{6}$/.test(raw)) return raw;
    if (/^#[0-9A-F]{3}$/.test(raw)) {
        return `#${raw.slice(1).split("").map((char) => `${char}${char}`).join("")}`;
    }
    return fallback;
}

export function clamp01(value: number) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

export function clampNumber(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

export function formatPercent(value: number) {
    return `${Math.round(clamp01(value) * 100)}%`;
}

export function normalizeSeasonChoice(value: unknown): SeasonChoice | null {
    const raw = String(value ?? "").trim().toLowerCase();
    if (!raw) return null;
    if (raw.includes("spring")) return "spring";
    if (raw.includes("summer")) return "summer";
    if (raw.includes("autumn") || raw.includes("fall")) return "autumn";
    if (raw.includes("winter")) return "winter";
    return null;
}

export function normalizeUndertoneChoice(value: unknown): UndertoneChoice | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        if (value > 0.15) return "warm";
        if (value < -0.15) return "cool";
        return "neutral";
    }
    const raw = String(value ?? "").trim().toLowerCase();
    if (!raw) return null;
    if (raw.includes("warm")) return "warm";
    if (raw.includes("cool")) return "cool";
    if (raw.includes("neutral") || raw.includes("balanced")) return "neutral";
    return null;
}

export function seasonLabelJa(season: SeasonChoice | null) {
    if (!season) return "未判定";
    switch (season) {
        case "spring":
            return "Spring / 春";
        case "summer":
            return "Summer / 夏";
        case "autumn":
            return "Autumn / 秋";
        case "winter":
            return "Winter / 冬";
        default:
            return "未判定";
    }
}

export function undertoneLabelJa(undertone: UndertoneChoice | null) {
    if (!undertone) return "未入力";
    switch (undertone) {
        case "warm":
            return "warm";
        case "cool":
            return "cool";
        case "neutral":
            return "neutral";
        default:
            return "未入力";
    }
}

export function normalizeSubtypeId(value: unknown) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s/-]+/g, "_");
}

export function subtypeMatches(option: ColorSubtypeOption, candidate: unknown) {
    const normalized = normalizeSubtypeId(candidate);
    if (!normalized) return false;
    return [
        option.id,
        option.label,
        option.nameJa,
        ...option.keywords,
    ].some((value) => normalizeSubtypeId(value) === normalized);
}

export function findSubtypeOption(
    options: ColorSubtypeOption[],
    candidates: unknown[],
) {
    for (const candidate of candidates) {
        const matched = options.find((option) => subtypeMatches(option, candidate));
        if (matched) return matched;
    }
    return null;
}

export function deriveSeasonFromSignals(
    labels: Record<string, any> | null | undefined,
    cpv: Record<string, string>,
    fallback?: SeasonChoice | null,
) {
    const fromLabels = normalizeSeasonChoice(labels?.season16 ?? labels?.season12 ?? labels?.season4);
    if (fromLabels) return fromLabels;
    const undertone = normalizeUndertoneChoice(toNum(cpv.undertone ?? ""));
    const value = toNum(cpv.value_L ?? "");
    if (!undertone || value === undefined) return fallback ?? null;
    if (undertone === "warm") return value >= 60 ? "spring" : "autumn";
    if (undertone === "cool") return value >= 60 ? "summer" : "winter";
    return value >= 58 ? "summer" : "winter";
}

export function deriveSeason12(season: SeasonChoice | null, cpv: Record<string, string>) {
    if (!season) return undefined;
    const value = toNum(cpv.value_L ?? "") ?? 55;
    const chroma = toNum(cpv.chroma_C ?? "") ?? 65;
    const contrast = toNum(cpv.contrast ?? "") ?? 0.5;
    if (season === "spring") {
        if (contrast >= 0.72 || chroma >= 90) return "bright_spring";
        if (value >= 70) return "light_spring";
        return "true_spring";
    }
    if (season === "summer") {
        if (chroma <= 55 || contrast <= 0.4) return "soft_summer";
        if (value >= 72) return "light_summer";
        return "true_summer";
    }
    if (season === "autumn") {
        if (chroma <= 58 || contrast <= 0.45) return "soft_autumn";
        if (value <= 48 || contrast >= 0.65) return "deep_autumn";
        return "true_autumn";
    }
    if (contrast >= 0.75 || chroma >= 98) return "bright_winter";
    if (value <= 44 || contrast >= 0.65) return "deep_winter";
    return "true_winter";
}

export function deriveSeason16(season: SeasonChoice | null, cpv: Record<string, string>) {
    if (!season) return undefined;
    const value = toNum(cpv.value_L ?? "") ?? 55;
    const chroma = toNum(cpv.chroma_C ?? "") ?? 65;
    const contrast = toNum(cpv.contrast ?? "") ?? 0.5;
    if (season === "spring") {
        if (contrast >= 0.72 || chroma >= 90) return "bright_spring";
        if (value >= 70) return "light_spring";
        return "warm_spring";
    }
    if (season === "summer") {
        if (chroma <= 55 || contrast <= 0.4) return "soft_summer";
        if (value >= 72) return "light_summer";
        return "cool_summer";
    }
    if (season === "autumn") {
        if (chroma <= 58 || contrast <= 0.45) return "soft_autumn";
        if (value <= 48 || contrast >= 0.65) return "deep_autumn";
        return "warm_autumn";
    }
    if (contrast >= 0.75 || chroma >= 98) return "bright_winter";
    if (value <= 44 || contrast >= 0.65) return "deep_winter";
    return "cool_winter";
}

export function buildPaletteInputs(palette: Record<string, any> | null | undefined): ColorPaletteInputs {
    return {
        selectedHex: normalizeHex(palette?.selected_hex ?? palette?.skin_hex, DEFAULT_COLOR_PALETTE.selectedHex),
        hairHex: normalizeHex(palette?.hair_hex, DEFAULT_COLOR_PALETTE.hairHex),
        irisHex: normalizeHex(palette?.iris_hex, DEFAULT_COLOR_PALETTE.irisHex),
    };
}

export function mergeCpvWithPhotoAnalysis(
    cpv: Record<string, string>,
    photoAnalysis: PhotoColorAnalysisResult | null,
): Record<string, string> {
    if (!photoAnalysis) return cpv;
    return {
        ...cpv,
        undertone: String(photoAnalysis.axes.undertone),
        value_L: String(photoAnalysis.axes.value_L),
        chroma_C: String(photoAnalysis.axes.chroma_C),
        contrast: String(photoAnalysis.axes.contrast),
        clarity: String(photoAnalysis.axes.clarity),
        depth: String(photoAnalysis.axes.depth),
        confidence: String(photoAnalysis.confidence),
    };
}

export function buildFusionResult({
    season,
    undertone,
    cpv,
    realFaceDiagnosis,
    photoAnalysis,
}: {
    season: SeasonChoice | null;
    undertone: UndertoneChoice | null;
    cpv: Record<string, string>;
    realFaceDiagnosis: RealFaceDiagnosisResult | null;
    photoAnalysis: PhotoColorAnalysisResult | null;
}): FusedColorResult | null {
    const sources: FusedColorSource[] = [];
    const profileSeason = deriveSeasonFromSignals(null, cpv, season);
    const profileUndertone = normalizeUndertoneChoice(toNum(cpv.undertone ?? "")) ?? undertone;

    if (photoAnalysis) {
        sources.push({
            name: "写真AI診断",
            season: photoAnalysis.season,
            confidence: clamp01(photoAnalysis.confidence),
            undertone: photoAnalysis.undertone,
            detail: photoAnalysis.summary,
        });
    } else if (profileSeason && profileUndertone) {
        sources.push({
            name: "Color Profile",
            season: profileSeason,
            confidence: clamp01((toNum(cpv.confidence ?? "") ?? 0.55)),
            undertone: profileUndertone,
            detail: "保存済みの season / undertone / CPV をもとに集約",
        });
    }

    if (realFaceDiagnosis) {
        const diagnosisUndertone =
            normalizeUndertoneChoice(realFaceDiagnosis.attributeSummary.temperature) ?? "neutral";
        sources.push({
            name: "ドレープ比較診断",
            season: normalizeSeasonChoice(realFaceDiagnosis.season_primary) ?? "spring",
            confidence: clamp01(realFaceDiagnosis.confidence),
            undertone: diagnosisUndertone,
            detail: realFaceDiagnosis.summary,
        });
    }

    const forcedSeason = season ?? sources[0]?.season ?? null;
    const forcedUndertone = undertone ?? sources[0]?.undertone ?? null;
    if (!forcedSeason || !forcedUndertone) return null;

    const seasonWeights: Record<SeasonChoice, number> = {
        spring: 0,
        summer: 0,
        autumn: 0,
        winter: 0,
    };
    const undertoneWeights: Record<UndertoneChoice, number> = {
        warm: 0,
        cool: 0,
        neutral: 0,
    };

    sources.forEach((source) => {
        seasonWeights[source.season] += Math.max(source.confidence, 0.3);
        undertoneWeights[source.undertone] += Math.max(source.confidence, 0.3);
    });
    seasonWeights[forcedSeason] += 0.4;
    undertoneWeights[forcedUndertone] += 0.35;

    const seasonRanking = (Object.entries(seasonWeights) as Array<[SeasonChoice, number]>).sort((a, b) => b[1] - a[1]);
    const undertoneRanking = (Object.entries(undertoneWeights) as Array<[UndertoneChoice, number]>).sort((a, b) => b[1] - a[1]);
    const fusedSeason = seasonRanking[0]?.[0] ?? forcedSeason;
    const fusedUndertone = undertoneRanking[0]?.[0] ?? forcedUndertone;
    const averageConfidence =
        sources.length > 0
            ? sources.reduce((sum, source) => sum + source.confidence, 0) / sources.length
            : 0.52;
    const agreementBoost = sources.length > 1 && sources.every((source) => source.season === fusedSeason) ? 0.1 : 0;
    const confidence = clamp01(averageConfidence + agreementBoost);
    const preset = SEASON_AXIS_PRESETS[fusedSeason];
    const undertoneAxis = fusedUndertone === "warm" ? 0.75 : fusedUndertone === "cool" ? -0.75 : 0;
    const axes = {
        undertone: clampNumber(toNum(cpv.undertone ?? "") ?? undertoneAxis, -1, 1),
        value_L: clampNumber(toNum(cpv.value_L ?? "") ?? preset.value_L, 0, 100),
        chroma_C: clampNumber(toNum(cpv.chroma_C ?? "") ?? preset.chroma_C, 0, 200),
        contrast: clampNumber(toNum(cpv.contrast ?? "") ?? preset.contrast, 0, 1),
    };
    const season16 = deriveSeason16(fusedSeason, {
        ...cpv,
        undertone: String(axes.undertone),
        value_L: String(axes.value_L),
        chroma_C: String(axes.chroma_C),
        contrast: String(axes.contrast),
    });
    const recommendations = realFaceDiagnosis?.recommended_colors?.length
        ? realFaceDiagnosis.recommended_colors
        : SEASON_RECOMMENDATIONS[fusedSeason].recommended;
    const avoidColors = realFaceDiagnosis?.avoid_tendencies?.length
        ? realFaceDiagnosis.avoid_tendencies
        : SEASON_RECOMMENDATIONS[fusedSeason].avoid;

    return {
        season: fusedSeason,
        season16: season16 ?? null,
        undertone: fusedUndertone,
        confidence,
        summary: `${seasonLabelJa(fusedSeason)} / ${undertoneLabelJa(fusedUndertone)} / ${sources.length}ソース統合`,
        recommendedColors: recommendations,
        avoidColors,
        sources,
        axes,
    };
}

export function cloneFusedColorResult(result: FusedColorResult): FusedColorResult {
    return {
        ...result,
        recommendedColors: [...result.recommendedColors],
        avoidColors: [...result.avoidColors],
        sources: result.sources.map((source) => ({ ...source })),
        axes: { ...result.axes },
    };
}

export function createFusionHistoryEntry(
    result: FusedColorResult,
    imageUrl: string | null,
): FusionHistoryEntry {
    const recordedAt = new Date().toISOString();
    return {
        id: `${recordedAt}_${result.season}_${Math.round(result.confidence * 100)}`,
        recordedAt,
        imageUrl,
        result: cloneFusedColorResult(result),
    };
}

export function normalizeAvatarProfile(
    value: AvatarProfileRecord | UserBodyAvatarProfile | null | undefined,
): AvatarProfileRecord | null {
    if (!value || typeof value !== "object") return null;
    return {
        ...value,
        views: normalizeStringRecord(value.views),
        person_cutout_url: asNonEmptyString(value.person_cutout_url) ?? null,
        clothes_cutout_url: asNonEmptyString(value.clothes_cutout_url) ?? null,
        mask_clothes_url: asNonEmptyString(value.mask_clothes_url) ?? null,
        turntable_gif_url: asNonEmptyString(value.turntable_gif_url) ?? null,
        mesh_glb_url: asNonEmptyString(value.mesh_glb_url) ?? null,
    };
}
