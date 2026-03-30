// lib/stargazer/explanationEngine.ts
// Phase 2 説明エンジン — 散在する「なぜ」データを統合し、
// 深度順の洞察として構造化する

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";
import type { ContradictionMap, ContradictionEntry } from "./contradictionMap";
import type { GenerativeCoreResult } from "./generativeCore";
import type { ContextNarrative, ContradictionInsight } from "./dailyInsightEngine";
import type { TemporalDiffResult } from "./innovativeMechanisms";
import type { MetamorphosisLawResult } from "./metamorphosisLaw";

// ── Types ──

export type WhyCategory =
  | "contradiction"   // 矛盾の理由
  | "mirror_gap"      // 三鏡乖離の理由
  | "context_shift"   // 場面変化の理由
  | "core_formation"  // 判断原理の形成理由
  | "change"          // 変化の理由
  | "protection"      // 防衛パターンの理由
  | "blind_spot";     // 盲点の理由

export type WhyDepth =
  | "surface"     // 表面（誰でも気づける）
  | "pattern"     // パターン（繰り返しから見える）
  | "structural"; // 構造（深層の仕組み）

export interface WhyInsight {
  id: string;
  category: WhyCategory;
  depth: WhyDepth;
  question: string;           // 「なぜ〜なのか？」
  answer: string;             // 説明
  evidence: string;           // 根拠データの要約
  confidence: number;         // 0-1
  relatedAxes: TraitAxisKey[];
  explorationPrompt?: string; // 次の問い
  priority: number;           // 表示優先度（高い方が先）
}

// ── Main Engine ──

export interface ExplanationInput {
  contradictionMap?: ContradictionMap | null;
  generativeCore?: GenerativeCoreResult | null;
  contextNarratives?: ContextNarrative[];
  contradictions?: ContradictionInsight[];
  temporalDiffs?: TemporalDiffResult[];
  metamorphosis?: MetamorphosisLawResult | null;
  axisScores?: Partial<Record<TraitAxisKey, number>>;
  totalObservations?: number;
}

/**
 * 散在する分析結果から統合的な「なぜ」洞察を生成
 * 深度・確信度・優先度でソート済みの配列を返す
 */
