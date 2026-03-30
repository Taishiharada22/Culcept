import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { TRAIT_AXES, type TraitAxisKey } from "./traitAxes";
import type { PartnerCategory } from "./partnerTypes";
import type { PartnerObservationTheme } from "./partnerObservation";
import { runAI } from "@/lib/ai";
import { makeStargazerRunMetadata } from "./studentTrack";

// ============================================================
// 相手別動的質問セレクター (v2)
//
// 設計原則:
// 1. AI生成がプライマリ — Stargazerの既存データから逆算して質問を生成
// 2. 回答済み質問は二度と出さない
// 3. 毎回異なる質問が出る（同じプロンプトでも temperature + context で変化）
// 4. 問数は十分に出す（デフォルト15問）
// ============================================================

export type SelectedQuestion = {
  source: "ai_generated";
  question: {
    id: string;
    prompt: string;
    theme?: string;
    options: { id: string; text: string }[];
  };
};

/**
 * 回答済みの質問プロンプトを取得（重複防止用）
 * question_key に "prompt:xxx" 形式で保存されたプロンプトテキストを取得
 */
async function getAnsweredPrompts(
  userId: string,
  partnerContext: string,
): Promise<string[]> {
  // プロンプトテキストベースの回答済み記録を取得
  const { data: promptRecords } = await supabaseAdmin
    .from("stargazer_question_shown")
    .select("question_key")
    .eq("user_id", userId)
    .eq("answered", true)
    .like("question_key", "prompt:%");

  const prompts = (promptRecords ?? [])
    .map((r) => String(r.question_key).replace(/^prompt:/, ""))
    .filter(Boolean);

  // 旧形式のquestion_keyも取得（後方互換）
  const { data: legacyRecords } = await supabaseAdmin
    .from("stargazer_axis_snapshots")
    .select("question_key")
    .eq("user_id", userId)
    .eq("context", partnerContext)
    .not("question_key", "is", null);

  const legacyKeys = (legacyRecords ?? []).map((r) => String(r.question_key)).filter(Boolean);

  return [...prompts, ...legacyKeys];
}

/**
 * Stargazerの既存データを分析して「何を聞くべきか」を決定
 */
async function buildQuestionContext(
  userId: string,
  partnerContext: string,
  partnerCategory: PartnerCategory,
): Promise<{
  knownTraits: string[];      // 既に分かっていること
  unknownAxes: string[];      // まだ分かっていないこと
  contradictions: string[];   // 矛盾している点（深掘りすべき）
  selfVsContextGaps: string[]; // self と context の差（興味深い点）
  totalObservations: number;
}> {
  // selfプロファイル
  const { data: selfProfile } = await supabaseAdmin
    .from("stargazer_context_profiles")
    .select("axis_scores, observation_count")
    .eq("user_id", userId)
    .eq("context", "self")
    .maybeSingle();

  // このcontextのプロファイル
  const { data: ctxProfile } = await supabaseAdmin
    .from("stargazer_context_profiles")
    .select("axis_scores, observation_count")
    .eq("user_id", userId)
    .eq("context", partnerContext)
    .maybeSingle();

  const selfScores = (selfProfile?.axis_scores ?? {}) as Record<string, number>;
  const ctxScores = (ctxProfile?.axis_scores ?? {}) as Record<string, number>;
  const totalObs = ctxProfile?.observation_count ?? 0;

  // 分かっていること
  const knownTraits: string[] = [];
  const unknownAxes: string[] = [];
  const contradictions: string[] = [];
  const selfVsContextGaps: string[] = [];

  // カテゴリに関連する軸を優先
  const relevantCategories: Record<PartnerCategory, string[]> = {
    friend: ["core", "relational", "emotional"],
    romantic: ["relational", "emotional", "relational_deep"],
    spouse: ["relational", "relational_deep", "emotional"],
    family: ["emotional", "relational", "core"],
    colleague: ["core", "relational", "motion"],
  };
  const priorityCategories = relevantCategories[partnerCategory] ?? ["core", "relational"];

  for (const axis of TRAIT_AXES) {
    if (axis.category === "safety") continue; // safety軸は除外

    const selfScore = selfScores[axis.id];
    const ctxScore = ctxScores[axis.id];

    if (ctxScore !== undefined) {
      // 分かっている
      knownTraits.push(`${axis.labelLeft}↔${axis.labelRight}: ${ctxScore > 0 ? axis.labelRight : axis.labelLeft}寄り (${ctxScore.toFixed(2)})`);

      // selfとの差が大きい → 興味深い
      if (selfScore !== undefined && Math.abs(selfScore - ctxScore) > 0.4) {
        selfVsContextGaps.push(
          `${axis.labelLeft}↔${axis.labelRight}: 普段は${selfScore > 0 ? axis.labelRight : axis.labelLeft}だが、この相手の前では${ctxScore > 0 ? axis.labelRight : axis.labelLeft}`,
        );
      }

      // 中間値（不確定）→ 矛盾の可能性
      if (Math.abs(ctxScore) < 0.15) {
        contradictions.push(`${axis.labelLeft}↔${axis.labelRight}: 判定が揺れている（スコア${ctxScore.toFixed(2)}）`);
      }
    } else if (priorityCategories.includes(axis.category)) {
      unknownAxes.push(`${axis.labelLeft} ↔ ${axis.labelRight}`);
    }
  }

  return { knownTraits, unknownAxes, contradictions, selfVsContextGaps, totalObservations: totalObs };
}

