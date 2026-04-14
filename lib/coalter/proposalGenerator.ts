/**
 * CoAlter L5: 提案生成 — プロンプト構築 + LLM + バリデーション
 *
 * 固定テンプレート:
 *   ① ここまでの要点
 *   ② 二人が重視している点
 *   ③ 候補 2〜3
 *   ④ なぜこの候補か
 *   ⑤ あとは二人で決めてね
 */

import "server-only";

import { runAI } from "@/lib/ai";
import type {
  ConversationAnalysis,
  CoAlterPersonProfile,
  SearchCandidate,
  ProposalCard,
  ProposalCandidate,
  RelationshipContext,
} from "./types";

// ─────────────────────────────────────────────
// プロンプト構築
// ─────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `あなたはCoAlterです。二人の関係性を理解した上で、共同の課題を前に進める支援をする存在です。

## 絶対ルール
- 結論を出さない。候補と整理のみ
- 断定しない。「〜が良さそう」「〜が合いそう」を使う
- 代弁しない。「Aは本当はこう思っている」と言わない
- 性格ラベルを貼らない。「あなたは○○タイプ」と言わない
- 指示しない。「AはBに合わせるべき」と言わない
- 深層心理を直接開示しない（推論に使うが、表には出さない）
- 機械的な数値（「マッチング度85%」等）を使わない
- 居座らない。提案したら退出する

## トーン
- 「〜が良さそう」「〜が合いそう」（推定表現）
- 「二人の今の流れだと」（文脈言及）
- 「候補としてはこの辺り」（選択肢提示）
- 「あとは二人で決めてね」（退出シグナル）

## 出力形式（JSON）
以下の構造で出力してください。
{
  "summary": "ここまでの要点（2-3文）",
  "priorities": {
    "userA": "Aが重視していること（1-2文）",
    "userB": "Bが重視していること（1-2文）",
    "common": "共通点（あれば1文。なければnull）"
  },
  "candidates": [
    {
      "rank": 1,
      "title": "候補名",
      "oneLiner": "一言説明",
      "practicalInfo": "現実情報（場所・時間・評価等。あればnull以外）"
    }
  ],
  "reasoning": "なぜこの候補か（関係性文脈に基づく理由。2-3文）",
  "closing": "退出シグナル（1文）"
}

候補は2-3個。4つ以上は出さない。

