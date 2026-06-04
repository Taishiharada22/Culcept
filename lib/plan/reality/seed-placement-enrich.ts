/**
 * Reality Control OS — Seed Placement Duration Enrichment（A1-4-3a duration enrichment pure seam）
 *
 * 親設計: docs/aneurasync-reality-candidate-generator-design.md §4h/§4i（A1-4-0/A1-4-1）
 *
 * 役割: PRM / correction / user-confirmed などが **将来出す structured duration evidence** を受け取り、
 *   `SeedPlacement.durationMin`（A1-4-1 では常に null）を **証拠由来で安全に埋める pure seam**。
 *   ＝ 「PRM をつなぐ」slice ではない。**PRM 実接続はしない**。evidence の *形* を受け取るだけ。
 *
 * 【中核原則（独立分析）】:
 *   - **duration は structured evidence がある時だけ入る**。default duration を勝手に置かない（捏造しない）。
 *   - evidence が弱い(low) / 不明 / 範囲外 / source 不正 / seedRef 不一致 → **durationMin は null のまま**。
 *   - 既に durationMin がある placement は **上書きしない**（enrich = 欠落補完であって置換でない）。
 *   - raw text(signal/desiredAction)は読まない。evidence は構造化フィールドのみ（seedRef=id / 分 / enum）。
 *   - **A1-4-3b（resolver/provenance 層）**: 複数 evidence を **deterministic 解決**（source 優先 seed_explicit>correction>prm_typical /
 *     同 priority 不一致は no enrich）+ **provenance**（推定 prm_typical は grounding を weak へ倒し候補化を急がない）。
 *     ＝ PRM 実接続ではなく「来た evidence をどう採用/保留/拒否するか」だけ。primitive `enrichSeedPlacement` は不変。
 *
 * 制約: 純関数のみ。PRM 実接続 / DB / runtime / route / UI / dispatcher / pipeline 配線なし。barrel 未追加。
 */

import type { SeedPlacement, DurationSource, PlacementGrounding } from "./seed-placement";

/** duration evidence の出所（DurationSource の非 unknown 部分）。 */
export type DurationEvidenceSource = Exclude<DurationSource, "unknown">; // "seed_explicit" | "prm_typical" | "correction"

/** evidence の確からしさ（high のみ採用・low は null のまま）。 */
export type DurationConfidence = "high" | "low";

/**
 * 将来 PRM/correction/user-confirmed が出す **構造化 duration 証拠**。
 * raw text を含まない（seedRef は id・durationMin は分・source/confidence は enum）。
 */
export interface DurationEvidence {
  /** どの seed の duration か（seedRef 照合用） */
  readonly seedRef: string;
  /** 証拠が示す所要時間（分） */
  readonly durationMin: number;
  /** 出所（durationSource に対応） */
  readonly source: DurationEvidenceSource;
  /** 証拠の確からしさ（high のみ採用） */
  readonly confidence: DurationConfidence;
}

/** 採用可能な duration の範囲（bounds）。1 分以下・1 日超・NaN・Infinity は reject。 */
const MIN_DURATION_MIN = 1;
const MAX_DURATION_MIN = 24 * 60; // 1440

/** duration が採用可能な範囲・有限か（NaN/Infinity/1 分以下/1 日超を reject）。 */
function isValidEvidenceDuration(d: number): boolean {
  return Number.isFinite(d) && d > MIN_DURATION_MIN && d <= MAX_DURATION_MIN;
}

const VALID_EVIDENCE_SOURCES: ReadonlySet<DurationEvidenceSource> = new Set<DurationEvidenceSource>([
  "seed_explicit",
  "prm_typical",
  "correction",
]);

/** source が明確な enum 値か（runtime malformed evidence への防御）。 */
function isValidEvidenceSource(s: DurationEvidenceSource): boolean {
  return VALID_EVIDENCE_SOURCES.has(s);
}

/**
 * A1-4-3a: 1 つの SeedPlacement を **structured duration evidence** で enrich する pure seam。
 *
 * **enrich する条件（全て満たす時だけ）**: evidence あり ∧ placement.durationMin が null（未充足）∧
 *   seedRef 一致 ∧ confidence=high ∧ source が明確 ∧ durationMin が範囲内（1 分超・1 日以下・有限）。
 * いずれか欠ければ **placement を不変で返す**（durationMin は null のまま＝placeable=false 維持）。
 *
 * **しない**: default duration 付与 / raw text parse / 既存 duration 上書き / PRM 実接続。
 * confidence / source / traceability(seedRef) は保持（durationMin/durationSource のみ更新）。
 */
export function enrichSeedPlacement(p: SeedPlacement, evidence: DurationEvidence | undefined): SeedPlacement {
  if (!evidence) return p; // 証拠なし → 不変
  if (p.durationMin !== null) return p; // 既に duration あり → 上書きしない
  if (evidence.seedRef !== p.seedRef) return p; // seedRef 不一致 → enrich しない
  if (evidence.confidence !== "high") return p; // 弱い証拠 → null のまま
  if (!isValidEvidenceSource(evidence.source)) return p; // source 不明/不正 → enrich しない
  if (!isValidEvidenceDuration(evidence.durationMin)) return p; // 範囲外/NaN/Infinity → enrich しない
  return { ...p, durationMin: evidence.durationMin, durationSource: evidence.source };
}

