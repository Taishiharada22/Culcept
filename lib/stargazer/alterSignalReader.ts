/**
 * v4.2 Phase A: Signal Reader
 *
 * ユーザーの発話から構造化シグナルを抽出する。
 * 既存の questionType / reaction / responseMode を統合し、
 * さらに暗示的意味・緊急度・感情温度を追加。
 *
 * ルールベース。LLM 呼び出しなし。O(1)。
 */

import type { QuestionType, ResponseMode, Reaction } from "./alterHomeAdapter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type TurnIntent =
  | "ask_judgment"       // 判断を求めている
  | "seek_understanding" // 自己理解を求めている
  | "request_information"// 情報を求めている
  | "vent"               // 感情を吐き出している
  | "co_think_request"   // 一緒に考えてほしい
  | "challenge_alter"    // Alter に異議を唱えている
  | "confirm"            // 前ターンへの同意・確認
  | "redirect"           // 話題を変えたい
  | "demand_action"      // 具体的行動を要求
  | "existential"        // 存在的問い
  | "neutral";           // 分類困難

export type FeedbackOnLastTurn =
  | "building_on"  // 前ターンの上に積み上げている
  | "satisfied"    // 満足している
  | "correction"   // 前ターンの修正
  | "ignoring"     // 前ターンを無視している
  | "neutral"      // 特にフィードバックなし
  | null;

