/**
 * Aneurasync — Daily Observation (今日の観測)
 *
 * ロボットがHOMEで軽く話しかける → 数タップで回答 → 翌日以降に反映
 *
 * 7テーマ:
 *  1. コーデ評価
 *  2. 気分・コンディション
 *  3. 自己一致感
 *  4. 対人評価（人と会った日）
 *  5. デート評価（デートがあった日）
 *  6. 予定適合評価（予定があった日）
 *  7. 洗濯/状態更新（コーデ使用日）
 *
 * 毎日全部は出さない。コンテキストに応じて1〜3問だけ出す。
 */

/* ═══════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════ */
export type ObservationTheme =
  | "outfit"        // コーデ評価
  | "mood"          // 気分・コンディション
  | "selfMatch"     // 自己一致感
  | "interpersonal" // 対人評価
  | "date"          // デート評価
  | "eventFit"      // 予定適合
  | "laundry"       // 洗濯/状態更新
  | `cat_${string}`; // カテゴリベース質問ID (新エンジン)

export type ChoiceValue = 1 | 2 | 3 | 4 | 5;

export type ObservationQuestion = {
  theme: ObservationTheme;
  robotLine: string;         // ロボットの問いかけ
  choices: Array<{
    value: ChoiceValue;
    label: string;
  }>;
  /** 回答値ごとのロボの短い返答（人格化） */
  reactions: Partial<Record<ChoiceValue, string>>;
  /** 追加質問（メイン回答後に出す） */
  followUp?: {
    question: string;
    options: string[];
  };
};

export type ObservationAnswer = {
  theme: ObservationTheme;
  value: ChoiceValue;
  followUpSelection?: string;
  answeredAt: string;  // ISO
};

export type DailyObservationRecord = {
  date: string;            // YYYY-MM-DD
  answers: ObservationAnswer[];
  memo?: string;           // 任意の一言メモ
  savedAt: string;
};

/** 日のコンテキスト（どの質問を出すか判定用） */
export type DayContext = {
  hadEvents: boolean;
  hadDate: boolean;
  hadPeople: boolean;       // 対人が多かった日
  usedOutfit: boolean;      // コーデを使った
  eventTypes: string[];
  hasOutfitToday?: boolean; // 今日のコーデ/アイテムが選択済みか
};

/* ═══════════════════════════════════════════════
   Question Bank
   ═══════════════════════════════════════════════ */
