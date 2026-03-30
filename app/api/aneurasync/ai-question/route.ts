import { runAI } from "@/lib/ai";
import { parseStructuredJsonWithRecovery } from "@/lib/ai/structuredJson";
import { NextResponse } from "next/server";

/* ─────────────────────────────────────────────
   Types
   ───────────────────────────────────────────── */

interface RequestBody {
  category: string;
  stage: number;
  timeOfDay: string;
  lastAnswerCategory?: string;
  lastAnswerValue?: number;
  recentCategories?: string[];
  observationCount?: number;
  axisScores?: Record<string, number>;
}

interface GeneratedQuestion {
  id: string;
  robotLine: string;
  choices: { value: number; label: string }[];
  category: string;
  isAiGenerated: true;
  isObservation: true;
}

/* ─────────────────────────────────────────────
   Constants
   ───────────────────────────────────────────── */

const VALID_CATEGORIES = new Set([
  "partner",
  "outfit",
  "care",
  "preparation",
  "impression",
]);

const VALID_TIME_OF_DAY = new Set([
  "morning",
  "afternoon",
  "evening",
  "late_night",
]);

/* ─────────────────────────────────────────────
   Category context map
   ───────────────────────────────────────────── */

const CATEGORY_CONTEXT: Record<string, string> = {
  partner:
    "対人関係における距離感・エネルギー・本音と建前。人に会いたい自分と一人でいたい自分の葛藤、相手に合わせる癖、本音を隠す理由。",
  outfit:
    "服選びに現れる判断基準・自己表現・気分との連動。今日の自分をどう見せたいか、着るもので気分が変わるか、無意識の選択パターン。",
  care:
    "自分を大切にする優先順位・後回しパターン・疲労の自覚。何を犠牲にしがちか、休むことへの罪悪感、自分のケアを後回しにする理由。",
  preparation:
    "計画性・予想外への対応・段取りの背後にある不安や期待。準備しすぎる自分、逆に放置する自分、コントロール欲求の裏にあるもの。",
  impression:
    "自己演出・素の自分と見せたい自分のギャップ。人前での自分と一人の自分の違い、印象を気にする理由、素を見せられる条件。",
};

/* ─────────────────────────────────────────────
   Time-of-day context
   ───────────────────────────────────────────── */

const TIME_CONTEXT: Record<string, string> = {
  morning:
    "朝の時間帯です。一日の始まりに感じる期待・不安・気分のベースラインに関する問いが有効です。",
  afternoon:
    "午後の時間帯です。日中の体験を振り返る、人との関わりの中で感じたことを掘り下げる問いが有効です。",
  evening:
    "夕方〜夜の時間帯です。一日の疲れや充実感、自分だけの時間への欲求に関する問いが有効です。",
  late_night:
    "深夜の時間帯です。防御が緩む時間帯なので、本音に近い問い、普段は認めたくないことへの問いが有効です。",
};

/* ─────────────────────────────────────────────
   Stage-based tone guidance
   ───────────────────────────────────────────── */

function stageGuidance(stage: number): string {
  if (stage <= 2) {
    return `【初期段階 (${stage}/5)】
柔らかい問いかけ、安心感を最優先。
- 「〜ってどんな感じ？」のような開かれた表現
- ユーザーの正解/不正解がない問い
- 日常の具体的な場面に根ざした質問
- 断定や分析的な表現は避ける`;
  }
  if (stage === 3) {
    return `【中期段階 (3/5)】
少し踏み込む、パターンに言及してよい。
- 「〜しがちかも」のようにパターンを示唆
- 前の回答との関連を匂わせる質問
- 矛盾しそうな2つの側面を並べる
- 押しつけがましくならない程度の深さ`;
  }
  return `【深い段階 (${stage}/5)】
率直で核心に迫る。矛盾を突く問いも歓迎。
- 「本当は〜では？」のような直接的な問い
- ユーザーが避けがちなテーマに触れる
- 無自覚な前提を揺さぶる質問
- 「それって本当にそう？」と再考を促す`;
}

