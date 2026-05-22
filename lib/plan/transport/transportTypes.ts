/**
 * Phase 3-L-1 (pure) — Transport / MovementSegment Provider-Independent Type Contract
 *
 * 思想 (= Mobility Truth Layer):
 *   - Aneurasync 3-L は「移動が確定したか / 確定していないか」 を**観測**する layer であり、
 *     最適化 (= optimize) / 推奨 (= recommend) を一切しない。
 *   - 「移動が未確定」 を構造化された first-class state として扱う。
 *
 * Layer 区分:
 *   - Layer 0 (= K phase): DayGraph computed projection (= unresolved 表示のみ)
 *   - Layer 1 (= L phase, 本 file): MovementSegment 解決 status / confidence / privacy class
 *   - Layer 2 (= M/N phase): Arrival Risk Memory 等、 本 file の責務外
 *
 * Provider-independent 原則 (= Claude 革新 D、 GPT 補正 7):
 *   - 具体 provider (= Google Routes API / OSRM / NAVITIME 等) に依存しない interface
 *   - 将来 provider 追加で本 file は変更されない (= 後方互換)
 *
 * L-1-pure scope (= 2026-05-22 CEO PARTIAL 承認):
 *   - types のみ。 UI / API / geocode call / localStorage / DB / env / package / dependency 一切なし
 *   - K phase frozen な dayGraphTypes.ts は変更しない (= Omit による composition)
 *
 * 参照:
 *   - docs/alter-plan-phase3-l-transport-design.md v0.2 §4
 *   - docs/alter-plan-phase3-l-0-readiness-audit.md
 *   - lib/plan/dayGraph/dayGraphTypes.ts (= MovementTransition 既存)
 */

import type { MovementTransition } from "@/lib/plan/dayGraph/dayGraphTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4.1 Movement Resolution Status
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 「移動が確定したか」 の 2 値 state。
 *
 * - "unresolved": location 不明 / sensitive proximity / provider 失敗 等
 *                 (= 3-K と整合、 透明 segment / 「移動」 のみ表示)
 * - "resolved":   duration + mode candidate + confidence 確定
 *                 (= 「移動 約 30 分」 等の表示が可能)
 */
export type MovementResolutionStatus = "unresolved" | "resolved";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4.2 Transport Provider (= Adapter abstraction)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Provider ID — Google 固有名ではなく抽象化された識別子。
 *
 * - "google_routes":      Google Routes API (= L-3+ 別 phase で接続)
 * - "heuristic_distance": 距離 heuristic (= API なし、 既存 alter-morning durationHeuristic reuse)
 * - "manual_user":         user explicit override (= L-3+ で localStorage 永続化、 L-2 は shell のみ)
 * - "none":                unresolved 専用 (= 全 fallback 失敗時 / privacy block 時)
 *
 * 将来 OSRM / NAVITIME / Mapbox 等を追加可能。 本 type 拡張時は
 * MovementSegmentResolved.source の literal を広げるだけ (= 後方互換)。
 */
export type TransportProvider =
  | "google_routes"
  | "heuristic_distance"
  | "manual_user"
  | "none";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4.3 Transport Mode Candidate
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 移動 mode の候補値。
 *
 * GPT 補正 4 (= 「徒歩 default は危険」):
 *   - 全 mode に confidence を持たせ、 「徒歩」 等を断定しない。
 *   - L-2 heuristic provider は mode を unknown 固定で返す (= 距離だけで mode 推定しない)。
 *
 * - "walking":   徒歩
 * - "driving":   車
 * - "transit":   電車 / バス
 * - "flight":    飛行機 (= 100km+ 県境跨ぎ heuristic、 L-3+)
 * - "unknown":   不明 (= L-2 heuristic provider の default)
 *
 * 注: alter-morning の TransportMode (= "walk" | "car" | "public_transit" | ...) とは
 *      naming が異なる。 plan domain は longer form (= "walking") を採用。
 *      L-3+ で integration する際は mapping layer で吸収する。
 */
