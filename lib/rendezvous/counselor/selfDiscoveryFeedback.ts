import "server-only";

import { runAI } from "@/lib/ai";
import { supabaseServer } from "@/lib/supabase/server";

// ============================================================
// Self-Discovery Feedback — フィードバック第2層
//
// 設計根拠（Part 2 §1.3）:
//   既存の「どうでしたか？」→「楽しかったです」（解像度ゼロ）を
//   関係性マインドフルネスの問いに置換する。
//
//   例:
//     「今日の会話で、一番自然に言葉が出た瞬間はどこだった？」
//     「逆に、少し考えてから返した場面はあった？」
//     「帰り道、身体は軽かった？重かった？」
//
//   回答そのものより、回答に至る反応パターンが観測データ。
//   これは内受容感覚のトレーニングであり、
//   使い続けるほど「なんとなく」の解像度が上がる。
//
// 核心（Part 2 §1.4）:
//   ユーザーの自己報告と行動観測データのズレが
//   最も価値の高い観測データ。
//
//   例: 「楽しかった」と報告しているが、チャット中の
//   返信速度は後半で明らかに遅くなっていた。
//
//   → Counselor:
//     「前半と後半で少し雰囲気が変わっていたけど、何か感じた？」
//   攻撃的に指摘するのではなく、ユーザー自身に気づかせる。
// ============================================================

// ── 型定義 ──

export type InteractionKind = "chat" | "call" | "date";

/** 自己発見の問い */
export type SelfDiscoveryQuestion = {
  /** 問い（1文） */
  question: string;
  /** なぜこの問いをするか（Counselor内部用） */
  intent: string;
  /** 分類 */
  category: "body_sensation" | "emotion_awareness" | "pattern_reflection" | "gap_detection";
};

/** 自己報告 vs 行動観測のズレ検出結果 */
export type GapDetection = {
  /** ズレが検出されたか */
  hasGap: boolean;
  /** ズレの説明（Counselorが出す） */
  gapDescription: string | null;
  /** ズレに基づく自己発見の問い */
  gapQuestion: string | null;
};

/** 自己発見フィードバックのフルパッケージ */
export type SelfDiscoveryFeedback = {
  /** 個別の問い（2-4問） */
  questions: SelfDiscoveryQuestion[];
  /** ズレ検出結果（行動データがある場合のみ） */
  gapDetection: GapDetection | null;
  /** Counselorの一言（専門的・簡潔） */
  counselorNote: string;
  generatedAt: string;
};

// ── 公開API ──

/**
 * インタラクション後の自己発見問いを生成する。
 *
 * @param interactionKind chat / call / date
 * @param selfReportedFeeling ユーザーの自己報告感想
 * @param behaviorSignals 行動観測データ（あれば）
 */
export async function generateSelfDiscoveryFeedback(params: {
  userId: string;
  candidateId: string;
  interactionKind: InteractionKind;
  selfReportedFeeling: string;
  behaviorSignals?: BehaviorSignals;
}): Promise<SelfDiscoveryFeedback> {
  const { userId, candidateId, interactionKind, selfReportedFeeling, behaviorSignals } = params;
  const now = new Date().toISOString();

  // 行動データがある場合はズレ検出を行う
  let gapDetection: GapDetection | null = null;
  if (behaviorSignals) {
    gapDetection = detectGap(selfReportedFeeling, behaviorSignals);
  }

  // AI で問いを生成
  const questions = await generateQuestions({
    userId,
    interactionKind,
    selfReportedFeeling,
    gapDetection,
    behaviorSignals,
  });

  // Counselor の一言（ズレがある場合は特に慎重なトーン）
  const counselorNote = gapDetection?.hasGap
    ? "私からいくつか、振り返りの問いがあります。あなた自身の気づきのために、ゆっくり考えてみてください。"
    : "今回のやり取りを振り返ってみましょう。自分の内側に目を向ける時間です。";

  const feedback: SelfDiscoveryFeedback = {
    questions,
    gapDetection,
    counselorNote,
    generatedAt: now,
  };

  // DB に保存（post_reviews に関連付け）
  await saveFeedback(userId, candidateId, feedback);

  return feedback;
}

