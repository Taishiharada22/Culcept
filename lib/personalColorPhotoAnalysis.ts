/* ─────────────────────────────────────────────
   パーソナルカラー写真分析エンジン v2
   改善点:
   - Gray World AWB（ホワイトバランス自動補正）
   - CIE DE2000 色差による季節分類
   - MediaPipe ランドマーク基準 ROI サンプリング
   - MAD ベース外れ値除去
   - 改善された信頼度スコアリング
   - 多重照明検出
   ───────────────────────────────────────────── */

import { applyGrayWorldAWB, ciede2000, madFilter, rgbToLab, detectMixedIlluminant, type LabColor } from "@/lib/face/colorScience";
import {
    FOREHEAD, LEFT_CHEEK, RIGHT_CHEEK, CHIN,
    LEFT_IRIS, RIGHT_IRIS, HAIR_REF,
    centroid,
} from "@/lib/face/landmarkIndices";
import {
    SIXTEEN_SEASON_TARGETS,
    type SixteenSeasonTarget,
} from "@/lib/face/sixteenSeasonColorScience";

export type PhotoColorSeason = "spring" | "summer" | "autumn" | "winter";
export type PhotoColorUndertone = "warm" | "cool" | "neutral";

export type PhotoColorAnalysisResult = {
    season: PhotoColorSeason;
    undertone: PhotoColorUndertone;
    confidence: number;
    summary: string;
    axes: {
        undertone: number;
        value_L: number;
        chroma_C: number;
        contrast: number;
        clarity: number;
        depth: number;
    };
    palette: {
        selectedHex: string;
        hairHex: string;
        irisHex: string;
    };
    /** AWB 補正量（0 に近いほど照明が良好） */
    awbCorrectionMagnitude?: number;
    /** 多重照明警告 */
    illuminantWarning?: string | null;
    /** 16 シーズン分類結果（v2 追加） */
    sixteenSeason?: SixteenSeasonMatch[] | null;
};

/**
 * 16 シーズン分類の個別マッチ結果。
 * CIE DE2000 色差スコアに基づくランキング。
 */
export type SixteenSeasonMatch = {
    /** サブタイプ ID（例: "light-spring"） */
    id: string;
    /** 日本語表示名 */
    nameJa: string;
    /** 英語表示名 */
    nameEn: string;
    /** 親シーズン */
    parentSeason: PhotoColorSeason;
    /** マッチスコア: 0-1（高いほど適合） */
    score: number;
};

/* ─── 内部型 ─── */

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };
type Pixel = Rgb & Hsl & { alpha: number; lab: LabColor };
type NormalizedRect = { x: number; y: number; w: number; h: number };
type NLandmark = { x: number; y: number; z?: number };

/* ─── 季節ターゲット（Lab 空間） ─── */

const SEASON_TARGETS: Record<PhotoColorSeason, { undertone: number; value_L: number; chroma_C: number; contrast: number; lab: LabColor }> = {
    spring: { undertone: 0.75, value_L: 72, chroma_C: 88, contrast: 0.58, lab: { L: 72, a: 12, b: 22 } },
    summer: { undertone: -0.58, value_L: 70, chroma_C: 52, contrast: 0.36, lab: { L: 70, a: 4, b: -8 } },
    autumn: { undertone: 0.7, value_L: 44, chroma_C: 64, contrast: 0.48, lab: { L: 44, a: 14, b: 24 } },
    winter: { undertone: -0.72, value_L: 38, chroma_C: 92, contrast: 0.86, lab: { L: 38, a: 2, b: -12 } },
};

/* ─── ヘルパー ─── */

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function rgbToHex({ r, g, b }: Rgb) {
    return `#${[r, g, b]
        .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0"))
        .join("")}`;
}

