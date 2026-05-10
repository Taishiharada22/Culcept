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
 *   - B-3.3 (2026-04-30): MemorySurface mount + useMemoryItems(threadId) initial fetch
 *   - L4-k (2026-04-30): UpperLayerErrorBoundary + Loading (isPresenceReady) + Empty
 *     (availability!=="active") の 4 補助状態 wire 完成 (§10.2 #10 partial → complete)
 *
 * B-3.3 で動作するもの:
 *   - threadId を useParams() から取得 (ChatClient touch ゼロ)
 *   - useMemoryItems(threadId) で initial fetch (Realtime なし、B-3.4 で別 gate)
 *   - viewer (user_a / user_b) が確定 + items 取得時のみ MemorySurface mount
 *   - viewer 不明 / loading / error 時は MemorySurface 非表示 (CEO 指示の安全 fallback)
 *
 * B-3 で動作しないもの (B-3.4 以降で接続):
 *   - Realtime subscribe (Supabase channel)
 *   - LLM 合成 urgent message (B-2 では category-based static fallback)
 *   - explicit / mention / chip tap signal (B-2 は implicit + critical のみ)
 *
 * 不可侵 (plan §0.4 / §7 全体):
 *   - flag OFF で既存 ChatClient render が 1 bit も変わらない
 *   - production behavior 不変原則
 *   - ChatClient.tsx は touch しない (props 影響ゼロ、threadId は useParams で取得)
 *   - 自動 urgent 再発火禁止 (§8.5.4 user_dismiss / timeout 後の沈黙ペナルティ禁止)
 *   - viewer 解決曖昧時は MemorySurface 非表示 (情報漏洩リスク回避、CEO 指示)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

import { COALTER_FLAGS } from "@/lib/coalter/flags";
import { usePresenceExecutor } from "./hooks/usePresenceExecutor";
import { useMemoryItems } from "./hooks/useMemoryItems";
import UpperLayerStateRenderer from "./states/UpperLayerStateRenderer";
import UpperLayerErrorBoundary from "./states/UpperLayerErrorBoundary";
import StateLoadingFallback from "./states/StateLoadingFallback";
import StateEmptyFallback from "./states/StateEmptyFallback";
import UrgentLayer from "./UrgentLayer";
import MemorySurface from "./MemorySurface";
import {
  isUrgentAutoRefireBlocked,
  type UrgentReleasePath,
} from "@/lib/coalter/presence/urgentReleaseLogic";
import type { UrgentCategory } from "@/lib/coalter/presence/urgentTrigger";
import type {
  PatternVariant,
  PresenceMode,
  PresenceState,
} from "@/lib/coalter/presence/types";
import {
  isSpeechFetchEnabled,
  isSpeechObservationMode,
} from "@/lib/coalter/presence/speechFetchGate";
import { emitPatternUsed } from "@/lib/coalter/presence/telemetry";
import type { PatternUsedEvent } from "@/lib/coalter/presence/telemetryEvents";
import type { PresenceEvent } from "@/lib/coalter/presence/reducer";
import {
  isSmokeContextOverrideEnabled,
  parseSmokeContextFlags,
} from "@/lib/coalter/presence/smokeContextOverride";

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
 * L4-i Phase 2 Stage 2.1 観測用 client fetch timeout (ms)。
 *
 * CEO 確定 2026-05-02: 観測フェーズの安全側設定として 8 秒。
 *   - 設計 v2 元案 2000ms → race condition で観測不能だった
 *   - 5000ms → Stage 2.1 canary で `latencyMs:5001` の censored sample が発生
 *     (client が 5 秒 abort、真の LLM latency は不明、5 秒以上だった可能性のみ)
 *   - 5 秒以下に絞ると LLM 成功 case まで `fallbackReason:"timeout"` として
 *     集計され、Phase 2 の LLM 品質評価 (validation reject 率 / fallback 率 /
 *     latency 分布) が歪む。
 *   - 8 秒に拡張して **実 LLM 応答を確実に観測**、その後 Production 投入前に
 *     成功 response の実測 p50 / p95 を見て 3-5 秒へ詰める判断を再実施する。
 *   - **Production 最終値ではない、Phase 2 観測専用の安全側設定**。
 *
 * CEO 確定 2026-05-07 (Stage 2.2 Block 3 STOP 後): 8 秒 → **10 秒** に拡張。
 *   - Block 2 / Block 3 で各 1 件 timeout 発火 (累積 2/55 = 3.6%、CEO STOP ライン到達)
 *   - timeout 行 2 件とも retries=0 (単発 fetch で 8s 超え、retry / validator 設計と無関係)
 *   - `/api/coalter/speech` の end-to-end response が 8s を超えるケースが偶発
 *   - **起因 layer は未確定** (Anthropic / Vercel route / network / client abort timing /
 *     serverless 挙動 のいずれも候補、CEO 厳守 断定禁止)
 *   - 案 A: timeout 8s → 10s で provider variance を吸収 (CEO 確定 2026-05-07)
 *   - 並行: Anthropic Tier / usage / rate / latency 状況を CEO 側で確認 (案 C、別経路)
 *   - smoke v7 で 20-call 再実施、timeout 0 件確認 → block 4 進行判断
 */
export const SPEECH_FETCH_TIMEOUT_MS = 10_000;

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
  // L4-k (2026-04-30): UpperLayerErrorBoundary で UpperLayerMountActive をラップ。
  // child throw は StateErrorFallback へ。ChatClient (chat input / scroll /
  // message rendering) は包まない (CEO 厳守、UpperLayer 領域のみ)。
  return (
    <UpperLayerErrorBoundary>
      <UpperLayerMountActive />
    </UpperLayerErrorBoundary>
  );
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
   * L4-k (2026-04-30): isPresenceReady transient (mount 直後 1 tick の Loading)。
   *
   * 目的: usePresenceExecutor の useEffect (subscribePresenceSignal 等) が完了する
   * までの transient で StateLoadingFallback を表示し、その後通常 UI に切替。
   * MemorySurface の memory.isLoading とは独立 (MemorySurface 内 loading は別経路)。
   *
   * 動作:
   *   - 初期 render: false → StateLoadingFallback mount
   *   - useEffect mount 後 setTimeout(0): true → 通常 UI
   *   - transient < 16ms (1 frame)、視覚的 flicker なし、layout collapse なし
   */
  const [isPresenceReady, setIsPresenceReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setIsPresenceReady(true), 0);
    return () => clearTimeout(timer);
  }, []);

  /**
   * B-3.3: threadId を URL params から取得 (ChatClient touch ゼロ)。
   *
   * 本 component は `app/(culcept)/talk/[threadId]/` route 配下で render される
   * ため、useParams() で `params.threadId` を取得可能。preview / 別 route で
   * mount された場合は threadId === null となり、useMemoryItems が空 state を返す
   * (MemorySurface は表示しない)。
   */
  const params = useParams();
  const threadId = useMemo<string | null>(() => {
    const raw = params?.threadId;
    if (typeof raw === "string" && raw.length > 0) return raw;
    return null;
  }, [params]);

  /**
   * B-3.3: Memory items 取得 hook (initial fetch のみ、Realtime は B-3.4)。
   *
   * threadId 不明 → 空 state、fetch しない (early return)。
   * 404/403/500 → 空 fallback、UI 壊さない。
   */
  const memory = useMemoryItems(threadId);

  /**
   * B-3.3: MemorySurface 表示判定。
   *
   * CEO 指示「viewer解決が曖昧なら、無理に表示せず空/hidden fallback」:
   *   - viewer === null (auth / pair lookup 失敗 / loading) → 非表示
   *   - error が "fetch_failed_4xx" / "network_error" / "invalid_response_shape"
   *     のいずれか (transient な fetch 失敗) → 非表示
   *   - error === "degraded" (DB items 取得失敗、items=[] でも viewer は確定) → 表示 (空表示 OK)
   *   - error === null + viewer 確定 → 表示
   */
  const showMemorySurface = useMemo<boolean>(() => {
    if (memory.viewer === null) return false;
    if (memory.isLoading) return false;
    if (memory.error !== null && memory.error !== "degraded") return false;
    return true;
  }, [memory.viewer, memory.isLoading, memory.error]);

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
   * B-2 残作業 (CEO 確定 2026-05-09): S1 status chip tap → S1_ENTRY_OK dispatch。
   *
   * dev preview (`app/(dev)/coalter-preview/full/page.tsx:174`) の
   * `exec.dispatch.presenceEvent({ type: "S1_ENTRY_OK" })` と完全同一経路。
   * production UI で S1 chip tap が実行されたら同じ event を流す。
   *
   * pure helper `buildS1EntryConfirmDispatch` 経由 (test 容易性 + canonical path)。
   */
  const handleS1ChipTap = useCallback(
    buildS1EntryConfirmDispatch(exec.dispatch.presenceEvent),
    [exec.dispatch.presenceEvent],
  );

  /**
   * B-3 Phase 1 残作業 (CEO 確定 2026-05-09 Option A): state machine transition
   * dispatch wiring。S2/S3/S5/S6/S7 の chip / button tap を既存 reducer event
   * (S2_ACCEPTED / S3_RESPONSE / S5_DONE / S5_DIRECT_EXIT / S6_PROPOSE / S6_REWORK
   * / S6_END / S7_DONE) に接続する。
   *
   * dev preview (`app/(dev)/coalter-preview/full/page.tsx:177-201`) の各 button
   * dispatch と完全同一経路。reducer / selectPattern / speech 系 不接触。
   *
   * 設計上の選択 (CEO 厳守 Phase 1 一括巨大化注意):
   *   - 各 dispatch は pure helper `buildXxxDispatch` で test 容易化
   *   - state-aware bundle を `useMemo` で組み立て、現 state に該当する handler のみ
   *     Renderer に流す (他 state は undefined のまま、render 動作変化なし)
   *   - 共有 prop 名 (`onResponseTap` for S2/S3/S5、`onCloseTap` for S5、
   *     `onResolveTap` for S7) を採用、各 state component は独自 dispatch event に
   *     bind される (UpperLayerMount で state 判定)
   */
  const stateHandlers = useMemo<{
    onResponseTap?: () => void;
    onCloseTap?: () => void;
    onProposeTap?: () => void;
    onReworkTap?: () => void;
    onEndTap?: () => void;
    onResolveTap?: () => void;
  }>(() => {
    const dispatch = exec.dispatch.presenceEvent;
    const state = exec.state.presence.state;
    switch (state) {
      case "S2":
        return { onResponseTap: buildS2AcceptedDispatch(dispatch) };
      case "S3":
        return { onResponseTap: buildS3ResponseDispatch(dispatch) };
      case "S5":
        return {
          onResponseTap: buildS5DoneDispatch(dispatch),
          onCloseTap: buildS5DirectExitDispatch(dispatch),
        };
      case "S6":
        return {
          onProposeTap: buildS6ProposeDispatch(dispatch),
          onReworkTap: buildS6ReworkDispatch(dispatch),
          onEndTap: buildS6EndDispatch(dispatch),
        };
      case "S7":
        return { onResolveTap: buildS7DoneDispatch(dispatch) };
      default:
        return {};
    }
  }, [exec.dispatch.presenceEvent, exec.state.presence.state]);

  /**
   * B-3 Phase 1 残作業 — S4 auto-advance (CEO 確定 2026-05-09):
   *
   * S4 (理解更新中) は UI 上に user action element を持たない (UI spec §4.3.5
   * 「許可 action: モード切替 tap のみ」)。state machine 上 S4 → S5 transition
   * (S4_DONE) trigger は内部 (理解更新完了) 由来だが、production の executor 内
   * "理解更新完了" event は本 phase scope 外 (§9 保留)。
   *
   * 暫定対応として、UpperLayerMount で state===S4 の useEffect 内で `setTimeout`
   * (`S4_AUTO_ADVANCE_MS`) → `buildS4DoneDispatch` で auto-advance させる。
   *
   * CEO 厳守 (二重 dispatch 防止 + cleanup):
   *   - state===S4 の時のみ timer set (early return otherwise)
   *   - cleanup で `clearTimeout` (state 変化 / unmount で cleanup 走る)
   *   - useEffect deps が state / dispatch のみ → state 変化で前 timer cleanup → 新 effect 起動
   *   - StrictMode double-mount でも cleanup → mount → 1 timer 維持 → 1 dispatch
   *   - state 変化後 (S4 → S5) は再 mount で early return、新 timer 起動なし
   */
  useEffect(() => {
    if (exec.state.presence.state !== "S4") return;
    const timer = setTimeout(
      buildS4DoneDispatch(exec.dispatch.presenceEvent),
      S4_AUTO_ADVANCE_MS,
    );
    return () => clearTimeout(timer);
  }, [exec.state.presence.state, exec.dispatch.presenceEvent]);

  /**
   * B-3 Phase 2 残作業 — Smoke-only context flag injection harness
   * (CEO/GPT 確定 2026-05-09 条件付き GO):
   *
   * Preview env で `NEXT_PUBLIC_COALTER_PRESENCE_SMOKE_CONTEXT=true` の場合のみ、
   * URL query (`?coalter_smoke_flag=needFraming,uncertaintyHigh` 等) を読んで
   * `Partial<PatternContext>` を `setPatternContext` に注入する。
   *
   * **Gap 4 production logic (executor watcher / heuristic) の解消ではない**。
   * 本 hook は smoke harness 限定で、結果を production reachability PASS とは
   * 呼ばない (CEO/GPT 補正)。
   *
   * fail-closed 設計:
   *   - default false (env 未設定で何もしない、production 不変)
   *   - exact "true" のみ accept ("1" / "yes" / "TRUE" 等は false 評価)
   *   - whitelist 外の flag は無視 (`parseSmokeContextFlags` で fail-closed)
   *   - 0 件 flag なら setPatternContext 呼ばない (default {} 維持)
   *
   * 実行タイミング: mount-once。`exec.dispatch.setPatternContext` setter 安定参照
   * (useState 由来) のため effect は実質 1 回のみ実行。Preview env で URL 経由
   * smoke 実施時、初回 mount で flag が反映される。
   */
  useEffect(() => {
    if (!isSmokeContextOverrideEnabled()) return;
    const overrideFlags = parseSmokeContextFlags(
      new URLSearchParams(window.location.search),
    );
    if (Object.keys(overrideFlags).length === 0) return;
    exec.dispatch.setPatternContext(overrideFlags);
  }, [exec.dispatch.setPatternContext]);

  // ─────────────────────────────────────────────
  // L4-i Phase 1 (CEO 確定 2026-04-30、設計 v2):
  // Speech body fetch (S2/S5/S7 のみ、isSpeechFetchEnabled() === true でのみ起動)
  //
  // 二重 gate の **client 側**:
  //   - Phase 1 default: isSpeechFetchEnabled() = false → fetch 起動ゼロ
  //   - Phase 2 で Vercel Preview env に NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_FETCH=true
  //     を追加 → 自動的に fetch 起動 (code 変更なし)
  //
  // dedupe / abort / stale 防止 / negative cache を全 cover。
  // 失敗時は speechBody=null (= state component の hardcoded fallback に戻る)。
  // ─────────────────────────────────────────────

  const [speechBody, setSpeechBody] = useState<string | null>(null);
  const speechCacheRef = useRef<Map<string, string>>(new Map());
  const inFlightSpeechRef = useRef<Map<string, Promise<void>>>(new Map());
  const speechNegativeCacheRef = useRef<Map<string, number>>(new Map());
  const speechMountedRef = useRef<boolean>(true);
  /**
   * L4-i Phase 2 Option B' (CEO 確定 2026-05-02): pattern.used emit dedupe key。
   *
   * `(variant, state, mode, source, fallbackReason)` の組合せでユニーク化し、
   * 同 outcome の重複 emit を防ぐ。state 変化や fetch 結果の差で source / reason
   * が変わるたびに新 emit が走る (Phase 2 観測項目を Sentry 集計可能にする)。
   */
  const lastEmittedSpeechTelemetryKeyRef = useRef<string | null>(null);
  useEffect(() => {
    speechMountedRef.current = true;
    return () => {
      speechMountedRef.current = false;
    };
  }, []);

  const speechState = exec.state.presence.state;
  const speechMode = exec.state.mode;
  const speechVariant = exec.computed.primaryPattern;

  // L4-i Phase 2 Stage 2.1 / 2.2 観測モード (CEO 確定 2026-05-07 Option C')。
  //
  // 観測モード ON のとき、最新 signal の (kind:ts) を effect deps に追加して
  // 各 critical signal arrival ごとに effect を再実行させる。
  //
  // **`recentSignals.length` を使わない理由** (CEO 確定):
  //   SIGNAL_LOG_LIMIT=20 で length が頭打ちになる → 20-call/100-call 観測で
  //   deps 不変問題が再発する設計脆弱性。`kind:ts` なら 20-call/100-call まで
  //   一意性が保たれる (timestamps は単調増加、kind で同一 ms 衝突回避)。
  const observationMode = isSpeechObservationMode();
  const latestSignal = exec.state.recentSignals.at(-1);
  const observationKey = observationMode
    ? `${latestSignal?.kind ?? "none"}:${latestSignal?.detectedAt ?? 0}`
    : "off";

  useEffect(() => {
    // Phase 1 default: gate OFF → fetch 起動ゼロ (Production 不変)
    if (!isSpeechFetchEnabled()) {
      setSpeechBody(null);
      return;
    }
    // S2/S5/S7 以外は LLM 対象外
    if (
      speechState !== "S2" &&
      speechState !== "S5" &&
      speechState !== "S7"
    ) {
      setSpeechBody(null);
      return;
    }
    if (speechVariant === null) {
      setSpeechBody(null);
      return;
    }
    if (threadId === null) {
      setSpeechBody(null);
      return;
    }
    const cacheKey: string = buildSpeechCacheKey(
      speechVariant,
      speechState,
      speechMode,
    );
    // 通常モード: cache / negative cache check 経路 (Production 同等の挙動)
    // 観測モード: cache を全 skip して各 signal arrival で fetch 強制再実行
    if (!observationMode) {
      // cache hit → 即適用
      const cached = speechCacheRef.current.get(cacheKey);
      if (cached !== undefined) {
        setSpeechBody(cached);
        return;
      }
      // negative cache 中なら fetch せず fallback (state component の hardcoded を使う)
      const negativeUntil = speechNegativeCacheRef.current.get(cacheKey);
      if (negativeUntil !== undefined && Date.now() < negativeUntil) {
        setSpeechBody(null);
        return;
      }
    }
    // in-flight dedupe (両モード共通、同 instance 同時並列 fetch 防止)
    if (inFlightSpeechRef.current.has(cacheKey)) {
      return;
    }
    const controller = new AbortController();
    const startTs = Date.now();
    // L4-i Phase 2 fix-forward (CEO 確定 2026-05-02): timeout 由来の abort と
    // cleanup 由来の abort を区別する。timeoutFired=true なら 2s timeout。
    let timeoutFired = false;
    const timeoutId = setTimeout(() => {
      timeoutFired = true;
      controller.abort();
    }, SPEECH_FETCH_TIMEOUT_MS);
    /**
     * L4-i Phase 2 Option B' (CEO 確定 2026-05-02): pattern.used emit helper。
     *
     * fetch 完了後 (success / fallback / error) に Sentry breadcrumb 用の実
     * metadata を含めて emit する。`(variant, state, mode, source, reason)` で
     * dedupe、stale 防止のため speechMountedRef を必ず check。
     */
    const emitSpeechTelemetry = (
      source: NonNullable<PatternUsedEvent["speechSource"]>,
      retries: number,
      latencyMs: number,
      validationFailed: boolean,
      fallbackReason: PatternUsedEvent["fallbackReason"],
    ) => {
      if (!speechMountedRef.current) return;
      if (speechVariant === null) return;
      // L4-i Phase 2 Stage 2.1 v4 (CEO 確定 2026-05-07 GPT 補正版):
      //
      // dedupe key に observationKey を含めることで:
      //   - 通常モード: 従来通り (variant, state, mode, source, reason) で重複抑制
      //     → 同 outcome 連続 emit を防ぐ (Production 不変)
      //   - 観測モード: observationKey が各 critical signal の (kind:detectedAt) で
      //     unique → 5 calls 各々が別 telemetry event として emit される
      //     (Sentry 集計で latency / retries / fallback 分布が観測可能)
      //   - 同一 request 内の二重 emit は同じ observationKey なので依然抑止される
      //     (race condition 起因の duplicate を防ぐ最低限の dedupe を維持)
      const baseKey = `${speechVariant}|${speechState}|${speechMode}|${source}|${fallbackReason ?? "none"}`;
      const telemetryKey = observationMode
        ? `${baseKey}|${observationKey}`
        : baseKey;
      if (telemetryKey === lastEmittedSpeechTelemetryKeyRef.current) return;
      emitPatternUsed({
        pairId: "",
        variant: speechVariant,
        state: speechState,
        mode: speechMode,
        hasSecondary: exec.computed.secondaryPattern !== null,
        ts: Date.now(),
        speechSource: source,
        retries,
        latencyMs,
        validationFailed,
        fallbackReason,
      });
      lastEmittedSpeechTelemetryKeyRef.current = telemetryKey;
    };
    const work = (async () => {
      try {
        const res = await fetch("/api/coalter/speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            state: speechState,
            mode: speechMode,
            variant: speechVariant,
            threadId,
          }),
          signal: controller.signal,
        });
        if (!speechMountedRef.current) return;
        if (!res.ok) {
          // 401 / 4xx / 5xx → static fallback (UI は壊さない)
          // 観測モード時は negative cache write skip (連続 retry を許可)
          if (!observationMode) {
            speechNegativeCacheRef.current.set(cacheKey, Date.now() + 30_000);
          }
          setSpeechBody(null);
          // Option B': HTTP non-OK → fallback / llm_error
          emitSpeechTelemetry(
            "fallback",
            0,
            Date.now() - startTs,
            false,
            "llm_error",
          );
          return;
        }
        const json = (await res.json()) as {
          body?: unknown;
          speechSource?: unknown;
          fallbackReason?: unknown;
          retries?: unknown;
          latencyMs?: unknown;
          validationFailed?: unknown;
        };
        if (!speechMountedRef.current) return;
        const bodyOk =
          typeof json.body === "string" && json.body.length > 0;
        if (!bodyOk) {
          setSpeechBody(null);
          // Option B': body parse 失敗 → fallback / llm_error として記録
          emitSpeechTelemetry(
            "fallback",
            0,
            Date.now() - startTs,
            false,
            "llm_error",
          );
          return;
        }
        const source = json.speechSource;
        const reason = json.fallbackReason;
        // L4-i Phase 2 fix-forward (CEO 確定 2026-05-02):
        //   - source==="llm": 真の LLM 結果のみ session cache (variant+state+mode 単位 dedupe)
        //   - source==="static" / "fallback": cache せず (次の state 変化で再 fetch を許す)
        //   - reason==="rate_limited": negative cache 70s (rate window と整合、即時再 fetch 抑止)
        //   - reason==="llm_error" / "validation_failed" / "timeout": negative cache 30s (server 側
        //     一時 error の連投を抑制)
        // 観測モード時は cache write も skip (再 fetch を毎回許す、
        // 統計サンプル取得が目的なので cache 永続化しない)
        if (!observationMode) {
          if (source === "llm") {
            speechCacheRef.current.set(cacheKey, json.body as string);
          } else if (reason === "rate_limited") {
            speechNegativeCacheRef.current.set(cacheKey, Date.now() + 70_000);
          } else if (
            reason === "llm_error" ||
            reason === "validation_failed" ||
            reason === "timeout"
          ) {
            speechNegativeCacheRef.current.set(cacheKey, Date.now() + 30_000);
          }
        }
        // body は受け取っても UI 反映するのは source==="llm" 時のみ。
        // static / fallback は state component の hardcoded fallback に戻す
        // (Phase 1 default 挙動を維持、CEO 厳守: LLM の動的文言だけ UI に出す)。
        if (source === "llm") {
          setSpeechBody(json.body as string);
        } else {
          setSpeechBody(null);
        }
        // Option B': server response の actual metadata を pattern.used へ
        // propagate (Sentry 集計可能化、PII safety 維持: body / prompt / user
        // input 等は payload に **入れない**、構造化 enum + number のみ)。
        const safeSource: NonNullable<PatternUsedEvent["speechSource"]> =
          source === "llm" || source === "fallback" || source === "static"
            ? source
            : "static";
        const safeReason: PatternUsedEvent["fallbackReason"] =
          reason === "flag_off" ||
          reason === "rate_limited" ||
          reason === "llm_error" ||
          reason === "validation_failed" ||
          reason === "timeout"
            ? reason
            : null;
        const safeRetries =
          typeof json.retries === "number" ? json.retries : 0;
        const safeLatency =
          typeof json.latencyMs === "number" ? json.latencyMs : 0;
        const safeValidationFailed =
          typeof json.validationFailed === "boolean"
            ? json.validationFailed
            : false;
        emitSpeechTelemetry(
          safeSource,
          safeRetries,
          safeLatency,
          safeValidationFailed,
          safeReason,
        );
      } catch (err) {
        // L4-i Phase 2 fix-forward (CEO 確定 2026-05-02):
        //   AbortError の origin を区別:
        //   - cleanup-induced (state/mode/variant 変化で副次 abort) → negative cache 不要
        //     (次回同 key の fetch を許可、設計意図)、pattern.used emit も **しない**
        //     (stale response 防止 + duplicate 防止)
        //   - timeout-induced (timeoutFired=true) → negative cache 30s + pattern.used
        //     emit (`source:"fallback"`, `fallbackReason:"timeout"`)
        //   - network/parse error → negative cache 30s + pattern.used emit
        //     (`source:"fallback"`, `fallbackReason:"llm_error"`)
        if (!speechMountedRef.current) return;
        const isAbort =
          err instanceof Error && err.name === "AbortError";
        if (isAbort && !timeoutFired) {
          // cleanup 由来 → 単に UI を fallback に戻すだけで cache を汚さない
          setSpeechBody(null);
          return;
        }
        const elapsedMs = Date.now() - startTs;
        // 観測モード時は negative cache write skip (連続 retry を許可、
        // timeout / error の発生分布を取りに行く)
        if (!observationMode) {
          speechNegativeCacheRef.current.set(cacheKey, Date.now() + 30_000);
        }
        setSpeechBody(null);
        // Option B': timeout / network error → fallback emit
        emitSpeechTelemetry(
          "fallback",
          0,
          elapsedMs,
          false,
          timeoutFired ? "timeout" : "llm_error",
        );
      } finally {
        clearTimeout(timeoutId);
        inFlightSpeechRef.current.delete(cacheKey);
      }
    })();
    inFlightSpeechRef.current.set(cacheKey, work);
    return () => {
      // L4-i Phase 2 Stage 2.1 v4 (CEO 確定 2026-05-07 GPT 補正版):
      //
      // 観測モード時は cleanup で controller.abort() も clearTimeout() も両方 skip
      // する。理由:
      //   - cleanup は observationKey 変化 (新 critical signal) で走るが、観測中は
      //     前 fetch を完走させたい (5 件分の outcome を取りたい)
      //   - もし clearTimeout だけ実行すると、前 fetch がハングした場合の 8s
      //     timeout 保険が消えて in-flight ref が永遠に解放されない (GPT 指摘)
      //   - timeoutId は fetch の finally block で clearTimeout される (request
      //     単位の所有)、effect cleanup で消す必要なし
      //   - observationKey 変化時の二重起動は in-flight dedupe ref で抑止する
      //     (`inFlightSpeechRef.current.has(cacheKey)` で skip)
      //
      // 通常モード (Production default OFF) は従来通り cleanup で abort + clearTimeout
      // (state 変化時の stale fetch を捨てる)。
      //
      // unmount 時の stale UI 更新は別経路 `speechMountedRef.current = false` で防ぐ
      // (本 cleanup ではなく mount effect の return で実施)。
      if (observationMode) {
        return;
      }
      controller.abort();
      clearTimeout(timeoutId);
    };
    // observationKey: Phase 2 観測モード時のみ非 "off"。新 signal の (kind:ts) で
    // 一意に変化するため、同 (variant, state, mode) で連続 signal が来ても effect
    // 再実行 → fetch 再起動。通常モードは "off" 固定で従来挙動維持。
  }, [speechState, speechMode, speechVariant, threadId, observationKey]);

  /**
   * Urgent dismiss tap handler。
   *
   * §8.5.4 不可侵: dismiss 後は追加挽留禁止 (= 60s autoRefire block)。
   * §6.8 継承: 「無視した」とカウントしない (silent fade-out)。
   */
  const handleUrgentDismiss = useCallback(() => {
    setLastRelease({ path: "user_dismiss", releasedAt: Date.now() });
  }, []);

  /**
   * L4-k (2026-04-30): Loading transient (presence executor 初期化中)。
   *
   * isPresenceReady === false の transient で StateLoadingFallback を mount。
   * 16ms 以内に通常 UI に切替 (effect 完了後)。
   */
  if (!isPresenceReady) {
    return (
      <StateLoadingFallback
        state={exec.state.presence.state}
        mode={exec.state.mode}
      />
    );
  }

  /**
   * L4-k (2026-04-30): Empty (availability !== "active")。
   *
   * Stage 2 L2-e の ExecutorAvailability 5 値 (disabled / inactive /
   * pending_consent / enabled / active) のうち、active 以外は presence state
   * machine が動かない状態。state component を mount せず StateEmptyFallback で
   * minimal 表示。
   *
   * B-1 では default "active" 固定のため発火しない (production behavior 不変)。
   * 将来 consent flow / disabled / inactive / pending_consent / enabled 経路が
   * つながった時に自動的に発火 (本 commit で wire 完成)。
   */
  if (exec.state.availability !== "active") {
    return (
      <StateEmptyFallback
        state={exec.state.presence.state}
        mode={exec.state.mode}
      />
    );
  }

  return (
    <>
      <UpperLayerStateRenderer
        state={exec.state.presence.state}
        mode={exec.state.mode}
        onSwitchMode={handleModeSwitch}
        body={speechBody ?? undefined}
        onChipTap={handleS1ChipTap}
        {...stateHandlers}
      />
      {showMemorySurface && memory.viewer !== null && (
        <MemorySurface
          items={memory.items}
          viewer={memory.viewer}
          modeScope={exec.state.mode}
        />
      )}
      <UrgentLayer
        decision={visibleUrgentDecision}
        message={urgentMessage}
        onDismiss={handleUrgentDismiss}
      />
    </>
  );
}

