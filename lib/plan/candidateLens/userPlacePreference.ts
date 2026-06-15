/**
 * lib/plan/candidateLens/userPlacePreference.ts
 *   — Purpose-Adaptive Candidate Lens / Phase 1: ユーザー嗜好の **future input interface のみ**（pure）
 *
 * ★CEO/GPT 2026-06-15: Phase 1 では **実保存・DB write・migration・実学習・観測 write を一切しない**。
 *   将来（Phase 3+ 別 GO）の preference memory を「受け取れる interface / pure resolver / fake-data test」までに限定。
 *   ここは **型と pure な適用ロジックのみ**（localStorage/store/Date/network なし）。
 *
 * ★思想: 学習が入れば「このユーザーは静かを好む / 会議前は余白重視 / 駅近優先 / 前回ここを好んだ」を
 *   目的別の優先属性として持ち、比較行の順序・強調をユーザー別に変える。Phase 1 はその入力穴だけ用意する。
 */
import type { AttributeKey } from "@/lib/plan/candidateLens/placeAttributeModel";
import type { PurposeLens } from "@/lib/plan/candidateLens/purposeLens";

/**
 * ユーザーの場所選び嗜好（★future input・Phase 1 では呼び側が fake/empty を渡す）。
 * - prioritizedAttributes: 目的横断で優先する属性（順序＝強さ）。
 * - perLens: 目的レンズごとの優先属性（より具体的・perLens が prioritizedAttributes より優先）。
 */
export interface UserPlacePreference {
  readonly prioritizedAttributes?: readonly AttributeKey[];
  readonly perLens?: Partial<Record<PurposeLens, readonly AttributeKey[]>>;
}

/** 嗜好が空か（Phase 1 default・嗜好なし＝中立）。 */
export const EMPTY_USER_PLACE_PREFERENCE: UserPlacePreference = {};

/**
 * ★lens の既定軸順に、嗜好で指定された属性を**前方へ寄せる**（pure・安定・捏造なし）。
 *   嗜好なし → axes をそのまま返す（中立）。perLens[lens] があればそれを、無ければ prioritizedAttributes を使う。
 *   ★既定軸に無い属性は追加しない（lens が出さない属性を嗜好で勝手に増やさない＝目的整合を保つ）。
 */
export function applyPreferenceToAxes(
  axes: readonly AttributeKey[],
  lens: PurposeLens,
  preference: UserPlacePreference = EMPTY_USER_PLACE_PREFERENCE,
): readonly AttributeKey[] {
  const pref = preference.perLens?.[lens] ?? preference.prioritizedAttributes;
  if (!pref || pref.length === 0) return axes;
  const inAxes = new Set(axes);
  const front = pref.filter((k) => inAxes.has(k)); // 既定軸にある優先属性のみ前方へ
  const frontSet = new Set(front);
  const rest = axes.filter((k) => !frontSet.has(k));
  return [...front, ...rest];
}