// ── 行動シグナル型 ──

export type BehaviorSignals = {
  /** 前半の平均返信時間（秒） */
  avgReplyTimeFirstHalf?: number;
  /** 後半の平均返信時間（秒） */
  avgReplyTimeSecondHalf?: number;
  /** ユーザーの質問数 */
  questionCount?: number;
  /** 相手の質問数 */
  counterpartQuestionCount?: number;
  /** 絵文字使用率（0-1） */
  emojiRate?: number;
  /** 主導権比率（0=完全受動, 1=完全能動） */
  initiativeRatio?: number;
};

// ── ズレ検出 ──

function detectGap(
  selfReportedFeeling: string,
  signals: BehaviorSignals,
): GapDetection {
  const positiveReport = isPositiveReport(selfReportedFeeling);

  // ズレパターン1: ポジティブ報告だが返信速度が後半で顕著に遅くなった
  if (
    positiveReport &&
    signals.avgReplyTimeFirstHalf != null &&
    signals.avgReplyTimeSecondHalf != null &&
    signals.avgReplyTimeSecondHalf > signals.avgReplyTimeFirstHalf * 1.5
  ) {
    return {
      hasGap: true,
      gapDescription:
        "「楽しかった」と感じた一方で、会話の後半で返信のペースが変化していました。",
      gapQuestion:
        "前半と後半で、自分の中の何かが変わった感覚はあった？",
    };
  }

  // ズレパターン2: ポジティブ報告だが質問が極端に少ない（受動的）
  if (
    positiveReport &&
    signals.questionCount != null &&
    signals.counterpartQuestionCount != null &&
    signals.questionCount < 2 &&
    signals.counterpartQuestionCount > 4
  ) {
    return {
      hasGap: true,
      gapDescription:
        "楽しかったとのことですが、会話では相手からの質問が多く、あなたからの質問は少なめでした。",
      gapQuestion:
        "相手に聞きたいことはあったけど聞けなかったこと、何かある？",
    };
  }

  // ズレパターン3: ネガティブ報告だが実は積極的に関わっていた
  if (
    !positiveReport &&
    signals.initiativeRatio != null &&
    signals.initiativeRatio > 0.6
  ) {
    return {
      hasGap: true,
      gapDescription:
        "「微妙だった」との印象ですが、あなたは積極的に会話をリードしていました。",
      gapQuestion:
        "『微妙』と感じた部分と、自分から話を広げた部分、それぞれ何が動機だった？",
    };
  }

  return { hasGap: false, gapDescription: null, gapQuestion: null };
}

function isPositiveReport(feeling: string): boolean {
  const positiveKeywords = [
    "great", "good", "楽しかった", "良かった", "とても良かった",
    "いい感じ", "楽しい", "嬉しい",
  ];
  const lower = feeling.toLowerCase();
  return positiveKeywords.some((kw) => lower.includes(kw));
}

// ── AI 問い生成 ──

const SELF_DISCOVERY_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          intent: { type: "string" },
          category: {
            type: "string",
            enum: ["body_sensation", "emotion_awareness", "pattern_reflection", "gap_detection"],
          },
        },
        required: ["question", "intent", "category"],
      },
    },
  },
  required: ["questions"],
} as const;

