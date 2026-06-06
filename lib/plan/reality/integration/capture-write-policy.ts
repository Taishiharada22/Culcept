/**
 * Reality Control OS — A1-5-11-3 Write-side Accumulation Guard / TTL Policy（**pure・no-DB・no-run**・barrel 非 export）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.60
 *
 * 役割: production/canary 前の **DB 行蓄積対策の pure policy**。surface dedup（A1-5-11-2）は **表示**を 1 件に抑えるが、
 *   **write 側では同じような seed/evidence が何度も作られ DB 行が増え続ける**。本 module は write 直前に
 *   「**既に同等の active seed があるなら書かない（suppress）/ TTL で自動失効させる**」を決める pure selector を提供する。
 *
 * 既存 schema で可能 / 不可能（厳守して docs と整合）:
 *   - **可能（本 module・既存 schema）**: ① read-before-write dedup（既存 active seeds を read → 構造重複なら suppress・**read-side dedup と同一キー**）
 *     ② expires_at TTL（既存列・write 時に初期値を計算 → 経過で expired → surface guard が除外）。
 *   - **不可能（migration 必要・design only）**: 原子的な一意制約（partial unique index）。**duration は evidence 表ゆえ seed 一意キーに含められず read-side dedup より粗い**。
 *   - **別 slice（write）**: stale duplicate の **replace（旧を expired に flip）** / consumed·rejected·expired への **status 遷移** / 古い行の **cleanup delete**。
 *
 * 限界（厳守・明記）:
 *   - **read-before-write は原子的でない（race-prone）**: read と write の間に並行 write が同じ構造 seed を入れ得る。逐次ケースで蓄積を減らすが、
 *     完全な重複防止には DB 一意制約（migration）が要る。本 policy はその前段の **best-effort 抑制**。
 *
 * 厳守:
 *   - **pure・deterministic**: DB/Supabase/network/route/UI/`Date.now()` を持たない（now は注入）。barrel 非 export。
 *   - **raw/source_ref/UUID を policy 出力に出さない**: 出力は decision/reason（enum）+ number（expiry ms）のみ。
 *   - read-side dedup（candidate-lifecycle-guard）と **同一 dedup キー・同一 fresh/expired 判定**を再利用（drift 防止）。
 */

import {
  candidateDedupKey,
  isFreshCandidate,
  isExpiredCandidate,
  CANDIDATE_FRESHNESS_MS_DEFAULT,
  type CandidateLifecycleEntry,
  type CandidateLifecycleContext,
} from "./candidate-lifecycle-guard";

/**
 * A1-5-11-4: capture write path に policy を **optional DI** で注入する依存（**pure・raw 非搬送**・now/provider 注入）。
 *   未指定（undefined）→ orchestrator は既存挙動（dedup なし・TTL なし）。指定時のみ read-before-write dedup + TTL を適用。
 *   `existingActive` は**既存 active seeds（lifecycle + durationMin・read seam 由来）**を返す DI provider（テストは fake・本番は read seam）。
 *   provider error は **fail-open**（orchestrator 側で existing=[] 扱い→write 継続・best-effort・data loss 回避）。
 */
export interface CaptureWritePolicyDeps {
  /** 既存 active seeds（CandidateLifecycleEntry[]）。DI・テストは fake・本番は read seam。error は orchestrator が fail-open 握り潰し。 */
  readonly existingActive: () => Promise<readonly CandidateLifecycleEntry[]>;
  /** 判定基準時刻（epoch ms・caller=server が Date.now 注入・pure orchestrator を決定的に保つ）。 */
  readonly nowMs: number;
  /** freshness 窓（ms・既定 = read-side と同じ 14 日）。 */
  readonly freshnessMs?: number;
  /** TTL 日数（既定 14）。 */
  readonly ttlDays?: number;
}

// ── 1. duplicate-on-write policy（read-before-write・既存 schema・race-prone） ──

/** write 判定（insert=書く / suppress=既存 active fresh 重複ゆえ書かない）。 */
export type CaptureWriteDecision = "insert" | "suppress";

/** 判定理由（**redacted・raw なし**）。 */
export type CaptureWriteReason =
  | "no_duplicate" // 構造重複なし → 書く
  | "duplicate_active_fresh" // 同構造の active fresh 非 expired が既存 → 書かない（reuse）
  | "duplicate_stale_or_expired"; // 同構造はあるが全て stale/expired → 書く（fresh を作る・旧は surface で除外/将来 cleanup）

