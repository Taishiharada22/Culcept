/**
 * realityOsAssetProviders — production-shaped asset adapter contract（P5・pure・fixture-backed）
 *
 * 実ユーザー資産（calendar/task/energy/...）を **直接読まず**、将来読むための adapter contract を定義する。
 * 今は **fixture-backed provider のみ**。live provider は **stub（unavailable）= 例外台帳**に留める。
 *
 * 依存逆転: pipeline は `RealityOsAssetSourceV0`(port) から input を組む。fixture↔live は port 差し替えのみ。
 *   live を繋ぐ瞬間に ◎（= flip-to-production）。
 *
 * 規律: pure・no DB・no API・no fetch・no LLM・no notification・no persistence。
 *   missing live data は **honest-unknown / unavailable**（捏造しない）。permissionBoundary を緩めない。
 *   raw evidence / graph / ledgerRefs を外部へ戻さない（pipeline 出力は presenter で redacted）。
 */

import { makeRealityInstantJst } from "@/lib/plan/realityCore/realityInstant";
import { inferredAttribute, heuristicAttribute } from "@/lib/plan/realityCore/realityAttribute";
import type { RealityInstant } from "@/lib/plan/realityCore/realityInstant";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { ChangeEligibilityValue } from "@/lib/plan/realityCore/eventRealityNode";
import type { PermissionLevel } from "@/lib/plan/reality/permission/permission-model";
import type { TaskRealityNodeInputV0 } from "@/lib/plan/realityCore/taskRealityNode";
import type { WorkOverrunRiskInputV0 } from "@/lib/plan/realityCore/workOverrunRisk";
import type { StanceJudgmentByStanceV0, StanceJudgmentSummaryV0 } from "@/lib/plan/realityCore/proposalRouteScenarioMapper";
import {
  composeRealityOsFixturePipeline,
  type RealityOsFixturePipelineInputV0,
  type CurrentNonJudgmentInputV0,
} from "@/lib/plan/realityPipeline/realityOsFixturePipeline";
import type { RealityOsSurfaceV0 } from "@/lib/plan/realityPipeline/realityOsSurfaceContract";

/** live 未接続/欠測の honest-unknown マーカー（捏造の代わり）。 */
export const UNAVAILABLE = "unavailable" as const;
export type Unavailable = typeof UNAVAILABLE;

/**
 * asset source port。anchors/proposalTask/current は live で読む対象（fixture or unavailable）。
 * date/instant/viewerKey/routeSetIdSeed は clock/identity 由来で常に available。
 */
export interface RealityOsAssetSourceV0 {
  readonly provenance: "fixture" | "live_stub";
  readonly date: string;
  readonly instant: RealityInstant;
  readonly viewerKey: string;
  readonly routeSetIdSeed: string;
  /** calendar/plan events 由来（live=Supabase・本セッションは fixture / stub は unavailable） */
  readonly anchors: ReadonlyArray<ExternalAnchor> | Unavailable;
  /** task store（canonical_tasks 未適用・fixture / stub は unavailable） */
  readonly proposalTask: TaskRealityNodeInputV0 | Unavailable;
  /** energy/estimate/window 由来の current 非判断入力（fixture / stub は unavailable） */
  readonly current: CurrentNonJudgmentInputV0 | Unavailable;
  /** scenario 判断 summary（judge 実行 or fixture）。空 = honest-unknown（許容） */
  readonly judgmentByStance: StanceJudgmentByStanceV0;
}

export type AssemblePipelineResultV0 =
  | { readonly ok: RealityOsFixturePipelineInputV0 }
  | { readonly unavailable: ReadonlyArray<string> };

export type SurfaceFromSourceResultV0 =
  | { readonly surface: RealityOsSurfaceV0; readonly meta: { readonly routeCount: number } }
  | { readonly unavailable: ReadonlyArray<string> };

/**
 * source(port) → pipeline input。required asset 欠測は fail-closed（unavailable + reasons・捏造しない）。
 */
export function assembleRealityOsPipelineInput(src: RealityOsAssetSourceV0): AssemblePipelineResultV0 {
  const missing: string[] = [];
  if (src.anchors === UNAVAILABLE) missing.push("calendar_anchors");
  if (src.proposalTask === UNAVAILABLE) missing.push("task");
  if (src.current === UNAVAILABLE) missing.push("current_state");
  if (missing.length > 0) return { unavailable: missing };
  return {
    ok: {
      date: src.date,
      anchors: src.anchors as ReadonlyArray<ExternalAnchor>,
      instant: src.instant,
      viewerKey: src.viewerKey,
      proposalTask: src.proposalTask as TaskRealityNodeInputV0,
      routeSetIdSeed: src.routeSetIdSeed,
      current: src.current as CurrentNonJudgmentInputV0,
      judgmentByStance: src.judgmentByStance, // 空は honest-unknown（mapper 側で unknown shift）
    },
  };
}

