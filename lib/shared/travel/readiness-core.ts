/**
 * T6B — 決定論 readiness core（**pure・未配線**）
 *
 * 設計: readiness-types.ts + GPT note 2026-06-12
 *
 * 入力: T5 `DecisionResult` + 選択された `TravelProposal`（+ 任意 `ReadinessPolicy` 純 input）
 * 出力: `ReadinessResult`（許可レベルのみ・**実予約/カレンダー/外部 booking は実行しない**）
 *
 * 厳守（純・決定論）:
 *   - 場所/経路/予約 API・カレンダー write・LLM・外部データ・I/O・DB なし。import は travel core/types のみ。
 *   - **fail-closed**: required 欠如 / blocked / 選択不正 では提案させない。
 *   - 確認必須: 有償予約 / 長期移動 / 取消不能 / 相手影響 / 高 uncertainty / private 制約衝突。
 *   - ★ private 制約衝突は確認/ブロックを起こしてよいが、**shared rationale / shared view に漏らさない**。
 */

import type { ViewerScopedRationale } from "./core-types";
import type { DecisionResult } from "./decision-types";
import type { TravelProposal } from "./proposal-types";
import type {
  ActionKind,
  CancelWeatherEvidence,
  CancelWeatherRisk,
  ConfirmationReason,
  ReadinessPolicy,
  ReadinessResult,
  RequiredConfirmation,
} from "./readiness-types";

export interface ReadinessInput {
  decision: DecisionResult;
  /** decision.recommendedProposalId に一致する案（呼び出し側が供給・T6 は lookup しない） */
  selected: TravelProposal | null;
  policy?: ReadinessPolicy;
  /**
   * T11-C7: cancel_weather の純 evidence（天候不確実 × 取消不能 commitment）。
   * **供給時のみ** weather_reversal_uncertainty 確認を起こす。未供給 → 既存 readiness 挙動は不変。
   * ★ fit-core は本 slice では producer にしない（caller が渡す純データ）。
   */
  cancelWeather?: CancelWeatherEvidence;
}

// ─────────────────────────────────────────────────────────────────────────────
// T11-C7: cancel_weather 純評価（**readiness 層・非 opaque**）
//   weatherVulnerability(uncertainty) × 低 reversibility(取消不能) → commitment を defer すべき risk。
//   real options / irreversibility: 不確実 × 取消不能が高いほど「待つ/確認する」価値が上がる。
//   fit burden（体験の重さ）でなく commitment safety。
// ─────────────────────────────────────────────────────────────────────────────

/** 天候脆弱性がこの値以上で material（確認・question の前提） */
export const CANCEL_WEATHER_VULN_THRESHOLD = 0.5;
/** 取消柔軟性がこの値未満で rigid（取消不能寄り） */
export const CANCEL_WEATHER_REVERSIBILITY_THRESHOLD = 0.5;
/** risk がこの値以上で（commitment 下）shared 確認を要求 */
export const CANCEL_WEATHER_CONFIRM_RISK_FLOOR = 0.35;
/** fallback による最大 fractional relief（< 1.0・feasibility/booking を grant しない部分緩和のみ） */
export const CANCEL_WEATHER_FALLBACK_RELIEF = 0.6;
/** private リスク許容度がこの値以下で concern を押し上げる */
export const CANCEL_WEATHER_PRIVATE_TOLERANCE_THRESHOLD = 0.4;

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * cancel_weather risk を純評価。**副作用なし・決定論・fit-core 非依存**。
 * 欠落は推測しない: weather 不明 → risk 0（rain を仮定しない）/ 取消柔軟性 不明 → question 化
 * （rigid 側に fail-closed しつつ「推測した」ことにはしない）。
 */