function rgbToHsl(rgb: Rgb): Hsl {
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const lightness = (max + min) / 2;

    if (delta === 0) {
        return { h: 0, s: 0, l: lightness };
    }

    const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    let hue = 0;
    if (max === r) hue = (g - b) / delta + (g < b ? 6 : 0);
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;

    return { h: hue * 60, s: saturation, l: lightness };
}

function buildPixel(r: number, g: number, b: number, alpha: number): Pixel {
    const rgb = { r, g, b };
    return { ...rgb, alpha, ...rgbToHsl(rgb), lab: rgbToLab(r, g, b) };
}

function samplePixels(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    rect: NormalizedRect,
    filter?: (pixel: Pixel) => boolean,
) {
    const pixels: Pixel[] = [];
    const startX = Math.max(0, Math.floor(rect.x * width));
    const endX = Math.min(width, Math.ceil((rect.x + rect.w) * width));
    const startY = Math.max(0, Math.floor(rect.y * height));
    const endY = Math.min(height, Math.ceil((rect.y + rect.h) * height));

    for (let y = startY; y < endY; y += 2) {
        for (let x = startX; x < endX; x += 2) {
            const offset = (y * width + x) * 4;
            const pixel = buildPixel(
                data[offset] ?? 0,
                data[offset + 1] ?? 0,
                data[offset + 2] ?? 0,
                (data[offset + 3] ?? 0) / 255,
            );
            if (pixel.alpha < 0.9) continue;
            if (!filter || filter(pixel)) {
                pixels.push(pixel);
            }
        }
    }
    return pixels;
}

/** MAD ベース外れ値除去（v2: madFilter を使用） */
function trimExtremesMAD(pixels: Pixel[]): Pixel[] {
    if (pixels.length <= 6) return pixels;
    const luminances = pixels.map((p) => p.l);
    const filtered = madFilter(luminances, 3.0);
    const filteredSet = new Set(filtered);
    // MAD で残った輝度値に対応するピクセルを保持
    const result: Pixel[] = [];
    const usedLums = new Map<number, number>();
    for (const p of pixels) {
        const count = usedLums.get(p.l) ?? 0;
        const targetCount = filtered.filter((v) => v === p.l).length;
        if (filteredSet.has(p.l) && count < targetCount) {
            result.push(p);
            usedLums.set(p.l, count + 1);
        }
    }
    return result.length >= 4 ? result : pixels;
}

function takeDarkest(pixels: Pixel[], ratio: number) {
    if (pixels.length <= 4) return pixels;
    const count = Math.max(4, Math.ceil(pixels.length * ratio));
    return [...pixels].sort((a, b) => a.l - b.l).slice(0, count);
}

function median(values: number[]) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function representativeColor(pixels: Pixel[], fallback: Rgb): Pixel {
    if (!pixels.length) {
        return buildPixel(fallback.r, fallback.g, fallback.b, 1);
    }
    const trimmed = trimExtremesMAD(pixels);
    return buildPixel(
        median(trimmed.map((pixel) => pixel.r)),
        median(trimmed.map((pixel) => pixel.g)),
        median(trimmed.map((pixel) => pixel.b)),
        1,
    );
}

function normalizedHueDistance(hue: number, target: number) {
    const diff = Math.abs(hue - target);
    return Math.min(diff, 360 - diff);
}

function describeTemperature(value: number) {
    if (value > 0.22) return "Warm 寄り";
    if (value < -0.22) return "Cool 寄り";
    return "Neutral 寄り";
}

function describeValue(value: number) {
    if (value >= 62) return "Light 寄り";
    if (value <= 48) return "Deep 寄り";
    return "中間";
}

function describeChroma(value: number) {
    if (value >= 76) return "Clear 寄り";
    if (value <= 60) return "Soft 寄り";
    return "中間";
}

function buildSummary(undertone: number, valueL: number, chromaC: number) {
    return `${describeTemperature(undertone)} / ${describeValue(valueL)} / ${describeChroma(chromaC)}`;
}

/* ─── ランドマーク ROI 生成 ─── */

