/**
 * CoAlter Stage 2 — Speech 型定義 (L2-m interface のみ)
 *
 * 正本: speech template §1.3 声の在り方 / §1.4 トーンカテゴリ / Pattern 別文長制約
 *
 * 本ファイルは型のみ。Stage 4 で実装側 (LLM 合成 hook) が消費する interface を
 * 先に固定し、type safety を担保する。
 */

import type { PatternVariant, PresenceMode, PresenceState } from "./types";

/**
 * トーンカテゴリ (UI spec §0.5 / speech template §1.4)。
 *
 * 本書では再定義しない。UI spec §0.5 の値を継承。
 */
export type ToneCategory =
  | "calm"
  | "attentive"
  | "tentative"
  | "protective"
  | "reactive"
  | "urgent"
  | "retreat"
  | "neutral";

/**
 * Pattern 別文長制約。
 *
 * 既定 (speech template §1.3): 1 発話 3 文以内、1 文 14-40 文字。
 * Pattern 固有の override は本書 §3.3 / §4.3 / §5.3 / §6.3 / §7.3 / §8.3 で固定。
 *
 * 例:
 *   - Pattern A 入口発話: 1-2 文、短め
 *   - Pattern C 確認質問: 1 文、? 1 個
 *   - Pattern F-2 生活提案: 3-6 行、本文具体的
 */
export interface LengthOverride {
  minSentences: number;
  maxSentences: number;
  minCharsPerSentence: number;
  maxCharsPerSentence: number;
  /** ? の最大数 (1 発話内、Pattern C は 1) */
  maxQuestions: number;
}

/**
 * Pattern 別 LengthOverride マスタ (speech template 各 §3.3 / §4.3 / ... を写像)。
 *
 * 本書では default のみ固定。Pattern 固有 override は speech template 側で
 * spec rev する。default は §1.3 「3 文以内、14-40 文字」。
 */
export const DEFAULT_LENGTH_OVERRIDE: LengthOverride = {
  minSentences: 1,
  maxSentences: 3,
  minCharsPerSentence: 14,
  maxCharsPerSentence: 40,
  maxQuestions: 1,
};

/**
 * Pattern 別 override (例値、speech template 詳細値で上書き想定)。
 */
export const LENGTH_OVERRIDE_BY_VARIANT: Readonly<
  Record<PatternVariant, LengthOverride>
> = {
  A: { ...DEFAULT_LENGTH_OVERRIDE, maxSentences: 2 },
  B: { ...DEFAULT_LENGTH_OVERRIDE },
  C: { ...DEFAULT_LENGTH_OVERRIDE, maxSentences: 1, maxQuestions: 1 },
  D: { ...DEFAULT_LENGTH_OVERRIDE },
  E: { ...DEFAULT_LENGTH_OVERRIDE },
  F1: { ...DEFAULT_LENGTH_OVERRIDE, maxSentences: 4 },
  F2: { ...DEFAULT_LENGTH_OVERRIDE, maxSentences: 6 },
};

/**
 * speech 合成 入力 (interface)。
 */
export interface BuildPresenceSpeechInput {
  variant: PatternVariant;
  state: PresenceState;
  mode: PresenceMode;
  /** memory / context のヒント (実装側で組み立てた observation メタ) */
  context?: Readonly<Record<string, unknown>>;
}

/**
 * speech 合成 source metadata (CEO 確定 2026-05-01 L4-i Phase 2 mislabel fix)。
 *
 * - "static": 即時 static fallback path (LLM 試行なし、flag OFF / intended bypass)
 * - "llm": 実 LLM call が成功して通過
 * - "fallback": LLM 試行したが失敗 → fallback text 採用
 */
export type SpeechSource = "static" | "llm" | "fallback";

/**
 * fallback 採用理由 (speechSource="fallback" のとき非 null)。
 *
 * - "flag_off": route 側 gate 2 で LLM flag/API key 不在 (本値は route 側 response 専用)
 * - "llm_error": Anthropic SDK 例外 / 通信エラー / 注入未完了
 * - "validation_failed": post-validator が全 retry 後も違反検出
 * - "timeout": client-side fetch timeout (route 側 response 専用)
 */
export type SpeechFallbackReason =
  | "flag_off"
  | "llm_error"
  | "validation_failed"
  | "timeout";

/**
 * speech 合成 出力 (interface)。Stage 4 LLM 実装でこれを返す。
 */
export interface SpeechOutput {
  /** 合成文面 */
  body: string;
  /** トーンカテゴリ */
  tone: ToneCategory;
  /** 採用された LengthOverride (debug / validation 用) */
  appliedLength: LengthOverride;
  /** F-2 主 + F-1 副次同伴の場合、副次 1 行 (§7.10) */
  secondaryLine?: string;

  /**
   * 実 source (CEO 確定 2026-05-01 L4-i Phase 2 mislabel fix):
   * - "static": flag OFF / 即時 static path (LLM 試行なし)
   * - "llm": LLM call 成功 + post-validator OK
   * - "fallback": LLM 試行したが失敗 / 注入なし / validator 全 retry 失敗
   */
  source: SpeechSource;
  /**
   * post-validator の retry 回数 (0 = 1 発で通過、>=1 = retry、source="static" で 0)。
   */
  retries: number;
  /** LLM call 経過時間 (ms)。source="static" で 0、"fallback"/"llm" で実測値。 */
  latencyMs: number;
  /** validator が違反検出したか (source="fallback"+reason="validation_failed" で true)。 */
  validationFailed: boolean;
  /**
   * fallback 採用理由 (source="fallback" でのみ非 null、それ以外 null)。
   *
   * **重要**: speechBuilder は "flag_off" / "timeout" を **設定しない** (それらは route 側で扱う)。
   */
  fallbackReason: null | "llm_error" | "validation_failed";
}