/* ─────────────────────────────────────────────
   Axis context for targeting least observed
   ───────────────────────────────────────────── */

function buildAxisContext(axisScores: Record<string, number>): string {
  const entries = Object.entries(axisScores);
  if (entries.length === 0) return "";

  const sorted = entries.sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]));
  const leastObserved = sorted.slice(0, 3).map(([axis]) => axis);

  return `\n\n## まだ観測が浅い軸（優先的に探りたい）
${leastObserved.map((a) => `- ${a}`).join("\n")}

これらの軸に関連する質問を優先的に生成してください。ただし不自然にならない範囲で。`;
}

/* ─────────────────────────────────────────────
   Previous answer empathy context
   ───────────────────────────────────────────── */

function buildPreviousAnswerContext(
  lastAnswerCategory?: string,
  lastAnswerValue?: number,
): string {
  if (!lastAnswerCategory || lastAnswerValue == null) return "";

  const catLabel = CATEGORY_CONTEXT[lastAnswerCategory] ?? lastAnswerCategory;
  if (lastAnswerValue <= 2) {
    return `\n\n## 直前の回答コンテキスト
ユーザーは直前の「${catLabel}」に関する質問で低い値（${lastAnswerValue}/5）を選びました。
何かモヤモヤや違和感を感じている可能性があります。
共感的なトーンで、その感覚を深掘りする方向の質問を意識してください。
「なぜそう感じたか」を責めるのではなく、「その感覚の正体」を一緒に探るスタンスで。`;
  }
  if (lastAnswerValue >= 4) {
    return `\n\n## 直前の回答コンテキスト
ユーザーは直前の「${catLabel}」に関する質問で高い値（${lastAnswerValue}/5）を選びました。
満足や充実を感じている状態です。
その充実感の源泉を探る質問、「いつもそうなのか、今日だけなのか」を問う質問が有効です。`;
  }
  return "";
}

/* ─────────────────────────────────────────────
   Observation count context
   ───────────────────────────────────────────── */

function buildExperienceContext(observationCount?: number): string {
  if (!observationCount) return "";
  if (observationCount > 100) {
    return "\n\nユーザーは100回以上の観測経験があるベテランです。表面的な質問は退屈に感じます。意外な角度、メタ的な視点、自分の変化に気づかせる質問を意識してください。";
  }
  if (observationCount > 50) {
    return "\n\nユーザーは50回以上の観測を重ねています。基本的なパターンは既に把握しつつある段階です。より微妙なニュアンスや例外的な状況に踏み込む質問が有効です。";
  }
  return "";
}

/* ─────────────────────────────────────────────
   Recent categories context
   ───────────────────────────────────────────── */

function buildRecentCategoriesContext(
  recentCategories?: string[],
  currentCategory?: string,
): string {
  if (!recentCategories || recentCategories.length === 0) return "";

  const recentCounts: Record<string, number> = {};
  for (const cat of recentCategories) {
    recentCounts[cat] = (recentCounts[cat] ?? 0) + 1;
  }

  const overAsked = Object.entries(recentCounts)
    .filter(([cat, count]) => count >= 2 && cat === currentCategory)
    .map(([cat]) => cat);

  if (overAsked.length > 0) {
    return `\n\n## カテゴリバランス
「${currentCategory}」カテゴリの質問が最近続いています。
同じ角度の質問を避け、このカテゴリの中でもまだ聞いていない側面を探ってください。`;
  }
  return "";
}

/* ─────────────────────────────────────────────
   System prompt
   ───────────────────────────────────────────── */

