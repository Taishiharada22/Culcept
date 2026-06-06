/**
 * Reality Control OS — A1-5-11 Candidate Lifecycle / Duplicate / Stale Guard（**pure・no-DB・no-run**・barrel 非 export）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.58
 *
 * 役割: production/canary 前の **運用安全 guard**。captured seed が積み上がっても、surface に出す candidate を
 *   「**active かつ 非 expired かつ fresh かつ 非 duplicate**」に絞る **pure selector**。raw/source_ref/UUID を出力に持ち込まない。
 *
 * 位置づけ（既存 filter との関係）:
 *   - **low evidence / prm_typical / weak / skip は既に `isSurfaceableCandidate`（candidate-surface.ts）が除外**（fail-closed・上流）。
 *     本 guard は **その上流 filter を通った candidate** に対して **lifecycle 軸**（status/expiry/staleness/duplicate）を適用する。
 *   - 既存 read は `status='active'` のみ読む（consumed/expired/rejected は既に除外）。本 guard は **active だが expires_at 経過 / capture 古い / 構造重複** という read だけでは塞げない gap を pure に塞ぐ。
 *
 * 厳守:
 *   - **pure・deterministic**: DB/Supabase/network/route/UI/`Date.now()` を **持たない**（now は ctx 注入）。barrel 非 export。
 *   - **raw を持ち込まない**: 入力 entry は構造化 + lifecycle メタのみ（signal/desired_action/source_ref を持たない）。`seedRef` は内部 tie-break 用（**surface では presentCandidateSurface が drop**・本 guard は pre-surface）。
 *   - **dropped は集計のみ**（reason ごとの件数）。seedRef を dropped 出力に**載せない**（observability も redacted）。
 *   - **schema 変更しない**（captured_at/expires_at は既存列・read への expose は別 slice の wiring）。本 module は read/write を一切しない。
 */

/** plan_seeds.status（lifecycle 状態）。active 以外は surface しない。 */
export type CandidateLifecycleStatus = "active" | "consumed" | "expired" | "rejected";

/**
 * lifecycle guard の入力 1 件（**構造化 + lifecycle メタのみ・raw/source_ref なし**）。
 *   integration（別 slice）が **column-restricted seed row（+ captured_at/expires_at）** と **enriched placement（durationMin）** を
 *   join して構築する。`seedRef` は内部 tie-break（surface 非出・presentCandidateSurface で drop）。
 */
export interface CandidateLifecycleEntry {
  /** 内部参照（tie-break・**surface 非出**）。 */
  readonly seedRef: string;
  /** lifecycle 状態（active のみ surfaceable）。 */
  readonly status: CandidateLifecycleStatus;
  /** capture 時刻（epoch ms・staleness 判定）。 */
  readonly capturedAtMs: number;
  /** 明示失効時刻（epoch ms・null=失効なし）。 */
  readonly expiresAtMs: number | null;
  /** dedup 構造キー素材（enum・raw でない）。 */
  readonly actionShape: string | null;
  readonly desiredDate: string | null;
  readonly desiredTimeHint: string | null;
  /** enrich 後の duration（分・dedup 構造キー素材）。 */
  readonly durationMin: number | null;
  /** dedup tie-break（高い方を残す）。 */
  readonly confidence: number;
}

/** candidate を surface しない理由（**redacted・raw なし**）。 */
export type CandidateLifecycleDropReason = "not_active" | "expired" | "stale" | "duplicate";

/** guard の判定文脈（**now は注入**・freshness は policy）。 */
export interface CandidateLifecycleContext {
  /** 判定基準時刻（epoch ms・呼び出し側が `Date.now()` を注入）。 */
  readonly nowMs: number;
  /** 新鮮さ窓（ms・これより古い captured は stale）。既定 = 14 日。 */
  readonly freshnessMs?: number;
}

/** dropped 集計（**件数のみ**・seedRef を載せない）。 */
export interface CandidateLifecycleDroppedCounts {
  readonly not_active: number;
  readonly expired: number;
  readonly stale: number;
  readonly duplicate: number;
}

/** guard 結果（surfaceable 部分集合 + dropped 件数）。 */
export interface CandidateLifecycleSelection {
  readonly surfaceable: readonly CandidateLifecycleEntry[];
  readonly droppedCounts: CandidateLifecycleDroppedCounts;
}

