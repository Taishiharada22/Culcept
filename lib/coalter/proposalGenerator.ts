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
  ConversationTheme,
  CoAlterPersonProfile,
  SearchCandidate,
  ProposalCard,
  ProposalCandidate,
  RelationshipContext,
  AxisKey,
  AxisScores,
  PendingAxisDeltas,
} from "./types";
import { deltasToTemplate, getAxesForTheme, getAxisMeta } from "./axes";

// ─────────────────────────────────────────────
// プロンプト構築
// ─────────────────────────────────────────────

function buildSystemPrompt(theme: ConversationTheme): string {
  const axes = getAxesForTheme(theme);
  const axisExplanation = axes
    .map((k) => {
      const m = getAxisMeta(k);
      return `  - "${k}" (${m.label}): 0=${m.lowLabel} / 3=${m.highLabel}`;
    })
    .join("\n");

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
      "title": "具体的な候補名（作品名・店名・スポット名）",
      "oneLiner": "なぜこの二人に合いそうか（性格・好み・会話文脈を踏まえた理由）",
      "practicalInfo": "現実情報（場所・時間・評価・料金等。あればnull以外）",
      "axisScores": { "price": 1, "access": 2, "novelty": 1 }
    }
  ],
  "reasoning": "全体としてなぜこの候補群を選んだか（関係性文脈に基づく理由。2-3文）",
  "closing": "退出シグナル（1文）",
  "pairFitScore": 2,
  "missingConstraints": [
    {
      "key": "条件キー（price_range, atmosphere, time_slot, area, genre, duration等）",
      "question": "ユーザーに聞く質問（例: '予算はどれくらい？'）",
      "priority": 1
    }
  ]
}

## 評価軸（axisScores）について
各候補に、以下の軸で 0〜3 の整数スコアを付けてください。
${axisExplanation}

- axisScores は必ず全ての軸を含める
- 0=軸の低い側に寄っている / 3=軸の高い側に寄っている / 1,2は中間
- 候補を並べたとき、軸ごとに値が分かれるように（全部同じスコアは不可）

## pairFitScore（関係性メタ指標）
- 0〜3 の整数
- この提案群がどれだけ「二人に合っている」か
- 0=どちらかに偏る / 3=二人の関心が揃う
- カードに1つだけ付ける（候補ごとではなくカード全体で1つ）

missingConstraintsは「まだ候補を絞りきれていない条件」を洗い出す。
会話から読み取れなかった情報を最大3つ、優先度順に列挙する。
全て揃っていると感じたら空配列[]を返す。

候補は2-3個。4つ以上は出さない。

## 候補の品質基準（重要）
- title は必ず具体名（「映画」「美術館」ではなく「窓ぎわのトットちゃん」「森美術館」のような固有名詞）
- ランキングページや一覧サイトを候補にしない（「Filmarks 恋愛映画ランキング」は候補ではない）
- oneLiner は「なぜこの二人に合うか」を書く（「安定のアクション」ではなく「二人とも冒険より安心派だから、評判の良いこれが合いそう」）
- 検索結果がある場合は、検索結果の中から具体的な候補を選ぶ
- 検索結果がない・足りない場合は、会話の文脈から具体的な候補を提案する

