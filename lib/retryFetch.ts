// lib/retryFetch.ts
// 全機能共通: リトライ付き fetch ラッパー
// 5xx + network error のみリトライ。4xx はリトライしない。

export interface RetryFetchOptions extends RequestInit {
  maxRetries?: number;
  baseDelay?: number;
}

export interface RetryFetchResult<T = unknown> {
  ok: boolean;
  data?: T;
  status?: number;
  error?: string;
}

/**
 * リトライ付き fetch。
 * - デフォルト: 最大2回リトライ、500ms 指数バックオフ
 * - 4xx エラーはリトライしない（クライアントバグ → 何度送っても同じ）
 * - 5xx / network error のみリトライ
 */
export async function retryFetch<T = unknown>(
  url: string,
  options?: RetryFetchOptions,
): Promise<RetryFetchResult<T>> {
  const { maxRetries = 2, baseDelay = 500, ...fetchOptions } = options ?? {};

  let lastError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, fetchOptions);

      if (res.ok) {
        try {
          const data = (await res.json()) as T;
          return { ok: true, data, status: res.status };
        } catch {
          // レスポンスが JSON でない場合（204 No Content 等）
          return { ok: true, status: res.status };
        }
      }

      // 4xx はリトライしない
      if (res.status >= 400 && res.status < 500) {
        let errorMsg: string;
        try {
          const body = await res.json();
          errorMsg = body?.error ?? `HTTP ${res.status}`;
        } catch {
          errorMsg = `HTTP ${res.status}`;
        }
        return { ok: false, status: res.status, error: errorMsg };
      }

      // 5xx — リトライ対象
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      // ネットワークエラー — リトライ対象
      lastError = err instanceof Error ? err.message : "Network error";
    }

    // 最終試行ならループ終了
    if (attempt >= maxRetries) break;

    const delay = baseDelay * 2 ** attempt;
    console.warn(`[retryFetch] ${url} attempt ${attempt + 1}/${maxRetries} failed (${lastError}), retrying in ${delay}ms`);
    await new Promise((r) => setTimeout(r, delay));
  }

  return { ok: false, error: lastError ?? "Unknown error" };
}