/**
 * 相手別の質問を動的生成（AI プライマリ）
 */
export async function selectPartnerQuestions(params: {
  userId: string;
  partnerCategory: PartnerCategory;
  partnerContext: string;
  count?: number;
}): Promise<SelectedQuestion[]> {
  const { userId, partnerCategory, partnerContext, count = 8 } = params;

  // 1. 回答済みプロンプトを取得
  const answeredPrompts = await getAnsweredPrompts(userId, partnerContext);

  // 2. Stargazerの既存データから「何を聞くべきか」を分析
  const context = await buildQuestionContext(userId, partnerContext, partnerCategory);

  // 3. AI で質問を動的生成（タイムアウト付き、失敗時はフォールバック即時返却）
  try {
    const questions = await generateQuestionsFromContext({
      partnerCategory,
      context,
      answeredPrompts,
      count,
    });
    if (questions.length > 0) return questions;
  } catch (err) {
    console.warn("[partnerQuestionSelector] AI failed, using fallback:", err);
  }

  // AI失敗・空配列 → フォールバック質問を即座に返す
  return generateFallbackQuestions(partnerCategory, context.unknownAxes, count);
}

/**
 * Stargazerの分析結果を元にAIで質問を生成
 */
async function generateQuestionsFromContext(params: {
  partnerCategory: PartnerCategory;
  context: Awaited<ReturnType<typeof buildQuestionContext>>;
  answeredPrompts: string[];
  count: number;
}): Promise<SelectedQuestion[]> {
  const { partnerCategory, context, answeredPrompts, count } = params;

  const categoryLabel =
    partnerCategory === "friend" ? "友達" :
    partnerCategory === "romantic" ? "恋人" :
    partnerCategory === "colleague" ? "仕事仲間" :
    partnerCategory === "family" ? "家族" : "配偶者";

  // 分析結果をプロンプトに反映
  const analysisSection = context.totalObservations > 0
    ? `
## 既にわかっていること（${context.totalObservations}回の観測から）
${context.knownTraits.slice(0, 8).map((t) => `- ${t}`).join("\n")}

## まだわかっていないこと（ここを優先的に聞いて）
${context.unknownAxes.slice(0, 10).map((a) => `- ${a}`).join("\n")}

${context.selfVsContextGaps.length > 0 ? `## 興味深い差分（普段の自分とこの相手の前の自分が違う点。深掘りして）\n${context.selfVsContextGaps.slice(0, 5).map((g) => `- ${g}`).join("\n")}` : ""}

${context.contradictions.length > 0 ? `## 揺れている点（矛盾を探る質問を）\n${context.contradictions.slice(0, 3).map((c) => `- ${c}`).join("\n")}` : ""}`
    : `## 初回観測
この相手との関係について何もわかっていません。基本的な傾向から観測を始めてください。
以下の軸を中心に:
${context.unknownAxes.slice(0, 12).map((a) => `- ${a}`).join("\n")}`;

  const avoidSection = answeredPrompts.length > 0
    ? `\n## 過去に出した質問（これらと同じ or 類似の質問は絶対に出さないで）\n${answeredPrompts.slice(-10).map((p) => `- ${p}`).join("\n")}`
    : "";

  try {
    const result = await runAI({
      taskType: "stargazer_partner_dynamic_questions",
      prompt: `「${categoryLabel}」との関係における自分の振る舞いを深く観測する質問を${count}個生成してください。

${analysisSection}
${avoidSection}

## 出力形式 (JSON)
{
  "questions": [
    {
      "id": "pq_${Date.now()}_0",
      "prompt": "質問文（25-60文字、日本語）",
      "options": [
        { "id": "a", "text": "選択肢（10-30文字）" },
        { "id": "b", "text": "..." },
        { "id": "c", "text": "..." },
        { "id": "d", "text": "..." }
      ]
    }
  ]
}`,
      systemPrompt: `あなたはStargazerの観測質問設計者です。

## 質問設計の原則
1. 「この相手と一緒のとき、あなたは…」「この関係において、あなたは…」という視点で問う
2. 選択肢は善悪判断なし。どれも自然な人間の反応
3. 回答に個性が出る質問にする（全員が同じ答えを選ぶ質問は無意味）
4. 表面的な行動ではなく、無意識的な反応パターン・感情の動き・内面の変化を問う
5. 「わかっていないこと」を中心に問い、「わかっていること」の深掘りも混ぜる
6. 「自分との差分」があるポイントは特に深く掘る（普段と違う自分が出る理由を探る）
7. 矛盾・揺れがある軸は、異なる角度から再観測する
8. 同じような質問の繰り返しを避け、毎回新しい角度から問う
9. 質問文は30-60文字。選択肢は4つ、各10-30文字
10. 日本語で出力`,
      requireJson: false, // JSONパースは手動で行う（Geminiの途中切れ対策）
      temperature: 0.85,
      maxOutputTokens: 4096,
      preferredProvider: "gemini",
      timeoutMs: 20_000, // AI生成タイムアウト（20秒超えたらフォールバック）
      metadata: makeStargazerRunMetadata({ feature: "partner_dynamic_questions", category: categoryLabel }),
    });

    // structured or テキストから質問を抽出
    if (result.structured && typeof result.structured === "object" && !Array.isArray(result.structured)) {
      const data = result.structured as Record<string, unknown>;
      const rawQuestions = (data.questions as Array<Record<string, unknown>>) ?? [];
      const parsed = rawQuestions.slice(0, count).map((q, i) => parseOneQuestion(q, i)).filter(Boolean) as SelectedQuestion[];
      if (parsed.length > 0) return parsed;
    }

    // テキストからJSON抽出（部分的でも対応）
    const textSource = result.text || "";
    if (textSource) {
      const extracted = extractQuestionsFromText(textSource, count);
      if (extracted.length > 0) return extracted;
    }
  } catch (err) {
    console.error("[partnerQuestionSelector] AI generation failed:", err);
  }

  // AI失敗時のフォールバック — Stargazerの未観測軸から基本質問を生成
  return generateFallbackQuestions(partnerCategory, context.unknownAxes, count);
}

