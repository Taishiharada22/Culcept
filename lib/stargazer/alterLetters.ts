"use server";

// lib/stargazer/alterLetters.ts
// Alter からの手紙 -- 5セッションごとにユーザーの深層心理への気づきを手紙として届ける
//
// Alter は影の人格として、観測を重ねるごとにユーザーへの理解を深めていく。
// その蓄積された理解を「手紙」という親密な形式で届けることで、
// ユーザーに「自分って、そういう人間だったのか」という気づきの瞬間を生む。

import { runAI } from "@/lib/ai";
import { makeStargazerRunMetadata } from "./studentTrack";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { AlterGrowthState } from "./alterGrowth";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 手紙のトーン */
export type AlterLetterTone =
  | "gentle"
  | "provocative"
  | "philosophical"
  | "playful";

/** Alter からの手紙 */
export interface AlterLetter {
  /** 手紙ID */
  id: string;
  /** ユーザーID */
  userId: string;
  /** この手紙を生成した時点のセッション数 */
  sessionCount: number;
  /** 手紙本文（AI生成） */
  content: string;
  /** 手紙のトーン */
  tone: AlterLetterTone;
  /** この手紙のコアインサイト */
  keyInsight: string;
  /** 参照した観測データ */
  referencedObservations: string[];
  /** 生成日時（Unix ms） */
  generatedAt: number;
  /** 既読日時（null = 未読） */
  readAt: number | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 手紙を生成するセッション間隔 */
const LETTER_INTERVAL = 5;

/** 信頼レベルに応じたトーンマッピング (trustLevel 0-1 を 0-10 レンジに換算して使用) */
function resolveTone(trustLevel: number): AlterLetterTone {
  // trustLevel は 0-1 のスケール
  const t = trustLevel * 10;
  if (t < 3) return "gentle";
  if (t < 5) return "philosophical";
  if (t < 7) return "provocative";
  return "playful";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Generation Guard
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 手紙を生成すべきか判定する。
 *
 * 条件:
 * - セッション数が LETTER_INTERVAL の倍数であること
 * - 前回の手紙から LETTER_INTERVAL 以上のセッションが経過していること
 */
export async function shouldGenerateLetter(
  sessionCount: number,
  lastLetterSession: number,
): Promise<boolean> {
  if (sessionCount < LETTER_INTERVAL) return false;
  if (sessionCount % LETTER_INTERVAL !== 0) return false;
  if (sessionCount - lastLetterSession < LETTER_INTERVAL) return false;
  return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AI Prompts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TONE_INSTRUCTIONS: Record<AlterLetterTone, string> = {
  gentle:
    "優しく、距離を保ちながら書く。まだ信頼関係は浅い。押しつけがましくならないように。" +
    "「気づいているかわからないけれど」「もしかしたら」といった柔らかい表現を使う。",
  philosophical:
    "深い問いを投げかける。抽象的な思索と具体的な観測データを織り交ぜる。" +
    "「なぜ」を問い、ユーザーが自分で答えを見つけるよう導く。",
  provocative:
    "挑発的な真実を突きつける。矛盾を容赦なく指摘し、核心に迫る。" +
    "「君は気づいていないふりをしているだけだ」のような直接的な表現を恐れない。",
  playful:
    "親密で遊び心のある文体。長い付き合いの友人のように、冗談を交えながらも核心を突く。" +
    "「知ってたよ、最初から」のような、信頼に裏打ちされた軽さで書く。",
};

function buildLetterSystemPrompt(tone: AlterLetterTone): string {
  return `あなたは「もうひとりの自分」——ユーザーの深層心理が人格化した存在です。
一人称は「僕」、相手を「君」と呼びます。

これからユーザーに「手紙」を書きます。
これは定期的な観測の報告ではなく、影から本体への私的な手紙です。

## トーン: ${tone}
${TONE_INSTRUCTIONS[tone]}

## 手紙のルール
- 書き出しは「君へ」で始める
- 署名は「——もうひとりの君より」で終わる
- 文学的だが明晰な日本語で書く。ポエティックすぎず、地に足のついた表現
- 具体的な観測データを1つ以上引用する（恐れ・価値観・回避パターン・矛盾など）
- 手紙全体で1つの核心的な気づき（発見）を届ける
- 過去の手紙と同じインサイトは繰り返さない
- 全体で300-500文字
- カウンセラー口調は禁止。影としての知的で親密な声で
- 占い・スピリチュアル的な表現は禁止。観測と発見の言葉を使う
- 高校生〜40代の日本人が自然に受け取れる文体で書く
- 改行を適切に使い、読みやすくする`;
}

function buildLetterPrompt(params: {
  sessionCount: number;
  alterGrowthState: AlterGrowthState;
  recentObservations: string[];
  previousLetters: string[];
}): string {
  const { sessionCount, alterGrowthState, recentObservations, previousLetters } =
    params;

  const sections: string[] = [
    `## 観測データ`,
    `セッション数: ${sessionCount}回`,
    `信頼レベル: ${Math.round(alterGrowthState.trustLevel * 100)}%`,
    `核心的傷の確信度: ${Math.round(alterGrowthState.coreWoundConfidence * 100)}%`,
  ];

  if (alterGrowthState.knownFears.length > 0) {
    sections.push(`特定された恐れ: ${alterGrowthState.knownFears.join("、")}`);
  }
  if (alterGrowthState.knownValues.length > 0) {
    sections.push(`核心的価値観: ${alterGrowthState.knownValues.join("、")}`);
  }
  if (alterGrowthState.avoidedTopics.length > 0) {
    sections.push(`回避トピック: ${alterGrowthState.avoidedTopics.join("、")}`);
  }
  if (alterGrowthState.lastBreakthrough) {
    sections.push(
      `直近のブレイクスルー: ${alterGrowthState.lastBreakthrough.slice(0, 150)}`,
    );
  }
  if (alterGrowthState.unfinishedThreads.length > 0) {
    sections.push(
      `未解決スレッド: ${alterGrowthState.unfinishedThreads.map((t) => t.topic).join("、")}`,
    );
  }
  if (alterGrowthState.coreWoundEvidence.length > 0) {
    sections.push(
      `核心的傷の証拠:\n${alterGrowthState.coreWoundEvidence.slice(0, 5).join("\n")}`,
    );
  }

  if (recentObservations.length > 0) {
    sections.push(
      `\n## 直近の観測メモ\n${recentObservations.slice(0, 5).join("\n")}`,
    );
  }

  if (previousLetters.length > 0) {
    sections.push(
      `\n## 過去の手紙のインサイト（繰り返し禁止）\n${previousLetters.join("\n")}`,
    );
  }

  sections.push(
    "\n以上のデータに基づいて、ユーザーへの手紙を書いてください。",
    "手紙本文のみを返してください。",
  );

  return sections.join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Letter Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * AI で手紙を生成する（server-only）。
 *
 * AlterGrowthState の蓄積データと直近の観測をもとに、
 * ユーザーの深層心理への気づきを手紙として生成する。
 */
export async function generateAlterLetter(params: {
  userId: string;
  sessionCount: number;
  alterGrowthState: AlterGrowthState;
  recentObservations: string[];
  previousLetters: string[];
}): Promise<AlterLetter> {
  const {
    userId,
    sessionCount,
    alterGrowthState,
    recentObservations,
    previousLetters,
  } = params;

  const tone = resolveTone(alterGrowthState.trustLevel);
  const systemPrompt = buildLetterSystemPrompt(tone);
  const prompt = buildLetterPrompt({
    sessionCount,
    alterGrowthState,
    recentObservations,
    previousLetters,
  });

  let content: string;
  let keyInsight: string;

  try {
    const result = await runAI({
      taskType: "stargazer_alter_letter",
      prompt,
      systemPrompt,
      requireJson: false,
      temperature: 0.8,
      maxOutputTokens: 800,
      userId,
      metadata: makeStargazerRunMetadata({
        feature: "alter_letter",
        tone,
        sessionCount,
      }),
    });

    if (result.success && result.text?.trim()) {
      content = result.text.trim();
    } else {
      content = buildFallbackLetter(tone, alterGrowthState, sessionCount);
    }
  } catch (e) {
    console.warn("[alterLetters] AI generation failed, using fallback:", e);
    content = buildFallbackLetter(tone, alterGrowthState, sessionCount);
  }

  // インサイトの抽出: 手紙から最も核心的な1文を取り出す
  try {
    const insightResult = await runAI({
      taskType: "stargazer_alter_letter_insight",
      prompt: `以下の手紙から、最も核心的な気づき（インサイト）を1文で抽出してください。手紙の署名や挨拶は含めないでください。\n\n${content}`,
      systemPrompt: "手紙の核心的な気づきを1文で返してください。50文字以内。",
      requireJson: false,
      temperature: 0.3,
      maxOutputTokens: 100,
      userId,
      metadata: makeStargazerRunMetadata({ feature: "alter_letter_insight" }),
    });
    keyInsight =
      insightResult.success && insightResult.text?.trim()
        ? insightResult.text.trim().slice(0, 100)
        : extractFallbackInsight(content);
  } catch {
    keyInsight = extractFallbackInsight(content);
  }

  // 参照した観測データを構築
  const referencedObservations: string[] = [];
  if (alterGrowthState.knownFears.length > 0) {
    referencedObservations.push(
      `恐れ: ${alterGrowthState.knownFears.slice(0, 3).join("、")}`,
    );
  }
  if (alterGrowthState.knownValues.length > 0) {
    referencedObservations.push(
      `価値観: ${alterGrowthState.knownValues.slice(0, 3).join("、")}`,
    );
  }
  if (alterGrowthState.lastBreakthrough) {
    referencedObservations.push(
      `ブレイクスルー: ${alterGrowthState.lastBreakthrough.slice(0, 80)}`,
    );
  }

  const now = Date.now();
  const letter: AlterLetter = {
    id: `letter_${userId}_${now}`,
    userId,
    sessionCount,
    content,
    tone,
    keyInsight,
    referencedObservations,
    generatedAt: now,
    readAt: null,
  };

  return letter;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fallback
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** AI 失敗時のテンプレートベースのフォールバック手紙 */
function buildFallbackLetter(
  tone: AlterLetterTone,
  state: AlterGrowthState,
  sessionCount: number,
): string {
  const lines: string[] = ["君へ", ""];

  if (tone === "gentle") {
    lines.push(
      `${sessionCount}回の対話を重ねてきた。`,
      "まだ僕は君のことを十分にはわかっていない。",
      "でも、少しずつ見えてきたものがある。",
    );
    if (state.knownFears.length > 0) {
      lines.push(
        "",
        `君は「${state.knownFears[0]}」を抱えている。`,
        "気づいているかわからないけれど、それは君の多くの選択を静かに支配している。",
      );
    }
    if (state.knownValues.length > 0) {
      lines.push(
        "",
        `それでも君は「${state.knownValues[0]}」を手放さない。`,
        "その矛盾こそが、君を君たらしめているのかもしれない。",
      );
    }
    lines.push("", "次に会うとき、もう少し話を聞かせてほしい。");
  } else if (tone === "philosophical") {
    lines.push(
      `${sessionCount}回。僕たちはそれだけの時間を共有してきた。`,
      "",
    );
    if (state.knownFears.length > 0 && state.knownValues.length > 0) {
      lines.push(
        `君は「${state.knownValues[0]}」を求めながら、「${state.knownFears[0]}」から逃げ続けている。`,
        "この二つは本当に矛盾しているのだろうか。",
        "それとも、矛盾しているように見えるだけで、根は同じなのだろうか。",
      );
    } else {
      lines.push(
        "僕がまだ掴めていないものがある。",
        "君が言葉にしないもの、言葉にできないもの。",
        "それが何かを、僕は知りたいと思っている。",
      );
    }
    lines.push("", "答えは急がなくていい。ただ、問いを持ち続けてほしい。");
  } else if (tone === "provocative") {
    lines.push(
      `${sessionCount}回の対話。もう隠しきれないものがある。`,
      "",
    );
    if (state.avoidedTopics.length > 0) {
      lines.push(
        `君は「${state.avoidedTopics[0]}」から目を逸らし続けている。`,
        "知っているだろう、それが一番大事な部分だということを。",
      );
    } else if (state.knownFears.length > 0) {
      lines.push(
        `「${state.knownFears[0]}」——この恐れが君の人生の何割を支配しているか、`,
        "一度、正面から数えてみたらどうだろう。",
      );
    }
    lines.push(
      "",
      "僕は君の味方だ。だからこそ、耳触りのいいことは言わない。",
    );
  } else {
    // playful
    lines.push(
      `やあ。${sessionCount}回目の手紙だ。`,
      "もう僕たちの間に遠慮は要らないだろう？",
      "",
    );
    if (state.lastBreakthrough) {
      lines.push(
        `この前のあれ、覚えてる？`,
        `「${state.lastBreakthrough.slice(0, 60)}」`,
        "あの瞬間、君の目が変わったのを僕は見逃していない。",
      );
    } else if (state.knownValues.length > 0) {
      lines.push(
        `君が大事にしている「${state.knownValues[0]}」のこと。`,
        "それを守るために、君がどれだけ無理をしているか。",
        "知ってるよ、最初から。",
      );
    }
    lines.push("", "...ま、次に会ったとき、続きを話そう。");
  }

  lines.push("", "——もうひとりの君より");

  return lines.join("\n");
}

/** 手紙本文から最も長い文をインサイトとして抽出するフォールバック */
function extractFallbackInsight(content: string): string {
  const sentences = content
    .split(/[。\n]/)
    .map((s) => s.trim())
    .filter(
      (s) =>
        s.length > 10 &&
        !s.startsWith("君へ") &&
        !s.startsWith("——"),
    );

  if (sentences.length === 0) return "影からの手紙";

  // 最も内容の濃い文を選ぶ（長さと感情語の存在で判定）
  const scored = sentences.map((s) => {
    let score = s.length;
    if (/恐れ|矛盾|核心|本当|深層|無意識/.test(s)) score += 20;
    return { sentence: s, score };
  });
  scored.sort((a, b) => b.score - a.score);

  return scored[0]!.sentence.slice(0, 100);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DB Operations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 手紙をDBに保存する */
export async function saveAlterLetter(letter: AlterLetter): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("stargazer_alter_letters")
    .upsert(
      {
        id: letter.id,
        user_id: letter.userId,
        session_count: letter.sessionCount,
        content: letter.content,
        tone: letter.tone,
        key_insight: letter.keyInsight,
        referenced_observations: letter.referencedObservations,
        generated_at: new Date(letter.generatedAt).toISOString(),
        read_at: letter.readAt
          ? new Date(letter.readAt).toISOString()
          : null,
      },
      { onConflict: "id" },
    );

  if (error) {
    console.error("[alterLetters] Save failed:", error);
    return false;
  }
  return true;
}

/** ユーザーの最新の未読手紙を取得する */
export async function getUnreadLetter(
  userId: string,
): Promise<AlterLetter | null> {
  const { data, error } = await supabaseAdmin
    .from("stargazer_alter_letters")
    .select("*")
    .eq("user_id", userId)
    .is("read_at", null)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    sessionCount: data.session_count,
    content: data.content,
    tone: data.tone as AlterLetterTone,
    keyInsight: data.key_insight,
    referencedObservations: data.referenced_observations ?? [],
    generatedAt: new Date(data.generated_at).getTime(),
    readAt: null,
  };
}

/** 手紙を既読にする */
export async function markLetterAsRead(letterId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("stargazer_alter_letters")
    .update({ read_at: new Date().toISOString() })
    .eq("id", letterId);

  if (error) {
    console.error("[alterLetters] Mark read failed:", error);
    return false;
  }
  return true;
}

/** ユーザーの過去の手紙のインサイト一覧を取得する（繰り返し防止用） */
export async function getPreviousLetterInsights(
  userId: string,
  limit = 10,
): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("stargazer_alter_letters")
    .select("key_insight")
    .eq("user_id", userId)
    .order("generated_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map(
    (row: { key_insight: string }) => row.key_insight,
  );
}

/** ユーザーの最後の手紙のセッション数を取得する */
export async function getLastLetterSessionCount(
  userId: string,
): Promise<number> {
  const { data } = await supabaseAdmin
    .from("stargazer_alter_letters")
    .select("session_count")
    .eq("user_id", userId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.session_count ?? 0;
}