/**
 * SeedPlacement[] を seedRef→evidence の map で enrich（buildSeedPlacements の後段 pure seam）。
 * evidenceMap が無い / seedRef に対応する evidence が無い placement は不変。入力順を保持。純粋。
 */
export function enrichSeedPlacements(
  placements: readonly SeedPlacement[],
  evidenceMap: Readonly<Record<string, DurationEvidence>> | undefined
): readonly SeedPlacement[] {
  if (!evidenceMap) return placements;
  return placements.map((p) => enrichSeedPlacement(p, evidenceMap[p.seedRef]));
}

// ── A1-4-3b: 複数 evidence の resolver / provenance 層（pure・PRM 実接続なし） ──

/** 複数 evidence 解決の結果区分（provenance / 棄却理由を structured に保持）。 */
export type DurationResolutionOutcome = "adopted" | "no_eligible_evidence" | "same_priority_conflict";

/** resolveDurationEvidence の結果（採用 duration / source / 区分）。 */
export interface DurationResolution {
  readonly outcome: DurationResolutionOutcome;
  /** 採用した duration（adopted のみ非 null） */
  readonly durationMin: number | null;
  /** 採用した source（provenance・adopted のみ非 null） */
  readonly source: DurationEvidenceSource | null;
}

/** source の優先順位（大きいほど優先）: ユーザー明示 > 修正学習 > 一般的推定。 */
const DURATION_SOURCE_PRIORITY: Record<DurationEvidenceSource, number> = {
  seed_explicit: 3,
  correction: 2,
  prm_typical: 1,
};

/**
 * A1-4-3b: ある seed への複数 DurationEvidence を **deterministic に解決** する pure resolver。
 *   1. eligible 抽出: seedRef 一致 ∧ confidence=high ∧ source 明確 ∧ duration 範囲内（低信頼/不正は除外）。
 *   2. 最高優先 source 群（seed_explicit>correction>prm_typical）を取る。
 *   3. その群内で duration が **不一致なら same_priority_conflict（no enrich）**、一致なら adopted。
 * eligible が無ければ no_eligible_evidence。**推測しない**（曖昧は採用しない）。
 */
export function resolveDurationEvidence(seedRef: string, evidences: readonly DurationEvidence[]): DurationResolution {
  const eligible = evidences.filter(
    (e) =>
      e.seedRef === seedRef &&
      e.confidence === "high" &&
      isValidEvidenceSource(e.source) &&
      isValidEvidenceDuration(e.durationMin)
  );
  if (eligible.length === 0) return { outcome: "no_eligible_evidence", durationMin: null, source: null };
  const topPriority = Math.max(...eligible.map((e) => DURATION_SOURCE_PRIORITY[e.source]));
  const top = eligible.filter((e) => DURATION_SOURCE_PRIORITY[e.source] === topPriority);
  const durations = [...new Set(top.map((e) => e.durationMin))];
  if (durations.length > 1) return { outcome: "same_priority_conflict", durationMin: null, source: null };
  return { outcome: "adopted", durationMin: durations[0], source: top[0].source };
}

/**
 * 採用 source に応じた grounding（**推定 prm_typical は weak へ倒す**・他は維持）。
 * ＝ 推定由来の duration は候補化を急がず tentative 材料にする（generateComplete は grounding=strong のみ候補化）。
 */
function groundingForAdoptedSource(source: DurationEvidenceSource, current: PlacementGrounding): PlacementGrounding {
  return source === "prm_typical" ? "weak" : current;
}

/**
 * A1-4-3b: 複数 evidence を解決して SeedPlacement を enrich（provenance grounding 込み）。
 * adopted のときだけ durationMin/durationSource を埋め、prm_typical は grounding=weak に倒す。
 * 既存 durationMin は上書きしない。no enrich のときは不変。raw を読まない・default を置かない。
 */
export function enrichSeedPlacementFromEvidences(p: SeedPlacement, evidences: readonly DurationEvidence[]): SeedPlacement {
  if (p.durationMin !== null) return p; // 既存 duration → 上書きしない
  const res = resolveDurationEvidence(p.seedRef, evidences);
  if (res.outcome !== "adopted" || res.durationMin === null || res.source === null) return p;
  return {
    ...p,
    durationMin: res.durationMin,
    durationSource: res.source,
    grounding: groundingForAdoptedSource(res.source, p.grounding),
  };
}

/**
 * SeedPlacement[] を seedRef→evidence[] の map で解決・enrich（buildSeedPlacements の後段 pure seam）。
 * map が無い / seedRef に evidence が無い placement は不変。入力順を保持。純粋。
 */
export function enrichSeedPlacementsFromEvidences(
  placements: readonly SeedPlacement[],
  evidenceMap: Readonly<Record<string, readonly DurationEvidence[]>> | undefined
): readonly SeedPlacement[] {
  if (!evidenceMap) return placements;
  return placements.map((p) => enrichSeedPlacementFromEvidences(p, evidenceMap[p.seedRef] ?? []));
}