/**
 * L4-i Phase 1 (CEO 確定 2026-04-30 設計 v2): speech cache key 生成。
 *
 * `(variant, state, mode)` の 3 軸で uniqueness を保証。F1/F2 は variant 軸で
 * 確実に区別される (variant === "F1" / variant === "F2")。
 *
 * 純関数 (test 容易性のため export せず module scope に閉じる)。
 */
function buildSpeechCacheKey(
  variant: PatternVariant,
  state: PresenceState,
  mode: PresenceMode,
): string {
  return `${variant}|${state}|${mode}`;
}

/**
 * B-2 残作業 (CEO 確定 2026-05-09): S1 chip tap → S1_ENTRY_OK dispatch handler builder。
 *
 * dev preview (`app/(dev)/coalter-preview/full/page.tsx:174`) の
 * `exec.dispatch.presenceEvent({ type: "S1_ENTRY_OK" })` と完全同一経路を
 * production UI で wire するための pure helper。
 *
 * test 容易性のため export (関数 invoke 方式、`@testing-library/react` 不要)。
 * production usage:
 *   const handler = useCallback(buildS1EntryConfirmDispatch(exec.dispatch.presenceEvent), [...]);
 *   <S1Approaching onChipTap={handler} />
 */
export function buildS1EntryConfirmDispatch(
  dispatch: (event: PresenceEvent) => void,
): () => void {
  return () => dispatch({ type: "S1_ENTRY_OK" });
}

