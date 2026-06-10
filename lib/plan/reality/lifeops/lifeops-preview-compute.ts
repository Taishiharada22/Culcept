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
  /** 重複制御の可視化（数のみ）。 */
  readonly integrationMeta: { readonly briefingRepresentativeCount: number; readonly momentExcludedCount: number };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** fixture LifeOpsInputs（nowMs 相対・決定論・実データ源未接続）。 */
export function fixtureLifeOpsInputs(nowMs: number): LifeOpsInputs {
  const iso = (deltaDays: number) => new Date(nowMs + deltaDays * DAY_MS).toISOString();
  return {
    cadenceObservations: [
      { categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-60) },
      { categoryId: "groceries", lastCompletedAtISO: iso(-10) },
    ],
    upcomingEvents: [{ kind: "interview", startISO: iso(3) }],
    deadlineObservations: [{ categoryId: "tax_filing", deadlineISO: iso(5) }],
  };
}

export interface LifeOpsPreviewComputeArgs {
  /** page 既読の real WorldState（新規 read しない）。 */
  readonly world: WorldState;
  readonly date: string;
  readonly nowMinute: number;
  readonly nowMs: number;
}

/**
 * fixture Life Ops chain → client DTO（**pure・allowlist 変換・重複制御込み**）。
 */
export function computeLifeOpsPreviewDto(args: LifeOpsPreviewComputeArgs): LifeOpsPreviewClientDto {
  const { world, date, nowMinute, nowMs } = args;

  // fixture 縦入力 → 横 chain（placement→compose）。
  const candidates = collectLifeOpsCandidates(fixtureLifeOpsInputs(nowMs), new Date(nowMs).toISOString());
  const placement = placeLifeOpsCandidatesForDay({ candidates, worldState: world });
  const edi = deriveEmptyDayInput(world, synthesizeMemory([], nowMs), { userIntent: null });
  const proposalSet = generateEmptyDay(edi);
  const compose = composeLifeOpsIntoDayProposals({ proposalSet, placement, dayWindows: world.availableWindows });
  void date;

  // briefing VM → 代表 key を moment の excludeKeys に（§3: 朝言ったことを今もう一度言わない）。
  const briefing = buildLifeOpsBriefingPreview(compose);
  const recTier = compose.recommended ?? "easy";
  const recComposed = compose.composed.find((c) => c.tier === recTier) ?? compose.composed[0];
  const excludeKeys = (recComposed ? recComposed.lifeOps.fitting.slice(0, BRIEFING_HIGHLIGHT_MAX) : []).map((p) => lifeOpsMomentKey(p.candidate));
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
    integrationMeta: { briefingRepresentativeCount: recComposed ? Math.min(recComposed.lifeOps.fitting.length, BRIEFING_HIGHLIGHT_MAX) : 0, momentExcludedCount: excludeKeys.length },
  };
}
