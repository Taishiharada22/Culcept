"use client";

/**
 * Stage 4 L4-a → B-1 — 上部レイヤー本番マウント entry point
 *
 * 正本: layout plan v0.3 §7.1 / Core UX v1.1 §3.1 上部レイヤー位置
 *
 * `presenceExecutorEnabled` flag OFF (既定) で **null を返す** = 既存 ChatClient 完全不変。
 * flag ON (Stage 4 L4-l flip 後) で本番上部レイヤーを mount。
 *
 * 本 phase (B-1, 2026-04-29):
 *   - L4-a placeholder text を削除
 *   - usePresenceExecutor (本番版) を mount
 *   - UpperLayerStateRenderer (state → S0-S8 component switch) を表示
 *   - UpperLayerShell が本物の ModeSwitcher を内蔵 (L4-f 本番化)
 *
 * B-1 で動作するもの:
 *   - state header の表示 (S0 固定、signal なしで初期 state)
 *   - ModeSwitcher の click → modeReducer dispatch → UI 反映 (manual switch)
 *
 * B-1 で動作しないもの (B-2 以降で接続):
 *   - signal detection (ChatClient interaction watcher → exec.fire.*)
 *   - state 遷移 (S0 → S1 → ... 経路は signal 経路接続後)
 *   - Memory surface / Urgent layer (L4-g / L4-h)
 *
 * 不可侵 (plan §0.4 / §7 全体):
 *   - flag OFF で既存 ChatClient render が 1 bit も変わらない
 *   - production behavior 不変原則: flag OFF で旧経路維持
 *   - ChatClient.tsx は touch しない (props 影響ゼロ)
 */

import { COALTER_FLAGS } from "@/lib/coalter/flags";
import { usePresenceExecutor } from "./hooks/usePresenceExecutor";
import UpperLayerStateRenderer from "./states/UpperLayerStateRenderer";
import type { PresenceMode } from "@/lib/coalter/presence/types";

/**
 * 本番上部レイヤー mount entry point。flag OFF で null。
 *
 * 本 component は server / client いずれでも render 可。
 * flag は env 経由で SSR / CSR 両方で同じ値を返す (NEXT_PUBLIC_ inline、
 * 2026-04-29 修正で direct property access)。
 */
export default function UpperLayerMount() {
  if (!COALTER_FLAGS.presenceExecutorEnabled) {
    return null;
  }
  return <UpperLayerMountActive />;
}

/**
 * flag ON 時の上部レイヤー本体。
 *
 * usePresenceExecutor で thread scope state を保持し、UpperLayerStateRenderer
 * が現在の state (B-1 では S0 固定) に応じた component を render する。
 * ModeSwitcher は UpperLayerShell 内に embedded、click で modeReducer dispatch。
 *
 * thread scope: 本 component instance は ChatClient (talk thread page) の子として
 * mount され、useReducer の state は thread page lifetime で独立 (page 遷移で reset、
 * persistence なし、CEO 確定 2026-04-29)。
 */
function UpperLayerMountActive() {
  const exec = usePresenceExecutor();

  const handleModeSwitch = (target: PresenceMode) => {
    exec.dispatch.modeEvent({ type: "MANUAL_SWITCH", target });
  };

  return (
    <UpperLayerStateRenderer
      state={exec.state.presence.state}
      mode={exec.state.mode}
      onSwitchMode={handleModeSwitch}
    />
  );
}
