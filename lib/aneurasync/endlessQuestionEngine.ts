// lib/aneurasync/endlessQuestionEngine.ts
// エンドレス質問エンジン: 1問ずつ返し、回答ごとに次を選択
// セッション疲労追跡 + Stargazer/カテゴリ混合 + 7日間重複回避

import type { TimeOfDay } from "@/lib/shared/timeOfDay";
import { getTimeOfDay, getTimeOfDayDetail } from "@/lib/shared/timeOfDay";
import {
  CATEGORY_QUESTIONS,
  type CategoryQuestion,
  type ConversationCategory,
} from "./conversationCategories";
import type { DayContext } from "./dailyObservation";
import { loadObservation, type ExtendedObservationRecord } from "./dailyObservation";
import { selectMicroQuestions, selectMicroQuestionsWithDepth, type MicroStargazerProgress } from "./microStargazer";
import type { QuestionVariant } from "@/lib/stargazer/questionVariants";

// ── DayContext に基づく質問フィルタ ──

function isContextValid(q: CategoryQuestion, dayContext: DayContext): boolean {
  if (q.requiresDate && !dayContext.hadDate) return false;
  // requiresInteraction = 人と接した前提の質問。hadPeople が true の場合のみ通す
  // hadDate は「デートした」だけなので、一般的な対人質問の条件にはしない
  if (q.requiresInteraction && !dayContext.hadPeople) return false;
  if (q.requiresOutfitSelected && !dayContext.hasOutfitToday) return false;
  return true;
}

/**
 * 質問の文脈適合スコア。高いほど今の状況に合っている。
 * isContextValid を通過した質問に対して、さらに優先順位をつける。
 */
function contextRelevanceScore(
  q: CategoryQuestion,
  dayContext: DayContext,
  answeredCatIds: string[],
  lastAnswerCategory?: string,
  lastAnswerValue?: number,
): number {
  let score = 0;

  // partner カテゴリで hadPeople=false → solo 質問のみ優先、それ以外はペナルティ
  if (q.category === "partner" && !dayContext.hadPeople && !dayContext.hadDate) {
    if (q.id.includes("solo")) {
      score += 15; // solo 質問を最優先
    } else if (!q.requiresInteraction) {
      // requiresInteraction がなくても、質問文が対人前提なら出さない
      score -= 5; // 対人前提でない partner 質問も控えめに
    }
  }

  // partner カテゴリで hadPeople=true → interaction 前提の質問を優先
  if (q.category === "partner" && dayContext.hadPeople) {
    if (q.requiresInteraction) {
      score += 8; // 対人質問を優先
    }
  }

  // Issue 2: ネガティブな partner 回答の後は partner カテゴリを強く回避
  // 「誰も浮かばなかった」等の回答後に対人質問を続けるのは不自然
  if (
    q.category === "partner" &&
    lastAnswerCategory === "partner" &&
    (lastAnswerValue ?? 3) <= 2
  ) {
    score -= 15;
  }

  // 既に同カテゴリの質問に答えている → 連続で同じカテゴリを避ける
  const sameCategory = answeredCatIds.filter(id => {
    const existing = CATEGORY_QUESTIONS.find(eq => eq.id === id);
    return existing?.category === q.category;
  }).length;
  if (sameCategory >= 2) score -= 10;  // Issue 4: 3問目以降は強く回避
  if (sameCategory >= 3) score -= 20;  // Issue 4: 4問目以降はほぼブロック

  // 直前の質問と同カテゴリ＋同レンズならスキップ相当のペナルティ
  if (answeredCatIds.length > 0) {
    const lastId = answeredCatIds[answeredCatIds.length - 1];
    const lastQ = CATEGORY_QUESTIONS.find(eq => eq.id === lastId);
    if (lastQ?.category === q.category && lastQ?.lens && lastQ.lens === q.lens) {
      score -= 25;
    }
  }

  return score;
}

// ── Types ──

export type EndlessQuestionKind = "category" | "micro_stargazer" | "ai_pending" | "context_setup";

/** 1問目のコンテキスト質問（今日の過ごし方を確認） */
export interface ContextSetupQuestion {
  robotLine: string;
  choices: {
    value: number;
    label: string;
    /** DayContext に反映するキー */
    contextUpdate: Partial<DayContext>;
  }[];
}

