/**
 * T4B — 決定論 proposal comparator（**pure・未配線**）
 *
 * 設計: docs/t3-proposal-core-boundary-note.md の続き + GPT logic-side note 2026-06-12
 *
 * 入力: T3 `ProposalSetOutput` + 同一 `ExtractedSlot[]`（owner 帰属用）
 * 出力: `ProposalComparison`（diff / Pareto / role / fairness / blockers / 優先質問 / summary）
 *
 * 厳守（純・決定論）:
 *   - dominance は quality 軸（soft 一致↑・stretch↓）のみ。character 軸（angle/role）は支配に使わない。
 *   - opaque scoring なし。数値順序は透明（soft 一致数・stretch 数・priority rank）でテスト被覆。
 *   - 場所/経路検索・LLM・外部データ・I/O なし。import は travel core/slot/proposal/comparison のみ。
 *   - ★ private 制約は比較結果に影響してよいが、**shared 射影に private descriptor / private tilt を出さない**。
 */

import type { ViewerScopedRationale } from "./core-types";
import type { DescriptorKey, ExtractedSlot, MissingSlotQuestion } from "./slot-types";
import type { ProposalSetOutput, TravelProposal } from "./proposal-types";
import {
  ANGLE_ROLE,
  type DecisionBlocker,
  type DiffDimension,
  type ParticipantImpact,
  type ProposalComparison,
  type ProposalComparisonEntry,
  type ProposalDiff,
  type ProposalFairness,
  type FairnessLean,
} from "./proposal-comparison-types";

const STATUS_PRIORITY: Record<string, number> = { confirmed: 3, normalized: 2, proposed: 1, retracted: 0 };
const PRIORITY_RANK: Record<string, number> = { required: 0, recommended: 1, optional: 2 };

