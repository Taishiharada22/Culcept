/* ── Background Removal (Canvas-based, offline MVP) ── */

export interface RemovalResult {
    originalUrl: string;
    processedUrl: string;
    confidence: number;
}

/* ── Helpers ── */

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Image load failed"));
        img.src = src;
    });
}

function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("File read failed"));
        reader.readAsDataURL(file);
    });
}

function colorDistance(
    r1: number,
    g1: number,
    b1: number,
    r2: number,
    g2: number,
    b2: number
): number {
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/**
 * Sample the dominant color from the four corners of the image.
 * Returns [r, g, b] average of corner samples.
 */
function sampleCornerColor(
    data: Uint8ClampedArray,
    width: number,
    height: number
): [number, number, number] {
    const sampleSize = Math.max(1, Math.min(10, Math.floor(Math.min(width, height) * 0.05)));
    const corners = [
        { x: 0, y: 0 },
        { x: width - sampleSize, y: 0 },
        { x: 0, y: height - sampleSize },
        { x: width - sampleSize, y: height - sampleSize },
    ];

    let totalR = 0;
    let totalG = 0;
    let totalB = 0;
    let count = 0;

    for (const corner of corners) {
        for (let dy = 0; dy < sampleSize; dy++) {
            for (let dx = 0; dx < sampleSize; dx++) {
                const px = corner.x + dx;
                const py = corner.y + dy;
                const idx = (py * width + px) * 4;
                totalR += data[idx];
                totalG += data[idx + 1];
                totalB += data[idx + 2];
                count++;
            }
        }
    }

    return [
        Math.round(totalR / count),
        Math.round(totalG / count),
        Math.round(totalB / count),
    ];
}

/**
 * Flood-fill from edges marking background pixels.
 * Uses a tolerance-based approach: pixels within `tolerance` color distance
 * from the sampled corner color are considered background.
 */
function floodFillFromEdges(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    bgR: number,
    bgG: number,
    bgB: number,
    tolerance: number
): Uint8Array {
    const mask = new Uint8Array(width * height); // 0 = subject, 1 = background
    const visited = new Uint8Array(width * height);
    const queue: number[] = [];

    const tryEnqueue = (x: number, y: number) => {
        if (x < 0 || x >= width || y < 0 || y >= height) return;
        const pos = y * width + x;
        if (visited[pos]) return;
        visited[pos] = 1;
        const idx = pos * 4;
        const dist = colorDistance(
            data[idx],
            data[idx + 1],
            data[idx + 2],
            bgR,
            bgG,
            bgB
        );
        if (dist <= tolerance) {
            mask[pos] = 1;
            queue.push(pos);
        }
    };

    // Seed from all edge pixels
    for (let x = 0; x < width; x++) {
        tryEnqueue(x, 0);
        tryEnqueue(x, height - 1);
    }
    for (let y = 0; y < height; y++) {
        tryEnqueue(0, y);
        tryEnqueue(width - 1, y);
    }

    // BFS
    while (queue.length > 0) {
        const pos = queue.shift()!;
        const x = pos % width;
        const y = Math.floor(pos / width);
        tryEnqueue(x - 1, y);
        tryEnqueue(x + 1, y);
        tryEnqueue(x, y - 1);
        tryEnqueue(x, y + 1);
    }

    return mask;
}

/**
 * Find the bounding box of non-background (subject) pixels.
 */
function findSubjectBounds(
    mask: Uint8Array,
    width: number,
    height: number
): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (mask[y * width + x] === 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    // If no subject found, return full image
    if (maxX < minX || maxY < minY) {
        return { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 };
    }

    return { minX, minY, maxX, maxY };
}

/**
 * Apply morphological smoothing to the mask to reduce jagged edges.
 * Simple erode-then-dilate (opening).
 */
function smoothMask(
    mask: Uint8Array,
    width: number,
    height: number
): Uint8Array {
    const eroded = new Uint8Array(mask.length);
    const result = new Uint8Array(mask.length);

    // Erode: a pixel is background only if ALL neighbors are background
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const pos = y * width + x;
            if (
                mask[pos] === 1 &&
                mask[pos - 1] === 1 &&
                mask[pos + 1] === 1 &&
                mask[(y - 1) * width + x] === 1 &&
                mask[(y + 1) * width + x] === 1
            ) {
                eroded[pos] = 1;
            }
        }
    }

    // Dilate: a pixel is background if ANY neighbor is background (eroded)
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const pos = y * width + x;
            if (
                eroded[pos] === 1 ||
                eroded[pos - 1] === 1 ||
                eroded[pos + 1] === 1 ||
                eroded[(y - 1) * width + x] === 1 ||
                eroded[(y + 1) * width + x] === 1
            ) {
                result[pos] = 1;
            }
        }
    }

    return result;
}

/* ── Public API ── */

/**
 * Remove background from an image file.
 * Uses edge flood-fill with corner-sampled background color.
 */