// ─────────────────────────────────────────────
// B-3 Phase 1 残作業 (CEO 確定 2026-05-09 Option A):
// state machine transition dispatch handler builders (8 pure helpers)
//
// dev preview `app/(dev)/coalter-preview/full/page.tsx:177-201` と完全同一経路を
// production UI で wire するための pure helper 群。test 容易性のため export
// (関数 invoke 方式、`@testing-library/react` 不要)。reducer / selectPattern /
// speech 系 不接触。
// ─────────────────────────────────────────────

/**
 * S2 response chip tap → `S2_ACCEPTED` dispatch (S2 → S3、応答取得明示拒否なし)。
 */
export function buildS2AcceptedDispatch(
  dispatch: (event: PresenceEvent) => void,
): () => void {
  return () => dispatch({ type: "S2_ACCEPTED" });
}

/**
 * S3 response chip tap → `S3_RESPONSE` dispatch (S3 → S4、片方/両方応答取得)。
 */
export function buildS3ResponseDispatch(
  dispatch: (event: PresenceEvent) => void,
): () => void {
  return () => dispatch({ type: "S3_RESPONSE" });
}

/**
 * S4 auto-advance dispatch → `S4_DONE` (S4 → S5、理解更新完了)。
 *
 * production の executor "理解更新完了" event は §9 保留のため、暫定的に
 * UpperLayerMount の useEffect 内 `setTimeout(S4_AUTO_ADVANCE_MS)` で auto-advance
 * させる (CEO 厳守: state===S4 時のみ timer set、cleanup で clearTimeout、
 * 二重 dispatch 防止)。本 helper は dispatch portion のみ pure 化。
 */
