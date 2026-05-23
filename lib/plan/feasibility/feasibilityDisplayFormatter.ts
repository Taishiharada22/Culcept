/**
 * Phase 3-M-2a (pure) — Feasibility Display Formatter
 *
 * 役割:
 *   M-1 の `DayFeasibilityResult` (= 余白 / 不足の pure data) を **表示用 view model** に
 *   変換する pure formatter。 UI 接続なし。 副作用なし。
 *
 * 思想 (= 「不足を警告に見せない」 設計):
 *   - 「余白 N 分」 / 「不足 N 分」 のみ output (= 量的中立表記)
 *   - not_applicable view は **map から除外** (= 観測根拠のないものは表示しない)
 *   - 「余白」 と「不足」 は完全同 styling 想定 (= caller の UI で同 tier 同色)
 *   - confidenceBand のような visual 変化を発火させない (= 全 view 同 tone)
 *
 * 警告化要素 5 dimension 防御:
 *   1. 色 — slate のみ (= caller の責任、 本 formatter は color を含まない)
 *   2. 形容詞 — NG list (= M-2b contract で機械検証)
 *   3. 記号 — ⚠️ / ❗ / ❌ 等を禁止 (= M-2b contract)
 *   4. 強調 — tier 階層 2 維持
 *   5. 動詞命令 — 「急いで」 等 NG (= M-2b contract)
 *
 * L-4a との対称性 (= 同 pattern):
 *   - L-4a MovementDisplayFormatter は L-3c overlay → display view
 *   - M-2a FeasibilityDisplayFormatter は M-1 feasibility → display view
 *   - 構造 / 純度 / contract 機械保証 すべて対称
 *
 * Privacy 規約 (= L-3c discipline 継承):
 *   - output に nodeId / anchorId / locationText / title / userId を持たせない
 *   - transitionKey は L-3c 非 PII 形式 (= `transition_${index}`)
 *   - M-1 で graph.transitions 逆引きの内部処理は M-2a に渡らない
 *
 * M-2a-pure scope (= 2026-05-23 CEO + GPT 連続 GO 範囲):
 *   - LLM 不使用 / API 不使用 / geocode 不使用 / localStorage 不使用
 *   - DB / env / package / dependency 変更 0
 *   - UI 変更 0 (= M-3+ で別 audit)
 *   - K phase / L / M-1 既存 file 改変 0
 *
 * 参照:
 *   - docs/alter-plan-phase3-m-2-readiness-audit.md §7
 *   - lib/plan/feasibility/feasibilityTypes.ts (= M-1 type、 読み取り only)
 *   - lib/plan/transport/movementDisplayFormatter.ts (= L-4a、 対称 pattern)
 */

import type {
  DayFeasibilityResult,
  FeasibilitySlackView,
} from "./feasibilityTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. Display Tier (= K-3c-iii / L-4a 整合の補助情報階層)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Display 階層 ID。 M-2a 出力は常に `"tier_2_movement_aux"` 固定。
 *
 * 意味:
 *   - K-3c-iii 階層 2 (= slate-300 / italic / dashed / text-xs) の **同階層 sub-information**
 *   - L-4a `tier_2_movement` (= 移動本体) の **補助情報**
 *   - 「予定」 (= 階層 3) より弱く、 「→ 移動」 より少しさらに弱い
 *
 * 拡張不可 (= M-2a 範囲では他 tier を出さない、 全 feasibility 表示が補助情報階層)。
 */
export type FeasibilityDisplayTier = "tier_2_movement_aux";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. Display Variant (= 2 値、 「余白」 / 「不足」)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Display variant — 2 値のみ。 not_applicable は本 layer で除外 (= map から外す)。
 *
 * - "slack":     余白あり (= M-1 sufficient)、 「余白 N 分」
 * - "shortfall": 不足あり (= M-1 insufficient)、 「不足 N 分」
 *
 * 注: M-1 not_applicable は M-2a 出力に含まれない (= 観測根拠なし)。
 */
export type FeasibilityDisplayVariant = "slack" | "shortfall";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. FeasibilityDisplayView (= PII-free display 単位)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 単一 transition の feasibility display view。
 *
 * **PII-free 構造的保証**:
 *   - `fromNodeId` / `toNodeId` / `locationText` / `anchorId` / `userId` / `title` 不在
 *   - `slackMin` / `shortfallMin` の raw 数値も内包しない (= displayText に集約)
 *   - L-4a `MovementDisplayView` と対称設計
 *
 * 文言規約 (= M-2b contract で機械保証):
 *   - displayText は **「余白 N 分」** (= variant "slack") か **「不足 N 分」** (= variant "shortfall") のいずれか
 *   - NG 文言 (= 「ギリギリ」 「危険」 「⚠️」 等) を含まない
 */
export interface FeasibilityDisplayView {
  /**
   * transitionIndex — L-3c overlay / M-1 と同 ordinal (= 非 PII)。
   * 該当 transition の L view / K view と join 可能。
   */
  readonly transitionIndex: number;