export function assessCancelWeatherRisk(ev: CancelWeatherEvidence | undefined): CancelWeatherRisk {
  const none: CancelWeatherRisk = {
    risk: 0,
    needsConfirmation: false,
    needsQuestion: false,
    privateElevation: false,
    confidence: 0,
    missingFields: [],
  };
  if (!ev) return none;
  // weather 欠落 → rain を hallucinate しない（risk 0・missing 記録のみ）
  if (ev.weatherVulnerability === undefined) {
    return { ...none, confidence: clamp01(ev.confidence ?? 0), missingFields: ["weatherVulnerability"] };
  }
  const wv = clamp01(ev.weatherVulnerability);
  // 屋外露出は任意の係数（提供時のみ・未提供は露出を仮定せず wv をそのまま）
  const severity = ev.outdoorExposure !== undefined ? wv * clamp01(ev.outdoorExposure) : wv;

  const missingFields: string[] = [];
  const flexibilityKnown = ev.cancellationFlexibility !== undefined;
  if (!flexibilityKnown) missingFields.push("cancellationFlexibility");
  // 未知 → 取消不能寄り(0)に fail-closed（推測ではなく question 化）。単一 reversibility 軸。
  const reversibility = flexibilityKnown ? clamp01(ev.cancellationFlexibility as number) : 0;
  const trapFactor = 1 - reversibility; // rigid ほど天候不確実が commitment を縛る

  let risk = severity * trapFactor;
  // fallback は concern を部分緩和（< 1.0・feasibility/booking authority は grant しない）
  if (ev.fallbackAvailability !== undefined) {
    risk *= 1 - CANCEL_WEATHER_FALLBACK_RELIEF * clamp01(ev.fallbackAvailability);
  }
  risk = clamp01(risk);

  const material = wv >= CANCEL_WEATHER_VULN_THRESHOLD;
  const rigid = flexibilityKnown && reversibility < CANCEL_WEATHER_REVERSIBILITY_THRESHOLD;
  const needsConfirmation = material && rigid && risk >= CANCEL_WEATHER_CONFIRM_RISK_FLOOR;
  const needsQuestion = material && !flexibilityKnown; // 取消柔軟性 不明 → 推測せず問う
  const privateElevation =
    ev.privateRiskTolerance !== undefined &&
    ev.privateRiskTolerance <= CANCEL_WEATHER_PRIVATE_TOLERANCE_THRESHOLD &&
    severity > 0;

  const confidence = clamp01(ev.confidence ?? (flexibilityKnown ? 0.7 : 0.4));
  return { risk, needsConfirmation, needsQuestion, privateElevation, confidence, missingFields };
}

const ACTION_RANK: Record<ActionKind, number> = {
  discuss_only: 0,
  propose_plan: 1,
  schedule_hold: 2,
  reserve_or_book_later: 3,
};

const ACTION_JA: Record<ActionKind, string> = {
  discuss_only: "相談",
  propose_plan: "提案",
  schedule_hold: "仮おさえ",
  reserve_or_book_later: "予約手続き",
};

function inheritForParticipant(d: DecisionResult): Record<string, string> {
  return { ...d.rationale.forParticipant };
}

// ─────────────────────────────────────────────────────────────────────────────
// public: assessReadiness
// ─────────────────────────────────────────────────────────────────────────────

