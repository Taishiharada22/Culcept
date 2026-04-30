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
}
