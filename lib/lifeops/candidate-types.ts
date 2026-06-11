/**
 * Life Ops — Candidate 共通型（§4 縦⇄横 seam・**pure 型のみ**・barrel 非 export）
 *
 * 設計: docs/life-ops-l3-candidate-engine-mini-design.md / l4-event-preparation-mini-design.md / boundary §4
 *
 * 役割: L-3（candidate-engine）と L-4（event-preparation）が共有する候補型を**集約**（循環 import 回避の leaf）。
 *   依存は category-model(L-1) と cadence-model(L-2) のみ。**横エンジン非 import**。値ロジックは持たない（型のみ）。
 */

import type { LifeOpsCategoryId, LifeOpsDefaultMaxLevelHint, LifeOpsRiskFlag } from "./category-model";
import type { BeautyMenu, CadencePhase } from "./cadence-model";

/** 予定前準備の対象イベント種（A.3）。dueReason 契約の一部ゆえ seam 型に置く。 */
export type EventKind =
  | "meeting_someone"
  | "trip"
  | "interview"
  | "business_trip"
  | "ceremony"
  | "shoot"
  | "important_event";

/** L-3/L-4 入力（注入）。「前回いつ完了したか」。loose 入力耐性で categoryId は string。 */
export interface CadenceObservation {
  readonly categoryId: string;
  readonly menu?: BeautyMenu | null;
  readonly lastCompletedAtISO: string | null;
}

/** 周期由来の due 根拠（**事実のみ**・「行くべき」を持たない）。 */
export interface CycleDueReason {
  readonly kind: "cycle";
  readonly elapsedDays: number;
  readonly typicalIntervalDays: number;
  readonly phase: CadencePhase;
}

/** イベント前準備の due 根拠（**事実 + 自然なリード日**・「行け」でない）。 */
export interface EventPrepDueReason {
  readonly kind: "event_prep";
  readonly eventKind: EventKind;
  readonly daysUntilEvent: number;
  /** 周期行動の前倒し（L-4(a)）のみ nearing をセット。one-shot 準備（L-4(b)）は周期がなく **省略**。 */
  readonly cyclePhase?: CadencePhase;
  readonly recommendedLeadDays: number; // イベントの何日前が自然か（馴染み等）
}

/** 事務の期限もの due 根拠（**事実のみ**・期日からの逆算）。 */
export interface DeadlineDueReason {
  readonly kind: "deadline";
  readonly daysUntilDeadline: number;
  readonly leadDays: number;
  readonly overdue: boolean; // 期日超過（事実・断定でない）
}

/** 繰り返し（毎月/毎年）の due 根拠（次発生まで・事実のみ）。 */
export interface RecurringDueReason {
  readonly kind: "recurring";
  readonly daysUntilNext: number;
  readonly leadDays: number;
  readonly recurrenceLabel: string; // 「毎月」「毎年」（表示用・事実）
}

/** 根拠 slot（growth 共通 evidence dimension の valueId と一致・低圧の根拠文の素）。 */
export type GrowthEvidenceKind = "recent_success" | "recent_struggle" | "sustained_streak" | "long_pause";

/**
 * habit 候補に載せる neuron 文脈（**3 slot のみ**・全て taxonomy 定数由来＝free text/PII 流入不可）。
 *   domain/purpose/level/friction 等の詳細は将来 GrowthProfile 側（候補には載せない）。
 */
export interface HabitNeuronContext {
  readonly approachLabel: string | null; // method/mode/practice_type/output の名詞 label（「復習」「ストレッチ」等）
  readonly unitLabel: string | null; // unit の label（「5分」「1セット」等）
  readonly evidenceKind: GrowthEvidenceKind | null;
}

/** 習慣（成長/学習）の due 根拠（週目標に対するペース・低圧）。phase は候補化される 3 つのみ。 */
export interface HabitDueReason {
  readonly kind: "habit";
  readonly phase: "ease_in" | "restart" | "gentle_restart";
  readonly weeklyTarget: number;
  readonly doneThisWeek: number;
  readonly remaining: number;
  /** neuron 文脈（taxonomy 検証済のみ・無ければ省略＝従来文言）。判定には影響しない。 */
  readonly neuron?: HabitNeuronContext;
}

/** due 根拠の union（周期 / イベント前 / 期限 / 繰り返し / 習慣）。 */
export type DueReason = CycleDueReason | EventPrepDueReason | DeadlineDueReason | RecurringDueReason | HabitDueReason;

/** §4 candidate（縦⇄横 seam・横が配置/trigger/場所解決する入力）。 */
export interface LifeOpsCandidate {
  readonly category: LifeOpsCategoryId;
  readonly menu: BeautyMenu | null;
  readonly dueReason: DueReason;
  readonly suggestedWindow: null; // L-3/L-4 は決めない（横 R2 が予定/移動から）。契約のため型保持
  readonly placeQuery: string | null;
  readonly permissionLevelHint: LifeOpsDefaultMaxLevelHint; // L-1 hint・確定は L-7
  readonly riskFlags: readonly LifeOpsRiskFlag[];
}

/** dueReason 横断で経過段階を取り出す（cycle.phase / event_prep.cyclePhase）。one-shot 準備/期限は周期なし→undefined。 */
export function dueReasonPhase(d: DueReason): CadencePhase | undefined {
  if (d.kind === "cycle") return d.phase;
  if (d.kind === "event_prep") return d.cyclePhase;
  return undefined; // deadline は経過段階の概念なし
}
