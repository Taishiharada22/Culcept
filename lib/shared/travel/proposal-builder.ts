/**
 * T3B — 決定論 proposal builder（**pure・未配線**）
 *
 * 設計: docs/travel-mode-plan-os-extension-design.md §5 + GPT logic-side note 2026-06-12
 *
 * 入力: 正規化済み ExtractedSlot[]（T2C 出力）+ participantIds
 * 出力: ProposalSetOutput（最大 3 案の提案骨格 + reject + missing + inputError）
 *
 * 厳守（純・決定論）:
 *   - solver / scoring engine / 場所検索 / 経路検索 / LLM / I/O なし。
 *   - 順序付けは「soft 一致数 → 角度固定順」の決定論ラベルのみ。
 *   - import は core-types / core-helpers / slot-types / proposal-types のみ（M2/CoAlter/TalkBridge 非依存）。
 *   - ★ private 条件は候補 validity に影響してよいが、**shared rationale / shared 射影に漏らさない**（M5）。
 */

import type { BudgetBand, Pace, UncertaintyLevel, Visibility } from "./core-types";
import { validateParticipantsForMvp } from "./core-helpers";
import type { DateOrRangeValue, DescriptorKey, ExtractedSlot, MissingSlotQuestion, TravelSlotKey } from "./slot-types";
import {
  MVP_MAX_PROPOSALS,
  PROPOSAL_ANGLES,
  type FitLabel,
  type HardConstraintViolation,
  type ProposalAngle,
  type ProposalSetOutput,
  type RejectedAngle,
  type SoftPreferenceMatch,
  type TravelProposal,
} from "./proposal-types";

// ─────────────────────────────────────────────────────────────────────────────
// 角度プロファイル（fixed・決定論）
// ─────────────────────────────────────────────────────────────────────────────

interface AngleProfile {
  paceTarget: Pace;
  fatigue: "low" | "medium" | "high";
  /** avoid/prefer 照合用の値タグ */
  emphasis: string[];
  titleJa: string;
  summaryJa: string;
}

const ANGLE_PROFILES: Record<ProposalAngle, AngleProfile> = {
  relaxed: { paceTarget: "slow", fatigue: "low", emphasis: ["calm", "relax", "quiet"], titleJa: "ゆったり過ごす案", summaryJa: "移動を抑えて落ち着いて過ごす一日" },
  food_focused: { paceTarget: "normal", fatigue: "medium", emphasis: ["food", "gourmet"], titleJa: "食を楽しむ案", summaryJa: "食事を中心に組み立てる一日" },
  active: { paceTarget: "intense", fatigue: "high", emphasis: ["active", "sightseeing"], titleJa: "アクティブに巡る案", summaryJa: "見どころを多めに巡る一日" },
  nature: { paceTarget: "normal", fatigue: "medium", emphasis: ["nature", "calm"], titleJa: "自然を感じる案", summaryJa: "自然の中でゆっくり過ごす一日" },
  culture: { paceTarget: "normal", fatigue: "medium", emphasis: ["culture", "art"], titleJa: "文化に触れる案", summaryJa: "歴史や芸術に触れる一日" },
};

const PACE_ORDER: Record<Pace, number> = { slow: 0, normal: 1, intense: 2 };
const STATUS_PRIORITY: Record<string, number> = { confirmed: 3, normalized: 2, proposed: 1, retracted: 0 };

// ─────────────────────────────────────────────────────────────────────────────
// 内部: 条件解決
// ─────────────────────────────────────────────────────────────────────────────

interface ConditionEntry {
  descriptorKey: DescriptorKey;
  descriptorValue: string;
  visibility: Visibility;
  ownerParticipantId: string | null;
}

interface ResolvedField<T> {
  value: T;
  visibility: Visibility;
  ownerParticipantId: string | null;
}

interface EffectiveConditions {
  destination: ResolvedField<string> | null;
  window: ResolvedField<DateOrRangeValue> | null;
  budget: ResolvedField<BudgetBand> | null;
  pace: ResolvedField<Pace> | null;
  mobility: ResolvedField<{ maxWalkKm?: number; maxTransfers?: number }> | null;
  timeWindow: ResolvedField<{ departAfterMin?: number; returnByMin?: number }> | null;
  redLines: ConditionEntry[];
  softPrefs: ConditionEntry[];
}

const ownerId = (slot: ExtractedSlot): string | null =>
  slot.owner.kind === "participant" ? slot.owner.participantId : null;