const QUESTIONS: ObservationQuestion[] = [
  /* ── コーデ ── */
  {
    theme: "outfit",
    robotLine: "今日のコーデ、どうだった？",
    choices: [
      { value: 5, label: "ばっちり" },
      { value: 4, label: "まあ良かった" },
      { value: 3, label: "ふつう" },
      { value: 2, label: "ちょっと違った" },
      { value: 1, label: "合わなかった" },
    ],
    reactions: {
      5: "いいね、今日はちゃんと噛み合ってたみたい。",
      4: "わるくない。この感覚、覚えておくよ。",
      3: "ふむ。可もなく不可もなく、って日もあるよね。",
      2: "少しズレがあったんだね。そこも残しておく。",
      1: "合わなかった日も大事なデータ。次に活かすよ。",
    },
    followUp: {
      question: "何が一番大きかった？",
      options: ["見た目", "気分", "動きやすさ", "気温", "場の雰囲気"],
    },
  },
  /* ── 気分 ── */
  {
    theme: "mood",
    robotLine: "今日のモード、どんな感じだった？",
    choices: [
      { value: 5, label: "前向きだった" },
      { value: 4, label: "落ち着いてた" },
      { value: 3, label: "ふつう" },
      { value: 2, label: "ちょっと疲れた" },
      { value: 1, label: "だいぶ重かった" },
    ],
    reactions: {
      5: "いい日だったみたいだね。その調子。",
      4: "穏やかに過ごせたのは、地味にいいこと。",
      3: "まあ、そういう日もある。記録はしておくね。",
      2: "お疲れさま。ちゃんと休めてる？",
      1: "重い日だったんだね。無理しなくていいよ。",
    },
  },
  /* ── 自己一致 ── */
  {
    theme: "selfMatch",
    robotLine: "今日のあなた、自分らしかった？",
    choices: [
      { value: 5, label: "すごくそう思う" },
      { value: 4, label: "わりとそう" },
      { value: 3, label: "わからない" },
      { value: 2, label: "ちょっと無理した" },
      { value: 1, label: "かなり無理した" },
    ],
    reactions: {
      5: "それは一番いい。自分のまま過ごせた日だ。",
      4: "おおむね自分でいられたなら、十分。",
      3: "わからない、って日もある。それも観測のうち。",
      2: "少しだけ合わせたんだね。その感覚、残しておく。",
      1: "無理してた分、今は少し緩めていいよ。",
    },
  },
  /* ── 対人 ── */
  {
    theme: "interpersonal",
    robotLine: "人といて、心地よかった？",
    choices: [
      { value: 5, label: "とても" },
      { value: 4, label: "まあまあ" },
      { value: 3, label: "ふつう" },
      { value: 2, label: "少し疲れた" },
      { value: 1, label: "けっこう疲れた" },
    ],
    reactions: {
      5: "いい距離感だったんだね。大事にしよう。",
      4: "わるくない。そのバランス、覚えておくよ。",
      3: "ニュートラルな日。それはそれで。",
      2: "人疲れしたんだね。少し一人の時間、取れるといいね。",
      1: "しんどかったね。ちゃんと観測してるよ。",
    },
    followUp: {
      question: "どれに近い？",
      options: ["話しやすかった", "安心できた", "少し無理した", "距離感が合わなかった"],
    },
  },
  /* ── デート ── */
  {
    theme: "date",
    robotLine: "今日のデート、自然にいられた？",
    choices: [
      { value: 5, label: "すごく自然" },
      { value: 4, label: "わりと自然" },
      { value: 3, label: "ふつう" },
      { value: 2, label: "少し硬かった" },
      { value: 1, label: "違和感あった" },
    ],
    reactions: {
      5: "自然でいられたなら、それが一番。",
      4: "リラックスできてたみたいだね。",
      3: "まあ、様子見の距離感ってこともあるよね。",
      2: "少し緊張してたんだね。そこも記録しておく。",
      1: "違和感、あったか。その感覚は嘘つかない。",
    },
    followUp: {
      question: "印象に残ったのは？",
      options: ["会話のテンポ", "安心感", "見た目", "緊張感"],
    },
  },
  /* ── 予定適合 ── */
  {
    theme: "eventFit",
    robotLine: "今日の予定と過ごし方、合ってた？",
    choices: [
      { value: 5, label: "ぴったり" },
      { value: 4, label: "だいたい" },
      { value: 3, label: "ふつう" },
      { value: 2, label: "少しズレた" },
      { value: 1, label: "かなりズレた" },
    ],
    reactions: {
      5: "予定通りの一日。それだけで十分。",
      4: "おおむね合ってたなら上出来。",
      3: "まあ、予定って思い通りにいかないこともある。",
      2: "ズレた部分、次の参考にするよ。",
      1: "計画と実際がだいぶ違ったんだね。調整してみよう。",
    },
  },
  /* ── 洗濯 ── */
  {
    theme: "laundry",
    robotLine: "今日のアイテム、どうする？",
    choices: [
      { value: 5, label: "明日も使える" },
      { value: 3, label: "休ませる" },
      { value: 1, label: "洗濯に出す" },
    ],
    reactions: {
      5: "了解、明日も出番ね。",
      3: "一日休ませよう。服にも回復は大事。",
      1: "お洗濯、了解。すっきりさせてあげよう。",
    },
  },
];

/* ═══════════════════════════════════════════════
   Memory-aware Greetings
   前回までの観測を踏まえた一言
   ═══════════════════════════════════════════════ */
