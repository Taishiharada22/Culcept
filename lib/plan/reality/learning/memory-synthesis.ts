/**
 * Reality Control OS — R1-7 Memory Synthesis（**pure・no-DB**・barrel 非 export）
 *
 * 設計: docs/reality-secretary-os-unbuilt-roadmap.md（R1-7）/ memory-model.ts（R1-1）/ CEO 要件
 *
 * 役割: 5 種記憶（semantic/correction/episodic/procedural/preference の `MemoryItem[]`）を **context 単位に統合**し、
 *   R2 empty-day が消費できる **出力契約**（`MemorySynthesis`）を作る pure 層。
 *
 * CEO 要件:
 *   - **conflict handling**: 同一 context の矛盾を解消（directly-observed > inferred）。
 *   - **direct user correction priority**: 本人訂正（suppress/adjust/narrow/trust）を**最優先**で反映。
 *   - **recency**: episodic を nowMs で recency 加重（窓内/総数）。
 *   - **confidence / readiness**: ≤tentative の confidence と、R2 が使ってよいかの readiness ゲート。
 *   - **output contract**: `usableContexts`（ready ∧ 非 suppressed）= R2 が使ってよい唯一の集合。
 *
 * 厳守: confidence は ≤tentative（high なし）・suppressed は使わせない・薄い/矛盾は ready にしない（捏造させない）・
 *   pure・Date.now なし（nowMs を渡す）。
 */

import type { CorrectionVerdict } from "./memory-correction";
import type { MemoryItem, MemoryContext, MemoryLeaning, MemoryCertainty } from "./memory-model";

/** R2 が使ってよいかの段階。 */
export type MemoryReadiness = "insufficient" | "emerging" | "ready";

/** context 単位の統合ビュー（R2 への出力単位）。 */
export interface SynthesizedContext {
  readonly context: MemoryContext;
  /** 集約した正味の寄り（矛盾/無しは null）。 */
  readonly leaning: MemoryLeaning | null;
  /** 本人訂正の verdict（最優先・null=訂正なし）。 */
  readonly userVerdict: CorrectionVerdict | null;
  /** suppress（本人 reject）→ R2 は使わない。 */
  readonly suppressed: boolean;
  /** ≤tentative（high なし）。 */
  readonly confidence: MemoryCertainty;
  readonly readiness: MemoryReadiness;
  /** recency 窓内の episode 数（並べ替え/鮮度判断に）。 */
  readonly recentEpisodes: number;
  readonly totalEpisodes: number;
  /** 推論側（semantic/procedural/preference）の最大証拠数。 */
  readonly evidenceCount: number;
  /** 非断定の provenance 行（観測の根拠）。 */
  readonly notes: readonly string[];
}

/** R1 の最終出力契約（R2 empty-day が消費）。 */
export interface MemorySynthesis {
  /** 全 context（insufficient/emerging/ready 含む・観測用）。 */
  readonly contexts: readonly SynthesizedContext[];
  /** **ready ∧ 非 suppressed のみ**＝R2 が使ってよい唯一の集合。 */
  readonly usableContexts: readonly SynthesizedContext[];
}

export const READY_MIN_EVIDENCE = 5; // ready の最小証拠（stable 閾値と整合）
export const EMERGING_MIN_EVIDENCE = 2; // emerging の最小証拠（それ未満は insufficient）
export const RECENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 日窓

const VERDICT_PRIORITY: Record<CorrectionVerdict, number> = {
  suppress: 4, // reject＝最強の安全 signal
  adjust_direction: 3,
  narrow_context: 2,
  trust_more: 1,
};

/** item の訂正状態 → verdict（null=訂正なし）。directly-observed の中身。 */
function itemVerdict(item: MemoryItem): CorrectionVerdict | null {
  if (item.userCorrection === "rejected") return "suppress";
  if (item.userCorrection === "direction_adjusted") return "adjust_direction";
  if (item.userCorrection === "context_refined") return "narrow_context";
  if (item.userConfirmed) return "trust_more";
  return null;
}

function contextKey(c: MemoryContext): string {
  return `${c.dimension ?? "∅"}:${c.value ?? "∅"}`;
}

/** 1 context group → SynthesizedContext。 */
function synthesizeGroup(items: readonly MemoryItem[], nowMs: number): SynthesizedContext {
  const context = items[0]!.context;

  // ── 本人訂正（最優先）: group 内の最強 verdict ──
  let userVerdict: CorrectionVerdict | null = null;
  for (const it of items) {
    const v = itemVerdict(it);
    if (v && (userVerdict === null || VERDICT_PRIORITY[v] > VERDICT_PRIORITY[userVerdict])) userVerdict = v;
  }
  const suppressed = userVerdict === "suppress";

  // ── 推論側の正味の寄り（leaning 保持 item から・矛盾は null）──
  const leanings = new Set<MemoryLeaning>();
  let evidenceCount = 0;
  for (const it of items) {
    if (it.leaning) leanings.add(it.leaning);
    if (it.leaning) evidenceCount = Math.max(evidenceCount, it.evidenceCount); // 推論側の厚み
  }
  const leaning = leanings.size === 1 ? [...leanings][0]! : null; // 1 種のみ採用・複数は揺れ→null

  // ── recency（episodic を nowMs で）──
  let totalEpisodes = 0;
  let recentEpisodes = 0;
  for (const it of items) {
    if (it.kind !== "episodic") continue;
    totalEpisodes += 1;
    if (it.occurredAtISO) {
      const ts = Date.parse(it.occurredAtISO);
      if (Number.isFinite(ts) && nowMs - ts <= RECENCY_WINDOW_MS && nowMs - ts >= 0) recentEpisodes += 1;
    }
  }

  // ── confidence（≤tentative・suppressed は low）──
  const confidence: MemoryCertainty =
    !suppressed && leaning !== null && evidenceCount >= READY_MIN_EVIDENCE ? "tentative" : "low";

  // ── readiness ゲート（薄い/矛盾/要調整は ready にしない）──
  let readiness: MemoryReadiness;
  if (suppressed) {
    readiness = "insufficient"; // 本人が否定 → 使わせない
  } else if (leaning === null) {
    readiness = evidenceCount >= EMERGING_MIN_EVIDENCE ? "emerging" : "insufficient"; // 矛盾/寄り無し
  } else if (userVerdict === "adjust_direction" || userVerdict === "narrow_context") {
    readiness = "emerging"; // 本人が要調整 → 旧推論を ready にしない
  } else if (evidenceCount >= READY_MIN_EVIDENCE) {
    readiness = "ready";
  } else if (evidenceCount >= EMERGING_MIN_EVIDENCE) {
    readiness = "emerging";
  } else {
    readiness = "insufficient";
  }

  const notes = items.map((it) => it.observation);

  return { context, leaning, userVerdict, suppressed, confidence, readiness, recentEpisodes, totalEpisodes, evidenceCount, notes };
}

/**
 * R1-7: 5 種 MemoryItem[] を context 単位に統合し、R2 が使える出力契約を返す。pure（nowMs を渡す）。
 */
export function synthesizeMemory(items: readonly MemoryItem[], nowMs: number): MemorySynthesis {
  const groups = new Map<string, MemoryItem[]>();
  for (const it of items) {
    const key = contextKey(it.context);
    const g = groups.get(key);
    if (g) g.push(it);
    else groups.set(key, [it]);
  }
  const contexts = [...groups.values()].map((g) => synthesizeGroup(g, nowMs));
  const usableContexts = contexts.filter((c) => c.readiness === "ready" && !c.suppressed);
  return { contexts, usableContexts };
}
