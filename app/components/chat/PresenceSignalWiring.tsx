"use client";

/**
 * Stage 4 L4-b — Presence Signal Wiring
 *
 * 正本: layout plan v0.3 §7.2 / runtime contract §1.1 / §1.3
 *
 * ChatClient のメインチャット発話を監視し、`presenceExecutorEnabled` flag ON 時のみ
 * signalAdapter 経由で PresenceSignal を生成、production signal bus へ publish。
 *
 * 不可侵原則:
 *   - メインチャット本文の UI には 1 bit も影響しない (本 component は signal 発火のみ)
 *   - flag OFF で本 component は no-op (subscribe / publish ゼロ)
 *   - executor.understanding.* との直接結合禁止 (signalAdapter 経由のみ、§1.7-2)
 *
 * 設計:
 *   - メインチャット message 配列を props で受け取る
 *   - useEffect で message 増分を検出 → adaptImplicit で soft signal 生成 → bus へ publish
 *   - flag OFF で useEffect 内 publish call site が実行されない (early return)
 */

import { useEffect, useRef } from "react";

import { COALTER_FLAGS } from "@/lib/coalter/flags";
import { adaptImplicit } from "@/lib/coalter/presence/signalAdapter";
import { publishPresenceSignal } from "@/lib/coalter/presence/productionSignalBus";

/**
 * 本 component が監視する message の最低限 shape。
 * ChatClient.tsx の Message 型と互換。
 */
export interface ObservedMessage {
  id: string;
  /** ISO 8601 or epoch ms (どちらでも、本 wiring は順序維持のみで使用) */
  createdAt?: number | string;
}

export interface PresenceSignalWiringProps {
  /** メインチャット message 配列 (時系列、最新が末尾) */
  messages: ReadonlyArray<ObservedMessage>;
  /**
   * 暗黙 signal の score 計算 hook (実装側で関係 signal 強度を渡す)。
   * 未指定なら default heuristic (発話量に応じた緩い soft score)。
   */
  computeSoftScore?: (messages: ReadonlyArray<ObservedMessage>) => number;
}

const DEFAULT_SOFT_SCORE = 0.4;

/**
 * 純な観測 component。flag OFF で全処理 skip。
 *
 * 戻り値は null (DOM 影響ゼロ)。React tree に存在するが render 出力なし。
 */
export default function PresenceSignalWiring({
  messages,
  computeSoftScore,
}: PresenceSignalWiringProps) {
  const lastSeenIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!COALTER_FLAGS.presenceExecutorEnabled) {
      // flag OFF: signal 発火しない。state も更新しない。
      return;
    }
    if (messages.length === 0) return;

    const last = messages[messages.length - 1];
    if (last.id === lastSeenIdRef.current) return; // 既処理
    lastSeenIdRef.current = last.id;

    const score = computeSoftScore ? computeSoftScore(messages) : DEFAULT_SOFT_SCORE;
    const signal = adaptImplicit({
      softScore: score,
      detectedAt: Date.now(),
      meta: { lastMessageId: last.id },
    });
    publishPresenceSignal(signal);
  }, [messages, computeSoftScore]);

  return null;
}