  /**
   * 表示文字列。 以下 2 種のいずれか:
   *   - "余白 N 分" (= variant "slack")
   *   - "不足 N 分" (= variant "shortfall")
   *
   * N は 0 以上の整数 (= sufficient case で slackMin>=0、 insufficient case で shortfallMin>0)。
   */
  readonly displayText: string;

  /**
   * Display variant — 「余白 / 不足」 識別。
   * caller (= UI 接続層) は variant で render 分岐可能 (= 同 styling 推奨)。
   */
  readonly variant: FeasibilityDisplayVariant;

  /**
   * K-3c-iii / L-4a 階層 hint — 常に `"tier_2_movement_aux"` 固定。
   */
  readonly tier: FeasibilityDisplayTier;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. FeasibilityDisplayResult (= top-level、 集計付き)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Bulk formatter の出力。
 *
 * - `feasibilityDisplayByTransitionKey`: L-3c 形式 (= `transition_${index}`) の map
 *   not_applicable は **map から除外** (= caller は `map.has(key)` で render 判断)
 * - `counts`: 集計 (= 2 variant 別 count、 caller の UI summary 用素材)
 *
 * **PII-free 構造的保証**:
 *   - top-level field に locationText / anchorId / userId 不在
 *   - 各 view も §3 で PII-free 保証済
 */
export interface FeasibilityDisplayResult {
  readonly feasibilityDisplayByTransitionKey: ReadonlyMap<
    string,
    FeasibilityDisplayView
  >;
  readonly counts: {
    readonly slack: number;
    readonly shortfall: number;
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. Internal helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * sufficient view → display 変換 helper。
 *
 * - displayText: 「余白 N 分」 (= slackMin の整数、 既に M-1 で Math.round 済)
 * - variant: "slack"
 * - tier: 固定
 *
 * 防御: slackMin が undefined / 非 number の場合は null を返す
 *       (= caller は skip、 但し M-1 contract で保証済のため通常発生しない)。
 */
function sufficientToDisplay(
  view: FeasibilitySlackView,
): FeasibilityDisplayView | null {
  if (typeof view.slackMin !== "number" || !Number.isFinite(view.slackMin)) {
    return null;
  }
  return {
    transitionIndex: view.transitionIndex,
    displayText: `余白 ${view.slackMin} 分`,
    variant: "slack",
    tier: "tier_2_movement_aux",
  };
}

/**
 * insufficient view → display 変換 helper。
 *
 * - displayText: 「不足 N 分」 (= shortfallMin の整数)
 * - variant: "shortfall"
 * - tier: 固定
 *
 * 防御: shortfallMin が undefined / 非 number / 0 以下の場合は null を返す
 *       (= M-1 contract で >0 を保証済)。
 */
function insufficientToDisplay(
  view: FeasibilitySlackView,
): FeasibilityDisplayView | null {
  if (
    typeof view.shortfallMin !== "number" ||
    !Number.isFinite(view.shortfallMin) ||
    view.shortfallMin <= 0
  ) {
    return null;
  }
  return {
    transitionIndex: view.transitionIndex,
    displayText: `不足 ${view.shortfallMin} 分`,
    variant: "shortfall",
    tier: "tier_2_movement_aux",
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. Public: formatFeasibilityForDisplay
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * `DayFeasibilityResult` を `FeasibilityDisplayResult` に変換する pure formatter。
 *
 * 規則 (= readiness audit §3 / §5.4):
 *   - sufficient → variant "slack" / 「余白 N 分」
 *   - insufficient → variant "shortfall" / 「不足 N 分」
 *   - **not_applicable** → **map から除外** (= 観測根拠なし、 display なし)
 *
 * 副作用なし、 input mutation なし、 deterministic。
 *
 * caller (= M-3+ UI 接続層) は `feasibilityDisplayByTransitionKey.has(key)` で
 * 表示可否を判断する pattern を採用する。
 */
export function formatFeasibilityForDisplay(
  result: DayFeasibilityResult,
): FeasibilityDisplayResult {
  const out = new Map<string, FeasibilityDisplayView>();
  let slack = 0;
  let shortfall = 0;

  for (const [key, view] of result.feasibilityByTransitionKey.entries()) {
    let displayView: FeasibilityDisplayView | null = null;

    switch (view.status) {
      case "sufficient":
        displayView = sufficientToDisplay(view);
        if (displayView) slack++;
        break;
      case "insufficient":
        displayView = insufficientToDisplay(view);
        if (displayView) shortfall++;
        break;
      case "not_applicable":
        // 観測根拠なし → map から除外、 caller は表示しない
        displayView = null;
        break;
    }

    if (displayView !== null) {
      out.set(key, displayView);
    }
  }

  return {
    feasibilityDisplayByTransitionKey: out,
    counts: { slack, shortfall },
  };
}
