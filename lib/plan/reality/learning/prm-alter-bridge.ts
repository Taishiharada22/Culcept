/**
 * Reality Control OS — A1-7-36 PRM ⇄ Alter Bridge（**pure・no-DB・barrel 非 export**）
 *
 * 設計: docs/prm-alter-bridge-design.md（A1-7-36）
 *
 * 役割: M3 review 済 tendency（`SecondSelfTendency`）を Home Alter の判断に「**内部参照のみ**」hint として渡すための
 *   pure 変換。route は (a) 現在の判断文脈を `PrmBridgeContext` に詰め (b) `resolvePrmContext` で一致する tendency だけ選び
 *   (c) `buildPrmTendencyBlock` で非断定 block を作り homeSystemPrompt に append する（flag default OFF）。
 *
 * 厳守（哲学・声の制約・過断定防止）:
 *   - **relevance は fail-closed**: band を導けねば注入しない（誤マッチより沈黙）。
 *   - **tendency-not-trait**: 文脈束縛のまま（「夜の予定では見送りやすい」≠「怠惰」）。
 *   - **断定しない / 確信を上げない**: certainty は構造的に ≤tentative。block は「確信を上げない」を明記。
 *   - **counter / 訂正 を併記**: counterCount と user_correction を hint に同梱（過断定防止を Alter にも見せる）。
 *   - **現在発話 > 過去 tendency**: block は「今この人の発話を最優先」を明記。
 *   - **verbatim 禁止**: 「そのまま引用しない」を block に明記。pure・Date.now なし（band は route が渡す）。
 */

import type { SecondSelfTendency } from "./prm-model-entry-read";

/** 判断の時間帯（M3 band dimension の contextValue と一致）。 */
export type DecisionBand = "morning" | "afternoon" | "evening" | "none";

/** 現在の判断文脈（v1 は band のみ。durationBucket/confidence/source は chat から導けないため未使用）。 */
export interface PrmBridgeContext {
  readonly band?: DecisionBand;
}

/** relevance gating の保守パラメータ。 */
export interface PrmBridgeConfig {
  /** 証拠の最小数（E_MIN・薄い tendency を注入しない）。 */
  readonly minEvidence: number;
  /** 注入する最大件数（K・判断を tendency で埋めない）。 */
  readonly maxTendencies: number;
}
export const DEFAULT_PRM_BRIDGE_CONFIG: PrmBridgeConfig = { minEvidence: 4, maxTendencies: 2 };

/** 現在時刻(hour 0-23) → band。深夜は none（＝注入しない・fail-closed）。 */
export function bandFromHour(hour: number): DecisionBand {
  if (!Number.isFinite(hour)) return "none";
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 23) return "evening";
  return "none";
}

/**
 * A1-7-36: 現在文脈に一致する tendency だけ選ぶ（**fail-closed**）。
 *   band 不明/none → []（注入しない）。band 一致 ∧ rejected でない ∧ evidence≥E_MIN ∧ counter 非支配 のみ。evidence 上位 K。
 */
export function resolvePrmContext(
  tendencies: readonly SecondSelfTendency[],
  context: PrmBridgeContext,
  config: PrmBridgeConfig = DEFAULT_PRM_BRIDGE_CONFIG,
): readonly SecondSelfTendency[] {
  if (!context.band || context.band === "none") return []; // relevance を導けない→沈黙
  const matched = tendencies.filter(
    (t) =>
      t.contextDimension === "band" &&
      t.contextValue === context.band && // 現在 band に一致
      t.userCorrection !== "rejected" && // 本人が否定したものは出さない
      t.evidenceCount >= config.minEvidence && // 証拠の厚み
      t.counterCount < t.evidenceCount, // counter が支配的でない
  );
  return [...matched]
    .sort((a, b) => b.evidenceCount - a.evidenceCount) // 証拠の厚い順
    .slice(0, Math.max(0, config.maxTendencies));
}

const TENDENCY_VERB: Record<string, string> = { adoption: "取り入れ", non_adoption: "見送り", deferral: "後回しにし" };
const BAND_PHRASE: Record<string, string> = { morning: "朝の予定", afternoon: "午後の予定", evening: "夜の予定" };

/**
 * A1-7-36: relevant tendency → **非断定「内部参照のみ」block**（無ければ null）。
 *   counter/訂正を併記・現在発話優先・確信を上げない・verbatim 禁止 を block に明記。
 */
export function buildPrmTendencyBlock(relevant: readonly SecondSelfTendency[]): string | null {
  if (relevant.length === 0) return null;
  const lines = relevant.map((t) => {
    const phrase = BAND_PHRASE[t.contextValue] ?? "この時間帯";
    const verb = TENDENCY_VERB[t.tendencyDirection] ?? "動き";
    const counter = t.counterCount > 0 ? `（ただし反証 ${t.counterCount} 件・決めつけない）` : "（手がかりは少なめ）";
    const adj =
      t.userCorrection === "direction_adjusted"
        ? "（本人が向きを調整した観測）"
        : t.userCorrection === "context_refined"
          ? "（本人が文脈を補った観測）"
          : "";
    return `- ${phrase}では これまで「${verb}やすい」傾向が見えている${counter}${adj}`;
  });
  return `# 本人の傾向（内部参照のみ・断定しない・そのまま引用しない）\n${lines.join("\n")}\n別の見方も残っている。今この人が言っていることを最優先し、この傾向で確信を上げないこと。`;
}
