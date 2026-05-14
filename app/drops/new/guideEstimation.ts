"use client";

export type MeasureZone = "upper" | "lower";

export type MeasureGuide = {
    zone: MeasureZone;
    from: [number, number];
    to: [number, number];
    tip: string;
    confidence?: number;
};

export type MeasureGuideMap = Record<string, MeasureGuide>;

const UPPER_KEYS = ["shoulder_cm", "chest_cm", "waist_cm", "length_cm", "sleeve_cm", "armhole"] as const;
const LOWER_KEYS = ["rise_cm", "hip_cm", "thigh_cm", "inseam_cm"] as const;

export const DEFAULT_MEASURE_GUIDES: MeasureGuideMap = {
    shoulder_cm: { zone: "upper", from: [17, 18], to: [83, 18], tip: "肩先→肩先を水平に計測" },
    chest_cm: { zone: "upper", from: [20, 34], to: [80, 34], tip: "脇下ラインを水平に計測" },
    waist_cm: { zone: "upper", from: [24, 50], to: [76, 50], tip: "胴の一番細い位置を計測" },
    length_cm: { zone: "upper", from: [50, 18], to: [50, 84], tip: "後ろ襟付け根→裾" },
    sleeve_cm: { zone: "upper", from: [70, 24], to: [92, 58], tip: "裄丈: 首付け根→肩先→袖口（2セグメント）" },
    armhole: { zone: "upper", from: [67, 35], to: [67, 56], tip: "袖ぐり深さ（0浅い〜2深い）" },
    rise_cm: { zone: "lower", from: [50, 14], to: [50, 36], tip: "前中心→股下" },
    hip_cm: { zone: "lower", from: [22, 32], to: [78, 32], tip: "ヒップ最大部を水平に計測" },
    thigh_cm: { zone: "lower", from: [34, 48], to: [66, 48], tip: "わたり幅（片脚）を計測" },
    inseam_cm: { zone: "lower", from: [50, 36], to: [50, 88], tip: "股下→裾口" },
};

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function toPercent(x: number, y: number, w: number, h: number): [number, number] {
    return [clamp((x / w) * 100, 1, 99), clamp((y / h) * 100, 1, 99)];
}

function createCanvasFromImage(img: HTMLImageElement) {
    const maxDim = 640;
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const w = Math.max(64, Math.round((img.naturalWidth || img.width) * scale));
    const h = Math.max(64, Math.round((img.naturalHeight || img.height) * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    return { w, h, imageData };
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("image_load_failed"));
        img.src = src;
    });
}

function estimateMask(w: number, h: number, rgba: Uint8ClampedArray): Uint8Array {
    // If image already has transparency (from cutout pipeline), use alpha directly for max precision.
    let alphaNonZero = 0;
    let alphaLow = 0;
    for (let i = 3; i < rgba.length; i += 4) {
        const a = rgba[i];
        if (a > 8) alphaNonZero++;
        if (a > 8 && a < 250) alphaLow++;
    }
    if (alphaNonZero > w * h * 0.03 && alphaLow > w * h * 0.002) {
        const byAlpha = new Uint8Array(w * h);
        for (let i = 0, p = 3; i < byAlpha.length; i++, p += 4) {
            byAlpha[i] = rgba[p] > 8 ? 1 : 0;
        }
        return byAlpha;
    }

    let br = 0;
    let bg = 0;
    let bb = 0;
    let borderCount = 0;

    const sample = (x: number, y: number) => {
        const i = (y * w + x) * 4;
        br += rgba[i];
        bg += rgba[i + 1];
        bb += rgba[i + 2];
        borderCount++;
    };

    for (let x = 0; x < w; x++) {
        sample(x, 0);
        sample(x, h - 1);
    }
    for (let y = 1; y < h - 1; y++) {
        sample(0, y);
        sample(w - 1, y);
    }

    br /= Math.max(borderCount, 1);
    bg /= Math.max(borderCount, 1);
    bb /= Math.max(borderCount, 1);

    const dist = new Float32Array(w * h);
    let sum = 0;
    let sumSq = 0;
    const cx = w * 0.5;
    const cy = h * 0.52;
    const maxR = Math.sqrt(cx * cx + cy * cy);

    for (let i = 0, p = 0; i < dist.length; i++, p += 4) {
        const dr = rgba[p] - br;
        const dg = rgba[p + 1] - bg;
        const db = rgba[p + 2] - bb;
        const d = Math.sqrt(dr * dr + dg * dg + db * db);

        // Center prior helps reject background walls/floor for hanging/flat-lay photos.
        const x = i % w;
        const y = (i / w) | 0;
        const rc = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / Math.max(maxR, 1);
        const centerBoost = (1 - Math.min(1, rc)) * 10;
        const adjusted = d + centerBoost;

        dist[i] = adjusted;
        sum += adjusted;
        sumSq += adjusted * adjusted;
    }

    const mean = sum / Math.max(dist.length, 1);
    const variance = Math.max(0, sumSq / Math.max(dist.length, 1) - mean * mean);
    const std = Math.sqrt(variance);
    const threshold = Math.max(20, mean + std * 0.28);

    let mask = new Uint8Array(w * h);
    for (let i = 0; i < dist.length; i++) {
        mask[i] = dist[i] > threshold ? 1 : 0;
    }

    // Light denoise (majority filter) - enough for upload preview use.
    const smooth = (src: Uint8Array, need: number) => {
        const out = new Uint8Array(src.length);
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                let cnt = 0;
                const i = y * w + x;
                cnt += src[i - w - 1];
                cnt += src[i - w];
                cnt += src[i - w + 1];
                cnt += src[i - 1];
                cnt += src[i];
                cnt += src[i + 1];
                cnt += src[i + w - 1];
                cnt += src[i + w];
                cnt += src[i + w + 1];
                out[i] = cnt >= need ? 1 : 0;
            }
        }
        return out;
    };

    mask = smooth(mask, 5);
    mask = smooth(mask, 4);
    return mask;
}