/**
 * 時間帯に応じたコンテキスト質問を返す。
 * 朝 → 今日の予定を聞く、午後/夜 → 今日の実際の過ごし方を聞く
 */
export function getContextSetupQuestion(): ContextSetupQuestion {
  const hour = new Date().getHours();
  if (hour < 12) {
    // 朝: 今日の予定ベースで聞く
    return {
      robotLine: "今日はどんな1日になりそう？",
      choices: [
        { value: 5, label: "人と会う予定がある", contextUpdate: { hadPeople: true, hadEvents: true } },
        { value: 4, label: "デートがある", contextUpdate: { hadPeople: true, hadDate: true, hadEvents: true } },
        { value: 3, label: "仕事・学校で人と過ごす", contextUpdate: { hadPeople: true, hadEvents: true } },
        { value: 2, label: "基本ひとりで過ごす", contextUpdate: { hadPeople: false } },
        { value: 1, label: "まだわからない", contextUpdate: {} },
      ],
    };
  }
  // 午後・夜: 実際の過ごし方を聞く
  return {
    robotLine: "今日はどんな1日だった？",
    choices: [
      { value: 5, label: "人と過ごした", contextUpdate: { hadPeople: true } },
      { value: 4, label: "デートだった", contextUpdate: { hadPeople: true, hadDate: true } },
      { value: 3, label: "仕事・学校で人と過ごした", contextUpdate: { hadPeople: true, hadEvents: true } },
      { value: 2, label: "ほぼ一人で過ごした", contextUpdate: { hadPeople: false } },
      { value: 1, label: "家でゆっくりしてた", contextUpdate: { hadPeople: false } },
    ],
  };
}

export interface EndlessQuestion {
  kind: EndlessQuestionKind;
  /** カテゴリ質問の場合 */
  categoryQuestion?: CategoryQuestion;
  /** Micro Stargazer質問の場合 */
  variant?: QuestionVariant;
  /** ロボットの遷移セリフ（レイヤー切替時） */
  transitionLine?: string;
  /** AI質問生成のためのコンテキスト（kind === "ai_pending" のとき） */
  aiContext?: {
    category: string;
    timeOfDay: string;
    lastAnswerCategory?: string;
    lastAnswerValue?: number;
  };
  /** コンテキスト質問の場合 */
  contextSetup?: ContextSetupQuestion;
}

export interface EndlessSessionState {
  /** 今日の日付 */
  date: string;
  /** 回答済み質問ID */
  answeredIds: string[];
  /** カテゴリ質問で回答済みのもの */
  answeredCategoryIds: string[];
  /** Micro Stargazer で回答済みのvariant ID */
  answeredMicroIds: string[];
  /** セッション内の総回答数 */
  totalAnswered: number;
  /** 最後にStargazerにブリッジした回答インデックス */
  lastBridgeIndex: number;
  /** 中断時刻 */
  pausedAt?: string;
  /** 最後に回答したカテゴリ質問のカテゴリ */
  lastAnswerCategory?: string;
  /** 最後に回答したカテゴリ質問の回答値 */
  lastAnswerValue?: number;
  /** コンテキスト質問（今日の過ごし方）を完了したか */
  contextSetupDone?: boolean;
}

const STORAGE_KEY = "culcept_robot_session_v1";
const HISTORY_KEY = "culcept_observations_v1";

// ── 疲労度に基づく質問の軽さ調整 ──

type QuestionWeight = "light" | "medium" | "deep";

function getQuestionWeight(totalAnswered: number): QuestionWeight {
  if (totalAnswered < 3) return "medium"; // 最初はノーマル
  if (totalAnswered < 6) return "medium";
  if (totalAnswered < 10) return "light"; // 徐々に軽く
  return "light"; // 10問超えたら軽い質問メイン
}

// ── 時間帯別の質問トーン ──

const TIME_QUESTION_BIAS: Record<TimeOfDay, ConversationCategory[]> = {
  morning: ["preparation", "outfit", "care"], // 期待・準備系
  afternoon: ["impression", "partner", "outfit"], // 観察・振り返り系
  night: ["partner", "impression", "care"], // 深い振り返り系
};