/** policy 出力（**decision + reason のみ**・seedRef/raw/source_ref を出さない）。 */
export interface CaptureWritePolicyResult {
  readonly decision: CaptureWriteDecision;
  readonly reason: CaptureWriteReason;
}

/**
 * A1-5-11-3: **read-before-write dedup**（pure）。新しい capture 候補（candidate）と既存 active seeds を比べ、
 *   **同 dedup 構造キー（actionShape|date|timeHint|durationMin）の active fresh 非 expired が既にあれば suppress**（書かない＝reuse）。
 *   - 構造重複なし → insert。
 *   - 同構造の active fresh 非 expired あり → suppress（既存で十分・DB 行を増やさない）。
 *   - 同構造はあるが全て stale/expired → insert（fresh を作る・旧は surface guard で除外・cleanup は別 slice）。
 *   read-side dedup（candidate-lifecycle-guard）と **同一キー・同一 fresh/expired 判定**を共有（write 抑制と read 表示抑制の整合）。
 *   **race-prone**（read↔write 非原子）: 完全防止は DB 一意制約（migration・別 GO）。本 policy は逐次ケースの best-effort。
 *
 * @param candidate 新規 capture 候補（active・capturedAtMs=now・expiresAtMs=TTL 計算値）。
 * @param existingActive 既存 active seeds（read seam 由来・enrich 済 durationMin）。**active のみ**（caller が status filter 済前提・本関数も再確認）。
 */
export function decideCaptureWrite(
  candidate: CandidateLifecycleEntry,
  existingActive: readonly CandidateLifecycleEntry[],
  ctx: CandidateLifecycleContext
): CaptureWritePolicyResult {
  const key = candidateDedupKey(candidate);
  const sameStructure = existingActive.filter((e) => e.status === "active" && candidateDedupKey(e) === key);
  if (sameStructure.length === 0) return { decision: "insert", reason: "no_duplicate" };
  // 同構造に「active fresh 非 expired」があれば既存で足りる → 書かない（reuse）。
  const blockingExists = sameStructure.some((e) => isFreshCandidate(e, ctx) && !isExpiredCandidate(e, ctx));
  return blockingExists
    ? { decision: "suppress", reason: "duplicate_active_fresh" }
    : { decision: "insert", reason: "duplicate_stale_or_expired" };
}

// ── 2. TTL / expires_at policy（既存列・write 時の初期値計算） ──

const DAY_MS = 24 * 60 * 60 * 1000;
/** seed の既定 active 寿命（日）。undated は now+TTL で自動失効（policy・CEO 調整可）。read-side freshness 窓と整合（14 日）。 */
export const DEFAULT_SEED_TTL_DAYS = CANDIDATE_FRESHNESS_MS_DEFAULT / DAY_MS;

/** TTL 計算入力（**raw を持たない**）。 */
export interface CaptureExpiryInput {
  /** 希望日（YYYY-MM-DD / 不明 null）。 */
  readonly desiredDate: string | null;
  /** 既に明示 expiry がある場合（ISO→ms・null=なし）。あれば尊重する。 */
  readonly explicitExpiresAtMs?: number | null;
}

/**
 * A1-5-11-3: **write 時の expires_at 初期値**（pure・epoch ms / null）。経過で expired → surface guard（A1-5-11-2）が除外。
 *   - 明示 expiresAt あり → **尊重**（上書きしない）。
 *   - **undated**（desiredDate なし）→ `now + TTL`（既定 14 日）。手付かずで放置されたら失効。
 *   - **dated**（desiredDate あり）→ **その日の終端**（YYYY-MM-DDT23:59:59.999Z）。日が過ぎたら expired。不正日付 → now+TTL に fallback。
 *   現状 captureToDrafts は expires_at=input.expiresAt ?? null（undated は never-expire）。本 policy を extractor/mapper 前段で適用すれば自動失効化できる（wiring は別 slice）。
 */
export function computeCaptureExpiry(
  input: CaptureExpiryInput,
  nowMs: number,
  ttlDays: number = DEFAULT_SEED_TTL_DAYS
): number | null {
  if (input.explicitExpiresAtMs != null) return input.explicitExpiresAtMs; // 明示尊重
  if (input.desiredDate == null) return nowMs + ttlDays * DAY_MS; // undated → now+TTL
  const endOfDateMs = Date.parse(`${input.desiredDate}T23:59:59.999Z`); // 決定的（Date.now でない）
  return Number.isFinite(endOfDateMs) ? endOfDateMs : nowMs + ttlDays * DAY_MS; // dated → 日終端 / 不正→TTL fallback
}