export type TransportMode =
  | "walking"
  | "driving"
  | "transit"
  | "flight"
  | "unknown";

/**
 * mode + confidence の pair。 「徒歩 80% 確信」 等を表現可能。
 */
export interface TransportModeCandidate {
  readonly mode: TransportMode;
  readonly confidence: MovementConfidence;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4.4 Movement Confidence (= 4 段階 with reason)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 確信度 4 段階。
 *
 * - "low":        距離 heuristic のみ (= L-2 default)
 * - "medium":     複数 signal、 但し API 未接続 (= L-3 中間段階)
 * - "high":       Routes API 単独応答 / user 明示
 * - "very_high":  複数 provider 一致 (= 将来 cross-provider validation)
 */
export type ConfidenceLevel = "low" | "medium" | "high" | "very_high";

/**
 * 確信度の根拠 (= reason)。 telemetry / debug 用。
 *
 * - "heuristic_distance_only":  距離 heuristic だけで mode 推定 (= 低信頼)
 * - "heuristic_default":         API なし + 距離不可 (= unknown mode の最低信頼)
 * - "routes_api_response":       Routes API response (= 通常応答)
 * - "routes_api_with_traffic":   Routes API + traffic-aware (= L-3+、 3-L MVP 範囲外)
 * - "user_explicit":             user が明示 (= manual_user override)
 * - "cross_provider_match":      複数 provider 一致 (= 将来)
 */
export type ConfidenceReason =
  | "heuristic_distance_only"
  | "heuristic_default"
  | "routes_api_response"
  | "routes_api_with_traffic"
  | "user_explicit"
  | "cross_provider_match";

export interface MovementConfidence {
  readonly level: ConfidenceLevel;
  readonly reason: ConfidenceReason;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4.5 Movement Privacy Class (= 4 段階、 Claude 拡張)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Movement の privacy class。 UI 表示規約と provider 呼び出し可否を制御。
 *
 * - "normal":              前後どちらも sensitive ではない
 *                          → 「移動 約 30 分」 + mode 表示可能
 *
 * - "sensitive_adjacent":  片方 sensitive
 *                          → 「移動 約 30 分」 (= mode 削除、 duration のみ)
 *
 * - "sensitive_both":      両方 sensitive (= 完全 blackout)
 *                          → 「移動」 のみ (= duration も削除)
 *                          → provider は呼ばない (= caller 責任、 §10)
 *
 * - "location_unknown":    location 不明
 *                          → 「移動」 のみ (= 3-K K-3c-iii と同じ unresolved 表示)
 */
export type MovementPrivacyClass =
  | "normal"
  | "sensitive_adjacent"
  | "sensitive_both"
  | "location_unknown";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4.6 MovementUnresolvedReason
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 解決失敗の理由 (= unresolved segment が持つ context 情報)。
 * telemetry 集計の primary key。
 *
 * - "location_unknown":         anchor の location が undefined
 * - "sensitive_proximity":      sensitive_both (= API 呼ばない)
 * - "api_timeout":               provider timeout (= L-3+ で発生)
 * - "api_error":                  provider 5xx 等 (= L-3+)
 * - "rate_limit":                 provider rate limit hit (= L-3+)
 * - "cost_cap_exceeded":          月次 cost cap 到達 (= L-3+)
 * - "heuristic_failed":           heuristic が NaN / invalid coords で null を返した
 * - "no_provider_available":      全 provider down / 未登録
 */
export type MovementUnresolvedReason =
  | "location_unknown"
  | "sensitive_proximity"
  | "api_timeout"
  | "api_error"
  | "rate_limit"
  | "cost_cap_exceeded"
  | "heuristic_failed"
  | "no_provider_available";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4.7 Top-level MovementSegment (= discriminated union)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Plan domain の MovementSegment が継承する base 部分。
 *
 * 設計判断 (= 2026-05-22):
 *   - dayGraphTypes.ts の MovementTransition.timingStatus は "unresolved" 単一 literal で固定
 *   - K phase 凍結により widening 不可
 *   - そこで `Omit<MovementTransition, "timingStatus">` で base を借りつつ
 *     timingStatus を L 独自の discriminant として再定義する
 *
 * これにより:
 *   - 後方互換性: 既存 3-K (= MovementTransition) は無傷
 *   - 前方拡張性: L-3+ で DayGraph 経路を統合するときに、 L type → K type は
 *                  unresolved 専用に絞れば assign 可能 (= 共通 field 互換)
 */
type MovementSegmentBase = Omit<MovementTransition, "timingStatus">;

/**
 * Unresolved segment (= duration / mode 未確定)。
 *
 * 3-K K-1c の MovementTransition (= 全て unresolved) を継承して
 * unresolvedReason を追加。
 */
export interface MovementSegmentUnresolved extends MovementSegmentBase {
  readonly timingStatus: "unresolved";
  readonly unresolvedReason: MovementUnresolvedReason;
}

/**
 * Resolved segment (= duration / mode 確定)。
 *
 * 不変条件 (= transportIntegrityContract.ts で機械保証):
 *   - estimatedDurationMin は number (= null 禁止)
 *   - modeCandidate は必ず存在
 *   - source は "none" 以外 (= "none" は unresolved 専用)
 *   - confidence は必ず存在
 *   - privacyClass が "sensitive_both" の場合は resolved になれない (= caller 責任)
 */
export interface MovementSegmentResolved extends MovementSegmentBase {
  readonly timingStatus: "resolved";
  readonly estimatedDurationMin: number;
  readonly modeCandidate: TransportModeCandidate;
  readonly source: Exclude<TransportProvider, "none">;
  readonly confidence: MovementConfidence;
  readonly privacyClass: MovementPrivacyClass;
  /**
   * 距離 (m)。 公開 UI で出さない (= 内部のみ、 3-M / 3-N Arrival Risk 計算用)。
   * heuristic provider が Haversine で計算した値、 又は Routes API の response。
   */
  readonly distanceM?: number;
  /**
   * Time budget hint (= 前後 anchor 間の余白 vs duration)。
   * 3-M Arrival Risk 計算の base。 3-L は計算するだけ、 「余裕ない」 等の判断はしない。
   */
  readonly slackAnalysis?: {
    readonly availableMin: number;
    readonly durationMin: number;
    readonly utilization: number;
  };
}

/**
 * MovementSegment discriminated union。
 *
 * 使い方:
 *   if (segment.timingStatus === "resolved") {
 *     // segment.estimatedDurationMin, modeCandidate, source, ... が type-safe にアクセス可能
 *   } else {
 *     // segment.unresolvedReason が type-safe にアクセス可能
 *   }
 */
export type MovementSegment =
  | MovementSegmentUnresolved
  | MovementSegmentResolved;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4.8 Provider Adapter Interface
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Provider の health 状態。 circuit breaker / fallback cascade の判断に使う。
 *
 * - "healthy":   正常稼働
 * - "degraded":  部分的失敗 (= rate limit / slow response)
 * - "down":       完全停止 (= 5xx / timeout 連発)
 * - "unknown":    起動直後 / 未観測
 */
export type ProviderHealth = "healthy" | "degraded" | "down" | "unknown";

/**
 * Provider への resolution 入力。 PII 最小化のため anonymized coords を渡す。
 *
 * 設計原則:
 *   - sensitive_both segment は caller 側で除外し、 provider に渡さない (= §10)
 *   - sensitive_adjacent の coords は ~1km 精度に丸めて渡す (= L-3+ で実装)
 *   - normal の coords は ~100m 精度 (= L-3+ で実装)
 */
export interface MovementResolutionInput {
  /** Anonymized 始点 coords。 undefined なら location_unknown 確定 */
  readonly fromCoords?: { readonly lat: number; readonly lng: number };
  /** Anonymized 終点 coords。 undefined なら location_unknown 確定 */
  readonly toCoords?: { readonly lat: number; readonly lng: number };
  /** Preferred mode (= L-3+ で user override 用)。 L-2 は不使用 */
  readonly preferredMode?: TransportMode;
  /** privacy class — caller が判定して渡す。 sensitive_both で provider 呼ぶのは禁止 */
  readonly privacyClass: MovementPrivacyClass;
}

/**
 * Provider response (= ok / fail の discriminated result)。
 *
 * - ok: true:  segment 確定。 caller は MovementSegmentResolved として注入できる
 * - ok: false: 解決失敗。 reason は MovementUnresolvedReason で structured
 */
export type MovementResolutionResult =
  | { readonly ok: true; readonly segment: MovementSegmentResolved }
  | { readonly ok: false; readonly reason: MovementUnresolvedReason };

/**
 * Provider-independent interface (= Claude 革新 D)。
 *
 * 各 provider 実装は本 interface に準拠する。
 *
 * 実装例:
 *   - L-2: HeuristicDistanceProvider (= 距離 heuristic、 API なし)
 *   - L-2: UnresolvedProvider (= 常に unresolved を返す sentinel)
 *   - L-2: ManualUserProvider (= shell only、 L-3+ で localStorage 永続化)
 *   - L-3+: GoogleRoutesProvider (= Routes API 接続)
 *
 * 注: id field により caller は cascade 優先度を決められる。
 *      `id: "none"` の provider は常に unresolved を返す (= 構造的保証)。
 */
export interface TransportResolutionProvider {
  readonly id: TransportProvider;
  readonly health: ProviderHealth;
  resolveDuration(input: MovementResolutionInput): Promise<MovementResolutionResult>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4.9 Safe Telemetry (= GPT 補正 5、 PII-free)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Movement 解決の観測記録。 PII 一切含まない。
 *
 * 禁止 fields (= 永続規約):
 *   - title / locationText / coords 生値
 *   - userId / anchorId (= salted hash は別途、 本 type には入れない)
 *
 * 用途:
 *   - L-3+ で provider 別成功率 / 平均 confidence を集計
 *   - 本 file (L-1-pure) では type 定義のみ、 runtime sink は実装しない
 */
export interface MovementResolutionTelemetry {
  /** "YYYY-MM-DD" — 日次集計用 */
  readonly date: string;
  /** どの provider が解決したか (= "none" なら全 fallback 失敗) */
  readonly resolvedBy: TransportProvider;
  /** 最終 segment の status */
  readonly status: MovementResolutionStatus;
  /** unresolved の場合の reason */
  readonly unresolvedReason?: MovementUnresolvedReason;
  /** resolved の場合の confidence level */
  readonly confidenceLevel?: ConfidenceLevel;
  /** privacy class (= 集計時に sensitive 比率を観測) */
  readonly privacyClass: MovementPrivacyClass;
  /** mode candidate (= 集計時に unknown / walking / driving 比率を観測) */
  readonly mode?: TransportMode;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Exhaustive helper (= switch 全網羅保証)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * `MovementResolutionStatus` の網羅性を compile-time に保証する helper。
 *
 * 使い方:
 *   switch (segment.timingStatus) {
 *     case "unresolved": return ...;
 *     case "resolved":   return ...;
 *     default: return exhaustiveMovementResolutionStatus(segment);
 *   }
 *
 * 新 status を追加した場合、 全 switch がコンパイルエラーになり caller 全件確認を強制する。
 */
export function exhaustiveMovementResolutionStatus(value: never): never {
  throw new Error(
    `[L-1] Non-exhaustive MovementResolutionStatus: ${JSON.stringify(value)}`,
  );
}