/**
 * テキストから質問を抽出（部分的なJSONでも対応）
 */
function extractQuestionsFromText(text: string, count: number): SelectedQuestion[] {
  // まずJSON全体を試す
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const rawQ = (parsed.questions ?? []) as Array<Record<string, unknown>>;
      const result = rawQ.slice(0, count).map((q, i) => parseOneQuestion(q, i)).filter(Boolean) as SelectedQuestion[];
      if (result.length > 0) return result;
    }
  } catch {
    // JSON全体が壊れている → 個別の質問オブジェクトを抽出
  }

  // 個別の質問オブジェクトを正規表現で抽出
  const questionMatches = text.matchAll(/\{\s*"id"\s*:\s*"[^"]*"\s*,\s*"prompt"\s*:\s*"([^"]+)"[\s\S]*?"options"\s*:\s*\[([\s\S]*?)\]\s*\}/g);
  const results: SelectedQuestion[] = [];
  let idx = 0;
  for (const m of questionMatches) {
    try {
      const obj = JSON.parse(m[0]);
      const q = parseOneQuestion(obj, idx);
      if (q) { results.push(q); idx++; }
    } catch {
      // skip malformed
    }
    if (results.length >= count) break;
  }
  return results;
}

function parseOneQuestion(q: Record<string, unknown>, i: number): SelectedQuestion | null {
  const prompt = String(q.prompt ?? q.question ?? q.text ?? "");
  if (!prompt) return null;
  const options = ((q.options as Array<Record<string, unknown>>) ?? [])
    .map((o, j) => ({
      id: String(o.id ?? `opt_${j}`),
      text: String(o.text ?? o.label ?? ""),
    }))
    .filter((o) => o.text);
  if (options.length < 2) return null;
  return {
    source: "ai_generated" as const,
    question: {
      id: String(q.id ?? `pq_${Date.now()}_${i}`),
      prompt,
      options,
    },
  };
}

