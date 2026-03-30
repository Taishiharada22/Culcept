// lib/stargazer/contradictionMap.ts
// 矛盾地図 (Contradiction Map) — 三面鏡のズレから深層構造を抽出
//
// 核心思想:
// 矛盾は「間違い」ではない。矛盾は人間の多面性の証拠であり、
// その矛盾パターンこそが最も深い自己理解への入口となる。
//
// 3つのズレの種類:
// 1. 自画像 vs 足跡 → 「言っていることとやっていることが違う」
// 2. 自画像 vs 影絵 → 「自覚と無意識の価値基準が違う」
// 3. 足跡 vs 影絵  → 「適応行動と本来の志向が違う」

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES, type TraitAxisDef } from "./traitAxes";
import type {
  MirrorSource,
  ThreeMirrorProfile,
  MirrorAxisScore,
  AxisDivergence,
  DivergenceType,
} from "./threeMirrors";
import { detectDivergences, classifyDivergence } from "./threeMirrors";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Contradiction Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 矛盾の心理的意味 */
export type ContradictionMeaning =
  | "ideal_gap"           // 理想と現実のギャップ
  | "adaptation_mask"     // 環境適応のマスク
  | "unconscious_value"   // 無自覚な価値基準
  | "contextual_self"     // 状況依存的な自己
  | "growth_edge"         // 成長の最前線
  | "protective_pattern"; // 自己防衛パターン

/** 矛盾マップの1エントリ */
export interface ContradictionEntry {
  /** 対象の軸 */
  axisId: TraitAxisKey;
  /** 軸の定義（表示用） */
  axisLabel: string;
  axisLabelLeft: string;
  axisLabelRight: string;
  /** ズレの種類 */
  divergenceType: DivergenceType;
  /** ズレの大きさ (0-1) */
  magnitude: number;
  /** 各ミラーのスコア */
  scores: {
    selfPortrait?: number;
    footprint?: number;
    shadowPlay?: number;
  };
  /** 矛盾の心理的意味 */
  meaning: ContradictionMeaning;
  /** 人間向けの解説 */
  insight: string;
  /** 探索のための問いかけ */
  explorationPrompt: string;
}