export interface CompareProposalsInput {
  result: ProposalSetOutput;
  /** T3 と同一の正規化済み slot（owner 帰属・stretch 帰属に使用） */
  slots: ExtractedSlot[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部ヘルパ
// ─────────────────────────────────────────────────────────────────────────────

const ownerOf = (s: ExtractedSlot): string | null => (s.owner.kind === "participant" ? s.owner.participantId : null);

/** key 別に status 最優先の slot（決定論・同位先勝ち） */
function pickGoverning(slots: ExtractedSlot[], key: ExtractedSlot["key"]): ExtractedSlot | null {
  let best: ExtractedSlot | null = null;
  for (const s of slots) {
    if (s.key !== key || s.status === "retracted") continue;
    if (best === null || STATUS_PRIORITY[s.status] > STATUS_PRIORITY[best.status]) best = s;
  }
  return best;
}

function stretchCountOf(p: TravelProposal): number {
  return (p.paceFit === "stretch" ? 1 : 0) + (p.mobilityFit === "stretch" ? 1 : 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// entries + dominance
// ─────────────────────────────────────────────────────────────────────────────

function buildEntries(proposals: TravelProposal[]): ProposalComparisonEntry[] {
  const base = proposals.map((p) => ({
    candidateId: p.candidateId,
    angle: p.angle,
    role: ANGLE_ROLE[p.angle],
    softMatchCount: p.softPreferenceMatches.length,
    stretchCount: stretchCountOf(p),
    uncertainty: p.uncertainty,
    missingCount: p.missingInputs.length,
    dominatedBy: [] as string[],
    paretoOptimal: true,
  }));

  // dominance: a が b を支配 = soft>=, stretch<=, かつ少なくとも 1 つ厳密に良い
  const dominates = (a: (typeof base)[number], b: (typeof base)[number]): boolean =>
    a.softMatchCount >= b.softMatchCount &&
    a.stretchCount <= b.stretchCount &&
    (a.softMatchCount > b.softMatchCount || a.stretchCount < b.stretchCount);

  for (const b of base) {
    for (const a of base) {
      if (a.candidateId === b.candidateId) continue;
      if (dominates(a, b)) b.dominatedBy.push(a.candidateId);
    }
    b.paretoOptimal = b.dominatedBy.length === 0;
  }
  return base;
}

// ─────────────────────────────────────────────────────────────────────────────
// diffs（character 軸のみ・public-safe）
// ─────────────────────────────────────────────────────────────────────────────

function buildDiffs(proposals: TravelProposal[]): ProposalDiff[] {
  const out: ProposalDiff[] = [];
  for (let i = 0; i < proposals.length; i++) {
    for (let j = i + 1; j < proposals.length; j++) {
      const a = proposals[i];
      const b = proposals[j];
      const differing: DiffDimension[] = [];
      if (a.angle !== b.angle) differing.push("angle");
      if (ANGLE_ROLE[a.angle] !== ANGLE_ROLE[b.angle]) differing.push("role");
      if (a.softPreferenceMatches.length !== b.softPreferenceMatches.length) differing.push("soft_match");
      if (a.paceFit !== b.paceFit) differing.push("pace_fit");
      if (a.mobilityFit !== b.mobilityFit) differing.push("mobility_fit");
      out.push({ aCandidateId: a.candidateId, bCandidateId: b.candidateId, differing });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// fairness（participant 帰属・counts のみ・descriptor 非搭載）
// ─────────────────────────────────────────────────────────────────────────────

function buildFairness(proposals: TravelProposal[], slots: ExtractedSlot[], participantIds: string[]): ProposalFairness[] {
  // soft pref slot を (descriptorKey,descriptorValue) で索引 → owner/visibility
  const softSlots = slots.filter((s) => s.key === "soft_preference" && s.status !== "retracted");
  const pace = pickGoverning(slots, "pace");
  const mob = pickGoverning(slots, "mobility_tolerance");

  return proposals.map((p) => {
    const impact = new Map<string, ParticipantImpact>();
    const ensure = (pid: string): ParticipantImpact => {
      let e = impact.get(pid);
      if (!e) { e = { participantId: pid, satisfiedShared: 0, satisfiedPrivate: 0, stretchedShared: 0, stretchedPrivate: 0 }; impact.set(pid, e); }
      return e;
    };
    for (const pid of participantIds) ensure(pid);

    // satisfied: proposal の match を slot owner に join
    for (const m of p.softPreferenceMatches) {
      for (const s of softSlots) {
        const v = s.value as { descriptorKey: DescriptorKey; descriptorValue: string };
        if (v.descriptorKey === m.descriptorKey && v.descriptorValue === m.descriptorValue) {
          const owner = ownerOf(s);
          if (owner) {
            const e = ensure(owner);
            if (s.visibility === "private") e.satisfiedPrivate++;
            else e.satisfiedShared++;
          }
        }
      }
    }
    // stretched: paceFit/mobilityFit が stretch かつ該当 slot が participant 所有
    if (p.paceFit === "stretch" && pace) {
      const owner = ownerOf(pace);
      if (owner) { const e = ensure(owner); pace.visibility === "private" ? e.stretchedPrivate++ : e.stretchedShared++; }
    }
    if (p.mobilityFit === "stretch" && mob) {
      const owner = ownerOf(mob);
      if (owner) { const e = ensure(owner); mob.visibility === "private" ? e.stretchedPrivate++ : e.stretchedShared++; }
    }

    const perParticipant = participantIds.map((pid) => ensure(pid));
    const netFull = (e: ParticipantImpact) => e.satisfiedShared + e.satisfiedPrivate - e.stretchedShared - e.stretchedPrivate;
    const netShared = (e: ParticipantImpact) => e.satisfiedShared - e.stretchedShared;
    return {
      candidateId: p.candidateId,
      perParticipant,
      leanFull: computeLean(perParticipant, netFull),
      leanShared: computeLean(perParticipant, netShared),
    };
  });
}

function computeLean(per: ParticipantImpact[], net: (e: ParticipantImpact) => number): FairnessLean {
  if (per.length < 2) return "balanced";
  const sorted = [...per].sort((a, b) => net(b) - net(a) || a.participantId.localeCompare(b.participantId));
  return net(sorted[0]) > net(sorted[1]) ? sorted[0].participantId : "balanced";
}

// ─────────────────────────────────────────────────────────────────────────────
// blockers / 優先質問 / summary
// ─────────────────────────────────────────────────────────────────────────────

function buildBlockers(result: ProposalSetOutput, entries: ProposalComparisonEntry[], paretoIds: string[]): DecisionBlocker[] {
  const out: DecisionBlocker[] = [];
  if (result.inputError !== null) out.push("input_error");
  if (entries.length === 0) out.push("no_viable_proposals");
  if (result.missingQuestions.some((q) => q.priority === "required")) out.push("required_inputs_missing");
  if (entries.length > 0 && entries.every((e) => e.uncertainty === "high")) out.push("all_high_uncertainty");
  if (paretoIds.length > 1 && entries.every((e) => e.softMatchCount === 0)) out.push("tie_no_dominance");
  return out;
}

function prioritize(qs: MissingSlotQuestion[]): MissingSlotQuestion[] {
  return [...qs].sort((a, b) => (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) || a.slotKey.localeCompare(b.slotKey));
}

/** ★ shared 文は character/役割/shared lean のみ。private は forParticipant へ。 */
function buildSummary(proposals: TravelProposal[], slots: ExtractedSlot[], participantIds: string[]): ViewerScopedRationale {
  const roles = Array.from(new Set(proposals.map((p) => ANGLE_ROLE[p.angle])));
  const roleJa: Record<string, string> = { easy: "楽な案", protect: "守りの案", push: "攻める案" };
  const sharedParts: string[] = [`${proposals.length}案を比較しました`];
  if (roles.length > 0) sharedParts.push(roles.map((r) => roleJa[r]).join("・") + "があります");

  // 本人向け: その participant の private soft pref を反映
  const forParticipant: Record<string, string> = {};
  for (const pid of participantIds) {
    const mine = slots.filter((s) => s.key === "soft_preference" && s.visibility === "private" && s.owner.kind === "participant" && s.owner.participantId === pid && s.status !== "retracted");
    if (mine.length > 0) {
      const descs = mine.map((s) => { const v = s.value as { descriptorKey: DescriptorKey; descriptorValue: string }; return `${v.descriptorKey}:${v.descriptorValue}`; });
      forParticipant[pid] = `あなたの希望（${descs.join("・")}）を比較に反映しています`;
    }
  }
  return { shared: sharedParts.join("。") + "。", forParticipant };
}

// ─────────────────────────────────────────────────────────────────────────────
// public: compareProposals
// ─────────────────────────────────────────────────────────────────────────────

export function compareProposals(input: CompareProposalsInput): ProposalComparison {
  const { result, slots } = input;
  const participantIds = result.participantIds;
  const proposals = result.proposals;

  const entries = buildEntries(proposals);
  const paretoOptimalIds = entries.filter((e) => e.paretoOptimal).map((e) => e.candidateId);
  const diffs = buildDiffs(proposals);
  const fairness = buildFairness(proposals, slots, participantIds);
  const blockers = buildBlockers(result, entries, paretoOptimalIds);
  const prioritizedQuestions = prioritize(result.missingQuestions);
  const summary = buildSummary(proposals, slots, participantIds);

  return { participantIds, entries, paretoOptimalIds, diffs, fairness, blockers, prioritizedQuestions, summary, inputError: result.inputError };
}

// ─────────────────────────────────────────────────────────────────────────────
// public: shared 射影（M5・private を漏らさない）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * shared ビュー: 相手にも見せてよい形。
 *   - summary.forParticipant を全削除（shared 文のみ）。
 *   - fairness: private counts を 0 化・lean は **leanShared** を使い leanFull を隠す
 *     （private tilt の存在を露出しない）。
 *   - entries / diffs は character/quality 軸のみ（descriptor 非搭載）なのでそのまま安全。
 */
export function toSharedComparisonView(c: ProposalComparison): ProposalComparison {
  return {
    ...c,
    fairness: c.fairness.map((f) => ({
      candidateId: f.candidateId,
      perParticipant: f.perParticipant.map((e) => ({ ...e, satisfiedPrivate: 0, stretchedPrivate: 0 })),
      leanFull: f.leanShared, // shared 射影では full を露出しない
      leanShared: f.leanShared,
    })),
    summary: { shared: c.summary.shared, forParticipant: {} },
  };
}
