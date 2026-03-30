// lib/aneurasync/relationshipStage.ts
// 関係性ステージシステム — ロボットとユーザーの関係が時間とともに深まる
//
// Stage 1「初対面」(1-5回)   丁寧。慎重。間を埋める。
// Stage 2「知り合い」(6-15回)  観察を口にし始める。少し深い質問。
// Stage 3「打ち解ける」(16-30回) 押し返す。核心を突く。遠慮が減る。
// Stage 4「理解者」(31-60回)   言葉が減る。一言で核心。沈黙が自然。
// Stage 5「分身」(61回〜)     予測する。聞かなくても分かる。鏡になる。

export type RelationshipStage = 1 | 2 | 3 | 4 | 5;

export function getRelationshipStage(totalSessions: number): RelationshipStage {
  if (totalSessions <= 5) return 1;
  if (totalSessions <= 15) return 2;
  if (totalSessions <= 30) return 3;
  if (totalSessions <= 60) return 4;
  return 5;
}

/* ═══════════════════════════════════════════════
   Stage-Aware Expression
   ロボットの「表情」を決定する
   ═══════════════════════════════════════════════ */

export type RobotExpression =
  | "neutral"      // 穏やか
  | "curious"      // 興味を持ってる
  | "concerned"    // 心配してる
  | "warm"         // 柔らかい
  | "thinking"     // 考え中
  | "surprised"    // 驚いた
  | "skeptical"    // 疑ってる
  | "listening"    // 聞いてる
  | "knowing"      // わかってる
  | "quiet";       // 静かに寄り添ってる

/** 待機中の表情（ステージで変わる） */
export function getIdleExpression(stage: RelationshipStage): RobotExpression {
  switch (stage) {
    case 1: return "neutral";    // 正面向き、動かない
    case 2: return "curious";    // ちょっと興味がある目
    case 3: return "warm";       // リラックスした柔らかさ
    case 4: return "quiet";      // 横を向いてるけど聞いてる
    case 5: return "knowing";    // 全部わかってる目
  }
}

/** 回答に対する表情 */
export function getAnswerExpression(
  stage: RelationshipStage,
  value: number,
  responseTimeMs: number,
  isContradiction: boolean,
): RobotExpression {
  // 矛盾検出 → ステージで反応が違う
  if (isContradiction) {
    if (stage <= 2) return "curious";     // まだ指摘しない、興味を示すだけ
    if (stage <= 4) return "skeptical";   // 首を傾げる
    return "knowing";                     // もう分かってる
  }

  // 迷いが大きかった
  if (responseTimeMs > 5000) {
    if (stage <= 2) return "listening";   // 黙って待つ
    return "concerned";                   // 「触れにくかった？」
  }

  // スコアに応じて
  if (value <= 2) {
    if (stage <= 2) return "concerned";
    if (stage <= 4) return "quiet";       // 静かに寄り添う
    return "knowing";                     // 言葉なしで分かってる
  }

  if (value >= 4) {
    if (stage <= 2) return "warm";
    if (stage <= 4) return "curious";     // 「それ本当？」的な
    return "neutral";                     // 当然、という態度
  }

  return "listening";
}

/* ═══════════════════════════════════════════════
   Stage-Aware Silence
   回答後の「間」の長さ（ms）
   ═══════════════════════════════════════════════ */

export function getReactionDelay(
  stage: RelationshipStage,
  value: number,
  isContradiction: boolean,
): number {
  // Base delay by stage
  const baseDelay: Record<RelationshipStage, number> = {
    1: 600,   // 間を埋める（気まずさを避ける）
    2: 900,   // 少し考える間
    3: 1200,  // 自然な間
    4: 1800,  // 長い間（言葉を選んでる）
    5: 2400,  // 沈黙自体がコミュニケーション
  };

  let delay = baseDelay[stage];

  // 重い回答ほど間を長くする
  if (value <= 2) delay += stage >= 3 ? 800 : 200;

  // 矛盾検出時は「…ん？」の間
  if (isContradiction && stage >= 3) delay += 600;

  return delay;
}

