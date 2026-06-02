/**
 * Reality Control OS — Hysteresis（Slice 2F / INV-6）
 *
 * 通知の flapping を防ぐ純粋状態機械（live 実装前の契約）。
 * fire(X) / deadband(Y<X) / dwell / latch(deadline) / clear。DB・push 不要。
 *
 * 制約: 純関数のみ（時刻は呼び出し側が分で渡す）。
 */

export interface HysteresisInput {
  readonly risk: number; // 0..1 現在の破綻リスク
  readonly nowMin: number;
  readonly fireThreshold: number; // X
  readonly clearThreshold: number; // Y（< X、deadband）
  readonly dwellMin: number; // X 超え継続要求（spike で撃たない）
  readonly minReAlertMin: number; // 再通知間隔
  readonly deadlineMin: number; // この時刻以降は latch
  readonly latchWindowMin?: number; // deadline の何分前から latch（既定 0）
}

export interface HysteresisState {
  readonly firing: boolean;
  readonly firstExceedAt: number | null; // X を超え始めた時刻
  readonly lastFireAt: number | null;
  readonly latched: boolean;
}

export const INITIAL_HYSTERESIS: HysteresisState = {
  firing: false,
  firstExceedAt: null,
  lastFireAt: null,
  latched: false,
};

export interface HysteresisStep {
  readonly state: HysteresisState;
  readonly fire: boolean; // この step で新規発火したか
}

/** 1 step 進める。新規発火時のみ fire=true。 */
export function stepHysteresis(prev: HysteresisState, input: HysteresisInput): HysteresisStep {
  const { risk, nowMin, fireThreshold: X, clearThreshold: Y, dwellMin, minReAlertMin, deadlineMin } = input;
  const latchWindow = input.latchWindowMin ?? 0;
  const nearDeadline = nowMin >= deadlineMin - latchWindow;

  let firing = prev.firing;
  let firstExceedAt = prev.firstExceedAt;
  let lastFireAt = prev.lastFireAt;
  let latched = prev.latched;
  let fire = false;

  // dwell 追跡: X 超え開始時刻
  if (risk >= X) {
    if (firstExceedAt === null) firstExceedAt = nowMin;
  } else {
    firstExceedAt = null;
  }

  // deadline 近傍で latch（一度でも危険なら引っ込めない）
  if (nearDeadline && (firing || risk >= Y)) latched = true;

  if (!firing) {
    const dwellOk = firstExceedAt !== null && nowMin - firstExceedAt >= dwellMin;
    const reAlertOk = lastFireAt === null || nowMin - lastFireAt >= minReAlertMin;
    if (dwellOk && reAlertOk) {
      firing = true;
      fire = true;
      lastFireAt = nowMin;
    }
  } else {
    // 解除は risk≤Y かつ latch されていない時のみ（deadband）
    if (risk <= Y && !latched) {
      firing = false;
      firstExceedAt = null;
    }
  }

  return { state: { firing, firstExceedAt, lastFireAt, latched }, fire };
}
