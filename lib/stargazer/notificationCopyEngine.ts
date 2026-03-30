// lib/stargazer/notificationCopyEngine.ts
// Stargazer 通知コピー生成エンジン
//
// 汎用的な通知文を、ユーザー固有の観測データに基づいた
// パーソナライズされたコピーに変換する。
//
// 各通知タイプごとに、具体的な軸名・予測内容・セッション内容を
// 参照する「手作り感」のある文面を生成する。
//
// サーバーサイド専用。runAI() を使用。

import "server-only";

import { runAI } from "@/lib/ai";
import { makeStargazerRunMetadata } from "./studentTrack";
import type { DepthCategory } from "./aiVanishingInsight";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type NotificationType =
  | "morning_prophecy"
  | "verification_reminder"
  | "vanishing_insight"
  | "weekly_report"
  | "alter_afterglow";

export interface NotificationCopy {
  title: string;
  body: string;
  /** 通知タップ時の遷移先 */
  url: string;
  /** 通知のグループ化タグ */
  tag: string;
}

/** 通知生成に必要なユーザーコンテキスト */
export interface NotificationUserContext {
  userId: string;

  // ── morning_prophecy 用 ──
  /** 昨日の予言テキスト */
  yesterdayProphecy?: string | null;
  /** 昨日の予言が的中したか (true/false/null=未検証) */
  yesterdayProphecyVerified?: boolean | null;
  /** 今日の予言テキスト */
  todayProphecy?: string | null;
  /** 今日の予言で言及される軸名 */
  prophecyAxisName?: string | null;

  // ── verification_reminder 用 ──
  /** 検証対象の予言テキスト */
  predictionText?: string | null;
  /** 予言の具体的な予測内容 (短縮版) */
  predictionSummary?: string | null;

  // ── vanishing_insight 用 ──
  /** インサイトのプレビューテキスト */
  insightPreview?: string | null;
  /** インサイトの深度 */
  insightDepth?: DepthCategory | null;
  /** インサイトの残り時間 (時間単位) */
  insightRemainingHours?: number | null;

  // ── weekly_report 用 ──
  /** 今週最も変動した軸名 */
  weeklyTopChangedAxis?: string | null;
  /** 今週の最も驚くべき発見 (短縮版) */
  weeklySurprise?: string | null;
  /** 今週の観測回数 */
  weeklyObservationCount?: number | null;