export async function removeBackground(
    imageFile: File,
    options?: {
        tolerance?: number; // 0-442, default 50
        bgColor?: string; // replacement color, default transparent
    }
): Promise<RemovalResult> {
    const tolerance = options?.tolerance ?? 50;
    const dataUrl = await fileToDataUrl(imageFile);
    const img = await loadImage(dataUrl);

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const { data } = imageData;

    // Sample background color from corners
    const [bgR, bgG, bgB] = sampleCornerColor(data, img.width, img.height);

    // Flood fill from edges
    let mask = floodFillFromEdges(
        data,
        img.width,
        img.height,
        bgR,
        bgG,
        bgB,
        tolerance
    );

    // Smooth mask edges
    mask = smoothMask(mask, img.width, img.height);

    // Calculate confidence (ratio of bg to total - higher bg ratio = higher confidence)
    const bgPixels = mask.reduce((sum, v) => sum + v, 0);
    const totalPixels = img.width * img.height;
    const bgRatio = bgPixels / totalPixels;
    // Confidence is high when bg ratio is between 20-80%
    const confidence = bgRatio > 0.1 && bgRatio < 0.9
        ? Math.min(1, 0.5 + bgRatio * 0.5)
        : 0.3;

    // Replace background pixels
    if (options?.bgColor && options.bgColor !== "transparent") {
        // Parse hex color
        const hex = options.bgColor.replace("#", "");
        const fillR = parseInt(hex.slice(0, 2), 16);
        const fillG = parseInt(hex.slice(2, 4), 16);
        const fillB = parseInt(hex.slice(4, 6), 16);

        for (let i = 0; i < mask.length; i++) {
            if (mask[i] === 1) {
                const idx = i * 4;
                data[idx] = fillR;
                data[idx + 1] = fillG;
                data[idx + 2] = fillB;
                data[idx + 3] = 255;
            }
        }
    } else {
        // Transparent background
        for (let i = 0; i < mask.length; i++) {
            if (mask[i] === 1) {
                data[i * 4 + 3] = 0;
            }
        }
    }

    ctx.putImageData(imageData, 0, 0);
    const processedUrl = canvas.toDataURL("image/png");

    return {
        originalUrl: dataUrl,
        processedUrl,
        confidence,
    };
}

/**
 * Apply a clean background with auto-crop and optional subtle shadow.
 */
export async function applyCleanBackground(
    imageUrl: string,
    bgColor = "#ffffff"
): Promise<string> {
    const img = await loadImage(imageUrl);

    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = img.width;
    tmpCanvas.height = img.height;
    const tmpCtx = tmpCanvas.getContext("2d")!;
    tmpCtx.drawImage(img, 0, 0);

    const imageData = tmpCtx.getImageData(0, 0, img.width, img.height);
    const { data } = imageData;

    const [bgR, bgG, bgB] = sampleCornerColor(data, img.width, img.height);
    const mask = floodFillFromEdges(data, img.width, img.height, bgR, bgG, bgB, 50);

    const bounds = findSubjectBounds(mask, img.width, img.height);

    // Add padding (10% on each side)
    const subW = bounds.maxX - bounds.minX + 1;
    const subH = bounds.maxY - bounds.minY + 1;
    const padX = Math.round(subW * 0.1);
    const padY = Math.round(subH * 0.1);

    const outW = subW + padX * 2;
    const outH = subH + padY * 2;

    const outCanvas = document.createElement("canvas");
    outCanvas.width = outW;
    outCanvas.height = outH;
    const outCtx = outCanvas.getContext("2d")!;

    // Fill background
    outCtx.fillStyle = bgColor;
    outCtx.fillRect(0, 0, outW, outH);

    // Draw subtle shadow
    outCtx.shadowColor = "rgba(0, 0, 0, 0.08)";
    outCtx.shadowBlur = 20;
    outCtx.shadowOffsetY = 4;

    // Draw subject region
    outCtx.drawImage(
        img,
        bounds.minX,
        bounds.minY,
        subW,
        subH,
        padX,
        padY,
        subW,
        subH
    );

    return outCanvas.toDataURL("image/png");
}

/**
 * Crop to subject bounding box with padding.
 */
export async function cropToSubject(
    imageUrl: string,
    padding = 0.1
): Promise<string> {
    const img = await loadImage(imageUrl);

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const { data } = imageData;

    const [bgR, bgG, bgB] = sampleCornerColor(data, img.width, img.height);
    const mask = floodFillFromEdges(data, img.width, img.height, bgR, bgG, bgB, 50);
    const bounds = findSubjectBounds(mask, img.width, img.height);

    const subW = bounds.maxX - bounds.minX + 1;
    const subH = bounds.maxY - bounds.minY + 1;
    const padX = Math.round(subW * padding);
    const padY = Math.round(subH * padding);

    const cropX = Math.max(0, bounds.minX - padX);
    const cropY = Math.max(0, bounds.minY - padY);
    const cropW = Math.min(img.width - cropX, subW + padX * 2);
    const cropH = Math.min(img.height - cropY, subH + padY * 2);

    const outCanvas = document.createElement("canvas");
    outCanvas.width = cropW;
    outCanvas.height = cropH;
    const outCtx = outCanvas.getContext("2d")!;
    outCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    return outCanvas.toDataURL("image/png");
}

/**
 * Erase a circular region (for manual touch-up).
 * Returns a new data URL with the region erased (made transparent or filled).
 */
export async function eraseRegion(
    imageUrl: string,
    centerX: number,
    centerY: number,
    radius: number,
    fillColor?: string // undefined = transparent
): Promise<string> {
    const img = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    ctx.globalCompositeOperation = fillColor ? "source-over" : "destination-out";

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);

    if (fillColor) {
        ctx.fillStyle = fillColor;
    } else {
        ctx.fillStyle = "rgba(0, 0, 0, 1)";
    }
    ctx.fill();

    ctx.globalCompositeOperation = "source-over";

    return canvas.toDataURL("image/png");
}
