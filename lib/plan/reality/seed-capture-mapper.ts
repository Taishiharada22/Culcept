/**
 * Reality Control OS — A1-5-4a Pure Seed Capture Mapper（A1-5-4-0 boundary・pure・barrel 非 export）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.16
 *
 * 役割: **構造化済み**の capture 抽出結果（`StructuredCaptureInput`）を、DB INSERT 前の
 *   **structured-only draft**（`PlanSeedInsertDraft` + 任意 seed_explicit `DurationEvidenceInsertDraft`）に整形する pure mapper。
 *   raw 発話 parse / LLM / DB INSERT は **しない**（別段階）。raw は本 mapper の入力にも出力にも存在しない。
 *
 * capture boundary（A1-5-4-0）:
 *   [raw 発話] --(抽出: LLM/parse・**本 mapper の前段・別実装**)--> [StructuredCaptureInput（raw 破棄済）]
 *     --(本 mapper・pure)--> [PlanSeedInsertDraft + DurationEvidenceInsertDraft?]
 *     --(**未実装 A1-5-4b**: user-RLS client で atomic INSERT)--> [plan_seeds 行 + evidence 行]
 *
 * 厳守:
 *   - **raw（signal/desiredAction/raw_text/title/location）を入力型にも出力にも持たない**。抽出は前段で済み raw は破棄。
 *   - **DB INSERT/read しない**（draft を返すだけ）。Supabase client / `.from(...)` / service_role なし。
 *   - **default duration を置かない**: seed_explicit duration は **明示があり妥当(1<分<=1440)かつ high** の時だけ evidence 化。なければ evidence なし。
 *   - source_ref は **opaque**（不透明 ID・raw 本文でない）。
 *   - pure / barrel 非 export / runtime・route・UI から呼ばない。
 */

import type { PlanSeedTimeHint, PlanSeedSource, PlanSeedStatus } from "../plan-seed";
import type { ActionShape } from "../../stargazer/alterHomeAdapter";
import type { DurationEvidenceSource, DurationConfidence } from "./seed-placement-enrich";
import { seedExplicitToEvidence } from "./duration-evidence-adapter";

/**
 * 構造化済み capture 入力（**raw を持たない**）。抽出段が raw 発話から構造化したもの。
 * `seedId` は caller 生成 UUID（mapper は id を生成しない・pure）。`sourceRef` は opaque（chat msg id 等・raw 本文でない）。
 */
export interface StructuredCaptureInput {
  readonly seedId: string;
  readonly userId: string;
  readonly desiredDate?: string;
  readonly desiredTimeHint?: PlanSeedTimeHint;
  readonly actionShape?: ActionShape;
  /** 抽出自信度（0-1）。 */
  readonly confidence: number;
  readonly source: PlanSeedSource;
  /** capture 時刻（ISO・caller 提供・mapper は時刻生成しない）。 */
  readonly capturedAt: string;
  readonly expiresAt?: string;
  /** opaque 参照（不透明 ID・raw 本文でない）。 */
  readonly sourceRef?: string;
  /** user が明示した duration（seed_explicit）。妥当(1<分<=1440)かつ high の時のみ evidence 化。 */
  readonly explicitDuration?: { readonly durationMin: number; readonly confidence: DurationConfidence };
}

/** plan_seeds（structured-only）への INSERT draft（**raw 列を持たない**・DB に未投入）。 */
export interface PlanSeedInsertDraft {
  readonly id: string;
  readonly user_id: string;
  readonly desired_date: string | null;
  readonly desired_time_hint: PlanSeedTimeHint | null;
  readonly action_shape: ActionShape | null;
  readonly confidence: number;
  readonly status: PlanSeedStatus;
  readonly source: PlanSeedSource;
  readonly captured_at: string;
  readonly expires_at: string | null;
  /** opaque 参照（raw 本文でない・Complete projection allowed columns には載せない）。 */
  readonly source_ref: string | null;
}

/** plan_seed_duration_evidences への INSERT draft（id/timestamps は DB 既定・**raw を持たない**）。 */
export interface DurationEvidenceInsertDraft {
  readonly user_id: string;
  readonly seed_id: string;
  readonly duration_min: number;
  readonly source: DurationEvidenceSource;
  readonly confidence: DurationConfidence;
  readonly source_ref: string | null;
}

/** capture mapper の出力（seed draft + 任意 evidence draft）。 */
export interface CaptureDrafts {
  readonly seedDraft: PlanSeedInsertDraft;
  readonly evidenceDraft: DurationEvidenceInsertDraft | null;
}

/**
 * A1-5-4a: 構造化 capture 入力 -> structured-only draft（pure・DB INSERT しない）。
 *   - seedDraft: plan_seeds 行（status='active'・raw 列なし）。
 *   - evidenceDraft: explicitDuration が **あり∧妥当(1<分<=1440)∧high** の時だけ seed_explicit 1 件。なければ null。
 *     （default duration を置かない・low/invalid/なし -> evidence なし）。
 * raw を読まない・生成しない。source_ref は opaque のまま透過。
 */
export function captureToDrafts(input: StructuredCaptureInput): CaptureDrafts {
  const seedDraft: PlanSeedInsertDraft = {
    id: input.seedId,
    user_id: input.userId,
    desired_date: input.desiredDate ?? null,
    desired_time_hint: input.desiredTimeHint ?? null,
    action_shape: input.actionShape ?? null,
    confidence: input.confidence,
    status: "active",
    source: input.source,
    captured_at: input.capturedAt,
    expires_at: input.expiresAt ?? null,
    source_ref: input.sourceRef ?? null,
  };

  let evidenceDraft: DurationEvidenceInsertDraft | null = null;
  // 明示 duration があり high の時のみ。range 妥当性は A1-5-3a seedExplicitToEvidence（enrich 検証器）で判定。
  if (input.explicitDuration && input.explicitDuration.confidence === "high") {
    const ev = seedExplicitToEvidence({ seedRef: input.seedId, durationMin: input.explicitDuration.durationMin, confidence: "high" });
    if (ev) {
      evidenceDraft = {
        user_id: input.userId,
        seed_id: input.seedId,
        duration_min: ev.durationMin,
        source: "seed_explicit",
        confidence: "high",
        source_ref: input.sourceRef ?? null,
      };
    }
  }

  return { seedDraft, evidenceDraft };
}
