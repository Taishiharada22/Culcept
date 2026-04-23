/**
 * Places Handoff Orchestrator — PR-9 commit 4
 *
 * route.ts が呼び出す単一関数。以下を順番に実行する:
 *   1. gate check (state / focus / draft が handoff 可能か)
 *   2. idempotency check (既に同じ fingerprint で提示済みか)
 *   3. L1 cache lookup (best-effort optimization)
 *   4. executePlacesHandoff 呼び出し (cache miss 時のみ)
 *   5. 結果に応じた next dispatch action の生成（route.ts が reducer に渡す）
 *   6. success / zero は cache に書き戻し、provider_error は書き戻さない
 *
 * CEO 2026-04-23 固定条件:
 *   1. L1 cache は best-effort optimization only（壊れても correctness 成立）
 *   2. provider_error は cache しない
 *   3. idempotency skip は (targetEventId 一致 ∧ queryFingerprint 一致 ∧
 *      conversationStatus === "search_candidates_presented") の三条件
 *   4. draft_not_ready のログは `route_invariant_mismatch` として分離
 *   5. parked は候補ソース・再利用ソース双方で未使用（本関数は activePresentation のみ見る）
 *
 * 本関数は **副作用として cache write のみ** 行う。
 *   - reducer dispatch は route.ts が outcome.nextDispatch を使って行う
 *   - ログ出力は route.ts が outcome を見て行う
 *   - flag 確認は route.ts で事前に行う（orchestrator は flag 非依存）
 */

import type { DialogAction, DialogState } from "../dialog/types";
import {
  getHandoffCache,
  setHandoffCacheSuccess,
  setHandoffCacheZero,
} from "./placesHandoffCache";
import {
  buildQueryFingerprint,
  classifyProviderErrorForLog,
  executePlacesHandoff,
  type PlacesHandoffResult,
  type ProviderErrorLogClass,
  type ProviderErrorReason,
} from "./placesHandoff";
import type { GeoCoordinates, NormalizedPlaceCandidate } from "./normalizedPlace";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type SkipReason =
  | "status_not_handoff" //   conversationStatus !== "search_handoff_blocking"
  | "focus_missing" //         focus が null
  | "focus_not_where" //       focus.slot !== "where"
  | "draft_not_ready"; //     searchQueryDraft.readyForHandoff=false

export type HandoffOrchestrationOutcome =
  | { kind: "skip_gate"; reason: SkipReason; fingerprint: string }
  | { kind: "skip_idempotent"; fingerprint: string }
  | {
      kind: "presented_from_cache";
      fingerprint: string;
      candidateCount: number;
    }
  | {
      kind: "presented_from_api";
      fingerprint: string;
      candidateCount: number;
    }
  | { kind: "zero_from_cache"; fingerprint: string }
  | { kind: "zero_from_api"; fingerprint: string }
  | {
      kind: "error";
      fingerprint: string;
      logClass: ProviderErrorLogClass;
      reason: ProviderErrorReason;
    };

export interface OrchestrationResult {
  outcome: HandoffOrchestrationOutcome;
  /** null ⇒ route.ts は何も dispatch しない */
  nextDispatch: DialogAction | null;
}

export interface OrchestrationInput {
  userId: string;
  dialogState: DialogState;
  turnIndex: number;
  anchorCoords?: GeoCoordinates;
}

