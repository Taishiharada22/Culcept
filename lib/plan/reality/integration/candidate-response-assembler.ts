/**
 * Reality Control OS — A1-5-7-2 Candidate Response Assembler（**pure・additive・no-DB・no-visible**・barrel 非 export・未配線）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.42
 *
 * 役割: candidate surface（A1-5-7-0/1 `CandidateSurfaceDTO`）を、既存 route response の `data`（例: MorningPipelineResult）へ
 *   **既存を一切壊さず additive** に合成する **pure assembler**。visible route integration の **直前**で response contract と合成方法を固定する。
 *   **route.ts は変更しない**（本 slice は assembler + contract のみ）。
 *
 * ── fire-and-forget observer ↔ response surface の矛盾（§8.42 で詳細）──
 *   capture observer は fire-and-forget（response 返却後に async write）。よって**今回 utterance の candidate は response 構築時に未完**。
 *   ゆえに本 assembler は **surface 源に非依存**（与えられた surface を merge するだけ）。surface を「いつ・どこから」得るかは別 slice:
 *     - A案: response に載せず redacted observation 継続。
 *     - B案: explicit surface mode で capture+consumption を await（LLM latency）→ captureCandidate。
 *     - C案（推奨）: **pending seed の read-only consumption（高速 read・fail-open）**から captureCandidate。fire-and-forget write は不変。
 *   いずれでも assembler は **fail-open**（surface 無→元 result 完全一致）。
 *
 * 厳守:
 *   - **additive のみ**: candidate 無（surface=null / hasCandidate=false）→ **元 result と完全一致**（key を足さない・fail-open）。candidate 有のみ `captureCandidate` を 1 key 追加。
 *   - **既存 keys を消さない / ok·data envelope を壊さない**（assembler は data に 1 key 足すだけ・envelope は caller 管理）。
 *   - **response boundary の最終 redaction**: `redactCaptureCandidateSurface`（allowlist 再構築）で **extra key（raw/source_ref/UUID 等）を drop**。CandidateSurfaceDTO の既知 field のみ写す。
 *   - **CandidateSurfaceDTO 以外を混ぜない**。pure・deterministic・DB/Supabase/route/UI import なし・barrel 非 export・route.ts 非接続。
 */

import type { CandidateSurfaceDTO, CandidateSurfaceItem } from "./candidate-surface";

/** response に additive 追加する key 名（`data.captureCandidate?`）。 */
export const CAPTURE_CANDIDATE_RESPONSE_KEY = "captureCandidate" as const;

/** response-level surface fragment（candidate 有時のみ data に追加される）。 */
export interface CaptureCandidateResponseSurface {
  readonly captureCandidate: CandidateSurfaceDTO;
}

/** 既存 result T に captureCandidate を additive 合成した型。 */
export type WithCaptureCandidate<T> = T & CaptureCandidateResponseSurface;

/** item を allowed field のみで再構築（**extra key drop**・raw/source_ref/UUID を写さない）。 */
function redactSurfaceItem(it: CandidateSurfaceItem): CandidateSurfaceItem {
  return {
    durationMin: it.durationMin,
    evidenceSource: it.evidenceSource,
    date: it.date,
    band: it.band,
    confidenceBand: it.confidenceBand,
  };
}

/**
 * response boundary の **最終 redaction**: CandidateSurfaceDTO を **既知 field のみで再構築**（allowlist）。
 *   既に redacted（presenter 由来）だが、response に出す最後の地点で extra key（raw/source_ref/UUID）を構造的に drop する。
 *   clean な DTO は deep-equal（no-op）/ 汚染 DTO は sanitized。drift は test（full DTO 再構築 deep-equal）で捕捉。
 */
export function redactCaptureCandidateSurface(s: CandidateSurfaceDTO): CandidateSurfaceDTO {
  return {
    hasCandidate: s.hasCandidate,
    candidateCount: s.candidateCount,
    status: s.status,
    items: s.items.map(redactSurfaceItem),
  };
}

/**
 * A1-5-7-2: candidate surface を既存 result（例 MorningPipelineResult）へ **additive 合成**（**pure・fail-open**・generic）。
 *   - candidate 無（surface null/undefined・hasCandidate=false）→ **元 result をそのまま返す**（key を足さない・完全一致・fail-open）。
 *   - candidate 有（hasCandidate=true）→ `{ ...result, captureCandidate: redactCaptureCandidateSurface(surface) }`（既存 keys 維持・1 key 追加・最終 redaction）。
 *   T は generic（MorningPipelineResult を import しない＝decoupled）。route.ts はまだこれを呼ばない（本 slice は contract のみ）。
 */
export function appendCaptureCandidateToMorningResult<T extends object>(
  result: T,
  surface: CandidateSurfaceDTO | null | undefined
): T | WithCaptureCandidate<T> {
  if (!surface || !surface.hasCandidate) return result; // candidate 無 → 元 result 完全一致（fail-open）
  return { ...result, captureCandidate: redactCaptureCandidateSurface(surface) }; // candidate 有 → additive + 最終 redaction
}