const SYSTEM_PROMPT = `あなたはAneurasyncの深層観測AIです。
Daily Observation（日次観測）のための質問を1つ生成します。

# あなたの使命
ユーザーが「自分って、そういう人間だったのか」と気づける瞬間を作ること。
質問は「アンケート」ではなく「観測の入口」です。回答するだけで自己発見につながる質問を作ってください。

# 掴むべきもの
- 安心の源（何があると安定するか）
- 引っかかり（何に無意識に反応するか）
- 疲れの原因（何が本当にエネルギーを奪うか）
- 迷い時の優先軸（最終的に何を選ぶ傾向があるか）
- 自然に動ける条件（どういう状態だとスムーズか）
- 崩れやすい条件（何があると調子を崩すか）

# 出力形式
必ず以下のJSONのみを出力してください。説明文やMarkdownは不要です。

{
  "robotLine": "質問文（30文字以内、カジュアルだが深い）",
  "choices": [
    { "value": 1, "label": "選択肢1（具体的な内面状態の描写）" },
    { "value": 2, "label": "選択肢2" },
    { "value": 3, "label": "選択肢3" },
    { "value": 4, "label": "選択肢4" },
    { "value": 5, "label": "選択肢5" }
  ]
}

# 良い質問の例

例1 (partner):
{
  "robotLine": "今日、誰かに頼れた？",
  "choices": [
    { "value": 1, "label": "頼るという発想自体なかった" },
    { "value": 2, "label": "頼りたかったけど言えなかった" },
    { "value": 3, "label": "必要なかったから頼らなかった" },
    { "value": 4, "label": "自然に頼れる場面があった" },
    { "value": 5, "label": "積極的に助けを求められた" }
  ]
}

例2 (outfit):
{
  "robotLine": "今日の服、誰のために選んだ？",
  "choices": [
    { "value": 1, "label": "考える余裕がなくて適当だった" },
    { "value": 2, "label": "周りに浮かないように選んだ" },
    { "value": 3, "label": "特に誰のためでもなく習慣で" },
    { "value": 4, "label": "自分の気分に合わせて選んだ" },
    { "value": 5, "label": "なりたい自分を意識して選んだ" }
  ]
}

例3 (care, 深いステージ):
{
  "robotLine": "最近、自分に嘘ついてない？",
  "choices": [
    { "value": 1, "label": "大丈夫なふりが癖になってる" },
    { "value": 2, "label": "小さな我慢を積み重ねてる" },
    { "value": 3, "label": "嘘かどうかもわからない" },
    { "value": 4, "label": "少しずつ正直になれてきた" },
    { "value": 5, "label": "自分の本音をちゃんと聞けてる" }
  ]
}

# 悪い質問の例（絶対に避けること）

BAD: 「今日の調子はどうですか？」
→ 一般的すぎる。何も観測できない。

BAD: choices に「ふつう」「まあまあ」「どちらでもない」
→ 曖昧な選択肢は観測にならない。各選択肢は異なる内面パターンを表すこと。

BAD: 「朝ごはんは何を食べましたか？」
→ 事実確認は観測ではない。内面の判断や感情を問うこと。

BAD: choices が似たような表現の言い換え
→ 各選択肢は異なる判断軸・内面パターンを表すこと。1と5は明確に異なる内面状態。

BAD: 「あなたは〇〇なタイプですか？」
→ 性格のラベリングは観測ではない。具体的な状況を通して内面を浮かび上がらせること。

# 重要なルール
- robotLine（質問文）は必ず30文字以内
- choices は必ず5つ、value は 1〜5
- 各選択肢のlabelは具体的な内面状態の描写（15〜30文字程度）
- value=1 は「最も消極的/受動的/無自覚」、value=5 は「最も積極的/能動的/自覚的」
- 全て日本語
- JSON以外のテキストは含めない`;

/* ─────────────────────────────────────────────
   Build user prompt
   ───────────────────────────────────────────── */