/** 矛盾マップ全体 */
export interface ContradictionMap {
  /** 検出された矛盾のリスト（大きい順） */
  entries: ContradictionEntry[];
  /** 矛盾の総数 */
  totalContradictions: number;
  /** 一致している軸の数 */
  alignedAxes: number;
  /** 全体のサマリ */
  summary: string;
  /** 最大の矛盾から導かれる主要テーマ */
  primaryTheme: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Contradiction Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ズレの種類から心理的意味を推定
 */
function inferMeaning(
  divergenceType: DivergenceType,
  mirror: MirrorAxisScore
): ContradictionMeaning {
  switch (divergenceType) {
    case "self_vs_footprint": {
      // 自己申告 > 行動: 理想を語っている
      // 自己申告 < 行動: 過小評価している
      const selfVal = mirror.selfPortrait ?? 0;
      const footVal = mirror.footprint ?? 0;
      return Math.abs(selfVal) > Math.abs(footVal) ? "ideal_gap" : "unconscious_value";
    }
    case "self_vs_shadow":
      return "unconscious_value";
    case "footprint_vs_shadow":
      return "adaptation_mask";
    case "all_diverged":
      return "contextual_self";
    default:
      return "growth_edge";
  }
}

/**
 * 心理的意味から探索プロンプトを生成
 */
function generateExplorationPrompt(
  meaning: ContradictionMeaning,
  axisLabelLeft: string,
  axisLabelRight: string,
  divergenceType: DivergenceType
): string {
  const axisDesc = `「${axisLabelLeft}」と「${axisLabelRight}」`;

  switch (meaning) {
    case "ideal_gap":
      return `${axisDesc}の間で、あなたが「こうありたい」と思う自分と、実際の行動にギャップがあるようです。このギャップはどんな場面で感じますか？`;
    case "adaptation_mask":
      return `${axisDesc}において、環境に合わせた行動と、深層の価値観が異なっています。今の環境が変わったら、どちらの自分が出てくると思いますか？`;
    case "unconscious_value":
      return `${axisDesc}について、自分では気づいていない価値基準があるかもしれません。他者の行動を見て強く反応する時、何に引っかかりますか？`;
    case "contextual_self":
      return `${axisDesc}のスコアが3つの観測源でバラバラです。これは「状況によって違う自分がいる」ことの表れです。どの場面でどの自分が出てきますか？`;
    case "growth_edge":
      return `${axisDesc}にズレがあります。このズレは成長の最前線かもしれません。最近、この領域で変化を感じることはありますか？`;
    case "protective_pattern":
      return `${axisDesc}において、自己防衛的なパターンが見えます。安全な環境と不安な環境で、あなたの反応はどう変わりますか？`;
  }
}

/**
 * ズレのインサイトを生成
 */
function generateContradictionInsight(
  meaning: ContradictionMeaning,
  divergenceType: DivergenceType,
  axisLabelLeft: string,
  axisLabelRight: string,
  scores: { selfPortrait?: number; footprint?: number; shadowPlay?: number }
): string {
  const labelMap: Record<ContradictionMeaning, string> = {
    ideal_gap: "理想と現実",
    adaptation_mask: "適応と本質",
    unconscious_value: "自覚と無意識",
    contextual_self: "多面的な自己",
    growth_edge: "変化の兆し",
    protective_pattern: "自己防衛",
  };

  const theme = labelMap[meaning];

  switch (divergenceType) {
    case "self_vs_footprint":
      return `【${theme}】自分が語る「${axisLabelLeft}⇔${axisLabelRight}」のバランスと、実際の行動パターンが異なっています。`;
    case "self_vs_shadow":
      return `【${theme}】自覚している傾向と、他者への反応に映る無意識の傾向にズレがあります。`;
    case "footprint_vs_shadow":
      return `【${theme}】日常の行動習慣と、投影反応に見える深層の価値観が異なる方向を指しています。`;
    case "all_diverged":
      return `【${theme}】3つの観測源がそれぞれ異なる方向を示しており、この領域が複雑な内的構造を持っていることを示唆しています。`;
    default:
      return `${axisLabelLeft}⇔${axisLabelRight}の領域にズレが検出されました。`;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 三面鏡プロファイルから矛盾マップを生成
 *
 * 使い方:
 * 1. buildContradictionMap(profile) で全矛盾を検出
 * 2. entries を大きい順に表示
 * 3. explorationPrompt で次の質問候補を提示
 */
export function buildContradictionMap(
  profile: Partial<ThreeMirrorProfile>
): ContradictionMap {
  const entries: ContradictionEntry[] = [];
  let alignedAxes = 0;

  // 全軸を走査
  for (const [axisId, mirror] of Object.entries(profile) as [TraitAxisKey, MirrorAxisScore][]) {
    // 2つ以上のミラーがないと比較できない
    const available = [
      mirror.selfPortrait !== undefined,
      mirror.footprint !== undefined,
      mirror.shadowPlay !== undefined,
    ].filter(Boolean).length;
    if (available < 2) continue;

    const divergenceType = classifyDivergence(mirror);
    if (divergenceType === "all_aligned") {
      alignedAxes++;
      continue;
    }

    // 軸定義を取得
    const axisDef = TRAIT_AXES.find((d: TraitAxisDef) => d.id === axisId);
    if (!axisDef) continue;

    // ズレの大きさを計算
    const pairs = [
      Math.abs((mirror.selfPortrait ?? 0) - (mirror.footprint ?? 0)),
      Math.abs((mirror.selfPortrait ?? 0) - (mirror.shadowPlay ?? 0)),
      Math.abs((mirror.footprint ?? 0) - (mirror.shadowPlay ?? 0)),
    ].filter((_, i) => {
      // 利用可能なペアのみ
      if (i === 0) return mirror.selfPortrait !== undefined && mirror.footprint !== undefined;
      if (i === 1) return mirror.selfPortrait !== undefined && mirror.shadowPlay !== undefined;
      return mirror.footprint !== undefined && mirror.shadowPlay !== undefined;
    });
    const magnitude = pairs.length > 0 ? Math.max(...pairs) : 0;

    const meaning = inferMeaning(divergenceType, mirror);

    entries.push({
      axisId,
      axisLabel: axisDef.labelLeft + " ⇔ " + axisDef.labelRight,
      axisLabelLeft: axisDef.labelLeft,
      axisLabelRight: axisDef.labelRight,
      divergenceType,
      magnitude,
      scores: {
        selfPortrait: mirror.selfPortrait,
        footprint: mirror.footprint,
        shadowPlay: mirror.shadowPlay,
      },
      meaning,
      insight: generateContradictionInsight(
        meaning,
        divergenceType,
        axisDef.labelLeft,
        axisDef.labelRight,
        {
          selfPortrait: mirror.selfPortrait,
          footprint: mirror.footprint,
          shadowPlay: mirror.shadowPlay,
        }
      ),
      explorationPrompt: generateExplorationPrompt(
        meaning,
        axisDef.labelLeft,
        axisDef.labelRight,
        divergenceType
      ),
    });
  }

  // 大きいズレから並べる
  entries.sort((a, b) => b.magnitude - a.magnitude);

  // サマリ生成
  const totalContradictions = entries.length;
  const summary = generateMapSummary(entries, alignedAxes);
  const primaryTheme = entries.length > 0
    ? extractPrimaryTheme(entries[0])
    : "すべての観測源が一致しています";

  return {
    entries,
    totalContradictions,
    alignedAxes,
    summary,
    primaryTheme,
  };
}

function generateMapSummary(entries: ContradictionEntry[], alignedAxes: number): string {
  if (entries.length === 0) {
    return "3つの観測源が高い一致を示しています。自己認識の精度が高い状態です。";
  }

  const total = entries.length + alignedAxes;
  const contradictionRate = entries.length / Math.max(total, 1);

  if (contradictionRate > 0.6) {
    return `多くの領域(${entries.length}/${total})でズレが検出されています。これは自己の複雑さの表れであり、探索すべき豊かな内面の証拠です。`;
  }
  if (contradictionRate > 0.3) {
    return `いくつかの領域(${entries.length}/${total})でズレが見られます。特に大きなズレのある領域が、自己理解を深めるための重要な手がかりです。`;
  }
  return `大部分は一致していますが、${entries.length}つの領域で興味深いズレが検出されました。`;
}

function extractPrimaryTheme(topEntry: ContradictionEntry): string {
  const meaningLabels: Record<ContradictionMeaning, string> = {
    ideal_gap: "理想と現実のギャップ",
    adaptation_mask: "環境適応と本来の自己",
    unconscious_value: "自覚していない価値基準",
    contextual_self: "状況で変わる多面的な自己",
    growth_edge: "変化と成長の最前線",
    protective_pattern: "自己防衛のパターン",
  };
  return `${meaningLabels[topEntry.meaning]} — ${topEntry.axisLabel}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Display Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ズレの大きさを段階表示 */
export function getMagnitudeLevel(magnitude: number): {
  level: "low" | "medium" | "high" | "critical";
  label: string;
  color: string;
} {
  if (magnitude >= 0.7) return { level: "critical", label: "極めて大きいズレ", color: "#E11D48" };
  if (magnitude >= 0.5) return { level: "high", label: "大きなズレ", color: "#F59E0B" };
  if (magnitude >= 0.35) return { level: "medium", label: "中程度のズレ", color: "#8B5CF6" };
  return { level: "low", label: "軽微なズレ", color: "#6B7280" };
}

/** DivergenceTypeのラベル */
export const DIVERGENCE_TYPE_LABELS: Record<DivergenceType, { label: string; emoji: string }> = {
  self_vs_footprint: { label: "自画像 vs 足跡", emoji: "🪞↔👣" },
  self_vs_shadow: { label: "自画像 vs 影絵", emoji: "🪞↔🎭" },
  footprint_vs_shadow: { label: "足跡 vs 影絵", emoji: "👣↔🎭" },
  all_aligned: { label: "三面一致", emoji: "✓" },
  all_diverged: { label: "三面不一致", emoji: "⚡" },
};

/** ContradictionMeaningのラベル */
export const MEANING_LABELS: Record<ContradictionMeaning, { label: string; emoji: string }> = {
  ideal_gap: { label: "理想と現実", emoji: "✨" },
  adaptation_mask: { label: "適応の仮面", emoji: "🎭" },
  unconscious_value: { label: "無意識の価値観", emoji: "👁" },
  contextual_self: { label: "多面的な自己", emoji: "🔮" },
  growth_edge: { label: "成長の最前線", emoji: "🌱" },
  protective_pattern: { label: "自己防衛", emoji: "🛡" },
};
