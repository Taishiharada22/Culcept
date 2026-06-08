/**
 * lib/plan/mobility/gpsAutoCaptureCore.ts — A1-6b: GPS 自動捕捉の **pure 判定コア**（安全版）
 *
 * ★設計の核心: 安全クリティカルな「いつ sampling するか / いつ確認候補を出すか / 何を保存するか」の
 *   判定を全て pure 関数に集約し、テスト可能にする。browser API（getCurrentPosition/interval/visibility）は
 *   薄い hook(useGpsAutoCapture) に隔離する。＝CEO の test 項目はすべてここで検証できる。
 *
 * ★安全境界（CEO scope・最重要）:
 *   - foreground-only / opt-in granted / OS permission granted のときだけ sampling（shouldSampleGps）。
 *   - raw GPS は **detector 入力の短期 in-memory** のみ（本コアは samples を受けるが永続しない）。store は derived のみ。
 *   - sensitive / readOnly leg は sampling/detector/prompt/store 全て無効（evaluate が即 block）。
 *   - confidence medium 以上 かつ arrival 検出時のみ confirmation candidate（low/null は黙って破棄）。
 *   - 自動保存しない（candidate を作るだけ・保存は user confirm 後に hook/MapTab が record）。
 *   - GPS は候補・manual log が正本（buildCaptureEvent は source="gps"・user 確認前提）。
 *   - flag DAY_REHEARSAL_GPS_CAPTURE_ENABLED 既定 OFF（OFF で shouldSampleGps=false＝完全不変）。
 *   - pure / Date 不使用 / DB・network 不使用。
 */
import {
  detectMovement,
  type DetectedMovement,
  type DetectorAnchorCoord,
  type MovementDetectorConfig,
  type PositionSample,
} from "@/lib/plan/mobility/movementEventDetector";
import {
  buildMovementEventFromDetection,
  type MovementEvent,
  type MovementEventMeta,
} from "@/lib/plan/mobility/movementEventStore";
import type { GeolocationPermissionState } from "@/lib/alter-morning/journey/permissionState";
import type { LocationOptInState } from "@/lib/alter-morning/journey/locationOptIn";
import type { RouteTransportMode } from "@/lib/plan/map/routeMode";

/**
 * ★A1-6b GPS 自動捕捉 有効化フラグ（**default OFF**）。
 * OFF: shouldSampleGps が常に false＝sampling/detect/prompt 全停止＝既存挙動完全不変。
 * ON: dev smoke 用のみ。main activation は smoke PASS 後に CEO 別判断。
 */
export const DAY_REHEARSAL_GPS_CAPTURE_ENABLED = false;

export interface GpsCaptureGate {
  /** DAY_REHEARSAL_GPS_CAPTURE_ENABLED */
  readonly flagEnabled: boolean;
  /** location opt-in の effective state */
  readonly optInState: LocationOptInState;
  /** OS geolocation permission */
  readonly permission: GeolocationPermissionState;
}

/**
 * sampling してよいか（pure）。
 * ★flag ON ∧ opt-in granted ∧ permission granted のときだけ true。
 * それ以外（denied/prompt/unsupported/unavailable・not_asked/snoozed/declined・flag OFF）は false＝no-op。
 */
export function shouldSampleGps(gate: GpsCaptureGate): boolean {
  return gate.flagEnabled === true && gate.optInState === "granted" && gate.permission === "granted";
}

/** 自動捕捉対象 leg の文脈（MapTab が day の各 leg から構築）。 */
export interface CaptureLegContext {
  readonly legKey: string;
  readonly odKey?: string;
  readonly mode?: RouteTransportMode;
  readonly estimateMin?: number | null;
  readonly sensitive: boolean;
  readonly readOnly: boolean;
  readonly fromCoord?: DetectorAnchorCoord | null;
  readonly toCoord?: DetectorAnchorCoord | null;
}

