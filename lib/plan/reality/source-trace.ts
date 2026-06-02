/**
 * Reality Control OS — Source Trace（提案・通知・変更の根拠追跡）
 *
 * 親設計: docs/aneurasync-live-plan-controller-golden-scenarios.md
 * 関連 Invariant:
 *   INV-4  Traceable（No Phantom）: 通知/提案/変更は何らかの根拠に追跡可能であること
 *   INV-23 Source Traceability: 生成 plan item は anchor/seed/task/PRM/environment/
 *          correction/long-term-goal/draft-proposal/change-set のいずれかに根拠を持つ。
 *          根拠が薄いものは tentative → push せず on-open/確認へ降格。
 *
 * 設計判断（独立推論）:
 *   - 根拠は *複合可*（配列）。1 つの提案が seed＋PRM＋environment に基づきうる。
 *   - 合成信頼度は noisy-OR（独立な弱根拠は少し合算される）。
 *   - reason は人間可読の「なぜ」。これは autonomy-supportive な理由＝自己理解の瞬間でもある
 *     （行動変容研究: 理由提示が reactance を解毒し内在化を促す）。
 *
 * 制約: 純関数のみ。I/O・DB なし（additive / reversible / test-first）。
 */

export type SourceKind =
  | "anchor" // 確定予定
  | "seed" // ユーザーの意図の種
  | "task" // 未処理タスク
  | "prm" // Personal Reality Model（傾向・回復核・所要時間等）
  | "environment" // 天気・場所・時間帯など外界
  | "correction" // 過去の修正履歴
  | "long_term_goal" // 長期目標
  | "draft_proposal" // 既存の下書き提案
  | "change_set"; // 変更差分（undo 等）

export interface SourceTrace {
  readonly kind: SourceKind;
  /** 由来エンティティ id（environment 等は省略可） */
  readonly ref?: string;
  /** 人間可読の根拠（= ユーザーに見せる「なぜ」） */
  readonly reason: string;
  /** 0..1 この根拠の強さ */
  readonly confidence: number;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

/**
 * 追跡可能か（INV-4）。≥1 の根拠を持つこと。
 * 追跡不能な提案・通知は出してはならない。
 */
export function isTraceable(traces: readonly SourceTrace[]): boolean {
  return traces.length > 0;
}

/**
 * 複数根拠の合成信頼度（noisy-OR: 1 − Π(1 − cᵢ)）。
 * 単一 0.7 → 0.7 / 二つ 0.4 → 0.64 / 空 → 0。
 */
export function traceConfidence(traces: readonly SourceTrace[]): number {
  if (traces.length === 0) return 0;
  const product = traces.reduce((acc, t) => acc * (1 - clamp01(t.confidence)), 1);
  return clamp01(1 - product);
}

/**
 * 根拠が弱いか（合成信頼度 < threshold）。
 * INV-23: 弱根拠の提案は tentative とし push せず確認/on-open へ降格する判断材料。
 */
export function isWeaklyGrounded(traces: readonly SourceTrace[], threshold = 0.5): boolean {
  return traceConfidence(traces) < threshold;
}

/** 最強の単一根拠（空なら null） */
export function strongestSource(traces: readonly SourceTrace[]): SourceTrace | null {
  if (traces.length === 0) return null;
  return traces.reduce((best, t) => (clamp01(t.confidence) > clamp01(best.confidence) ? t : best));
}

/** ユーザーに見せる「なぜ」（理由の連結） */
export function summarizeReasons(traces: readonly SourceTrace[]): string {
  return traces
    .map((t) => t.reason)
    .filter((r) => typeof r === "string" && r.length > 0)
    .join(" / ");
}
