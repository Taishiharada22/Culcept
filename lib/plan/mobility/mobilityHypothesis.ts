// lib/plan/mobility/mobilityHypothesis.ts
//
// v0-A: pure hypothesis builder（第二の自己マップ）
// belief + 決定時 context → mobility 仮説（★断定でなく仮説・「今日の文脈ではこう見ています」）。
//
// 純粋関数。IO / Date.now / localStorage / API / DB なし。production 未配線（additive・挙動変更ゼロ）。
//
// 禁則（research 反証 + CEO 既定・本 module で守る）:
//   - ❌ weather から直接 mode を決めない（「天候が mode を変える」一般法則は research 0-3 反証）
//        → weather は contextNote（注意）に留め、todayLikelyMode は belief 由来のみ
//   - ❌ `transit` を使わない（RouteTransportMode 9 語が canonical。transit は transport 層の抽象語）
//   - ❌ 偽の確率(%)を表示用に出さない（habitualStrength は定性・signalStrength は内部 gate 用の量）
//   - ❌ 人格診断・固定ラベルにしない（leg 単位「今日の文脈」仮説。trait でない）
//   - ❌ 距離 → mode 推定しない（入力は belief = 観測のみ）

import type { RouteTransportMode } from "@/lib/plan/map/routeMode";

/**
 * 屋外露出 mode（悪天候の負担が意味を持つ手段）。
 * ★weather で mode を変えるためではなく、contextNote（注意）の「関連性」判定にのみ使う。
 */
const OUTDOOR_EXPOSED_MODES: ReadonlySet<RouteTransportMode> = new Set<RouteTransportMode>([
  "walk",
  "bicycle",
]);

/**
 * leg ごとの mode 選好 belief。
 * S1-A の persisted selectedModeByLeg 履歴から算出される（v0-A は入力として受ける・実供給は v0-F）。
 * counts は precision 重み付き観測量（selected=低精度 / override=高精度）。観測ゼロの mode は欠落。
 */
export interface ModeBelief {
  readonly legKey: string;
  readonly counts: Partial<Record<RouteTransportMode, number>>;
  /** 重み付き総観測量 */
  readonly total: number;
  /** modal（最頻）mode。観測ゼロなら null */
  readonly topMode: RouteTransportMode | null;
  /** top の占有率 [0,1] */
  readonly topShare: number;
}

/**
 * 決定時 context。prior を汚さない・保存しない（research#1: context = posterior modifier）。
 * v0 は weather のみ軽く扱う。baggage/fatigue/urgency は v0 に入れない（L5/後続・観測プロキシ未確定）。
 */
export interface DecisionContext {
  readonly weather?: "rain" | "heat" | "normal" | null;
}

/** habitual の強さ（定性・偽の % を出さない） */
export type HabitualStrength = "none" | "weak" | "moderate" | "strong";

/**
 * context 由来の「気づきメモ」。★手段変更の示唆ではなく、habitual 手段の今日の負担への注意。
 * habitual が屋外露出かつ悪天候の時のみ生成（それ以外は null）。
 */
export interface ContextNote {
  readonly kind: "outdoor_burden";
  readonly reason: "rain" | "heat";
  /** 注意の対象 mode（= habitualMode・屋外露出時のみ） */
  readonly aboutMode: RouteTransportMode;
}

/** mobility 仮説（断定でない） */
export interface MobilityHypothesis {
  readonly legKey: string;
  /** 「いつもは X」。観測ゼロなら null */
  readonly habitualMode: RouteTransportMode | null;
  readonly habitualStrength: HabitualStrength;
  /** context 気づき（条件付き・null なら無し）。★手段は変えない */
  readonly contextNote: ContextNote | null;
  /**
   * 「今日のあなたなら Y」。
   * ★v0-A では belief 由来のみ（= habitualMode）。weather では変えない。
   * （L5 で本人の selected/override 履歴に基づき初めて文脈で傾ける。field は前方互換のため残す）
   */
  readonly todayLikelyMode: RouteTransportMode | null;
  /** 訂正候補（観測済みの他 mode） */
  readonly alternatives: readonly RouteTransportMode[];
  /**
   * surface 判断材料 [0,1]。観測量ベースの saturating 量。
   * ★表示用の偽確率ではなく、v0-B（necessity gate）が沈黙/表示を決めるための内部量。
   */
  readonly signalStrength: number;
}

/**
 * habitualStrength を topShare（一貫性）× total（観測量）から定性化。
 * 閾値は暫定（open question: 最小観測数の Phase-1 実測キャリブレーションで調整）。保守的に開始。
 */
function deriveHabitualStrength(topShare: number, total: number): HabitualStrength {
  if (total <= 0) return "none";
  if (total >= 5 && topShare >= 0.7) return "strong";
  if (total >= 3 && topShare >= 0.5) return "moderate";
  if (total >= 1) return "weak";
  return "none";
}

/**
 * signalStrength: 観測量ベースの saturating [0,1]（total/(total+1)）。
 * 1→0.5, 3→0.75, 5→~0.83。表示用の確率でなく、v0-B の gate 用の量。
 */
function deriveSignalStrength(total: number): number {
  if (total <= 0) return 0;
  return total / (total + 1);
}

/**
 * v0-A: belief + context → 仮説（純粋）。
 *
 * ★核となる guardrail:
 *   - weather は mode を決めない。habitual が屋外露出かつ悪天候の時だけ contextNote（注意）を付す。
 *   - todayLikelyMode は belief 由来のみ（weather で未観測 mode を新規提案しない）。
 *   - 空 belief は graceful（habitual=null・signal=0 → 後段 gate が沈黙）。
 */
export function buildMobilityHypothesis(
  belief: ModeBelief,
  context: DecisionContext,
): MobilityHypothesis {
  const habitualMode = belief.topMode;
  const habitualStrength = deriveHabitualStrength(belief.topShare, belief.total);

  // alternatives: 観測済み（count>0）の top 以外の mode
  const alternatives = (Object.keys(belief.counts) as RouteTransportMode[]).filter(
    (m) => m !== habitualMode && (belief.counts[m] ?? 0) > 0,
  );

  // contextNote: ★weather で mode を変えない。habitual が屋外露出かつ悪天候の時のみ「注意」。
  let contextNote: ContextNote | null = null;
  const w = context.weather;
  if (
    habitualMode !== null &&
    OUTDOOR_EXPOSED_MODES.has(habitualMode) &&
    (w === "rain" || w === "heat")
  ) {
    contextNote = { kind: "outdoor_burden", reason: w, aboutMode: habitualMode };
  }

  return {
    legKey: belief.legKey,
    habitualMode,
    habitualStrength,
    contextNote,
    // ★belief のみ。weather は変えない（最重要 guardrail）
    todayLikelyMode: habitualMode,
    alternatives,
    signalStrength: deriveSignalStrength(belief.total),
  };
}
