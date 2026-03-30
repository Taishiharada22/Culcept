// lib/origin/dailyOrbit/reflectionEngine.ts
// 夜の1問 — Stargazer × タスク × 身体 × 内在する意図から導出

import type {
  DayState,
  OrbitTask,
  BodyEcho,
  CompletionTexture,
  TaskNature,
} from "./types";

type ReflectionContext = {
  tasks: OrbitTask[];
  dayState: DayState | null;
  bodyEcho: BodyEcho | null;
  hasShadowIntention: boolean;
  /** 過去7日間の完了率 (0-1) */
  recentCompletionRate?: number;
};

type QuestionTemplate = {
  question: string;
  match: (ctx: ReflectionContext) => boolean;
  priority: number;
};

const QUESTION_TEMPLATES: QuestionTemplate[] = [
  // ━━ 身体 × 行動の矛盾 ━━
  {
    question:
      "\u8eab\u4f53\u304c\u91cd\u3044\u4e2d\u3067\u3082\u52d5\u3051\u305f\u4eca\u65e5\u3002\u4f55\u304c\u3042\u306a\u305f\u3092\u52d5\u304b\u3057\u3066\u305f\uff1f",
    match: (ctx) => {
      const completed = ctx.tasks.filter((t) => t.completed).length;
      const total = ctx.tasks.length;
      const bodyHeavy =
        ctx.bodyEcho?.head === "heavy" ||
        ctx.bodyEcho?.limbs === "heavy" ||
        ctx.bodyEcho?.chest === "tight";
      return bodyHeavy === true && total > 0 && completed / total >= 0.5;
    },
    priority: 12,
  },
  // ━━ 内在する意図がある日 ━━
  {
    question:
      "\u4eca\u65e5\u3001\u30ea\u30b9\u30c8\u306b\u5165\u308c\u306a\u304b\u3063\u305f\u3082\u306e\u304c\u3042\u3063\u305f\u306d\u3002\u305d\u308c\u306b\u3064\u3044\u3066\u3001\u4eca\u3069\u3093\u306a\u6c17\u6301\u3061\uff1f",
    match: (ctx) => ctx.hasShadowIntention,
    priority: 11,
  },
  // ━━ energy低 × 完了率高 ━━
  {
    question:
      "\u30a8\u30cd\u30eb\u30ae\u30fc\u304c\u4f4e\u3044\u4e2d\u3067\u3082\u52d5\u3051\u305f\u4eca\u65e5\u3001\u4f55\u304c\u3042\u306a\u305f\u3092\u52d5\u304b\u3057\u3066\u305f\uff1f",
    match: (ctx) => {
      const completed = ctx.tasks.filter((t) => t.completed).length;
      const total = ctx.tasks.length;
      return (
        !!ctx.dayState?.energy &&
        ["very_low", "low"].includes(ctx.dayState.energy!) &&
        total > 0 &&
        completed / total >= 0.5
      );
    },
    priority: 10,
  },
  // ━━ 全未完了 ━━
  {
    question:
      "\u4eca\u65e5\u3001\u4e00\u756a\u9577\u304f\u982d\u306e\u4e2d\u306b\u3042\u3063\u305f\u3053\u3068\u306f\u4f55\u3060\u3063\u305f\uff1f",
    match: (ctx) => {
      const completed = ctx.tasks.filter((t) => t.completed).length;
      return ctx.tasks.length > 0 && completed === 0;
    },
    priority: 10,
  },
  // ━━ 完了の感触がほっとしたばかり ━━
  {
    question:
      "\u4eca\u65e5\u306e\u30bf\u30b9\u30af\u3001\u300c\u307b\u3063\u3068\u3057\u305f\u300d\u304c\u591a\u304b\u3063\u305f\u3002\u672c\u5f53\u306b\u3084\u308a\u305f\u3044\u3053\u3068\u306f\u4f55\u3060\u3063\u305f\uff1f",
    match: (ctx) => {
      const relieved = ctx.tasks.filter(
        (t) => t.completed && t.texture === "relieved",
      ).length;
      const completed = ctx.tasks.filter((t) => t.completed).length;
      return completed >= 2 && relieved / completed >= 0.6;
    },
    priority: 9,
  },
  // ━━ 好奇心タスク完了 ━━
  {
    question:
      "\u597d\u5947\u5fc3\u3067\u52d5\u3044\u305f\u4eca\u65e5\u3002\u305d\u306e\u5148\u306b\u4f55\u304c\u898b\u3048\u305f\uff1f",
    match: (ctx) =>
      ctx.tasks.some(
        (t) => t.completed && t.nature === "curiosity",
      ),
    priority: 8,
  },
  // ━━ joyful ━━
  {
    question: "\u4eca\u65e5\u3001\u3075\u3068\u826f\u3044\u306a\u3068\u611f\u3058\u305f\u77ac\u9593\u306f\u3042\u3063\u305f\uff1f",
    match: (ctx) => ctx.dayState?.emotion === "joyful",
    priority: 8,
  },
  // ━━ anxious / frustrated ━━
  {
    question:
      "\u4eca\u65e5\u305a\u3063\u3068\u5f15\u3063\u304b\u304b\u3063\u3066\u3044\u305f\u3053\u3068\u304c\u3042\u308b\u3068\u3057\u305f\u3089\u3001\u305d\u308c\u306f\u4f55\uff1f",
    match: (ctx) =>
      ctx.dayState?.emotion === "anxious" ||
      ctx.dayState?.emotion === "frustrated",
    priority: 8,
  },
  // ━━ tired ━━
  {
    question: "\u4eca\u65e5\u306e\u75b2\u308c\u306e\u6b63\u4f53\u306f\u4f55\u3060\u3063\u305f\u3068\u601d\u3046\uff1f",
    match: (ctx) => ctx.dayState?.emotion === "tired",
    priority: 8,
  },
  // ━━ 義務ばかりの日 ━━
  {
    question:
      "\u7fa9\u52d9\u304c\u591a\u3044\u65e5\u3060\u3063\u305f\u3002\u300c\u3084\u308b\u3079\u304d\u300d\u3068\u300c\u3084\u308a\u305f\u3044\u300d\u306e\u9593\u3067\u3001\u4eca\u3069\u3093\u306a\u6c17\u6301\u3061\uff1f",
    match: (ctx) => {
      const obligations = ctx.tasks.filter(
        (t) => t.nature === "obligation",
      ).length;
      return ctx.tasks.length >= 3 && obligations / ctx.tasks.length >= 0.7;
    },
    priority: 7,
  },
  // ━━ alone ━━
  {
    question:
      "\u4eca\u65e5\u3001\u4e00\u4eba\u306e\u6642\u9593\u306f\u3069\u3093\u306a\u6642\u9593\u3060\u3063\u305f\uff1f",
    match: (ctx) => ctx.dayState?.social === "alone",
    priority: 5,
  },
  // ━━ many_people ━━
  {
    question:
      "\u4eca\u65e5\u3001\u8ab0\u304b\u3068\u3044\u308b\u6642\u9593\u306e\u4e2d\u3067\u3001\u5370\u8c61\u306b\u6b8b\u3063\u305f\u3084\u308a\u3068\u308a\u306f\u3042\u308b\uff1f",
    match: (ctx) => ctx.dayState?.social === "many_people",
    priority: 5,
  },
  // ━━ 完了率高 ━━
  {
    question:
      "\u4eca\u65e5\u3084\u3063\u305f\u3053\u3068\u306e\u4e2d\u3067\u3001\u4e00\u756a\u81ea\u5206\u3089\u3057\u304b\u3063\u305f\u306e\u306f\u3069\u308c\uff1f",
    match: (ctx) => {
      const completed = ctx.tasks.filter((t) => t.completed).length;
      const total = ctx.tasks.length;
      return total >= 3 && completed / total >= 0.8;
    },
    priority: 7,
  },
  // ━━ 引き継ぎタスクあり ━━
  {
    question:
      "\u6301\u3061\u8d8a\u3057\u3066\u3044\u308b\u30bf\u30b9\u30af\u304c\u3042\u308b\u3002\u305d\u308c\u306b\u5bfe\u3057\u3066\u4eca\u3069\u3093\u306a\u6c17\u6301\u3061\uff1f",
    match: (ctx) => ctx.tasks.some((t) => t.carriedFrom),
    priority: 6,
  },
  // ━━ energy high ━━
  {
    question:
      "\u4eca\u65e5\u306f\u30a8\u30cd\u30eb\u30ae\u30fc\u304c\u3042\u3063\u305f\u65e5\u3002\u4f55\u304c\u305d\u3046\u3055\u305b\u305f\u3068\u601d\u3046\uff1f",
    match: (ctx) =>
      !!ctx.dayState?.energy &&
      ["high", "very_high"].includes(ctx.dayState.energy!),
    priority: 6,
  },
  // ━━ late_night ━━
  {
    question:
      "\u3053\u3093\u306a\u6642\u9593\u307e\u3067\u8d77\u304d\u3066\u3044\u308b\u4eca\u65e5\u3001\u4f55\u304c\u982d\u306b\u3042\u308b\uff1f",
    match: (ctx) => ctx.dayState?.timeOfDay === "late_night",
    priority: 9,
  },
  // ━━ 胃がきゅっとする日 ━━
  {
    question:
      "\u80c3\u304c\u304d\u3085\u3063\u3068\u3059\u308b\u65e5\u3060\u3063\u305f\u3002\u4f55\u304c\u5f15\u3063\u304b\u304b\u3063\u3066\u305f\uff1f",
    match: (ctx) => ctx.bodyEcho?.stomach === "tense",
    priority: 7,
  },
  // ━━ フォールバック ━━
  {
    question: "\u4eca\u65e5\u3092\u4e00\u8a00\u3067\u8868\u3059\u306a\u3089\uff1f",
    match: () => true,
    priority: 0,
  },
  {
    question:
      "\u660e\u65e5\u306e\u81ea\u5206\u306b\u4e00\u3064\u3060\u3051\u4f1d\u3048\u308b\u306a\u3089\u3001\u4f55\u3092\u4f1d\u3048\u308b\uff1f",
    match: () => true,
    priority: 0,
  },
  {
    question:
      "\u4eca\u65e5\u3001\u81ea\u5206\u306e\u4e2d\u3067\u4e00\u756a\u5909\u5316\u3057\u305f\u611f\u60c5\u306f\uff1f",
    match: () => true,
    priority: 0,
  },
  {
    question:
      "\u4eca\u65e5\u3001\u8ab0\u306b\u3082\u8a00\u308f\u306a\u304b\u3063\u305f\u3051\u3069\u3001\u5fc3\u306e\u4e2d\u306b\u3042\u3063\u305f\u3053\u3068\u306f\uff1f",
    match: () => true,
    priority: 0,
  },
];

/**
 * 今夜の1問を選ぶ
 */
export function selectNightQuestion(
  ctx: ReflectionContext,
  dateStr: string,
): string {
  const matched = QUESTION_TEMPLATES.filter((t) => t.match(ctx));

  if (matched.length === 0) {
    return "\u4eca\u65e5\u306f\u3069\u3093\u306a1\u65e5\u3060\u3063\u305f\uff1f";
  }

  const maxPriority = Math.max(...matched.map((m) => m.priority));
  const top = matched.filter((m) => m.priority === maxPriority);

  const seed = dateStr
    .split("-")
    .reduce((acc, n) => acc + parseInt(n, 10), 0);
  return top[seed % top.length].question;
}