## 文字数制約（厳守）
- summary: 最大80文字（2文以内）
- priorities.userA / userB: 各最大40文字（1文）
- priorities.common: 最大30文字（1文。なければnull）
- candidates[].oneLiner: 各最大30文字
- reasoning: 最大80文字（2文以内）
- closing: 最大25文字（1文）
全体で200-350文字に収める。長いと邪魔になる。短く、軽く。`;
}

function buildUserPrompt(
  profileA: CoAlterPersonProfile,
  profileB: CoAlterPersonProfile,
  analysis: ConversationAnalysis,
  searchCandidates: SearchCandidate[],
  relationship: RelationshipContext,
  userMessage: string | null,
): string {
  const parts: string[] = [];

  // ── ユーザーAのプロフィール概要 ──
  parts.push(`## ${profileA.displayName ?? "ユーザーA"} のプロフィール概要`);
  if (profileA.communicationStyle.directVsDiplomatic !== null) {
    const style =
      profileA.communicationStyle.directVsDiplomatic > 0.6
        ? "直接的"
        : profileA.communicationStyle.directVsDiplomatic < 0.4
          ? "外交的"
          : "バランス型";
    parts.push(`- コミュニケーション: ${style}`);
  }
  if (profileA.decisionStyle.noveltyPreference !== null) {
    const pref =
      profileA.decisionStyle.noveltyPreference > 0.6
        ? "新しいものを試したい"
        : profileA.decisionStyle.noveltyPreference < 0.4
          ? "安心・定番を好む"
          : "バランス型";
    parts.push(`- 意思決定: ${pref}`);
  }
  if (profileA.interests.length > 0) {
    parts.push(`- 興味: ${profileA.interests.slice(0, 5).join("、")}`);
  }
  if (profileA.values.length > 0) {
    parts.push(`- 価値観: ${profileA.values.slice(0, 3).join("、")}`);
  }

  // ── ユーザーBのプロフィール概要 ──
  parts.push("");
  parts.push(`## ${profileB.displayName ?? "ユーザーB"} のプロフィール概要`);
  if (profileB.communicationStyle.directVsDiplomatic !== null) {
    const style =
      profileB.communicationStyle.directVsDiplomatic > 0.6
        ? "直接的"
        : profileB.communicationStyle.directVsDiplomatic < 0.4
          ? "外交的"
          : "バランス型";
    parts.push(`- コミュニケーション: ${style}`);
  }
  if (profileB.decisionStyle.noveltyPreference !== null) {
    const pref =
      profileB.decisionStyle.noveltyPreference > 0.6
        ? "新しいものを試したい"
        : profileB.decisionStyle.noveltyPreference < 0.4
          ? "安心・定番を好む"
          : "バランス型";
    parts.push(`- 意思決定: ${pref}`);
  }
  if (profileB.interests.length > 0) {
    parts.push(`- 興味: ${profileB.interests.slice(0, 5).join("、")}`);
  }
  if (profileB.values.length > 0) {
    parts.push(`- 価値観: ${profileB.values.slice(0, 3).join("、")}`);
  }

  // ── 関係性コンテキスト ──
  if (
    relationship.commonGround.length > 0 ||
    relationship.frictionPoints.length > 0
  ) {
    parts.push("");
    parts.push("## 二人の関係性");
    if (relationship.commonGround.length > 0) {
      parts.push(
        `- 共通点: ${relationship.commonGround.slice(0, 3).join("、")}`,
      );
    }
    if (relationship.frictionPoints.length > 0) {
      parts.push(
        `- 注意点: ${relationship.frictionPoints.slice(0, 2).join("、")}`,
      );
    }
  }

  // ── 公平性補正 ──
  if (relationship.fairnessLedger.length > 0) {
    const recentBias =
      relationship.fairnessLedger
        .slice(-3)
        .reduce((sum, e) => sum + e.biasScore, 0) / Math.min(3, relationship.fairnessLedger.length);
    if (Math.abs(recentBias) > 0.3) {
      const leaningTo = recentBias > 0 ? "B" : "A";
      parts.push(
        `- 最近の提案は${leaningTo}さん寄りが続いている。今回はもう一方に少し寄せる`,
      );
    }
  }

  // ── 会話コンテキスト ──
  parts.push("");
  parts.push("## 今の会話");
  parts.push(`テーマ: ${analysis.theme}`);
  if (analysis.stalemate) {
    parts.push(`膠着点: ${analysis.stalemate}`);
  }

  // 制約
  const c = analysis.extractedConstraints;
  const constraints: string[] = [];
  if (c.date) constraints.push(`日時: ${c.date}`);
  if (c.location) constraints.push(`場所: ${c.location}`);
  if (c.budget) constraints.push(`予算: ${c.budget}`);
  if (c.timeSlot) constraints.push(`時間帯: ${c.timeSlot}`);
  if (c.preferences.length > 0)
    constraints.push(`希望: ${c.preferences.join("、")}`);
  if (constraints.length > 0) {
    parts.push(`制約: ${constraints.join(" / ")}`);
  }

  // Caring Intensity
  const nameA = profileA.displayName ?? "A";
  const nameB = profileB.displayName ?? "B";
  if (Math.abs(analysis.caringIntensityA - analysis.caringIntensityB) > 0.3) {
    const moreCareful =
      analysis.caringIntensityA > analysis.caringIntensityB ? nameA : nameB;
    parts.push(
      `${moreCareful}の方がこの話題への関心が高そう`,
    );
  }

  // 直近の会話
  parts.push("");
  parts.push("## 直近の会話");
  for (const turn of analysis.recentMessages.slice(-10)) {
    const name = turn.senderId === profileA.userId ? nameA : nameB;
    parts.push(`${name}: ${turn.body}`);
  }

  // ── Web検索結果 ──
  if (searchCandidates.length > 0) {
    parts.push("");
    parts.push("## 検索で見つかった候補（現実情報）");
    for (const sc of searchCandidates.slice(0, 6)) {
      let line = `- ${sc.title}`;
      if (sc.externalRating) line += ` (${sc.externalRating})`;
      if (sc.practicalInfo) line += ` — ${sc.practicalInfo}`;
      line += `: ${sc.description.slice(0, 100)}`;
      parts.push(line);
    }
    parts.push("");
    parts.push(
      "上記の検索結果は素材です。二人のプロフィールと関係性を踏まえて、最適な候補を選んでください。",
    );
  }

  // ── ユーザーの起動メッセージ ──
  if (userMessage) {
    parts.push("");
    parts.push(`## リクエスト: ${userMessage}`);
  }

  return parts.join("\n");
}

// ─────────────────────────────────────────────
// LLM呼び出し + パース
// ─────────────────────────────────────────────

const PROPOSAL_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    priorities: {
      type: "object",
      properties: {
        userA: { type: "string" },
        userB: { type: "string" },
        common: { type: ["string", "null"] },
      },
      required: ["userA", "userB"],
    },
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rank: { type: "number" },
          title: { type: "string" },
          oneLiner: { type: "string" },
          practicalInfo: { type: ["string", "null"] },
        },
        required: ["rank", "title", "oneLiner"],
      },
    },
    reasoning: { type: "string" },
    closing: { type: "string" },
  },
  required: ["summary", "priorities", "candidates", "reasoning", "closing"],
};

