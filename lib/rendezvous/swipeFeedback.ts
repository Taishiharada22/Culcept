/**
 * Swipe Feedback Generator
 *
 * スワイプ行動に対するリアルタイムフィードバックを生成。
 * Implicit Observatory と連携して行動パターンを追跡する。
 */

import type { SwipeFeedbackType, SwipeFeedbackData } from "@/components/rendezvous/SwipeFeedback";

// ---------- Types ----------

export type SwipeDirection = "right" | "left" | "up";

export type CandidateSignals = {
  resonanceLevel: number; // 0-3
  avatarConversationScore?: number; // 0-100
  category: string;
};

export type UserSwipePatterns = {
  /** 直近のスワイプでよく選ぶカテゴリ */
  preferredCategories: string[];
  /** 通常パスするタイプのキーワード */
  usuallyAvoidsTypes: string[];
  /** 直近の右スワイプ率 */
  recentRightSwipeRate: number; // 0-1
  /** スワイプ総数 */
  totalSwipes: number;
};

// ---------- Default Patterns ----------

const DEFAULT_PATTERNS: UserSwipePatterns = {
  preferredCategories: [],
  usuallyAvoidsTypes: [],
  recentRightSwipeRate: 0.5,
  totalSwipes: 0,
};

// ---------- Feedback Messages ----------

const GOOD_MATCH_MESSAGES = [
  "いい選択かもしれない 💫",
  "アバター同士の会話が弾んでいた相手 💫",
  "共鳴度の高い相手に興味を示した ✨",
];

const PATTERN_BREAK_MESSAGES = [
  "新しいパターンを開拓中 ✨",
  "いつもと違う選択。新しい発見があるかも ✨",
  "未知の領域に踏み出した 🌟",
];

const UNEXPECTED_MESSAGES = [
  "共鳴度が高い人をパスした。何か理由がある？ 🤔",
  "意外な選択。いつもと違うね 🤔",
  "アバターが気になっていた相手をパス 🤔",
];

const SUPER_RESONANCE_MESSAGE =
  "スーパーレゾナンス！ アバターが優先的に動きます ⚡";

// ---------- Generator ----------

export function generateSwipeFeedback(
  direction: SwipeDirection,
  candidate: CandidateSignals,
  patterns: UserSwipePatterns = DEFAULT_PATTERNS,
): SwipeFeedbackData {
  // Super Resonance (up) is always positive
  if (direction === "up") {
    return {
      type: "good_match" as SwipeFeedbackType,
      message: SUPER_RESONANCE_MESSAGE,
    };
  }

  const avatarScore = candidate.avatarConversationScore ?? 0;
  const highResonance = candidate.resonanceLevel >= 2;
  const highAvatarScore = avatarScore >= 70;

  // Right swipe
  if (direction === "right") {
    // Pattern break: user usually avoids this type
    if (
      patterns.usuallyAvoidsTypes.length > 0 &&
      patterns.usuallyAvoidsTypes.includes(candidate.category)
    ) {
      return {
        type: "pattern_break",
        message: pick(PATTERN_BREAK_MESSAGES),
      };
    }

    // Good match: high avatar conversation score
    if (highAvatarScore || highResonance) {
      return {
        type: "good_match",
        message: pick(GOOD_MATCH_MESSAGES),
      };
    }

    // Neutral right swipe
    return {
      type: "neutral",
      message: "興味ありに追加しました",
    };
  }

  // Left swipe
  if (direction === "left") {
    // Unexpected: passing a high resonance candidate
    if (highResonance || highAvatarScore) {
      return {
        type: "unexpected",
        message: pick(UNEXPECTED_MESSAGES),
      };
    }

    // Neutral pass
    return {
      type: "neutral",
      message: "静かにアーカイブしました",
    };
  }

  // Fallback (shouldn't reach)
  return { type: "neutral", message: "" };
}

// ---------- Swipe Pattern Tracker ----------

const PATTERN_STORAGE_KEY = "culcept_swipe_patterns_v1";

/** ローカルに保存されたスワイプパターンを読み込む */
export function loadSwipePatterns(): UserSwipePatterns {
  if (typeof window === "undefined") return DEFAULT_PATTERNS;
  try {
    const raw = localStorage.getItem(PATTERN_STORAGE_KEY);
    if (!raw) return DEFAULT_PATTERNS;
    return JSON.parse(raw) as UserSwipePatterns;
  } catch {
    return DEFAULT_PATTERNS;
  }
}

/** スワイプ結果をパターンに記録する (localStorage) */
export function recordSwipe(
  direction: SwipeDirection,
  candidate: CandidateSignals,
): void {
  if (typeof window === "undefined") return;
  try {
    const patterns = loadSwipePatterns();

    patterns.totalSwipes += 1;

    // Update right swipe rate (exponential moving average)
    const isRight = direction === "right" || direction === "up";
    const alpha = 0.15;
    patterns.recentRightSwipeRate =
      alpha * (isRight ? 1 : 0) +
      (1 - alpha) * patterns.recentRightSwipeRate;

    // Track preferred categories (right/up swipes)
    if (isRight) {
      if (!patterns.preferredCategories.includes(candidate.category)) {
        patterns.preferredCategories.push(candidate.category);
      }
    }

    // Track avoided types (left swipes on categories swiped left 3+ times)
    // Simplified: if user passes and category isn't in preferred, add to avoided
    if (direction === "left") {
      if (
        !patterns.preferredCategories.includes(candidate.category) &&
        !patterns.usuallyAvoidsTypes.includes(candidate.category)
      ) {
        patterns.usuallyAvoidsTypes.push(candidate.category);
      }
    }

    localStorage.setItem(PATTERN_STORAGE_KEY, JSON.stringify(patterns));
  } catch {
    // Silent fail for storage errors
  }
}

// ---------- Helpers ----------

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
