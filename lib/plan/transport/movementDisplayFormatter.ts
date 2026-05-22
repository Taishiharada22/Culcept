/**
 * Phase 3-L-4a (pure) — Movement Display Formatter
 *
 * 役割:
 *   L-3c の `OverlayResult` (= PII-sanitize 済) を **表示用 view model** に変換する pure formatter。
 *   UI は接続しない。 副作用なし。 既存 K phase / L-1/L-2/L-3 file 無変更。
 *
 * 思想 (= Mobility Truth Layer に整合):
 *   - 「移動が確定したか / されていないか」 という観測の **表記** だけを担当
 *   - 推奨 / 最適化 / 警告 / 質的評価は一切しない (= L-4b で NG 文言 grep guard)
 *   - mode / distance / risk は L-4 範囲外 (= 別 audit 経由)
 *
 * K-3c-iii との関係:
 *   - K phase の `MovementTransitionView` (= 「→ 移動」 固定) は **無変更**
 *   - 本 formatter は K view の **augment** であり、 置換ではない
 *   - caller (= 将来 UI 接続) が「K view の label を上書きするか / 維持するか」 を選べる pure data
 *
 * L-4a-pure scope (= 2026-05-22 CEO + GPT 連続 GO 範囲):
 *   - LLM 不使用 / API 不使用 / geocode 不使用 / localStorage 不使用
 *   - DB / env / package / dependency 変更 0
 *   - UI 変更 0
 *   - K phase 既存 file 変更 0
 *   - L-1 type 変更 0 (= freeze 維持)
 *
 * 参照:
 *   - docs/alter-plan-phase3-l-4-readiness-audit.md §2 / §5 / §6
 *   - lib/plan/transport/movementSegmentOverlay.ts (= L-3c OverlayResult 出力元)
 *   - lib/plan/dayGraph/dayGraphTimelinePresentation.ts (= K-3c-iii MovementTransitionView 階層 2)
 */

import type {
  OverlayResult,
  OverlaySegmentView,
} from "./movementSegmentOverlay";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Display Tier (= K-3c-iii 階層 2 整合)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Display 階層 ID。 L-4a 出力は常に `"tier_2_movement"` 固定 (= K-3c-iii 階層 2)。
 *
 * 含意:
 *   - slate-300 / text-slate-500 / text-xs / dashed (= K-3c-iii 規格)
 *   - amber / orange / red は **絶対 NG**
 *   - 「予定」 (= 階層 3) より静か、 「日の境界 / 空白」 (= 階層 1) より目立つ
 *
 * 拡張不可 (= L-4a 範囲では他 tier を出さない、 全 movement 表示が階層 2)。
 */
export type MovementDisplayTier = "tier_2_movement";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Display Variant (= 3 値、 caller がレンダラで描き分け可能)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Display variant — 3 値のみ。
 *
 * - "unresolved":     duration / mode 未確定。 「→ 移動」 (= K view fallback と同形)
 * - "sensitive":       privacy 防御 (= cascade では到達しないが二重防御)。 「移動」 のみ
 * - "duration_only":   resolved + normal。 「移動 約 N 分」 (= 唯一の意味的拡張)
 */
export type MovementDisplayVariant = "unresolved" | "sensitive" | "duration_only";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Confidence Band (= UI tone hint、 raw confidence は露出しない)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Confidence band — UI tone hint (= 「より弱く / より強く」 の二値)。
 *
 * - "soft":   low confidence (= heuristic_distance_only 等)、 UI で italic / 薄色適用 hint
 * - "strong": medium 以上 (= routes_api / user_explicit 等)、 UI で通常表示 hint
 *
 * 注: L-4a 自身は CSS を含まない。 caller (= UI 接続) が本 hint を読んで描画判断する。
 */
export type MovementDisplayConfidenceBand = "soft" | "strong";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MovementDisplayView (= PII-free 表示モデル)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 表示用 view model (= PII-free 構造的保証)。
 *
 * **L-1 MovementSegmentResolved/Unresolved を再利用せず、 表示専用新型** (= L-3c 哲学の継承)。
 * これにより type レベルで:
 *   - `fromNodeId` / `toNodeId` を **持てない**
 *   - `fromLocationText` / `toLocationText` を **持てない**
 *   - raw `title` / `userId` / `anchorId` を **持てない**
 *   - 「移動」 「→ 移動」 「移動 約 N 分」 の 3 種以外の displayText を作る方法が **構造的にない**
 *
 * 設計判断:
 *   - 本 view は UI に直接 render される最小単位だが、 CSS / color / icon は含まない
 *   - tier + variant + confidenceBand を caller (= UI レンダラ) が読んで描画判断する
 *   - K view (= MovementTransitionView) の置換ではなく augment、 caller が選ぶ
 */
export interface MovementDisplayView {
  /**
   * transitionIndex — L-3c overlay と同 index 採番 (= K view と join 可能、 PII なし)。
   */
  readonly transitionIndex: number;

  /**
   * 表示文字列。 以下 3 種のいずれか:
   *   - "→ 移動"          (= variant === "unresolved")
   *   - "移動"             (= variant === "sensitive")
   *   - "移動 約 N 分"     (= variant === "duration_only"、 N は 1 以上の整数)
   */
  readonly displayText: string;