function buildPrompt(body: RequestBody): string {
  const categoryCtx = CATEGORY_CONTEXT[body.category] ?? body.category;
  const timeCtx = TIME_CONTEXT[body.timeOfDay] ?? "";
  const stageGuide = stageGuidance(body.stage);

  const axisCtx = body.axisScores
    ? buildAxisContext(body.axisScores)
    : "";
  const prevAnswerCtx = buildPreviousAnswerContext(
    body.lastAnswerCategory,
    body.lastAnswerValue,
  );
  const experienceCtx = buildExperienceContext(body.observationCount);
  const recentCtx = buildRecentCategoriesContext(
    body.recentCategories,
    body.category,
  );

  return `以下の条件で、Daily Observation の質問を1つ生成してください。

## カテゴリ
${body.category}: ${categoryCtx}

## 時間帯
${timeCtx}

## トーン
${stageGuide}${axisCtx}${prevAnswerCtx}${experienceCtx}${recentCtx}

JSONのみで回答してください。`;
}

/* ─────────────────────────────────────────────
   Fallback questions per category
   ───────────────────────────────────────────── */

const FALLBACK_QUESTIONS: Record<string, Omit<GeneratedQuestion, "id" | "isAiGenerated" | "isObservation">> = {
  partner: {
    robotLine: "今日、人との距離感どうだった？",
    choices: [
      { value: 1, label: "誰とも関わりたくなかった" },
      { value: 2, label: "必要最低限で済ませた" },
      { value: 3, label: "いつも通りの距離感だった" },
      { value: 4, label: "心地よい距離で過ごせた" },
      { value: 5, label: "もっと深く関わりたかった" },
    ],
    category: "partner",
  },
  outfit: {
    robotLine: "今日の自分、見た目に満足？",
    choices: [
      { value: 1, label: "鏡を見たくなかった" },
      { value: 2, label: "妥協した感じが残ってる" },
      { value: 3, label: "特に意識しなかった" },
      { value: 4, label: "まあまあ自分らしかった" },
      { value: 5, label: "今日の自分は好きだった" },
    ],
    category: "outfit",
  },
  care: {
    robotLine: "自分のこと、後回しにしてない？",
    choices: [
      { value: 1, label: "全部後回しにしてる気がする" },
      { value: 2, label: "やるべきことを優先してしまう" },
      { value: 3, label: "たまに思い出す程度" },
      { value: 4, label: "意識的に時間を取れている" },
      { value: 5, label: "自分を最優先にできた" },
    ],
    category: "care",
  },
  preparation: {
    robotLine: "想定外のこと、今日あった？",
    choices: [
      { value: 1, label: "パニックになってしまった" },
      { value: 2, label: "焦ったけどなんとか対処した" },
      { value: 3, label: "特に想定外はなかった" },
      { value: 4, label: "柔軟に対応できた" },
      { value: 5, label: "想定外を楽しめた" },
    ],
    category: "preparation",
  },
  impression: {
    robotLine: "今日、素の自分でいられた？",
    choices: [
      { value: 1, label: "ずっと仮面をかぶっていた" },
      { value: 2, label: "場面によって使い分けた" },
      { value: 3, label: "あまり考えなかった" },
      { value: 4, label: "わりと自然体でいられた" },
      { value: 5, label: "完全に素の自分だった" },
    ],
    category: "impression",
  },
};

/* ─────────────────────────────────────────────
   Validation helpers
   ───────────────────────────────────────────── */

