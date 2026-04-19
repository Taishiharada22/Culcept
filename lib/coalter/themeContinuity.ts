/**
 * CoAlter 2026-04-19 — Soft Theme Continuity (CEO 採用案 A)
 *
 * 目的:
 *   会話 theme は時系列で劣化しがち (直近ターンから movie キーワードが抜ける等)。
 *   sanity #3 で観察された挙動:
 *     session 1: 「土曜の映画どうする?」→ theme=movie → movieOrchestrator → candidates=[] (正常)
 *     session 2: 直後の膠着ターン「うーん / 迷うね / 決められないな」のみ重み付けされ
 *                theme=general に劣化 → legacy generateProposal → stale titles 幻覚
 *
 * 仕様 (soft sticky):
 *   - 前回 invoke が theme=movie だった場合、今回 theme が「曖昧 (=general)」
 *     かつ「直近 N ターン内に movie evidence が残っている」かつ
 *     「明確な他テーマ evidence がない」なら movie を維持する。
 *   - 他テーマ (food/travel/gift 等) が明確に検出されていれば切り替えを尊重。
 *   - previousTheme が movie 以外なら何もしない (movie 限定の補正)。
 *
 * 副作用: なし (純関数)。
 */

import type { ConversationTheme, ConversationTurn } from "./types";

/**
 * movie evidence と見なすパターン (寛容側)。
 * detectTheme の MOVIE patterns と同じ + 代表的な劇場版タイトル名の断片。
 */
const MOVIE_EVIDENCE_PATTERNS: RegExp[] = [
  /映画|シネマ|上映|ムービー|film|movie/i,
  /Netflix|ネトフリ|アマプラ|Amazon.*Prime|Disney/i,
  /劇場版|アニメ映画|洋画|邦画/,
];

/**
 * 「明確な他テーマ」の判定パターン (保守側)。
 * food / travel / gift に絞る (schedule/activity は ambiguous になりやすいため除外)。
 */
const OTHER_THEME_STRICT: Array<{ theme: ConversationTheme; patterns: RegExp[] }> = [
  {
    theme: "food",
    patterns: [
      /食べ(る|よう|たい|に行)/,
      /ご飯|ごはん|ランチ|ディナー|夕飯|昼飯|朝ご飯/,
      /レストラン|カフェ|居酒屋|ラーメン|寿司|焼肉|イタリアン|フレンチ|中華|和食/,
    ],
  },
  {
    theme: "travel",
    patterns: [/旅行|旅(行|館)|温泉|ホテル|観光|ドライブ|日帰り/],
  },
  {
    theme: "gift",
    patterns: [/プレゼント|ギフト|贈り物|お土産|誕生日|記念日/],
  },
];

export interface SoftThemeContinuityInput {
  /** detectTheme の結果 */
  detectedTheme: ConversationTheme;
  /** 直前 invoke の card.theme (null なら初回 invoke) */
  previousTheme: ConversationTheme | null;
  /** 直近会話 turns (時系列昇順) */
  messages: ConversationTurn[];
  /** movie evidence を探す直近 N ターン (default 20) */
  evidenceWindow?: number;
}

export type SoftThemeContinuityReason =
  | "no_previous"
  | "previous_not_movie"
  | "detected_confident"
  | "other_theme_evidence"
  | "no_movie_evidence"
  | "sticky_kept_movie";

export interface SoftThemeContinuityResult {
  /** 補正後 theme (補正無しなら detectedTheme と同じ) */
  theme: ConversationTheme;
  /** soft sticky を適用したか */
  stickyApplied: boolean;
  /** 判定理由 (観測用) */
  reason: SoftThemeContinuityReason;
}

/**
 * Soft theme continuity 補正を適用する。
 * CEO 採用案 A: 永久 sticky ではなく「曖昧時のみ維持」。
 */
export function applySoftThemeContinuity(
  input: SoftThemeContinuityInput,
): SoftThemeContinuityResult {
  const { detectedTheme, previousTheme, messages } = input;
  const window = input.evidenceWindow ?? 20;

  // 前回 invoke が無ければ補正しない
  if (!previousTheme) {
    return { theme: detectedTheme, stickyApplied: false, reason: "no_previous" };
  }
  // 前回が movie 以外なら補正しない (sticky は movie 限定)
  if (previousTheme !== "movie") {
    return {
      theme: detectedTheme,
      stickyApplied: false,
      reason: "previous_not_movie",
    };
  }
  // 今回 movie と判定されているなら補正不要
  if (detectedTheme === "movie") {
    return {
      theme: detectedTheme,
      stickyApplied: false,
      reason: "detected_confident",
    };
  }
  // 今回の検出が「明確な他テーマ」(general 以外) なら切り替えを尊重
  if (detectedTheme !== "general") {
    return {
      theme: detectedTheme,
      stickyApplied: false,
      reason: "detected_confident",
    };
  }

  // detectedTheme === "general"、前回 movie の場合のみ soft sticky を検討
  const recent = messages.slice(-window);
  const joinedRecent = recent.map((m) => m.body ?? "").join(" ");

  const hasMovieEvidence = MOVIE_EVIDENCE_PATTERNS.some((p) => p.test(joinedRecent));
  if (!hasMovieEvidence) {
    return {
      theme: detectedTheme,
      stickyApplied: false,
      reason: "no_movie_evidence",
    };
  }

  // 直近窓に「明確な他テーマ」evidence があれば切り替え許容
  for (const { patterns } of OTHER_THEME_STRICT) {
    if (patterns.some((p) => p.test(joinedRecent))) {
      return {
        theme: detectedTheme,
        stickyApplied: false,
        reason: "other_theme_evidence",
      };
    }
  }

  // all clear: soft sticky 適用
  return { theme: "movie", stickyApplied: true, reason: "sticky_kept_movie" };
}

/**
 * 直近 N ターンに movie evidence が含まれるかの pure check。
 * Legacy path の verified-only guard (C) で movie context を判定するのに使う。
 */
export function hasMovieEvidenceInMessages(
  messages: ConversationTurn[],
  window = 20,
): boolean {
  const recent = messages.slice(-window);
  const joined = recent.map((m) => m.body ?? "").join(" ");
  return MOVIE_EVIDENCE_PATTERNS.some((p) => p.test(joined));
}
