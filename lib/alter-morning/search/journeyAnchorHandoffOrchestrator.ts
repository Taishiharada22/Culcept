/**
 * Journey Anchor Handoff Orchestrator (PR B-3b'-2 Commit 3)
 *
 * CEO/GPT 2026-05-03 PR B-3b' audit doc 確定方針 (Q1 = Option A 採用):
 *   既存 `placesHandoffOrchestrator` (= event_where 専用) に journey_origin を
 *   雑に分岐追加せず、**新関数として完全分離**する。
 *
 * 責務 (CEO 2026-05-03 補正による責務分離):
 *   - 本関数: journey_origin candidate presentation 作成のみ (= 副作用は cache write のみ)
 *   - route.ts: flag 判定 + 本関数呼び出し + reducer dispatch
 *   - legacyAdapter: intent 生成のみ (= pure)
 *
 * scope (PR B-3b'-2):
 *   - journey_origin only (= journey_end は本 PR scope 外、別 PR で追加)
 *   - audit doc §8.1 反映
 *
 * 半壊 UX 防止 3 層 gate:
 *   - Layer 1: caller (= route.ts) で `journeyOriginGrounding` flag 判定
 *   - Layer 2: PlaceCandidatePicker disabled (= 別 commit)
 *   - Layer 3: selection route で `not_implemented_journey_anchor_promotion` reject (= 別 commit)
 *
 *   本関数は Layer 1 通過後に呼ばれる。candidates 提示まで担当。
 *   selection 後の anchor 更新 (= known_exact 昇格 + travel 生成) は B-3c で実装。
 */

import {
  getHandoffCache,
  setHandoffCacheSuccess,
  setHandoffCacheZero,
} from "./placesHandoffCache";
import {
  classifyProviderErrorForLog,
  executePlacesHandoff,
  type PlacesHandoffResult,
} from "./placesHandoff";
import type { GeoCoordinates } from "./normalizedPlace";
import type { SearchQueryDraft, DialogAction } from "../dialog/types";
import type {
  OrchestrationDeps,
  OrchestrationResult,
} from "./placesHandoffOrchestrator";
import { PLAN_ORIGIN_SENTINEL_EVENT_ID } from "../planning/gapResolver";
// CEO/GPT 2026-05-03 PR B-3c-2 (Layer A): coordinates 不正候補の presentation 前除外
import { filterCandidatesByValidCoordinates } from "./coordinateFilter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface JourneyAnchorOrchestrationInput {
  userId: string;
  /**
   * journey_origin の label (= "東京駅", "サドヤ" 等)。
   * caller 側で `classifyLabel(label) === "public_poi_proper_noun"` を確認済みの前提。
   * generic_category / private_semantic / ambiguous は本関数を呼ばない (= caller 責務)。
   */
  label: string;
  /** 当 turn index (= reducer dispatch action に含める) */
  turnIndex: number;
  /** 任意: bias coords (= 既存 anchorCoords 機構を再利用) */
  anchorCoords?: GeoCoordinates;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fingerprint — label-based (= event_where とは異なる prefix)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * journey_origin label-based fingerprint。
 *
 * 既存 `buildQueryFingerprint` (= event_where 用、anchor+chain+category) と区別するため
 * "journey_origin" prefix を含む。L1 cache key の衝突を防ぐ。
 *
 * 形式: `pf:v1|journey_origin|label=<normalized>`
 */
