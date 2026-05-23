/**
 * Phase 3-M-1 (pure) — Day Feasibility Truth Layer / Type Contract
 *
 * 役割:
 *   各 transition (= L で resolved) の前後 anchor 間「余白 / 不足」 を観測する
 *   pure data type 群。 UI / DB / 永続化なし。
 *
 * 思想 (= Feasibility Truth Layer):
 *   - K phase = 時間構造観測 (= computed projection)
 *   - L phase = 移動観測 (= Mobility Truth Layer)
 *   - M phase = 余白観測 (= Feasibility Truth Layer) ← 本 file
 *
 *   推奨 / 警告 / 評価は一切しない。 量的中立表記のみ。
 *
 * Arrival Risk との明示分離:
 *   - Day Feasibility = 「余白 N 分」 「不足 N 分」 (= 観測の表記)
 *   - Arrival Risk    = 「遅刻リスク 70%」 「危険度 High」 (= 評価 / 警告、 永続禁止)
 *   - M は Feasibility のみ、 Arrival Risk には絶対に近づかない。
 *
 * 表記規約 (= 永続):
 *   OK: 「余白 N 分」 / 「不足 N 分」 / 「該当なし」
 *   NG: 「ギリギリ」 「快適」 「危険」 「リスク」 「遅刻」 「お急ぎ」 等の質的評価語
 *
 * M-1-pure scope (= 2026-05-23 CEO + GPT 連続 GO 範囲):
 *   - LLM 不使用 / API 不使用 / geocode 不使用 / localStorage 不使用
 *   - DB / env / package / dependency 変更 0
 *   - UI 変更 0 (= M-2 以降は別 readiness audit)
 *   - K phase / L-1 既存 file 変更 0
 *
 * 参照:
 *   - docs/alter-plan-phase3-m-readiness-audit.md
 *   - lib/plan/transport/movementDisplayFormatter.ts (= L-4a、 対称 pattern)
 *   - lib/plan/dayGraph/dayGraphTypes.ts (= K phase、 読み取り only)
 *   - lib/plan/transport/movementSegmentOverlay.ts (= L-3c、 OverlayResult を input)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. SlackStatus — 観測の 3 状態
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 余白状態 — 3 値の観測のみ。
 *
 * - "sufficient":     余白あり (= availableMin >= durationMin)
 * - "insufficient":   不足あり (= availableMin < durationMin)
 * - "not_applicable": 計算不能 (= unresolved transition / 前後 time 不明 / sensitive proximity)
 *
 * 注: "sufficient" / "insufficient" は **観測の事実**であり、 「警告」 「推奨」 ではない。
 *      ユーザーは観測結果を見て自分で判断する。
 */
export type SlackStatus =
  | "sufficient"
  | "insufficient"
  | "not_applicable";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. FeasibilitySlackView — 単一 transition の余白観測 (= PII-free)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 単一 transition の slack observation。
 *
 * **PII-free 構造的保証**:
 *   - fromNodeId / toNodeId / locationText / anchorId / userId / title 等を **持てない**
 *   - 数値 (= slackMin / shortfallMin) と enum literal (= status) のみ
 *   - transitionIndex は L-3c の非 PII ordinal を継承
 *
 * 各 case の field 規約:
 *   - sufficient:     slackMin >= 0 (= 余白分数)
 *   - insufficient:   shortfallMin >= 0 (= 不足分数)
 *   - not_applicable: slackMin / shortfallMin **両方とも undefined**
 *
 * 注: caller は status に応じて適切な field を読む (= 整合性は assertFeasibilityCompliance で保証)。
 */
export interface FeasibilitySlackView {
  /**
   * transitionIndex — L-3c overlay と同 ordinal (= L 非 PII 形式継承)。
   * 該当 overlay の MovementSegment と join 可能。
   */
  readonly transitionIndex: number;

  /**
   * 余白状態 — 観測のみ、 評価ではない。
   */
  readonly status: SlackStatus;

  /**
   * 余白 (分)。 status === "sufficient" の場合のみ意味あり。
   * non-negative integer (= 0 以上の整数を期待、 但し計算過程で float になる場合は caller の表示時に round)。
   */
  readonly slackMin?: number;

  /**
   * 不足 (分)。 status === "insufficient" の場合のみ意味あり。
   * positive integer (= 1 以上の整数を期待)。
   */
  readonly shortfallMin?: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. DayFeasibilityResult — 1 日全体の result (= top-level、 PII-free structural)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 1 日全体の feasibility result。
 *
 * **PII-free 構造的保証**:
 *   - top-level field は集計のみ (= title / locationText / userId / anchorId field 不存在)
 *   - feasibilityByTransitionKey の各 view も PII-free (= §2 で保証)
 *   - transitionKey は L-3c の `transition_${index}` 形式継承 (= 非 PII)
 *
 * 用途:
 *   - M-2 以降の UI 接続で caller がこれを読み、 各 transition の slack を表示
 *   - 但し M-1 段階では UI 接続なし、 pure data として確立のみ
 */
export interface DayFeasibilityResult {
  /**
   * transitionKey (= `transition_${index}`、 L-3c 形式) → FeasibilitySlackView の map。
   * 該当 day の全 transition について観測結果を保持。
   */
  readonly feasibilityByTransitionKey: ReadonlyMap<string, FeasibilitySlackView>;

  /**
   * 状態別 count (= caller の UI summary 用素材)。
   * counts の和 === feasibilityByTransitionKey.size を機械保証。
   */
  readonly counts: {
    readonly sufficient: number;
    readonly insufficient: number;
    readonly notApplicable: number;
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. Exhaustive helper (= switch 全網羅保証)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * `SlackStatus` の網羅性を compile-time に保証する helper。
 *
 * 使い方:
 *   switch (view.status) {
 *     case "sufficient":     return ...;
 *     case "insufficient":   return ...;
 *     case "not_applicable": return ...;
 *     default: return exhaustiveSlackStatus(view.status);
 *   }
 *
 * 新 status 追加時、 全 switch でコンパイルエラーになり caller 全件確認を強制する。
 */
export function exhaustiveSlackStatus(value: never): never {
  throw new Error(
    `[M-1] Non-exhaustive SlackStatus: ${JSON.stringify(value)}`,
  );
}
