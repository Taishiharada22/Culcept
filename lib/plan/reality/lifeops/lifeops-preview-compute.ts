/**
 * 横 R2 — Life Ops Preview Compute（**pure・fixture 入力・新規 read 0**・barrel 非 export）
 *
 * 設計: docs/life-ops-preview-integration-contract.md
 *
 * 役割: operator preview（dev-reality-pipeline）に Life Ops の 3 VM 統合を映すための compute。
 *   **fixture LifeOpsInputs**（実データ源未接続・nowMs 相対の決定論 fixture）+ page 既読の real WorldState から
 *   collect → place → derive+generate → compose → briefing VM → moment VM（**excludeKeys=朝の代表 key**）を実行し、
 *   client に渡してよい **allowlist DTO** だけを返す（candidate 実体/dueReason/placeQuery/分数/コード列は落とす）。
 *
 * 厳守: pure（IO/DB/fetch/Date.now なし・nowMs/nowMinute は caller）・通知/本線接続なし・
 *   重複制御の既定契約=「朝言ったことを今もう一度言わない」（briefing 代表→moment exclude）・
 *   DTO field は `label`（title を使わない＝client 自己 redaction regex と整合）。
 *
 * A-4-c14: done feedback 由来 cadence は caller（page gated read・default OFF）が `feedbackCadence` で注入し、
 *   **raw input cap より前**に merge（cap pipeline 最上流）。compute 自体は pure を維持＝read しない。
 */

import { collectLifeOpsCandidates, type LifeOpsInputs } from "../../../lifeops/candidate-collector";
import { generateEmptyDay } from "../empty-day/empty-day-generator";
import { deriveEmptyDayInput } from "../world-state/world-state-derive";
import { synthesizeMemory } from "../learning/memory-synthesis";
import type { WorldState } from "../world-state/world-state";
import { placeLifeOpsCandidatesForDay } from "./lifeops-placement";
import { composeLifeOpsIntoDayProposals } from "./lifeops-empty-day-compose";
import { buildLifeOpsBriefingPreview, BRIEFING_HIGHLIGHT_MAX } from "./lifeops-briefing-preview";
import { buildLifeOpsMomentPreview, lifeOpsMomentKey } from "./lifeops-moment-preview";
import { capRawLifeOpsInputs, capLifeOpsCandidatePool } from "./lifeops-pool-cap";
import { mergeCadenceIntoLifeOpsInputs } from "./lifeops-feedback-cadence-merge";
import type { CadenceObservation } from "../../../lifeops/candidate-types";

// ── client DTO（唯一の通路・allowlist・§2）──

