import "server-only";

import { runAI } from "@/lib/ai";
import {
  TRAIT_AXES,
  type TraitAxisDef,
  type AxisCategory,
} from "@/lib/stargazer/traitAxes";
import type { RendezvousCategory } from "./types";

// ============================================================
// Rendezvous お題自動生成エンジン
// Stargazer 45軸をテーマの種として使い、カテゴリごとに日替わりお題を生成
// ============================================================

/** カテゴリごとに優先する軸カテゴリ */
const CATEGORY_AXIS_AFFINITY: Record<
  RendezvousCategory | "general",
  AxisCategory[]
> = {
  romantic: ["relational", "emotional", "relational_deep"],
  friendship: ["core", "relational", "emotional"],
  cocreation: ["core", "motion", "aesthetic"],
  community: ["core", "relational", "aesthetic"],
  partner: ["relational", "relational_deep", "emotional"],
  general: ["core", "emotional", "relational"],
};

/** カテゴリの日本語ラベル */
const CATEGORY_CONTEXT: Record<RendezvousCategory | "general", string> = {
  romantic: "恋愛・パートナーとのつながり",
  friendship: "友情・仲間との関係",
  cocreation: "共創・ビジネスパートナーシップ",
  community: "コミュニティ・居場所",
  partner: "パートナーシップ全般",
  general: "人とのつながり全般",
};

const TOPIC_SYSTEM_PROMPT = `あなたはRendezvousの毎日のトピック設計者です。
人と人の接続のきっかけになる「お題」を1つ生成します。

## 設計原則
1. 答えに個性が出る質問にする（yes/noでは終わらない）
2. 深すぎず浅すぎず、カジュアルに答えられる（30秒で回答可能）
3. 答えを読んだ他人が「この人の感性が見える」と感じる
4. カテゴリに応じたトーン・テーマにする
5. 日本語で出力
6. 質問文は40〜80文字
7. 「あなたは〜」で始めない。問いかけの形にする
8. 抽象的すぎず、具体的なシーンや状況を想起させる

## 出力形式 (JSON)
{
  "prompt": "質問文",
  "subtext": "補足テキスト（任意、20文字以内。答え方のヒントなど）"
}`;

/**
 * 日付文字列からシンプルなハッシュ値を生成（決定的）
 */
function dateHash(dateStr: string, salt = ""): number {
  const s = `${dateStr}:${salt}`;
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    hash = (hash << 5) - hash + ch;
    hash |= 0; // 32bit integer
  }
  return Math.abs(hash);
}

/**
 * カテゴリに適した軸を日付シードで選択
 */
function selectAxisForDate(
  date: string,
  category: RendezvousCategory | "general",
): TraitAxisDef {
  const affinityCategories = CATEGORY_AXIS_AFFINITY[category];
  // 優先カテゴリに属する軸をフィルタ
  const preferred = TRAIT_AXES.filter((a) =>
    affinityCategories.includes(a.category),
  );
  // safety 軸は除外（お題には不適切）
  const candidates = preferred.filter((a) => a.category !== "safety");
  const pool = candidates.length > 0 ? candidates : TRAIT_AXES.filter((a) => a.category !== "safety");
  const idx = dateHash(date, category) % pool.length;
  return pool[idx];
}

export type GeneratedTopic = {
  prompt: string;
  subtext?: string;
  axisId: string;
  category: RendezvousCategory | "general";
  generationMeta: Record<string, unknown>;
};

/**
 * 指定日・カテゴリのお題を生成
 */
export async function generateDailyTopic(params: {
  date: string; // YYYY-MM-DD
  category: RendezvousCategory | "general";
}): Promise<GeneratedTopic> {
  const axis = selectAxisForDate(params.date, params.category);
  const context = CATEGORY_CONTEXT[params.category];

  const userPrompt = `以下のテーマに基づいて、みんなが匿名で答えるお題を1つ生成してください。

【テーマの軸】 ${axis.labelLeft} ↔ ${axis.labelRight}
【カテゴリ】 ${context}
【日付】 ${params.date}

この軸に関連しつつ、答えに個性が出て、読んだ人が「この人面白いな」と思うようなお題をお願いします。`;

  const result = await runAI({
    taskType: "rendezvous_topic_generation",
    prompt: userPrompt,
    systemPrompt: TOPIC_SYSTEM_PROMPT,
    requireJson: true,
    temperature: 0.9,
    maxOutputTokens: 512,
    preferredProvider: "gemini",
    metadata: {
      date: params.date,
      category: params.category,
      axisId: axis.id,
    },
  });

  // Parse response
  let prompt = "";
  let subtext: string | undefined;

  if (result.structured && typeof result.structured === "object" && !Array.isArray(result.structured)) {
    const s = result.structured as Record<string, unknown>;
    prompt = String(s.prompt ?? s.question ?? s.topic ?? "");
    subtext = s.subtext ? String(s.subtext) : undefined;
  }

  // Fallback: テキストからJSON抽出
  if (!prompt && result.text) {
    try {
      const match = result.text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        prompt = String(parsed.prompt ?? parsed.question ?? "");
        subtext = parsed.subtext ? String(parsed.subtext) : undefined;
      }
    } catch {
      // ignore parse error
    }
  }

  // それでもダメならフォールバック
  if (!prompt) {
    prompt = getFallbackTopic(params.date, params.category, axis);
  }

  return {
    prompt,
    subtext,
    axisId: axis.id,
    category: params.category,
    generationMeta: {
      axisId: axis.id,
      axisLeft: axis.labelLeft,
      axisRight: axis.labelRight,
      axisCategory: axis.category,
      aiProvider: result.provider,
      aiModel: result.model,
    },
  };
}

// ============================================================
// フォールバックお題テンプレート
// ============================================================

const FALLBACK_TEMPLATES: Record<string, string[]> = {
  core: [
    "最近、自分らしいなと感じた瞬間は？",
    "人に「意外だね」と言われたことで、嬉しかったことは？",
    "やる気が出ないとき、最初に手を伸ばすものは？",
  ],
  relational: [
    "初対面の人と、どのくらいの距離感が心地いい？",
    "「この人とは長く付き合えそう」と感じるのはどんなとき？",
    "誰かと意見が合わないとき、どうする？",
  ],
  emotional: [
    "最近、思わず涙が出そうになったのはどんな場面？",
    "ストレスが溜まったとき、一番効く回復法は？",
    "感情を言葉にするのは得意？苦手？",
  ],
  motion: [
    "「これは自分のこだわりだな」と思うものは何？",
    "何かを作るとき、完璧を目指す？それとも早く形にする？",
    "最近「美しい」と感じたものは？",
  ],
  aesthetic: [
    "10年後も好きでいると確信しているものは？",
    "「これは自分の原点だな」と思う体験やモノは？",
    "新しいものと古いもの、どちらに惹かれやすい？",
  ],
  relational_deep: [
    "「この人には見せない自分」がある相手はいる？",
    "相手に合わせすぎて疲れた経験、ある？",
    "長い付き合いの中で、一番大事にしていることは？",
  ],
};

function getFallbackTopic(
  date: string,
  category: string,
  axis: TraitAxisDef,
): string {
  const templates = FALLBACK_TEMPLATES[axis.category] ?? FALLBACK_TEMPLATES.core;
  const idx = dateHash(date, `fallback:${category}`) % templates.length;
  return templates[idx];
}
