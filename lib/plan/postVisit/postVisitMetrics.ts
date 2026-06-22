/**
 * lib/plan/postVisit/postVisitMetrics.ts
 *   — 評価OS / Stage 0-C: dogfood 計測の pure helper（docs `postvisit-stage0c-...md` 参照）
 *
 * ★目的: post-visit 答え合わせ器官が「本当に使われるか」を測り、Fit-Arc(Stage 1) へ進む entry criteria を判定する。
 *   主指標 = **post-decision-observation rate**（決定後に prompt を見て、実際に観測を残した割合）。
 * ★pure: Date/network/DB なし。入力は localStorage の funnel ログ + 観測（local-only・PII なし・集計のみ）。
 * ★ここは UI でない。ranking/推薦/Fit-Arc を一切描画しない（計測のみ）。
 */
import { PERSISTED_OBSERVATION_KEYS, type PostVisitObservation, type SuppressReason } from "./postVisitObservation";
import type { ElicitEvent } from "./postVisitStore";

const SUPPRESS_REASONS: readonly SuppressReason[] = ["sensitive", "home_work", "habitual", "high_fatigue", "after_skip", "recent_same"];
const WHITELIST: ReadonlySet<string> = new Set<string>(PERSISTED_OBSERVATION_KEYS);
/** opaque placeKey の許容形（cyrb53 由来 "p..." / "p_unknown"）。これ以外＝PII 漏れ疑い。 */
const OPAQUE_KEY_RE = /^(p_unknown|p[0-9a-z]+)$/;

export interface DogfoodMetrics {
  readonly promptShown: number;
  readonly answered: number;
  readonly skipped: number;
  readonly suppressed: number;
  readonly mirrorShown: number;
  readonly observations: number;
  /** ★主指標: answered / promptShown（決定後の観測獲得率）。0..1・分母0なら0。 */
  readonly postDecisionObservationRate: number;
  /** answered / promptShown（主指標と同義・明示用）。 */
  readonly answerRate: number;
  /** skipped / promptShown。 */
  readonly skipRate: number;
  /** suppressed / (suppressed + promptShown)（trigger 適格機会のうち抑止された割合・「効きすぎ」検知）。 */
  readonly suppressRate: number;
  readonly suppressByReason: Record<SuppressReason, number>;
  /** ★must be 0。観測に禁止情報（非 whitelist キー / 非 opaque placeKey）が混入していないか。 */
  readonly redactionViolations: number;
}

function rate(num: number, den: number): number {
  return den > 0 ? num / den : 0;
}

/**
 * 観測の redaction 違反数（pure）。
 *   - 非 whitelist キーを1つでも持つ観測、または placeKey が opaque 形でない観測 = 違反。
 *   - 正常な store 出力は sanitize 済みで常に 0。dirty を渡せば検出（契約テスト用）。
 */
export function countRedactionViolations(observations: readonly PostVisitObservation[]): number {
  let n = 0;
  for (const o of observations) {
    if (o == null || typeof o !== "object") { n++; continue; }
    const keys = Object.keys(o as unknown as Record<string, unknown>);
    const extraKey = keys.some((k) => !WHITELIST.has(k));
    const badPlaceKey = typeof o.placeKey !== "string" || !OPAQUE_KEY_RE.test(o.placeKey);
    if (extraKey || badPlaceKey) n++;
  }
  return n;
}