export function assessReadiness(input: ReadinessInput): ReadinessResult {
  const d = input.decision;
  const intended: ActionKind = input.policy?.intendedAction ?? "propose_plan";

  const nonRecommend = (state: ReadinessResult["state"], shared: string, pendingQuestion: ReadinessResult["pendingQuestion"]): ReadinessResult => ({
    authoritative: true,
    state,
    actionKind: "discuss_only",
    requiredConfirmations: [],
    riskFlags: [],
    blockers: d.blockers,
    pendingQuestion,
    participantApprovalRequired: [],
    rationale: { shared, forParticipant: inheritForParticipant(d) },
    inputError: d.inputError,
  });

  // 1. blocked（hard gate）
  if (d.state === "blocked") return nonRecommend("blocked", "まだ提案できる段階ではありません", null);
  // 2. needs_question
  if (d.state === "needs_question") return nonRecommend("needs_question", "決めるにはもう少し情報が必要です", d.followUpQuestion);
  // 3. tie → not_ready（単一案が未確定）
  if (d.state === "tie") return nonRecommend("not_ready", "案が拮抗しています。好みを教えてください", d.followUpQuestion);

  // 4. recommend
  const selected = input.selected;
  if (!selected || selected.candidateId !== d.recommendedProposalId) {
    return nonRecommend("not_ready", "選択された案が確定していません", null);
  }

  const rank = ACTION_RANK[intended];
  const participantIds = d.impact.map((e) => e.participantId);
  const multiParticipant = participantIds.length >= 2;
  const overnight = selected.timeWindow?.kind === "range";
  const uncertaintyHigh = selected.uncertainty === "high";
  const stretchedPrivate = d.impact.some((e) => e.stretchedPrivate > 0);

  const riskFlags: ConfirmationReason[] = [];
  const requiredConfirmations: RequiredConfirmation[] = [];
  const detect = (reason: ConfirmationReason, present: boolean, gate: boolean, visibility: RequiredConfirmation["visibility"]) => {
    if (!present) return;
    riskFlags.push(reason);
    if (gate) requiredConfirmations.push({ reason, visibility });
  };

  detect("paid_booking", !!input.policy?.involvesPaidBooking, rank >= 3, "shared");
  detect("long_travel", overnight, rank >= 2, "shared");
  detect("irreversible", !!input.policy?.irreversible, rank >= 2, "shared");
  detect("other_participant_impact", multiParticipant, rank >= 2, "shared");
  detect("high_uncertainty", uncertaintyHigh, rank >= 1, "shared");
  detect("private_constraint_conflict", stretchedPrivate, rank >= 1, "private");

  // ── T11-C7: cancel_weather（天候不確実 × 取消不能 commitment）。**evidence 供給時のみ・既存挙動不変** ──
  //   commitment（schedule_hold 以上）でのみ発火。fit burdenFit/labelFit は触らない（readiness のみ）。
  if (input.cancelWeather) {
    const cw = assessCancelWeatherRisk(input.cancelWeather);
    const commits = rank >= 2; // 提案(propose_plan)は commit でない → 天候 reversal は無関係
    const wvMaterial = (input.cancelWeather.weatherVulnerability ?? 0) >= CANCEL_WEATHER_VULN_THRESHOLD;
    // reserve 時に paid/irreversible が未知 ∧ 天候 material → 取消可逆性を確かめずに booking-ready にさせない
    const bookingUnknown =
      rank >= 3 && (input.policy?.involvesPaidBooking === undefined || input.policy?.irreversible === undefined);
    // shared な天候 reversal 確認: 既知 rigid / 取消柔軟性 未知 / reserve かつ paid・irreversible 未知
    const sharedWeather = commits && (cw.needsConfirmation || cw.needsQuestion || (bookingUnknown && wvMaterial));
    // private リスク許容度のみが押し上げ（shared が立たないときだけ・authoritative 専用）
    const privateWeather = commits && !sharedWeather && cw.privateElevation;
    if (sharedWeather) {
      riskFlags.push("weather_reversal_uncertainty");
      requiredConfirmations.push({ reason: "weather_reversal_uncertainty", visibility: "shared" });
    } else if (privateWeather) {
      riskFlags.push("weather_reversal_uncertainty");
      requiredConfirmations.push({ reason: "weather_reversal_uncertainty", visibility: "private" });
    }
  }

  const state: ReadinessResult["state"] = requiredConfirmations.length > 0 ? "needs_confirmation" : "ready_to_propose";
  // schedule_hold 以上は共有資源を commit → 参加者承認が必要
  const participantApprovalRequired = rank >= 2 && multiParticipant ? participantIds : [];

  const rationale = buildRecommendRationale(d, intended, state, requiredConfirmations, stretchedPrivate);

  return {
    authoritative: true,
    state,
    actionKind: intended,
    requiredConfirmations,
    riskFlags,
    blockers: d.blockers,
    pendingQuestion: null,
    participantApprovalRequired,
    rationale,
    inputError: null,
  };
}