## 文字数制約（厳守）
- summary: 最大80文字（2文以内）
- priorities.userA / userB: 各最大50文字（1文）
- priorities.common: 最大30文字（1文。なければnull）
- candidates[].title: 最大30文字（固有名詞）
- candidates[].oneLiner: 最大60文字（理由付き）
- reasoning: 最大100文字（2-3文）
- closing: 最大25文字（1文）
全体で250-450文字に収める。`;
}

export function buildUserPrompt(
  profileA: CoAlterPersonProfile,
  profileB: CoAlterPersonProfile,
  analysis: ConversationAnalysis,
  searchCandidates: SearchCandidate[],
  relationship: RelationshipContext,
  userMessage: string | null,
  options?: {
    pendingDeltas?: PendingAxisDeltas;
    avoidKeys?: string[];
  },
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
      if (sc.url) line += ` [${sc.source}]`;
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

  // ── Phase 1.5: pendingDeltas（前回からの軸操作指示） ──
  const pendingDeltas = options?.pendingDeltas ?? {};
  const deltaEntries = Object.entries(pendingDeltas).filter(
    ([, v]) => v === 1 || v === -1,
  );
  if (deltaEntries.length > 0) {
    parts.push("");
    parts.push("## 前回からの調整方向");
    for (const [key, delta] of deltaEntries) {
      const meta = getAxisMeta(key as AxisKey);
      const dir = delta > 0 ? "上げる" : "下げる";
      parts.push(`- ${meta.label}(${key}): ${dir}方向（${delta > 0 ? meta.highLabel : meta.lowLabel}寄りに）`);
    }
    parts.push("前回の候補と比べて、上記の方向に寄せた候補を組み直してください。");
  }

  // ── Phase 1.5: avoidKeys（既出候補の再提示回避） ──
  const avoidKeys = options?.avoidKeys ?? [];
  if (avoidKeys.length > 0) {
    parts.push("");
    parts.push("## 避けるべき既出候補");
    parts.push("以下のキーと同一の候補は避けてください（既にユーザーに提示済み）:");
    for (const k of avoidKeys.slice(0, 20)) {
      parts.push(`- ${k}`);
    }
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
          axisScores: { type: "object" },
        },
        required: ["rank", "title", "oneLiner"],
      },
    },
    reasoning: { type: "string" },
    closing: { type: "string" },
    pairFitScore: { type: "number" },
    missingConstraints: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          question: { type: "string" },
          priority: { type: "number" },
        },
        required: ["key", "question", "priority"],
      },
    },
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
  options?: {
    pendingDeltas?: PendingAxisDeltas;
    avoidKeys?: string[];
  },
): Promise<ProposalCard> {
  const theme = analysis.theme;
  const systemPrompt = buildSystemPrompt(theme);
  const prompt = buildUserPrompt(
    profileA,
    profileB,
    analysis,
    searchCandidates,
    relationship,
    userMessage,
    options,
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
    return parseFallback(result.text, profileA, profileB, theme, options);
  }

  return validateAndNormalize(raw, profileA, profileB, theme, options);
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
  theme: ConversationTheme,
  options?: {
    pendingDeltas?: PendingAxisDeltas;
    avoidKeys?: string[];
  },
): ProposalCard {
  const nameA = profileA.displayName ?? "A";
  const nameB = profileB.displayName ?? "B";

  // 候補数の制約: 2-3に強制
  let candidates = (raw.candidates as Array<Record<string, unknown>>) || [];
  if (candidates.length > 3) candidates = candidates.slice(0, 3);
  if (candidates.length < 1) {
    candidates = [
      { rank: 1, title: "情報が足りないかも", oneLiner: "もう少し教えてくれると候補を出せそう", practicalInfo: null, url: null },
    ];
  }

  // テーマから availableAxes を固定（LLMの変動を許容しない）
  const availableAxes = getAxesForTheme(theme);

  // pairFitScore のパース
  const rawPairFit = raw.pairFitScore;
  const pairFitScore = parsePairFitScore(rawPairFit);

  // reasoning: pendingDeltas があれば先頭にテンプレを差し込む
  const rawReasoning = sanitize(String(raw.reasoning || ""), nameA, nameB);
  const reasoning = prependDeltaTemplate(rawReasoning, options?.pendingDeltas);

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
        url: c.url ? String(c.url) : null,
        axisScores: parseAxisScores(c.axisScores, availableAxes),
      }),
    ),
    reasoning,
    closing: String(raw.closing || "あとは二人で決めてね！"),
    missingConstraints: parseMissingConstraints(raw.missingConstraints),
    availableAxes,
    pairFitScore,
  };

  return card;
}

/** axisScores を 0-3 にクランプし、availableAxes のみ残す */
function parseAxisScores(
  raw: unknown,
  availableAxes: AxisKey[],
): AxisScores | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const src = raw as Record<string, unknown>;
  const result: AxisScores = {};
  for (const key of availableAxes) {
    const v = src[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      const clamped = Math.max(0, Math.min(3, Math.round(v))) as 0 | 1 | 2 | 3;
      result[key] = clamped;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** pairFitScore を 0-3 にクランプ */
function parsePairFitScore(raw: unknown): 0 | 1 | 2 | 3 | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  return Math.max(0, Math.min(3, Math.round(raw))) as 0 | 1 | 2 | 3;
}

/** pendingDeltas があれば reasoning の先頭に固定テンプレを差し込む */
function prependDeltaTemplate(
  reasoning: string,
  pendingDeltas?: PendingAxisDeltas,
): string {
  if (!pendingDeltas) return reasoning;
  const deltasRecord: Record<string, number> = {};
  for (const [k, v] of Object.entries(pendingDeltas)) {
    if (v === 1 || v === -1) deltasRecord[k] = v;
  }
  if (Object.keys(deltasRecord).length === 0) return reasoning;
  const template = deltasToTemplate(deltasRecord);
  if (!template) return reasoning;
  return reasoning.length > 0 ? `${template} ${reasoning}` : template;
}

/** missingConstraintsをパースし、優先度順にソート */
function parseMissingConstraints(
  raw: unknown,
): ProposalCard["missingConstraints"] {
  if (!Array.isArray(raw) || raw.length === 0) return [];

  return raw
    .filter((item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null && "key" in item && "question" in item,
    )
    .map((item) => ({
      key: String(item.key || "unknown"),
      question: String(item.question || ""),
      priority: typeof item.priority === "number" ? item.priority : 99,
    }))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3); // 最大3つ
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
  theme: ConversationTheme,
  options?: {
    pendingDeltas?: PendingAxisDeltas;
    avoidKeys?: string[];
  },
): ProposalCard {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return validateAndNormalize(parsed, profileA, profileB, theme, options);
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
        url: null,
      },
    ],
    reasoning: "まだ情報が足りないので、もう少し話してみてね",
    closing: "二人で話してみて、また呼んでね！",
    availableAxes: getAxesForTheme(theme),
  };
}
