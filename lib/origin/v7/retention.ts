// lib/origin/v7/retention.ts
// Origin 継続率メカニズム — ストリーク・不在回復・昨日のエコー

import type { OriginV7Save, MicroQuestionAnswer, LifePeriod } from "./types";

/** ストリークマイルストーン判定 */
export function getStreakMilestone(currentStreak: number): number | null {
  const milestones = [3, 7, 14, 30, 50, 100];
  if (milestones.includes(currentStreak)) return currentStreak;
  return null;
}

/** マイルストーンメッセージ */
export function getStreakMessage(milestone: number): {
  emoji: string;
  title: string;
  body: string;
} {
  switch (milestone) {
    case 3:
      return {
        emoji: "🌱",
        title: "3日連続！",
        body: "小さな習慣が芽吹き始めています。",
      };
    case 7:
      return {
        emoji: "🔥",
        title: "1週間連続！",
        body: "あなたの記憶の地図が、少しずつ形になってきました。",
      };
    case 14:
      return {
        emoji: "⭐",
        title: "2週間連続！",
        body: "これだけ続けられる人は、なかなかいません。",
      };
    case 30:
      return {
        emoji: "🏆",
        title: "30日連続！",
        body: "1ヶ月。あなたの分身は、かなりあなたを理解し始めています。",
      };
    case 50:
      return {
        emoji: "💎",
        title: "50日連続！",
        body: "半世紀。あなたの記憶の地図は、他の誰にも作れない宝物です。",
      };
    case 100:
      return {
        emoji: "🌟",
        title: "100日連続！",
        body: "100日間、自分と向き合い続けた。これは偉業です。",
      };
    default:
      return {
        emoji: "✨",
        title: `${milestone}日連続！`,
        body: "素晴らしい継続です。",
      };
  }
}

/** 不在日数を計算 */
export function getDaysAbsent(lastVisitIso: string | undefined): number {
  if (!lastVisitIso) return 0;
  const last = new Date(lastVisitIso);
  const now = new Date();
  const diffMs = now.getTime() - last.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/** 不在メッセージ */
export function getAbsenceMessage(daysAbsent: number): {
  emoji: string;
  title: string;
  body: string;
} | null {
  if (daysAbsent < 3) return null;
  if (daysAbsent < 7) {
    return {
      emoji: "🌿",
      title: "お帰りなさい",
      body: `${daysAbsent}日ぶりですね。あなたの記憶は、ここで待っていました。`,
    };
  }
  if (daysAbsent < 30) {
    return {
      emoji: "🌙",
      title: "お帰りなさい",
      body: `${daysAbsent}日が経ちました。また、少しずつ記録を重ねていきましょう。`,
    };
  }
  return {
    emoji: "🌸",
    title: "お久しぶりです",
    body: `${daysAbsent}日ぶりですね。あなたの記録は全て残っています。いつでも再開できます。`,
  };
}

/** 昨日のエコー（昨日の回答を取得） */
export function getYesterdayEcho(
  save: OriginV7Save,
): { question: string; answer: string; date: string } | null {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

  const answers: MicroQuestionAnswer[] = save.microQuestionAnswers ?? [];
  const yesterdayAnswer = answers.find(
    (a) => a.answeredAt?.startsWith(yKey),
  );

  if (!yesterdayAnswer) return null;

  return {
    question: yesterdayAnswer.questionId,
    answer: yesterdayAnswer.selectedOptionId + (yesterdayAnswer.freeText ? `「${yesterdayAnswer.freeText}」` : ""),
    date: yKey,
  };
}

/** 最終訪問日を記録 */
const LAST_VISIT_KEY = "origin_last_visit";

export function recordVisit(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
  } catch {
    // QuotaExceededError — localStorageが満杯の場合は無視
  }
}

export function getLastVisitDate(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return localStorage.getItem(LAST_VISIT_KEY) ?? undefined;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ストリークフリーズ
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const FREEZE_KEY = "origin_streak_freeze";

/** フリーズ残数を取得（デフォルト: ストリーク7日ごとに1個付与、最大3個） */
export function getStreakFreezeCount(): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(FREEZE_KEY);
  return raw ? parseInt(raw, 10) : 0;
}

/** フリーズを1つ消費 */
export function consumeStreakFreeze(): boolean {
  const count = getStreakFreezeCount();
  if (count <= 0) return false;
  try {
    localStorage.setItem(FREEZE_KEY, String(count - 1));
  } catch {
    // QuotaExceededError
  }
  return true;
}