function landmarkROI(
    landmarks: NLandmark[],
    indices: readonly number[],
    w: number, h: number,
    radius: number,
): NormalizedRect {
    const c = centroid(landmarks, indices, w, h);
    return {
        x: clamp((c.x - radius) / w, 0, 1),
        y: clamp((c.y - radius) / h, 0, 1),
        w: clamp((radius * 2) / w, 0.02, 0.3),
        h: clamp((radius * 2) / h, 0.02, 0.3),
    };
}

/* ─── 画像ロード ─── */

async function loadImage(url: string) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error("Image decode failed"));
            element.src = objectUrl;
        });
        return image;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

/* ═══════════════════ 16 シーズン分類 ═══════════════════ */

/**
 * 16 シーズンパーソナルカラー分類。
 *
 * 肌色の Lab 座標と補助軸（アンダートーン、明度、彩度、コントラスト）を
 * 16 タイプそれぞれのターゲットと照合し、上位 3 タイプをスコア付きで返す。
 *
 * ## アルゴリズム
 * 1. CIE DE2000 (Sharma et al., 2005) で Lab 色差を算出（重み 0.50）
 * 2. アンダートーン軸距離（重み 0.20）
 * 3. 明度 (L*) 距離（重み 0.12）
 * 4. 彩度 (C*) 距離（重み 0.10）
 * 5. コントラスト距離（重み 0.08）
 * 6. 全距離を加重合計し、1 - normalized_distance でスコア化
 *
 * ## 学術的根拠
 * - CIE DE2000 は知覚均等色差 (Sharma, Wu, Dalal, 2005)
 * - 16 タイプ定義は Sci\ART system (Kathryn Kalisz) に準拠
 * - 皮膚色の Lab 分布は Angelopoulou (1999) の反射スペクトル研究を参照
 *
 * @param skinLab - 肌色の CIE L*a*b* 座標
 * @param axes - analyzePhotoPersonalColor で算出された補助軸
 * @returns 上位 3 タイプのマッチ結果（スコア降順）
 */
export function classify16Season(
    skinLab: LabColor,
    axes: {
        undertone: number;
        value_L: number;
        chroma_C: number;
        contrast: number;
    },
): SixteenSeasonMatch[] {
    const scored = SIXTEEN_SEASON_TARGETS.map((target) => {
        // (1) CIE DE2000 色差: 0-100 スケールで正規化
        const labDist = ciede2000(skinLab, target.lab);
        const labScore = labDist / 60; // 60 DE2000 = 完全不一致とみなす

        // (2) アンダートーン軸距離: -1..+1 → 0..2 レンジ
        const undertoneDist = Math.abs(axes.undertone - target.undertoneScore) / 2;

        // (3) 明度距離: 0..100 → 0..1
        const valueDist = Math.abs(axes.value_L - target.valueL) / 100;

        // (4) 彩度距離: C* max ≈ 35、axes.chroma_C max ≈ 130（異なるスケール）
        // axes.chroma_C は skin chroma × 2.05 + saturation + contrast のブレンド値
        // target.chromaC は純粋な sqrt(a²+b²)。スケーリングで整合。
        const measuredPureChroma = Math.sqrt(skinLab.a ** 2 + skinLab.b ** 2);
        const chromaDist = Math.abs(measuredPureChroma - target.chromaC) / 40;

        // (5) コントラスト距離: 0..1
        const contrastDist = Math.abs(axes.contrast - target.contrastScore);

        // 加重合計
        const combined =
            labScore * 0.50 +
            undertoneDist * 0.20 +
            valueDist * 0.12 +
            chromaDist * 0.10 +
            contrastDist * 0.08;

        return {
            id: target.id,
            nameJa: target.nameJa,
            nameEn: target.nameEn,
            parentSeason: target.parentSeason,
            score: clamp(1 - combined, 0, 1),
        } satisfies SixteenSeasonMatch;
    });

    // スコア降順でソートし、上位 3 を返す
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 3);
}