  // ── alter_afterglow 用 ──
  /** 最後の Alter セッションで触れたトピック */
  alterLastTopic?: string | null;
  /** Alter セッションからの経過時間 (時間単位) */
  alterHoursAgo?: number | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Deterministic (Non-AI) Copy Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ユーザーコンテキストに基づいて通知コピーを生成する。
 *
 * まず AI なしの決定論的コピーを試み、
 * データが十分にある場合のみ AI で更に洗練する。
 *
 * AI が失敗した場合は決定論的コピーにフォールバック。
 */
export async function generateNotificationCopy(
  type: NotificationType,
  userContext: NotificationUserContext,
): Promise<NotificationCopy> {
  // まず決定論的コピーを生成 (フォールバック兼用)
  const deterministicCopy = generateDeterministicCopy(type, userContext);

  // AI で洗練を試みる条件: 十分な固有データがあるか
  const shouldTryAI = hasEnoughContextForAI(type, userContext);

  if (!shouldTryAI) {
    return deterministicCopy;
  }

  try {
    const aiCopy = await generateAICopy(type, userContext);
    if (aiCopy) return aiCopy;
  } catch (err) {
    console.warn("[notificationCopyEngine] AI generation failed, using deterministic", err);
  }

  return deterministicCopy;
}

function hasEnoughContextForAI(
  type: NotificationType,
  ctx: NotificationUserContext,
): boolean {
  switch (type) {
    case "morning_prophecy":
      return !!ctx.todayProphecy && !!ctx.prophecyAxisName;
    case "verification_reminder":
      return !!ctx.predictionText;
    case "vanishing_insight":
      // Insight 通知は AI 不要（テキスト自体がパーソナライズ済み）
      return false;
    case "weekly_report":
      return !!ctx.weeklyTopChangedAxis;
    case "alter_afterglow":
      return !!ctx.alterLastTopic;
    default:
      return false;
  }
}

/**
 * AI を使わない決定論的な通知コピー生成。
 * コンテキストに基づいてテンプレートを選択・置換する。
 */
function generateDeterministicCopy(
  type: NotificationType,
  ctx: NotificationUserContext,
): NotificationCopy {
  switch (type) {
    case "morning_prophecy":
      return generateMorningProphecyCopy(ctx);
    case "verification_reminder":
      return generateVerificationCopy(ctx);
    case "vanishing_insight":
      return generateVanishingInsightCopy(ctx);
    case "weekly_report":
      return generateWeeklyReportCopy(ctx);
    case "alter_afterglow":
      return generateAlterAfterglowCopy(ctx);
  }
}

// ── Morning Prophecy ──

function generateMorningProphecyCopy(ctx: NotificationUserContext): NotificationCopy {
  let title: string;
  let body: string;

  if (ctx.yesterdayProphecyVerified === true && ctx.prophecyAxisName) {
    title = "昨日の予測、当たったね";
    body = `今日もあなたの${ctx.prophecyAxisName}に注目してみて`;
  } else if (ctx.yesterdayProphecyVerified === false && ctx.prophecyAxisName) {
    title = "予測が外れた = 変化してる証拠";
    body = `新しいデータが手に入ったよ。今日の${ctx.prophecyAxisName}に注目`;
  } else if (ctx.prophecyAxisName) {
    title = "今日の予測が届いたよ";
    body = `あなたの${ctx.prophecyAxisName}に変化がありそう。確認してみて`;
  } else if (ctx.todayProphecy) {
    title = "今日の予測";
    body = truncate(ctx.todayProphecy, 90);
  } else {
    title = "今日の予測が届いてるよ";
    body = "あなたの今日を予測してみた。確認してみる？";
  }

  return {
    title,
    body,
    url: "/stargazer/prophecy",
    tag: "stargazer-prophecy",
  };
}

// ── Verification Reminder ──

function generateVerificationCopy(ctx: NotificationUserContext): NotificationCopy {
  let body: string;

  if (ctx.predictionSummary) {
    body = `「${truncate(ctx.predictionSummary, 40)}」 -- 当たった？教えてくれると精度が上がるよ`;
  } else if (ctx.predictionText) {
    body = `「${truncate(ctx.predictionText, 40)}」 -- この予測、当たった？`;
  } else {
    body = "今日の予測は当たった？教えてくれると次の精度が上がるよ";
  }

  return {
    title: "予測の答え合わせ",
    body,
    url: "/stargazer/prophecy",
    tag: "stargazer-verification",
  };
}

// ── Vanishing Insight ──

function generateVanishingInsightCopy(ctx: NotificationUserContext): NotificationCopy {
  let body: string;

  if (ctx.insightPreview && ctx.insightRemainingHours != null) {
    const timeStr = ctx.insightRemainingHours <= 1
      ? "もうすぐ消えちゃう"
      : `あと${Math.round(ctx.insightRemainingHours)}時間で消えちゃう`;
    body = `${timeStr}気づき: ${truncate(ctx.insightPreview, 60)}`;
  } else if (ctx.insightPreview) {
    body = `消える前に見てほしい気づき: ${truncate(ctx.insightPreview, 70)}`;
  } else {
    body = "あなたについての新しい気づきが届いたよ。消える前に見てみて";
  }

  const depthLabel = ctx.insightDepth ? ` [${ctx.insightDepth}]` : "";

  return {
    title: `今だけの気づき${depthLabel}`,
    body,
    url: "/stargazer",
    tag: "stargazer-vanishing-insight",
  };
}

// ── Weekly Report ──

function generateWeeklyReportCopy(ctx: NotificationUserContext): NotificationCopy {
  let body: string;

  if (ctx.weeklySurprise) {
    body = truncate(ctx.weeklySurprise, 90);
  } else if (ctx.weeklyTopChangedAxis && ctx.weeklyObservationCount) {
    body = `今週${ctx.weeklyObservationCount}回の観測で、${ctx.weeklyTopChangedAxis}に大きな変化があったよ。見てみて`;
  } else if (ctx.weeklyTopChangedAxis) {
    body = `今週、${ctx.weeklyTopChangedAxis}に大きな変化があったよ。チェックしてみて`;
  } else {
    body = "今週のまとめができたよ。あなたの1週間を振り返ってみよう";
  }

  return {
    title: "今週のまとめ",
    body,
    url: "/stargazer/signature",
    tag: "stargazer-weekly",
  };
}

// ── Alter Afterglow ──

function generateAlterAfterglowCopy(ctx: NotificationUserContext): NotificationCopy {
  let body: string;

  if (ctx.alterLastTopic && ctx.alterHoursAgo != null) {
    const timeStr = ctx.alterHoursAgo < 12
      ? "さっき"
      : ctx.alterHoursAgo < 24
        ? "昨日"
        : `${Math.round(ctx.alterHoursAgo / 24)}日前`;
    body = `${timeStr}話した「${truncate(ctx.alterLastTopic, 30)}」のこと、まだ気になってる？`;
  } else if (ctx.alterLastTopic) {
    body = `前に話した「${truncate(ctx.alterLastTopic, 30)}」のこと、何か変わった？`;
  } else {
    body = "前回の対話で話したこと、振り返ってみない？";
  }

  return {
    title: "あの対話のその後",
    body,
    url: "/stargazer/alter",
    tag: "stargazer-alter-afterglow",
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AI-Enhanced Copy Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const COPY_SYSTEM_PROMPT = `あなたは深層観測システムのプッシュ通知コピーライターです。
ユーザーの具体的な観測データを基に、パーソナライズされた通知文を生成します。

## ルール
1. title は20文字以内。絵文字は使わない
2. body は90文字以内。具体的なデータ（軸名・数値・トピック名）を必ず含める
3. 「通知を開きたくなる」感情的フックを入れるが、落ち着いた知的なトーンを保つ
4. Duolingo のような巧みな心理フックだが、占いではなく科学的観測のトーン
5. 汎用フレーズ禁止。「誰にでも送れる文面」は失格
6. 高校生〜40代の日本人に刺さる、自然で具体的な表現を使う
7. 「診断」「占い」「鑑定」ではなく「観測」「発見」「検出」の言葉を使う

## 出力形式 (JSON)
{
  "title": "通知タイトル",
  "body": "通知本文"
}`;

async function generateAICopy(
  type: NotificationType,
  ctx: NotificationUserContext,
): Promise<NotificationCopy | null> {
  const promptParts: string[] = [`通知タイプ: ${type}`];

  switch (type) {
    case "morning_prophecy": {
      if (ctx.yesterdayProphecy) {
        promptParts.push(`昨日の予言: 「${ctx.yesterdayProphecy}」`);
        promptParts.push(`的中: ${ctx.yesterdayProphecyVerified === true ? "はい" : ctx.yesterdayProphecyVerified === false ? "いいえ" : "未検証"}`);
      }
      if (ctx.todayProphecy) {
        promptParts.push(`今日の予言: 「${ctx.todayProphecy}」`);
      }
      if (ctx.prophecyAxisName) {
        promptParts.push(`注目軸: ${ctx.prophecyAxisName}`);
      }
      break;
    }
    case "verification_reminder": {
      if (ctx.predictionText) {
        promptParts.push(`検証対象の予測: 「${ctx.predictionText}」`);
      }
      if (ctx.predictionSummary) {
        promptParts.push(`予測の要約: 「${ctx.predictionSummary}」`);
      }
      break;
    }
    case "weekly_report": {
      if (ctx.weeklyTopChangedAxis) {
        promptParts.push(`最大変動軸: ${ctx.weeklyTopChangedAxis}`);
      }
      if (ctx.weeklySurprise) {
        promptParts.push(`驚きの発見: 「${ctx.weeklySurprise}」`);
      }
      if (ctx.weeklyObservationCount != null) {
        promptParts.push(`今週の観測回数: ${ctx.weeklyObservationCount}`);
      }
      break;
    }
    case "alter_afterglow": {
      if (ctx.alterLastTopic) {
        promptParts.push(`最後の対話トピック: 「${ctx.alterLastTopic}」`);
      }
      if (ctx.alterHoursAgo != null) {
        promptParts.push(`経過時間: ${ctx.alterHoursAgo}時間前`);
      }
      break;
    }
  }

  const result = await runAI({
    taskType: "stargazer_notification_copy",
    prompt: promptParts.join("\n"),
    systemPrompt: COPY_SYSTEM_PROMPT,
    requireJson: true,
    jsonSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string" },
      },
      required: ["title", "body"],
    },
    temperature: 0.7,
    maxOutputTokens: 200,
    timeoutMs: 8_000,
    userId: ctx.userId,
    metadata: makeStargazerRunMetadata({
      notificationType: type,
    }),
  });

  if (!result.success || !result.structured) {
    return null;
  }

  const data = result.structured as Record<string, unknown>;
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const body = typeof data.body === "string" ? data.body.trim() : "";

  if (!title || !body) return null;

  // URL とタグはタイプに基づいて決定論的に設定
  const urlAndTag = getUrlAndTag(type);

  return {
    title: truncate(title, 30),
    body: truncate(body, 100),
    ...urlAndTag,
  };
}

function getUrlAndTag(type: NotificationType): { url: string; tag: string } {
  switch (type) {
    case "morning_prophecy":
      return { url: "/stargazer/prophecy", tag: "stargazer-prophecy" };
    case "verification_reminder":
      return { url: "/stargazer/prophecy", tag: "stargazer-verification" };
    case "vanishing_insight":
      return { url: "/stargazer", tag: "stargazer-vanishing-insight" };
    case "weekly_report":
      return { url: "/stargazer/signature", tag: "stargazer-weekly" };
    case "alter_afterglow":
      return { url: "/stargazer/alter", tag: "stargazer-alter-afterglow" };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "...";
}