export function buildS4DoneDispatch(
  dispatch: (event: PresenceEvent) => void,
): () => void {
  return () => dispatch({ type: "S4_DONE" });
}

/**
 * S5 response chip tap → `S5_DONE` dispatch (S5 → S6、整理完了)。
 */
export function buildS5DoneDispatch(
  dispatch: (event: PresenceEvent) => void,
): () => void {
  return () => dispatch({ type: "S5_DONE" });
}

/**
 * S5 close chip tap (いったん戻る) → `S5_DIRECT_EXIT` dispatch (S5 → S8 直接退出)。
 */
export function buildS5DirectExitDispatch(
  dispatch: (event: PresenceEvent) => void,
): () => void {
  return () => dispatch({ type: "S5_DIRECT_EXIT" });
}

/**
 * S6 「提案を聞く」 button tap → `S6_PROPOSE` dispatch (S6 → S7)。
 */
export function buildS6ProposeDispatch(
  dispatch: (event: PresenceEvent) => void,
): () => void {
  return () => dispatch({ type: "S6_PROPOSE" });
}

/**
 * S6 「もう少し整理する」 button tap → `S6_REWORK` dispatch (S6 → S5、戻る)。
 */
export function buildS6ReworkDispatch(
  dispatch: (event: PresenceEvent) => void,
): () => void {
  return () => dispatch({ type: "S6_REWORK" });
}