/* ═══════════════════ メインエクスポート ═══════════════════ */

/**
 * 写真からパーソナルカラーを分析（v2）
 * @param imageUrl - 分析対象の画像URL
 * @param landmarks - MediaPipe FaceLandmarker のランドマーク（478点）。あれば精度向上。
 */
export async function analyzePhotoPersonalColor(
    imageUrl: string,
    landmarks?: NLandmark[] | null,
): Promise<PhotoColorAnalysisResult | null> {
    if (!imageUrl || typeof document === "undefined") return null;

    try {
        const image = await loadImage(imageUrl);
        const targetWidth = 280;
        const width = Math.max(120, Math.min(targetWidth, image.naturalWidth || image.width || targetWidth));
        const height = Math.max(120, Math.round((image.naturalHeight || image.height || width) * (width / (image.naturalWidth || image.width || width))));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return null;

        context.drawImage(image, 0, 0, width, height);

        // ── AWB 補正 ──
        const rawImageData = context.getImageData(0, 0, width, height);
        const { corrected, correctionMagnitude } = applyGrayWorldAWB(rawImageData);
        context.putImageData(corrected, 0, 0);
        const { data } = context.getImageData(0, 0, width, height);

        // ── ROI 定義（ランドマークがあれば精密、なければ固定矩形） ──
        const radius = Math.max(8, width * 0.05);
        const hasLandmarks = landmarks && landmarks.length >= 468;

        const skinRects: NormalizedRect[] = hasLandmarks
            ? [
                landmarkROI(landmarks!, FOREHEAD, width, height, radius),
                landmarkROI(landmarks!, LEFT_CHEEK, width, height, radius * 1.2),
                landmarkROI(landmarks!, RIGHT_CHEEK, width, height, radius * 1.2),
                landmarkROI(landmarks!, CHIN.slice(0, 4), width, height, radius),
            ]
            : [
                { x: 0.27, y: 0.42, w: 0.14, h: 0.11 },
                { x: 0.59, y: 0.42, w: 0.14, h: 0.11 },
                { x: 0.43, y: 0.27, w: 0.14, h: 0.08 },
                { x: 0.43, y: 0.63, w: 0.14, h: 0.08 },
            ];

        const hairRects: NormalizedRect[] = hasLandmarks
            ? [
                // ヘアライン上方をサンプリング
                (() => {
                    const hairC = centroid(landmarks!, HAIR_REF, width, height);
                    const topOffset = radius * 2.5;
                    return {
                        x: clamp((hairC.x - radius * 3) / width, 0, 1),
                        y: clamp((hairC.y - topOffset) / height, 0, 0.2),
                        w: clamp((radius * 6) / width, 0.1, 0.6),
                        h: clamp((radius * 2) / height, 0.04, 0.15),
                    };
                })(),
                { x: 0.08, y: 0.2, w: 0.16, h: 0.18 },
                { x: 0.76, y: 0.2, w: 0.16, h: 0.18 },
            ]
            : [
                { x: 0.2, y: 0.04, w: 0.6, h: 0.18 },
                { x: 0.08, y: 0.2, w: 0.16, h: 0.18 },
                { x: 0.76, y: 0.2, w: 0.16, h: 0.18 },
            ];

        const irisRects: NormalizedRect[] = hasLandmarks
            ? [
                landmarkROI(landmarks!, [...LEFT_IRIS], width, height, radius * 0.6),
                landmarkROI(landmarks!, [...RIGHT_IRIS], width, height, radius * 0.6),
            ]
            : [
                { x: 0.3, y: 0.37, w: 0.1, h: 0.08 },
                { x: 0.6, y: 0.37, w: 0.1, h: 0.08 },
            ];

        // ── ピクセルサンプリング ──
        const skinPixels = trimExtremesMAD(
            skinRects.flatMap((rect) =>
                samplePixels(data, width, height, rect, (pixel) => {
                    const hueOk = pixel.h <= 55 || pixel.h >= 335;
                    return hueOk && pixel.l >= 0.22 && pixel.l <= 0.88 && pixel.s >= 0.08 && pixel.s <= 0.62;
                }),
            ),
        );

        if (skinPixels.length < 12) return null;

        const skin = representativeColor(skinPixels, { r: 217, g: 179, b: 156 });
        const hairPixels = takeDarkest(
            hairRects.flatMap((rect) =>
                samplePixels(data, width, height, rect, (pixel) => pixel.l >= 0.03 && pixel.l <= 0.72),
            ),
            0.38,
        );
        const hair = representativeColor(hairPixels, { r: 91, g: 66, b: 54 });
        const irisPixels = takeDarkest(
            irisRects.flatMap((rect) =>
                samplePixels(data, width, height, rect, (pixel) => pixel.l >= 0.05 && pixel.l <= 0.66 && pixel.s >= 0.02),
            ),
            0.55,
        );
        const iris = representativeColor(irisPixels.length ? irisPixels : hairPixels, { r: 110, g: 79, b: 62 });

        // ── 多重照明検出 ──
        const illuminant = hasLandmarks
            ? detectMixedIlluminant(
                skinRects.map((rect, i) => {
                    const regionPixels = samplePixels(data, width, height, rect);
                    const avgR = regionPixels.length ? regionPixels.reduce((s, p) => s + p.r, 0) / regionPixels.length : 128;
                    const avgG = regionPixels.length ? regionPixels.reduce((s, p) => s + p.g, 0) / regionPixels.length : 128;
                    const avgB = regionPixels.length ? regionPixels.reduce((s, p) => s + p.b, 0) / regionPixels.length : 128;
                    return { region: ["forehead", "leftCheek", "rightCheek", "chin"][i] ?? "unknown", avgR, avgG, avgB };
                }),
            )
            : null;

        // ── 軸計算 ──
        const skinChroma = Math.sqrt(skin.lab.a ** 2 + skin.lab.b ** 2);
        const hairWarmth =
            clamp(1 - normalizedHueDistance(hair.h, 30) / 65, 0, 1) -
            clamp(1 - normalizedHueDistance(hair.h, 220) / 70, 0, 1);
        const irisWarmth =
            clamp(1 - normalizedHueDistance(iris.h, 32) / 70, 0, 1) -
            clamp(1 - normalizedHueDistance(iris.h, 220) / 80, 0, 1);
        const skinWarmth =
            clamp(1 - normalizedHueDistance(skin.h, 28) / 42, 0, 1) -
            clamp(1 - normalizedHueDistance(skin.h, 355) / 34, 0, 1);
        const undertoneAxis = clamp(
            skinWarmth * 0.55 +
            clamp((skin.lab.b - 16) / 14, -1, 1) * 0.25 +
            hairWarmth * 0.12 +
            irisWarmth * 0.08,
            -1,
            1,
        );

        const valueL = clamp(skin.lab.L * 1.04, 24, 92);
        const contrast = clamp(
            (Math.abs(skin.lab.L - hair.lab.L) * 0.72 + Math.abs(skin.lab.L - iris.lab.L) * 0.28) / 55,
            0, 1,
        );
        const avgSaturation = skin.s * 0.48 + hair.s * 0.28 + iris.s * 0.24;
        const chromaC = clamp(skinChroma * 2.05 + avgSaturation * 34 + contrast * 26, 36, 130);
        const clarity = clamp(((chromaC - 40) / 78) * 0.58 + contrast * 0.42, 0, 1);
        const depth = clamp(((100 - valueL) / 62) * 0.68 + contrast * 0.32, 0, 1);

        // ── 季節分類（CIE DE2000 ベース） ──
        const measuredLab: LabColor = skin.lab;

        const seasonRanking = (Object.entries(SEASON_TARGETS) as Array<[PhotoColorSeason, typeof SEASON_TARGETS[PhotoColorSeason]]>)
            .map(([season, target]) => {
                // Lab 色差（CIEDE2000）
                const labDist = ciede2000(measuredLab, target.lab);
                // 軸ベース距離（補助）
                const axisDist =
                    Math.abs(undertoneAxis - target.undertone) * 0.42 +
                    Math.abs(valueL - target.value_L) / 100 * 0.24 +
                    Math.abs(chromaC - target.chroma_C) / 100 * 0.2 +
                    Math.abs(contrast - target.contrast) * 0.14;
                // CIEDE2000 と軸距離をブレンド
                const combined = (labDist / 50) * 0.55 + axisDist * 0.45;
                return {
                    season,
                    score: clamp(1 - combined, 0, 1),
                };
            })
            .sort((a, b) => b.score - a.score);

        const primary = seasonRanking[0]?.season ?? "spring";
        const topScore = seasonRanking[0]?.score ?? 0.56;
        const secondScore = seasonRanking[1]?.score ?? 0.48;

        // ── 改善された信頼度スコアリング ──
        const sampleQuality = clamp(skinPixels.length / 90, 0.45, 1);
        const lightingQuality = clamp(1 - correctionMagnitude * 2, 0.3, 1); // AWB 補正が小さい = 良い照明
        const landmarkBonus = hasLandmarks ? 0.06 : 0; // ランドマーク使用時のボーナス

        // 領域間一貫性チェック（4領域の肌色Lab距離の平均）
        let regionConsistency = 0.7;
        if (skinRects.length >= 4) {
            const regionColors = skinRects.map((rect) => {
                const pixels = samplePixels(data, width, height, rect, (p) => {
                    const hueOk = p.h <= 55 || p.h >= 335;
                    return hueOk && p.l >= 0.22 && p.l <= 0.88;
                });
                return representativeColor(pixels, { r: 200, g: 170, b: 150 });
            });
            if (regionColors.length >= 2) {
                let totalDist = 0;
                let pairs = 0;
                for (let i = 0; i < regionColors.length; i++) {
                    for (let j = i + 1; j < regionColors.length; j++) {
                        totalDist += ciede2000(regionColors[i].lab, regionColors[j].lab);
                        pairs++;
                    }
                }
                const avgDist = pairs > 0 ? totalDist / pairs : 0;
                regionConsistency = clamp(1 - avgDist / 20, 0.3, 1);
            }
        }

        const confidence = clamp(
            0.50 +
            (topScore - secondScore) * 0.30 +
            sampleQuality * 0.08 +
            lightingQuality * 0.08 +
            regionConsistency * 0.06 +
            landmarkBonus,
            0.50,
            0.98,
        );

        const undertone: PhotoColorUndertone =
            undertoneAxis > 0.18 ? "warm" : undertoneAxis < -0.18 ? "cool" : "neutral";

        // ── 16 シーズン分類 ──
        const sixteenSeasonResult = classify16Season(measuredLab, {
            undertone: undertoneAxis,
            value_L: valueL,
            chroma_C: chromaC,
            contrast,
        });

        return {
            season: primary,
            undertone,
            confidence,
            summary: buildSummary(undertoneAxis, valueL, chromaC),
            axes: {
                undertone: undertoneAxis,
                value_L: valueL,
                chroma_C: chromaC,
                contrast,
                clarity,
                depth,
            },
            palette: {
                selectedHex: rgbToHex(skin),
                hairHex: rgbToHex(hair),
                irisHex: rgbToHex(iris),
            },
            awbCorrectionMagnitude: correctionMagnitude,
            illuminantWarning: illuminant?.warning ?? null,
            sixteenSeason: sixteenSeasonResult,
        };
    } catch {
        return null;
    }
}