/** funnel ログ + 観測 → dogfood 指標（pure・集計のみ）。 */
export function computeDogfoodMetrics(
  log: readonly ElicitEvent[],
  observations: readonly PostVisitObservation[],
): DogfoodMetrics {
  const count = (outcome: ElicitEvent["outcome"]) => log.filter((e) => e.outcome === outcome).length;
  const promptShown = count("shown");
  const answered = count("answered");
  const skipped = count("skipped");
  const suppressed = count("suppressed");
  const mirrorShown = count("mirror_shown");

  const suppressByReason = SUPPRESS_REASONS.reduce((acc, r) => {
    acc[r] = log.filter((e) => e.outcome === "suppressed" && e.suppressReason === r).length;
    return acc;
  }, {} as Record<SuppressReason, number>);

  const answerRate = rate(answered, promptShown);
  return {
    promptShown,
    answered,
    skipped,
    suppressed,
    mirrorShown,
    observations: observations.length,
    postDecisionObservationRate: answerRate,
    answerRate,
    skipRate: rate(skipped, promptShown),
    suppressRate: rate(suppressed, suppressed + promptShown),
    suppressByReason,
    redactionViolations: countRedactionViolations(observations),
  };
}

// ── Fit-Arc(Stage 1) entry criteria ──
export interface FitArcEntryThresholds {
  readonly minPromptShown: number;   // dogfood で一定数の prompt 表示
  readonly minAnswered: number;      // 回答が数件溜まる
  readonly minAnswerRate: number;    // prompt が邪魔でない proxy（回答率が一定以上）
  readonly maxSuppressRate: number;  // suppress が効きすぎていない（出る機会が枯れていない）
  readonly minMirrorShown: number;   // 観測の鏡が出ている
}
export const FIT_ARC_ENTRY_DEFAULT: FitArcEntryThresholds = {
  minPromptShown: 20,
  minAnswered: 5,
  minAnswerRate: 0.3,
  maxSuppressRate: 0.7,
  minMirrorShown: 1,
};

export interface FitArcEntryDecision {
  /** ★定量条件をすべて満たすか（redaction 違反0 含む）。true でも下記 qualitative は人判断で別途必要。 */
  readonly quantitativeReady: boolean;
  /** 未達の定量条件（人が読める文）。 */
  readonly unmet: readonly string[];
  /** 計測不能で CEO/人の判断が要る定性条件（常に提示）。 */
  readonly qualitativeChecks: readonly string[];
}

/**
 * Fit-Arc へ進んでよいかの判定（pure）。
 *   - 定量条件（件数/率/違反0）は metrics から自動評価。
 *   - 定性条件（邪魔でないか・鏡が自然か・答えてもいいと感じるか）は計測不能 → 常に人判断として返す。
 */
export function evaluateFitArcEntry(
  m: DogfoodMetrics,
  thresholds: FitArcEntryThresholds = FIT_ARC_ENTRY_DEFAULT,
): FitArcEntryDecision {
  const unmet: string[] = [];
  if (m.redactionViolations !== 0) unmet.push(`redaction 違反 ${m.redactionViolations} 件（0 必須）`);
  if (m.promptShown < thresholds.minPromptShown) unmet.push(`prompt 表示 ${m.promptShown} < ${thresholds.minPromptShown}`);
  if (m.answered < thresholds.minAnswered) unmet.push(`回答 ${m.answered} < ${thresholds.minAnswered}`);
  if (m.answerRate < thresholds.minAnswerRate) unmet.push(`回答率 ${(m.answerRate * 100).toFixed(0)}% < ${(thresholds.minAnswerRate * 100).toFixed(0)}%（邪魔の疑い）`);
  if (m.suppressRate > thresholds.maxSuppressRate) unmet.push(`suppress 率 ${(m.suppressRate * 100).toFixed(0)}% > ${(thresholds.maxSuppressRate * 100).toFixed(0)}%（効きすぎ）`);
  if (m.mirrorShown < thresholds.minMirrorShown) unmet.push(`観測の鏡 ${m.mirrorShown} < ${thresholds.minMirrorShown}`);
  return {
    quantitativeReady: unmet.length === 0,
    unmet,
    qualitativeChecks: [
      "prompt が邪魔だという強い違和感がない（人判断）",
      "観測の鏡が仮説トーンで自然に見える（人判断）",
      "ユーザーが「これなら答えてもいい」と感じる（人判断）",
    ],
  };
}
