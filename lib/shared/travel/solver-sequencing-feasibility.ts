/**
 * S3-B/C/D/E — Sequencing / No-overlap Feasibility（**pure・未配線**）
 *
 * 設計正本: docs/t11-s3-sequencing-gate-design.md（+ CEO 補正: S3 は provisional default を適用しない・
 *   structure を露出するのみ・最終 order/day/placement を選ばない）
 *
 * 役割: S2 の閉じた STN 上で、同日 node の **no-overlap disjunctive feasibility** を解き、
 *   **半順序 P（FORCED）** と **非比較 pair（CHOICE・coupling は複合）** を出す。
 *
 * ★アルゴリズム（DTP feasibility・8! 列挙でない）:
 *   閉じた STN の最小ネットワーク性により、disjunct を 1 つ足した時の整合性は **O(1)**:
 *   「A before B」(e_A ≤ s_B) が feasible ⇔ `D[e_A][s_B] ≥ 0`（逆 path が負閉路を作らない）。
 *   よって全 same-day pair の FORCED/CHOICE 判定は **O(n²) の行列読み取り**（再閉路計算も列挙も不要）。
 *
 * 厳守（S3 forbidden）:
 *   - provisional default を**適用しない**（`provisionalDefault` を立てない）・最終 order/day を選ばない。
 *   - startMin/endMin を確定しない・AssemblyInput/ScheduledTravelItineraryDraft/TravelItinerary/TravelCandidate を産まない。
 *   - day-assignment を**列挙しない**（explicit binding のみ）・overlap を移動で修復しない。
 *   - tie-break を選択 default として適用しない（namedTieBreak は S4 が使う rule 名の宣言のみ）。
 *   - private narrowing を shared 出力に漏らさない（shared は shared-only 制約で再計算）。
 */

import type { ScheduleChoicePoint, SolverInfeasibility, SolverScheduleInput } from "./solver-schedule-types";
import { SCHEDULE_NODE_CAP_PER_DAY } from "./solver-schedule-types";
import type { SolverInputGap } from "./solver-boundary-types";
import { buildClosedStn, temporalInfeasibility } from "./solver-stn-feasibility";

export type SequencingFeasibilityInput = SolverScheduleInput;

/** 半順序 P の forced precedence（同日 node 間） */
export interface ForcedOrderEdge {
  from: string;
  to: string;
}

export type SequencingFeasibilityResult =
  | { outcome: "feasible_space"; forcedOrder: ForcedOrderEdge[]; choicePoints: ScheduleChoicePoint[]; authoritative: false; draft: true; candidateId: string }
  | { outcome: "infeasible"; infeasibility: SolverInfeasibility; authoritative: false; draft: true; candidateId: string }
  | { outcome: "needs_input"; missingForSchedule: SolverInputGap[]; authoritative: false; draft: true; candidateId: string };

/** node の day（single_day=0 / range=binding・buildClosedStn ok 後ゆえ存在保証） */
function dayOfNode(input: SolverScheduleInput, nodeId: string): number {
  const w = input.scope!.window;
  if (w.kind === "single_day") return 0;
  return input.nodeDayBindings![nodeId];
}

const choicePointRationale = () => ({ shared: "この順序は確定していません（選べます）。", forParticipant: {} });

/**
 * sequencing/no-overlap feasibility を計算。`includePrivate=false` で shared 投影（private narrowing 非漏洩）。
 *   - feasible_space: forcedOrder(半順序 P) + choicePoints(非比較・coupling は複合 ordering_choice)
 *   - infeasible: no-overlap 不能（両 disjunct 不能）/ STN 不整合
 *   - needs_input: explicit 欠落 / CAP 超過(split_day_required)
 */
