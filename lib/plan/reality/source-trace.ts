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
 * 設計判断（独立推論 + 監査反映）:
 *   - 根拠は *複合可*（配列）。1 提案が seed＋PRM＋environment＋correction に基づきうる。
 *   - **traceConfidence は補助指標であり、push 許可の直接条件にしない**（push 判断は将来の
 *     Receptivity Gate が confidence×stakes×actionability×receptivity で行う）。
 *   - 相関根拠の過剰加算を防ぐ: correlationGroup 内は max（同じ行動履歴由来の PRM と correction
 *     を二重計上しない）、group 間のみ noisy-OR。さらに cap で上限可。
 *   - reason は人間可読の「なぜ」。これは autonomy-supportive な理由＝自己理解の瞬間でもある。
 *   - 監査可能性: 実体由来 kind は ref(sourceId) を要求（説明文でなく辿れる根拠にする）。
 *
 * 制約: 純関数のみ。I/O・DB・Date.now なし（additive / reversible / test-first）。
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
  /** 由来エンティティ id（= 監査用 sourceId）。実体由来 kind では必須に近い。 */
  readonly ref?: string;
  /** 人間可読の根拠（= ユーザーに見せる「なぜ」） */
  readonly reason: string;
  /** 0..1 この根拠の強さ */
  readonly confidence: number;
  /**
   * 相関グループ。同じ根（例: 同一行動履歴から派生した PRM と correction）は同じグループ
   * に入れる。group 内は max で代表され、二重計上されない。未指定 = 独立。
   */
  readonly correlationGroup?: string;
  /** 観測時刻（基準時刻からの分 or epoch。監査用。呼び出し側が渡す） */
  readonly observedAt?: number;
}

/** 実体由来（ref を要求する）kind */
const ENTITY_KINDS: ReadonlySet<SourceKind> = new Set<SourceKind>([
  "anchor",
  "seed",
  "task",
  "prm",
  "correction",
  "draft_proposal",
  "change_set",
]);

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
 * 監査可能な根拠か（INV-23）。reason を持ち、実体由来 kind は ref(sourceId) を持つこと。
 * environment / long_term_goal は id を持たなくてもよい（reason は必須）。
 */
export function isAuditable(trace: SourceTrace): boolean {
  if (typeof trace.reason !== "string" || trace.reason.length === 0) return false;
  if (ENTITY_KINDS.has(trace.kind)) {
    return typeof trace.ref === "string" && trace.ref.length > 0;
  }
  return true;
}

export function allAuditable(traces: readonly SourceTrace[]): boolean {
  return traces.length > 0 && traces.every(isAuditable);
}

/**
 * 複数根拠の合成信頼度（**補助指標**。push 判断には直接使わない）。
 *   - correlationGroup 内は max（相関根拠を二重計上しない）
 *   - group 間は noisy-OR（独立な根拠は少し合算）
 *   - opts.cap で上限
 * 単一 0.7 → 0.7 / 独立 0.4+0.4 → 0.64 / 同一グループ 0.4+0.4 → 0.4 / 空 → 0。
 */
export function traceConfidence(
  traces: readonly SourceTrace[],
  opts?: { readonly cap?: number }
): number {
  if (traces.length === 0) return 0;
  const groupMax = new Map<string, number>();
  let anon = 0;
  for (const t of traces) {
    const key = t.correlationGroup ?? `__anon_${anon++}`;
    const c = clamp01(t.confidence);
    const prev = groupMax.get(key);
    groupMax.set(key, prev === undefined ? c : Math.max(prev, c));
  }
  const product = [...groupMax.values()].reduce((acc, c) => acc * (1 - c), 1);
  const combined = clamp01(1 - product);
  return typeof opts?.cap === "number" ? Math.min(combined, clamp01(opts.cap)) : combined;
}

/**
 * 根拠が弱いか（合成信頼度 < threshold）。
 * INV-23: 弱根拠の提案は tentative とし push せず確認/on-open へ降格する**材料**（最終判断は Gate）。
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
