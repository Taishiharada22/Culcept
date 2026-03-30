/**
 * imageColorExtract.ts
 * Client-side color extraction from images using canvas pixel sampling.
 */

import { COLOR_OPTIONS } from "./constants";

export type DominantColor = {
    hex: string;
    percentage: number;
};

/** Convert RGB components to a hex string like "#rrggbb" */
export function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Euclidean distance between two RGB triples */
function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/** Parse "#rrggbb" into [r, g, b] */
function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace("#", "");
    return [
        parseInt(h.substring(0, 2), 16),
        parseInt(h.substring(2, 4), 16),
        parseInt(h.substring(4, 6), 16),
    ];
}

/**
 * Find the closest COLOR_OPTIONS entry by Euclidean RGB distance.
 * Returns the matching `{ value, label, hex }` entry.
 */
export function hexToColorName(hex: string): { value: string; label: string; hex: string } {
    const [r, g, b] = hexToRgb(hex);
    let best = COLOR_OPTIONS[0];
    let bestDist = Infinity;

    for (const opt of COLOR_OPTIONS) {
        const [cr, cg, cb] = hexToRgb(opt.hex);
        const dist = colorDistance(r, g, b, cr, cg, cb);
        if (dist < bestDist) {
            bestDist = dist;
            best = opt;
        }
    }

    return best;
}

/** Simple centroid-based k-means clustering (k iterations, no library) */
function kMeansCluster(
    pixels: Array<[number, number, number]>,
    k: number,
    iterations = 8,
): Array<{ r: number; g: number; b: number; count: number }> {
    if (pixels.length === 0) return [];
    k = Math.min(k, pixels.length);

    // Initialise centroids by picking k evenly-spaced pixels
    const step = Math.max(1, Math.floor(pixels.length / k));
    let centroids: Array<[number, number, number]> = Array.from({ length: k }, (_, i) => {
        const px = pixels[i * step];
        return [px[0], px[1], px[2]];
    });

    let assignments: number[] = new Array(pixels.length).fill(0);

    for (let iter = 0; iter < iterations; iter++) {
        // Assign each pixel to the nearest centroid
        assignments = pixels.map(([r, g, b]) => {
            let minDist = Infinity;
            let minIdx = 0;
            for (let ci = 0; ci < centroids.length; ci++) {
                const d = colorDistance(r, g, b, centroids[ci][0], centroids[ci][1], centroids[ci][2]);
                if (d < minDist) {
                    minDist = d;
                    minIdx = ci;
                }
            }
            return minIdx;
        });

        // Recompute centroids
        const sums: Array<[number, number, number, number]> = Array.from({ length: k }, () => [0, 0, 0, 0]);
        for (let pi = 0; pi < pixels.length; pi++) {
            const ci = assignments[pi];
            sums[ci][0] += pixels[pi][0];
            sums[ci][1] += pixels[pi][1];
            sums[ci][2] += pixels[pi][2];
            sums[ci][3] += 1;
        }
        centroids = sums.map(([sr, sg, sb, cnt]) =>
            cnt > 0 ? [sr / cnt, sg / cnt, sb / cnt] : [0, 0, 0],
        );
    }

    // Build cluster result
    const counts = new Array(k).fill(0);
    for (const ci of assignments) counts[ci]++;

    return centroids.map(([r, g, b], i) => ({
        r: Math.round(r),
        g: Math.round(g),
        b: Math.round(b),
        count: counts[i],
    }));
}

/**
 * Extract the top N dominant colors from an image File or Blob.
 * Scales the image to 50×50 on an offscreen canvas, clusters pixels, and
 * returns colours sorted by frequency.
 *
 * @param file   Image file or blob
 * @param topN   Number of colours to return (default 3)
 * @returns      Array of `{ hex, percentage }` sorted by descending percentage
 */
export function extractDominantColors(file: File | Blob, topN = 3): Promise<DominantColor[]> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            const img = new Image();

            img.onload = () => {
                const SIZE = 50;
                const canvas = document.createElement("canvas");
                canvas.width = SIZE;
                canvas.height = SIZE;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    reject(new Error("canvas context unavailable"));
                    return;
                }

                ctx.drawImage(img, 0, 0, SIZE, SIZE);
                const imageData = ctx.getImageData(0, 0, SIZE, SIZE);
                const data = imageData.data;

                // Collect non-transparent pixels
                const pixels: Array<[number, number, number]> = [];
                for (let i = 0; i < data.length; i += 4) {
                    const alpha = data[i + 3];
                    if (alpha > 128) {
                        pixels.push([data[i], data[i + 1], data[i + 2]]);
                    }
                }

                if (pixels.length === 0) {
                    resolve([]);
                    return;
                }

                const clusters = kMeansCluster(pixels, topN + 2); // extra clusters for better coverage
                const total = pixels.length;

                const result: DominantColor[] = clusters
                    .filter((c) => c.count > 0)
                    .sort((a, b) => b.count - a.count)
                    .slice(0, topN)
                    .map((c) => ({
                        hex: rgbToHex(c.r, c.g, c.b),
                        percentage: Math.round((c.count / total) * 100),
                    }));

                resolve(result);
            };

            img.onerror = () => reject(new Error("image load failed"));
            img.src = reader.result as string;
        };

        reader.onerror = () => reject(new Error("file read failed"));
        reader.readAsDataURL(file);
    });
}
