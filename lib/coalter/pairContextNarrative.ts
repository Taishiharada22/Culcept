/**
 * CoAlter Pair Context Narrative — 2人にとっての意味を言語化
 *
 * Phase 1.5.3（Claude 旅行プラン機能取り込み ⑤）
 *
 * 採用済みアイテムに対して「この場所は2人にとってどんな意味があるか」の
 * 短い narrative を生成する。
 *
 * 設計原則:
 *  - 一般論にしない（「カフェは落ち着くのでおすすめ」は禁止）
 *  - 2人の具体（興味・価値観・関係の温度）に結びつける
 *  - 1〜2文、40〜90文字を目安（長くしない）
 *  - 断定や命令は入れない（「〜すべき」禁止）
 *  - 片方を正しいと置かない
 *
 * 使い所:
 *  - 採用済みプランの Detail Sheet で「2人にとって」セクションを表示
 *  - 初回表示時に LLM で生成し、DB に永続化（2回目以降はキャッシュ）
 */

import "server-only";
import { runAI } from "@/lib/ai";
import type { PlanItem } from "@/lib/coalter/planShelf";
import type { CoAlterPersonProfile } from "@/lib/coalter/types";

// ─────────────────────────────────────────────
// 型
// ─────────────────────────────────────────────

export interface PairContextNarrativeResult {
  /** 2人にとっての意味（40〜90文字目安、1〜2文） */
  narrative: string;
  /** narrative の根拠として触れた軸/値（UI補助・監査用） */
  highlightedAnchors: string[];
}

// ─────────────────────────────────────────────
// スキーマ
// ─────────────────────────────────────────────

const NARRATIVE_SCHEMA = {
  type: "object",
  properties: {
    narrative: { type: "string" },
    highlightedAnchors: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["narrative"],
  additionalProperties: false,
} as const;

// ─────────────────────────────────────────────
// 禁止表現
// ─────────────────────────────────────────────

const FORBIDDEN_PATTERNS = [
  /すべきです/,
  /しなければ/,
  /最適な選択は/,
  /正しい(選択|答え|判断)は/,
  /本当は.{0,10}思って/,
  /マッチング度|一致度|適合率/,
  /\d{2,3}%/,
];

function sanitize(text: string): string {
  let t = text;
  for (const p of FORBIDDEN_PATTERNS) {
    t = t.replace(p, "");
  }
  return t.trim();
}

// ─────────────────────────────────────────────
// プロンプト
// ─────────────────────────────────────────────

const SYSTEM_PROMPT = `あなたは CoAlter。2人の関係と文脈を深く知った上で、採用済みの候補1つについて「この2人にとっての意味」を 1〜2 文で言語化する。

重要な原則:
- 一般論にしない（「カフェは落ち着く」は禁止）
- この 2 人の具体（興味・価値観・アーキタイプ）に必ず紐付ける
- 40〜90 文字、1〜2 文
- 断定や命令を使わない（「〜すべき」「〜したほうがいい」禁止）
- 片方を正しいと置かない
- 営業トーンや煽りは使わない

出力は JSON:
{
  "narrative": "2人にとっての意味（40〜90文字、1〜2文）",
  "highlightedAnchors": ["touched した2人の軸や値。最大3つ"]
}`;

function axisLabel(
  label: string,
  value: number | null,
  pol0: string,
  pol1: string,
): string | null {
  if (value === null) return null;
  const pole = value < 0.4 ? pol0 : value > 0.6 ? pol1 : "中庸";
  return `${label}:${pole}`;
}

function summarizeProfile(p: CoAlterPersonProfile): string {
  const axes = [
    axisLabel(
      "新規性",
      p.decisionStyle.noveltyPreference,
      "安定重視",
      "新しさ好き",
    ),
    axisLabel(
      "決定",
      p.decisionStyle.decisionSpeed,
      "慎重",
      "即断",
    ),
    axisLabel(
      "リスク",
      p.decisionStyle.riskTolerance,
      "回避",
      "歓迎",
    ),
    axisLabel(
      "会話",
      p.communicationStyle.directVsDiplomatic,
      "外交的",
      "直接的",
    ),
  ].filter((s): s is string => s !== null);

  const parts = [
    p.displayName ? `name: ${p.displayName}` : null,
    axes.length > 0 ? `traits: ${axes.join(" / ")}` : null,
    p.interests.length > 0
      ? `interests: ${p.interests.slice(0, 6).join("・")}`
      : null,
    p.values.length > 0 ? `values: ${p.values.slice(0, 4).join("・")}` : null,
    p.archetypeCode ? `archetype: ${p.archetypeCode}` : null,
    p.coreDesire ? `core_desire: ${p.coreDesire}` : null,
  ].filter((s): s is string => s !== null);

  return parts.join(" | ");
}

export function buildNarrativePrompt(
  item: Pick<
    PlanItem,
    "title" | "description" | "practicalInfo" | "category" | "targetDate"
  >,
  profileA: CoAlterPersonProfile,
  profileB: CoAlterPersonProfile,
): string {
  return [
    "# 採用済み候補",
    `- title: ${item.title}`,
    `- description: ${item.description}`,
    `- practicalInfo: ${item.practicalInfo ?? "(なし)"}`,
    `- category: ${item.category}`,
    `- targetDate: ${item.targetDate}`,
    "",
    "# 2人の像",
    `A: ${summarizeProfile(profileA)}`,
    `B: ${summarizeProfile(profileB)}`,
    "",
    "# 依頼",
    "この候補が「この 2 人」にとって どういう意味を持つか を 1〜2 文で。",
    "必ず興味・価値観・アーキタイプのどれかに触れる（一般論は禁止）。",
  ].join("\n");
}

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────

/**
 * 2人にとっての意味を 1 件生成する。LLM 失敗時は throw。
 */
export async function generatePairContextNarrative(params: {
  item: Pick<
    PlanItem,
    "title" | "description" | "practicalInfo" | "category" | "targetDate"
  >;
  profileA: CoAlterPersonProfile;
  profileB: CoAlterPersonProfile;
  userId?: string | null;
}): Promise<PairContextNarrativeResult> {
  const { item, profileA, profileB, userId } = params;
  const prompt = buildNarrativePrompt(item, profileA, profileB);

  const result = await runAI({
    taskType: "coalter_pair_narrative",
    userId: userId ?? undefined,
    prompt,
    systemPrompt: SYSTEM_PROMPT,
    jsonSchema: NARRATIVE_SCHEMA,
    requireJson: true,
    temperature: 0.5,
    maxOutputTokens: 256,
    timeoutMs: 10000,
  });

  const raw = result.structured as Record<string, unknown> | null;
  if (!raw) {
    throw new Error("pair_narrative_no_structured_output");
  }

  const narrative = sanitize(String(raw.narrative ?? ""));
  if (!narrative) {
    throw new Error("pair_narrative_invalid_output");
  }

  const anchorsRaw = raw.highlightedAnchors;
  const highlightedAnchors = Array.isArray(anchorsRaw)
    ? anchorsRaw
        .filter((a): a is string => typeof a === "string")
        .map((a) => a.trim())
        .filter((a) => a.length > 0)
        .slice(0, 5)
    : [];

  return { narrative, highlightedAnchors };
}

/** テスト用に sanitize / buildNarrativePrompt / summarizeProfile を export */
export const __internal = { sanitize, buildNarrativePrompt, summarizeProfile };
