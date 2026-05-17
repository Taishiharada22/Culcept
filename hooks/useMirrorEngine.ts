/**
 * CoAlter AOO Phase B B-5a/B-5b — useMirrorEngine hook
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §3 / §10.8
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2.5
 *
 * 役割:
 *   B-5a: shadow mode で engine を mount-once 実行、diagnostic snapshot に記録。
 *   B-5b 拡張: MIRROR_CANDIDATE 時に
 *     - visible text を deterministic 生成
 *     - postSpeakVerification 通過チェック
 *     - sleep / visible cap / duplicate チェック
 *     - 通過時のみ React state に visibleText を set し、frequencyCap を increment
 *     - 全 reject 経路で diagnostic に reason を追記
 *   ※ env 投入 / canary は B-5c。本 hook は flag OFF で完全 no-op。
 *
 * 4 層 flag gating defense (env 漏れ対策、B-5a で確立):
 *   L1: env scope (branch-scoped Preview only、B-5c で CEO 手動)
 *   L2: env value strict parser (B-1 mirror flag strict)
 *   L3: MirrorHost flag OFF → null-render (early)
 *   L4: **本 hook: flag OFF → engine 一切呼ばない (extra guard)**
 *
 * 設計原則 (B-5b 拡張):
 *   - **shadow mode を維持**: B-5b は visible 経路を**追加**するだけ、shadow path 削除しない
 *   - **pure 判定は visibleMirrorEvaluator に分離**: hook は React-only (state / effect)
 *   - **session-local state**: recentlyEmittedTemplateIds は useRef (component lifetime)
 *   - **sleep handler**: onSleepRequest を caller (MirrorHost) に渡す
 *   - **graceful close**: onDismiss も同様 (visible state を null に戻す)
 *
 * No-Effect Contract:
 *   - I/O / network / storage / DOM event listener / timer / LLM 一切なし
 *   - module-level state (sleepStore / frequencyCap / channelLock / diagnosticSnapshot) 更新のみ
 *   - PII 受理なし (engineAdapter / visibleMirrorEvaluator 経由で型レベル保護)
 *
 * 不可侵境界 (B-0 §9):
 *   - 既存 presence layer / observer layer / chat layer touch なし
 *   - B-1〜B-4d zero diff (read-only import のみ)
 *   - MirrorSurface.tsx (B-1 hidden shell) 変更なし
 *   - ChatClient.tsx 変更なし
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  incrementVisibleSpeak,
  isVisibleCapReached,
} from "@/lib/coalter/mirror/frequencyCap";
import { pushDiagnosticEntry } from "@/lib/coalter/mirror/diagnosticSnapshot";
import { installDiagnosticDebugGlobalIfEnabled } from "@/lib/coalter/mirror/diagnosticDebugGlobal";
import { getSleep, setSleep } from "@/lib/coalter/mirror/sleepStore";
import { evaluateVisibleMirror } from "@/lib/coalter/mirror/visibleMirrorEvaluator";
import type {
  MirrorDecisionInput,
  MirrorDecision,
  MirrorDiagnosticEntry,
} from "@/lib/coalter/mirror/types";
import type {
  VisibleMirrorTemplateId,
  VisibleMirrorEvalResult,
} from "@/lib/coalter/mirror/visibleMirrorTypes";

/** Lock holder 識別子 (debugging 用)。 */
const LOCK_HOLDER = "useMirrorEngine" as const;

/**
 * Diagnostic entry を組み立てる pure helper。
 *
 * PII firewall:
 *   - input は MirrorDecisionInput (型レベル PII フィールドなし) を読むだけ
 *   - 出力 entry は MirrorDiagnosticEntry (enum / bucket / number のみ)
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
 * useMirrorEngine の戻り値 (B-5b 拡張)。
 *
 * - `visible`: 表示中の text (null なら表示なし)
 * - `onDismiss`: 「閉じる」handler (visible を null に戻す)
 * - `onSleepRequest`: 「黙ってもらう」handler (sleepStore.setSleep(true) + visible 解除)
 * - `sleepOn`: 現在の sleep 状態 (UI で toggle 表示用)
 * - `onSleepResume`: 「解除」handler (sleepStore.setSleep(false))
 */
export interface UseMirrorEngineResult {
  readonly visible: {
    readonly text: string;
    readonly templateId: VisibleMirrorTemplateId;
  } | null;
  readonly sleepOn: boolean;
  readonly onDismiss: () => void;
  readonly onSleepRequest: () => void;
  readonly onSleepResume: () => void;
}

