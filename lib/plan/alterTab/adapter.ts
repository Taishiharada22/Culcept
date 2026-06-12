/**
 * Alter タブ adapter（W3a）— PlanClient 既存データ → DayStateBuildInput の pure 写像
 *
 * 正本: docs/day-state-w3-execution-plan.md §2.2 / docs/day-state-alter-tab-v0-design.md
 * 規律:
 *  - 新規 fetch / Supabase read / localStorage ゼロ（入力は全て PlanClient が保持済みの値）
 *  - 再計算ゼロ: density / timeBucket / latencyTolerance は DayGraph の計算済み値を流用
 *  - 捏造禁止: MovementTransition は 3-K では unresolved（時刻なし）のため travel segment を
 *    作らず hasUnresolvedTravel で渡す（travelChainMin は null になる — 設計 §3.1）
 *  - weather は plan 文脈に取得経路が無いため null（W3b b-2 で供給。欠測を捏造しない）
 *  - 時刻 API 直呼びなし（now は呼び出し側が Date を注入）
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { BuildDayGraphResult, DayGraph } from "@/lib/plan/dayGraph/dayGraphTypes";
import type { DayIndicatorVariant } from "@/lib/plan/dayIndicatorView";
import type { DaySegmentLite, DayStateBuildInput } from "@/lib/plan/dayState/dayStateTypes";

/** 主観日境界（設計 §2.2: 00:00-04:59 は前日の主観日に属する） */
const SUBJECTIVE_DAY_START_HOUR = 5;

export function formatIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function toHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * 主観日の暦日キー（"YYYY-MM-DD"）。深夜 00:00-04:59 は前日キーを返す。
 * dayGraphByDate / dayIndicatorByIso は暦日キーのため、この値で引くことで
 * 主観日 × 暦日のずれを adapter 側で吸収する（実行計画 §2.2）。
 */
export function subjectiveDateFor(now: Date): string {
  if (now.getHours() < SUBJECTIVE_DAY_START_HOUR) {
    // 月初・年初跨ぎは Date のカレンダー演算に委ねる（手計算しない）
    const prev = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return formatIsoDateLocal(prev);
  }
  return formatIsoDateLocal(now);
}

/**
 * DayGraph nodes → DaySegmentLite[]。
 * start / end node は observation boundary（予定でも余白でもない）のため写像しない。
 * nodes は buildDayGraph が時系列順を機械保証している（IntegrityContract）。
 */
export function daySegmentsFromGraph(graph: DayGraph): DaySegmentLite[] {
  const out: DaySegmentLite[] = [];
  for (const node of graph.nodes) {
    if (node.kind === "event") {
      out.push({
        kind: "event",
        startHHMM: node.startTime,
        endHHMM: node.endTime,
        durationMin: node.durationMin,
        timeBucket: node.timeBucket,
        latencyTolerance: node.latencyTolerance,
        label: node.displayLabel, // sensitive は EventNode 側で redact 済み（generic label）
      });
    } else if (node.kind === "gap") {
      out.push({
        kind: "gap",
        startHHMM: node.startTime,
        endHHMM: node.endTime,
        durationMin: node.durationMin,
        timeBucket: node.timeBucket,
      });
    }
  }
  return out;
}

export interface ResolveShiftArgs {
  dayIndicatorVariant?: DayIndicatorVariant;
  graph?: DayGraph;
  anchors?: ReadonlyArray<ExternalAnchor>;
  /** シフト表取り込み source（sourceType image/pdf）の id 集合。呼び出し側が sources から導出 */
  shiftSourceIds?: ReadonlySet<string>;
}

/**
 * shift 入力の解決。優先順位: 休み印 > シフト表由来 work anchor > none。
 * work の時刻は anchor の原時刻（DayGraph boundary clip 前）を使う。
 * 同日複数の shift anchor は最早開始のものを採用する（合成して長い勤務を捏造しない）。
 */
export function resolveShiftInput(args: ResolveShiftArgs): DayStateBuildInput["shift"] {
  const v = args.dayIndicatorVariant;
  if (v === "public_holiday" || v === "off") return { kind: "off" };
  if (v === "requested_off") return { kind: "off_request" };

  const { graph, anchors, shiftSourceIds } = args;
  if (graph && anchors && shiftSourceIds && shiftSourceIds.size > 0) {
    const byId = new Map(anchors.map((a) => [a.id, a]));
    let picked: ExternalAnchor | undefined;
    for (const node of graph.nodes) {
      if (node.kind !== "event") continue;
      const anchor = byId.get(node.anchorId);
      if (!anchor || !shiftSourceIds.has(anchor.sourceId)) continue;
      if (!picked || anchor.startTime < picked.startTime) picked = anchor;
    }
    if (picked) {
      return { kind: "work", startTime: picked.startTime, endTime: picked.endTime };
    }
  }
  return { kind: "none" };
}

export interface BuildAlterDayInputArgs {
  /** 呼び出し側（client component）が評価した現在時刻。pure 層は注入のみ */
  now: Date;
  /** 主観日キーで引いた DayGraph（無い日は undefined = 予定なし日として扱う） */
  graphResult: BuildDayGraphResult | undefined;
  dayIndicatorVariant?: DayIndicatorVariant;
  anchors?: ReadonlyArray<ExternalAnchor>;
  shiftSourceIds?: ReadonlySet<string>;
}

/**
 * PlanClient 既存データから DayStateBuildInput（の事実部分）を組む。
 * 本人申告（moodCode / sleepQuality / corrections）と W3b 供給系
 * （dailyModeHint / weather / interpersonalLoadHint / estimatedWalkLevel）は
 * 呼び出し側が後から合成する（adapter は事実写像のみ）。
 */
export function buildAlterDayInput(args: BuildAlterDayInputArgs): {
  date: string;
  input: DayStateBuildInput;
} {
  const date = subjectiveDateFor(args.now);
  const graph = args.graphResult?.graph;
  const segments = graph ? daySegmentsFromGraph(graph) : [];
  const input: DayStateBuildInput = {
    date,
    nowHHMM: toHHMM(args.now),
    segments,
    density: graph?.attributes.density,
    hasUnresolvedTravel: graph ? graph.transitions.length > 0 : undefined,
    shift: resolveShiftInput({
      dayIndicatorVariant: args.dayIndicatorVariant,
      graph,
      anchors: args.anchors,
      shiftSourceIds: args.shiftSourceIds,
    }),
    weather: null,
  };
  return { date, input };
}
