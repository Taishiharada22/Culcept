/**
 * CoAlter Stage 4 L4-b — Production Signal Bus
 *
 * 正本: layout plan v0.3 §7.2 / runtime contract §1.3 経路 map
 *
 * 本番経路で発火された PresenceSignal を集約する singleton bus。
 * flag `presenceExecutorEnabled` ON 時のみ wiring 経路から signal が流入する。
 * flag OFF では bus は空のまま (production behavior 不変)。
 *
 * 不可侵 (runtime §1.3 / §1.7):
 *   - signal は presence.state.* bus 経由のみ
 *   - executor.understanding.* との直接結合禁止 (signalAdapter 経由のみ)
 *   - presence.state.* 購読者は UI renderer のみ (executor 逆方向結合禁止)
 *
 * 設計:
 *   - in-memory observable (subscribe/unsubscribe pattern)
 *   - L4-l flip 時に UpperLayerMount 内の executor が subscribe
 *   - L4-b の段階では subscriber 0 でも fire 可 (no-op、副作用ゼロ)
 *
 * Stage 4 中は flag OFF 固定。L4-l flip 後のみ ON。
 */

import type { PresenceSignal } from "./types";

type SignalListener = (signal: PresenceSignal) => void;

const listeners: Set<SignalListener> = new Set();
const recentSignals: PresenceSignal[] = [];
const RECENT_SIGNAL_LIMIT = 100;

/**
 * Signal を bus に publish。
 *
 * 本関数は flag check しない。呼び出し側 (production wiring) で flag check 済の前提。
 * subscriber 0 でも safe。
 */
export function publishPresenceSignal(signal: PresenceSignal): void {
  recentSignals.push(signal);
  if (recentSignals.length > RECENT_SIGNAL_LIMIT) {
    recentSignals.splice(0, recentSignals.length - RECENT_SIGNAL_LIMIT);
  }
  for (const listener of listeners) {
    try {
      listener(signal);
    } catch {
      // listener 例外は他 listener に伝播させない (fail-open)
    }
  }
}

/**
 * Signal bus の購読。L4-l flip 時に UpperLayerMount 内の executor が subscribe。
 *
 * 戻り値は unsubscribe 関数。
 */
export function subscribePresenceSignal(listener: SignalListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 最近 publish された signal の参照 (debug / test 用)。
 *
 * 本関数は read-only snapshot。production logic では使わない。
 */
export function getRecentSignals(): ReadonlyArray<PresenceSignal> {
  return [...recentSignals];
}

/**
 * Test reset 用 (production logic では使わない)。
 */
export function __resetSignalBus(): void {
  listeners.clear();
  recentSignals.length = 0;
}