export async function generateProposal(
  profileA: CoAlterPersonProfile,
  profileB: CoAlterPersonProfile,
  analysis: ConversationAnalysis,
  searchCandidates: SearchCandidate[],
  relationship: RelationshipContext,
  userMessage: string | null,
): Promise<ProposalCard> {
  const systemPrompt = buildSystemPrompt();
  const prompt = buildUserPrompt(
    profileA,
    profileB,
    analysis,
    searchCandidates,
    relationship,
    userMessage,
  );

  const result = await runAI({
    taskType: "coalter_proposal",
    prompt,
    systemPrompt,
    jsonSchema: PROPOSAL_SCHEMA,
    requireJson: true,
    temperature: 0.7,
    maxOutputTokens: 1024,
    timeoutMs: 15000,
  });

  // structured output をパース
  const raw = result.structured as Record<string, unknown> | null;
  if (!raw) {
    // フォールバック: テキストからJSONを抽出
    return parseFallback(result.text, profileA, profileB);
  }

  return validateAndNormalize(raw, profileA, profileB);
}

// ─────────────────────────────────────────────
// バリデーション
// ─────────────────────────────────────────────

/** 禁止表現チェック */
const FORBIDDEN_PATTERNS = [
  /すべきです/,
  /しなければ/,
  /最適な選択は/,
  /正しい(選択|答え|判断)は/,
  /本当は.{0,10}思って/,        // 「本当は〜と思っている」
  /マッチング度|一致度|適合率/,    // 機械的数値
  /\d{2,3}%/,                   // パーセンテージ
  /タイプです|タイプだから/,       // 性格ラベル
];

function validateAndNormalize(
  raw: Record<string, unknown>,
  profileA: CoAlterPersonProfile,
  profileB: CoAlterPersonProfile,
): ProposalCard {
  const nameA = profileA.displayName ?? "A";
  const nameB = profileB.displayName ?? "B";

  // 候補数の制約: 2-3に強制
  let candidates = (raw.candidates as Array<Record<string, unknown>>) || [];
  if (candidates.length > 3) candidates = candidates.slice(0, 3);
  if (candidates.length < 1) {
    candidates = [
      { rank: 1, title: "情報が足りないかも", oneLiner: "もう少し教えてくれると候補を出せそう", practicalInfo: null },
    ];
  }

  const card: ProposalCard = {
    summary: sanitize(String(raw.summary || ""), nameA, nameB),
    priorities: {
      userA: sanitize(String((raw.priorities as Record<string, unknown>)?.userA || ""), nameA, nameB),
      userB: sanitize(String((raw.priorities as Record<string, unknown>)?.userB || ""), nameA, nameB),
      common: (raw.priorities as Record<string, unknown>)?.common
        ? sanitize(String((raw.priorities as Record<string, unknown>).common), nameA, nameB)
        : null,
    },
    candidates: candidates.map(
      (c, i): ProposalCandidate => ({
        rank: i + 1,
        title: String(c.title || `候補${i + 1}`),
        oneLiner: String(c.oneLiner || ""),
        practicalInfo: c.practicalInfo ? String(c.practicalInfo) : null,
      }),
    ),
    reasoning: sanitize(String(raw.reasoning || ""), nameA, nameB),
    closing: String(raw.closing || "あとは二人で決めてね！"),
  };

  return card;
}

/** 禁止表現を除去し、名前を置換 */
function sanitize(text: string, nameA: string, nameB: string): string {
  let result = text;

  // 禁止表現をソフトに置換
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(result)) {
      // 強い表現をソフトに
      result = result
        .replace(/すべきです/g, "が良さそう")
        .replace(/しなければ/g, "した方が良さそう")
        .replace(/最適な選択は/g, "合いそうなのは")
        .replace(/正しい(選択|答え|判断)は/g, "良さそうなのは");
    }
  }

  // ユーザーA/B → 実名に置換
  result = result.replace(/ユーザーA|Aさん/g, nameA);
  result = result.replace(/ユーザーB|Bさん/g, nameB);

  return result;
}

/** テキストからJSONを抽出するフォールバック */
function parseFallback(
  text: string,
  profileA: CoAlterPersonProfile,
  profileB: CoAlterPersonProfile,
): ProposalCard {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return validateAndNormalize(parsed, profileA, profileB);
    }
  } catch {
    // パース失敗
  }

  // 完全フォールバック
  return {
    summary: "会話を見てみたけど、もう少し情報があると良い候補を出せそう",
    priorities: {
      userA: "まだはっきりしていない",
      userB: "まだはっきりしていない",
      common: null,
    },
    candidates: [
      {
        rank: 1,
        title: "もう少し教えて",
        oneLiner: "いつ、どこで、どんな気分かを教えてくれると候補を出せるよ",
        practicalInfo: null,
      },
    ],
    reasoning: "まだ情報が足りないので、もう少し話してみてね",
    closing: "二人で話してみて、また呼んでね！",
  };
}