function buildRecommendRationale(
  d: DecisionResult,
  intended: ActionKind,
  state: ReadinessResult["state"],
  confirmations: RequiredConfirmation[],
  stretchedPrivate: boolean,
): ViewerScopedRationale {
  const forParticipant = inheritForParticipant(d);
  // ★ shared 文には shared 確認理由のみ。private 確認理由は出さない。
  const sharedReasons = confirmations.filter((c) => c.visibility === "shared").map((c) => c.reason);
  let shared: string;
  if (state === "ready_to_propose") {
    shared = `この案を${ACTION_JA[intended]}できます。`;
  } else {
    shared = sharedReasons.length > 0
      ? `${ACTION_JA[intended]}の前に確認が必要です（${sharedReasons.join("・")}）。`
      : `${ACTION_JA[intended]}の前に確認が必要です。`;
  }
  // private 衝突は当人にのみ（誰かは impact で判別）
  if (stretchedPrivate) {
    for (const e of d.impact) {
      if (e.stretchedPrivate > 0) {
        forParticipant[e.participantId] = [forParticipant[e.participantId], "あなたの希望と一部ぶつかる点があります（確認）"].filter(Boolean).join("・");
      }
    }
  }
  return { shared, forParticipant };
}

// ─────────────────────────────────────────────────────────────────────────────
// public: shared 射影（M5・private を漏らさない）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * shared ビュー: 相手にも見せてよい **display/提案専用** の形。
 *   - private 確認/リスク（private_constraint_conflict）を除去。
 *   - **private 理由のみで needs_confirmation だった場合は ready_to_propose に戻す**
 *     （private な確認は当人側で扱う・相手には ready に見える）。
 *   - rationale.forParticipant 全削除。
 *
 * ★ T6.1: 戻り値は `authoritative: false`。**この結果を実行権限として使ってはならない**。
 *   shared 上 `ready_to_propose` でも、schedule/reserve/book の可否は必ず authoritative=true の
 *   元の `assessReadiness` 結果（= `hasActionAuthority`）で判定する。private 確認はそこで gate され続ける。
 */
export function toSharedReadinessView(r: ReadinessResult): ReadinessResult {
  const sharedConfirmations = r.requiredConfirmations.filter((c) => c.visibility === "shared");
  // ★ riskFlags の shared 射影: 本質的に private な理由（private_constraint_conflict）に加え、
  //   **private 確認としてのみ存在する理由**（例: private リスク許容度のみが押し上げた
  //   weather_reversal_uncertainty）も除去する。名前固定の filter では visibility 依存の
  //   理由（同名で shared/private 両義）を取りこぼすため、確認の visibility から導出する。
  const sharedConfirmedReasons = new Set(sharedConfirmations.map((c) => c.reason));
  const privateOnlyReasons = new Set(
    r.requiredConfirmations.filter((c) => c.visibility === "private").map((c) => c.reason),
  );
  const sharedRiskFlags = r.riskFlags.filter(
    (f) => f !== "private_constraint_conflict" && !(privateOnlyReasons.has(f) && !sharedConfirmedReasons.has(f)),
  );
  const state: ReadinessResult["state"] =
    r.state === "needs_confirmation" && sharedConfirmations.length === 0 ? "ready_to_propose" : r.state;
  return {
    ...r,
    authoritative: false, // ★ display 専用・実行権限ではない
    state,
    requiredConfirmations: sharedConfirmations,
    riskFlags: sharedRiskFlags,
    rationale: { shared: r.rationale.shared, forParticipant: {} },
  };
}

/**
 * ★ T6.1 実行権限の唯一の判定口（schedule/reserve/book してよいか）。
 *   - **authoritative=false（shared 射影）からは決して true を返さない** → private 確認を隠した
 *     display が実行権限に化けない。
 *   - state が ready_to_propose かつ未確認の requiredConfirmations が無いときのみ true。
 */
export function hasActionAuthority(r: ReadinessResult): boolean {
  return r.authoritative === true && r.state === "ready_to_propose" && r.requiredConfirmations.length === 0;
}
