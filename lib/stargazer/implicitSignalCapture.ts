// lib/stargazer/implicitSignalCapture.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Implicit Signal Capture — TikTok的な暗黙シグナル収集
//
// 既存の useSignalCollector が8シグナルを収集。
// これに6種の新シグナルを追加し、合計14種に拡充。
//
// TikTokとの差: TikTokは動画視聴の暗黙シグナル（視聴時間、リプレイ等）
// Aneurasync: テキストベース質問の暗黙シグナル（迷い、位置バイアス等）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. 新シグナル型定義
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ImplicitSignals {
  /** スクロール速度（px/ms）— 衝動性/慎重さ */
  scrollVelocity: number | null;
  /** 回答位置バイアス — 常に1番目を選ぶ傾向（0-1、1=常に1番目） */
  positionBias: number;
  /** セッションリズム — Q間の時間が加速(-1)→減速(+1)のトレンド */
  sessionRhythm: number;
  /** インサイト滞在時間（ms）— 自己参照処理の深さ */
  insightDwellTimeMs: number;
  /** 戻り読み回数 — 完璧主義/確認欲求 */
  rereadCount: number;
  /** デバイス傾き — リラックス度（0=直立、1=寝転がり） */
  deviceTilt: number | null;
}

/** セッション全体の暗黙シグナル統計 */
export interface SessionImplicitProfile {
  signals: ImplicitSignals;
  /** 暗黙シグナルから推定される性格特性 */
  impliedTraits: ImpliedTrait[];
  /** シグナルの品質（0-1） */
  signalQuality: number;
}

export interface ImpliedTrait {
  trait: string;
  value: number; // -1 ~ 1
  confidence: number; // 0-1
  source: string; // どのシグナルから推定されたか
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. シグナル収集
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** スクロール速度を計測 */
export function measureScrollVelocity(events: { y: number; time: number }[]): number | null {
  if (events.length < 2) return null;
  let totalDelta = 0;
  let totalTime = 0;
  for (let i = 1; i < events.length; i++) {
    totalDelta += Math.abs(events[i].y - events[i - 1].y);
    totalTime += events[i].time - events[i - 1].time;
  }
  return totalTime > 0 ? totalDelta / totalTime : null;
}

/** 回答位置バイアスを計算 */
export function calculatePositionBias(
  selectedIndices: number[],
  optionCounts: number[],
): number {
  if (selectedIndices.length === 0) return 0;
  const firstOptionSelections = selectedIndices.filter(
    (idx, i) => idx === 0 && optionCounts[i] > 1,
  ).length;
  const totalQuestions = selectedIndices.filter(
    (_, i) => optionCounts[i] > 1,
  ).length;
  return totalQuestions > 0 ? firstOptionSelections / totalQuestions : 0;
}

/** セッションリズムを計算 */
export function calculateSessionRhythm(responseTimes: number[]): number {
  if (responseTimes.length < 3) return 0;
  const mid = Math.floor(responseTimes.length / 2);
  const firstHalfAvg = responseTimes.slice(0, mid).reduce((s, t) => s + t, 0) / mid;
  const secondHalfAvg = responseTimes.slice(mid).reduce((s, t) => s + t, 0) / (responseTimes.length - mid);
  if (firstHalfAvg === 0) return 0;
  const ratio = (secondHalfAvg - firstHalfAvg) / firstHalfAvg;
  return Math.max(-1, Math.min(1, ratio));
}

/** デバイス傾きの取得（DeviceOrientation API） */
export function setupDeviceTiltCapture(
  callback: (tilt: number) => void,
): (() => void) | null {
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
    return null;
  }
  const handler = (event: DeviceOrientationEvent) => {
    const beta = event.beta ?? 0; // -180 ~ 180, 0=直立
    // 0-30° = 直立(0), 30-60° = やや傾き(0.3-0.6), 60-90° = 寝転がり(0.6-1.0)
    const tilt = Math.min(1, Math.max(0, (Math.abs(beta) - 30) / 60));
    callback(tilt);
  };
  window.addEventListener("deviceorientation", handler);
  return () => window.removeEventListener("deviceorientation", handler);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. 性格特性の推定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function inferTraitsFromSignals(signals: ImplicitSignals): ImpliedTrait[] {
  const traits: ImpliedTrait[] = [];

  // スクロール速度 → 衝動性
  if (signals.scrollVelocity !== null) {
    const impulsivity = signals.scrollVelocity > 1.5 ? 0.6 : signals.scrollVelocity > 0.8 ? 0.2 : -0.3;
    traits.push({ trait: "impulsivity", value: impulsivity, confidence: 0.5, source: "scrollVelocity" });
  }

  // 位置バイアス → 順応性
  if (signals.positionBias > 0.6) {
    traits.push({ trait: "conformity", value: 0.5, confidence: 0.6, source: "positionBias" });
  } else if (signals.positionBias < 0.2) {
    traits.push({ trait: "independence", value: 0.4, confidence: 0.5, source: "positionBias" });
  }

  // セッションリズム → 内省深化/疲労
  if (signals.sessionRhythm > 0.3) {
    traits.push({ trait: "cognitive_fatigue", value: 0.4, confidence: 0.55, source: "sessionRhythm" });
  } else if (signals.sessionRhythm < -0.3) {
    traits.push({ trait: "introspection_acceleration", value: 0.5, confidence: 0.6, source: "sessionRhythm" });
  }

  // インサイト滞在時間 → 自己参照の深さ
  if (signals.insightDwellTimeMs > 8000) {
    traits.push({ trait: "deep_self_reference", value: 0.7, confidence: 0.65, source: "insightDwellTime" });
  } else if (signals.insightDwellTimeMs < 2000) {
    traits.push({ trait: "action_oriented", value: 0.5, confidence: 0.5, source: "insightDwellTime" });
  }

  // 戻り読み → 完璧主義
  if (signals.rereadCount >= 3) {
    traits.push({ trait: "perfectionism", value: 0.6, confidence: 0.6, source: "rereadCount" });
  }

  // デバイス傾き → リラックス度
  if (signals.deviceTilt !== null && signals.deviceTilt > 0.6) {
    traits.push({ trait: "relaxed_state", value: 0.5, confidence: 0.4, source: "deviceTilt" });
  }

  return traits;
}

/**
 * セッション全体の暗黙シグナルプロファイルを構築
 */
export function buildImplicitProfile(signals: ImplicitSignals): SessionImplicitProfile {
  const impliedTraits = inferTraitsFromSignals(signals);
  const signalQuality = [
    signals.scrollVelocity !== null ? 1 : 0,
    signals.positionBias > 0 ? 1 : 0,
    signals.sessionRhythm !== 0 ? 1 : 0,
    signals.insightDwellTimeMs > 0 ? 1 : 0,
    signals.rereadCount > 0 ? 1 : 0,
    signals.deviceTilt !== null ? 1 : 0,
  ].reduce((s, v) => s + v, 0) / 6;

  return { signals, impliedTraits, signalQuality };
}