/** 同 key の slot から status 優先（confirmed>normalized>proposed）で 1 つ選ぶ。決定論（同位は先勝ち）。 */
function pickByStatus(slots: ExtractedSlot[]): ExtractedSlot | null {
  let best: ExtractedSlot | null = null;
  for (const s of slots) {
    if (s.status === "retracted") continue;
    if (best === null || STATUS_PRIORITY[s.status] > STATUS_PRIORITY[best.status]) best = s;
  }
  return best;
}

function resolveConditions(slots: ExtractedSlot[]): EffectiveConditions {
  const byKey = (k: TravelSlotKey) => slots.filter((s) => s.key === k);

  const dest = pickByStatus(byKey("destination_area"));
  const win = pickByStatus(byKey("date_or_range"));
  const bud = pickByStatus(byKey("budget_band"));
  const pac = pickByStatus(byKey("pace"));
  const mob = pickByStatus(byKey("mobility_tolerance"));
  const tw = pickByStatus(byKey("time_window"));

  const field = <T>(s: ExtractedSlot | null, val: (s: ExtractedSlot) => T): ResolvedField<T> | null =>
    s ? { value: val(s), visibility: s.visibility, ownerParticipantId: ownerId(s) } : null;

  const collect = (k: TravelSlotKey): ConditionEntry[] =>
    byKey(k)
      .filter((s) => s.status !== "retracted" && s.key === k)
      .map((s) => {
        const v = s.value as { descriptorKey: DescriptorKey; descriptorValue: string };
        return { descriptorKey: v.descriptorKey, descriptorValue: v.descriptorValue, visibility: s.visibility, ownerParticipantId: ownerId(s) };
      });

  return {
    destination: field(dest, (s) => (s.value as { areaText: string }).areaText),
    window: field(win, (s) => s.value as DateOrRangeValue),
    budget: field(bud, (s) => s.value as BudgetBand),
    pace: field(pac, (s) => s.value as Pace),
    mobility: field(mob, (s) => s.value as { maxWalkKm?: number; maxTransfers?: number }),
    timeWindow: field(tw, (s) => s.value as { departAfterMin?: number; returnByMin?: number }),
    redLines: collect("red_line"),
    softPrefs: collect("soft_preference"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部: フィット評価（決定論）
// ─────────────────────────────────────────────────────────────────────────────

function paceFit(target: Pace, eff: Pace | null): FitLabel {
  if (eff === null) return "fit";
  const d = Math.abs(PACE_ORDER[target] - PACE_ORDER[eff]);
  return d === 0 ? "fit" : d >= 2 ? "conflict" : "stretch";
}

function mobilityFit(fatigue: AngleProfile["fatigue"], mob: { maxWalkKm?: number } | null): FitLabel {
  if (!mob || mob.maxWalkKm === undefined) return "fit";
  const km = mob.maxWalkKm;
  if (fatigue === "high") return km <= 2 ? "conflict" : km <= 4 ? "stretch" : "fit";
  if (fatigue === "medium") return km <= 1 ? "stretch" : "fit";
  return "fit";
}

/** 矛盾 red_line（require:X と avoid:X が同値）検出 */
function hasContradictoryRedLines(redLines: ConditionEntry[]): boolean {
  const requires = new Set(redLines.filter((r) => r.descriptorKey === "require").map((r) => r.descriptorValue));
  return redLines.some((r) => r.descriptorKey === "avoid" && requires.has(r.descriptorValue));
}

/** 角度  vs hard 条件 → 違反一覧（空なら採用可） */
function evaluateHard(angle: ProposalAngle, eff: EffectiveConditions): HardConstraintViolation[] {
  const p = ANGLE_PROFILES[angle];
  const out: HardConstraintViolation[] = [];

  // pace 正反対 → conflict
  if (eff.pace && paceFit(p.paceTarget, eff.pace.value) === "conflict") {
    out.push({ axis: "time", descriptor: `pace:${eff.pace.value}`, visibility: eff.pace.visibility, ownerParticipantId: eff.pace.ownerParticipantId });
  }
  // 低 mobility × 高 fatigue → conflict
  if (eff.mobility && mobilityFit(p.fatigue, eff.mobility.value) === "conflict") {
    out.push({ axis: "distance", descriptor: `max_walk_km:${eff.mobility.value.maxWalkKm}`, visibility: eff.mobility.visibility, ownerParticipantId: eff.mobility.ownerParticipantId });
  }
  // avoid:X が角度 emphasis に一致 → conflict
  for (const rl of eff.redLines) {
    if (rl.descriptorKey === "avoid" && p.emphasis.includes(rl.descriptorValue)) {
      out.push({ axis: "preference", descriptor: `avoid:${rl.descriptorValue}`, visibility: rl.visibility, ownerParticipantId: rl.ownerParticipantId });
    }
  }
  return out;
}

function matchSoftPrefs(angle: ProposalAngle, softPrefs: ConditionEntry[]): SoftPreferenceMatch[] {
  const p = ANGLE_PROFILES[angle];
  const out: SoftPreferenceMatch[] = [];
  for (const sp of softPrefs) {
    const valueHit = p.emphasis.includes(sp.descriptorValue);
    const keyHit = sp.descriptorKey === "food_focus" && angle === "food_focused";
    if (valueHit || keyHit) out.push({ descriptorKey: sp.descriptorKey, descriptorValue: sp.descriptorValue, visibility: sp.visibility });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部: missing / uncertainty / rationale
// ─────────────────────────────────────────────────────────────────────────────

function isConcreteWindow(w: DateOrRangeValue | null): boolean {
  return w !== null && w.kind !== "fuzzy";
}

function computeMissing(eff: EffectiveConditions): { questions: MissingSlotQuestion[]; keys: TravelSlotKey[] } {
  const questions: MissingSlotQuestion[] = [];
  const keys: TravelSlotKey[] = [];
  if (!eff.destination) {
    questions.push({ slotKey: "destination_area", priority: "required", questionIntent: "ask_destination" });
    keys.push("destination_area");
  }
  if (!eff.window || !isConcreteWindow(eff.window.value)) {
    questions.push({ slotKey: "date_or_range", priority: "required", questionIntent: "ask_date" });
    keys.push("date_or_range");
  }
  if (!eff.budget) {
    questions.push({ slotKey: "budget_band", priority: "recommended", questionIntent: "ask_budget" });
    keys.push("budget_band");
  }
  return { questions, keys };
}

function deriveUncertainty(missingKeys: TravelSlotKey[], eff: EffectiveConditions): UncertaintyLevel {
  if (missingKeys.includes("destination_area") || !isConcreteWindow(eff.window?.value ?? null)) return "high";
  if (missingKeys.includes("budget_band")) return "medium";
  return "low";
}

/** ★ shared 文は shared 条件のみ。private は forParticipant へ。 */
function buildRationale(angle: ProposalAngle, eff: EffectiveConditions, matches: SoftPreferenceMatch[]): TravelProposal["rationale"] {
  const p = ANGLE_PROFILES[angle];
  const sharedPhrases: string[] = [p.summaryJa];
  const perPart: Record<string, string[]> = {};

  const pushPrivate = (pid: string | null, phrase: string) => {
    if (!pid) return; // shared owner の private は構造的に存在しない（normalizer が弾く）
    (perPart[pid] ??= []).push(phrase);
  };

  // 解決スカラ条件
  const scalars: { f: ResolvedField<unknown> | null; shared: string; priv: string }[] = [
    { f: eff.destination, shared: `${eff.destination?.value} 方面`, priv: `行き先（${eff.destination?.value}）` },
    { f: eff.budget, shared: `予算 ~${eff.budget?.value.hi}円`, priv: `予算 ~${eff.budget?.value.hi}円` },
    { f: eff.mobility, shared: "移動は控えめ", priv: "移動を控えめに" },
    { f: eff.timeWindow, shared: eff.timeWindow?.value.returnByMin !== undefined ? `${Math.floor((eff.timeWindow?.value.returnByMin ?? 0) / 60)}時帰宅` : "時間に配慮", priv: "帰宅時間に配慮" },
  ];
  for (const s of scalars) {
    if (!s.f) continue;
    if (s.f.visibility === "shared") sharedPhrases.push(s.shared);
    else pushPrivate(s.f.ownerParticipantId, s.priv);
  }
  // soft 一致（shared のみ shared 文へ）
  for (const m of matches) {
    if (m.visibility === "shared") sharedPhrases.push(`${m.descriptorValue} 重視`);
    // private soft は当人 forParticipant へ（owner は match に無いので汎用表現）
  }
  // private red_line/soft は当人向けに「あなたの希望を反映」
  for (const rl of [...eff.redLines, ...eff.softPrefs]) {
    if (rl.visibility === "private") pushPrivate(rl.ownerParticipantId, `あなたの希望（${rl.descriptorKey}:${rl.descriptorValue}）を反映`);
  }

  const forParticipant: Record<string, string> = {};
  for (const [pid, phrases] of Object.entries(perPart)) forParticipant[pid] = phrases.join("・");

  return { shared: sharedPhrases.join("、") + "。", forParticipant };
}

// ─────────────────────────────────────────────────────────────────────────────
// public: buildProposals
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildProposalsInput {
  participantIds: string[];
  slots: ExtractedSlot[];
}

export function buildProposals(input: BuildProposalsInput): ProposalSetOutput {
  const participantIds = input.participantIds;
  const empty = (inputError: ProposalSetOutput["inputError"]): ProposalSetOutput => ({
    participantIds,
    proposals: [],
    rejected: [],
    missingQuestions: [],
    inputError,
  });

  // 参加者検証（1–2）— source kind は見ない（participantId のみ）
  const partCheck = validateParticipantsForMvp(participantIds.map((id) => ({ participantId: id, source: { kind: "self", userId: id } })));
  if (!partCheck.ok) return empty("invalid_participants");

  const eff = resolveConditions(input.slots);

  // 入力矛盾（require:X と avoid:X）→ 全提案不能
  if (hasContradictoryRedLines(eff.redLines)) {
    const missing = computeMissing(eff);
    return { participantIds, proposals: [], rejected: [], missingQuestions: missing.questions, inputError: "contradictory_red_lines" };
  }

  const missing = computeMissing(eff);
  const uncertainty = deriveUncertainty(missing.keys, eff);

  const rejected: RejectedAngle[] = [];
  const viable: { angle: ProposalAngle; matches: SoftPreferenceMatch[] }[] = [];

  for (const angle of PROPOSAL_ANGLES) {
    const violations = evaluateHard(angle, eff);
    if (violations.length > 0) {
      rejected.push({ angle, violations });
      continue;
    }
    viable.push({ angle, matches: matchSoftPrefs(angle, eff.softPrefs) });
  }

  // 決定論順序: soft 一致数 desc → 角度固定順（PROPOSAL_ANGLES index）
  const angleIndex = (a: ProposalAngle) => PROPOSAL_ANGLES.indexOf(a);
  viable.sort((x, y) => (y.matches.length - x.matches.length) || (angleIndex(x.angle) - angleIndex(y.angle)));

  const proposals: TravelProposal[] = viable.slice(0, MVP_MAX_PROPOSALS).map(({ angle, matches }) => {
    const p = ANGLE_PROFILES[angle];
    const title = eff.destination ? `${eff.destination.value}・${p.titleJa}` : p.titleJa;
    return {
      candidateId: `proposal:${angle}`,
      angle,
      title,
      summary: p.summaryJa,
      timeWindow: eff.window ? eff.window.value : null,
      areaPlaceholder: eff.destination ? eff.destination.value : "未指定",
      budgetBand: eff.budget ? eff.budget.value : null,
      paceFit: paceFit(p.paceTarget, eff.pace?.value ?? null),
      mobilityFit: mobilityFit(p.fatigue, eff.mobility?.value ?? null),
      softPreferenceMatches: matches,
      uncertainty,
      missingInputs: missing.keys,
      rationale: buildRationale(angle, eff, matches),
    };
  });

  return { participantIds, proposals, rejected, missingQuestions: missing.questions, inputError: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// public: shared 射影（M5・private を漏らさない）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * shared ビュー: 相手にも見せてよい形。
 *   - proposal.rationale.forParticipant を**全削除**（shared 文のみ残す）。
 *   - softPreferenceMatches は shared のものだけ。
 *   - rejected は **全違反が shared のものだけ**残す（private 違反の存在自体を隠す）。
 */
export function toSharedProposalView(out: ProposalSetOutput): ProposalSetOutput {
  return {
    participantIds: out.participantIds,
    proposals: out.proposals.map((p) => ({
      ...p,
      softPreferenceMatches: p.softPreferenceMatches.filter((m) => m.visibility === "shared"),
      rationale: { shared: p.rationale.shared, forParticipant: {} },
    })),
    rejected: out.rejected.filter((r) => r.violations.every((v) => v.visibility === "shared")),
    missingQuestions: out.missingQuestions,
    inputError: out.inputError,
  };
}
