/**
 * Life Ops — Deadline Engine（期限もの・**pure・no-DB・no-external-API・no-UI**・barrel 非 export）
 *
 * 設計: docs/life-ops-admin-deadline-mini-design.md / boundary §2 L-1・§4 / Appendix A.6 群4・A.8 / cadence-model(daysBetween) / candidate-types
 *
 * 役割: **期日からの逆算**（deadline model）で事務の期限もの（免許/パスポート/税金）を
 *   「期日まで N 日 → 準備候補」化する pure エンジン。cadence（経過ベース・L-2/L-3）と**別の時間構造**。
 *   候補は `LifeOpsCandidate`（§4）で返すだけ（横 R2 が配置・通知は R4）。
 *
 * 厳守:
 *   - **pure・deterministic**: Date.now/argless Date 不使用・`nowISO` 注入。**deadline は注入**（calendar/実データ源 非接触）。
 *   - **断定しない**: overdue も「期日を過ぎている」事実。「やれ」を持たない。候補化は within_lead / overdue のみ。
 *   - deadlineISO null / 不正 → unknown（捏造しない）。横エンジン非 import・barrel 非 export。
 */

import { getCategorySpec, type LifeOpsCategoryId } from "./category-model";
import { daysBetween } from "./cadence-model";
import type { LifeOpsCandidate } from "./candidate-types";

/** 期限の段階（**中立**）。unknown=期日不明で断定しない。 */
export type DeadlinePhase = "unknown" | "not_yet" | "within_lead" | "overdue";

/** 期限もの spec（期日の何日前から準備期＝leadDays）。 */
export interface DeadlineSpec {
  readonly categoryId: LifeOpsCategoryId;
  readonly leadDays: number;
}

/** L 入力（注入）。「期日はいつか」。loose 入力耐性で categoryId は string。 */
export interface DeadlineObservation {
  readonly categoryId: string;
  readonly deadlineISO: string | null;
}

/** 期限の観測（**事実のみ**）。期日不明→daysUntil null。 */
export interface DeadlineStatus {
  readonly phase: DeadlinePhase;
  readonly daysUntilDeadline: number | null;
  readonly leadDays: number;
}

/** MVP 期限もの（leadDays・default）。recurring（家賃/クレカ/サブスク）は後続。 */
const MVP_DEADLINES: readonly DeadlineSpec[] = [
  { categoryId: "license_renewal", leadDays: 30 },
  { categoryId: "passport_renewal", leadDays: 60 },
  { categoryId: "tax_filing", leadDays: 21 },
];

/** categoryId → deadline spec（未知は undefined）。 */
export function getDeadlineSpec(categoryId: string): DeadlineSpec | undefined {
  return MVP_DEADLINES.find((s) => s.categoryId === categoryId);
}

/** MVP の期限もの一覧（定義順）。 */
export function listMvpDeadlines(): readonly DeadlineSpec[] {
  return MVP_DEADLINES;
}

/**
 * 期日から段階を計算（pure・now 注入）。
 *   期日不明/不正→unknown / 超過→overdue / leadDays 以内→within_lead / それ以前→not_yet。
 */
export function computeDeadlineStatus(spec: DeadlineSpec, deadlineISO: string | null, nowISO: string): DeadlineStatus {
  const leadDays = spec.leadDays;
  if (deadlineISO === null) return { phase: "unknown", daysUntilDeadline: null, leadDays };
  const daysUntil = daysBetween(nowISO, deadlineISO);
  if (daysUntil === null) return { phase: "unknown", daysUntilDeadline: null, leadDays }; // 不正 ISO
  let phase: DeadlinePhase;
  if (daysUntil < 0) phase = "overdue";
  else if (daysUntil <= leadDays) phase = "within_lead";
  else phase = "not_yet";
  return { phase, daysUntilDeadline: daysUntil, leadDays };
}

/** 候補化対象 phase（within_lead / overdue）。 */
const CANDIDATE_PHASES: ReadonlySet<DeadlinePhase> = new Set<DeadlinePhase>(["within_lead", "overdue"]);

/**
 * deadline observation[] → LifeOpsCandidate[]（pure・nowISO 注入）。
 *   within_lead / overdue のみ候補化（not_yet/unknown は出さない）。出力は daysUntil 昇順（差し迫った順・安定）。
 */
export function generateDeadlineCandidates(
  observations: readonly DeadlineObservation[],
  nowISO: string
): readonly LifeOpsCandidate[] {
  const out: LifeOpsCandidate[] = [];
  for (const obs of observations) {
    const spec = getDeadlineSpec(obs.categoryId);
    if (!spec) continue; // MVP 外
    const status = computeDeadlineStatus(spec, obs.deadlineISO, nowISO);
    if (!CANDIDATE_PHASES.has(status.phase)) continue; // not_yet/unknown は出さない
    if (status.daysUntilDeadline === null) continue; // 防御
    const cat = getCategorySpec(obs.categoryId);
    if (!cat) continue; // L-1 未定義
    out.push({
      category: cat.id,
      menu: null,
      dueReason: {
        kind: "deadline",
        daysUntilDeadline: status.daysUntilDeadline,
        leadDays: status.leadDays,
        overdue: status.phase === "overdue",
      },
      suggestedWindow: null,
      placeQuery: cat.placeQueryHint,
      permissionLevelHint: cat.defaultMaxLevelHint,
      riskFlags: cat.typicalRiskFlags,
    });
  }
  // 差し迫った順（daysUntil 昇順・overdue は負で最前・安定）
  return out
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const da = a.c.dueReason.kind === "deadline" ? a.c.dueReason.daysUntilDeadline : 0;
      const db = b.c.dueReason.kind === "deadline" ? b.c.dueReason.daysUntilDeadline : 0;
      return da !== db ? da - db : a.i - b.i;
    })
    .map((x) => x.c);
}
