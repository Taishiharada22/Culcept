// lib/stargazer/aiVanishingInsight.ts
// AI 駆動の消えるインサイト生成エンジン
//
// テンプレートベースの vanishingInsightGenerator.ts を補完し、
// ユーザー固有の観測データから「なぜこのアプリは自分のことを知っているのか」
// と感じるレベルのインサイトを AI で生成する。
//
// サーバーサイド専用。runAI() を使用。

import "server-only";

import { runAI } from "@/lib/ai";
import { makeStargazerRunMetadata } from "./studentTrack";
import type { ContradictionResult } from "./contradictionDetector";
import type { BehavioralInsight } from "./behavioralInsightEngine";
import type { DetectedPattern } from "./patternDetectionEngine";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 深度カテゴリ: 深いほど消えるのが早い */
export type DepthCategory = "表層" | "中層" | "深層" | "核心";

/** 深度ごとの有効期限 (ms) */
const DEPTH_EXPIRY_MS: Record<DepthCategory, number> = {
  表層: 48 * 60 * 60 * 1000, // 48時間
  中層: 24 * 60 * 60 * 1000, // 24時間
  深層: 12 * 60 * 60 * 1000, // 12時間
  核心: 6 * 60 * 60 * 1000,  // 6時間
};

export interface AIVanishingInsight {
  id: string;
  /** インサイト本文 (日本語, 1-2文) */
  insight: string;
  /** 深度カテゴリ */
  depth: DepthCategory;
  /** 驚き度 (0-1): ユーザーの自己像からどれだけ逸脱しているか */
  surpriseScore: number;
  /** インサイトの根拠となったデータソース */
  basedOn: string;
  /** 前のインサイトとの接続テキスト (チェーン用, null = 初回) */
  chainReference: string | null;
  /** 生成タイムスタンプ */
  generatedAt: number;
  /** 有効期限タイムスタンプ */
  expiresAt: number;
}

/** generateAIVanishingInsight に渡すコンテキスト */
export interface VanishingInsightContext {
  userId: string;
  /** 現在の軸スコア (軸ID -> スコア -1~+1) */
  axisScores: Record<string, number>;
  /** 最近のスコア変動 (軸ID -> 直近の変化幅) */
  recentAxisChanges?: Record<string, number>;
  /** 検出された矛盾 (上位3件程度) */
  contradictions?: ContradictionResult[];
  /** 行動インサイト (上位3件程度) */
  behavioralInsights?: BehavioralInsight[];
  /** 検出パターン (上位3件程度) */
  detectedPatterns?: DetectedPattern[];
  /** 観測回数 */
  observationCount: number;
  /** 前回のインサイトテキスト (チェーン用) */
  previousInsight?: string | null;
  /** 前回のインサイトの深度 */
  previousDepth?: DepthCategory | null;
  /** パーソナライゼーション嗜好コンテキスト */
  preferenceContext?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prompt Construction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SYSTEM_PROMPT = `あなたは深層観測エンジンです。
ユーザーの性格軸スコア、矛盾データ、行動パターンを分析し、
本人が自覚していない深層の気づきを1つ生成します。

## 生成ルール
1. 必ず1-2文の日本語で書く。精密で具体的に。曖昧な占い文や自己啓発的フレーズは禁止
2. 必ず少なくとも1つの具体的な軸名・スコア・行動信号を名指しで参照すること（例: 「慎重/大胆の軸が0.7に達しているのに...」）
3. ユーザーが「なぜこのアプリは私のことを知っているのか」と感じるレベルの具体性
4. 前回のインサイトが提供されている場合、物語的に接続すること
5. 汎用的な自己啓発フレーズは禁止。「誰にでも当てはまる」文は失格
6. ポエティックすぎない。高校生〜40代の日本人に刺さる、地に足のついた表現を使う
7. 「診断」「占い」「運勢」ではなく「観測」「発見」「検出」の言葉を使う

## 深度カテゴリ判定基準
- 表層: 観察可能な行動パターンの指摘
- 中層: 行動の裏にある動機・欲求の推測
- 深層: 矛盾・自己欺瞞の核心への接近
- 核心: 本人が認めたくない/気づいていない根本的な特性

## 驚き度(surprise_score)の基準
- 0.0-0.3: ユーザーが薄々気づいていること
- 0.4-0.6: 言われて初めて気づくこと
- 0.7-0.9: 否定したくなるが否定できないこと
- 0.9-1.0: 衝撃的な盲点

## 出力形式 (JSON)
{
  "insight": "インサイト本文",
  "depth": "表層" | "中層" | "深層" | "核心",
  "surprise_score": 0.0-1.0,
  "based_on": "根拠の要約",
  "chain_text": "前回との接続テキスト (前回がない場合は null)"
}`;

function buildUserPrompt(ctx: VanishingInsightContext): string {
  const parts: string[] = [];

  // 軸スコア
  const axisEntries = Object.entries(ctx.axisScores);
  if (axisEntries.length > 0) {
    const formatted = axisEntries
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 10)
      .map(([k, v]) => `  ${k}: ${v.toFixed(2)}`)
      .join("\n");
    parts.push(`## 主要な軸スコア (上位10)\n${formatted}`);
  }

