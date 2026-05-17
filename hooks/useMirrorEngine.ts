/**
 * CoAlter AOO Phase B B-5a — useMirrorEngine hook (shadow mode integration)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §3 / §10.8
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2.5
 *
 * 役割 (B-5a 段階):
 *   React hook として MirrorHost から呼ばれ、**shadow mode** で engine を実行する。
 *
 *   "shadow mode" = engine 走るが **visible 出力なし**:
 *     - flag OFF → engine 一切呼ばない (early return)
 *     - flag ON → engine 呼ぶ + diagnostic snapshot に記録 + debug global install
 *     - MIRROR_CANDIDATE が返っても visible 出力なし (B-5b で実装)
 *
 *   呼出 lifecycle (B-5a):
 *     - mount 時に 1 回 (useEffect with empty deps)
 *     - 同 mount 中の再実行なし
 *     - 再 mount (conversation 切替 / page navigation) で再実行
 *
 * 4 層 flag gating defense (env 漏れ対策):
 *   L1: env scope (branch-scoped Preview only、B-5c で CEO 手動)
 *   L2: env value strict parser (B-1 mirror flag strict)
 *   L3: MirrorHost flag OFF → null-render (early)
 *   L4: **本 hook: flag OFF → engine 一切呼ばない (extra guard)**
 *
 * 設計原則:
 *   - **mount lifecycle**: useEffect with empty deps (mount 時 1 回のみ)
 *   - **early return on flag OFF**: engine / adapter / diagnostic 一切 invocation なし
 *   - **channelLock 経由**: mutex で同 cycle 内重複実行を防止 (test pattern)
 *   - **diagnostic snapshot**: redacted entry を session-local store に push
 *   - **debug global install**: 二重 flag check 経由で `window.__coalterMirrorDiagnostic`
 *   - **B-5a では visible 出力なし**: MIRROR_CANDIDATE 取れても何も表示しない
 *
 * No-Effect Contract:
 *   - I/O / network / storage / DOM event / timer / LLM 一切なし
 *   - module-level state (sleepStore / frequencyCap / channelLock / diagnosticSnapshot) のみ更新
 *   - PII 受理なし (engineAdapter 経由で型レベル保護)
 *
 * 不可侵境界 (B-0 §9):
 *   - 既存 presence layer / observer layer / chat layer touch なし
 *   - B-1 〜 B-4d zero diff (read-only import のみ)
 *   - MirrorSurface.tsx (B-1 hidden shell) 変更なし
 *   - ChatClient.tsx 変更なし
 */

"use client";

import { useEffect } from "react";
import { COALTER_FLAGS } from "@/lib/coalter/flags";
import { decideMirror } from "@/lib/coalter/mirror/decisionEngine";
import { buildMirrorDecisionInput } from "@/lib/coalter/mirror/engineAdapter";
import {
  tryAcquireMirrorLock,
  releaseMirrorLock,
} from "@/lib/coalter/mirror/channelLock";
import {
  incrementEngineInvoked,
  incrementCandidateCount,
} from "@/lib/coalter/mirror/frequencyCap";
import { pushDiagnosticEntry } from "@/lib/coalter/mirror/diagnosticSnapshot";
import { installDiagnosticDebugGlobalIfEnabled } from "@/lib/coalter/mirror/diagnosticDebugGlobal";
import type {
  MirrorDecisionInput,
  MirrorDecision,
  MirrorDiagnosticEntry,
} from "@/lib/coalter/mirror/types";

/** Lock holder 識別子 (debugging 用)。 */
const LOCK_HOLDER = "useMirrorEngine" as const;

/**
 * Engine decision + input を **redacted diagnostic entry** に変換する pure helper。
 *
 * PII firewall:
 *   - input は MirrorDecisionInput (型レベル PII フィールドなし) を読むだけ
 *   - 出力 entry は MirrorDiagnosticEntry (enum / bucket / number のみ)
 *   - raw text / message id / user id 等は型に存在しないので構造的に leak しない
 */
function buildDiagnosticEntry(
  decision: MirrorDecision,
  input: MirrorDecisionInput,
): MirrorDiagnosticEntry {
  return {
    decision: decision.type,
    reason: decision.reason,
    ervScore: decision.type === "MIRROR_CANDIDATE" ? decision.ervScore : undefined,
    modeContextStatus: input.modeContext.status,
    mode: input.modeContext.status === "known" ? input.modeContext.mode : null,
    alignmentBucket: input.alignment.bucket,
    uncertaintyBucket: input.uncertainty.bucket,
    silenceBudgetBucket: input.silenceBudget.bucket,
    patternCategoryBucket: input.patternCategory.bucket,
    timestamp: Date.now(),
  };
}

/**
 * Shadow mode で Mirror engine を実行する React hook。
 *
 * **B-5a 動作**:
 *   - mount 時 1 回 useEffect で実行
 *   - flag OFF → 一切何もしない (early return)
 *   - flag ON →:
 *       1. debug global install (二重 flag check 経由、両方 ON のときのみ)
 *       2. channelLock 取得 (失敗なら skip、defensive)
 *       3. engineAdapter で MirrorDecisionInput 構築 (PII なし)
 *       4. decideMirror() 呼出
 *       5. diagnostic snapshot に redacted entry push
 *       6. MIRROR_CANDIDATE なら candidateCount increment (visible 出力はしない)
 *       7. channelLock release
 *
 * **B-5a は何も visible に出力しない**。MIRROR_CANDIDATE 判定されても diagnostic 記録のみ。
 *
 * @returns void
 *
 * @example
 *   function MirrorHost() {
 *     useMirrorEngine();  // mount 時 engine 実行 (flag ON 時のみ)
 *     return COALTER_FLAGS.mirrorChannelEnabled ? <MirrorSurface /> : null;
 *   }
 */
export function useMirrorEngine(): void {
  useEffect(() => {
    // L4 defense: flag OFF → engine 一切呼ばない (early return)
    if (!COALTER_FLAGS.mirrorChannelEnabled) {
      return;
    }

    // Debug global install (二重 flag check は内部で実行)
    installDiagnosticDebugGlobalIfEnabled();

    // ChannelLock 取得 (重複実行防止)
    const acquired = tryAcquireMirrorLock(LOCK_HOLDER);
    if (!acquired) {
      // Lock 取れず → skip (defensive、同 cycle 内 2 度目の実行を防ぐ)
      return;
    }

    try {
      // Engine 実行カウンタ increment
      incrementEngineInvoked();

      // Input 組み立て (B-5a は AdapterContext 最小、すべて undefined)
      const input = buildMirrorDecisionInput({});

      // Engine 呼出
      const decision = decideMirror(input);

      // Diagnostic snapshot に redacted entry push
      const entry = buildDiagnosticEntry(decision, input);
      pushDiagnosticEntry(entry);

      // MIRROR_CANDIDATE なら candidate count を increment (B-5a では visible 出力なし)
      if (decision.type === "MIRROR_CANDIDATE") {
        incrementCandidateCount();
      }
    } finally {
      // Lock 必ず release
      releaseMirrorLock(LOCK_HOLDER);
    }

    // Empty deps array: mount 時 1 回のみ実行、再実行なし
    // (B-5b 以降で chat message subscription 追加時、依存配列を拡張する候補)
  }, []);
}