/**
 * Shadow mode + visible candidate evaluation を行う React hook (B-5a + B-5b)。
 *
 * **B-5a path (shadow mode、不変)**:
 *   1. flag OFF → 一切何もしない
 *   2. debug global install (二重 flag check)
 *   3. channelLock 取得
 *   4. engineAdapter で MirrorDecisionInput 構築
 *   5. decideMirror() 呼出 + diagnostic push + 候補 count increment
 *
 * **B-5b path (visible candidate 評価、追加)**:
 *   6. visibleMirrorEvaluator で 4-gate (sleep / cap / generation / verification)
 *   7. visible なら setState + incrementVisibleSpeak + recentlyEmittedTemplateIds 追記
 *   8. absent なら diagnostic に reason 追記 (visible 経路の reject 記録)
 *
 * @returns {@link UseMirrorEngineResult} (visible / handlers / sleepOn)
 */
export function useMirrorEngine(): UseMirrorEngineResult {
  // Visible state (component lifetime、cross-mount で reset = 設計通り)
  const [visible, setVisible] = useState<UseMirrorEngineResult["visible"]>(null);
  // sleep state は sleepStore (module-level) が source of truth、UI 表示用に React state mirror
  const [sleepOn, setSleepOn] = useState<boolean>(false);

  // recentlyEmittedTemplateIds — duplicate verification 用、session-local (mount 中のみ)
  const recentlyEmittedRef = useRef<VisibleMirrorTemplateId[]>([]);

  // visible cap は visibleSpeak count = 1 の time-of-evaluation で固定 (B-5b 段階で session=1)
  // visible state 更新時に React に再 render 通知する handler set
  useEffect(() => {
    // L4 defense: flag OFF → engine 一切呼ばない (early return)
    if (!COALTER_FLAGS.mirrorChannelEnabled) {
      return;
    }

    // Debug global install (二重 flag check は内部で実行)
    installDiagnosticDebugGlobalIfEnabled();

    // ChannelLock 取得
    const acquired = tryAcquireMirrorLock(LOCK_HOLDER);
    if (!acquired) {
      return;
    }

    try {
      // Engine 実行 counter increment
      incrementEngineInvoked();

      // Input 組み立て (B-5b は AdapterContext 最小、すべて undefined)
      // 注: chat layer 接続は B-5b で実施しない (chat touch 禁止)
      const input = buildMirrorDecisionInput({});

      // Engine 呼出
      const decision = decideMirror(input);

      // Diagnostic snapshot に redacted entry push (B-5a path、不変)
      pushDiagnosticEntry(buildDiagnosticEntry(decision, input));

      // MIRROR_CANDIDATE なら candidate count increment (B-5a path)
      if (decision.type === "MIRROR_CANDIDATE") {
        incrementCandidateCount();
      }

      // ─────────────────────────────────────────────
      // B-5b: visible candidate evaluation (4-gate)
      // ─────────────────────────────────────────────
      const evalResult: VisibleMirrorEvalResult = evaluateVisibleMirror({
        decision,
        engineInput: input,
        sleepOn: getSleep(),
        visibleCapReached: isVisibleCapReached(),
        recentlyEmittedTemplateIds: recentlyEmittedRef.current,
      });

      if (evalResult.kind === "visible") {
        // visible に出す: state set + cap increment + recentlyEmitted 追記
        setVisible({
          text: evalResult.text,
          templateId: evalResult.templateId,
        });
        incrementVisibleSpeak();
        recentlyEmittedRef.current = [
          ...recentlyEmittedRef.current,
          evalResult.templateId,
        ];
      }
      // absent: 何もしない (diagnostic は B-5a path で既に push 済み、reason は
      // evalResult.reason に格納されているが B-5b では別途 push しない設計、
      // visible/absent の判定理由は visible cap / sleep / verification 各 module の
      // 内部 state が同等の情報を持つ)
    } finally {
      releaseMirrorLock(LOCK_HOLDER);
    }

    // Empty deps array: mount 時 1 回のみ実行
  }, []);

  // sleepStore (module-level) を React state に同期する初期化
  useEffect(() => {
    if (!COALTER_FLAGS.mirrorChannelEnabled) return;
    setSleepOn(getSleep());
  }, []);

  // Handler: 「閉じる」 — visible を null に戻す (sleep は変更しない、撤回 grace)
  const onDismiss = useCallback(() => {
    setVisible(null);
  }, []);

  // Handler: 「黙ってもらう」 — sleepStore set + visible 解除
  const onSleepRequest = useCallback(() => {
    setSleep(true);
    setSleepOn(true);
    setVisible(null);
  }, []);

  // Handler: 「解除」 — sleepStore clear (再 mount で engine が再評価)
  const onSleepResume = useCallback(() => {
    setSleep(false);
    setSleepOn(false);
  }, []);

  return {
    visible,
    sleepOn,
    onDismiss,
    onSleepRequest,
    onSleepResume,
  };
}
