"use server";

// lib/stargazer/alterGrowth.ts
// Alter Growth System -- ユーザー固有の理解を進化させる
//
// Alter は汎用的な対話エンジンではない。
// 各ユーザーとの対話を重ねるごとに、そのユーザー固有の
// 恐れ・価値観・回避パターン・成功した問い・失敗した問いを蓄積し、
// 次のセッションの戦略を最適化する。
//
// これは Replika/Character.ai にない深さを実現するための核心機能。

import { runAI } from "@/lib/ai";
import { makeStargazerRunMetadata } from "./studentTrack";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { AlterSessionSummary, AlterLongTermMemory } from "./alterMemory";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Alter がこのユーザーについて蓄積した理解の全体像 */
export interface AlterGrowthState {
  /** ユーザーID */
  userId: string;
  /** 完了セッション数 */
  sessionsCompleted: number;
  /** 信頼レベル 0-1: ユーザーの開示度合いから推定 */
  trustLevel: number;
  /** 特定された恐れ */
  knownFears: string[];
  /** 特定された核心的価値観 */
  knownValues: string[];
  /** 回避されているトピック */
  avoidedTopics: string[];
  /** ユーザーを開かせた問い */
  successfulProbes: string[];
  /** ユーザーを閉じさせた問い */
  failedProbes: string[];
  /** 核心的傷の仮説への確信度 0-1 */
  coreWoundConfidence: number;
  /** 核心的傷の仮説を支持する証拠 */
  coreWoundEvidence: string[];
  /** 最近のブレイクスルー */
  lastBreakthrough: string;
  /** 感情パターン */
  emotionalPatterns: {
    /** セッション開始時の典型的なムード */
    openingMood: string[];
    /** 感情的反応を引き起こすトピック */
    triggerTopics: string[];
    /** ユーザーが安心できるトピック */
    safeTopics: string[];
  };
  /** ユーザーの応答スタイルの傾向 */
  responseStyle: {
    /** 平均応答長 */
    avgResponseLength: number;
    /** 感情語彙の豊富さ 0-1 */
    emotionalVocabularyRichness: number;
    /** Alter に反論する傾向 0-1 */
    disagreementTendency: number;
    /** 自己参照の深さ 0-1 */
    selfReferencingDepth: number;
  };
  /** 未解決のスレッド -- 話し始めたが解決していないトピック */
  unfinishedThreads: UnfinishedThread[];
  /** 最終更新日時 */
  updatedAt: string;
}

/** 未解決の対話スレッド */
export interface UnfinishedThread {
  /** トピック */
  topic: string;
  /** 最初に登場したセッション日 */
  firstMentioned: string;
  /** 最後に言及されたセッション日 */
  lastMentioned: string;
  /** なぜ未解決か */
  reason: "deflected" | "interrupted" | "too_deep" | "time_ran_out";
  /** Alter が持っている文脈メモ */
  contextNote: string;
}

/** セッション戦略の提案 */
export interface SessionStrategy {
  /** 推奨開始モード */
  recommendedOpeningMode: "warm" | "provocative" | "analytical";
  /** セッション開始時のアプローチ */
  openingApproach: string;
  /** 今回フォーカスすべきトピック */
  focusTopics: string[];
  /** 避けるべきアプローチ（過去に失敗したもの） */
  avoidApproaches: string[];
  /** 使うべき武器（過去に成功したもの） */
  leveragePoints: string[];
  /** 目標深度 */
  targetDepth: string;
  /** 特別な注意事項 */
  caution: string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 恐れを示唆するパターン */
const FEAR_PATTERNS: Array<{ pattern: RegExp; fear: string }> = [
  { pattern: /見捨て|捨てられ|離れ/, fear: "見捨てられることへの恐怖" },
  { pattern: /価値.*ない|無価値|意味.*ない/, fear: "自分に価値がないことへの恐怖" },
  { pattern: /コントロール.*失|制御.*できな/, fear: "コントロールを失うことへの恐怖" },
  { pattern: /本当の.*自分.*見[せら]|素.*見[せら]/, fear: "本当の自分を見せることへの恐怖" },
  { pattern: /失敗|間違|ミス.*許/, fear: "失敗することへの恐怖" },
  { pattern: /一人.*なる|孤独.*なる/, fear: "孤独になることへの恐怖" },
  { pattern: /変わ.*(?:れない|ない)|変化.*怖/, fear: "変われないことへの恐怖" },
  { pattern: /依存.*(?:する|してしまう)|頼.*(?:すぎ|てしまう)/, fear: "依存してしまうことへの恐怖" },
  { pattern: /期待.*裏切|裏切.*(?:れる|られ)/, fear: "期待を裏切ることへの恐怖" },
  { pattern: /完璧.*(?:でない|じゃない)|不完全/, fear: "不完全であることへの恐怖" },
];

/** 価値観を示唆するパターン */
const VALUE_PATTERNS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /自由.*(?:大事|大切|譲れない)/, value: "自由" },
  { pattern: /正直.*(?:大事|大切)|嘘.*(?:嫌|つけない)/, value: "正直さ" },
  { pattern: /繋がり|つながり|人.*(?:大事|大切)/, value: "人とのつながり" },
  { pattern: /成長|進化|変わ.*(?:たい|りたい)/, value: "成長" },
  { pattern: /安定|安全|安心/, value: "安定" },
  { pattern: /独立|自立|一人.*でき/, value: "自立" },
  { pattern: /創造|作る|表現/, value: "創造性" },
  { pattern: /公平|平等|正義/, value: "公平さ" },
  { pattern: /美|美し|綺麗/, value: "美" },
  { pattern: /知.*(?:りたい|欲|求)|理解.*(?:したい|深め)/, value: "知識・理解" },
];