function keepLargestComponent(mask: Uint8Array, w: number, h: number): Uint8Array {
    const labels = new Int32Array(mask.length);
    const queue = new Int32Array(mask.length);
    let label = 0;
    let bestLabel = 0;
    let bestArea = 0;

    const neighbors = (idx: number, out: number[]) => {
        out.length = 0;
        const x = idx % w;
        const y = (idx / w) | 0;
        if (x > 0) out.push(idx - 1);
        if (x < w - 1) out.push(idx + 1);
        if (y > 0) out.push(idx - w);
        if (y < h - 1) out.push(idx + w);
    };

    const tmp: number[] = [];
    for (let i = 0; i < mask.length; i++) {
        if (!mask[i] || labels[i] !== 0) continue;
        label++;
        let area = 0;
        let head = 0;
        let tail = 0;
        queue[tail++] = i;
        labels[i] = label;

        while (head < tail) {
            const cur = queue[head++];
            area++;
            neighbors(cur, tmp);
            for (let n = 0; n < tmp.length; n++) {
                const ni = tmp[n];
                if (!mask[ni] || labels[ni] !== 0) continue;
                labels[ni] = label;
                queue[tail++] = ni;
            }
        }

        if (area > bestArea) {
            bestArea = area;
            bestLabel = label;
        }
    }

    if (!bestLabel) return new Uint8Array(mask.length);
    const out = new Uint8Array(mask.length);
    for (let i = 0; i < labels.length; i++) out[i] = labels[i] === bestLabel ? 1 : 0;
    return out;
}

type Silhouette = {
    w: number;
    h: number;
    mask: Uint8Array;
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
    rowsLeft: Int32Array;
    rowsRight: Int32Array;
    rowsCount: Int32Array;
    centerX: number;
    bboxWidth: number;
    bboxHeight: number;
    confidence: number;
};

function analyzeSilhouette(w: number, h: number, maskRaw: Uint8Array): Silhouette | null {
    const mask = keepLargestComponent(maskRaw, w, h);

    const rowsLeft = new Int32Array(h);
    const rowsRight = new Int32Array(h);
    const rowsCount = new Int32Array(h);
    rowsLeft.fill(w);
    rowsRight.fill(-1);

    let xMin = w;
    let xMax = -1;
    let yMin = h;
    let yMax = -1;
    let area = 0;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (!mask[i]) continue;
            area++;
            if (x < xMin) xMin = x;
            if (x > xMax) xMax = x;
            if (y < yMin) yMin = y;
            if (y > yMax) yMax = y;
            if (x < rowsLeft[y]) rowsLeft[y] = x;
            if (x > rowsRight[y]) rowsRight[y] = x;
            rowsCount[y]++;
        }
    }

    if (area < w * h * 0.02 || xMax <= xMin || yMax <= yMin) return null;

    const bboxWidth = xMax - xMin + 1;
    const bboxHeight = yMax - yMin + 1;
    let cxSum = 0;
    let cxCnt = 0;
    for (let y = yMin; y <= yMax; y++) {
        if (rowsCount[y] <= 0) continue;
        cxSum += (rowsLeft[y] + rowsRight[y]) * 0.5;
        cxCnt++;
    }
    const centerX = cxCnt ? cxSum / cxCnt : (xMin + xMax) * 0.5;
    const confidence = clamp(area / Math.max(bboxWidth * bboxHeight, 1), 0, 1);

    return {
        w,
        h,
        mask,
        xMin,
        xMax,
        yMin,
        yMax,
        rowsLeft,
        rowsRight,
        rowsCount,
        centerX,
        bboxWidth,
        bboxHeight,
        confidence,
    };
}

