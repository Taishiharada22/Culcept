/**
 * Growth Nudge Engine
 * 関係性の成長を促す予見的サジェスション
 * 日1回上限、文脈対応ナッジを生成
 */

import type { RendezvousCategory, ReasonCode, CautionCode } from "./types";
import type { TrajectoryDirection } from "./livingScore";

export type GrowthNudgeType =
  | "conversation_starter"
  | "activity_suggestion"
  | "reflection_prompt"
  | "appreciation_reminder"
  | "boundary_check"
  | "depth_invitation";

export type GrowthNudge = {
  type: GrowthNudgeType;
  text: string;
  subtext?: string;
};

type NudgeContext = {
  category: RendezvousCategory;
  direction: TrajectoryDirection;
  reasonCodes: ReasonCode[];
  cautionCodes: CautionCode[];
  daysSinceMatch: number;
  messageCount: number;
  lastMessageDaysAgo: number;
};

const NUDGE_TEMPLATES: Record<
  GrowthNudgeType,
  { conditions: (ctx: NudgeContext) => boolean; generate: (ctx: NudgeContext) => GrowthNudge }
> = {
  conversation_starter: {
    conditions: (ctx) => ctx.lastMessageDaysAgo >= 2 && ctx.messageCount < 20,
    generate: (ctx) => ({
      type: "conversation_starter",
      text: ctx.category === "romantic"
        ? "最近の小さな嬉しかったこと、シェアしてみませんか？"
        : ctx.category === "cocreation"
          ? "最近見つけた面白いもの、シェアしてみませんか？"
          : "ふと思い出した時に、声をかけてみては？",
      subtext: "自然な会話のきっかけになるかもしれません",
    }),
  },
  activity_suggestion: {
    conditions: (ctx) => ctx.messageCount >= 10 && ctx.daysSinceMatch >= 3,
    generate: () => ({
      type: "activity_suggestion",
      text: "一緒にアクティビティをしてみませんか？",
      subtext: "並行質問やスタイルデュエットで、新しい一面を発見できます",
    }),
  },
  reflection_prompt: {
    conditions: (ctx) => ctx.messageCount >= 20 && ctx.daysSinceMatch >= 7,
    generate: () => ({
      type: "reflection_prompt",
      text: "この関係で感じた「意外だったこと」はありますか？",
      subtext: "小さな振り返りが、関係を深めるきっかけになります",
    }),
  },
  appreciation_reminder: {
    conditions: (ctx) => ctx.direction === "stable" && ctx.daysSinceMatch >= 5,
    generate: () => ({
      type: "appreciation_reminder",
      text: "相手の好きなところ、最近伝えましたか？",
      subtext: "安定している時こそ、言葉にすると関係がさらに温まります",
    }),
  },
  boundary_check: {
    conditions: (ctx) =>
      ctx.cautionCodes.includes("distance_need_gap") && ctx.daysSinceMatch >= 4,
    generate: () => ({
      type: "boundary_check",
      text: "お互いの心地よい距離感、確認してみませんか？",
      subtext: "距離感の好みに差がある時は、言葉にすることで安心感が生まれます",
    }),
  },
  depth_invitation: {
    conditions: (ctx) =>
      ctx.direction === "rising" && ctx.messageCount >= 15 && ctx.daysSinceMatch >= 5,
    generate: (ctx) => ({
      type: "depth_invitation",
      text: ctx.category === "romantic"
        ? "もう少し深い話をしてみませんか？"
        : "お互いの価値観について話してみませんか？",
      subtext: "関係が良い方向に進んでいます。もう一歩踏み込むタイミングかもしれません",
    }),
  },
};

/**
 * 文脈に基づいてナッジを生成
 * 最も条件に合ったものを1つ返す
 */
export function generateGrowthNudge(ctx: NudgeContext): GrowthNudge | null {
  // Priority order
  const priority: GrowthNudgeType[] = [
    "boundary_check",
    "depth_invitation",
    "conversation_starter",
    "activity_suggestion",
    "reflection_prompt",
    "appreciation_reminder",
  ];

  for (const type of priority) {
    const template = NUDGE_TEMPLATES[type];
    if (template.conditions(ctx)) {
      return template.generate(ctx);
    }
  }

  return null;
}

/**
 * 日1回上限チェック
 */
export function canShowNudge(lastNudgeAt: string | null): boolean {
  if (!lastNudgeAt) return true;
  const hoursSinceLast =
    (Date.now() - new Date(lastNudgeAt).getTime()) / (1000 * 60 * 60);
  return hoursSinceLast >= 22; // ~1日マージン
}