export function buildWhyInsights(input: ExplanationInput): WhyInsight[] {
  const insights: WhyInsight[] = [];
  const observationCount = input.totalObservations ?? 0;

  // ── 1. 三鏡矛盾マップから ──
  if (input.contradictionMap && input.contradictionMap.entries.length > 0) {
    for (const entry of input.contradictionMap.entries.slice(0, 5)) {
      const insight = buildMirrorGapInsight(entry, observationCount);
      if (insight) insights.push(insight);
    }
  }

  // ── 2. GenerativeCore から ──
  if (input.generativeCore) {
    const core = input.generativeCore;

    // 2a. 判断原理の形成理由
    if (core.innerCore) {
      insights.push({
        id: "core_principle",
        category: "core_formation",
        depth: "structural",
        question: "なぜこの判断原理が、あなたの中核にあるのか？",
        answer: core.innerCore.principle,
        evidence: `安全の源: ${core.innerCore.safetySource}`,
        confidence: core.innerCore.confidence ?? 0.7,
        relatedAxes: core.innerCore.coreAxes.map((ca) => ca.axisId),
        explorationPrompt: "この原理が揺らぐ場面を思い出せますか？",
        priority: 95,
      });
    }

    // 2b. 防衛パターン
    if (core.protectiveStructures && core.protectiveStructures.length > 0) {
      for (const ps of core.protectiveStructures.slice(0, 2)) {
        const primaryAxis = ps.relatedDivergences?.[0]?.axisId;
        insights.push({
          id: `protection_${primaryAxis ?? ps.patternType}`,
          category: "protection",
          depth: "structural",
          question: `なぜ「${ps.manifestation}」という防衛が働くのか？`,
          answer: `${ps.protectedNeed}を守るために、この防衛が自動的に発動します。これはあなたが過去に学んだ安全確保の方法です。`,
          evidence: `保護対象: ${ps.protectedNeed} / パターン: ${ps.patternType}`,
          confidence: 0.65,
          relatedAxes: primaryAxis ? [primaryAxis] : [],
          explorationPrompt: ps.reflectionPrompt,
          priority: 80,
        });
      }
    }

    // 2c. 盲点仮説
    if (core.blindSpots && core.blindSpots.length > 0) {
      for (const bs of core.blindSpots.slice(0, 2)) {
        const primaryAxis = bs.evidence?.[0]?.axisId;
        insights.push({
          id: `blindspot_${primaryAxis ?? bs.title}`,
          category: "blind_spot",
          depth: "structural",
          question: `なぜ「${bs.title}」という盲点に気づけないのか？`,
          answer: bs.description,
          evidence: bs.evidence.length > 0
            ? `自画像: ${bs.evidence[0].selfSays.toFixed(2)} vs 行動: ${bs.evidence[0].behaviorShows.toFixed(2)}`
            : "三鏡の乖離から検出",
          confidence: bs.confidence ?? 0.5,
          relatedAxes: primaryAxis ? [primaryAxis] : [],
          explorationPrompt: bs.explorationQuestions?.[0],
          priority: 85,
        });
      }
    }

    // 2d. 成長ベクトル
    if (core.growthVector) {
      const gv = core.growthVector;
      insights.push({
        id: "growth_direction",
        category: "change",
        depth: "pattern",
        question: "なぜ今、この方向に変化しようとしているのか？",
        answer: gv.direction,
        evidence: gv.signs?.join("、") ?? "行動パターンの変化から検出",
        confidence: 0.6,
        relatedAxes: gv.axes ?? [],
        explorationPrompt: gv.resistance
          ? `ただし抵抗も感じているはず: ${gv.resistance}`
          : undefined,
        priority: 75,
      });
    }
  }

  // ── 3. 文脈ナラティブから ──
  if (input.contextNarratives && input.contextNarratives.length > 0) {
    for (const cn of input.contextNarratives.slice(0, 3)) {
      const axis = TRAIT_AXES.find((a) => a.id === cn.axisId);
      const framingLabel =
        cn.framing === "protective" ? "守りの変化"
          : cn.framing === "authentic" ? "素の表れ"
            : "適応の知性";

      insights.push({
        id: `context_${cn.axisId}`,
        category: "context_shift",
        depth: "pattern",
        question: `なぜ場面によって「${axis?.labelLeft ?? ""}↔${axis?.labelRight ?? ""}」が変わるのか？`,
        answer: cn.narrative,
        evidence: `パターン: ${framingLabel}`,
        confidence: 0.7,
        relatedAxes: [cn.axisId],
        priority: 65,
      });
    }
  }

  // ── 4. 矛盾ペアから ──
  if (input.contradictions && input.contradictions.length > 0) {
    for (const c of input.contradictions.slice(0, 3)) {
      insights.push({
        id: `contradiction_${c.cardA.id}_${c.cardB.id}`,
        category: "contradiction",
        depth: "pattern",
        question: `なぜ「${c.cardA.label}」と「${c.cardB.label}」が同時に存在するのか？`,
        answer: c.narrative,
        evidence: `${c.cardA.label} × ${c.cardB.label}`,
        confidence: 0.65,
        relatedAxes: [],
        priority: 60,
      });
    }
  }

  // ── 5. 時間変化から ──
  if (input.temporalDiffs && input.temporalDiffs.length > 0) {
    for (const td of input.temporalDiffs.slice(0, 3)) {
      const dirLabel =
        td.direction === "strengthened" ? "強まった"
          : td.direction === "weakened" ? "弱まった"
            : td.direction === "reversed" ? "反転した"
              : "安定している";
      insights.push({
        id: `temporal_${td.axisId}`,
        category: "change",
        depth: "pattern",
        question: `なぜ「${getAxisLabel(td.axisId)}」の傾向が${dirLabel}のか？`,
        answer: td.interpretation,
        evidence: `スコア変化量: ${td.scoreDiff.toFixed(2)} (${td.daysBetween}日間)`,
        confidence: td.confidence ?? 0.5,
        relatedAxes: [td.axisId],
        priority: 55,
      });
    }
  }

  // ── 6. 変容律（メタモルフォーシス）から ──
  if (input.metamorphosis) {
    const mm = input.metamorphosis;
    if (mm.cyclicalPatterns && mm.cyclicalPatterns.length > 0) {
      const top = mm.cyclicalPatterns[0];
      insights.push({
        id: "metamorphosis_cycle",
        category: "change",
        depth: "structural",
        question: `なぜあなたには${top.cycleType === "daily" ? "日内" : top.cycleType === "weekly" ? "週内" : "文脈"}のリズムがあるのか？`,
        answer: top.description || `${getAxisLabel(top.axisId)}の領域で安定した変動パターンが検出されました。これはあなたの自然なリズムです。`,
        evidence: `振幅: ${top.amplitude.toFixed(2)}, 周期: ${top.cycleType}`,
        confidence: top.confidence,
        relatedAxes: [top.axisId],
        priority: 70,
      });
    }

    if (mm.triggerPatterns && mm.triggerPatterns.length > 0) {
      const trigger = mm.triggerPatterns[0];
      const primaryAxis = trigger.affectedAxes[0];
      insights.push({
        id: "metamorphosis_trigger",
        category: "change",
        depth: "structural",
        question: "なぜ特定の状態で特定の軸が動くのか？",
        answer: trigger.interpretation || `${trigger.trigger}のとき、${getAxisLabel(primaryAxis)}が${trigger.direction === "positive" ? "上昇" : "低下"}する傾向があります。`,
        evidence: `トリガー: ${trigger.trigger} → ${getAxisLabel(primaryAxis)} (${trigger.direction})`,
        confidence: Math.min(0.8, 0.3 + trigger.observedCount * 0.1),
        relatedAxes: trigger.affectedAxes,
        priority: 72,
      });
    }
  }

  // ── ソート: 確信度 × 深度 × 優先度 ──
  const depthWeight: Record<WhyDepth, number> = {
    structural: 1.0,
    pattern: 0.7,
    surface: 0.4,
  };

  insights.sort((a, b) => {
    const scoreA = a.priority * 0.5 + a.confidence * 30 + depthWeight[a.depth] * 20;
    const scoreB = b.priority * 0.5 + b.confidence * 30 + depthWeight[b.depth] * 20;
    return scoreB - scoreA;
  });

  return insights;
}