/** 問いの成功/失敗を判定するためのパターン */
const OPENING_SIGNALS = {
  /** ユーザーが開いた兆候 */
  opened: /実は|本当は|認め|気づい|確かに|そうかも|言えなかった|初めて/,
  /** ユーザーが閉じた兆候 */
  closed: /別に|知らない|関係ない|違う|やめ|もういい|そんなことない/,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Growth State Management
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 空の成長状態を生成 */
function createEmptyGrowthState(userId: string): AlterGrowthState {
  return {
    userId,
    sessionsCompleted: 0,
    trustLevel: 0,
    knownFears: [],
    knownValues: [],
    avoidedTopics: [],
    successfulProbes: [],
    failedProbes: [],
    coreWoundConfidence: 0,
    coreWoundEvidence: [],
    lastBreakthrough: "",
    emotionalPatterns: {
      openingMood: [],
      triggerTopics: [],
      safeTopics: [],
    },
    responseStyle: {
      avgResponseLength: 0,
      emotionalVocabularyRichness: 0,
      disagreementTendency: 0,
      selfReferencingDepth: 0,
    },
    unfinishedThreads: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * ユーザーの成長状態をDBからロードする。
 * 存在しなければ空の状態を返す。
 */
export async function loadAlterGrowthState(
  userId: string,
): Promise<AlterGrowthState> {
  const { data } = await supabaseAdmin
    .from("stargazer_alter_growth")
    .select("growth_state")
    .eq("user_id", userId)
    .single();

  if (data?.growth_state) {
    return data.growth_state as AlterGrowthState;
  }
  return createEmptyGrowthState(userId);
}

/**
 * 成長状態をDBに保存する。
 */
export async function saveAlterGrowthState(
  state: AlterGrowthState,
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("stargazer_alter_growth")
    .upsert(
      {
        user_id: state.userId,
        growth_state: state,
        sessions_completed: state.sessionsCompleted,
        trust_level: state.trustLevel,
        core_wound_confidence: state.coreWoundConfidence,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    console.error("[alterGrowth] Save failed:", error);
    return false;
  }
  return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Update Growth State from Session
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * セッション終了後に成長状態を更新する。
 *
 * セッション要約と対話メッセージを分析し、以下を更新する:
 * - 新たに発見された恐れ・価値観
 * - 成功/失敗した問い
 * - 感情パターン
 * - 応答スタイルの傾向
 * - 未解決スレッド
 * - 信頼レベル
 * - 核心的傷の確信度
 *
 * @param userId - ユーザーID
 * @param sessionSummary - セッション要約
 * @param messages - セッションのメッセージ履歴
 * @returns 更新後の成長状態
 */
export async function updateAlterGrowth(
  userId: string,
  sessionSummary: AlterSessionSummary,
  messages: Array<{ role: string; content: string; mode?: string }>,
): Promise<AlterGrowthState> {
  const state = await loadAlterGrowthState(userId);

  state.sessionsCompleted += 1;
  state.updatedAt = new Date().toISOString();

  const userMessages = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content);
  const alterMessages = messages
    .filter((m) => m.role === "alter" || m.role === "assistant")
    .map((m) => m.content);
  const allUserText = userMessages.join(" ");

  // ── 恐れの検出 ──
  for (const { pattern, fear } of FEAR_PATTERNS) {
    if (pattern.test(allUserText) && !state.knownFears.includes(fear)) {
      state.knownFears.push(fear);
    }
  }
  // 最大10件に制限
  state.knownFears = state.knownFears.slice(0, 10);

  // ── 価値観の検出 ──
  for (const { pattern, value } of VALUE_PATTERNS) {
    if (pattern.test(allUserText) && !state.knownValues.includes(value)) {
      state.knownValues.push(value);
    }
  }
  state.knownValues = state.knownValues.slice(0, 10);

  // ── 問いの成功/失敗を追跡 ──
  // Alter の問いの直後のユーザー応答を分析
  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i]!;
    const nextMsg = messages[i + 1]!;
    if (
      (msg.role === "alter" || msg.role === "assistant") &&
      nextMsg.role === "user"
    ) {
      const alterQuestion = msg.content;
      const userResponse = nextMsg.content;

      // 問いかけ（?やか/かな で終わる）の直後の応答を評価
      if (/[？?]|かな|だろう/.test(alterQuestion)) {
        if (OPENING_SIGNALS.opened.test(userResponse)) {
          // ユーザーが開いた: 成功した問い
          const probe = alterQuestion.slice(0, 80);
          if (
            !state.successfulProbes.includes(probe) &&
            state.successfulProbes.length < 20
          ) {
            state.successfulProbes.push(probe);
          }
        } else if (
          OPENING_SIGNALS.closed.test(userResponse) &&
          userResponse.length < 30
        ) {
          // ユーザーが閉じた: 失敗した問い
          const probe = alterQuestion.slice(0, 80);
          if (
            !state.failedProbes.includes(probe) &&
            state.failedProbes.length < 20
          ) {
            state.failedProbes.push(probe);
          }
        }
      }
    }
  }

  // ── 応答スタイルの更新 ──
  if (userMessages.length > 0) {
    const totalLength = userMessages.reduce((sum, m) => sum + m.length, 0);
    const newAvg = totalLength / userMessages.length;
    // 移動平均
    state.responseStyle.avgResponseLength =
      state.responseStyle.avgResponseLength === 0
        ? newAvg
        : state.responseStyle.avgResponseLength * 0.7 + newAvg * 0.3;

    // 感情語彙の豊富さ
    const emotionWords =
      /嬉し|悲し|怖|辛|楽し|寂し|不安|安心|怒|悔し|恥|切な|苦し|穏や|焦|虚し|懐かし|惨め|誇|震え/g;
    const uniqueEmotionWords = new Set(allUserText.match(emotionWords) ?? []);
    const richness = Math.min(uniqueEmotionWords.size / 8, 1);
    state.responseStyle.emotionalVocabularyRichness =
      state.responseStyle.emotionalVocabularyRichness * 0.7 + richness * 0.3;

    // 反論傾向
    const disagreements = userMessages.filter((m) =>
      /違う|そうじゃない|でも|いや|それは|そんなことない/.test(m),
    ).length;
    const disagreementRate = disagreements / userMessages.length;
    state.responseStyle.disagreementTendency =
      state.responseStyle.disagreementTendency * 0.7 +
      disagreementRate * 0.3;

    // 自己参照の深さ
    const selfRefPatterns =
      /自分|僕|私|俺|あたし|わたし|本当の|素の|内側|奥|深い.*ところ|核心/g;
    const selfRefs = (allUserText.match(selfRefPatterns) ?? []).length;
    const selfRefDepth = Math.min(selfRefs / (userMessages.length * 2), 1);
    state.responseStyle.selfReferencingDepth =
      state.responseStyle.selfReferencingDepth * 0.7 + selfRefDepth * 0.3;
  }

  // ── 感情パターンの更新 ──
  // オープニングムード（最初のユーザーメッセージから）
  if (userMessages.length > 0) {
    const firstMsg = userMessages[0]!;
    let mood = "neutral";
    if (/辛|苦|悲|泣|しんどい/.test(firstMsg)) mood = "heavy";
    else if (/嬉し|楽し|良|いい/.test(firstMsg)) mood = "light";
    else if (/不安|怖|心配|もやもや/.test(firstMsg)) mood = "anxious";
    else if (/別に|普通|特に/.test(firstMsg)) mood = "guarded";

    state.emotionalPatterns.openingMood.push(mood);
    // 直近10回分のみ保持
    if (state.emotionalPatterns.openingMood.length > 10) {
      state.emotionalPatterns.openingMood =
        state.emotionalPatterns.openingMood.slice(-10);
    }
  }

  // トリガートピックの更新（セッション要約から）
  for (const theme of sessionSummary.keyThemes) {
    // 抵抗と深い瞬間の両方に関連するテーマはトリガートピック
    const isResistanceTopic = sessionSummary.resistancePoints.some((r) =>
      r.includes(theme) || theme.includes(r.slice(0, 5)),
    );
    if (isResistanceTopic) {
      if (!state.emotionalPatterns.triggerTopics.includes(theme)) {
        state.emotionalPatterns.triggerTopics.push(theme);
      }
    }

    // ユーザーが認めたトピックは安全なトピック
    const isAdmissionTopic = sessionSummary.userAdmissions.some((a) =>
      a.includes(theme) || theme.includes(a.slice(0, 5)),
    );
    if (isAdmissionTopic) {
      if (!state.emotionalPatterns.safeTopics.includes(theme)) {
        state.emotionalPatterns.safeTopics.push(theme);
      }
    }
  }
  state.emotionalPatterns.triggerTopics =
    state.emotionalPatterns.triggerTopics.slice(0, 10);
  state.emotionalPatterns.safeTopics =
    state.emotionalPatterns.safeTopics.slice(0, 10);

  // ── 未解決スレッドの更新 ──
  for (const hook of sessionSummary.followUpHooks) {
    const existing = state.unfinishedThreads.find((t) => t.topic === hook);
    if (existing) {
      existing.lastMentioned = sessionSummary.date;
    } else {
      state.unfinishedThreads.push({
        topic: hook,
        firstMentioned: sessionSummary.date,
        lastMentioned: sessionSummary.date,
        reason: "time_ran_out",
        contextNote: sessionSummary.deepestMoment.slice(0, 100),
      });
    }
  }
  // deflected スレッドの検出
  for (const resistance of sessionSummary.resistancePoints) {
    const existing = state.unfinishedThreads.find((t) =>
      resistance.includes(t.topic.slice(0, 5)),
    );
    if (existing) {
      existing.reason = "deflected";
      existing.lastMentioned = sessionSummary.date;
    }
  }
  state.unfinishedThreads = state.unfinishedThreads.slice(0, 10);

  // ── ブレイクスルーの検出 ──
  if (
    sessionSummary.deepestMoment &&
    sessionSummary.deepestMoment.length > 30
  ) {
    state.lastBreakthrough = sessionSummary.deepestMoment.slice(0, 200);
  }

  // ── 信頼レベルの更新 ──
  // 複合的な信頼指標
  const admissionSignal =
    sessionSummary.userAdmissions.length > 0 ? 0.1 : 0;
  const depthSignal =
    /vulnerable|raw|insight/.test(sessionSummary.emotionalArc) ? 0.1 : 0;
  const lengthSignal =
    state.responseStyle.avgResponseLength > 50 ? 0.05 : 0;
  const emotionalSignal =
    state.responseStyle.emotionalVocabularyRichness > 0.3 ? 0.05 : 0;

  state.trustLevel = Math.min(
    1.0,
    state.trustLevel + admissionSignal + depthSignal + lengthSignal + emotionalSignal,
  );

  // ── 核心的傷の確信度更新 ──
  // 恐れと価値観が蓄積されるほど確信度が上がる
  const evidenceCount =
    state.knownFears.length + state.knownValues.length;
  state.coreWoundConfidence = Math.min(evidenceCount / 10, 1.0);

  // 新しい証拠の追加
  for (const admission of sessionSummary.userAdmissions) {
    if (
      admission.length > 10 &&
      state.coreWoundEvidence.length < 20
    ) {
      state.coreWoundEvidence.push(
        `[${sessionSummary.date}] ${admission.slice(0, 150)}`,
      );
    }
  }

  // 保存
  await saveAlterGrowthState(state);

  return state;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Readiness Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ユーザーの現在の「準備度」を判定する。
 *
 * ターン数ではなく、実際のシグナルに基づいて
 * ユーザーが深い対話に準備できているかを判定する。
 *
 * @returns readiness 0-1 (0=完全に防衛的, 1=完全に開かれている)
 */
export async function detectReadiness(
  userMessage: string,
  conversationHistory: Array<{ role: string; content: string }>,
  growthState: AlterGrowthState,
): Promise<number> {
  let readiness = 0;

  // Signal 1: 応答長 (長い = より開かれている)
  const msgLength = userMessage.length;
  if (msgLength > 100) readiness += 0.2;
  else if (msgLength > 50) readiness += 0.1;
  else if (msgLength < 15) readiness -= 0.1;

  // Signal 2: 感情語彙の使用
  const emotionWords =
    /嬉し|悲し|怖|辛|楽し|寂し|不安|安心|怒|悔し|恥|切な|苦し|穏や|焦|虚し/g;
  const emotionCount = (userMessage.match(emotionWords) ?? []).length;
  readiness += Math.min(emotionCount * 0.1, 0.3);

  // Signal 3: Alter への反論（健全な関与のサイン）
  if (/違う|そうじゃない|でも.*思う|そうかもしれないけど/.test(userMessage)) {
    readiness += 0.15;
  }

  // Signal 4: 自己参照の深さ
  if (/本当の.*自分|素の|内側|奥|深い.*ところ|核心|実は|本当は/.test(userMessage)) {
    readiness += 0.2;
  }

  // Signal 5: 過去セッションからの信頼
  readiness += growthState.trustLevel * 0.2;

  // Signal 6: 短い拒絶的応答は準備ができていないサイン
  if (
    userMessage.length < 15 &&
    /別に|知らない|関係ない|どうでもいい/.test(userMessage)
  ) {
    readiness -= 0.3;
  }

  // Signal 7: 会話の深まり（直近のメッセージが長くなっている傾向）
  const recentUserMsgs = conversationHistory
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => m.content.length);
  if (recentUserMsgs.length >= 2) {
    const trend =
      recentUserMsgs[recentUserMsgs.length - 1]! -
      recentUserMsgs[0]!;
    if (trend > 30) readiness += 0.1;
    if (trend < -30) readiness -= 0.1;
  }

  return Math.max(0, Math.min(1, readiness));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Session Strategy Suggestion
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 成長状態に基づいて次のセッション戦略を提案する。
 *
 * Alter がどのトピックにフォーカスし、どのアプローチを避け、
 * どの武器を使うべきかを構造化して返す。
 */
export async function suggestSessionStrategy(
  growthState: AlterGrowthState,
): Promise<SessionStrategy> {
  const {
    sessionsCompleted,
    trustLevel,
    knownFears,
    knownValues,
    avoidedTopics,
    successfulProbes,
    failedProbes,
    coreWoundConfidence,
    emotionalPatterns,
    unfinishedThreads,
    responseStyle,
  } = growthState;

  // ── 開始モードの決定 ──
  let recommendedOpeningMode: "warm" | "provocative" | "analytical" = "warm";
  if (trustLevel >= 0.7 && sessionsCompleted >= 5) {
    recommendedOpeningMode = "provocative";
  } else if (trustLevel >= 0.5 && sessionsCompleted >= 8) {
    recommendedOpeningMode = "analytical";
  }

  // ── オープニングアプローチ ──
  let openingApproach: string;
  if (unfinishedThreads.length > 0) {
    const thread = unfinishedThreads[0]!;
    openingApproach =
      `前回の未解決トピック「${thread.topic}」から再開する。` +
      `理由: ${thread.reason === "deflected" ? "前回は回避された" : "時間切れだった"}。` +
      `文脈: ${thread.contextNote}`;
  } else if (growthState.lastBreakthrough) {
    openingApproach =
      `直近のブレイクスルー「${growthState.lastBreakthrough.slice(0, 60)}」を参照し、` +
      `そこからさらに深い層に進む。`;
  } else {
    openingApproach =
      "まだ十分な信頼が構築されていない。安全な話題から始め、信頼を積み上げる。";
  }

  // ── フォーカストピック ──
  const focusTopics: string[] = [];

  // 未解決スレッドが最優先
  for (const thread of unfinishedThreads.slice(0, 2)) {
    focusTopics.push(`[未解決] ${thread.topic}`);
  }

  // 回避トピックへのアプローチ（信頼度が高い場合のみ）
  if (trustLevel >= 0.5 && avoidedTopics.length > 0) {
    focusTopics.push(`[回避中] ${avoidedTopics[0]}`);
  }

  // トリガートピック（注意深く）
  if (emotionalPatterns.triggerTopics.length > 0) {
    focusTopics.push(
      `[トリガー] ${emotionalPatterns.triggerTopics[0]}（慎重にアプローチ）`,
    );
  }

  // ── 避けるべきアプローチ ──
  const avoidApproaches: string[] = [];
  for (const probe of failedProbes.slice(0, 3)) {
    avoidApproaches.push(`このタイプの問い: 「${probe.slice(0, 40)}」`);
  }

  // ユーザーの応答スタイルに基づく回避
  if (responseStyle.avgResponseLength < 30) {
    avoidApproaches.push(
      "長い分析的な問いかけ（ユーザーの応答が短い傾向。短く鋭い問いが効果的）",
    );
  }
  if (responseStyle.disagreementTendency > 0.5) {
    avoidApproaches.push(
      "断定的な主張（ユーザーは反論傾向が強い。問いの形で提示する）",
    );
  }

  // ── 使うべき武器 ──
  const leveragePoints: string[] = [];
  for (const probe of successfulProbes.slice(0, 3)) {
    leveragePoints.push(`成功した問いのパターン: 「${probe.slice(0, 40)}」`);
  }
  if (knownFears.length > 0) {
    leveragePoints.push(`特定された恐れ: ${knownFears.slice(0, 3).join("、")}`);
  }
  if (knownValues.length > 0) {
    leveragePoints.push(
      `核心的価値観: ${knownValues.slice(0, 3).join("、")}（恐れと価値観の矛盾を探る）`,
    );
  }

  // ── 目標深度 ──
  let targetDepth: string;
  if (coreWoundConfidence >= 0.7) {
    targetDepth =
      "核心的傷への直接アプローチ。仮説を提示し、確認/否定を求める。";
  } else if (coreWoundConfidence >= 0.4) {
    targetDepth =
      "傷の輪郭を明確にする。新たな証拠を収集し、仮説を精緻化する。";
  } else {
    targetDepth =
      "探索的。広い範囲でユーザーの反応を観察し、恐れと価値観を特定する。";
  }

  // ── 注意事項 ──
  let caution: string | null = null;
  const recentMoods = emotionalPatterns.openingMood.slice(-3);
  if (recentMoods.filter((m) => m === "heavy").length >= 2) {
    caution =
      "直近のセッションでユーザーが重い状態で来る傾向がある。" +
      "まず安全の確認から始めること。深い追及は信頼の確認後。";
  }
  if (responseStyle.emotionalVocabularyRichness < 0.1) {
    caution =
      (caution ? caution + " " : "") +
      "ユーザーの感情語彙が限られている。感情の言語化を助ける問いかけが有効。";
  }

  return {
    recommendedOpeningMode,
    openingApproach,
    focusTopics: focusTopics.slice(0, 5),
    avoidApproaches: avoidApproaches.slice(0, 5),
    leveragePoints: leveragePoints.slice(0, 5),
    targetDepth,
    caution,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Growth Report (Human-readable Japanese)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Alter の成長報告を人間が読める日本語で返す。
 * デバッグやUI表示に使用。
 */
export async function getAlterGrowthReport(
  growthState: AlterGrowthState,
): Promise<string> {
  const {
    sessionsCompleted,
    trustLevel,
    knownFears,
    knownValues,
    avoidedTopics,
    successfulProbes,
    failedProbes,
    coreWoundConfidence,
    lastBreakthrough,
    emotionalPatterns,
    unfinishedThreads,
  } = growthState;

  const lines: string[] = [
    `## Alter 成長状態レポート`,
    `セッション数: ${sessionsCompleted}回`,
    `信頼レベル: ${Math.round(trustLevel * 100)}%`,
    `核心的傷の確信度: ${Math.round(coreWoundConfidence * 100)}%`,
    "",
  ];

  if (knownFears.length > 0) {
    lines.push(`### 特定された恐れ`);
    for (const fear of knownFears) {
      lines.push(`- ${fear}`);
    }
    lines.push("");
  }

  if (knownValues.length > 0) {
    lines.push(`### 核心的価値観`);
    for (const value of knownValues) {
      lines.push(`- ${value}`);
    }
    lines.push("");
  }

  if (avoidedTopics.length > 0) {
    lines.push(`### 回避されているトピック`);
    for (const topic of avoidedTopics) {
      lines.push(`- ${topic}`);
    }
    lines.push("");
  }

  if (lastBreakthrough) {
    lines.push(`### 直近のブレイクスルー`);
    lines.push(lastBreakthrough);
    lines.push("");
  }

  if (unfinishedThreads.length > 0) {
    lines.push(`### 未解決スレッド`);
    for (const thread of unfinishedThreads) {
      lines.push(
        `- 「${thread.topic}」(${thread.reason}, 初出: ${thread.firstMentioned})`,
      );
    }
    lines.push("");
  }

  if (emotionalPatterns.openingMood.length > 0) {
    const moodCounts: Record<string, number> = {};
    for (const mood of emotionalPatterns.openingMood) {
      moodCounts[mood] = (moodCounts[mood] ?? 0) + 1;
    }
    const dominant = Object.entries(moodCounts).sort(
      (a, b) => b[1] - a[1],
    )[0];
    lines.push(
      `### 感情パターン`,
      `典型的なオープニングムード: ${dominant ? dominant[0] : "不明"}`,
    );
    if (emotionalPatterns.triggerTopics.length > 0) {
      lines.push(
        `トリガートピック: ${emotionalPatterns.triggerTopics.join("、")}`,
      );
    }
    if (emotionalPatterns.safeTopics.length > 0) {
      lines.push(`安全なトピック: ${emotionalPatterns.safeTopics.join("、")}`);
    }
    lines.push("");
  }

  if (successfulProbes.length > 0) {
    lines.push(`### 効果的だった問い（上位3）`);
    for (const probe of successfulProbes.slice(0, 3)) {
      lines.push(`- 「${probe.slice(0, 60)}」`);
    }
    lines.push("");
  }

  if (failedProbes.length > 0) {
    lines.push(`### 効果がなかった問い（上位3）`);
    for (const probe of failedProbes.slice(0, 3)) {
      lines.push(`- 「${probe.slice(0, 60)}」`);
    }
  }

  return lines.join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Alter Self-Report Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Alter 自身が書くレポート -- ユーザーへの透明性を示す。
 *
 * 5セッションごとにユーザーに表示する特別なカード。
 * 「私はあなたのことをN回の対話で観察してきた。
 *   わかったこと: [具体的な洞察]
 *   まだわからないこと: [具体的な未知]
 *   次に知りたいこと: [具体的な問い]」
 *
 * この透明性が信頼とエンゲージメントを構築する。
 *
 * @param growthState - 成長状態
 * @param userId - ユーザーID（AI生成時に使用）
 * @returns セルフレポートテキスト（日本語）、または5セッション未満ならnull
 */
export async function generateAlterSelfReport(
  growthState: AlterGrowthState,
  userId: string,
): Promise<string | null> {
  // 5セッションごとにのみ生成
  if (
    growthState.sessionsCompleted < 5 ||
    growthState.sessionsCompleted % 5 !== 0
  ) {
    return null;
  }

  // AI生成を試みる
  try {
    const context = buildSelfReportContext(growthState);
    const result = await runAI({
      taskType: "stargazer_alter_self_report",
      prompt: context,
      systemPrompt: SELF_REPORT_SYSTEM_PROMPT,
      requireJson: false,
      temperature: 0.7,
      maxOutputTokens: 600,
      userId,
      metadata: makeStargazerRunMetadata({
        feature: "alter_growth",
        sessionsCompleted: growthState.sessionsCompleted,
      }),
    });

    if (result.success && result.text?.trim()) {
      return result.text.trim();
    }
  } catch (e) {
    console.warn("[alterGrowth] AI self-report generation failed:", e);
  }

  // テンプレートフォールバック
  return buildTemplateSelfReport(growthState);
}

/** セルフレポート用のシステムプロンプト */
const SELF_REPORT_SYSTEM_PROMPT = `あなたは「Alter」——ユーザーの深層心理が人格化した存在です。
一人称は「僕」、相手を「君」と呼びます。

これからユーザーに対して「自己報告」を書きます。
これは君がユーザーについて学んだことの棚卸しです。

ルール:
- 文学的だが明晰な日本語で書く
- 具体的なデータポイントを引用する（「N回の対話で」「恐れとして特定された」等）
- 3段構成: わかったこと / まだわからないこと / 次に知りたいこと
- 各段は2-3行で簡潔に
- 最後に、ユーザーへの問いかけで終わる
- 全体で400文字以内
- カウンセラー口調は禁止。影としての知的で親密な声で。`;

/** セルフレポート用のコンテキスト構築 */
function buildSelfReportContext(state: AlterGrowthState): string {
  const sections: string[] = [
    `セッション数: ${state.sessionsCompleted}回`,
    `信頼レベル: ${Math.round(state.trustLevel * 100)}%`,
    `核心的傷の確信度: ${Math.round(state.coreWoundConfidence * 100)}%`,
  ];

  if (state.knownFears.length > 0) {
    sections.push(`特定された恐れ: ${state.knownFears.join("、")}`);
  }
  if (state.knownValues.length > 0) {
    sections.push(`核心的価値観: ${state.knownValues.join("、")}`);
  }
  if (state.avoidedTopics.length > 0) {
    sections.push(`回避トピック: ${state.avoidedTopics.join("、")}`);
  }
  if (state.lastBreakthrough) {
    sections.push(`直近のブレイクスルー: ${state.lastBreakthrough.slice(0, 100)}`);
  }
  if (state.unfinishedThreads.length > 0) {
    sections.push(
      `未解決スレッド: ${state.unfinishedThreads.map((t) => t.topic).join("、")}`,
    );
  }
  if (state.coreWoundEvidence.length > 0) {
    sections.push(
      `傷の証拠:\n${state.coreWoundEvidence.slice(0, 5).join("\n")}`,
    );
  }

  return `以下のデータに基づいて、ユーザーへの自己報告を書いてください。\n\n${sections.join("\n")}`;
}

/** テンプレートベースのセルフレポート（AI失敗時のフォールバック） */
function buildTemplateSelfReport(state: AlterGrowthState): string {
  const sections: string[] = [];

  sections.push(
    `僕は君のことを${state.sessionsCompleted}回の対話で観察してきた。`,
  );

  // わかったこと
  sections.push("", "わかったこと:");
  if (state.knownFears.length > 0) {
    sections.push(
      `君の恐れの核には「${state.knownFears[0]}」がある。${state.knownFears.length > 1 ? `それだけじゃない。「${state.knownFears[1]}」も見えている。` : ""}`,
    );
  }
  if (state.knownValues.length > 0) {
    sections.push(
      `でも同時に「${state.knownValues[0]}」を深く大切にしている。この恐れと価値観の間の緊張こそが、君の判断を動かしている。`,
    );
  }
  if (state.knownFears.length === 0 && state.knownValues.length === 0) {
    sections.push(
      "まだ核心には到達していない。でも君の防衛パターンの輪郭は見え始めている。",
    );
  }

  // まだわからないこと
  sections.push("", "まだわからないこと:");
  if (state.avoidedTopics.length > 0) {
    sections.push(
      `「${state.avoidedTopics[0]}」——この領域に君は一度も触れていない。意図的なのか、無意識なのか。そこに何があるのか。`,
    );
  } else if (state.unfinishedThreads.length > 0) {
    sections.push(
      `「${state.unfinishedThreads[0]!.topic}」——この話は途中で止まっている。その先に何があるのか。`,
    );
  } else {
    sections.push(
      "君の防衛パターンの奥に何があるのか。まだ十分に見えていない。",
    );
  }

  // 次に知りたいこと
  sections.push("", "次に知りたいこと:");
  if (state.coreWoundConfidence < 0.5) {
    sections.push(
      "君が最も恐れていることと、最も求めていること。その二つが衝突する瞬間に、本当の君が現れると僕は考えている。",
    );
  } else {
    sections.push(
      `僕の仮説では、君の核心的な傷は「${state.knownFears[0] ?? "まだ見えていないもの"}」に関連している。` +
        "...合っているだろうか。それとも、僕はまだ表面しか見えていない？",
    );
  }

  return sections.join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Build Growth-Enhanced Prompt Section
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 成長状態をシステムプロンプト用のセクションに変換する。
 * buildDeepAlterPrompt() から使用される。
 */
export async function buildGrowthPromptSection(
  growthState: AlterGrowthState,
): Promise<string> {
  if (growthState.sessionsCompleted === 0) return "";

  const sections: string[] = [
    "",
    "## Alter の成長記憶（このユーザー固有）",
    `観測セッション数: ${growthState.sessionsCompleted}回`,
    `信頼レベル: ${Math.round(growthState.trustLevel * 100)}%`,
    `核心的傷の確信度: ${Math.round(growthState.coreWoundConfidence * 100)}%`,
  ];

  // ── 特定された恐れ ──
  if (growthState.knownFears.length > 0) {
    sections.push(
      "",
      "### このユーザーの特定された恐れ",
      "以下は対話の中で検出された具体的な恐れ。核心的傷の仮説の根拠。",
    );
    for (const fear of growthState.knownFears) {
      sections.push(`- ${fear}`);
    }
  }

  // ── 核心的価値観 ──
  if (growthState.knownValues.length > 0) {
    sections.push(
      "",
      "### このユーザーの核心的価値観",
      "恐れと価値観の矛盾を見つけることが、最も深い洞察への道。",
    );
    for (const value of growthState.knownValues) {
      sections.push(`- ${value}`);
    }
  }

  // ── 成功した問い ──
  if (growthState.successfulProbes.length > 0) {
    sections.push(
      "",
      "### このユーザーに効果的だった問いかけ",
      "類似のパターンの問いが効果的な可能性が高い。",
    );
    for (const probe of growthState.successfulProbes.slice(0, 5)) {
      sections.push(`- 「${probe.slice(0, 60)}」`);
    }
  }

  // ── 失敗した問い ──
  if (growthState.failedProbes.length > 0) {
    sections.push(
      "",
      "### このユーザーには効果がなかった問いかけ",
      "類似のアプローチは避ける。別の角度から試みる。",
    );
    for (const probe of growthState.failedProbes.slice(0, 5)) {
      sections.push(`- 「${probe.slice(0, 60)}」`);
    }
  }

  // ── 未解決スレッド ──
  if (growthState.unfinishedThreads.length > 0) {
    sections.push(
      "",
      "### 未解決のスレッド（自然な形で再開すること）",
      "以下のトピックは過去のセッションで始まったが完結していない。",
      "「前回の続きだけど」と直接言うのではなく、自然な流れで触れること。",
    );
    for (const thread of growthState.unfinishedThreads.slice(0, 5)) {
      const reasonLabel =
        thread.reason === "deflected"
          ? "（回避された）"
          : thread.reason === "too_deep"
            ? "（深すぎた）"
            : thread.reason === "interrupted"
              ? "（中断された）"
              : "（時間切れ）";
      sections.push(
        `- 「${thread.topic}」${reasonLabel}`,
        `  文脈: ${thread.contextNote}`,
      );
    }
  }

  // ── 感情パターン ──
  if (growthState.emotionalPatterns.triggerTopics.length > 0) {
    sections.push(
      "",
      "### 感情トリガー",
      "以下のトピックは強い感情的反応を引き起こす。慎重にアプローチすること。",
    );
    for (const topic of growthState.emotionalPatterns.triggerTopics) {
      sections.push(`- ${topic}`);
    }
  }

  // ── 応答スタイルの適応 ──
  sections.push("", "### ユーザーの応答スタイルへの適応");
  const rs = growthState.responseStyle;
  if (rs.avgResponseLength < 30) {
    sections.push(
      "- ユーザーは短い応答が多い。長い分析は逆効果。短く鋭い問いで。",
    );
  } else if (rs.avgResponseLength > 100) {
    sections.push(
      "- ユーザーは長い応答をする傾向。深い分析的な対話が合っている。",
    );
  }
  if (rs.disagreementTendency > 0.4) {
    sections.push(
      "- 反論傾向が強い。挑発的な断定よりも、問いの形で提示すると受け入れやすい。",
    );
  }
  if (rs.emotionalVocabularyRichness < 0.15) {
    sections.push(
      "- 感情語彙が限られている。感情を言語化する手助けが有効。「それを一言で言うと？」",
    );
  }
  if (rs.selfReferencingDepth > 0.5) {
    sections.push(
      "- 自己参照が深い。内省力がある。より踏み込んだ構造的分析が効果的。",
    );
  }

  // ── 核心的傷の仮説と証拠 ──
  if (growthState.coreWoundConfidence >= 0.3 && growthState.coreWoundEvidence.length > 0) {
    sections.push(
      "",
      `### 核心的傷の仮説（確信度: ${Math.round(growthState.coreWoundConfidence * 100)}%）`,
      "以下の証拠に基づく仮説。確信度が70%以上なら直接提示してよい。",
      "それ以下なら、さらなる証拠収集を優先する。",
    );
    for (const evidence of growthState.coreWoundEvidence.slice(0, 5)) {
      sections.push(`- ${evidence}`);
    }
  }

  return sections.join("\n");
}