// ── カテゴリ間の自然な遷移マップ ──
// 前のカテゴリ回答 → 次に自然に繋がるカテゴリの優先順
// 「会話の流れ」を作るための遷移ルール
const CATEGORY_FLOW: Record<ConversationCategory, {
  natural: ConversationCategory[];    // 自然に繋がるカテゴリ
  afterPositive: ConversationCategory[];  // ポジティブ回答後に自然な流れ
  afterNegative: ConversationCategory[];  // ネガティブ回答後に自然な流れ
}> = {
  partner: {
    natural: ["impression", "outfit"],          // 人 → 印象/見た目の話題が自然
    afterPositive: ["impression", "outfit"],     // 良い交流 → 印象の振り返り
    afterNegative: ["impression", "care"],       // 疲れた → 気分の振り返り/ケア
  },
  outfit: {
    natural: ["impression", "care"],            // 服 → 印象/ケアが自然
    afterPositive: ["impression", "partner"],    // 良いコーデ → 印象/対人
    afterNegative: ["care", "preparation"],      // 合わなかった → ケア/明日の準備
  },
  impression: {
    natural: ["partner", "outfit"],             // 印象 → 対人/服の話題
    afterPositive: ["partner", "preparation"],   // 良い気分 → 対人/明日の期待
    afterNegative: ["care", "outfit"],           // 重い気分 → ケア/服で気分転換
  },
  care: {
    natural: ["outfit", "preparation"],         // ケア → 服/準備が自然
    afterPositive: ["preparation", "outfit"],
    afterNegative: ["preparation", "outfit"],
  },
  preparation: {
    natural: ["outfit", "impression"],          // 準備 → 服/印象が自然
    afterPositive: ["outfit", "impression"],
    afterNegative: ["impression", "care"],
  },
};

// ── 遷移用ブリッジライン（カテゴリ変更時の一言） ──
const TRANSITION_BRIDGES: Record<string, string[]> = {
  "partner→impression": [
    "人との時間の話を聞いて思ったんだけど、",
    "そうだ、今日の気分も聞いていい？",
  ],
  "partner→outfit": [
    "そういえば、今日の服はどうだった？",
  ],
  "partner→care": [
    "少し話題を変えるね。",
  ],
  "outfit→impression": [
    "コーデの話ついでに、",
    "服って気分に影響するよね。",
  ],
  "outfit→care": [
    "今日のアイテムのことなんだけど、",
  ],
  "impression→partner": [
    "気分の話を聞いてて思ったんだけど、",
  ],
  "impression→outfit": [
    "印象って、服とも繋がるよね。",
  ],
  "impression→care": [
    "少し軽い話にしようか。",
  ],
  "care→preparation": [
    "ケアついでに、明日のことも考えておく？",
  ],
  "care→outfit": [
    "そういえば服のことで、",
  ],
  "preparation→outfit": [
    "明日のことを考えると、",
  ],
  "preparation→impression": [
    "準備の話ついでに、",
  ],
};

// ── 直近7日間の回答済みIDを収集 ──

function collectRecentQuestionIds(): string[] {
  const recentIds: string[] = [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const history: string[] = raw ? JSON.parse(raw) : [];
    for (const d of history.slice(-7)) {
      const obs = loadObservation(d) as ExtendedObservationRecord | null;
      if (obs) {
        for (const a of obs.answers) {
          recentIds.push(a.theme);
        }
      }
    }
  } catch { /* ignore */ }
  return recentIds;
}

// ── メイン: 次の1問を選択 ──

