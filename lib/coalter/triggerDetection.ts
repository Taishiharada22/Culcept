/**
 * CoAlter トリガー検出
 *
 * Morning Protocol と同じ strong/soft/none の3段階判定。
 *
 * strong: ユーザーが明示的にCoAlterを呼んでいる → 即時起動
 * soft:   共同意思決定の膠着パターン検出 → 「CoAlter呼ぶ？」提案
 * none:   該当なし → 何もしない
 */

import type { TriggerConfidence, TriggerInfo } from "./types";

// ─────────────────────────────────────────────
// Strong triggers: 明示的なCoAlter呼び出し
// ─────────────────────────────────────────────

const STRONG_TRIGGERS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /CoAlter/i, name: "mention_coalter" },
  { pattern: /コオルター|こおるたー/, name: "mention_coalter_ja" },
  // ボタンタップはUI経由のため、ここではテキストパターンのみ
];

// ─────────────────────────────────────────────
// Soft triggers: 共同意思決定の膠着検出
// ─────────────────────────────────────────────

/** 決定膠着パターン */
const DECISION_STALL_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  // 「何にする？」「何見る？」「何食べる？」系
  { pattern: /何(に|を)?(する|しよう|見る|見よう|食べる|食べよう|行く|行こう)/, name: "what_to_do" },
  // 「どこ行く？」「どこにする？」系
  { pattern: /(どこ|何処)(に|へ)?(行く|行こう|にする|にしよう)/, name: "where_to_go" },
  // 「決まらない」「決められない」系
  { pattern: /決(まら|めら)ない/, name: "cant_decide" },
  // 「迷う」「迷ってる」系
  { pattern: /迷(う|って|ってる|い中|うな)/, name: "hesitating" },
  // 「候補ある？」「おすすめある？」系
  { pattern: /候補.{0,4}(ある|ない|ほしい|出して|教えて)/, name: "want_candidates" },
  { pattern: /おすすめ.{0,4}(ある|ない|教えて|出して)/, name: "want_recommendation" },
  // 「何がいい？」「何かいい（の）ある？」系
  { pattern: /何(か|が)いい/, name: "whats_good" },
  // 「どうする？」（汎用的な膠着）
  { pattern: /どうする[？?]?$/, name: "what_do_we_do" },
  { pattern: /どうしよう/, name: "what_should_we_do" },
];

/** 選択肢拡散パターン（1つだけでは弱い → 2ターン連続で検出時のみsoftに昇格） */
const DIFFUSION_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /でも.{0,8}(もいい|もあり|も良い)/, name: "but_also_good" },
  { pattern: /う[〜ー]ん|んー/, name: "hesitation_sound" },
];

/** 明示的な助け要求 */
const HELP_REQUEST_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /誰か(決めて|選んで)/, name: "someone_decide" },
  { pattern: /もう(決めて|選んで|任せ)/, name: "just_decide" },
  { pattern: /(AI|えーあい).*(決めて|選んで|助けて|教えて)/, name: "ai_help" },
];

// ─────────────────────────────────────────────
// 除外条件
// ─────────────────────────────────────────────

/** soft検出しても提案しない条件のチェック用コンテキスト */
export interface TriggerContext {
  /** CoAlterが enabled か */
  isEnabled: boolean;
  /** 直近5分以内に既にCoAlter提案を出したか */
  recentProposalWithin5Min: boolean;
  /** 会話のターン数（片方しか発言していない場合は1以下） */
  conversationTurnCount: number;
  /** 両者が発言しているか */
  bothParticipated: boolean;
}

// ─────────────────────────────────────────────
// メイン判定関数
// ─────────────────────────────────────────────

/**
 * メッセージからCoAlterのトリガーを判定する。
 *
 * @param message - ユーザーが送信したメッセージ
 * @param context - 除外条件チェック用コンテキスト
 * @param previousMessage - 直前のメッセージ（拡散パターンの2ターン連続検出用）
 * @returns TriggerInfo
 */
export function detectCoAlterTrigger(
  message: string,
  context: TriggerContext,
  previousMessage?: string,
): TriggerInfo {
  const trimmed = message.trim();

  // ── Strong: 明示メンション ──
  for (const { pattern, name } of STRONG_TRIGGERS) {
    if (pattern.test(trimmed)) {
      return {
        confidence: "strong",
        matchedPattern: name,
        message: trimmed,
      };
    }
  }

  // ── 除外条件チェック（soft判定の前に） ──
  if (!context.isEnabled) {
    return NONE_RESULT(trimmed);
  }
  if (context.recentProposalWithin5Min) {
    return NONE_RESULT(trimmed);
  }
  if (!context.bothParticipated) {
    return NONE_RESULT(trimmed);
  }
  if (context.conversationTurnCount < 2) {
    return NONE_RESULT(trimmed);
  }

  // ── Soft: 決定膠着パターン ──
  for (const { pattern, name } of DECISION_STALL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        confidence: "soft",
        matchedPattern: name,
        message: trimmed,
      };
    }
  }

  // ── Soft: 助け要求パターン ──
  for (const { pattern, name } of HELP_REQUEST_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        confidence: "soft",
        matchedPattern: name,
        message: trimmed,
      };
    }
  }

  // ── Soft: 拡散パターン（2ターン連続の場合のみ） ──
  if (previousMessage) {
    for (const { pattern, name } of DIFFUSION_PATTERNS) {
      if (pattern.test(trimmed) && pattern.test(previousMessage)) {
        return {
          confidence: "soft",
          matchedPattern: `${name}_consecutive`,
          message: trimmed,
        };
      }
    }
  }

  return NONE_RESULT(trimmed);
}

/**
 * 条件充足度ベースのトリガー判定（Phase 1.5）。
 *
 * テーマ検出 + 条件充足度スコアから、CoAlterの自動提案タイミングを判定。
 * 「話題転換」ではなく「トピック内の情報が揃った」ことがトリガー。
 *
 * @param constraintScore - 0.0〜1.0（computeConstraintScore の結果）
 * @param theme - 検出されたテーマ
 * @param context - 除外条件
 * @returns TriggerInfo（soft or none）
 */
export function detectConstraintTrigger(
  constraintScore: number,
  theme: string,
  context: TriggerContext,
): TriggerInfo {
  // 除外条件
  if (!context.isEnabled) return NONE_RESULT("");
  if (context.recentProposalWithin5Min) return NONE_RESULT("");
  if (!context.bothParticipated) return NONE_RESULT("");

  // general テーマでは自動提案しない
  if (theme === "general" || theme === "schedule") return NONE_RESULT("");

  // 充足度閾値: 0.6以上で自動提案
  const THRESHOLD = 0.6;
  if (constraintScore >= THRESHOLD) {
    return {
      confidence: "soft",
      matchedPattern: `constraint_fulfilled_${theme}`,
      message: `条件充足度 ${Math.round(constraintScore * 100)}%`,
    };
  }

  return NONE_RESULT("");
}

function NONE_RESULT(message: string): TriggerInfo {
  return { confidence: "none", matchedPattern: null, message };
}

/**
 * ボタンタップによる明示的起動（UI経由）。
 * テキストパターンを経由せず直接 strong を返す。
 */
export function createButtonTrigger(userMessage: string | null): TriggerInfo {
  return {
    confidence: "strong",
    matchedPattern: "button_tap",
    message: userMessage ?? "",
  };
}
