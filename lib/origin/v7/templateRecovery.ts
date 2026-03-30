/**
 * Template-based memory recovery — no AI required.
 * Generates a plausible outline from user selections alone.
 * Used as fallback when all AI providers fail.
 */

import { getPeriodLabel } from "./periods";
import { getAtmosphereLabel } from "./atmosphereData";
import { getPerspectiveLabel } from "./perspectiveData";
import { getComparisonLabel } from "./comparisonData";
import { getTriggerLabel } from "./triggerData";

export type RecoveryInput = {
  period: string;
  atmosphere: string;
  perspective: string;
  comparison: string;
  triggers: string[];
};

import type { ChapterLayers } from "./types";

export type RecoveryResult = {
  narrative: string;
  title: string;
  echoes: string[];
  layers: ChapterLayers;
  model: string;
};

/* ─── Title templates ─── */

const TITLE_MAP: Record<string, string> = {
  quiet: "静けさの中にいた頃",
  hectic: "忙しさに巻かれていた頃",
  hot: "何かに夢中だった頃",
  suffocating: "息苦しさを感じていた頃",
  protected: "まだ守られていた頃",
  shaky: "揺れていた頃",
  expanding: "世界が広がっていた頃",
  heavy: "重さを感じていた頃",
  dazzling: "眩しさの中にいた頃",
  lonely: "少し孤独だった頃",
  searching: "何かを探していた頃",
  free: "自由を感じていた頃",
  tense: "張り詰めていた頃",
  warm: "あたたかさの中にいた頃",
};

/* ─── Echo inference from comparison ─── */

const ECHO_MAP: Record<string, string[]> = {
  more_honest: ["率直さ", "素直な反応"],
  more_guarded: ["慎重さ", "構える姿勢"],
  relied_more: ["人に頼る力", "つながりの感覚"],
  carried_alone: ["一人で抱えやすい癖", "自立心"],
  more_passionate: ["情熱の記憶", "のめり込む力"],
  more_cool: ["冷静さ", "観察する目"],
  more_confident: ["自信の記憶", "挑戦する姿勢"],
  less_confident: ["不安との付き合い方", "慎重さ"],
  more_outgoing: ["社交性の記憶", "人に開く力"],
  more_inward: ["内省する力", "自分と向き合う姿勢"],
  more_sensitive: ["感受性", "周囲への繊細さ"],
  more_selfcentered: ["自分軸の記憶", "我の強さ"],
};

/* ─── Narrative templates ─── */

/** Strip trailing "の頃" to avoid duplication like "高校生の頃の頃" */
function stripKoro(label: string): string {
  return label.endsWith("の頃") ? label.slice(0, -2) : label;
}

function buildNarrative(
  periodLabel: string,
  atmosphereLabel: string,
  perspectiveLabel: string,
  comparisonLabel: string,
  triggerLabels: string[],
): string {
  const triggerStr =
    triggerLabels.length > 0
      ? triggerLabels.slice(0, 3).join("や") + "のある風景"
      : "日常の風景";

  const lines = [
    `${stripKoro(periodLabel)}の頃、${triggerStr}の中で過ごしていたのかもしれません。`,
    `周りの空気は「${atmosphereLabel}」ようなもので、周囲からは${perspectiveLabel.replace("に見えていた", "ように映っていた").replace("と思われていた", "と思われていたかもしれません")}。`,
    `今の自分と比べると、「${comparisonLabel.replace("今よりあの頃の方が、", "")}」ところがあったようです。`,
    `その頃の感覚は、形を変えて今も残っているのかもしれません。`,
  ];

  return lines.join("\n");
}

export function generateTemplateRecovery(input: RecoveryInput): RecoveryResult {
  const periodLabel = getPeriodLabel(input.period);
  const atmosphereLabel = getAtmosphereLabel(input.atmosphere);
  const perspectiveLabel = getPerspectiveLabel(input.perspective);
  const comparisonLabel = getComparisonLabel(input.comparison);
  const triggerLabels = input.triggers.map(getTriggerLabel);

  const title = TITLE_MAP[input.atmosphere] ?? `${stripKoro(periodLabel)}の頃`;

  const echoesFromComparison = ECHO_MAP[input.comparison] ?? ["変化の記憶"];
  // Add one echo from atmosphere
  const atmosphereEcho =
    input.atmosphere === "protected"
      ? "安心感の記憶"
      : input.atmosphere === "lonely"
        ? "孤独との距離感"
        : input.atmosphere === "searching"
          ? "探求心"
          : input.atmosphere === "free"
            ? "自由の感覚"
            : input.atmosphere === "tense"
              ? "緊張感への耐性"
              : null;

  const echoes = [...echoesFromComparison];
  if (atmosphereEcho && !echoes.includes(atmosphereEcho)) {
    echoes.push(atmosphereEcho);
  }

  const narrative = buildNarrative(
    periodLabel,
    atmosphereLabel,
    perspectiveLabel,
    comparisonLabel,
    triggerLabels,
  );

  // layers 生成
  const triggerStr = triggerLabels.length > 0 ? triggerLabels.slice(0, 3).join("、") : "";
  const layers: ChapterLayers = {
    events: triggerStr ? `${triggerStr}のある日常を過ごしていた` : undefined,
    innerState: `${atmosphereLabel}の空気の中で、周囲からは${perspectiveLabel}`,
    learnedPatterns: comparisonLabel ? `${comparisonLabel}ことから、今の動き方が形作られた可能性があります` : undefined,
    presentImpact: echoes.length > 0 ? `今にも「${echoes.join("」「")}」が残っています` : undefined,
    deepDivePrompts: [
      "この時期、誰の前にいた自分が一番印象に残っていますか？",
      "朝の気分はどんなものだったか覚えていますか？",
      "この時期に覚えた「守り方」はありますか？",
    ],
  };

  return {
    narrative,
    title,
    echoes: echoes.slice(0, 4),
    layers,
    model: "template",
  };
}