  /**
   * K-3c-iii 階層 ID — 常に `"tier_2_movement"` 固定。
   */
  readonly tier: MovementDisplayTier;

  /**
   * Display variant (= caller のレンダラが描き分け可能)。
   */
  readonly variant: MovementDisplayVariant;

  /**
   * Confidence band (= UI tone hint)。 unresolved / sensitive では undefined。
   * duration_only でのみ存在。
   */
  readonly confidenceBand?: MovementDisplayConfidenceBand;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MovementDisplayResult (= top-level、 集計付き)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Bulk formatter の出力。
 *
 * - displaysByTransitionKey: L-3c overlay と同 key 形式 (= `transition_${index}`) の map
 * - variantCounts:           集計 (= 3 variant 別 count、 caller の UI summary 用素材)
 */
export interface MovementDisplayResult {
  readonly displaysByTransitionKey: ReadonlyMap<string, MovementDisplayView>;
  readonly variantCounts: {
    readonly unresolved: number;
    readonly sensitive: number;
    readonly duration_only: number;
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * estimatedDurationMin を表示用に丸める。
 *   - Math.round + Math.max(1, ...) で「0 分」 を回避
 *   - finite / non-negative の前提 (= L-1 integrity contract で保証)、 防御として finite check
 */
function roundDurationForDisplay(min: number): number {
  if (!Number.isFinite(min) || min < 0) return 1; // 防御 (= L-1 でガード済だが)
  const rounded = Math.round(min);
  return Math.max(1, rounded);
}

/**
 * confidence level → display band の mapping。
 *   - "low" → "soft"
 *   - 他 (= medium / high / very_high) → "strong"
 */
function confidenceBandFromLevel(
  level: "low" | "medium" | "high" | "very_high",
): MovementDisplayConfidenceBand {
  return level === "low" ? "soft" : "strong";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public: formatOverlaySegmentForDisplay (= 単一 segment → display view)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 単一 OverlaySegmentView を MovementDisplayView に変換する pure function。
 *
 * 規則 (= readiness audit §2.2):
 *   - unresolved → variant "unresolved" + "→ 移動"
 *   - resolved + privacyClass ∈ {sensitive_both, sensitive_adjacent, location_unknown} → variant "sensitive" + "移動"
 *     (= cascade では sensitive 系は unresolved に倒すが、 caller が直接 overlay を使った場合の二重防御)
 *   - resolved + privacyClass === "normal" → variant "duration_only" + "移動 約 N 分"
 *
 * 副作用なし、 input を mutate しない。 同一 input → 同一 output (= deterministic)。
 */
export function formatOverlaySegmentForDisplay(
  segment: OverlaySegmentView,
): MovementDisplayView {
  // (1) Unresolved branch
  if (segment.timingStatus === "unresolved") {
    return {
      transitionIndex: segment.transitionIndex,
      displayText: "→ 移動",
      tier: "tier_2_movement",
      variant: "unresolved",
    };
  }

  // (2) Resolved + sensitive 防御 branch
  // 注: cascade は sensitive_adjacent / sensitive_both / location_unknown を必ず unresolved に倒すため、
  //      ここに到達するのは「caller が overlay を bypass して直接 segment を構築した場合」 のみ。
  //      二重防御として残す。
  if (
    segment.privacyClass === "sensitive_both" ||
    segment.privacyClass === "sensitive_adjacent" ||
    segment.privacyClass === "location_unknown"
  ) {
    return {
      transitionIndex: segment.transitionIndex,
      displayText: "移動",
      tier: "tier_2_movement",
      variant: "sensitive",
    };
  }

  // (3) Resolved + normal branch (= 唯一の意味的拡張 path)
  const minutes = roundDurationForDisplay(segment.estimatedDurationMin);
  return {
    transitionIndex: segment.transitionIndex,
    displayText: `移動 約 ${minutes} 分`,
    tier: "tier_2_movement",
    variant: "duration_only",
    confidenceBand: confidenceBandFromLevel(segment.confidence.level),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public: formatOverlayResultForDisplay (= bulk、 OverlayResult → display result)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * OverlayResult 全体を MovementDisplayResult に変換する pure function。
 *
 * 規則:
 *   - `outcome.ok === true` な entry のみ display view を生成
 *   - `outcome.ok === false` (= internal_error) は **skip** (= 表示しない、 K view fallback に任せる)
 *   - segmentsByTransitionKey の key (= `transition_${index}`) は displaysByTransitionKey でも同 key
 *
 * 副作用なし、 input mutation 0。
 */
export function formatOverlayResultForDisplay(
  result: OverlayResult,
): MovementDisplayResult {
  const displaysByTransitionKey = new Map<string, MovementDisplayView>();
  let unresolved = 0;
  let sensitive = 0;
  let durationOnly = 0;

  for (const [key, outcome] of result.segmentsByTransitionKey.entries()) {
    if (!outcome.ok) {
      continue; // internal_error は表示しない
    }
    const view = formatOverlaySegmentForDisplay(outcome.segment);
    displaysByTransitionKey.set(key, view);

    if (view.variant === "unresolved") unresolved++;
    else if (view.variant === "sensitive") sensitive++;
    else durationOnly++;
  }

  return {
    displaysByTransitionKey,
    variantCounts: {
      unresolved,
      sensitive,
      duration_only: durationOnly,
    },
  };
}