export function getMemoryGreeting(recentRecords: DailyObservationRecord[]): string {
  if (recentRecords.length === 0) {
    return "やあ。今日はどんな一日だった？";
  }

  const last = recentRecords[recentRecords.length - 1];
  const lastMood = last.answers.find((a) => a.theme === "mood");
  const lastSelf = last.answers.find((a) => a.theme === "selfMatch");
  const lastOutfit = last.answers.find((a) => a.theme === "outfit");

  // 前回疲れてた → 今回気遣い
  if (lastMood && lastMood.value <= 2) {
    return "この前は少し疲れてたけど、今日はどう？";
  }
  // 前回無理してた → フォロー
  if (lastSelf && lastSelf.value <= 2) {
    return "前回ちょっと無理してたね。今日は自分でいられた？";
  }
  // 前回コーデ微妙 → 気にかけ
  if (lastOutfit && lastOutfit.value <= 2) {
    return "前回コーデがしっくりこなかったね。今日はどうだった？";
  }
  // 前回好調 → 継続確認
  if (lastMood && lastMood.value >= 4) {
    return "前回より今日は少し落ち着いてるかな。どう？";
  }
  // 連続観測の感謝
  if (recentRecords.length >= 3) {
    return "続けて観測してくれてるね。今日もちょっとだけ。";
  }

  return "おかえり。今日のこと、少し聞いてもいい？";
}

/** 全問終了後のロボの締めのセリフ */
export function getClosingLine(record: DailyObservationRecord): string {
  const avg =
    record.answers.reduce((s, a) => s + a.value, 0) / Math.max(record.answers.length, 1);

  if (avg >= 4) return "いい一日だったみたいだね。記録しておいた。";
  if (avg >= 3) return "今日の観測、完了。おつかれさま。";
  if (avg >= 2) return "少し大変だったね。でも、ちゃんと記録した。";
  return "今日はお疲れさま。ゆっくり休んでね。";
}

/* ═══════════════════════════════════════════════
   Question Selection Logic
   「毎日全部は重い → コンテキストに応じて1〜3問だけ」
   ═══════════════════════════════════════════════ */

/** 毎日ほぼ固定で出す */
const CORE_THEMES: ObservationTheme[] = ["mood", "outfit", "selfMatch"];

/** 条件付きで追加 */
function getConditionalThemes(ctx: DayContext): ObservationTheme[] {
  const themes: ObservationTheme[] = [];
  if (ctx.hadDate) themes.push("date");
  if (ctx.hadPeople && !ctx.hadDate) themes.push("interpersonal");
  if (ctx.hadEvents) themes.push("eventFit");
  if (ctx.usedOutfit) themes.push("laundry");
  return themes;
}

/**
 * その日に出す質問を決定
 * - コアから2つ + 条件付きから1つ = 最大3問
 * - 日付ベースのシードでコア質問をローテーション
 */
export function selectQuestions(
  date: string,
  ctx: DayContext,
  alreadyAnswered: ObservationTheme[] = [],
): ObservationQuestion[] {
  // 日付からシード
  const seed = date.split("").reduce((a, c) => a + c.charCodeAt(0), 0);

  // コアテーマから未回答を2つ選択（ローテーション）
  const availableCore = CORE_THEMES.filter((t) => !alreadyAnswered.includes(t));
  const rotated = [...availableCore];
  // シードベースで順番を変える
  for (let i = rotated.length - 1; i > 0; i--) {
    const j = (seed + i) % (i + 1);
    [rotated[i], rotated[j]] = [rotated[j], rotated[i]];
  }
  const selectedCore = rotated.slice(0, 2);

  // 条件付きテーマから未回答を1つ
  const conditional = getConditionalThemes(ctx).filter((t) => !alreadyAnswered.includes(t));
  const selectedConditional = conditional.slice(0, 1);

  // 質問オブジェクトにマッピング
  const themes = [...selectedCore, ...selectedConditional];
  return themes
    .map((t) => QUESTIONS.find((q) => q.theme === t))
    .filter((q): q is ObservationQuestion => q != null);
}