/** source → redacted surface（または unavailable）。pure・DB/fetch なし。 */
export function composeRealityOsSurfaceFromSource(src: RealityOsAssetSourceV0): SurfaceFromSourceResultV0 {
  const a = assembleRealityOsPipelineInput(src);
  if ("unavailable" in a) return { unavailable: a.unavailable };
  const { surface, meta } = composeRealityOsFixturePipeline(a.ok);
  return { surface, meta: { routeCount: meta.routeCount } };
}

// ── fixture-backed provider（今はこれだけ実装可・real asset を読まない）──

const FX_DATE = "2026-06-12";
function fxAnchor(): ExternalAnchor {
  return {
    anchorKind: "one_off",
    sourceId: "src-manual",
    title: "予定",
    date: FX_DATE,
    rigidity: "soft",
    confirmedAt: "2026-06-01T00:00:00.000Z",
    id: "a1",
    startTime: "14:00",
  } as unknown as ExternalAnchor;
}
const fxOverrun = (est: number, plan: number): WorkOverrunRiskInputV0 => ({
  estimatedMinutes: est, plannedMinutes: plan, flexibility: "flexible", cognitiveLoad: 0.5,
  energyFit: "medium", hasMinimalProgress: true, priorOverruns: 0, sourceKind: "fixture", evidenceRefs: ["fixture:overrun"],
});
const fxJudgment = (
  f: StanceJudgmentSummaryV0["feasibilityStatus"], c: StanceJudgmentSummaryV0["collapseRiskLevel"], est: number, plan: number,
): StanceJudgmentSummaryV0 => ({
  feasibilityStatus: f, collapseRiskLevel: c, overrunInput: fxOverrun(est, plan),
  minimalProgressCandidates: [], minimalProgressContext: { taskText: "資料を作成する", canSplit: true },
  permissionBoundary: 2 as PermissionLevel, realityDiffSummary: null, dayRehearsalSummary: null,
});

export function createFixtureAssetSource(): RealityOsAssetSourceV0 {
  return {
    provenance: "fixture",
    date: FX_DATE,
    instant: makeRealityInstantJst(new Date(Date.UTC(2026, 5, 12, 3, 0))),
    viewerKey: "viewer-self",
    routeSetIdSeed: "p5-fixture-seed",
    anchors: [fxAnchor()],
    proposalTask: {
      taskId: "ot1", title: "資料を作成する",
      deadline: inferredAttribute("2026-06-13T12:00:00+09:00", 0.6, ["d"]),
      estimatedDuration: heuristicAttribute(60, 0.3, ["e"]),
      cognitiveLoad: heuristicAttribute(0.6, 0.3, ["c"]),
      canSplit: inferredAttribute(true, 0.6, ["s"]),
      canMove: inferredAttribute(true, 0.6, ["m"]),
      changeEligibility: inferredAttribute<ChangeEligibilityValue>(
        { canSuggestMove: true, canSuggestShorten: false, canSuggestSkip: false, canSuggestDelegate: false, requiresConfirmation: false, requiresExternalCommunication: false, blockedReason: null },
        0.6, ["ce"],
      ),
      permissionLevel: inferredAttribute<PermissionLevel>(2, 0.6, ["pl"]),
    },
    current: {
      overrunInput: fxOverrun(55, 60),
      minimalProgressCandidates: [],
      minimalProgressContext: { taskText: "資料を作成する", canSplit: true },
      permissionBoundary: 2 as PermissionLevel,
      realityDiffSummary: null,
      dayRehearsalSummary: null,
      reasonCodes: [],
      evidence: ["asset:current"],
      confidence: 0.5,
    },
    judgmentByStance: { protect: fxJudgment("feasible", "low", 30, 60), push: fxJudgment("infeasible", "high", 95, 60) },
  };
}

// ── live provider stub（production-only・例外台帳）。real asset を読まず unavailable を返す ──

/**
 * live asset source の stub。**real DB/sensor を読まず**全 asset を unavailable に倒す（honest）。
 * 実接続（Supabase calendar / canonical_tasks / sensor energy / route・weather provider）は
 * **production-only 例外**（CEO GO + 実装は別 session）。本 stub は「未接続＝unavailable」の契約のみ示す。
 */
export function createLiveAssetSourceStub(): RealityOsAssetSourceV0 {
  return {
    provenance: "live_stub",
    date: FX_DATE,
    instant: makeRealityInstantJst(new Date(Date.UTC(2026, 5, 12, 3, 0))),
    viewerKey: "viewer-self",
    routeSetIdSeed: "p5-live-stub-seed",
    anchors: UNAVAILABLE, // live=Supabase calendar（未接続）
    proposalTask: UNAVAILABLE, // live=canonical_tasks（未適用）
    current: UNAVAILABLE, // live=sensor/dayState energy（未接続）
    judgmentByStance: {}, // honest-unknown
  };
}
