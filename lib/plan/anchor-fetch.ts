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
import type {
  AnchorUpdatePatch,
  BundleError,
  CreateSourceWithAnchorsInput,
} from "./external-anchor-repository";
import type { AnchorInputValidationError } from "./external-anchor-input";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface AnchorListData {
  sources: ExternalAnchorSource[];
  anchors: ExternalAnchor[];
}

export type AnchorFetchResult =
  | { ok: true; data: AnchorListData }
  | { ok: false; status: number; error: string };

export interface CreateAnchorBundleSuccess {
  source: ExternalAnchorSource;
  anchors: ExternalAnchor[];
}

export type CreateAnchorBundleResult =
  | { ok: true; data: CreateAnchorBundleSuccess }
  | { ok: false; status: number; error: string; errors?: BundleError[] };

export interface DeleteAnchorSourceData {
  deletedSource: boolean;
  deletedAnchors: number;
}

export type DeleteAnchorSourceResult =
  | { ok: true; data: DeleteAnchorSourceData }
  | { ok: false; status: number; error: string };

export interface UpdateAnchorSuccessData {
  anchor: ExternalAnchor;
}

export type UpdateAnchorResult =
  | { ok: true; data: UpdateAnchorSuccessData }
  | {
      ok: false;
      status: number;
      error: string;
      errors?: AnchorInputValidationError[];
    };

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/plan/anchors — bundle 作成 (W1-X1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * POST /api/plan/anchors を呼んで bundle を作成する。
 *
 *   - same-origin、credentials は cookie 自動付与
 *   - 200 → { ok:true, data: { source, anchors } }
 *   - 422 → { ok:false, errors: BundleError[] } を含む（validation error）
 *   - 401 / 5xx → { ok:false, status, error }
 *   - JSON parse 失敗も ok:false
 */
export async function createAnchorBundle(
  input: CreateSourceWithAnchorsInput
): Promise<CreateAnchorBundleResult> {
  let res: Response;
  try {
    res = await fetch("/api/plan/anchors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(input),
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
    return { ok: false, status: res.status, error: "invalid JSON response" };
  }

  if (!res.ok) {
    const obj = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
    const errMsg =
      typeof obj.error === "string" ? obj.error : `request failed: ${res.status}`;
    const out: CreateAnchorBundleResult = {
      ok: false,
      status: res.status,
      error: errMsg,
    };
    if (Array.isArray(obj.errors)) {
      (out as { errors?: BundleError[] }).errors = obj.errors as BundleError[];
    }
    return out;
  }

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
    return { ok: false, status: res.status, error: "response.data missing" };
  }
  const source = (data as { source?: unknown }).source;
  const anchors = (data as { anchors?: unknown }).anchors;
  if (!source || typeof source !== "object" || !Array.isArray(anchors)) {
    return {
      ok: false,
      status: res.status,
      error: "response.data.source/anchors invalid",
    };
  }

  return {
    ok: true,
    data: {
      source: source as ExternalAnchorSource,
      anchors: anchors as ExternalAnchor[],
    },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DELETE /api/plan/anchors/[sourceId] (W1-X1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * DELETE /api/plan/anchors/[sourceId] を呼んで source を cascade 削除する。
 *
 *   - cookie auth 自動付与
 *   - 200 + { deletedSource, deletedAnchors }
 *   - user 不一致 / source 不在 → 200 + { deletedSource: false, deletedAnchors: 0 }
 *     （interface 不変原則: 情報漏洩防止のため両者を同一視）
 *   - 401 / 5xx → { ok:false, status, error }
 */
export async function deleteAnchorSource(
  sourceId: string
): Promise<DeleteAnchorSourceResult> {
  let res: Response;
  try {
    res = await fetch(`/api/plan/anchors/${encodeURIComponent(sourceId)}`, {
      method: "DELETE",
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
    return { ok: false, status: res.status, error: "invalid JSON response" };
  }

  if (!res.ok) {
    const obj = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
    const errMsg =
      typeof obj.error === "string" ? obj.error : `request failed: ${res.status}`;
    return { ok: false, status: res.status, error: errMsg };
  }

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
    return { ok: false, status: res.status, error: "response.data missing" };
  }
  const deletedSource = (data as { deletedSource?: unknown }).deletedSource;
  const deletedAnchors = (data as { deletedAnchors?: unknown }).deletedAnchors;
  if (typeof deletedSource !== "boolean" || typeof deletedAnchors !== "number") {
    return {
      ok: false,
      status: res.status,
      error: "response.data shape invalid",
    };
  }

  return {
    ok: true,
    data: { deletedSource, deletedAnchors },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PATCH /api/plan/anchor-items/[anchorId] (W1-X2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 既存 anchor を「教え直す」。
 *
 *   - cookie auth 自動付与
 *   - 200 + { anchor }
 *   - 401 / 404 / 422 / 5xx → ok:false（404 は user 不一致 / 不在を同一視）
 *   - 422 validation error 時に errors 配列を伝搬
 */
export async function updateAnchor(
  anchorId: string,
  patch: AnchorUpdatePatch
): Promise<UpdateAnchorResult> {
  let res: Response;
  try {
    res = await fetch(
      `/api/plan/anchor-items/${encodeURIComponent(anchorId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(patch),
      }
    );
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
    return { ok: false, status: res.status, error: "invalid JSON response" };
  }

  if (!res.ok) {
    const obj = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
    const errMsg =
      typeof obj.error === "string" ? obj.error : `request failed: ${res.status}`;
    const out: UpdateAnchorResult = {
      ok: false,
      status: res.status,
      error: errMsg,
    };
    if (Array.isArray(obj.errors)) {
      (out as { errors?: AnchorInputValidationError[] }).errors =
        obj.errors as AnchorInputValidationError[];
    }
    return out;
  }

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
    return { ok: false, status: res.status, error: "response.data missing" };
  }
  const anchor = (data as { anchor?: unknown }).anchor;
  if (!anchor || typeof anchor !== "object") {
    return {
      ok: false,
      status: res.status,
      error: "response.data.anchor missing",
    };
  }

  return {
    ok: true,
    data: { anchor: anchor as ExternalAnchor },
  };
}
