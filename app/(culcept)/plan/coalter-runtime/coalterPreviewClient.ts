"use client";

/**
 * C5-E: CoAlter 非永続 preview の client fetch（**read-only・GET・保存なし**）
 *
 * 配置は runtime（UI tab folder の backend-free guard 維持・`/api/coalter` 結合をここに隔離）。
 *
 * 不変:
 *   - **GET のみ**（body を送らない＝client から CoAlter body / author を渡せない）。
 *   - **保存しない**（preview は ephemeral・state に持つだけ）。
 *   - 失敗（404 gate / 401 / error）→ "unavailable"。participant chat 不足 → "insufficient"。
 */

import type { CoAlterBrainPreview } from "@/lib/coalter/preview/brainPreviewCore";

export type CoAlterPreviewFetchState = "ready" | "insufficient" | "unavailable";

export interface CoAlterPreviewFetchResult {
  readonly state: CoAlterPreviewFetchState;
  readonly preview: CoAlterBrainPreview | null;
}

/** session の CoAlter preview を 1 回 GET（body 送らない・保存しない）。 */
export async function fetchCoAlterPreviewOnce(
  sessionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CoAlterPreviewFetchResult> {
  if (!sessionId) return { state: "unavailable", preview: null };
  let res: Response;
  try {
    res = await fetchImpl(`/api/coalter/sessions/${encodeURIComponent(sessionId)}/preview`, {
      method: "GET",
    });
  } catch {
    return { state: "unavailable", preview: null };
  }
  if (!res.ok) return { state: "unavailable", preview: null };
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { state: "unavailable", preview: null };
  }
  const body = json as { status?: string; preview?: CoAlterBrainPreview };
  if (body.status === "preview" && body.preview) {
    return { state: "ready", preview: body.preview };
  }
  return { state: "insufficient", preview: null };
}