export interface OrchestrationDeps {
  executePlacesHandoff?: typeof executePlacesHandoff;
  getCache?: typeof getHandoffCache;
  setCacheSuccess?: typeof setHandoffCacheSuccess;
  setCacheZero?: typeof setHandoffCacheZero;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Orchestrate
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function orchestratePlacesHandoff(
  input: OrchestrationInput,
  deps: OrchestrationDeps = {},
): Promise<OrchestrationResult> {
  const { userId, dialogState, turnIndex, anchorCoords } = input;
  const fingerprint = buildQueryFingerprint(dialogState.searchQueryDraft);

  // ─── gate: reducer contract precondition ───
  if (dialogState.conversationStatus !== "search_handoff_blocking") {
    return {
      outcome: { kind: "skip_gate", reason: "status_not_handoff", fingerprint },
      nextDispatch: null,
    };
  }
  if (!dialogState.focus) {
    return {
      outcome: { kind: "skip_gate", reason: "focus_missing", fingerprint },
      nextDispatch: null,
    };
  }
  if (dialogState.focus.slot !== "where") {
    return {
      outcome: { kind: "skip_gate", reason: "focus_not_where", fingerprint },
      nextDispatch: null,
    };
  }
  if (!dialogState.searchQueryDraft.readyForHandoff) {
    return {
      outcome: { kind: "skip_gate", reason: "draft_not_ready", fingerprint },
      nextDispatch: null,
    };
  }

  const targetEventId = dialogState.focus.event_id;

  // ─── idempotency: 3-condition match ───
  //   activePresentation.targetEventId 一致
  //   activePresentation.queryFingerprint 一致
  //   conversationStatus === "search_candidates_presented"
  //
  //   本関数に入ってくる時点で status は search_handoff_blocking のはずなので、
  //   この三条件のうち status 条件は通常成立しない。defensive に入れておく
  //   ことで、activePresentation が残っているのに status が search_handoff_blocking
  //   に戻っているような整合しない state では idempotent skip しない。
  //   (= 再フェッチする方が安全)
  const ap = dialogState.activePresentation;
  if (
    ap &&
    ap.targetEventId === targetEventId &&
    ap.queryFingerprint === fingerprint &&
    (dialogState.conversationStatus as string) === "search_candidates_presented"
  ) {
    return {
      outcome: { kind: "skip_idempotent", fingerprint },
      nextDispatch: null,
    };
  }

  // ─── L1 cache lookup (best-effort) ───
  const getCache = deps.getCache ?? getHandoffCache;
  let cached: ReturnType<typeof getHandoffCache> = null;
  try {
    cached = getCache(userId, fingerprint);
  } catch {
    cached = null; // best-effort; broken cache must not break correctness
  }

  if (cached?.kind === "success") {
    return {
      outcome: {
        kind: "presented_from_cache",
        fingerprint,
        candidateCount: cached.candidates.length,
      },
      nextDispatch: {
        type: "SEARCH_CANDIDATES_PRESENTED",
        turnIndex,
        targetEventId,
        queryFingerprint: fingerprint,
        candidates: cached.candidates,
      },
    };
  }
  if (cached?.kind === "zero") {
    return {
      outcome: { kind: "zero_from_cache", fingerprint },
      nextDispatch: {
        type: "SEARCH_ZERO_CANDIDATES",
        turnIndex,
        targetEventId,
        queryFingerprint: fingerprint,
      },
    };
  }

  // ─── API call ───
  const handoffFn = deps.executePlacesHandoff ?? executePlacesHandoff;
  let result: PlacesHandoffResult;
  try {
    result = await handoffFn({
      draft: dialogState.searchQueryDraft,
      anchorCoords,
    });
  } catch {
    // executePlacesHandoff は自分で catch するが、念のため second guard
    return {
      outcome: {
        kind: "error",
        fingerprint,
        logClass: "provider_failure",
        reason: "api_throw",
      },
      nextDispatch: null,
    };
  }

  if (result.kind === "success") {
    // cache 書き込み（best-effort）
    const setSuccess = deps.setCacheSuccess ?? setHandoffCacheSuccess;
    try {
      setSuccess(userId, fingerprint, result.candidates);
    } catch {
      // no-op
    }
    const presentedCandidates: ReadonlyArray<NormalizedPlaceCandidate> =
      result.candidates;
    return {
      outcome: {
        kind: "presented_from_api",
        fingerprint,
        candidateCount: presentedCandidates.length,
      },
      nextDispatch: {
        type: "SEARCH_CANDIDATES_PRESENTED",
        turnIndex,
        targetEventId,
        queryFingerprint: fingerprint,
        candidates: presentedCandidates,
      },
    };
  }

  if (result.kind === "zero") {
    const setZero = deps.setCacheZero ?? setHandoffCacheZero;
    try {
      setZero(userId, fingerprint);
    } catch {
      // no-op
    }
    return {
      outcome: { kind: "zero_from_api", fingerprint },
      nextDispatch: {
        type: "SEARCH_ZERO_CANDIDATES",
        turnIndex,
        targetEventId,
        queryFingerprint: fingerprint,
      },
    };
  }

  // result.kind === "provider_error" — cache しない
  return {
    outcome: {
      kind: "error",
      fingerprint,
      logClass: classifyProviderErrorForLog(result.reason),
      reason: result.reason,
    },
    nextDispatch: null,
  };
}