export function computeSequencingFeasibility(
  input: SequencingFeasibilityInput,
  opts?: { includePrivate?: boolean },
): SequencingFeasibilityResult {
  const candidateId = input.draft.candidateId;

  const built = buildClosedStn(input, opts);
  if (built.kind === "needs_input") return { outcome: "needs_input", missingForSchedule: built.gaps, authoritative: false, draft: true, candidateId };
  if (built.kind === "infeasible") return { outcome: "infeasible", infeasibility: temporalInfeasibility(built.reason), authoritative: false, draft: true, candidateId };

  const { D, idxS, idxE, nodeIds } = built.stn;

  // ── CAP=8/day を組合せ計算の前に enforce（heuristic/truncation なし）──
  const perDay = new Map<number, number>();
  for (const id of nodeIds) {
    const d = dayOfNode(input, id);
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }
  for (const [day, count] of perDay) {
    if (count > SCHEDULE_NODE_CAP_PER_DAY) {
      return { outcome: "needs_input", missingForSchedule: [{ kind: "split_day_required", ref: `day:${day}` }], authoritative: false, draft: true, candidateId };
    }
  }

  // ── flip-and-test（同日 pair・O(1) per pair・「X before Y」feasible ⇔ D[e_X][s_Y] ≥ 0）──
  const forcedOrder: ForcedOrderEdge[] = [];
  const incomparable = new Map<string, Set<string>>(); // 非比較 graph（同日）
  const addInc = (a: string, b: string) => {
    if (!incomparable.has(a)) incomparable.set(a, new Set());
    if (!incomparable.has(b)) incomparable.set(b, new Set());
    incomparable.get(a)!.add(b);
    incomparable.get(b)!.add(a);
  };

  for (let i = 0; i < nodeIds.length; i++) {
    for (let j = i + 1; j < nodeIds.length; j++) {
      const A = nodeIds[i];
      const B = nodeIds[j];
      if (dayOfNode(input, A) !== dayOfNode(input, B)) continue; // 異日は overlap しない
      const feasAB = D[idxE.get(A)!][idxS.get(B)!] >= 0; // A before B
      const feasBA = D[idxE.get(B)!][idxS.get(A)!] >= 0; // B before A
      if (feasAB && !feasBA) forcedOrder.push({ from: A, to: B });
      else if (!feasAB && feasBA) forcedOrder.push({ from: B, to: A });
      else if (feasAB && feasBA) addInc(A, B);
      else {
        // 両 disjunct 不能 = no-overlap 不可能 → fail-closed
        return { outcome: "infeasible", infeasibility: temporalInfeasibility("no_feasible_placement"), authoritative: false, draft: true, candidateId };
      }
    }
  }

  // ── coupling: 非比較 graph の連結成分（size2=独立二択 / size≥3=複合）──
  const choicePoints: ScheduleChoicePoint[] = [];
  const seen = new Set<string>();
  const allInc = [...incomparable.keys()].sort();
  for (const start of allInc) {
    if (seen.has(start)) continue;
    // BFS で連結成分
    const comp: string[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const cur = queue.shift()!;
      comp.push(cur);
      for (const nb of incomparable.get(cur) ?? []) if (!seen.has(nb)) { seen.add(nb); queue.push(nb); }
    }
    comp.sort();
    if (comp.length === 2) {
      // 独立二択（他と非比較でない）→ 両方向を提示
      const [a, b] = comp;
      choicePoints.push({
        kind: "ordering_choice",
        ref: `${a}|${b}`,
        feasibleOptions: [`${a}→${b}`, `${b}→${a}`],
        namedTieBreak: "lexicographic_nodeId", // ★ S4 が使う rule 名の宣言のみ・S3 は適用しない
        rationale: choicePointRationale(),
        // ★ provisionalDefault は立てない（S3 は default を選ばない）
      });
    } else if (comp.length >= 3) {
      // ★ coupled cluster → 1 つの複合 ordering_choice（独立 toggle にしない・順序は materialize しない）
      choicePoints.push({
        kind: "ordering_choice",
        ref: `cluster:${comp.join(",")}`,
        feasibleOptions: comp, // 結合した自由 node 集合（joint 順序の確定は S4）
        namedTieBreak: "lexicographic_nodeId",
        rationale: choicePointRationale(),
      });
    }
  }

  return { outcome: "feasible_space", forcedOrder, choicePoints, authoritative: false, draft: true, candidateId };
}

/** ★ shared 投影: private 制約を除外して半順序 P / choice を再計算（private narrowing を漏らさない） */
export function computeSharedSequencingFeasibility(input: SequencingFeasibilityInput): SequencingFeasibilityResult {
  return computeSequencingFeasibility(input, { includePrivate: false });
}
