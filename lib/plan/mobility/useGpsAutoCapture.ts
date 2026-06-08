/**
 * lib/plan/mobility/useGpsAutoCapture.ts — A1-6b: GPS 自動捕捉の **薄い browser shell**（hook）
 *
 * ★役割: getCurrentPosition の粗い interval sampling + in-memory buffer + visibility 判定 だけを担い、
 *   「いつ candidate を出すか / 何を保存するか」の判定は全て pure core(gpsAutoCaptureCore) に委譲する。
 *   ＝判定ロジックは core の unit test で検証済。本 hook は薄い配線（smoke 検証）。
 *
 * ★安全境界（CEO scope）:
 *   - shouldSampleGps(gate) が false（flag OFF / opt-in 非 granted / permission 非 granted）なら **何もしない**。
 *   - sampling は **foreground のみ**（isVisible() が false なら skip）。getCurrentPosition のみ（watchPosition 不使用）。
 *   - raw 座標は **in-memory buffer(ref)** のみ・**永続しない**（save は confirm 後に derived のみ）。
 *   - position/permission error は **fail-open no-op**（throw しない）。
 *   - 自動保存しない（candidate を出すだけ）。confirm で derived MovementEvent 保存・dismiss で破棄（再 prompt しない）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { MovementDetectorConfig, PositionSample } from "@/lib/plan/mobility/movementEventDetector";
import { recordMovementEvent, loadMovementEvent } from "@/lib/plan/mobility/movementEventStore";
import {
  buildCaptureEvent,
  pickCaptureCandidate,
  shouldSampleGps,
  type CaptureCandidate,
  type CaptureLegContext,
  type GpsCaptureGate,
} from "@/lib/plan/mobility/gpsAutoCaptureCore";

/** getCurrentPosition の最小シグネチャ（test 注入用）。 */
type GetCurrentPositionFn = (
  success: (pos: { coords: { latitude: number; longitude: number; accuracy: number } }) => void,
  error: () => void,
  options?: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number },
) => void;

export interface UseGpsAutoCaptureOptions {
  readonly gate: GpsCaptureGate;
  readonly legs: readonly CaptureLegContext[];
  readonly dayKey: string;
  readonly intervalMs?: number;
  readonly detectorConfig?: MovementDetectorConfig;
  /** test/safety 注入。既定 navigator.geolocation.getCurrentPosition。 */
  readonly getCurrentPosition?: GetCurrentPositionFn;
  /** test/safety 注入。既定 () => !document.hidden（foreground 判定）。 */
  readonly isVisible?: () => boolean;
  /** test 注入。既定 Date.now。 */
  readonly now?: () => number;
}

export interface UseGpsAutoCaptureResult {
  readonly candidate: CaptureCandidate | null;
  readonly confirm: () => void;
  readonly dismiss: () => void;
}

const DEFAULT_INTERVAL_MS = 180_000; // 3 分（粗い・電池配慮）
const MAX_BUFFER = 200;

export function useGpsAutoCapture(opts: UseGpsAutoCaptureOptions): UseGpsAutoCaptureResult {
  const bufferRef = useRef<PositionSample[]>([]);
  const dismissedRef = useRef<Set<string>>(new Set());
  const [candidate, setCandidate] = useState<CaptureCandidate | null>(null);
  const [recordTick, setRecordTick] = useState(0);

  // 最新値を ref に持ち effect の再生成を避ける（sampling 起動条件だけで effect を回す）。
  const legsRef = useRef(opts.legs);
  legsRef.current = opts.legs;
  const dayKeyRef = useRef(opts.dayKey);
  dayKeyRef.current = opts.dayKey;
  const detectorConfigRef = useRef(opts.detectorConfig);
  detectorConfigRef.current = opts.detectorConfig;
  const nowRef = useRef(opts.now);
  nowRef.current = opts.now;

  const recompute = useCallback(() => {
    const dk = dayKeyRef.current;
    setCandidate(
      pickCaptureCandidate({
        legs: legsRef.current,
        samples: bufferRef.current,
        isRecorded: (legKey) => loadMovementEvent(dk, legKey) != null,
        isDismissed: (legKey) => dismissedRef.current.has(legKey),
        detectorConfig: detectorConfigRef.current,
      }),
    );
  }, []);

  const sampling = shouldSampleGps(opts.gate);
  const getPos = opts.getCurrentPosition;
  const isVisible = opts.isVisible;
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;

  useEffect(() => {
    if (!sampling) {
      setCandidate(null); // ★OFF/非許可: 完全 no-op（候補も出さない）
      return;
    }
    let active = true;
    const visible = isVisible ?? (() => typeof document === "undefined" || !document.hidden);
    const getCurrentPosition: GetCurrentPositionFn =
      getPos ??
      ((success, error, options) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(success, error, options);
      });
    const nowFn = nowRef.current ?? (() => Date.now());
    const sample = () => {
      if (!visible()) return; // ★foreground only
      getCurrentPosition(
        (pos) => {
          if (!active) return;
          const c = pos.coords;
          bufferRef.current = [
            ...bufferRef.current,
            { at: nowFn(), lat: c.latitude, lng: c.longitude, accuracyM: c.accuracy },
          ].slice(-MAX_BUFFER); // in-memory のみ・永続しない
          recompute();
        },
        () => {
          /* ★permission/position error は fail-open no-op */
        },
        { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
      );
    };
    sample();
    const id = setInterval(sample, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [sampling, getPos, isVisible, intervalMs, recompute]);

  const confirm = useCallback(() => {
    setCandidate((cur) => {
      if (cur) {
        const nowFn = nowRef.current ?? (() => Date.now());
        recordMovementEvent(dayKeyRef.current, cur.legKey, buildCaptureEvent(cur, nowFn()), {
          optInGranted: true, // sampling 中＝opt-in granted（shouldSampleGps が保証）
          sensitive: false, // candidate は非 sensitive（evaluate が block 済）
        });
        setRecordTick((t) => t + 1);
      }
      return null;
    });
  }, []);

  const dismiss = useCallback(() => {
    setCandidate((cur) => {
      if (cur) dismissedRef.current.add(cur.legKey); // このセッションは再 prompt しない
      return null;
    });
  }, []);

  // confirm 後（recordTick）に再評価＝記録済 leg は二度と prompt しない。
  useEffect(() => {
    if (sampling) recompute();
  }, [recordTick, sampling, recompute]);

  return { candidate, confirm, dismiss };
}