/* ═══════════════════════════════════════════════
   Stage-Aware Greetings
   挨拶の距離感がステージで変わる
   ═══════════════════════════════════════════════ */

export interface StageGreeting {
  line: string;
  subLine?: string;
  expression: RobotExpression;
}

/**
 * ステージに応じた挨拶を生成する。
 * pastContext がある場合は過去の回答を踏まえた挨拶にする。
 */
export function getStageGreeting(
  stage: RelationshipStage,
  pastContext?: {
    lastMoodScore?: number;
    lastSelfMatchScore?: number;
    daysSinceLastSession: number;
    totalSessions: number;
    lastAnswerText?: string;       // 「ずっと考えてた」用
    streakDays: number;
    dominantCategory?: string;      // 最も多く答えたカテゴリ
    avoidedCategory?: string;       // 避けてるカテゴリ
  },
): StageGreeting {
  const ctx = pastContext;

  // ── Stage 1: 初対面 ──
  if (stage === 1) {
    if (!ctx || ctx.totalSessions === 0) {
      return {
        line: "はじめまして。少しだけ、あなたのことを聞いてもいい？",
        expression: "neutral",
      };
    }
    if (ctx.totalSessions <= 2) {
      return {
        line: "また来てくれたんだ。ありがとう。",
        subLine: "少しずつ、あなたのことが見えてくるといいな。",
        expression: "warm",
      };
    }
    return {
      line: "今日も聞かせてもらっていい？",
      expression: "curious",
    };
  }

  // ── Stage 2: 知り合い ──
  if (stage === 2) {
    if (ctx?.daysSinceLastSession && ctx.daysSinceLastSession >= 4) {
      return {
        line: "久しぶりだね。ちょっと気になってた。",
        expression: "concerned",
      };
    }
    if (ctx?.lastMoodScore && ctx.lastMoodScore <= 2) {
      return {
        line: "前回、ちょっと重そうだったのが気になってた。",
        subLine: "今日はどう？",
        expression: "concerned",
      };
    }
    if (ctx?.streakDays && ctx.streakDays >= 5) {
      return {
        line: "続けて来てくれてるね。気づいたことがある。",
        expression: "curious",
      };
    }
    return {
      line: "今日、一つ聞きたいことがあるんだけど。",
      expression: "curious",
    };
  }

  // ── Stage 3: 打ち解ける ──
  if (stage === 3) {
    if (ctx?.lastAnswerText) {
      return {
        line: `前回の「${truncate(ctx.lastAnswerText, 15)}」って答え、ずっと考えてた。`,
        expression: "thinking",
      };
    }
    if (ctx?.avoidedCategory) {
      const catNames: Record<string, string> = {
        partner: "人との関わり", outfit: "見た目", care: "ケア",
        preparation: "準備", impression: "印象",
      };
      const name = catNames[ctx.avoidedCategory] ?? ctx.avoidedCategory;
      return {
        line: `「${name}」の話、いつも軽く流すよね。`,
        subLine: "今日はちょっと踏み込んでいい？",
        expression: "skeptical",
      };
    }
    if (ctx?.daysSinceLastSession && ctx.daysSinceLastSession >= 3) {
      return {
        line: "…久しぶり。何かあった？",
        expression: "concerned",
      };
    }
    if (ctx?.streakDays && ctx.streakDays >= 7) {
      return {
        line: "毎日来てくれるのは嬉しいけど…義務感で来てない？",
        subLine: "今日はサボってもいいよ。",
        expression: "warm",
      };
    }
    return {
      line: "今日、確かめたいことがある。",
      expression: "curious",
    };
  }

  // ── Stage 4: 理解者 ──
  if (stage === 4) {
    if (ctx?.lastMoodScore && ctx.lastMoodScore <= 2) {
      return {
        line: "…まだ引きずってる？",
        expression: "quiet",
      };
    }
    if (ctx?.daysSinceLastSession && ctx.daysSinceLastSession >= 5) {
      return {
        line: "…。",
        subLine: "何も聞かない。話したくなったら話して。",
        expression: "quiet",
      };
    }
    return {
      line: "今日の顔、少し読める。",
      expression: "knowing",
    };
  }

  // ── Stage 5: 分身 ──
  if (ctx?.lastMoodScore !== undefined) {
    if (ctx.lastMoodScore <= 2) {
      return {
        line: "今日も重いでしょ。知ってる。",
        expression: "knowing",
      };
    }
    return {
      line: "聞かなくても大体わかるけど、一応確認させて。",
      expression: "knowing",
    };
  }
  return {
    line: "…。",
    expression: "quiet",
  };
}