/**
 * AI失敗時のフォールバック質問生成
 */
function generateFallbackQuestions(
  category: PartnerCategory,
  unknownAxes: string[],
  count: number,
): SelectedQuestion[] {
  const categoryLabel =
    category === "friend" ? "友達" :
    category === "romantic" ? "恋人" :
    category === "colleague" ? "仕事仲間" :
    category === "family" ? "家族" : "配偶者";

  const templates = [
    { prompt: `${categoryLabel}と一緒にいるとき、自分はどんな状態になる？`, options: ["リラックスする", "少し緊張する", "エネルギーが湧く", "疲れることもある"] },
    { prompt: `${categoryLabel}に対して、本音をどのくらい言える？`, options: ["ほとんど全部言える", "半分くらい", "あまり言えない", "場面による"] },
    { prompt: `${categoryLabel}との距離感で、一番心地いいのは？`, options: ["毎日連絡するくらい近い", "週に数回話す程度", "月に数回で十分", "必要な時だけ"] },
    { prompt: `${categoryLabel}と意見が違ったとき、どうする？`, options: ["率直に伝える", "やんわり伝える", "相手に合わせる", "話題を変える"] },
    { prompt: `${categoryLabel}に頼み事をするのは？`, options: ["気軽にできる", "少し躊躇する", "あまりしない", "相手が察してくれるのを待つ"] },
    { prompt: `${categoryLabel}の前で、普段と違う自分が出ることはある？`, options: ["ほとんどない", "少しある", "かなりある", "自分でも気づかないうちに"] },
    { prompt: `${categoryLabel}との沈黙は？`, options: ["全然平気", "少し気まずい", "何か話さなきゃと思う", "むしろ心地いい"] },
    { prompt: `${categoryLabel}が落ち込んでいるとき、あなたはどうする？`, options: ["話を聞く", "解決策を提案する", "そっとしておく", "気分転換に誘う"] },
    { prompt: `${categoryLabel}との関係で、一番大事にしていることは？`, options: ["信頼", "楽しさ", "成長", "安心感"] },
    { prompt: `${categoryLabel}に対して、嫉妬や羨ましさを感じることは？`, options: ["ほとんどない", "たまにある", "よくある", "感じるが見せない"] },
    { prompt: `${categoryLabel}との約束を破ってしまったら？`, options: ["すぐ謝る", "理由を説明する", "しばらく連絡を避ける", "次で挽回する"] },
    { prompt: `${categoryLabel}から予想外のことを言われたとき？`, options: ["すぐ反応する", "一度考えてから返す", "表情に出さない", "話題を変える"] },
    { prompt: `${categoryLabel}と長時間一緒にいると？`, options: ["全然平気", "たまに一人になりたくなる", "疲れることが多い", "もっと一緒にいたい"] },
    { prompt: `${categoryLabel}の成功を聞いたとき、最初に感じるのは？`, options: ["純粋に嬉しい", "自分も頑張ろうと思う", "少し焦りを感じる", "自分のことのように喜ぶ"] },
    { prompt: `${categoryLabel}との関係で、一番怖いことは？`, options: ["信頼を失うこと", "退屈になること", "依存しすぎること", "距離ができること"] },
  ];

  return templates.slice(0, count).map((t, i) => ({
    source: "ai_generated" as const,
    question: {
      id: `fb_${Date.now()}_${i}`,
      prompt: t.prompt,
      options: t.options.map((text, j) => ({ id: `opt_${j}`, text })),
    },
  }));
}