/** テーマ名で質問を取得 */
export function getQuestion(theme: ObservationTheme): ObservationQuestion | undefined {
  return QUESTIONS.find((q) => q.theme === theme);
}

/* ═══════════════════════════════════════════════
   Storage (localStorage)
   ═══════════════════════════════════════════════ */
const STORAGE_KEY_PREFIX = "culcept_daily_obs_v1_";
const HISTORY_KEY = "culcept_daily_obs_history_v1";

export function loadObservation(date: string): DailyObservationRecord | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${date}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveObservation(record: DailyObservationRecord): void {
  const key = `${STORAGE_KEY_PREFIX}${record.date}`;
  const data = JSON.stringify(record);

  // Try saving; on quota error, cleanup old entries and retry
  try {
    localStorage.setItem(key, data);
  } catch {
    cleanupOldObservations(record.date);
    try { localStorage.setItem(key, data); } catch { /* give up */ }
  }

  // 履歴インデックスも更新（最新30日分）
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const history: string[] = raw ? JSON.parse(raw) : [];
    if (!history.includes(record.date)) {
      history.push(record.date);
      // 最新30日分だけ保持
      while (history.length > 30) history.shift();
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    }
  } catch { /* ignore */ }
}

/**
 * 古い日別観測データを削除して容量を確保
 * - 直近7日分だけ保持し、それ以前を削除
 * - microStargazer の answers も直近15件にトリム
 */
function cleanupOldObservations(keepDate: string): void {
  // 1. Collect all daily obs keys
  const keysToRemove: string[] = [];
  const recentDates = new Set<string>();

  // Keep last 7 days
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    recentDates.add(ds);
  }
  recentDates.add(keepDate);

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(STORAGE_KEY_PREFIX)) {
      const datepart = k.slice(STORAGE_KEY_PREFIX.length);
      if (!recentDates.has(datepart)) {
        keysToRemove.push(k);
      }
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));

  // 2. Trim microStargazer progress answers to 15 per axis
  try {
    const MICRO_KEY = "culcept_micro_sg_v1";
    const raw = localStorage.getItem(MICRO_KEY);
    if (raw) {
      const progress = JSON.parse(raw);
      if (progress.axes) {
        let trimmed = false;
        for (const axisId of Object.keys(progress.axes)) {
          const axis = progress.axes[axisId];
          if (axis.answers && axis.answers.length > 15) {
            axis.answers = axis.answers.slice(-15);
            trimmed = true;
          }
          if (axis.recentVariantIds && axis.recentVariantIds.length > 5) {
            axis.recentVariantIds = axis.recentVariantIds.slice(0, 5);
            trimmed = true;
          }
        }
        if (trimmed) {
          localStorage.setItem(MICRO_KEY, JSON.stringify(progress));
        }
      }
    }
  } catch { /* ignore */ }

  // 3. Update history index to match remaining keys
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) {
      const history: string[] = JSON.parse(raw);
      const filtered = history.filter((d) => recentDates.has(d));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
    }
  } catch { /* ignore */ }
}

/** 最近N日分の観測データを取得 */
export function loadRecentObservations(n: number = 7): DailyObservationRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const history: string[] = raw ? JSON.parse(raw) : [];
    return history
      .slice(-n)
      .map(loadObservation)
      .filter((r): r is DailyObservationRecord => r != null);
  } catch { return []; }
}

/* ═══════════════════════════════════════════════
   Learning Signals (翌日以降の提案に反映)
   ═══════════════════════════════════════════════ */
export type LearningSignal = {
  /** 疲労トレンド（0=元気, 1=疲労） */
  fatigueTrend: number;
  /** 自己一致トレンド（0=不一致, 1=一致） */
  selfMatchTrend: number;
  /** 対人疲れトレンド */
  socialFatigue: number;
  /** コーデ満足度の平均 */
  outfitSatisfaction: number;
  /** 最近の傾向タグ */
  tendencyTags: string[];
};

/**
 * 最近の観測データから学習シグナルを生成
 * これが翌日のコーデ提案 / social導線 / UIトーンに反映される
 */
