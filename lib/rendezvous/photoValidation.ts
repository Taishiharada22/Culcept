/**
 * 写真バリデーション
 * サイズ・形式チェック（将来的にNSFW検出追加）
 */

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MIN_DIMENSION = 200;
const MAX_PHOTOS_PER_USER = 5;

export type PhotoValidationResult = {
  valid: boolean;
  error?: string;
};

export function validatePhotoFile(
  contentType: string | null,
  size: number,
): PhotoValidationResult {
  if (!contentType || !ALLOWED_TYPES.includes(contentType)) {
    return { valid: false, error: "JPEG、PNG、WebP のみ対応しています" };
  }
  if (size > MAX_FILE_SIZE) {
    return { valid: false, error: "ファイルサイズは10MB以下にしてください" };
  }
  if (size < 1000) {
    return { valid: false, error: "ファイルが小さすぎます" };
  }
  return { valid: true };
}

export function validatePhotoCount(currentCount: number): PhotoValidationResult {
  if (currentCount >= MAX_PHOTOS_PER_USER) {
    return { valid: false, error: `写真は最大${MAX_PHOTOS_PER_USER}枚までです` };
  }
  return { valid: true };
}

export { MAX_PHOTOS_PER_USER, ALLOWED_TYPES, MAX_FILE_SIZE, MIN_DIMENSION };
