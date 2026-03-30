import "server-only";

import { runAI } from "@/lib/ai";
import type { RendezvousCategory } from "./types";

// ============================================================
// Rendezvous 予言エンジン
// ユーザーのStargazerプロファイルから「3日後に出会う人」を予言
// 実際にはA〜Dのペアリングで予言を「実現」させる
// ============================================================

export type ProphecyType =
  | "opposite_attraction"  // 正反対なのに気になる人
  | "mirror_encounter"     // 自分と似すぎて驚く人
  | "unexpected_resonance" // 想像もしなかった共鳴
  | "depth_catalyst"       // 深い会話に引き込まれる人
  | "comfort_disruptor"    // 安全圏を壊す人
  | "silent_understanding" // 言葉なしで通じ合う人

const PROPHECY_TYPES: { type: ProphecyType; weight: number }[] = [
  { type: "opposite_attraction", weight: 20 },
  { type: "mirror_encounter", weight: 15 },
  { type: "unexpected_resonance", weight: 25 },
  { type: "depth_catalyst", weight: 20 },
  { type: "comfort_disruptor", weight: 10 },
  { type: "silent_understanding", weight: 10 },
];

const PROPHECY_SYSTEM_PROMPT = `あなたはRendezvousの予言生成者です。
ユーザーの性格プロファイルを元に、近い未来の出会いを予言します。

## 設計原則
1. 具体的すぎず、でもぼんやりしすぎない（「誰か」ではなく「こういう人」）
2. ワクワクする予感を感じさせる
3. 予言はポジティブ — 恐怖や不安を煽らない
4. 日本語で、詩的だが簡潔に（2-3文、合計60文字以内）
5. 自分の未知の側面を引き出す出会いを示唆する

## 出力形式 (JSON)
{
  "prophecy": "予言テキスト",
  "hint": "予言のヒント（20文字以内、予言が的中したかの判定基準）"
}`;

function weightedRandom(items: { type: ProphecyType; weight: number }[]): ProphecyType {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item.type;
  }
  return items[0].type;
}

const TYPE_DESCRIPTIONS: Record<ProphecyType, string> = {
  opposite_attraction: "ユーザーと正反対の性格特性を持つが、強く惹かれ合う相手",
  mirror_encounter: "ユーザーと驚くほど似た価値観を持つ相手",
  unexpected_resonance: "予想もしなかった分野で深い共鳴が起きる相手",
  depth_catalyst: "会話が自然と深い話題に向かう触媒のような相手",
  comfort_disruptor: "居心地のいい場所から一歩踏み出させてくれる相手",
  silent_understanding: "多くを語らずとも感覚で通じ合う相手",
};

export type GeneratedProphecy = {
  prophecyText: string;
  prophecyType: ProphecyType;
  hint?: string;
  targetDaysFromNow: number;
  category?: RendezvousCategory;
};

/**
 * 予言を生成
 */
export async function generateProphecy(params: {
  userId: string;
  /** ユーザーの主要軸スコア（上位5つ程度） */
  topTraits?: { axisId: string; label: string; score: number }[];
  category?: RendezvousCategory;
}): Promise<GeneratedProphecy> {
  const prophecyType = weightedRandom(PROPHECY_TYPES);
  const targetDays = 2 + Math.floor(Math.random() * 4); // 2-5日後

  const traitContext = params.topTraits?.length
    ? params.topTraits
        .map((t) => `${t.label}: ${t.score > 0 ? "右寄り" : "左寄り"} (${t.score.toFixed(2)})`)
        .join("\n")
    : "（プロファイル未取得）";

  const userPrompt = `以下のユーザーに対して、${targetDays}日以内の出会いを予言してください。

【予言タイプ】 ${TYPE_DESCRIPTIONS[prophecyType]}
【ユーザーの傾向】
${traitContext}
${params.category ? `【カテゴリ】 ${params.category}` : ""}

予言は「〜な人に出会う」という形式で。`;

  const result = await runAI({
    taskType: "rendezvous_prophecy_generation",
    prompt: userPrompt,
    systemPrompt: PROPHECY_SYSTEM_PROMPT,
    requireJson: true,
    temperature: 1.0,
    maxOutputTokens: 256,
    preferredProvider: "gemini",
    userId: params.userId,
  });

  let prophecyText = "";
  let hint: string | undefined;

  if (result.structured && typeof result.structured === "object" && !Array.isArray(result.structured)) {
    const s = result.structured as Record<string, unknown>;
    prophecyText = String(s.prophecy ?? s.text ?? "");
    hint = s.hint ? String(s.hint) : undefined;
  }

  if (!prophecyText && result.text) {
    try {
      const match = result.text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        prophecyText = String(parsed.prophecy ?? parsed.text ?? "");
        hint = parsed.hint ? String(parsed.hint) : undefined;
      }
    } catch {
      // ignore
    }
  }

  // Fallback
  if (!prophecyText) {
    prophecyText = FALLBACK_PROPHECIES[prophecyType] ?? "あなたの世界を少しだけ揺らす人が、近づいています。";
  }

  return {
    prophecyText,
    prophecyType,
    hint,
    targetDaysFromNow: targetDays,
    category: params.category,
  };
}

const FALLBACK_PROPHECIES: Record<ProphecyType, string> = {
  opposite_attraction: "自分とは正反対なのに、なぜか目が離せない人に出会います。",
  mirror_encounter: "「この人、自分と同じことを考えている」と驚く瞬間が訪れます。",
  unexpected_resonance: "予想もしなかった角度から、深い共鳴を感じる人が現れます。",
  depth_catalyst: "気づいたら、普段は話さないようなことまで話している相手に出会います。",
  comfort_disruptor: "いつもの自分では選ばない方向へ、自然と導いてくれる人が来ます。",
  silent_understanding: "言葉より先に、感覚で通じ合う不思議な出会いが待っています。",
};