export function computeLearningSignals(records: DailyObservationRecord[]): LearningSignal {
  if (records.length === 0) {
    return { fatigueTrend: 0.5, selfMatchTrend: 0.5, socialFatigue: 0.5, outfitSatisfaction: 0.5, tendencyTags: [] };
  }

  const avg = (theme: ObservationTheme): number => {
    const vals = records
      .flatMap((r) => r.answers)
      .filter((a) => a.theme === theme)
      .map((a) => a.value);
    if (vals.length === 0) return 3;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  };

  const moodAvg = avg("mood");
  const selfAvg = avg("selfMatch");
  const socialAvg = avg("interpersonal");
  const outfitAvg = avg("outfit");

  // 1-5 → 0-1 に変換（5=最良→1.0, 1=最悪→0.0）
  const normalize = (v: number) => (v - 1) / 4;

  const fatigueTrend = 1 - normalize(moodAvg);
  const selfMatchTrend = normalize(selfAvg);
  const socialFatigue = 1 - normalize(socialAvg);
  const outfitSatisfaction = normalize(outfitAvg);

  // 傾向タグ
  const tags: string[] = [];
  if (fatigueTrend > 0.6) tags.push("疲れ気味");
  if (fatigueTrend < 0.3) tags.push("好調");
  if (selfMatchTrend > 0.7) tags.push("自分らしい");
  if (selfMatchTrend < 0.3) tags.push("無理気味");
  if (socialFatigue > 0.6) tags.push("対人疲れ");
  if (outfitSatisfaction > 0.7) tags.push("コーデ好調");
  if (outfitSatisfaction < 0.3) tags.push("コーデ見直し");

  return {
    fatigueTrend,
    selfMatchTrend,
    socialFatigue,
    outfitSatisfaction,
    tendencyTags: tags,
  };
}

/* ═══════════════════════════════════════════════
   3-Layer Orchestration
   HOME観測の3レイヤー統合

   Layer 1: Daily Check (2問) — mood / selfMatch
   Layer 2: Micro Stargazer (2問) — 深層観測
   Layer 3: Practical Update (1問) — outfit / laundry / eventFit 等
   ═══════════════════════════════════════════════ */

import type { QuestionVariant } from "@/lib/stargazer/questionVariants";
import {
  selectMicroQuestions,
  getTransitionLine,
  getTrajectoryClosing,
  getReactionForScore,
  type MicroStargazerProgress,
  type MicroStargazerAnswer,
} from "./microStargazer";

export type { MicroStargazerAnswer, MicroStargazerProgress };

export type QuestionLayer = "daily_check" | "micro_stargazer" | "practical_update";

import type { CategoryQuestion } from "./conversationCategories";

export type LayeredQuestion =
  | { layer: "daily_check"; question: ObservationQuestion; categoryQuestion?: CategoryQuestion }
  | { layer: "micro_stargazer"; variant: QuestionVariant; transitionLine?: string }
  | { layer: "practical_update"; question: ObservationQuestion; categoryQuestion?: CategoryQuestion };

/** Free Chat メッセージ */
export type FreeChatMessage = {
  role: "user" | "robot";
  text: string;
  timestamp: string; // ISO
};

/** DailyObservationRecord に micro 回答 + free chat + meta observation を追加する拡張版 */
export type ExtendedObservationRecord = DailyObservationRecord & {
  microAnswers?: MicroStargazerAnswer[];
  chatMessages?: FreeChatMessage[];
  metaObservation?: {
    targetAxis: string;
    reactionType: string;
    insight: string;
    deeperImplication: string;
    answeredAt: string;
  };
};

/** Daily Check 用コアテーマ（mood + selfMatch の2問） */
const DAILY_CHECK_THEMES: ObservationTheme[] = ["mood", "selfMatch"];

/** Practical 用テーマ（コンテキスト依存で1問） */
function selectPracticalTheme(date: string, ctx: DayContext): ObservationTheme {
  // コンテキスト優先
  if (ctx.hadDate) return "date";
  if (ctx.hadPeople) return "interpersonal";
  if (ctx.hadEvents) return "eventFit";
  // デフォルト: outfit と laundry を日替わり
  const seed = date.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return seed % 2 === 0 ? "outfit" : "laundry";
}

