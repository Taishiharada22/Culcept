/**
 * Reality Control OS — A1-5-7-7 Capture Candidate Client Bridge（**client-side・dormant・no-real-network**）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.47
 *
 * 役割: V2 route（`/api/alter-morning/plan`）response の `data.captureCandidate?`（A1-5-7-5・redacted）を
 *   client 側で **抽出 → MorningPlanCard へ流す** ための bridge。**dormant**（flag off → fetch 0 → undefined → 既存 UI 完全不変）。
 *
 * 厳守:
 *   - **dormant**: `enabled=false`（本番デフォルト）→ **fetch 0 / undefined**（real network なし・既存 UI 不変）。
 *   - **fail-open**: fetch / parse 失敗 → undefined（UI を壊さない）。`captureCandidate` absent → undefined（既存 UI 不変）。
 *   - **client boundary 最終 redaction**: `redactCaptureCandidateSurface`（A1-5-7-2・pure・allowlist 再構築）で **source_ref / UUID / raw を保持しない**。
 *   - **本 slice では real network を走らせない**（caller の live fetch は別 GO）。テストは fake fetchImpl。route.ts / route response は変えない。
 *   - pure-logic（DB / Supabase / RPC / LLM なし）。`fetchImpl` は DI（テスト fake / production は flag off で未使用）。
 */

import { redactCaptureCandidateSurface } from "@/lib/plan/reality/integration/candidate-response-assembler";
import type { CandidateSurfaceDTO } from "@/lib/plan/reality/integration/candidate-surface";

/** V2 route path（fixed・**fetch は dormant**）。 */
export const CAPTURE_CANDIDATE_V2_ROUTE = "/api/alter-morning/plan";

/**
 * V2 route response（`{ ok, data }`）→ `captureCandidate`（**pure・redacted**）。
 *   ok!==true / data なし / captureCandidate なし / hasCandidate!==true → **undefined**（既存 UI 不変）。
 *   有効時は **`redactCaptureCandidateSurface` で再構築**（client が source_ref/UUID/raw を保持しない）。
 */
export function selectCaptureCandidate(responseJson: unknown): CandidateSurfaceDTO | undefined {
  if (!responseJson || typeof responseJson !== "object") return undefined;
  const r = responseJson as { ok?: unknown; data?: unknown };
  if (r.ok !== true || !r.data || typeof r.data !== "object") return undefined;
  const cc = (r.data as { captureCandidate?: unknown }).captureCandidate;
  if (!cc || typeof cc !== "object") return undefined;
  const c = cc as Partial<CandidateSurfaceDTO>;
  if (c.hasCandidate !== true || !Array.isArray(c.items)) return undefined;
  // client boundary の最終 redaction（既知 field のみ再構築・extra/raw/source_ref/UUID を drop）
  return redactCaptureCandidateSurface(c as CandidateSurfaceDTO);
}

/**
 * A1-5-7-7: V2 route を **gated fetch** し captureCandidate を返す bridge（**dormant・fail-open・DI fetch**）。
 *   - `enabled=false`（本番デフォルト）→ **fetchImpl を呼ばず undefined**（fetch 0・real network なし・既存 UI 不変）。
 *   - `enabled=true` → `fetchImpl`（テスト fake / 本番は flag off で未到達）で POST → `selectCaptureCandidate`。失敗は undefined（fail-open）。
 *   caller（将来 AskHero 親）は `enabled=PLAN_FLAGS.realityCaptureSurfaceClient` を渡す。本 slice では live で呼ばれない（dormant）。
 */
export async function fetchCaptureCandidate(opts: {
  readonly enabled: boolean;
  readonly body: unknown;
  readonly fetchImpl?: typeof fetch;
}): Promise<CandidateSurfaceDTO | undefined> {
  if (!opts.enabled) return undefined; // dormant: flag off → fetch 0
  try {
    const doFetch = opts.fetchImpl ?? (typeof globalThis !== "undefined" ? globalThis.fetch : undefined);
    if (!doFetch) return undefined;
    const res = await doFetch(CAPTURE_CANDIDATE_V2_ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(opts.body),
    });
    return selectCaptureCandidate(await res.json());
  } catch {
    return undefined; // fail-open（UI を壊さない）
  }
}
