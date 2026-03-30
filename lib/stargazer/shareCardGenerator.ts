// lib/stargazer/shareCardGenerator.ts
// Shareable card generator for Stargazer insights
// テキストベースのシェアカード生成 — Twitter/LINE/Instagram対応

import type { WeeklyReport } from "./weeklyReportGenerator";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ShareableCard {
  title: string;
  headline: string;
  stats: { label: string; value: string }[];
  shareText: string;
  hashtags: string[];
}

export type ShareFormat = "twitter" | "line" | "instagram";

interface VanishingInsightInput {
  insight: string;
  category: string;
  remainingHours: number;
}

interface MilestoneInput {
  name: string;
  description: string;
  achievedAt: string;
}

interface UnderstandingInput {
  level: number;
  label: string;
  totalObservations: number;
}

interface ArchetypeInput {
  code: string;
  name: string;
  description: string;
  layerLabels: string[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEFAULT_HASHTAGS = ["#Stargazer", "#Aneurasync"];

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "...";
}

function buildTwitterText(
  headline: string,
  body: string,
  hashtags: string[],
): string {
  const tags = hashtags.join(" ");
  const maxBody = 280 - headline.length - tags.length - 4; // 4 for newlines+space
  const trimmedBody = truncate(body, Math.max(maxBody, 40));
  return `${headline}\n${trimmedBody}\n${tags}`;
}

function buildLineText(headline: string, body: string): string {
  return `${headline}\n\n${body}\n\nStargazer - 自分を知る`;
}

function buildInstagramText(
  headline: string,
  stats: { label: string; value: string }[],
  hashtags: string[],
): string {
  const statLines = stats.map((s) => `${s.label}: ${s.value}`).join("\n");
  return `${headline}\n\n${statLines}\n\n${hashtags.join(" ")}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Generators
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function generateWeeklyShareCard(
  report: WeeklyReport,
  format: ShareFormat = "twitter",
): ShareableCard {
  const weekLabel = `第${report.weekNumber}週`;
  const title = `${weekLabel}レポート`;
  const headline = report.slides[0]?.headline ?? "あなたの1週間を振り返る";

  const stats: ShareableCard["stats"] = [];
  for (const slide of report.slides) {
    if (slide.mainStat && slide.mainStatLabel) {
      stats.push({ label: slide.mainStatLabel, value: slide.mainStat });
    }
    if (stats.length >= 3) break;
  }

  const narrativeSnippet = truncate(report.narrativeArc, 120);
  const hashtags = [...DEFAULT_HASHTAGS, `#Week${report.weekNumber}`];

  let shareText: string;
  switch (format) {
    case "twitter":
      shareText = buildTwitterText(
        `${weekLabel}: ${headline}`,
        narrativeSnippet,
        hashtags,
      );
      break;
    case "line":
      shareText = buildLineText(
        `${weekLabel}の深層観測レポート: ${headline}`,
        narrativeSnippet,
      );
      break;
    case "instagram":
      shareText = buildInstagramText(
        `${weekLabel}: ${headline}`,
        stats,
        hashtags,
      );
      break;
  }

  return { title, headline, stats, shareText, hashtags };
}

export function generateInsightShareCard(
  input: VanishingInsightInput,
  format: ShareFormat = "twitter",
): ShareableCard {
  const title = "今だけの気づき";
  const headline = truncate(input.insight, 80);

  const stats: ShareableCard["stats"] = [
    { label: "カテゴリ", value: input.category },
    {
      label: "残り時間",
      value: `${Math.ceil(input.remainingHours)}時間`,
    },
  ];

  const hashtags = [...DEFAULT_HASHTAGS, "#VanishingInsight"];

  let shareText: string;
  switch (format) {
    case "twitter":
      shareText = buildTwitterText(
        `[${input.category}] ${headline}`,
        "今だけの気づき。もうすぐ消えちゃうよ。",
        hashtags,
      );
      break;
    case "line":
      shareText = buildLineText(
        `[${input.category}] 今だけの気づき`,
        `${input.insight}\n\n残り約${Math.ceil(input.remainingHours)}時間で消えちゃうよ`,
      );
      break;
    case "instagram":
      shareText = buildInstagramText(
        `${input.category}: ${headline}`,
        stats,
        hashtags,
      );
      break;
  }

  return { title, headline, stats, shareText, hashtags };
}

export function generateMilestoneShareCard(
  milestone: MilestoneInput,
  understanding: UnderstandingInput,
  format: ShareFormat = "twitter",
): ShareableCard {
  const title = "マイルストーン達成";
  const headline = milestone.name;

  const stats: ShareableCard["stats"] = [
    { label: "理解度", value: understanding.label },
    { label: "観測回数", value: `${understanding.totalObservations}回` },
    { label: "達成日", value: milestone.achievedAt },
  ];

  const hashtags = [...DEFAULT_HASHTAGS, "#Milestone"];

  let shareText: string;
  switch (format) {
    case "twitter":
      shareText = buildTwitterText(
        `${milestone.name} 達成`,
        `${milestone.description}\n理解度: ${understanding.label} (${understanding.totalObservations}回の観測)`,
        hashtags,
      );
      break;
    case "line":
      shareText = buildLineText(
        `マイルストーン達成: ${milestone.name}`,
        `${milestone.description}\n\n現在の理解度: ${understanding.label}\n総観測回数: ${understanding.totalObservations}回`,
      );
      break;
    case "instagram":
      shareText = buildInstagramText(
        `${milestone.name}`,
        stats,
        hashtags,
      );
      break;
  }

  return { title, headline, stats, shareText, hashtags };
}

export function generateArchetypeShareCard(
  archetype: ArchetypeInput,
  understanding: UnderstandingInput,
  format: ShareFormat = "twitter",
): ShareableCard {
  const title = "アーキタイプ診断結果";
  const headline = `${archetype.name} (${archetype.code})`;

  const stats: ShareableCard["stats"] = [
    { label: "タイプ", value: archetype.code },
    { label: "理解度", value: understanding.label },
    ...archetype.layerLabels.map((label, i) => ({
      label: `レイヤー${i + 1}`,
      value: label,
    })),
  ];

  const hashtags = [
    ...DEFAULT_HASHTAGS,
    `#${archetype.code}`,
    "#ArchetypeIdentity",
  ];

  let shareText: string;
  switch (format) {
    case "twitter":
      shareText = buildTwitterText(
        `私のアーキタイプは「${archetype.name}」(${archetype.code})`,
        truncate(archetype.description, 140),
        hashtags,
      );
      break;
    case "line":
      shareText = buildLineText(
        `私のアーキタイプ: ${archetype.name} (${archetype.code})`,
        `${archetype.description}\n\n${archetype.layerLabels.map((l, i) => `レイヤー${i + 1}: ${l}`).join("\n")}`,
      );
      break;
    case "instagram":
      shareText = buildInstagramText(
        `${archetype.name}\n${archetype.code}`,
        stats,
        hashtags,
      );
      break;
  }

  return { title, headline, stats, shareText, hashtags };
}