/**
 * 3レイヤー統合で最大5問を選出
 */
export function selectLayeredQuestions(
  date: string,
  ctx: DayContext,
  alreadyAnswered: ObservationTheme[],
  microProgress: MicroStargazerProgress,
): LayeredQuestion[] {
  const result: LayeredQuestion[] = [];

  // ── Layer 1: Daily Check (2問) ──
  const dailyThemes = DAILY_CHECK_THEMES.filter((t) => !alreadyAnswered.includes(t));
  for (const theme of dailyThemes) {
    const q = QUESTIONS.find((q) => q.theme === theme);
    if (q) result.push({ layer: "daily_check", question: q });
  }

  // ── Layer 2: Micro Stargazer (2問) ──
  const microVariants = selectMicroQuestions(date, microProgress);
  const transitionLine = getTransitionLine(microProgress.totalSessions, date);
  for (let i = 0; i < microVariants.length; i++) {
    result.push({
      layer: "micro_stargazer",
      variant: microVariants[i],
      transitionLine: i === 0 ? transitionLine : undefined,
    });
  }

  // ── Layer 3: Practical Update (1問) ──
  const practicalTheme = selectPracticalTheme(date, ctx);
  if (!alreadyAnswered.includes(practicalTheme)) {
    const q = QUESTIONS.find((q) => q.theme === practicalTheme);
    if (q) result.push({ layer: "practical_update", question: q });
  }

  return result;
}

/**
 * カテゴリベースの3レイヤー統合質問選出 (新エンジン)
 *
 * Layer 1: Category Questions (2-3問) — selectDailyQuestions() で時間帯×カテゴリ選出
 * Layer 2: Micro Stargazer (2問) — 深層観測
 *
 * 旧 selectLayeredQuestions() との違い:
 * - 5カテゴリ (partner/outfit/care/preparation/impression) から時間帯優先で選出
 * - questionKind (fixed/rotating/anomaly) を考慮
 * - CategoryQuestion の axisMapping を直接利用
 */
import { selectDailyQuestions, isObservationCategory } from "./conversationCategories";
import { getTimeOfDay } from "@/lib/shared/timeOfDay";

export function selectCategoryLayeredQuestions(
  date: string,
  ctx: DayContext,
  alreadyAnswered: ObservationTheme[],
  microProgress: MicroStargazerProgress,
): LayeredQuestion[] {
  const result: LayeredQuestion[] = [];
  const timeOfDay = getTimeOfDay();

  // Collect recently used question IDs (past 7 days)
  const recentIds: string[] = [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const history: string[] = raw ? JSON.parse(raw) : [];
    for (const d of history.slice(-7)) {
      const obs = loadObservation(d) as ExtendedObservationRecord | null;
      if (obs) {
        for (const a of obs.answers) {
          if (a.theme.startsWith("cat_")) recentIds.push(a.theme);
          else {
            // Legacy theme → try to find matching cat id
            const q = QUESTIONS.find((q) => q.theme === a.theme);
            if (q) recentIds.push(q.theme);
          }
        }
      }
    }
  } catch { /* ignore */ }

  // ── Layer 1: Category Questions (3問) ──
  const categoryQuestions = selectDailyQuestions(timeOfDay, ctx, recentIds, 3);
  for (const cq of categoryQuestions) {
    // Convert CategoryQuestion to ObservationQuestion format for backward compatibility
    const asObservation: ObservationQuestion = {
      theme: (cq.legacyTheme ?? cq.id) as ObservationTheme,
      robotLine: cq.robotLine,
      choices: cq.choices,
      reactions: cq.reactions,
      followUp: cq.followUp,
    };

    if (alreadyAnswered.includes(asObservation.theme)) continue;

    if (isObservationCategory(cq.category)) {
      result.push({ layer: "daily_check", question: asObservation, categoryQuestion: cq });
    } else {
      result.push({ layer: "practical_update", question: asObservation, categoryQuestion: cq });
    }
  }

  // ── Layer 2: Micro Stargazer (2問) ──
  const microVariants = selectMicroQuestions(date, microProgress);
  const transitionLine = getTransitionLine(microProgress.totalSessions, date);
  for (let i = 0; i < microVariants.length; i++) {
    result.push({
      layer: "micro_stargazer",
      variant: microVariants[i],
      transitionLine: i === 0 ? transitionLine : undefined,
    });
  }

  return result;
}

