"use client";

/**
 * Stage 4 L4-b/B-1 — UpperLayerStateRenderer (本番版)
 *
 * 正本: layout plan v0.3 §7.2
 *
 * preview `app/(dev)/coalter-preview/upper-layer/page.tsx` 内 inline switch logic
 * (S0-S8 → component) を本番 location に抽出。
 *
 * 責務:
 *   - PresenceState (S0-S8) → 対応する state component の写像
 *   - mode + onSwitchMode を各 state component に流す (UpperLayerShell が ModeSwitcher
 *     を内蔵するため、各 state component は shell 経由で透過)
 *
 * test 容易性のため pure mapping (`mapStateToStatusLabel` / `mapStateToComponent`)
 * を export。React render なしで mapping を unit test できる。
 *
 * 不変原則:
 *   - 全 9 状態 (S0-S8) を網羅的に switch (default ケースで type 安全に compile error)
 *   - mode override (Daily / Travel 別 component) は B-1 scope 外、B-2 以降で追加
 */

import S0Observing from "./S0Observing";
import S1Approaching from "./S1Approaching";
import S2Opening from "./S2Opening";
import S3Awaiting from "./S3Awaiting";
import S4Understanding from "./S4Understanding";
import S5Bridging from "./S5Bridging";
import S6ReadyForProposal from "./S6ReadyForProposal";
import S7ProposalShown from "./S7ProposalShown";
import S8Cooldown from "./S8Cooldown";
import StateAriaWrapper from "./StateAriaWrapper";
import type { UpperLayerStatusLabel } from "./UpperLayerShell";
import type { PresenceMode, PresenceState } from "@/lib/coalter/presence/types";

/**
 * 各 state component の共通 props 型 (mode + onSwitchMode のみ)。
 *
 * B-1 では mode 切替が唯一のユーザー操作 → 全 state component で共通の signature。
 * B-2 以降で signal dispatch / Chip click 等が加わったら拡張する。
 */
interface StateComponentProps {
  mode: PresenceMode;
  onSwitchMode: (target: PresenceMode) => void;
}

/**
 * PresenceState → state component の type 安全な写像。
 *
 * 各 component は mode + onSwitchMode を受け取って UpperLayerShell に流す。
 * test では本 mapping function を直接 invoke して check できる。
 */
export function mapStateToComponent(
  state: PresenceState,
): React.ComponentType<StateComponentProps> {
  switch (state) {
    case "S0":
      return S0Observing;
    case "S1":
      return S1Approaching;
    case "S2":
      return S2Opening;
    case "S3":
      return S3Awaiting;
    case "S4":
      return S4Understanding;
    case "S5":
      return S5Bridging;
    case "S6":
      return S6ReadyForProposal;
    case "S7":
      return S7ProposalShown;
    case "S8":
      return S8Cooldown;
    // exhaustive check: PresenceState を増やしたら compile error
  }
}

/**
 * PresenceState → UpperLayerStatusLabel の写像。
 *
 * preview state component の statusLabel を中央集約 (重複排除 + test 容易化)。
 * 9 状態 → 7 label (S0/S1 = "見守り中", S2/S5/S7 = "発話中" etc.)。
 */
export function mapStateToStatusLabel(
  state: PresenceState,
): UpperLayerStatusLabel {
  switch (state) {
    case "S0":
    case "S1":
      return "見守り中";
    case "S2":
    case "S5":
    case "S7":
      return "発話中";
    case "S3":
      return "返答待ち";
    case "S4":
      return "理解更新中";
    case "S6":
      return "提案準備中";
    case "S8":
      return "退出";
  }
}

export interface UpperLayerStateRendererProps {
  state: PresenceState;
  mode: PresenceMode;
  onSwitchMode: (target: PresenceMode) => void;
}

/**
 * Stage 4 L4-k (2026-04-30): StateAriaWrapper で全 state component をラップし
 * a11y 属性 (role / aria-label / aria-live) を統一。UpperLayerShell の
 * role="region" は削除して二重 region を回避。
 *
 * aria-live: polite 固定 (CEO 確定 2026-04-30、UrgentLayer の role=alert /
 * aria-live=assertive と分離して二重通知を避ける、isUrgent prop は渡さない)。
 */
export default function UpperLayerStateRenderer({
  state,
  mode,
  onSwitchMode,
}: UpperLayerStateRendererProps) {
  const Component = mapStateToComponent(state);
  return (
    <StateAriaWrapper state={state} mode={mode}>
      <Component mode={mode} onSwitchMode={onSwitchMode} />
    </StateAriaWrapper>
  );
}
