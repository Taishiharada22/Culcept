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
import { countCadenceKeyConflicts } from "./lifeops-cadence-real-source";
import { listLifeOpsActionDescriptors } from "./lifeops-action-intent";
import type { CadenceObservation, LifeOpsCandidate } from "../../../lifeops/candidate-types";

// ── client DTO（唯一の通路・allowlist・§2）──

/**
 * A-4-c16: 代表候補の action rail（**表示のみ・押せない・記録しない**）。
 *   field は閉集合（uiLabel/action/cadenceEligible/requiresConfirmation/previewOnly）。
 *   **handle は writer 用内部 DTO のため UI preview に出さない**（intent→本 DTO 変換で落とす・test lock）。
 */
export interface LifeOpsPreviewActionDto {
  readonly uiLabel: string;
  readonly action: string;
  /** done のみ true（cadence=前回完了日を動かす意味を持つ）。 */
  readonly cadenceEligible: boolean;
  /** done のみ true（誤タップ→cadence 歪み防止・確認 UI を義務付ける契約）。 */
  readonly requiresConfirmation: boolean;
  /** 本 slice は no-write 表示専用（押せる UI/writer 配線は別 gate）。 */
  readonly previewOnly: true;
}
export interface LifeOpsPreviewHighlightDto {
  readonly label: string;
  readonly phrase: string;
  readonly windowHint: string;
  /** A-4-c16: Morning 代表（recommended tier）のみ付与・descriptors 不能候補は省略（safe disabled）。 */
  readonly actions?: readonly LifeOpsPreviewActionDto[];
  /**
   * A-4-c17: 非 PII 構造キー（`{category}:{menu}`=lifeOpsMomentKey）。server action への lookup key 専用
   *   （server は信頼せず再計算照合）。**handle ではない**（`lifeops:` prefix なし・writer DTO 非搬出は維持）。
   */
  readonly candidateKey?: string;
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
    /** A-4-c20: real cadence 合成層由来の件数（**数のみ**・default OFF/0 件なら 0）。 */
    readonly realCadenceCount: number;
    /** A-4-c20: feedback と real の同 key・異 ISO 衝突数（**数のみ**・latest 勝ちで解決済みの観測値）。 */
    readonly cadenceSourceConflictCount: number;
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
  /**
   * A-4-c20: real cadence 合成層の出力（中間 DTO→変換済み・confidence=low は上流で足切り済み）。
   *   feedbackCadence の**後**・capRaw の**前**に merge（latest 勝ち=結合的なので順序で結果は変わらない）。
   *   省略/0 件 → no-op。同 key 衝突は `cadenceSourceConflictCount` で観測（counts のみ）。
   */
  readonly realCadence?: readonly CadenceObservation[];
}

/**
 * A-4-c17: preview model（client DTO + **Morning 代表の candidate 実体**）。
 *   repCandidates は **server action の再計算照合専用**（client へ渡してはならない＝page は dto のみ搬出）。
 *   DTO の rail/candidateKey と同一の reps 配列が単一ソース（zip ずれが構造的に起きない）。
 */
export interface LifeOpsPreviewModel {
  readonly dto: LifeOpsPreviewClientDto;
  /** rail を持つ唯一の集合（recommended tier 代表 ≤3）。server-side 検証専用。 */
  readonly repCandidates: readonly LifeOpsCandidate[];
}

/**
 * fixture Life Ops chain → preview model（**pure・allowlist 変換・重複制御込み**）。
 */
export function computeLifeOpsPreviewModel(args: LifeOpsPreviewComputeArgs): LifeOpsPreviewModel {
  const { world, date, nowMinute, nowMs } = args;

  // fixture 縦入力 → 横 chain（placement→compose）。A-4-c7: 5層cap を dry-run 配線
  //   （①raw input cap=collector 入力直前 ②pool cap=placement 入力直前。fixture は cap 未満=no-op・flood test で作動証明）。
  // A-4-c14: done feedback 由来 cadence を **raw cap より前**に merge（最上流契約・0 件は no-op）。
  // A-4-c20: real cadence 合成層を feedback の後・cap の前に merge（latest 勝ち・衝突は count で観測）。
  const feedbackCadence = args.feedbackCadence ?? [];
  const realCadence = args.realCadence ?? [];
  const mergedInputs = mergeCadenceIntoLifeOpsInputs(
    mergeCadenceIntoLifeOpsInputs(args.inputs ?? fixtureLifeOpsInputs(nowMs), feedbackCadence),
    realCadence,
  );
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

  // A-4-c16: Morning 代表（recommended tier）だけに action rail を付与（表示のみ・writer 不呼出）。
  //   briefing VM の highlights は同じ fitting.slice(0, BRIEFING_HIGHLIGHT_MAX) 由来 → index zip は構造整合。
  //   handle は intent から**落とす**（writer 用内部 DTO・UI preview 非搬出）。descriptors 不能（辞書外）は省略。
  const repActions: ReadonlyArray<readonly LifeOpsPreviewActionDto[]> = reps.map((p) =>
    listLifeOpsActionDescriptors(p.candidate).map((d) => ({
      uiLabel: d.uiLabel,
      action: d.intent.action,
      cadenceEligible: d.intent.cadenceEligible,
      requiresConfirmation: d.intent.requiresExplicitConfirmation,
      previewOnly: true as const,
    })),
  );
  const moment = recComposed
    ? buildLifeOpsMomentPreview({ composedTier: recComposed, nowMinute, excludeKeys })
    : { surfaced: null, silencedCount: 0, suppressedReasons: [], suppression: null };

  // ── DTO 変換（allowlist・title→label・コード列→counts）──
  const dto: LifeOpsPreviewClientDto = {
    briefing: {
      headline: briefing.headline,
      tiers: briefing.tiers.map((t) => ({
        tier: t.tier,
        tierLabel: t.tierLabel,
        line: t.line,
        highlights: t.highlights.map((h, i) => ({
          label: h.title,
          phrase: h.phrase,
          windowHint: h.windowHint,
          // A-4-c16: 代表 tier（reps の実出所=recComposed.tier）のみ rail（descriptors 空=辞書外は省略・他 tier は従来形のまま）。
          // A-4-c17: rail と同時に candidateKey（lookup 専用・非 handle）を付与（server action が再計算照合に使う）。
          ...(recComposed && t.tier === recComposed.tier && (repActions[i]?.length ?? 0) > 0
            ? { actions: repActions[i], candidateKey: lifeOpsMomentKey(reps[i].candidate) }
            : {}),
        })),
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
      realCadenceCount: realCadence.length,
      cadenceSourceConflictCount: countCadenceKeyConflicts(feedbackCadence, realCadence),
    },
  };
  return { dto, repCandidates: reps.map((p) => p.candidate) };
}

/**
 * fixture Life Ops chain → client DTO（従来 API・model の dto のみ）。
 */
export function computeLifeOpsPreviewDto(args: LifeOpsPreviewComputeArgs): LifeOpsPreviewClientDto {
  return computeLifeOpsPreviewModel(args).dto;
}