/**
 * S6 「今はここまでにする」 button tap → `S6_END` dispatch (S6 → S8 退出)。
 */
export function buildS6EndDispatch(
  dispatch: (event: PresenceEvent) => void,
): () => void {
  return () => dispatch({ type: "S6_END" });
}

/**
 * S7 approve / close chip tap → `S7_DONE` dispatch (S7 → S8、両者共)。
 *
 * UI spec §4.3.8: approve (提案を受ける) と close (× 閉じる) はいずれも S8 退出
 * (承認 / 不承認どちらも S8)。本 helper を 2 chip 共通 wire する。
 *
 * 注: 「この提案をチャットに共有」 (handoff) chip は §2.7 別経路、本 phase
 * scope 外 (handler 不在のため non-interactive のまま)。
 */
export function buildS7DoneDispatch(
  dispatch: (event: PresenceEvent) => void,
): () => void {
  return () => dispatch({ type: "S7_DONE" });
}

/**
 * B-3 Phase 1 残作業: S4 auto-advance timer 値 (ms)。
 *
 * S4 (理解更新中) で UI element を持たないため、setTimeout 経由で S4_DONE を
 * dispatch する暫定値。production 用の executor "理解更新完了" event 確定後
 * (§9 保留) に廃止候補。本値は smoke 観測 / 体感 UX 調整用 (CEO 別承認なしの
 * 微調整可、本 phase の最小実装では 1500ms 暫定固定)。
 */
export const S4_AUTO_ADVANCE_MS = 1500;
