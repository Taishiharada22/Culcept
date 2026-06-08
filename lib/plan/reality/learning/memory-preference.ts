/**
 * Reality Control OS — R1-6 Preference Memory（**pure・no-DB**・barrel 非 export）
 *
 * 設計: docs/reality-secretary-os-unbuilt-roadmap.md（R1-6）/ memory-model.ts（R1-1）/ CEO 補正
 *
 * 役割: M3 tendency / correction / 反復 signal から **context-bound な tentative preference** を導く pure 層。
 *   CEO 補正厳守:
 *   - **trait / fixed preference として断定しない**（「あなたは〜が好き」「いつも〜」を作らない）。
 *   - **liked / disliked を断定しない**（好き/嫌い/苦手 を使わない）。
 *   - **context-bound**（global な性格でなく「この文脈での寄り」）。
 *   - PRM データは行動シグナル（adopt/dismiss/defer）であり**価値ではない** → 価値を claim せず「行動の寄り」に留める。
 *
 * 厳守: 断定しない・liked/disliked 語を出さない・certainty ≤tentative・strength は最大 "leaning"（"fixed" を作らない）・
 *   rejected は preference にしない（本人が否定した寄りを好みにしない）・pure。
 */

import type { SecondSelfTendency } from "./prm-model-entry-read";
import { buildMemoryItem, memoryContextPhrase, type MemoryItem } from "./memory-model";

/** 行動の寄り（**価値でなく**・direction を preference 文脈に写す）。 */
export type PreferenceLeaning = "toward_adopting" | "toward_declining" | "toward_deferring";

/** 寄りの強さ（**最大 "leaning"**・"fixed"/"strong" を作らない＝trait 化しない）。 */
export type PreferenceStrength = "faint" | "leaning";

/** "leaning" と見なす最小の反復（それ未満は faint）。 */
export const LEANING_MIN_EVIDENCE = 4;

const LEANING_OF: Record<string, PreferenceLeaning> = {
  adoption: "toward_adopting",
  non_adoption: "toward_declining",
  deferral: "toward_deferring",
};
const LEANING_PHRASE: Record<PreferenceLeaning, string> = {
  toward_adopting: "取り入れる方に寄せる",
  toward_declining: "見送る方に寄せる",
  toward_deferring: "後回しにする余地を残す",
};

/** 反復から寄りの強さ（**最大 leaning**・断定しない）。 */
export function preferenceStrength(evidenceCount: number): PreferenceStrength {
  return evidenceCount >= LEANING_MIN_EVIDENCE ? "leaning" : "faint";
}

/**
 * R1-6: tendency → context-bound tentative preference MemoryItem（null=該当外）。
 *   rejected は preference にしない。observation は「寄せる様子がうかがえるかもしれない」に抑制（好き/嫌い断定なし・trait なし）。
 *   certainty: leaning かつ tendency tentative のときのみ tentative、それ以外 low（preference は推論ゆえ保守的）。
 */
export function tendencyToPreferenceMemory(t: SecondSelfTendency, opts: { confirmed?: boolean } = {}): MemoryItem | null {
  if (t.userCorrection === "rejected") return null; // 本人が否定した寄りは好みにしない
  const leaning = LEANING_OF[t.tendencyDirection];
  if (!leaning) return null;
  const strength = preferenceStrength(t.evidenceCount);
  const ctx = memoryContextPhrase(t.contextDimension, t.contextValue);
  const note = opts.confirmed ? "（本人が確認した寄り）" : strength === "leaning" ? "（反復のある寄り）" : "（弱い寄り）";
  return buildMemoryItem({
    kind: "preference",
    // **価値でなく行動の寄り**・context-bound・hedged。好き/嫌い を使わない。
    observation: `${ctx}では、${LEANING_PHRASE[leaning]}様子がうかがえるかもしれない${note}`,
    context: { dimension: t.contextDimension, value: t.contextValue },
    evidenceCount: t.evidenceCount,
    counterCount: t.counterCount,
    certainty: strength === "leaning" ? t.certainty : "low", // 保守的・≤tentative
    userConfirmed: opts.confirmed ?? false,
    userCorrection: t.userCorrection,
    leaning, // PreferenceLeaning ⊆ MemoryLeaning（同一 union）
    source: "prm_model_entry",
  });
}

/** 全 direction を context-bound preference 化（rejected skip）。confirmedKeys 命中で confirmed 注記。 */
export function tendenciesToPreferenceMemory(
  tendencies: readonly SecondSelfTendency[],
  confirmedKeys: ReadonlySet<string> = new Set(),
): readonly MemoryItem[] {
  const out: MemoryItem[] = [];
  for (const t of tendencies) {
    const m = tendencyToPreferenceMemory(t, { confirmed: confirmedKeys.has(`${t.contextDimension}:${t.contextValue}`) });
    if (m) out.push(m);
  }
  return out;
}
