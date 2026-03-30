/* ─────────────────────────────────────────────
   アップロードリトライ（指数バックオフ）
   ───────────────────────────────────────────── */

/**
 * 関数を最大 maxRetries 回リトライ（指数バックオフ）
 * 5xx エラーまたはネットワークエラーのみリトライ対象
 */
export async function retryUpload<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 500,
): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;

            // 最終試行なら即 throw
            if (attempt >= maxRetries) break;

            // 4xx エラーはリトライしない
            if (err instanceof Error && err.message.includes("4")) {
                const statusMatch = /\b(400|401|403|404|409|422)\b/.exec(err.message);
                if (statusMatch) break;
            }

            const delay = baseDelay * 2 ** attempt;
            console.warn(`[retryUpload] attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms`);
            await new Promise((r) => setTimeout(r, delay));
        }
    }

    throw lastError;
}