/** ストリーク7日ごとにフリーズを1個付与（最大3） */
export function maybeGrantStreakFreeze(currentStreak: number): boolean {
  if (currentStreak > 0 && currentStreak % 7 === 0) {
    const count = getStreakFreezeCount();
    if (count < 3) {
      try {
        localStorage.setItem(FREEZE_KEY, String(count + 1));
      } catch {
        // QuotaExceededError
      }
      return true;
    }
  }
  return false;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   探索段階システム
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type ExplorationStage = {
  level: number;
  name: string;
  emoji: string;
  description: string;
  nextThreshold: number | null;
  progress: number; // 0-1
};

const STAGES = [
  { level: 1, name: "観察者", emoji: "👁️", threshold: 0, nextThreshold: 3 },
  { level: 2, name: "記録者", emoji: "📝", threshold: 3, nextThreshold: 7 },
  { level: 3, name: "探索者", emoji: "🔍", threshold: 7, nextThreshold: 15 },
  { level: 4, name: "読解者", emoji: "📖", threshold: 15, nextThreshold: 25 },
  { level: 5, name: "形成史家", emoji: "🗺️", threshold: 25, nextThreshold: null },
] as const;

export function getExplorationStage(chapterCount: number): ExplorationStage {
  let current: typeof STAGES[number] = STAGES[0];
  for (const stage of STAGES) {
    if (chapterCount >= stage.threshold) {
      current = stage;
    }
  }

  const progress = current.nextThreshold
    ? (chapterCount - current.threshold) / (current.nextThreshold - current.threshold)
    : 1;

  return {
    level: current.level,
    name: current.name,
    emoji: current.emoji,
    description: getStageDescription(current.level),
    nextThreshold: current.nextThreshold,
    progress: Math.min(progress, 1),
  };
}

function getStageDescription(level: number): string {
  switch (level) {
    case 1: return "記憶の断片を集め始めた段階。まずは3つの記憶を刻みましょう。";
    case 2: return "記録が習慣になりつつあります。探索の角度を広げてみましょう。";
    case 3: return "記憶同士の接続が見え始める段階。パターンを意識してみてください。";
    case 4: return "あなたの形成史の物語が浮かび上がっています。矛盾や空白にも目を向けて。";
    case 5: return "形成史の全体像を持つ段階。あなた自身の「存在の地図」を完成させましょう。";
    default: return "";
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   次のチャレンジ提案
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type NextChallenge = {
  emoji: string;
  title: string;
  description: string;
  type: "explore_new_period" | "deep_dive" | "daily_streak" | "fill_gap" | "revisit";
};

export function getNextChallenge(save: OriginV7Save): NextChallenge {
  const chapters = save.chapters;
  const streak = save.microQuestionStreak?.currentStreak ?? 0;

  // 未探索の時期がある場合
  const exploredPeriods = new Set(chapters.map((c) => c.fact.period));
  const allPeriods: LifePeriod[] = [
    "early_childhood", "elementary", "middle_school", "high_school",
    "late_teens", "early_twenties", "mid_twenties", "thirties",
  ];
  const unexplored = allPeriods.filter((p) => !exploredPeriods.has(p));

  if (chapters.length === 0) {
    return {
      emoji: "✨",
      title: "最初の記憶を刻む",
      description: "あなたの形成史の第一歩を踏み出しましょう。",
      type: "explore_new_period",
    };
  }

  // ストリーク3未満 → 日課チャレンジ
  if (streak < 3 && chapters.length >= 1) {
    return {
      emoji: "🔥",
      title: "3日連続チャレンジ",
      description: `あと${3 - streak}日で最初のマイルストーン。毎日の問いに答えてみましょう。`,
      type: "daily_streak",
    };
  }

  // 全チャプターが浅い探索 → 深掘りチャレンジ
  const hasDeep = chapters.some((c) => c.revisitCount > 0 || c.parentChapterId);
  if (!hasDeep && chapters.length >= 3) {
    return {
      emoji: "🔍",
      title: "記憶を深掘りする",
      description: "既存の記憶をひとつ選んで、より深く探索してみましょう。",
      type: "deep_dive",
    };
  }

  // 未探索時期がある
  if (unexplored.length > 0 && unexplored.length <= 5) {
    return {
      emoji: "🗺️",
      title: "新しい時期を探索",
      description: `まだ探索していない時期があります。新しい角度から記憶を辿りましょう。`,
      type: "explore_new_period",
    };
  }

  // 再訪問チャレンジ
  const oldestNotRevisited = chapters.find((c) => c.revisitCount === 0);
  if (oldestNotRevisited) {
    return {
      emoji: "🔄",
      title: "記憶を再訪問",
      description: `「${oldestNotRevisited.title}」を今の視点で見直してみませんか？`,
      type: "revisit",
    };
  }

  return {
    emoji: "💎",
    title: "探索を続ける",
    description: "新しい記憶が、形成史に新しい線を引きます。",
    type: "explore_new_period",
  };
}