/**
 * 拡張版クロージング — micro回答がある場合は軌道言語を使う
 */
export function getLayeredClosingLine(
  record: DailyObservationRecord,
  microProgress: MicroStargazerProgress,
  hasMicroAnswers: boolean,
): string {
  if (hasMicroAnswers) {
    return getTrajectoryClosing(microProgress.totalSessions, record.date);
  }
  return getClosingLine(record);
}

// Re-export micro utilities for convenience
export { getReactionForScore } from "./microStargazer";

/* ═══════════════════════════════════════════════
   Free Chat Storage Helpers
   ═══════════════════════════════════════════════ */

const CHAT_COUNT_KEY = "culcept_chat_count_v1";
const MAX_CHAT_MESSAGES = 20;

/**
 * 今日の observation record に free chat メッセージを保存
 * 最新 MAX_CHAT_MESSAGES 件にトリミング
 */
export function saveChatMessages(date: string, messages: FreeChatMessage[]): void {
  try {
    const obs = loadObservation(date) as ExtendedObservationRecord | null;
    if (!obs) return;
    const trimmed = messages.slice(-MAX_CHAT_MESSAGES);
    const updated: ExtendedObservationRecord = { ...obs, chatMessages: trimmed };
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${date}`, JSON.stringify(updated));
  } catch { /* quota or parse error */ }
}

/**
 * 今日の observation record から free chat メッセージを復元
 */
export function loadChatMessages(date: string): FreeChatMessage[] {
  try {
    const obs = loadObservation(date) as ExtendedObservationRecord | null;
    return obs?.chatMessages ?? [];
  } catch {
    return [];
  }
}

/**
 * 直近 N 日のユーザー発言を取得（RAG コンテキスト用）
 * 各日の発言を改行区切りでまとめた配列を返す
 */
export function loadRecentChatContext(days: number = 3): string {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const history: string[] = raw ? JSON.parse(raw) : [];
    const recentDays = history.slice(-(days + 1), -1); // 今日を除く直近N日
    const summaries: string[] = [];
    for (const d of recentDays) {
      const obs = loadObservation(d) as ExtendedObservationRecord | null;
      if (!obs?.chatMessages || obs.chatMessages.length === 0) continue;
      const userMsgs = obs.chatMessages
        .filter((m) => m.role === "user")
        .map((m) => m.text)
        .join(" / ");
      if (userMsgs) summaries.push(`[${d}] ${userMsgs}`);
    }
    return summaries.join("\n");
  } catch {
    return "";
  }
}

/**
 * 累積会話カウント（トーン制御用）
 */
export function loadChatCount(): number {
  try {
    const raw = localStorage.getItem(CHAT_COUNT_KEY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

export function incrementChatCount(): number {
  const current = loadChatCount() + 1;
  try {
    localStorage.setItem(CHAT_COUNT_KEY, String(current));
  } catch { /* quota */ }
  return current;
}

/**
 * 今日の Q&A 結果を要約テキストにする（free chat system prompt 用）
 */
export function summarizeTodayObservation(date: string): string {
  try {
    const obs = loadObservation(date) as ExtendedObservationRecord | null;
    if (!obs || obs.answers.length === 0) return "";
    const lines = obs.answers.map((a) => {
      const themeLabel = a.theme.startsWith("cat_") ? a.theme : a.theme;
      return `${themeLabel}: ${a.value}/5`;
    });
    return lines.join(", ");
  } catch {
    return "";
  }
}
