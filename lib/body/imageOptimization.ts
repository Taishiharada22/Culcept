/* ─────────────────────────────────────────────
   画像最適化
   - 最大寸法制限（2000px）
   - WebP 変換 (quality 85)
   - JPEG フォールバック
   ───────────────────────────────────────────── */

const MAX_DIMENSION = 2000;
const TARGET_QUALITY = 0.85;

interface OptimizedImage {
    buffer: Buffer;
    mimeType: string;
    extension: string;
    originalSize: number;
    optimizedSize: number;
}

/**
 * data URL をサーバーサイドで最適化
 * - 最大 2000px にリサイズ
 * - WebP 変換を試行、失敗時は JPEG
 */
export async function optimizeImageForUpload(dataUrl: string): Promise<OptimizedImage | null> {
    const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.*)$/.exec(dataUrl);
    if (!match) return null;

    const base64 = match[2];
    const originalBuffer = Buffer.from(base64, "base64");
    const originalSize = originalBuffer.length;

    try {
        // sharp がインストールされていれば使用
        const sharp = (await import("sharp")).default;

        const metadata = await sharp(originalBuffer).metadata();
        const { width = 0, height = 0 } = metadata;

        let pipeline = sharp(originalBuffer);

        // リサイズ（長辺が MAX_DIMENSION を超える場合）
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            pipeline = pipeline.resize({
                width: width > height ? MAX_DIMENSION : undefined,
                height: height >= width ? MAX_DIMENSION : undefined,
                fit: "inside",
                withoutEnlargement: true,
            });
        }

        // WebP 変換を試行
        try {
            const webpBuffer = await pipeline.webp({ quality: Math.round(TARGET_QUALITY * 100) }).toBuffer();
            return {
                buffer: webpBuffer,
                mimeType: "image/webp",
                extension: "webp",
                originalSize,
                optimizedSize: webpBuffer.length,
            };
        } catch {
            // WebP 変換失敗 → JPEG フォールバック
        }

        const jpegBuffer = await pipeline.jpeg({ quality: Math.round(TARGET_QUALITY * 100) }).toBuffer();
        return {
            buffer: jpegBuffer,
            mimeType: "image/jpeg",
            extension: "jpg",
            originalSize,
            optimizedSize: jpegBuffer.length,
        };
    } catch {
        // sharp が使えない環境ではそのまま返す
        const ext = match[1].includes("png") ? "png" : match[1].includes("webp") ? "webp" : "jpg";
        return {
            buffer: originalBuffer,
            mimeType: match[1],
            extension: ext,
            originalSize,
            optimizedSize: originalSize,
        };
    }
}