function nearestRowWithPixels(rowsCount: Int32Array, target: number, minY: number, maxY: number) {
    const t = clamp(Math.round(target), minY, maxY);
    if (rowsCount[t] > 0) return t;
    const maxDelta = Math.max(Math.abs(t - minY), Math.abs(maxY - t));
    for (let d = 1; d <= maxDelta; d++) {
        const up = t - d;
        const down = t + d;
        if (up >= minY && rowsCount[up] > 0) return up;
        if (down <= maxY && rowsCount[down] > 0) return down;
    }
    return t;
}

function widthAtRow(s: Silhouette, y: number) {
    if (s.rowsCount[y] <= 0) return 0;
    return s.rowsRight[y] - s.rowsLeft[y];
}

function estimateUpperGuides(s: Silhouette): MeasureGuideMap {
    const out: MeasureGuideMap = {};
    const top = s.yMin;
    const bottom = s.yMax;
    const h = s.bboxHeight;
    const centerX = s.centerX;

    const shoulderStart = nearestRowWithPixels(s.rowsCount, top + h * 0.08, top, bottom);
    const shoulderEnd = nearestRowWithPixels(s.rowsCount, top + h * 0.34, top, bottom);
    let shoulderY = shoulderStart;
    let shoulderBest = 0;
    for (let y = shoulderStart; y <= shoulderEnd; y++) {
        const w = widthAtRow(s, y);
        if (w > shoulderBest) {
            shoulderBest = w;
            shoulderY = y;
        }
    }

    const chestY = nearestRowWithPixels(s.rowsCount, top + h * 0.34, top, bottom);
    const waistY = nearestRowWithPixels(s.rowsCount, top + h * 0.52, top, bottom);

    const shoulderLeft = s.rowsLeft[shoulderY];
    const shoulderRight = s.rowsRight[shoulderY];
    const chestLeft = s.rowsLeft[chestY];
    const chestRight = s.rowsRight[chestY];
    const waistLeft = s.rowsLeft[waistY];
    const waistRight = s.rowsRight[waistY];

    const sleeveScanStart = nearestRowWithPixels(s.rowsCount, top + h * 0.16, top, bottom);
    const sleeveScanEnd = nearestRowWithPixels(s.rowsCount, top + h * 0.6, top, bottom);
    let sleeveY = chestY;
    let sleeveX = chestRight;
    for (let y = sleeveScanStart; y <= sleeveScanEnd; y++) {
        if (s.rowsCount[y] <= 0) continue;
        if (s.rowsRight[y] > sleeveX) {
            sleeveX = s.rowsRight[y];
            sleeveY = y;
        }
    }

    const armholeX = clamp(chestRight - Math.round(s.bboxWidth * 0.16), s.xMin, s.xMax);
    const armholeY1 = nearestRowWithPixels(s.rowsCount, shoulderY + h * 0.1, top, bottom);
    const armholeY2 = nearestRowWithPixels(s.rowsCount, chestY + h * 0.2, top, bottom);

    out.shoulder_cm = {
        zone: "upper",
        from: toPercent(shoulderLeft, shoulderY, s.w, s.h),
        to: toPercent(shoulderRight, shoulderY, s.w, s.h),
        tip: DEFAULT_MEASURE_GUIDES.shoulder_cm.tip,
        confidence: s.confidence,
    };
    out.chest_cm = {
        zone: "upper",
        from: toPercent(chestLeft, chestY, s.w, s.h),
        to: toPercent(chestRight, chestY, s.w, s.h),
        tip: DEFAULT_MEASURE_GUIDES.chest_cm.tip,
        confidence: s.confidence,
    };
    out.waist_cm = {
        zone: "upper",
        from: toPercent(waistLeft, waistY, s.w, s.h),
        to: toPercent(waistRight, waistY, s.w, s.h),
        tip: DEFAULT_MEASURE_GUIDES.waist_cm.tip,
        confidence: s.confidence,
    };
    out.length_cm = {
        zone: "upper",
        from: toPercent(centerX, top, s.w, s.h),
        to: toPercent(centerX, bottom, s.w, s.h),
        tip: DEFAULT_MEASURE_GUIDES.length_cm.tip,
        confidence: s.confidence,
    };
    out.sleeve_cm = {
        zone: "upper",
        from: toPercent(Math.max(shoulderRight - s.bboxWidth * 0.1, s.xMin), shoulderY, s.w, s.h),
        to: toPercent(sleeveX, sleeveY, s.w, s.h),
        tip: DEFAULT_MEASURE_GUIDES.sleeve_cm.tip,
        confidence: s.confidence * 0.9,
    };
    out.armhole = {
        zone: "upper",
        from: toPercent(armholeX, armholeY1, s.w, s.h),
        to: toPercent(armholeX, armholeY2, s.w, s.h),
        tip: DEFAULT_MEASURE_GUIDES.armhole.tip,
        confidence: s.confidence * 0.85,
    };

    return out;
}