/** 候補の新鮮さ窓（既定）。undated pending intent が手付かずで古くなったら stale 扱い。policy（CEO 調整可）。 */
export const CANDIDATE_FRESHNESS_DAYS_DEFAULT = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
export const CANDIDATE_FRESHNESS_MS_DEFAULT = CANDIDATE_FRESHNESS_DAYS_DEFAULT * DAY_MS;

/**
 * dedup 構造キー（**構造のみ・raw/source_ref/seedRef を含まない**）。
 *   actionShape | desiredDate | desiredTimeHint | durationMin。同キー = 構造重複（同じ発話の繰り返し等）。
 *   注: structured-only ゆえ「活動の主語」（場所/内容）は持たない。同 shape・同 duration の別活動は同キーに畳まれ得る（surface dedup の許容限界）。
 */
export function candidateDedupKey(e: CandidateLifecycleEntry): string {
  return [e.actionShape ?? "_", e.desiredDate ?? "_", e.desiredTimeHint ?? "_", e.durationMin ?? "_"].join("|");
}

/** entry が fresh か（capture が freshness 窓内）。pure。 */
export function isFreshCandidate(e: CandidateLifecycleEntry, ctx: CandidateLifecycleContext): boolean {
  const windowMs = ctx.freshnessMs ?? CANDIDATE_FRESHNESS_MS_DEFAULT;
  return ctx.nowMs - e.capturedAtMs <= windowMs;
}

/** entry が失効済か（expiresAt 設定済 ∧ 経過）。pure。 */
export function isExpiredCandidate(e: CandidateLifecycleEntry, ctx: CandidateLifecycleContext): boolean {
  return e.expiresAtMs !== null && e.expiresAtMs <= ctx.nowMs;
}

/** dedup tie-break: より新しい capture を残す → 同時刻なら高 confidence → なお同なら seedRef 辞書順（deterministic）。 */
function preferEntry(a: CandidateLifecycleEntry, b: CandidateLifecycleEntry): CandidateLifecycleEntry {
  if (a.capturedAtMs !== b.capturedAtMs) return a.capturedAtMs > b.capturedAtMs ? a : b;
  if (a.confidence !== b.confidence) return a.confidence > b.confidence ? a : b;
  return a.seedRef <= b.seedRef ? a : b;
}

/**
 * A1-5-11: **surface 可能 candidate を lifecycle 軸で選別**（pure・deterministic）。
 *   1. **status != "active"** → drop（not_active・consumed/expired/rejected。read で除外済でも defense-in-depth）。
 *   2. **expired**（expiresAt 経過）→ drop。
 *   3. **stale**（capture が freshness 窓より古い）→ drop。
 *   4. **duplicate**（同 dedup 構造キー）→ 1 件に抑制（最新 capture を残す）。
 *   no candidate（全 drop / 入力空）→ surfaceable=[]（呼び出し側が「captureCandidate を付けない」＝既存 response/UI 不変）。
 *   **raw/source_ref を出力に出さない**（入力にも無い）。seedRef は surfaceable のみ保持（presentCandidateSurface で drop）・dropped は件数のみ。
 */
export function selectSurfaceableCandidates(
  entries: readonly CandidateLifecycleEntry[],
  ctx: CandidateLifecycleContext
): CandidateLifecycleSelection {
  const dropped: CandidateLifecycleDroppedCounts = { not_active: 0, expired: 0, stale: 0, duplicate: 0 };
  const passed: CandidateLifecycleEntry[] = [];

  // 1-3. lifecycle filter（status / expiry / staleness）
  for (const e of entries) {
    if (e.status !== "active") {
      (dropped as { not_active: number }).not_active++;
      continue;
    }
    if (isExpiredCandidate(e, ctx)) {
      (dropped as { expired: number }).expired++;
      continue;
    }
    if (!isFreshCandidate(e, ctx)) {
      (dropped as { stale: number }).stale++;
      continue;
    }
    passed.push(e);
  }

  // 4. duplicate suppression（同 dedup 構造キー → 1 件・最新 capture を残す）
  const byKey = new Map<string, CandidateLifecycleEntry>();
  for (const e of passed) {
    const key = candidateDedupKey(e);
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, e);
    } else {
      byKey.set(key, preferEntry(existing, e));
      (dropped as { duplicate: number }).duplicate++;
    }
  }

  return { surfaceable: Array.from(byKey.values()), droppedCounts: dropped };
}