export function buildJourneyAnchorFingerprint(label: string): string {
  const normalized = label.trim().toLowerCase();
  return `pf:v1|journey_origin|label=${normalized || "-"}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Orchestrate
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * journey_origin label を query として Places API を呼び、candidate presentation
 * dispatch action を生成する。
 *
 * 責務:
 *   1. fingerprint 構築 (= label-based)
 *   2. label 空文字 gate
 *   3. L1 cache lookup
 *   4. Places API call (= 既存 executePlacesHandoff を流用、SearchQueryDraft 経由)
 *   5. result に応じた SEARCH_CANDIDATES_PRESENTED action 生成
 *      target = { kind: "journey_origin" } を必須で含める
 *      targetEventId = PLAN_ORIGIN_SENTINEL_EVENT_ID (= 既存 sentinel、B-3d で廃止検討)
 *
 * 副作用:
 *   - L1 cache write (= success / zero のみ、provider_error は cache しない)
 *   - reducer dispatch は **caller の責務** (= 本関数は nextDispatch を返すだけ)
 *
 * 不変条件:
 *   - caller は label が `public_poi_proper_noun` であることを確認済み
 *     (= classifyLabel result を見て、generic_category / private_semantic / ambiguous
 *      の場合は本関数を呼ばない)
 *   - target は **必ず** `{ kind: "journey_origin" }` (= 本関数は journey_end 対応外)
 *
 * @param input userId / label / turnIndex / optional anchorCoords
 * @param deps テスト用 seam (production は undefined)
 */
export async function orchestrateJourneyAnchorHandoff(
  input: JourneyAnchorOrchestrationInput,
  deps: OrchestrationDeps = {},
): Promise<OrchestrationResult> {
  const { userId, label, turnIndex, anchorCoords } = input;
  const fingerprint = buildJourneyAnchorFingerprint(label);

  // Gate: label 空文字 (= caller 責務だが defensive)
  if (!label.trim()) {
    return {
      outcome: { kind: "skip_gate", reason: "draft_not_ready", fingerprint },
      nextDispatch: null,
    };
  }

  // L1 cache lookup (= best-effort optimization)
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
      nextDispatch: makeJourneyOriginPresentedAction({
        turnIndex,
        fingerprint,
        candidates: cached.candidates,
      }),
    };
  }
  if (cached?.kind === "zero") {
    return {
      outcome: { kind: "zero_from_cache", fingerprint },
      nextDispatch: makeJourneyOriginZeroAction({
        turnIndex,
        fingerprint,
      }),
    };
  }

  // Places API call — 既存 executePlacesHandoff を SearchQueryDraft 経由で再利用
  // label を anchorRegion として渡す (= text query は label のみ)
  const draft: SearchQueryDraft = {
    anchorRegion: label,
    chainToken: null,
    categoryToken: null,
    readyForHandoff: true,
  };
  const handoffFn = deps.executePlacesHandoff ?? executePlacesHandoff;
  let result: PlacesHandoffResult;
  try {
    result = await handoffFn({ draft, anchorCoords });
  } catch {
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
    // CEO/GPT 2026-05-03 PR B-3c-2 Layer A: coordinates 不正候補の除外
    //   Places API success だが coords 不正な candidate が含まれる可能性に対し
    //   presentation 前に filter する。全候補除外なら zero outcome に分岐 (= GPT 1st 補正
    //   反映、zeroReason="no_coordinate_candidates_after_filter")。
    const filterResult = filterCandidatesByValidCoordinates(result.candidates);
    if (filterResult.filtered.length === 0) {
      // 全候補 invalid → cache 書かない (= 次回 API 再試行で正常に戻る可能性)
      // 既存 zero path 流用するが、internal reason を分離して emit (= telemetry 用)
      return {
        outcome: {
          kind: "zero_from_api",
          fingerprint,
          zeroReason: "no_coordinate_candidates_after_filter",
          invalidCoordinateCount: filterResult.invalidCount,
        },
        nextDispatch: makeJourneyOriginZeroAction({ turnIndex, fingerprint }),
      };
    }
    // 一部 / 全 valid → presentation
    //   cache には filter 後 (= validCoordinates: true で marked) を保存。
    //   再試行時に Layer A 重ねがけしても idempotent。
    const setSuccess = deps.setCacheSuccess ?? setHandoffCacheSuccess;
    try {
      setSuccess(userId, fingerprint, filterResult.filtered);
    } catch {
      // no-op
    }
    return {
      outcome: {
        kind: "presented_from_api",
        fingerprint,
        candidateCount: filterResult.filtered.length,
        invalidCoordinateCount: filterResult.invalidCount,
      },
      nextDispatch: makeJourneyOriginPresentedAction({
        turnIndex,
        fingerprint,
        candidates: filterResult.filtered,
      }),
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
      outcome: {
        kind: "zero_from_api",
        fingerprint,
        // GPT 1st 補正: Places API 自体が 0 件 (= label 不適切等)
        zeroReason: "no_candidates_from_places_search",
      },
      nextDispatch: makeJourneyOriginZeroAction({ turnIndex, fingerprint }),
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Action builder helpers (private)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeJourneyOriginPresentedAction(input: {
  turnIndex: number;
  fingerprint: string;
  candidates: ReadonlyArray<
    import("./normalizedPlace").NormalizedPlaceCandidate
  >;
}): Extract<DialogAction, { type: "SEARCH_CANDIDATES_PRESENTED" }> {
  return {
    type: "SEARCH_CANDIDATES_PRESENTED",
    turnIndex: input.turnIndex,
    targetEventId: PLAN_ORIGIN_SENTINEL_EVENT_ID, // sentinel (= 既存 invariant)
    target: { kind: "journey_origin" }, // PR #65 で reducer 拡張済み
    queryFingerprint: input.fingerprint,
    candidates: input.candidates,
  };
}

function makeJourneyOriginZeroAction(input: {
  turnIndex: number;
  fingerprint: string;
}): Extract<DialogAction, { type: "SEARCH_ZERO_CANDIDATES" }> {
  return {
    type: "SEARCH_ZERO_CANDIDATES",
    turnIndex: input.turnIndex,
    targetEventId: PLAN_ORIGIN_SENTINEL_EVENT_ID,
    queryFingerprint: input.fingerprint,
  };
}