export interface LifeOpsPreviewHighlightDto {
  readonly label: string;
  readonly phrase: string;
  readonly windowHint: string;
}
export interface LifeOpsPreviewTierDto {
  readonly tier: string;
  readonly tierLabel: string;
  readonly line: string;
  readonly highlights: readonly LifeOpsPreviewHighlightDto[];
  readonly overflowLine: string | null;
}
export interface LifeOpsPreviewMomentDto {
  readonly surfaced: { readonly label: string; readonly kind: string; readonly phrase: string; readonly cautions: readonly string[] } | null;
  readonly silencedCount: number;
  readonly suppression: string | null;
}
export interface LifeOpsPreviewClientDto {
  readonly briefing: {
    readonly headline: string;
    readonly tiers: readonly LifeOpsPreviewTierDto[];
    readonly cautions: readonly string[];
    readonly alsoAvailableLine: string | null;
  };
  readonly moment: LifeOpsPreviewMomentDto;
  /** fixture 駆動の明示（実データ源未接続）。 */
  readonly fixtureNotice: true;
  /** 重複制御 + cap dry-run の可視化（数のみ）。 */
  readonly integrationMeta: {
    readonly briefingRepresentativeCount: number;
    readonly momentExcludedCount: number;
    /** A-4-c7: raw input cap で落ちた観測数（fixture では 0）。 */
    readonly rawDroppedCount: number;
    /** A-4-c7: pool cap で落ちた候補数（fixture では 0・dropped は黙って消えず count で見える）。 */
    readonly poolDroppedCount: number;
    /** A-4-c14: caller 注入の done feedback 由来 cadence 件数（**数のみ**・default OFF/0 件なら 0）。 */
    readonly feedbackCadenceCount: number;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * fixture LifeOpsInputs（nowMs 相対・決定論・実データ源未接続）。
 * A-4-c4: 期限を 3 件に増強（license +20d/lead30・passport +50d/lead60）→ recommended(protect) の fitting が
 *   代表数(3) を超え、**「朝は上位 3 件・昼に 4 件目をそっと出す」Moment 発火が観測可能**になる（logic 不変・fixture のみ）。
 */
export function fixtureLifeOpsInputs(nowMs: number): LifeOpsInputs {
  const iso = (deltaDays: number) => new Date(nowMs + deltaDays * DAY_MS).toISOString();
  return {
    cadenceObservations: [
      { categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-60) },
      { categoryId: "groceries", lastCompletedAtISO: iso(-10) },
    ],
    upcomingEvents: [{ kind: "interview", startISO: iso(3) }],
    deadlineObservations: [
      { categoryId: "tax_filing", deadlineISO: iso(5) },
      { categoryId: "license_renewal", deadlineISO: iso(20) },
      { categoryId: "passport_renewal", deadlineISO: iso(50) },
    ],
  };
}

export interface LifeOpsPreviewComputeArgs {
  /** page 既読の real WorldState（新規 read しない）。 */
  readonly world: WorldState;
  readonly date: string;
  readonly nowMinute: number;
  readonly nowMs: number;
  /** 観測/test 用の入力差し替え（省略時=既定 fixture・page は渡さない＝挙動不変・実データ源では**ない**）。 */
  readonly inputs?: LifeOpsInputs;
  /**
   * A-4-c14: done feedback 由来 cadence（c13 `feedbackToCadence` 出力）。caller（page の gated read）が注入し、
   *   **capRawLifeOpsInputs より前**に inputs.cadenceObservations へ merge する（cap pipeline 最上流契約）。
   *   省略/0 件 → merge は同一参照 no-op＝挙動完全不変。compute 自体は pure のまま（read しない）。
   */
  readonly feedbackCadence?: readonly CadenceObservation[];
}

/**
 * fixture Life Ops chain → client DTO（**pure・allowlist 変換・重複制御込み**）。
 */
export function computeLifeOpsPreviewDto(args: LifeOpsPreviewComputeArgs): LifeOpsPreviewClientDto {
  const { world, date, nowMinute, nowMs } = args;

  // fixture 縦入力 → 横 chain（placement→compose）。A-4-c7: 5層cap を dry-run 配線
  //   （①raw input cap=collector 入力直前 ②pool cap=placement 入力直前。fixture は cap 未満=no-op・flood test で作動証明）。
  // A-4-c14: done feedback 由来 cadence を **raw cap より前**に merge（最上流契約・0 件は no-op）。
  const feedbackCadence = args.feedbackCadence ?? [];
  const mergedInputs = mergeCadenceIntoLifeOpsInputs(args.inputs ?? fixtureLifeOpsInputs(nowMs), feedbackCadence);
  const raw = capRawLifeOpsInputs(mergedInputs);
  const collected = collectLifeOpsCandidates(raw.inputs, new Date(nowMs).toISOString());
  const pooled = capLifeOpsCandidatePool(collected);
  const candidates = pooled.pool;
  const placement = placeLifeOpsCandidatesForDay({ candidates, worldState: world });
  const edi = deriveEmptyDayInput(world, synthesizeMemory([], nowMs), { userIntent: null });
  const proposalSet = generateEmptyDay(edi);
  const compose = composeLifeOpsIntoDayProposals({ proposalSet, placement, dayWindows: world.availableWindows });
  void date;

  // briefing VM → 代表 key を moment の excludeKeys に（朝言ったことを今もう一度言わない）。
  // A-4-c6 policy: **overdue / due-today（daysUntil ≤ 0）の deadline だけは exclude しない**＝昼に一度だけそっと出してよい
  //   （期限を逃す実害 > 1 回の再提示。「一度だけ」は caller が発火後に同 excludeKeys 機構へ key を足す運用・focus/recovery 沈黙は例外なし）。
  const briefing = buildLifeOpsBriefingPreview(compose);
  const recTier = compose.recommended ?? "easy";
  const recComposed = compose.composed.find((c) => c.tier === recTier) ?? compose.composed[0];
  const isUrgentDeadline = (p: { candidate: { dueReason: { kind: string; overdue?: boolean; daysUntilDeadline?: number } } }) =>
    p.candidate.dueReason.kind === "deadline" && (p.candidate.dueReason.overdue === true || (p.candidate.dueReason.daysUntilDeadline ?? 99) <= 0);
  const reps = recComposed ? recComposed.lifeOps.fitting.slice(0, BRIEFING_HIGHLIGHT_MAX) : [];
  const excludeKeys = reps.filter((p) => !isUrgentDeadline(p)).map((p) => lifeOpsMomentKey(p.candidate));
  const moment = recComposed
    ? buildLifeOpsMomentPreview({ composedTier: recComposed, nowMinute, excludeKeys })
    : { surfaced: null, silencedCount: 0, suppressedReasons: [], suppression: null };

  // ── DTO 変換（allowlist・title→label・コード列→counts）──
  return {
    briefing: {
      headline: briefing.headline,
      tiers: briefing.tiers.map((t) => ({
        tier: t.tier,
        tierLabel: t.tierLabel,
        line: t.line,
        highlights: t.highlights.map((h) => ({ label: h.title, phrase: h.phrase, windowHint: h.windowHint })),
        overflowLine: t.overflowLine,
      })),
      cautions: briefing.cautions,
      alsoAvailableLine: briefing.alsoAvailableLine,
    },
    moment: {
      surfaced: moment.surfaced
        ? { label: moment.surfaced.title, kind: moment.surfaced.kind, phrase: moment.surfaced.phrase, cautions: moment.surfaced.cautions }
        : null,
      silencedCount: moment.silencedCount,
      suppression: moment.suppression,
    },
    fixtureNotice: true,
    integrationMeta: {
      briefingRepresentativeCount: recComposed ? Math.min(recComposed.lifeOps.fitting.length, BRIEFING_HIGHLIGHT_MAX) : 0,
      momentExcludedCount: excludeKeys.length,
      rawDroppedCount: raw.droppedCount,
      poolDroppedCount: pooled.droppedCount,
      feedbackCadenceCount: feedbackCadence.length,
    },
  };
}
