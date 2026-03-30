/**
 * imageCompression.ts
 * 共有画像圧縮ユーティリティ
 * PhotoUploader, ChatView の両方で使用
 */

const DEFAULT_MAX_SIZE_PX = 1200;
const DEFAULT_QUALITY = 0.85;

export async function compressImage(
  file: File | Blob,
  options?: { maxSizePx?: number; quality?: number },
): Promise<Blob> {
  const maxSizePx = options?.maxSizePx ?? DEFAULT_MAX_SIZE_PX;
  const quality = options?.quality ?? DEFAULT_QUALITY;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSizePx || height > maxSizePx) {
        const scale = maxSizePx / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not supported"));
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("Compression failed")),
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = URL.createObjectURL(file);
  });
}