export type CaptureCandidateReason =
  | "ok"
  | "blocked_sensitive"
  | "blocked_readonly"
  | "already_recorded"
  | "dismissed"
  | "no_detection" // sample 不足/精度不良で検出不能
  | "no_arrival" // 到着未検出（到着時のみ prompt）
  | "low_confidence"; // confidence low（黙って破棄）

export interface CaptureCandidate {
  readonly legKey: string;
  readonly detected: DetectedMovement;
  readonly odKey?: string;
  readonly mode?: RouteTransportMode;
  readonly estimateMin?: number | null;
}

/**
 * 1 leg について confirmation candidate を作るか判定（pure）。
 * block 条件（sensitive/readOnly/already/dismissed）→ candidate=null + reason。
 * detector で arrival(medium+) が出たときだけ candidate。low/null/no-arrival は null。
 */
export function evaluateCaptureCandidate(input: {
  readonly leg: CaptureLegContext;
  readonly samples: readonly PositionSample[];
  readonly alreadyRecorded: boolean;
  readonly dismissed: boolean;
  readonly detectorConfig?: MovementDetectorConfig;
}): { candidate: CaptureCandidate | null; reason: CaptureCandidateReason } {
  const { leg } = input;
  if (leg.sensitive) return { candidate: null, reason: "blocked_sensitive" }; // ★sensitive blackout
  if (leg.readOnly) return { candidate: null, reason: "blocked_readonly" }; // ★過去 leg は prompt しない
  if (input.alreadyRecorded) return { candidate: null, reason: "already_recorded" };
  if (input.dismissed) return { candidate: null, reason: "dismissed" };

  const detected = detectMovement(
    input.samples,
    { from: leg.fromCoord, to: leg.toCoord },
    input.detectorConfig,
  );
  if (!detected) return { candidate: null, reason: "no_detection" };
  if (detected.actualArrivalAtMs == null) return { candidate: null, reason: "no_arrival" };
  if (detected.confidence === "low") return { candidate: null, reason: "low_confidence" }; // ★medium+ のみ

  return {
    candidate: {
      legKey: leg.legKey,
      detected,
      odKey: leg.odKey,
      mode: leg.mode,
      estimateMin: leg.estimateMin,
    },
    reason: "ok",
  };
}

/**
 * day の複数 leg から、確認すべき最良 candidate を 1 つ選ぶ（pure）。
 * ok candidate のうち **到着が最も新しい**もの（＝直近に完了した leg）を返す。無ければ null。
 */
export function pickCaptureCandidate(input: {
  readonly legs: readonly CaptureLegContext[];
  readonly samples: readonly PositionSample[];
  readonly isRecorded: (legKey: string) => boolean;
  readonly isDismissed: (legKey: string) => boolean;
  readonly detectorConfig?: MovementDetectorConfig;
}): CaptureCandidate | null {
  let best: CaptureCandidate | null = null;
  for (const leg of input.legs) {
    const { candidate } = evaluateCaptureCandidate({
      leg,
      samples: input.samples,
      alreadyRecorded: input.isRecorded(leg.legKey),
      dismissed: input.isDismissed(leg.legKey),
      detectorConfig: input.detectorConfig,
    });
    if (!candidate) continue;
    const arr = candidate.detected.actualArrivalAtMs ?? 0;
    const bestArr = best?.detected.actualArrivalAtMs ?? -1;
    if (arr > bestArr) best = candidate;
  }
  return best;
}

/** confirm 時に保存する derived MovementEvent を作る（pure・source="gps"・raw 座標を含まない）。 */
export function buildCaptureEvent(candidate: CaptureCandidate, completedAtMs: number): MovementEvent {
  const meta: MovementEventMeta = {
    ...(candidate.mode !== undefined ? { mode: candidate.mode } : {}),
    ...(candidate.odKey !== undefined ? { odKey: candidate.odKey } : {}),
    ...(candidate.estimateMin !== undefined ? { estimateMin: candidate.estimateMin } : {}),
  };
  return buildMovementEventFromDetection(candidate.detected, completedAtMs, meta);
}