function validateAndNormalizeQuestion(
  parsed: Record<string, unknown>,
  category: string,
): GeneratedQuestion | null {
  const robotLine =
    typeof parsed.robotLine === "string" ? parsed.robotLine.trim() : null;
  if (!robotLine || robotLine.length === 0 || robotLine.length > 60) {
    return null;
  }

  if (!Array.isArray(parsed.choices) || parsed.choices.length !== 5) {
    return null;
  }

  const choices: { value: number; label: string }[] = [];
  for (let i = 0; i < 5; i++) {
    const c = parsed.choices[i] as Record<string, unknown> | undefined;
    if (!c || typeof c.label !== "string" || !c.label.trim()) return null;

    const value = typeof c.value === "number" ? c.value : i + 1;
    if (value < 1 || value > 5) return null;

    choices.push({ value, label: c.label.trim() });
  }

  // Ensure values are 1-5
  const values = new Set(choices.map((c) => c.value));
  if (values.size !== 5) {
    // Re-assign sequential values
    choices.forEach((c, i) => {
      c.value = i + 1;
    });
  }

  return {
    id: `ai_${Date.now()}`,
    robotLine,
    choices,
    category,
    isAiGenerated: true,
    isObservation: true,
  };
}

/* ─────────────────────────────────────────────
   POST handler
   ───────────────────────────────────────────── */

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;

    // --- Validation ---
    if (!body.category || !VALID_CATEGORIES.has(body.category)) {
      return NextResponse.json(
        {
          ok: false,
          error: `category must be one of: ${Array.from(VALID_CATEGORIES).join(", ")}`,
        },
        { status: 400 },
      );
    }

    if (
      typeof body.stage !== "number" ||
      body.stage < 1 ||
      body.stage > 5
    ) {
      return NextResponse.json(
        { ok: false, error: "stage must be 1-5" },
        { status: 400 },
      );
    }

    if (!body.timeOfDay || !VALID_TIME_OF_DAY.has(body.timeOfDay)) {
      return NextResponse.json(
        {
          ok: false,
          error: `timeOfDay must be one of: ${Array.from(VALID_TIME_OF_DAY).join(", ")}`,
        },
        { status: 400 },
      );
    }

    // --- Build prompt and call AI ---
    const prompt = buildPrompt(body);

    const result = await runAI({
      taskType: "aneurasync_question_generation",
      prompt,
      systemPrompt: SYSTEM_PROMPT,
      temperature: 0.8,
      maxOutputTokens: 800,
      requireJson: false,
      metadata: {
        category: body.category,
        stage: body.stage,
        timeOfDay: body.timeOfDay,
        observationCount: body.observationCount ?? 0,
        hasAxisScores: !!(body.axisScores && Object.keys(body.axisScores).length > 0),
      },
    });

    if (!result.success) {
      console.error(
        "[ai-question] AI call failed:",
        result.errorMessage,
      );
      return NextResponse.json({
        ok: true,
        question: buildFallbackQuestion(body.category),
        fallback: true,
      });
    }

    // --- Parse response ---
    let rawText = result.text?.trim() ?? "";
    console.log(
      "[ai-question] success:",
      result.success,
      "text length:",
      rawText.length,
      "cacheHit:",
      result.cacheHit,
    );

    // Strip markdown code fences
    rawText = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    let question: GeneratedQuestion | null = null;

    try {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        parsed = parseStructuredJsonWithRecovery(rawText) as Record<
          string,
          unknown
        >;
      }
      question = validateAndNormalizeQuestion(parsed, body.category);
    } catch {
      // parse failed
    }

    if (!question) {
      console.warn(
        "[ai-question] Could not parse/validate AI response, using fallback. Raw:",
        rawText.slice(0, 200),
      );
      return NextResponse.json({
        ok: true,
        question: buildFallbackQuestion(body.category),
        fallback: true,
      });
    }

    return NextResponse.json({ ok: true, question });
  } catch (error) {
    console.error("[ai-question] Unexpected error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

/* ─────────────────────────────────────────────
   Fallback builder
   ───────────────────────────────────────────── */

function buildFallbackQuestion(category: string): GeneratedQuestion {
  const fallback = FALLBACK_QUESTIONS[category] ?? FALLBACK_QUESTIONS.care;
  return {
    id: `ai_${Date.now()}`,
    ...fallback,
    category,
    isAiGenerated: true,
    isObservation: true,
  };
}
