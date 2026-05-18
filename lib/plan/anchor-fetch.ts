/**
 * Client-side fetch helper for /api/plan/anchors (W1-5)
 *
 * Plan UI から GET /api/plan/anchors を呼ぶ薄い wrapper。
 * cookie auth が自動継承される（Next.js は same-origin で credentials を自動送信）。
 *
 * 設計書: docs/alter-plan-w15-ui-mini-design.md §5
 *
 * 不変原則:
 *   - service_role / JWT は触らない（cookie auth のみ）
 *   - 失敗は discriminated union で返す（throw しない）
 *   - 受信した shape は API レスポンスをそのまま受け流す（型変換は呼び出し側）
 */

import type { ExternalAnchor } from "./external-anchor";
import type { ExternalAnchorSource } from "./external-anchor-source";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface AnchorListData {
  sources: ExternalAnchorSource[];
  anchors: ExternalAnchor[];
}

export type AnchorFetchResult =
  | { ok: true; data: AnchorListData }
  | { ok: false; status: number; error: string };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * GET /api/plan/anchors を呼んで AnchorListData を取得する。
 *
 *   - same-origin fetch（credentials: "same-origin" は default）
 *   - 401 / 5xx は ok:false で返す（throw しない）
 *   - JSON parse 失敗も ok:false
 */
export async function fetchAnchors(): Promise<AnchorFetchResult> {
  let res: Response;
  try {
    res = await fetch("/api/plan/anchors", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : "network error",
    };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return {
      ok: false,
      status: res.status,
      error: "invalid JSON response",
    };
  }

  if (!res.ok) {
    const errMsg =
      json && typeof json === "object" && "error" in json
        ? String((json as { error: unknown }).error)
        : `request failed: ${res.status}`;
    return { ok: false, status: res.status, error: errMsg };
  }

  // Expected shape: { ok: true, data: { sources, anchors } }
  if (
    !json ||
    typeof json !== "object" ||
    !("ok" in json) ||
    !("data" in json)
  ) {
    return {
      ok: false,
      status: res.status,
      error: "unexpected response shape",
    };
  }

  const data = (json as { data: unknown }).data;
  if (!data || typeof data !== "object") {
    return {
      ok: false,
      status: res.status,
      error: "response.data missing",
    };
  }

  const sources = (data as { sources?: unknown }).sources;
  const anchors = (data as { anchors?: unknown }).anchors;
  if (!Array.isArray(sources) || !Array.isArray(anchors)) {
    return {
      ok: false,
      status: res.status,
      error: "response.data.sources / anchors not arrays",
    };
  }

  return {
    ok: true,
    data: {
      sources: sources as ExternalAnchorSource[],
      anchors: anchors as ExternalAnchor[],
    },
  };
}