// ── Helpers ──

function getAxisLabel(axisId?: TraitAxisKey | string | null): string {
  if (!axisId) return "不明";
  const axis = TRAIT_AXES.find((a) => a.id === axisId);
  return axis ? `${axis.labelLeft} ↔ ${axis.labelRight}` : String(axisId);
}

function buildMirrorGapInsight(
  entry: ContradictionEntry,
  observationCount: number,
): WhyInsight | null {
  const axis = TRAIT_AXES.find((a) => a.id === entry.axisId);
  if (!axis) return null;

  const meaningLabels: Record<string, string> = {
    ideal_gap: "理想と現実のギャップ",
    adaptation_mask: "環境適応のマスク",
    unconscious_value: "無自覚な価値基準",
    contextual_self: "多面的な自己",
    growth_edge: "成長の最前線",
    protective_pattern: "自己防衛パターン",
  };

  const meaningLabel = meaningLabels[entry.meaning] ?? entry.meaning;

  return {
    id: `mirror_${entry.axisId}_${entry.divergenceType}`,
    category: "mirror_gap",
    depth: entry.magnitude > 0.5 ? "structural" : "pattern",
    question: `なぜ「${axis.labelLeft} ↔ ${axis.labelRight}」で自己認識と実際の行動にズレがあるのか？`,
    answer: entry.insight,
    evidence: `乖離タイプ: ${meaningLabel} (強度: ${(entry.magnitude * 100).toFixed(0)}%)`,
    confidence: Math.min(0.9, 0.4 + observationCount * 0.03 + entry.magnitude * 0.3),
    relatedAxes: [entry.axisId as TraitAxisKey],
    explorationPrompt: entry.explorationPrompt,
    priority: 70 + entry.magnitude * 30,
  };
}
