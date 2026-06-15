/**
 * lib/plan/candidateLens/candidateLensUi.ts
 *   — Purpose-Adaptive Candidate Lens / Phase 2: UI 用 view-model + flag（pure helper）
 *
 * ★Phase 1 の pure resolver を消費して 3 画面 UI 用の view-model を作る。flag default OFF / dev-only。
 * ★CEO 補正(2026-06-15): 未確認(D)は主比較表に「—」で並べず除外し名前だけ補助表示・写真は外部 API なしゆえ出さない・
 *   evidenceType を UI に活かす・B は「約/目安」（distanceMeters=haversine 直線ゆえ）。捏造しない。
 */
import {
  buildPlaceAttributes,
  ATTRIBUTE_LABEL,
  type CandidateInput,
  type AttributeKey,
  type PlaceAttribute,
  type PlaceAttributeContext,
} from "@/lib/plan/candidateLens/placeAttributeModel";
import { classifyPurposeLens, type PurposeLens } from "@/lib/plan/candidateLens/purposeLens";
import { classifyActivityIconKey } from "@/lib/plan/compose/activityIcon";
import {
  buildLensComparison,
  recommendationBasisPhrase,
  type ComparisonRow,
} from "@/lib/plan/candidateLens/candidateLensResolver";
import type { UserPlacePreference } from "@/lib/plan/candidateLens/userPlacePreference";

/** ★候補レンズ UI flag（default OFF・dev-only・production hard block）。既存候補パネルは flag OFF で不変。 */
export const PLACE_CANDIDATE_LENS_UI_ENABLED = false;
export function isCandidateLensUiEnabled(): boolean {
  return PLACE_CANDIDATE_LENS_UI_ENABLED && process.env.NODE_ENV !== "production"; // ★production hard block
}

/** 候補（placeId 付き・UI key 用）。 */
export interface LensCandidate extends CandidateInput {
  readonly placeId: string;
}

/** ① card / ② detail 用の単一候補 view（pure・実値のみ・捏造しない）。 */
export interface LensCandidateView {
  readonly placeId: string;
  readonly name: string;
  readonly address: string | null;
  readonly category: string | null;
  readonly lens: PurposeLens;
  /** 相性バッジ（観測由来 reason がある時のみ・無ければ null）。 */
  readonly affinityBadge: string | null;
  /** 「なぜここを選ぶ？」hedged・実値のみ（無ければ null）。 */
  readonly whyLine: string | null;
  /** ① card の主役チップ（実値のある軸のみ・徒歩/予定接続/余白…）。 */
  readonly primaryChips: ReadonlyArray<{ readonly key: AttributeKey; readonly label: string; readonly value: string }>;
  /** 内部保持: 属性束（② や ③ で使う）。 */
  readonly attrs: Record<AttributeKey, PlaceAttribute>;
}

/** lens ごとに ① card の主役チップに出す軸（実値があるものだけ採用）。 */
const CARD_CHIP_KEYS: Record<PurposeLens, readonly AttributeKey[]> = {
  meeting_prep: ["walk_estimate", "schedule_fit", "margin_impact"],
  focus_work: ["walk_estimate", "category"],
  conversation: ["walk_estimate", "margin_impact"],
  errand: ["walk_estimate", "schedule_fit"],
  generic: ["walk_estimate", "category"],
};

/** purpose lens を予定から導く（title→activityKey→lens）。 */
export function purposeLensFromSchedule(title: string): PurposeLens {
  return classifyPurposeLens({ activityKey: classifyActivityIconKey(title), title });
}

/** 「なぜここを選ぶ？」を実値のみで hedged に組む（pure・捏造しない・無ければ null）。 */
function whyChooseLine(attrs: Record<AttributeKey, PlaceAttribute>, lens: PurposeLens, hasAffinity: boolean): string | null {
  const walk = attrs.walk_estimate.value; // 例: 約7分（目安）
  const lensFrame: Record<PurposeLens, string> = {
    meeting_prep: "会議前に余白を持ちやすそうです",
    focus_work: "立ち寄りやすい場所です",
    conversation: "会って話す前後に動きやすそうです",
    errand: "ついでに寄りやすい場所です",
    generic: "向かいやすい場所です",
  };
  const affixAffinity = hasAffinity ? "（よく行く場所です）" : "";
  if (walk) return `徒歩${walk}で、${lensFrame[lens]}${affixAffinity}`;
  if (hasAffinity) return `よく行く場所です。${lensFrame[lens]}`;
  return null;
}

export interface LensViewContext extends PlaceAttributeContext {
  /** 候補の観測 reason（Place Affinity 由来・per candidate）。 */
  readonly affinityReason?: string | null;
}

/** 候補 → view（pure）。affinity は ctx.affinityReason 由来のみ（捏造しない）。 */
export function buildLensCandidateView(candidate: LensCandidate, lens: PurposeLens, ctx: LensViewContext = {}): LensCandidateView {
  const attrs = buildPlaceAttributes(candidate, ctx);
  const hasAffinity = !!(ctx.affinityReason && ctx.affinityReason.trim().length > 0);
  const chips = CARD_CHIP_KEYS[lens]
    .map((key) => ({ key, label: ATTRIBUTE_LABEL[key], value: attrs[key].value }))
    .filter((c): c is { key: AttributeKey; label: string; value: string } => c.value != null);
  return {
    placeId: candidate.placeId,
    name: candidate.name,
    address: attrs.address.value,
    category: attrs.category.value,
    lens,
    affinityBadge: hasAffinity ? "相性" : null,
    whyLine: whyChooseLine(attrs, lens, hasAffinity),
    primaryChips: chips,
    attrs,
  };
}

/** ③ 比較 view。主表は確認済み(値あり)行のみ・未確認は名前だけ補助に。 */
export interface LensComparisonView {
  readonly lens: PurposeLens;
  /** 主比較表に出す行（両側 null は除外＝「—」を並べない）。 */
  readonly mainRows: readonly ComparisonRow[];
  /** この目的で関わるが未確認の項目名（補助の小さな注記用・値は出さない）。 */
  readonly unconfirmedLabels: readonly string[];
  /** 推薦サマリー（どちら側・根拠句）。甲乙つけがたければ null。 */
  readonly recommendation: { readonly side: "left" | "right"; readonly basisPhrase: string } | null;
}

/** 左右 view → 比較 view（pure・未確認は主表から除外し名前だけ拾う・捏造しない）。 */
export function buildLensComparisonView(
  lens: PurposeLens,
  left: LensCandidateView,
  right: LensCandidateView,
  preference?: UserPlacePreference,
): LensComparisonView {
  // showUnconfirmed=true で全軸を取り、表示用に main(値あり) と unconfirmed(値なし) に振り分ける。
  const full = buildLensComparison({ lens, leftAttrs: left.attrs, rightAttrs: right.attrs, preference, showUnconfirmed: true });
  const mainRows = full.rows.filter((r) => !r.unconfirmed);
  // ★補助注記は「本当に未確認(C弱推定/D未確認)」のみ。文脈不足で未計算の B(computed・例: gap 無しの予定接続/余白)は
  //   「確認できていない」ではなく「今は計算する文脈がない」ので静かに drop（誤解を招く注記を出さない）。
  const unconfirmedLabels = full.rows.filter((r) => r.unconfirmed && r.evidenceType !== "computed").map((r) => r.label);
  const phrase = recommendationBasisPhrase(full);
  return {
    lens,
    mainRows,
    unconfirmedLabels,
    recommendation: full.recommendation && phrase ? { side: full.recommendation.side, basisPhrase: phrase } : null,
  };
}