async function generateQuestions(params: {
  userId: string;
  interactionKind: InteractionKind;
  selfReportedFeeling: string;
  gapDetection: GapDetection | null;
  behaviorSignals?: BehaviorSignals;
}): Promise<SelfDiscoveryQuestion[]> {
  const { interactionKind, selfReportedFeeling, gapDetection, behaviorSignals } = params;

  const kindLabel =
    interactionKind === "chat" ? "チャット" :
    interactionKind === "call" ? "電話" : "対面";

  let gapContext = "";
  if (gapDetection?.hasGap) {
    gapContext = `\n\n【ズレ検出】\n${gapDetection.gapDescription}\nこのズレに触れる問いも1つ含めてください（攻撃的にならず、気づかせるトーンで）。`;
  }

  let signalContext = "";
  if (behaviorSignals) {
    const lines: string[] = [];
    if (behaviorSignals.avgReplyTimeFirstHalf != null) {
      lines.push(`- 前半返信速度: ${behaviorSignals.avgReplyTimeFirstHalf.toFixed(0)}秒`);
    }
    if (behaviorSignals.avgReplyTimeSecondHalf != null) {
      lines.push(`- 後半返信速度: ${behaviorSignals.avgReplyTimeSecondHalf.toFixed(0)}秒`);
    }
    if (behaviorSignals.initiativeRatio != null) {
      lines.push(`- 主導権比率: ${(behaviorSignals.initiativeRatio * 100).toFixed(0)}%`);
    }
    if (lines.length > 0) {
      signalContext = `\n\n【行動データ】\n${lines.join("\n")}`;
    }
  }

  const prompt = `
## タスク
${kindLabel}後の自己発見問いを2-4問生成してください。

## ユーザーの感想
「${selfReportedFeeling}」
${gapContext}${signalContext}

## 出力要件
- 問いは関係性マインドフルネスの訓練として機能するもの
- カテゴリ:
  - body_sensation: 身体感覚（「身体は軽かった？重かった？」）
  - emotion_awareness: 感情の気づき（「一番自然に言葉が出た瞬間は？」）
  - pattern_reflection: パターンの振り返り（「前回と比べて変わったことは？」）
  - gap_detection: ズレへの気づき（「実際の行動と感想に違いはあった？」）
- 各カテゴリから最低1問
- 攻撃的・詰問調にしない
- 全て日本語
`.trim();

  const aiResult = await runAI({
    taskType: "rendezvous_self_discovery",
    prompt,
    systemPrompt: `あなたは Aneurasync の Rendezvous Counselor です。
ユーザーの自己発見を促す問いを生成します。
問いは「正解を求める質問」ではなく「自分の内側に目を向けるきっかけ」です。
Counselorのトーンで: 構造的・専門的・簡潔。
全て日本語で出力してください。`,
    jsonSchema: SELF_DISCOVERY_SCHEMA as unknown as Record<string, unknown>,
    requireJson: true,
    temperature: 0.7,
    userId: params.userId,
  });

  try {
    const output = (
      aiResult.structured ?? JSON.parse(aiResult.text)
    ) as { questions: SelfDiscoveryQuestion[] };
    return output.questions;
  } catch {
    return buildFallbackQuestions(interactionKind);
  }
}

function buildFallbackQuestions(kind: InteractionKind): SelfDiscoveryQuestion[] {
  const kindLabel = kind === "chat" ? "会話" : kind === "call" ? "電話" : "対面";
  return [
    {
      question: `今日の${kindLabel}で、一番自然に言葉が出た瞬間はどこだった？`,
      intent: "自然体の瞬間を特定し、相性の手がかりとする",
      category: "emotion_awareness",
    },
    {
      question: `${kindLabel}の後、身体は軽い？重い？`,
      intent: "内受容感覚のトレーニング。言語化されない相性シグナル",
      category: "body_sensation",
    },
    {
      question: "相手の返答で、意外だったものはある？",
      intent: "期待と現実のズレから価値観の差異を観測",
      category: "pattern_reflection",
    },
  ];
}

// ── DB保存 ──

async function saveFeedback(
  userId: string,
  candidateId: string,
  feedback: SelfDiscoveryFeedback,
): Promise<void> {
  const supabase = await supabaseServer();

  // rendezvous_counselor_sessions に保存（weekly_briefingと同じパターン）
  await supabase.from("rendezvous_counselor_sessions").insert({
    user_id: userId,
    state: "self_discovery_feedback_v1",
    session_data: {
      candidateId,
      ...feedback,
    } as unknown as Record<string, unknown>,
    disconnect_analysis_id: null,
  });
}
