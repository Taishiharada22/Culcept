"use client";

/**
 * Stage 4 L4-a → B-1 → B-2 — 上部レイヤー本番マウント entry point
 *
 * 正本: layout plan v0.3 §7.1 / Core UX v1.1 §3.1 上部レイヤー位置
 *
 * `presenceExecutorEnabled` flag OFF (既定) で **null を返す** = 既存 ChatClient 完全不変。
 * flag ON (Stage 4 L4-l flip 後) で本番上部レイヤーを mount。
 *
 * Phase 履歴:
 *   - L4-a: placeholder text のみ
 *   - B-1 (2026-04-29): usePresenceExecutor + UpperLayerStateRenderer + ModeSwitcher 本番化
 *   - B-2 (2026-04-29): UrgentLayer mount + autoRefire block 60s + dismiss handler
 *
 * B-2 で動作するもの:
 *   - usePresenceExecutor が productionSignalBus に subscribe (signal 流入経路確立)
 *   - urgentDecision 計算結果に応じた UrgentLayer の表示 (3 形態: dominant_card /
 *     overlay_banner / inline_cue)
 *   - dismiss tap → 60s autoRefire block (§8.5.4 不可侵: 追加挽留禁止)
 *   - 60s 経過後の自動 unblock
 *
 * B-2 で動作しないもの (B-3 以降で接続):
 *   - Memory surface (L4-g)
 *   - LLM 合成 urgent message (B-2 では category-based static fallback)
 *   - explicit / mention / chip tap signal (B-2 は implicit + critical のみ)
 *
 * 不可侵 (plan §0.4 / §7 全体):
 *   - flag OFF で既存 ChatClient render が 1 bit も変わらない
 *   - production behavior 不変原則
 *   - ChatClient.tsx は touch しない (props 影響ゼロ)
 *   - 自動 urgent 再発火禁止 (§8.5.4 user_dismiss / timeout 後の沈黙ペナルティ禁止)
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { COALTER_FLAGS } from "@/lib/coalter/flags";
import { usePresenceExecutor } from "./hooks/usePresenceExecutor";
import UpperLayerStateRenderer from "./states/UpperLayerStateRenderer";
import UrgentLayer from "./UrgentLayer";
import {
  isUrgentAutoRefireBlocked,
  type UrgentReleasePath,
} from "@/lib/coalter/presence/urgentReleaseLogic";
import type { UrgentCategory } from "@/lib/coalter/presence/urgentTrigger";
import type { PresenceMode } from "@/lib/coalter/presence/types";

/**
 * Urgent fallback message (B-2、static、category-based)。
 *
 * B-2 では LLM 合成 (speechBuilder.buildUrgentSpeech) を接続しない。
 * 後段 phase で LLM 接続時に削除される (transitional fallback)。
 *
 * UI spec §8.5.3 トーン: 警告色・叱責的トーンを使わない、責めない (§6.8 継承)。
 */
const URGENT_FALLBACK_MESSAGES: Record<UrgentCategory, string> = {
  rupture_detected: "ちょっと一息ついてみて",
  dignity_violation: "今は一旦ペースを落とそう",
  safety_concern: "今は無理しないで",
  heat_escalation: "落ち着いて話せそう？",
  asymmetric_overload: "片方ばかり頑張ってない？",
};

/**
 * §8.5.4 autoRefire block 期間 (ms)。
 * dismiss / timeout 後この期間内は自動再発火を block。
 */
export const URGENT_AUTO_REFIRE_BLOCK_MS = 60_000;

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
 * が現在の state に応じた component を render する。UrgentLayer は
 * urgentDecision を読み、autoRefire block を考慮して表示判定。
 *
 * thread scope: 本 component instance は ChatClient (talk thread page) の子として
 * mount され、useReducer / useState の state は thread page lifetime で独立
 * (page 遷移で reset、persistence なし、CEO 確定 2026-04-29)。
 */
function UpperLayerMountActive() {
  const exec = usePresenceExecutor();

  /**
   * 直近 release 情報。null 時は autoRefire block なし。
   *
   * dismiss 等が発生したら release path + timestamp を保持し、§8.5.4 の
   * 60s block を `isUrgentAutoRefireBlocked` で計算する。
   * 60s 経過後に setLastRelease(null) で auto-unblock (下記 useEffect)。
   */
  const [lastRelease, setLastRelease] = useState<{
    path: UrgentReleasePath;
    releasedAt: number;
  } | null>(null);

  /**
   * autoRefire block の auto-unblock。
   *
   * lastRelease 設定後、URGENT_AUTO_REFIRE_BLOCK_MS 経過したら自動的に
   * lastRelease を null に戻す。これがないと 60s 後に urgent decision が
   * 出ても表示されない不具合が発生する。
   */
  useEffect(() => {
    if (lastRelease === null) return;
    const elapsed = Date.now() - lastRelease.releasedAt;
    const remaining = URGENT_AUTO_REFIRE_BLOCK_MS - elapsed;
    if (remaining <= 0) {
      setLastRelease(null);
      return;
    }
    const timer = setTimeout(() => setLastRelease(null), remaining);
    return () => clearTimeout(timer);
  }, [lastRelease]);

  /**
   * 表示用 urgent decision (autoRefire block 反映後)。
   *
   * lastRelease がある場合、isUrgentAutoRefireBlocked で blocked かを判定。
   * blocked なら null (UrgentLayer 内部で null check して何も render しない)。
   *
   * 注意: useMemo の deps に Date.now() は含めない (毎 render 評価される)。
   * lastRelease 自体の変化または urgentDecision の変化で再評価される。
   */
  const visibleUrgentDecision = useMemo(() => {
    if (lastRelease !== null) {
      const blocked = isUrgentAutoRefireBlocked(
        lastRelease.path,
        Date.now() - lastRelease.releasedAt,
        URGENT_AUTO_REFIRE_BLOCK_MS,
      );
      if (blocked) return null;
    }
    return exec.computed.urgentDecision;
  }, [exec.computed.urgentDecision, lastRelease]);

  const urgentMessage = visibleUrgentDecision
    ? URGENT_FALLBACK_MESSAGES[visibleUrgentDecision.category]
    : "";

  const handleModeSwitch = useCallback(
    (target: PresenceMode) => {
      exec.dispatch.modeEvent({ type: "MANUAL_SWITCH", target });
    },
    [exec.dispatch],
  );

  /**
   * Urgent dismiss tap handler。
   *
   * §8.5.4 不可侵: dismiss 後は追加挽留禁止 (= 60s autoRefire block)。
   * §6.8 継承: 「無視した」とカウントしない (silent fade-out)。
   */
  const handleUrgentDismiss = useCallback(() => {
    setLastRelease({ path: "user_dismiss", releasedAt: Date.now() });
  }, []);

  return (
    <>
      <UpperLayerStateRenderer
        state={exec.state.presence.state}
        mode={exec.state.mode}
        onSwitchMode={handleModeSwitch}
      />
      <UrgentLayer
        decision={visibleUrgentDecision}
        message={urgentMessage}
        onDismiss={handleUrgentDismiss}
      />
    </>
  );
}