export function selectNextQuestion(
  state: EndlessSessionState,
  dayContext: DayContext,
  microProgress: MicroStargazerProgress,
  depthLevel?: number,
): EndlessQuestion | null {
  const timeOfDay = getTimeOfDay();
  const weight = getQuestionWeight(state.totalAnswered);

  // ── 最初の1問目: コンテキスト質問 ──
  // セッションの最初に「今日はどんな1日？」を聞いて DayContext を設定
  if (state.totalAnswered === 0 && !state.contextSetupDone) {
    return {
      kind: "context_setup",
      contextSetup: getContextSetupQuestion(),
    };
  }

  // 7日間の重複回避 + 今日のセッション内重複回避
  const recentIds = collectRecentQuestionIds();
  const allUsedIds = new Set([...recentIds, ...state.answeredIds]);

  // ── Stargazer Micro 質問を混ぜるタイミング ──
  // 比率 2:1（2問カテゴリ → 1問 Micro）
  const shouldInsertMicro =
    state.totalAnswered > 0 &&
    state.totalAnswered % 3 === 2 && // 3問目, 6問目, 9問目...
    state.answeredMicroIds.length < 6; // 1セッション最大6問まで

  if (shouldInsertMicro) {
    const microVariants = depthLevel != null && depthLevel > 2
      ? selectMicroQuestionsWithDepth(state.date, microProgress, depthLevel)
      : selectMicroQuestions(state.date, microProgress);
    const unused = microVariants.filter(
      (v) => !state.answeredMicroIds.includes(v.id),
    );
    if (unused.length > 0) {
      const isFirstMicro = state.answeredMicroIds.length === 0;
      return {
        kind: "micro_stargazer",
        variant: unused[0],
        transitionLine: isFirstMicro
          ? getDetailedTransitionLine(state.totalAnswered)
          : undefined,
      };
    }
    if (unused.length === 0) {
      console.warn("[endlessEngine] Micro Stargazer questions exhausted for this session");
    }
  }

  // ── AI生成質問を混ぜるタイミング ──
  // 5問に1問（4問目, 9問目, 14問目...）= Micro Stargazer とずらす
  const shouldInsertAI =
    state.totalAnswered > 2 &&
    state.totalAnswered % 5 === 3;

  if (shouldInsertAI) {
    // 会話フローに基づいてカテゴリを推定
    const biasForAI = TIME_QUESTION_BIAS[timeOfDay];
    const aiCategory = biasForAI[state.totalAnswered % biasForAI.length];
    return {
      kind: "ai_pending",
      transitionLine: "…ちょっと違う角度から聞いてみたい。",
      aiContext: {
        category: aiCategory,
        timeOfDay: getTimeOfDayDetail(),
        lastAnswerCategory: state.lastAnswerCategory,
        lastAnswerValue: state.lastAnswerValue,
      },
    };
  }

  // ── カテゴリ質問を選択（会話フロー制御） ──
  const biasCategories = TIME_QUESTION_BIAS[timeOfDay];

  // 類似グループの重複回避: 今セッションで回答済みの質問の similarGroup を収集
  const usedSimilarGroups = new Set<string>();
  for (const answeredId of state.answeredCategoryIds) {
    const answered = CATEGORY_QUESTIONS.find((q) => q.id === answeredId);
    if (answered?.similarGroup) {
      usedSimilarGroups.add(answered.similarGroup);
    }
  }

  // 候補を優先度順にフィルタ（文脈適合スコアでソート）
  const sortByRelevance = (candidates: CategoryQuestion[]) =>
    [...candidates].sort((a, b) =>
      contextRelevanceScore(b, dayContext, state.answeredCategoryIds, state.lastAnswerCategory, state.lastAnswerValue) -
      contextRelevanceScore(a, dayContext, state.answeredCategoryIds, state.lastAnswerCategory, state.lastAnswerValue),
    );

  // ヘルパー: カテゴリから未回答候補を取得
  const getCandidates = (category: ConversationCategory) =>
    CATEGORY_QUESTIONS.filter(
      (q) =>
        q.category === category &&
        !allUsedIds.has(q.id) &&
        !state.answeredCategoryIds.includes(q.id) &&
        isContextValid(q, dayContext) &&
        // 同一セッション内で同じ similarGroup の質問は1つのみ
        (!q.similarGroup || !usedSimilarGroups.has(q.similarGroup)),
    );

  // ヘルパー: カテゴリから最適な1問を選択
  const pickFromCategory = (category: ConversationCategory): EndlessQuestion | null => {
    const candidates = getCandidates(category);
    const timeMatched = sortByRelevance(
      candidates.filter((c) => c.timePreference.includes(timeOfDay)),
    );
    const best = timeMatched[0] ?? sortByRelevance(candidates)[0];
    if (!best) return null;

    // 前のカテゴリと違う場合、ブリッジラインを付与
    let transitionLine: string | undefined;
    if (state.lastAnswerCategory && state.lastAnswerCategory !== category) {
      const key = `${state.lastAnswerCategory}→${category}`;
      const bridges = TRANSITION_BRIDGES[key];
      if (bridges && bridges.length > 0) {
        transitionLine = bridges[state.totalAnswered % bridges.length];
      }
    }

    return { kind: "category", categoryQuestion: best, transitionLine };
  };

  // ── Step 1: 会話フローに基づくカテゴリ選択 ──
  // 前の質問がある場合、CATEGORY_FLOW に従って自然な遷移先を優先
  if (state.lastAnswerCategory && state.lastAnswerCategory in CATEGORY_FLOW) {
    const lastCat = state.lastAnswerCategory as ConversationCategory;
    const flow = CATEGORY_FLOW[lastCat];
    const tendency = (state.lastAnswerValue ?? 3) >= 4 ? "afterPositive"
                   : (state.lastAnswerValue ?? 3) <= 2 ? "afterNegative"
                   : "natural";
    const flowCategories = flow[tendency];

    for (const nextCat of flowCategories) {
      const result = pickFromCategory(nextCat);
      if (result) return result;
    }
  }

  // ── Step 2: フロー先に候補がない → 時間帯バイアスで選択 ──
  // 軽い質問: care, preparation を優先（operational系）
  const preferredCategories =
    weight === "light"
      ? ["care", "preparation", "outfit"] as ConversationCategory[]
      : biasCategories;

  for (const category of preferredCategories) {
    const result = pickFromCategory(category);
    if (result) return result;
  }

  // ── Step 3: 全カテゴリから候補を探す ──
  const allCandidates = CATEGORY_QUESTIONS.filter(
    (q) =>
      !allUsedIds.has(q.id) &&
      !state.answeredCategoryIds.includes(q.id) &&
      isContextValid(q, dayContext) &&
      (!q.similarGroup || !usedSimilarGroups.has(q.similarGroup)),
  );
  if (allCandidates.length > 0) {
    const timeMatched = sortByRelevance(
      allCandidates.filter((c) => c.timePreference.includes(timeOfDay)),
    );
    const sorted = sortByRelevance(allCandidates);
    const best = timeMatched[0] ?? sorted[0];
    let transitionLine: string | undefined;
    if (state.lastAnswerCategory && state.lastAnswerCategory !== best.category) {
      const key = `${state.lastAnswerCategory}→${best.category}`;
      const bridges = TRANSITION_BRIDGES[key];
      if (bridges && bridges.length > 0) {
        transitionLine = bridges[state.totalAnswered % bridges.length];
      }
    }
    return { kind: "category", categoryQuestion: best, transitionLine };
  }

  // 全質問使い切った場合（稀）→ 7日重複を許可して再選択
  const fallback = CATEGORY_QUESTIONS.filter(
    (q) =>
      !state.answeredCategoryIds.includes(q.id) &&
      isContextValid(q, dayContext),
  );
  if (fallback.length > 0) {
    return { kind: "category", categoryQuestion: fallback[0] };
  }

  return null; // 本当に質問が無い（ほぼありえない）
}