function estimateLowerGuides(s: Silhouette): MeasureGuideMap {
    const out: MeasureGuideMap = {};
    const top = s.yMin;
    const bottom = s.yMax;
    const h = s.bboxHeight;
    const centerX = s.centerX;

    const hipY = nearestRowWithPixels(s.rowsCount, top + h * 0.3, top, bottom);
    const thighY = nearestRowWithPixels(s.rowsCount, top + h * 0.5, top, bottom);
    const riseY1 = nearestRowWithPixels(s.rowsCount, top + h * 0.08, top, bottom);
    const riseY2 = nearestRowWithPixels(s.rowsCount, top + h * 0.34, top, bottom);
    const inseamY2 = nearestRowWithPixels(s.rowsCount, bottom - h * 0.06, top, bottom);

    const hipLeft = s.rowsLeft[hipY];
    const hipRight = s.rowsRight[hipY];

    // Thigh: prioritize right leg width (center -> right edge).
    const thighRight = s.rowsRight[thighY];
    const thighLeft = clamp(Math.round(centerX + s.bboxWidth * 0.04), s.xMin, thighRight - 2);

    out.rise_cm = {
        zone: "lower",
        from: toPercent(centerX, riseY1, s.w, s.h),
        to: toPercent(centerX, riseY2, s.w, s.h),
        tip: DEFAULT_MEASURE_GUIDES.rise_cm.tip,
        confidence: s.confidence,
    };
    out.hip_cm = {
        zone: "lower",
        from: toPercent(hipLeft, hipY, s.w, s.h),
        to: toPercent(hipRight, hipY, s.w, s.h),
        tip: DEFAULT_MEASURE_GUIDES.hip_cm.tip,
        confidence: s.confidence,
    };
    out.thigh_cm = {
        zone: "lower",
        from: toPercent(thighLeft, thighY, s.w, s.h),
        to: toPercent(thighRight, thighY, s.w, s.h),
        tip: DEFAULT_MEASURE_GUIDES.thigh_cm.tip,
        confidence: s.confidence * 0.88,
    };
    out.inseam_cm = {
        zone: "lower",
        from: toPercent(centerX, riseY2, s.w, s.h),
        to: toPercent(centerX, inseamY2, s.w, s.h),
        tip: DEFAULT_MEASURE_GUIDES.inseam_cm.tip,
        confidence: s.confidence,
    };

    return out;
}

export async function estimateMeasurementGuides(imageUrl: string, zone: MeasureZone): Promise<MeasureGuideMap> {
    const img = await loadImage(imageUrl);
    const canvasData = createCanvasFromImage(img);
    if (!canvasData) {
        return zone === "upper"
            ? Object.fromEntries(UPPER_KEYS.map((k) => [k, DEFAULT_MEASURE_GUIDES[k]]))
            : Object.fromEntries(LOWER_KEYS.map((k) => [k, DEFAULT_MEASURE_GUIDES[k]]));
    }

    const { w, h, imageData } = canvasData;
    const rawMask = estimateMask(w, h, imageData.data);
    const silhouette = analyzeSilhouette(w, h, rawMask);
    if (!silhouette) {
        return zone === "upper"
            ? Object.fromEntries(UPPER_KEYS.map((k) => [k, DEFAULT_MEASURE_GUIDES[k]]))
            : Object.fromEntries(LOWER_KEYS.map((k) => [k, DEFAULT_MEASURE_GUIDES[k]]));
    }

    const guides = zone === "upper" ? estimateUpperGuides(silhouette) : estimateLowerGuides(silhouette);
    return guides;
}