export interface TurnSignal {
  /** 主要な意図 */
  intent: TurnIntent;
  /** 明示的なキーワード（message から抽出） */
  explicit: string[];
  /** 暗示的な意味（文脈から推定） */
  implicit: string[];
  /** 前ターンへのフィードバック */
  feedback_on_last_turn: FeedbackOnLastTurn;
  /** 感情温度 0-1（0=冷静, 1=激昂） */
  emotional_temperature: number;
  /** 緊急度 0-1（0=雑談, 1=今すぐ答えが必要） */
  urgency: number;
  /** 既存分類との統合 */
  question_type: QuestionType;
  response_mode: ResponseMode;
  reaction: Reaction | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Signal Extraction Patterns
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 共同思考シグナル */
const CO_THINK_SIGNAL = /一緒に考え|一緒に悩|二人で|わからないから|どう思う[？?]$/;

/** 感情吐露シグナル */
const VENT_SIGNAL = /しんどい|疲れた|もう(?:いや|無理|だめ)|つらい|死にたい|嫌になる|限界/;

/** 情報要求シグナル */
const INFO_SIGNAL = /(?:何|なに)[？?]|教えて|どういう(?:こと|意味)|とは[？?]|(?:どんな|どの)/;

/** 行動要求シグナル */
const ACTION_SIGNAL = /どうすれば|何をすれば|どうしたら|具体的に|やり方|手順|ステップ/;

/** 存在的問いシグナル */
const EXISTENTIAL_SIGNAL = /本質|根本|人生|生き方|自分.*何者|意味.*ある|価値.*ある/;

/** 挑戦シグナル */
const CHALLENGE_SIGNAL = /違う|それは.*ない|そう(?:じゃない|ではない)|的外れ|ずれてる|押し付け/;

/** 確認シグナル */
const CONFIRM_SIGNAL = /そうそう|それそれ|まさに|その通り|そうだよ|うんうん|合ってる|当たってる/;

/** 転換シグナル */
const REDIRECT_SIGNAL = /(?:それ|そっち)(?:より|じゃなくて)|話(?:変わる|変える)|別[のな](?:こと|話)/;

/** 感情語 */
const EMOTIONAL_WORDS = /怒り|悲しい|嬉しい|不安|焦り|苛立[つち]|腹立[つち]|泣[きく]|叫[びぶ]|嫌[だい]|好き|愛[しす]|恨[みむ]|憎[いむ]|怖[いく]|辛[いく]/;

/** 緊急シグナル */
const URGENCY_SIGNAL = /今すぐ|急[いぎ]で|明日|今日中|締[めま]切|期限|間に合/;

/** 前ターン参照（building on） */
const BUILDING_ON = /確かに.*(?:で|けど|だけど)|それに加えて|もう一つ|さらに|あと|しかも/;

/** 前ターン参照（correction） */
const CORRECTION = /そう(?:じゃなくて|ではなく)|違[うく]て|そういう(?:こと|意味)(?:じゃない|ではない)|ではなく/;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// readTurnSignal
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * readTurnSignal: ユーザー発話から構造化シグナルを抽出。
 * 既存の questionType/reaction/responseMode を統合しつつ、
 * intent/implicit/temperature/urgency を追加。
 *
 * ルールベース。LLM 呼び出しなし。
 */
export function readTurnSignal(
  message: string,
  questionType: QuestionType,
  responseMode: ResponseMode,
  detectedReaction: Reaction | null,
  lastAlterContent: string | null,
  conversationLength: number,
): TurnSignal {
  const trimmed = message.trim();

  // ── Intent Detection ──
  const intent = detectIntent(trimmed, questionType, responseMode, detectedReaction);

  // ── Explicit keywords ──
  const explicit = extractExplicitKeywords(trimmed);

  // ── Implicit meanings ──
  const implicit = inferImplicitMeanings(trimmed, questionType, detectedReaction, conversationLength);

  // ── Feedback on last turn ──
  const feedback = detectFeedback(trimmed, detectedReaction, lastAlterContent);

  // ── Emotional temperature ──
  const emotional_temperature = estimateEmotionalTemperature(trimmed, detectedReaction);

  // ── Urgency ──
  const urgency = estimateUrgency(trimmed, questionType);

  return {
    intent,
    explicit,
    implicit,
    feedback_on_last_turn: feedback,
    emotional_temperature,
    urgency,
    question_type: questionType,
    response_mode: responseMode,
    reaction: detectedReaction,
  };
}

// ── Intent Detection ──

function detectIntent(
  message: string,
  questionType: QuestionType,
  responseMode: ResponseMode,
  reaction: Reaction | null,
): TurnIntent {
  // repair → challenge
  if (responseMode === "repair") return "challenge_alter";

  // explicit patterns take priority
  if (CHALLENGE_SIGNAL.test(message)) return "challenge_alter";
  if (CONFIRM_SIGNAL.test(message)) return "confirm";
  if (REDIRECT_SIGNAL.test(message)) return "redirect";
  if (CO_THINK_SIGNAL.test(message)) return "co_think_request";
  if (EXISTENTIAL_SIGNAL.test(message)) return "existential";
  if (ACTION_SIGNAL.test(message)) return "demand_action";
  if (VENT_SIGNAL.test(message)) return "vent";
  if (INFO_SIGNAL.test(message)) return "request_information";

  // reaction-based
  if (reaction?.type === "disagree") return "challenge_alter";
  if (reaction?.type === "redirect" && reaction.redirect_subtype === "correction") return "challenge_alter";
  if (reaction?.type === "agree") return "confirm";
  if (reaction?.type === "deepen") return "co_think_request";

  // questionType fallback
  switch (questionType) {
    case "emotional": return "vent";
    case "self_understanding": return "seek_understanding";
    case "knowledge": return "request_information";
    case "strategy": return "demand_action";
    case "judgment": return "ask_judgment";
    default: return "neutral";
  }
}

// ── Explicit Keywords ──

function extractExplicitKeywords(message: string): string[] {
  const keywords: string[] = [];

  // 感情語
  const emoMatches = message.match(EMOTIONAL_WORDS);
  if (emoMatches) keywords.push(...emoMatches);

  // 主要パターンのヒット
  if (CO_THINK_SIGNAL.test(message)) keywords.push("co_think");
  if (VENT_SIGNAL.test(message)) keywords.push("vent");
  if (ACTION_SIGNAL.test(message)) keywords.push("action_demand");
  if (EXISTENTIAL_SIGNAL.test(message)) keywords.push("existential");
  if (CHALLENGE_SIGNAL.test(message)) keywords.push("challenge");
  if (URGENCY_SIGNAL.test(message)) keywords.push("urgent");

  return keywords;
}

// ── Implicit Meanings ──

function inferImplicitMeanings(
  message: string,
  questionType: QuestionType,
  reaction: Reaction | null,
  conversationLength: number,
): string[] {
  const implicit: string[] = [];

  // 短い応答 + 判断質問 = 決断疲れの可能性
  if (message.length < 20 && questionType === "judgment" && conversationLength >= 3) {
    implicit.push("decision_fatigue");
  }

  // 長文 + 感情語 = 溜め込んでいたものの吐露
  if (message.length > 100 && EMOTIONAL_WORDS.test(message)) {
    implicit.push("emotional_release");
  }

  // disagree の直後に質問 = 「お前がちゃんと考えろ」の含意
  if (reaction?.type === "disagree" && message.includes("？")) {
    implicit.push("demand_for_better_answer");
  }

  // 3ターン以上 + self_understanding = 答えが見えかけている
  if (conversationLength >= 3 && questionType === "self_understanding") {
    implicit.push("approaching_insight");
  }

  // 同じトピックが3ターン = 堂々巡りの兆候
  if (conversationLength >= 4) {
    implicit.push("possible_loop");
  }

  return implicit;
}

// ── Feedback Detection ──

function detectFeedback(
  message: string,
  reaction: Reaction | null,
  _lastAlterContent: string | null,
): FeedbackOnLastTurn {
  if (BUILDING_ON.test(message)) return "building_on";
  if (CORRECTION.test(message)) return "correction";
  if (CONFIRM_SIGNAL.test(message)) return "satisfied";
  if (REDIRECT_SIGNAL.test(message)) return "ignoring";

  if (reaction?.type === "agree") return "building_on";
  if (reaction?.type === "deepen") return "building_on";
  if (reaction?.type === "disagree") return "correction";
  if (reaction?.type === "redirect" && reaction.redirect_subtype === "topic_change") return "ignoring";
  if (reaction?.type === "redirect" && reaction.redirect_subtype === "correction") return "correction";

  return "neutral";
}

// ── Emotional Temperature ──

function estimateEmotionalTemperature(
  message: string,
  reaction: Reaction | null,
): number {
  let temp = 0.3; // baseline

  // 感情語の数で加算
  const emoMatches = message.match(new RegExp(EMOTIONAL_WORDS.source, "g"));
  if (emoMatches) temp += emoMatches.length * 0.1;

  // 感嘆符・疑問符
  const exclamations = (message.match(/[！!]/g) || []).length;
  temp += exclamations * 0.05;

  // vent keywords
  if (VENT_SIGNAL.test(message)) temp += 0.2;

  // challenge keywords
  if (CHALLENGE_SIGNAL.test(message)) temp += 0.15;

  // strong disagree
  if (reaction?.type === "disagree" && reaction.disagree_strength === "strong") temp += 0.2;

  return Math.min(temp, 1.0);
}

// ── Urgency ──

function estimateUrgency(message: string, questionType: QuestionType): number {
  let urgency = 0.3; // baseline

  if (URGENCY_SIGNAL.test(message)) urgency += 0.3;
  if (ACTION_SIGNAL.test(message)) urgency += 0.1;
  if (questionType === "strategy") urgency += 0.1;
  if (questionType === "judgment") urgency += 0.05;

  return Math.min(urgency, 1.0);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Analytics Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function buildSignalAnalytics(signal: TurnSignal): Record<string, unknown> {
  return {
    intent: signal.intent,
    explicit_count: signal.explicit.length,
    implicit_count: signal.implicit.length,
    feedback: signal.feedback_on_last_turn,
    emotional_temperature: Math.round(signal.emotional_temperature * 100) / 100,
    urgency: Math.round(signal.urgency * 100) / 100,
  };
}