// ── セッション状態管理 ──

export function createSessionState(date: string): EndlessSessionState {
  return {
    date,
    answeredIds: [],
    answeredCategoryIds: [],
    answeredMicroIds: [],
    totalAnswered: 0,
    lastBridgeIndex: 0,
  };
}

export function saveSessionState(state: EndlessSessionState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* full */ }
}

export function loadSessionState(): EndlessSessionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state: EndlessSessionState = JSON.parse(raw);
    // 日付が変わっていたらクリア（ローカル日付で比較）
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (state.date !== today) {
      clearSessionState();
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

export function clearSessionState(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

// ── ブリッジタイミング判定 ──

/** 3-5問ごとにStargazerへインクリメンタル送信すべきか */
export function shouldBridgeToStargazer(state: EndlessSessionState): boolean {
  const sinceLastBridge = state.totalAnswered - state.lastBridgeIndex;
  return sinceLastBridge >= 4; // 4問ごと
}

// ── まとめ挿入判定 ──

/** 5-8問ごとに「今日のまとめ」を挟むか */
export function shouldInsertSummary(totalAnswered: number): boolean {
  // 6問目, 12問目, 18問目...
  return totalAnswered > 0 && totalAnswered % 6 === 0;
}

// ── 遷移セリフ ──

function getDetailedTransitionLine(totalAnswered: number): string {
  const detail = getTimeOfDayDetail();
  const lines: Record<string, string[]> = {
    late_night: [
      "…夜も深まってきたね。少しだけ、もう少し深い質問を。",
      "静かな時間だから、普段聞けないことを聞いてみる。",
    ],
    morning: [
      "朝の頭がクリアなうちに、ちょっと違う角度の質問を。",
      "今の調子が分かってきた。もう少し掘ってみていい？",
    ],
    afternoon: [
      "午前の流れが見えてきた。別の角度から見てみよう。",
      "いい感じだね。ちょっと視点を変えてみる。",
    ],
    late_afternoon: [
      "夕方の自分って、朝とはちょっと違うよね。そこを見てみる。",
    ],
    evening: [
      "今日一日の余韻があるうちに、少し深いところを。",
      "リラックスしてるなら、ちょっとだけ内側の話を。",
    ],
  };

  const pool = lines[detail] ?? lines.evening!;
  const idx = totalAnswered % pool.length;
  return pool[idx];
}

// ── 時間帯別挨拶（メモリアウェア拡張版） ──

export function getTimeAwareGreeting(
  recentRecords: { date: string; answers: { theme: string; value: number }[] }[],
): string {
  const detail = getTimeOfDayDetail();

  // 直近の記録からコンテキストを読み取る
  const last = recentRecords[recentRecords.length - 1];
  const lastMood = last?.answers.find((a) => a.theme === "mood");
  const lastSelf = last?.answers.find((a) => a.theme === "selfMatch");

  // 時間帯ベースの挨拶 + 記憶ベースの気遣い
  const timeGreetings: Record<string, string[]> = {
    late_night: [
      "まだ起きてるんだ。夜型の自分も観測対象。",
      "こんな時間に来てくれたんだ。少しだけ話そう。",
    ],
    morning: [
      "おはよう。今日はどんな一日になりそう？",
      "朝だね。昨日の自分と今日の自分、何か違う？",
    ],
    afternoon: [
      "調子はどう？午前中のこと、まだ頭に残ってる？",
      "午後だね。今日ここまでで何か気づいたことある？",
    ],
    late_afternoon: [
      "夕方か。一日の流れが見えてくる時間。",
      "もうすぐ一日が終わるね。今日はどうだった？",
    ],
    evening: [
      "おつかれ。今日はどうだった？",
      "今日一日、お疲れさま。ちょっとだけ振り返ろう。",
    ],
  };

  // 前回の状態を踏まえた挨拶
  if (lastMood && lastMood.value <= 2) {
    const concern: Record<string, string> = {
      late_night: "この前疲れてたけど…こんな時間に起きてるってことは、まだ引きずってる？",
      morning: "この前は少し疲れてたけど、朝の気分はどう？",
      afternoon: "前回疲れてたね。今日のここまではどう？",
      late_afternoon: "この前の疲れ、今日は少しマシになった？",
      evening: "前回疲れてたね。今日一日どうだった？",
    };
    return concern[detail] ?? concern.evening!;
  }

  if (lastSelf && lastSelf.value <= 2) {
    return "前回ちょっと無理してたね。今日は自分でいられてる？";
  }

  if (recentRecords.length >= 5) {
    return "続けて来てくれてるね。今日もちょっとだけ。";
  }

  const pool = timeGreetings[detail] ?? timeGreetings.evening!;
  // 日付ベースのシード
  const dayNum = new Date().getDate();
  return pool[dayNum % pool.length];
}

// ── まとめテキスト生成 ──

export function generateSessionSummary(
  answeredCount: number,
  _answers: { questionId: string; value: number }[],
): string {
  if (answeredCount <= 3) {
    return "まだ始まったばかり。もう少し続けると、今日の傾向が見えてくる。";
  }
  if (answeredCount <= 8) {
    return `${answeredCount}問回答済み。今日のあなたの輪郭が少しずつ見えてきた。`;
  }
  return `${answeredCount}問も答えてくれた。今日の観測データはかなり充実してきたね。`;
}