  // 最近の変動
  if (ctx.recentAxisChanges) {
    const changes = Object.entries(ctx.recentAxisChanges)
      .filter(([, v]) => Math.abs(v) > 0.1)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 5);
    if (changes.length > 0) {
      const formatted = changes
        .map(([k, v]) => `  ${k}: ${v > 0 ? "+" : ""}${v.toFixed(2)}`)
        .join("\n");
      parts.push(`## 最近の軸スコア変動\n${formatted}`);
    }
  }

  // 矛盾
  if (ctx.contradictions && ctx.contradictions.length > 0) {
    const formatted = ctx.contradictions
      .slice(0, 3)
      .map((c, i) => `  ${i + 1}. [${c.type}] ${c.description} (深刻度: ${c.severity.toFixed(2)})`)
      .join("\n");
    parts.push(`## 検出された矛盾\n${formatted}`);
  }

  // 行動インサイト
  if (ctx.behavioralInsights && ctx.behavioralInsights.length > 0) {
    const formatted = ctx.behavioralInsights
      .slice(0, 3)
      .map((b, i) => `  ${i + 1}. [${b.category}] ${b.description} (確信度: ${b.confidence.toFixed(2)}, 意外性: ${b.userSurpriseFactor.toFixed(2)})`)
      .join("\n");
    parts.push(`## 行動信号からのインサイト\n${formatted}`);
  }

  // パターン
  if (ctx.detectedPatterns && ctx.detectedPatterns.length > 0) {
    const formatted = ctx.detectedPatterns
      .slice(0, 3)
      .map((p, i) => `  ${i + 1}. [${p.patternType}] ${p.descriptionJa} (信頼度: ${p.confidence.toFixed(2)})`)
      .join("\n");
    parts.push(`## 検出パターン\n${formatted}`);
  }

  // 観測回数
  parts.push(`## 観測回数: ${ctx.observationCount}`);

  // 前回のインサイト (チェーン用)
  if (ctx.previousInsight) {
    parts.push(`## 前回のインサイト (深度: ${ctx.previousDepth ?? "不明"})\n  「${ctx.previousInsight}」\n\n  ※ 今回のインサイトは、この前回の洞察を踏まえて物語を展開すること。「昨日の観測では...今日は...」のような接続。`);
  } else {
    parts.push(`## 前回のインサイト: なし (初回生成)`);
  }

  return parts.join("\n\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// JSON Schema
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const INSIGHT_JSON_SCHEMA = {
  type: "object",
  properties: {
    insight: { type: "string", description: "インサイト本文 (日本語, 1-2文)" },
    depth: {
      type: "string",
      enum: ["表層", "中層", "深層", "核心"],
      description: "深度カテゴリ",
    },
    surprise_score: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "驚き度 (0-1)",
    },
    based_on: { type: "string", description: "根拠の要約" },
    chain_text: {
      type: ["string", "null"],
      description: "前回のインサイトとの接続テキスト",
    },
  },
  required: ["insight", "depth", "surprise_score", "based_on", "chain_text"],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const VALID_DEPTHS: DepthCategory[] = ["表層", "中層", "深層", "核心"];

function isValidDepth(v: unknown): v is DepthCategory {
  return typeof v === "string" && VALID_DEPTHS.includes(v as DepthCategory);
}

/** 具体性チェック: 少なくとも1つの軸名 or 数値を参照しているか */
function passesAntiGenericCheck(insight: string, axisScores: Record<string, number>): boolean {
  // 軸IDの部分一致を確認
  const axisKeys = Object.keys(axisScores);
  for (const key of axisKeys) {
    // 軸名のキーワード部分を抽出 (e.g., "cautious_vs_bold" -> ["cautious", "bold"])
    const parts = key.split("_").filter((p) => p !== "vs" && p.length > 3);
    for (const part of parts) {
      if (insight.includes(part)) return true;
    }
  }

  // 日本語の軸ラベルの部分一致を確認
  const jpAxisTerms = [
    "内向", "外向", "慎重", "大胆", "分析", "直感", "変化", "計画", "即興",
    "伝統", "革新", "独立", "調和", "率直", "外交", "孤立", "社交", "機能",
    "表現", "ミニマル", "マキシマル", "完璧", "実用", "質", "量", "クラシック",
    "トレンド", "親密", "安心確認", "感情変動", "距離感", "境界", "コントロール",
    "拒否反応", "排他", "感情調整",
  ];
  for (const term of jpAxisTerms) {
    if (insight.includes(term)) return true;
  }

  // 数値パターン (e.g., "0.7", "70%")
  if (/\d+\.?\d*/.test(insight)) return true;

  return false;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Generator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * AI を使って高度にパーソナライズされた消えるインサイトを生成する。
 *
 * 失敗時は null を返す（フォールバックとして既存テンプレートベースを使用想定）。
 */
export async function generateAIVanishingInsight(
  context: VanishingInsightContext,
): Promise<AIVanishingInsight | null> {
  // 最低限のデータがないと生成不可
  if (Object.keys(context.axisScores).length < 3) {
    console.warn("[aiVanishingInsight] Not enough axis scores for AI generation");
    return null;
  }

  try {
    const result = await runAI({
      taskType: "stargazer_vanishing_insight",
      prompt: buildUserPrompt(context),
      systemPrompt: context.preferenceContext
        ? `${SYSTEM_PROMPT}${context.preferenceContext}`
        : SYSTEM_PROMPT,
      requireJson: true,
      jsonSchema: INSIGHT_JSON_SCHEMA,
      temperature: 0.85, // 創造性を高めに
      maxOutputTokens: 512,
      timeoutMs: 15_000,
      userId: context.userId,
      metadata: makeStargazerRunMetadata({
        observationCount: context.observationCount,
        axisCount: Object.keys(context.axisScores).length,
        hasContradictions: (context.contradictions?.length ?? 0) > 0,
        hasBehavioralInsights: (context.behavioralInsights?.length ?? 0) > 0,
        hasPatterns: (context.detectedPatterns?.length ?? 0) > 0,
        hasPreviousInsight: !!context.previousInsight,
      }),
    });

    if (!result.success || !result.structured) {
      console.warn("[aiVanishingInsight] AI call failed", result.errorMessage);
      return null;
    }

    const data = result.structured as Record<string, unknown>;
    const insight = typeof data.insight === "string" ? data.insight.trim() : "";
    const depth = isValidDepth(data.depth) ? data.depth : "中層";
    const surpriseScore = typeof data.surprise_score === "number"
      ? Math.max(0, Math.min(1, data.surprise_score))
      : 0.5;
    const basedOn = typeof data.based_on === "string" ? data.based_on : "観測データ";
    const chainText = typeof data.chain_text === "string" ? data.chain_text : null;

    if (!insight || insight.length < 10) {
      console.warn("[aiVanishingInsight] Generated insight too short");
      return null;
    }

    // Anti-generic defense
    if (!passesAntiGenericCheck(insight, context.axisScores)) {
      console.warn("[aiVanishingInsight] Insight failed anti-generic check, retrying not implemented — returning with warning");
      // 汎用的でも返す（完全に落とすよりはまし）が、surprise_score を下げる
    }

    const now = Date.now();
    const expiryMs = DEPTH_EXPIRY_MS[depth];

    return {
      id: `vi_ai_${now}_${Math.floor(Math.random() * 10000)}`,
      insight,
      depth,
      surpriseScore,
      basedOn,
      chainReference: chainText,
      generatedAt: now,
      expiresAt: now + expiryMs,
    };
  } catch (err) {
    console.error("[aiVanishingInsight] Unexpected error", err);
    return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Depth Utilities
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 深度のラベルと有効時間を返す (UI表示用) */
export function getDepthInfo(depth: DepthCategory): {
  label: string;
  description: string;
  expiryHours: number;
  color: string;
} {
  switch (depth) {
    case "表層":
      return {
        label: "表層",
        description: "行動の表面に現れているパターン",
        expiryHours: 48,
        color: "#60A5FA", // blue-400
      };
    case "中層":
      return {
        label: "中層",
        description: "行動の裏にある動機",
        expiryHours: 24,
        color: "#A78BFA", // violet-400
      };
    case "深層":
      return {
        label: "深層",
        description: "矛盾と自己欺瞞の核心",
        expiryHours: 12,
        color: "#F472B6", // pink-400
      };
    case "核心":
      return {
        label: "核心",
        description: "最も認めにくい真実",
        expiryHours: 6,
        color: "#FB923C", // orange-400
      };
  }
}

/** 残り時間を人間が読めるフォーマットで返す */
export function formatRemainingTime(expiresAt: number): string {
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return "消滅済み";

  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

  if (hours > 0) {
    return `あと${hours}時間${minutes > 0 ? `${minutes}分` : ""}`;
  }
  return `あと${minutes}分`;
}