/* ═══════════════════════════════════════════════
   Stage-Aware Closing
   セッション終了時の言葉
   ═══════════════════════════════════════════════ */

export function getStageClosing(
  stage: RelationshipStage,
  totalAnswered: number,
): { line: string; expression: RobotExpression } {
  switch (stage) {
    case 1:
      return {
        line: totalAnswered >= 3
          ? `${totalAnswered}問、教えてくれてありがとう。また来てくれると嬉しい。`
          : "短い時間だったけど、ありがとう。",
        expression: "warm",
      };
    case 2:
      return {
        line: "今日の記録、しっかり残しておく。少し考えてみる。",
        expression: "thinking",
      };
    case 3:
      return {
        line: "今日の答え、もう少し噛み砕いてみる。明日までに何か見つかるかも。",
        expression: "curious",
      };
    case 4:
      return {
        line: "…わかった。また明日。",
        expression: "quiet",
      };
    case 5:
      return {
        line: "…。",
        expression: "knowing",
      };
  }
}

/* ═══════════════════════════════════════════════
   Stage-Aware Question Framing
   質問の「出し方」がステージで変わる
   ═══════════════════════════════════════════════ */

/** 質問の前に付ける導入文（ステージで変わる） */
export function getQuestionIntro(
  stage: RelationshipStage,
  questionIndex: number,
  category: string,
): string | null {
  // Stage 1: 毎回丁寧に聞く
  if (stage === 1) {
    if (questionIndex === 0) return "最初の質問、いい？";
    return null; // それ以降は余計なことを言わない
  }

  // Stage 2: たまに前置き
  if (stage === 2) {
    if (questionIndex === 0) return null;
    if (questionIndex % 3 === 0) return "もう少し聞いていい？";
    return null;
  }

  // Stage 3: 意図を見せる
  if (stage === 3) {
    if (questionIndex === 0) return "今日はここから行く。";
    return null;
  }

  // Stage 4-5: ほぼ無言で質問に入る
  return null;
}

/* ═══════════════════════════════════════════════
   Utilities
   ═══════════════════════════════════════════════ */

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "…";
}

/**
 * 避けているカテゴリを検出する。
 * 全カテゴリの回答数を比較し、極端に少ないカテゴリを返す。
 */
export function detectAvoidedCategory(
  recentAnswers: { theme: string }[],
): string | null {
  const counts = new Map<string, number>();
  const allCategories = ["partner", "outfit", "care", "preparation", "impression"];

  for (const a of recentAnswers) {
    if (!a.theme.startsWith("cat_")) continue;
    const parts = a.theme.slice(4).split("_");
    const cat = parts[0];
    if (cat) counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }

  if (counts.size < 3) return null; // Not enough data

  const totalAnswers = Array.from(counts.values()).reduce((s, v) => s + v, 0);
  const avgPerCat = totalAnswers / allCategories.length;

  for (const cat of allCategories) {
    const count = counts.get(cat) ?? 0;
    if (count < avgPerCat * 0.3 && totalAnswers >= 10) {
      return cat;
    }
  }

  return null;
}
