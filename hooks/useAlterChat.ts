"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { HomeAlterContextData, AlterReasoningBasis, ActionShape, DecisionMetadata } from "@/lib/stargazer/alterHomeAdapter";
import { isEmotionalQuestion } from "@/lib/stargazer/alterHomeAdapter";
import type { MorningPlan, MorningPhase, ParsedDayIntent, SufficiencyResult, PendingClarify } from "@/lib/alter-morning/types";
import type { Event as ComprehensionEvent } from "@/lib/alter-morning/comprehension/eventSchema";
// A1-5-8-3: capture candidate surface（B案 step 2・client consumption）。response の morningProtocol.captureCandidate を
//   client boundary で redacted DTO に抽出（source_ref/UUID/raw drop）。absent → undefined → banner 非表示（既存 UI 不変）。
import { selectMorningProtocolCaptureCandidate } from "@/components/home/morning/captureCandidateClient";
import type { CandidateSurfaceDTO } from "@/lib/plan/reality/integration/candidate-surface";
// CEO/GPT 2026-05-02 PR B-2d-b/d: location opt-in state machine + declined recovery
import {
  readLocationOptIn,
  markGranted,
  markDeclined,
  markSnoozed,
  markNotAsked, // PR B-2d-d: declined → not_asked recovery
  getEffectiveOptInState,
  SNOOZE_DURATION_MS, // Phase 2-A blocker fix: in-memory state 直接更新で使用
  type LocationOptInRecord,
} from "@/lib/alter-morning/journey/locationOptIn";
// PR B-2d-d: declined recovery 判定を pure helper に切り出し (test 容易性)
import { shouldRecoverDeclined } from "@/lib/alter-morning/journey/declinedRecovery";
import type { LocationOptInBannerMode } from "@/components/alter-morning/LocationOptInBanner";
// W3-PR-8 rev 3 commit 22b: DialogState v2 client round-trip
//   server が返した dialogState を state 保持 → 次 POST で送り返す。
//   これが無いと route.ts 側で ensureSessionV1 が毎 turn fresh init し、
//   selectShadowTargetEventId の condition A (prevFocus===null) が恒常 fail
//   で focus 継承が発動しない（2026-04-22 preview で判明）。
import type { DialogState } from "@/lib/alter-morning/dialog/types";
// CEO 2026-04-26 root-cause fix: server canonical state を selection 経路でも完全に
// honour する pure helper（テスタビリティのため React 非依存ファイルに切り出し）。
import { applySelectionMorningSession } from "@/hooks/applySelectionResponse";

/** PE出典情報（Alter発言下に小さく表示） */
export type PerspectiveSource = {
  title: string;
  url: string;
  date: string | null;
};

export type AlterMessage = {
  id: string;
  role: "user" | "alter";
  content: string;
  timestamp: string;
  /** P1.9: PE出典データ（Alter応答にのみ付与） */
  perspectiveSources?: PerspectiveSource[];
};

export type AlterChatState = {
  /** 会話メッセージ */
  messages: AlterMessage[];
  /** ローディング中 */
  loading: boolean;
  /** セッションID */
  sessionId: string | null;
  /** エラー */
  error: string | null;
  /** 今日の累計 Alter 応答数 */
  roundCount: number;
  /** 1日5ラリー上限に達したか */
  limitReached: boolean;
};

/** 1日あたりの無料ラリー数（clarify は非消費のため、サーバー側とは別カウント） */
const MAX_DAILY_ROUNDS = 5;

/** localStorage key for daily usage tracking */
const DAILY_USAGE_KEY = "aneurasync_alter_daily_v1";

/** localStorage key for β-tester flag (persisted across page loads) */
const BETA_TESTER_KEY = "aneurasync_alter_beta_tester_v1";

/** JST (UTC+9) での今日の日付を "YYYY-MM-DD" で返す */
function getTodayJST(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

/** localStorage から今日の使用回数を読み取る */
function readDailyUsage(): number {
  try {
    const raw = localStorage.getItem(DAILY_USAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { date?: string; count?: number };
    if (parsed.date === getTodayJST()) return parsed.count ?? 0;
    return 0; // 日付が異なれば 0 にリセット
  } catch {
    return 0;
  }
}

/** localStorage に今日の使用回数を書き込む */
function writeDailyUsage(count: number): void {
  try {
    localStorage.setItem(
      DAILY_USAGE_KEY,
      JSON.stringify({ date: getTodayJST(), count }),
    );
  } catch {
    // localStorage 書き込み失敗は無視（サーバー側で制御）
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Morning Session Persistence — ページ遷移でもセッションを維持
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MORNING_SESSION_KEY = "aneurasync_morning_session_v1";

interface PersistedMorningSession {
  date: string; // YYYY-MM-DD — 日付が変わったら無効
  phase: MorningPhase;
  sessionId: string | null;
  plan: MorningPlan | null;
  rawInputs: string[];
  parsedIntent: ParsedDayIntent | null;
  sufficiency: SufficiencyResult | null;
  personalizeHints: string[];
  // v2: PlanState ラウンドトリップ
  planStateV2?: any;
  // W3-PR-6: v2 pipeline stickiness round-trip
  pipelineVersion?: "v2";
  // W3-PR-7 Commit 2: dialog state round-trip
  pendingClarify?: PendingClarify | null;
  persistedEvents?: ComprehensionEvent[];
  // W3-PR-8 rev 3 commit 22b: DialogState v2 client round-trip
  //   flag OFF 環境では常に undefined（server が field 出力しないため）。
  dialogState?: DialogState | null;
}

function saveMorningSession(session: PersistedMorningSession): void {
  try {
    localStorage.setItem(MORNING_SESSION_KEY, JSON.stringify(session));
  } catch {
    // localStorage 書き込み失敗は無視
  }
}

function loadMorningSession(): PersistedMorningSession | null {
  try {
    const raw = localStorage.getItem(MORNING_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedMorningSession;
    // 日付が今日でなければ無効（翌日にはリセット）
    if (parsed.date !== getTodayJST()) {
      localStorage.removeItem(MORNING_SESSION_KEY);
      return null;
    }
    // completed / skipped セッションは復元しない（新しいセッションを開始）
    if (parsed.phase === "completed" || parsed.phase === "skipped") return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearMorningSession(): void {
  try {
    localStorage.removeItem(MORNING_SESSION_KEY);
  } catch {
    // ignore
  }
}

/**
 * 終点アンカーを次回プランの始点候補として永続化する。
 * 前回プラン確定時に保存し、次回プラン作成時に参照する。
 */
const LAST_ENDPOINT_KEY = "aneurasync_last_endpoint_v1";

export function saveLastEndpoint(anchor: import("@/lib/alter-morning/types").EndpointAnchor): void {
  try {
    localStorage.setItem(LAST_ENDPOINT_KEY, JSON.stringify({ ...anchor, savedAt: new Date().toISOString() }));
  } catch { /* ignore */ }
}

export function loadLastEndpoint(): import("@/lib/alter-morning/types").EndpointAnchor | null {
  try {
    const raw = localStorage.getItem(LAST_ENDPOINT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

type UseAlterChatOptions = {
  /** Home 画面の文脈データ（Alter に渡す） */
  homeContext?: HomeAlterContextData | null;
};

/**
 * Home 用の軽量 Alter チャット Hook。
 * 1日5ラリー（JST 0時リセット、clarify非消費）まで Home 内で会話し、それ以上は Deep Alter に誘導。
 * localStorage で高速チェック + API 側 DB バリデーションの二重制御。
 * βテスターは API レスポンスで判定し、クライアント側制限を完全バイパス。
 *
 * homeContext を渡すと、Alter がパーソナリティデータ + 今日の状態データに
 * 基づいて「判断AI」として応答する。
 */
export function useAlterChat(options?: UseAlterChatOptions) {
  const [messages, setMessages] = useState<AlterMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastReasoningBasis, setLastReasoningBasis] = useState<AlterReasoningBasis | null>(null);
  const [lastActionShape, setLastActionShape] = useState<ActionShape | null>(null);
  const [lastDomain, setLastDomain] = useState<string | null>(null);
  const [lastIsEmotional, setLastIsEmotional] = useState(false);
  const [lastResponseId, setLastResponseId] = useState<string | null>(null);
  const [lastFeedbackMeta, setLastFeedbackMeta] = useState<Record<string, unknown> | null>(null);
  const [lastCounselorSoftLink, setLastCounselorSoftLink] = useState<{
    show: boolean;
    message: string;
    destination: string;
  } | null>(null);
  /** Morning Protocol: セッション永続化から復元 */
  const [restoredSession] = useState<PersistedMorningSession | null>(() => loadMorningSession());
  const [morningPlan, setMorningPlan] = useState<MorningPlan | null>(restoredSession?.plan ?? null);
  const [morningPhase, setMorningPhase] = useState<MorningPhase | null>(restoredSession?.phase ?? null);
  const [morningSessionId, setMorningSessionId] = useState<string | null>(restoredSession?.sessionId ?? null);
  /** P0-1: ターン間で保持する追加セッション状態 */
  const [morningRawInputs, setMorningRawInputs] = useState<string[]>(restoredSession?.rawInputs ?? []);
  const [morningParsedIntent, setMorningParsedIntent] = useState<ParsedDayIntent | null>(restoredSession?.parsedIntent ?? null);
  const [morningSufficiency, setMorningSufficiency] = useState<SufficiencyResult | null>(restoredSession?.sufficiency ?? null);
  const [morningPersonalizeHints, setMorningPersonalizeHints] = useState<string[]>(restoredSession?.personalizeHints ?? []);
  // v2: PlanState ラウンドトリップ
  const [morningPlanStateV2, setMorningPlanStateV2] = useState<any>(restoredSession?.planStateV2 ?? null);
  // W3-PR-6: v2 pipeline stickiness round-trip（"v2" | null）
  const [morningPipelineVersion, setMorningPipelineVersion] = useState<"v2" | null>(
    (restoredSession as { pipelineVersion?: "v2" } | null)?.pipelineVersion ?? null,
  );
  // W3-PR-7 Commit 2: dialog state round-trip
  const [morningPendingClarify, setMorningPendingClarify] = useState<PendingClarify | null>(
    restoredSession?.pendingClarify ?? null,
  );
  const [morningPersistedEvents, setMorningPersistedEvents] = useState<ComprehensionEvent[] | null>(
    restoredSession?.persistedEvents ?? null,
  );
  // W3-PR-8 rev 3 commit 22b: DialogState v2 round-trip
  //   response.morningProtocol.dialogState を次 POST で返送するための state。
  //   null のときは POST body 側で field を出力しない（flag OFF と同等形）。
  const [morningDialogState, setMorningDialogState] = useState<DialogState | null>(
    restoredSession?.dialogState ?? null,
  );
  // A1-5-8-3: capture candidate surface（B案 step 2・**transient**・毎 morning turn 再導出・**永続化しない**）。
  //   server（A1-5-8-2）が morningProtocol.captureCandidate? を additive 返却した時のみ DTO を保持。
  //   absent / flag OFF（production default）→ undefined → AskHero/MorningPlanCard banner 非表示（既存 UI 完全不変）。
  //   raw response を state に持たない（selectMorningProtocolCaptureCandidate が redacted DTO のみ抽出）。
  const [morningCaptureCandidate, setMorningCaptureCandidate] = useState<CandidateSurfaceDTO | undefined>(undefined);
  /**
   * W3-PR-9 commit 5c: Place selection 進行中の placeId。
   *   - null: 送信中ではない
   *   - string: この placeId を現在送信中（picker 側で全ボタン disable + loader）
   *
   * server canonical response 受信で null に戻る。途中 reject / abort / error でも finally で null。
   */
  const [placeSelectionPending, setPlaceSelectionPending] = useState<string | null>(null);
  /**
   * CEO/GPT 2026-05-03 PR B-3c-2 (GPT 1st 補正 #3): selection 失敗時の inline 表示文言。
   *
   * - null: 通常状態 (= picker は何も追加表示しない)
   * - string: 直近 selection で reason 付き reject → picker 上に inline message
   *
   * GPT 1st 補正の意図: 「候補を選んだのに何も起きない」 半壊 UX 防止。
   * activePresentation は維持されるが、user に「なぜ選択が反映されないか」 の
   * フィードバックを返す。
   *
   * クリア trigger: 次の selection 開始時 / presentation 切替時 / 4-5 秒 auto
   */
  const [placeSelectionFeedback, setPlaceSelectionFeedback] = useState<
    string | null
  >(null);
  const selectionAbortRef = useRef<AbortController | null>(null);
  /**
   * stale-response guard 用の ref。setter 内 closure が最新 state を参照できないため、
   * async response 到着時に ref で比較する。
   */
  const morningDialogStateRef = useRef<DialogState | null>(morningDialogState);
  useEffect(() => {
    morningDialogStateRef.current = morningDialogState;
  }, [morningDialogState]);

  /** Soft Bridge: 直前のAlter返答がSoft Bridge確認だったか */
  const [softBridgePending, setSoftBridgePending] = useState(false);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO/GPT 2026-05-02 PR B-2d-b: opt-in 経由の現在地座標取得
  //
  // B-2d-a の permissionState contract と組み合わせ、ユーザーが Aneurasync として
  // 明示的に opt-in した時のみ getCurrentPosition を呼ぶ。
  //
  // 規律 (CEO/GPT 2026-05-02 確定):
  //   - mount 時の自動 getCurrentPosition は B-2d-b で **削除**
  //   - LocationOptInBanner で「位置情報を使う」を押した時に getCurrentPosition を呼ぶ
  //   - 一度 granted になった次回 mount からは、permissionState===granted のときに
  //     のみ自動 getCurrentPosition (prompt/unsupported/unavailable は対象外)
  //   - browser PERMISSION_DENIED 時は declined に遷移、以降は呼ばない
  //   - 「あとで」押下は snoozed (7 日) に遷移、期限後に再度 banner 表示
  //
  // 自動取得の厳格条件 (CEO/GPT 確定):
  //   shouldAutoFetchLocation =
  //     getEffectiveOptInState(record) === "granted" &&
  //     permissionState === "granted"
  //   → permissionState が prompt/unsupported/unavailable のときは自動取得しない
  //     (= ユーザー操作なしで browser permission ダイアログが出るリスクを避ける)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO/GPT 2026-05-02 PR B-2d-c: accuracy / capturedAt も保持する
  //   - accuracy: GPS 精度 (m)。backend で gating (低精度 reject) に使う
  //   - capturedAt: pos.timestamp 由来の取得時刻 ISO 8601。
  //                 cached position が返った場合に正しく stale 判定するため、
  //                 必ず pos.timestamp を使う (= new Date() ではダメ)
  //   - lat/lng のみで accuracy/capturedAt は optional (= legacy backward compat)
  const [currentCoords, setCurrentCoords] = useState<{
    lat: number;
    lng: number;
    accuracy: number | null;
    capturedAt: string | null;
  } | null>(null);
  // permissionState (B-2d-a で導入、B-2d-d で subscribe 版に変更)
  // CEO/GPT 2026-05-02 PR B-2d-d:
  //   1 回 query → 継続 subscribe に変更。change event + visibilitychange を監視し、
  //   permissionState の変化を React state に反映する。
  //   declined recovery (granted/prompt 検出時に not_asked に降格) のために必要。
  const [permissionState, setPermissionState] = useState<
    | "granted"
    | "denied"
    | "prompt"
    | "unsupported"
    | "unavailable"
    | null
  >(null);
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const { subscribeGeolocationPermissionState } = await import(
          "@/lib/alter-morning/journey/permissionState"
        );
        if (cancelled) return;
        unsubscribe = subscribeGeolocationPermissionState((state) => {
          setPermissionState(state);
        });
      } catch {
        if (!cancelled) setPermissionState("unavailable");
      }
    })();
    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PR B-2d-b: opt-in state + banner orchestration
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SSR-safe initial: localStorage 読み取りは mount 後に行う (= 初期は not_asked)
  const [optInRecord, setOptInRecord] = useState<LocationOptInRecord>(() => ({
    state: "not_asked",
    updatedAt: new Date().toISOString(),
  }));
  const [bannerMode, setBannerMode] = useState<LocationOptInBannerMode>("normal");

  useEffect(() => {
    // mount 後に localStorage から実 record を読み出す
    setOptInRecord(readLocationOptIn());
  }, []);

  /**
   * snooze expiry を考慮した「今の」effective state。
   * granted/declined/snoozed-期限内 はそれぞれそのまま、snoozed-期限切れは "not_asked" に降格。
   */
  const effectiveOptInState = useMemo(
    () => getEffectiveOptInState(optInRecord),
    [optInRecord],
  );

  /** banner を表示するか? = effectiveOptInState === "not_asked" */
  const showLocationOptInBanner = effectiveOptInState === "not_asked";

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PR B-2d-d: declined recovery
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO/GPT 2026-05-02 規律:
  //   ユーザーがブラウザ側で permission を granted/prompt に戻した時、
  //   Aneurasync 側の declined を解除して banner を再表示する。
  //   recovery しても自動 granted にしない (= ユーザー再 opt-in が必要)。
  //   recovery しても自動 getCurrentPosition を呼ばない (= banner 経由の明示的 opt-in)。
  //
  // 3 trigger 統合:
  //   permissionState は subscribe 経由で「初回 query / change event /
  //   visibilitychange 再 query」のいずれかで更新される。
  //   このため本 useEffect は permissionState の変化を全 trigger 統合で
  //   検知できる (= 1 useEffect で 3 経路カバー)。
  //
  // 適用条件:
  //   effectiveOptInState === "declined"  (= 永久 lock 状態)
  //   AND permissionState === "granted" or "prompt"
  //     (browser 側で許可 or リセット → recovery 妥当)
  //
  // 非適用 (declined 維持):
  //   - permissionState === "denied" (browser 側もまだ拒否)
  //   - permissionState === "unsupported" (環境問題)
  //   - permissionState === "unavailable" (一時的問題)
  useEffect(() => {
    if (!shouldRecoverDeclined(effectiveOptInState, permissionState)) return;
    // recovery: declined → not_asked に降格、banner 再表示
    markNotAsked();
    setOptInRecord(readLocationOptIn());
  }, [permissionState, effectiveOptInState]);

  /**
   * 「位置情報を使う」押下時のフロー。
   *
   * 状態遷移:
   *   - 成功 → markGranted() + currentCoords 更新
   *   - PERMISSION_DENIED → markDeclined() (banner unmount)
   *   - timeout / unavailable → state 不変、bannerMode = "error" (再試行可能)
   *   - geolocation API 不在 → bannerMode = "error"
   *
   * 副作用: localStorage write、currentCoords / bannerMode / optInRecord 更新。
   */
  const handleLocationOptInGrant = useCallback(() => {
    setBannerMode("loading");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setBannerMode("error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          // CEO/GPT 2026-05-02 PR B-2d-c: accuracy + pos.timestamp を採取
          //   capturedAt = new Date(pos.timestamp).toISOString() が必須。
          //   maximumAge=5min により cached position が返る場合があり、その時の
          //   pos.timestamp は cache 取得時刻 (= 古い)。new Date() を使うと stale
          //   判定が破綻するため、必ず pos.timestamp を使う。
          setCurrentCoords({
            lat,
            lng,
            accuracy: Number.isFinite(pos.coords.accuracy)
              ? pos.coords.accuracy
              : null,
            capturedAt: Number.isFinite(pos.timestamp)
              ? new Date(pos.timestamp).toISOString()
              : null,
          });
          // Phase 2-A blocker fix (2026-05-20、CEO smoke で banner 非 dismiss を観測):
          //   旧実装は markGranted() + setOptInRecord(readLocationOptIn()) で localStorage
          //   round-trip 経由で state を更新。React 19 dev strict mode の double-render や
          //   何らかの race condition で read 値が stale になるケースがあり、banner が
          //   unmount されない事象を CEO local smoke で確認。
          //   in-memory state を直接 set してから localStorage に永続化する順序に変更。
          //   banner dismissal は in-memory state に依存、localStorage は次回 mount での復元用。
          const nowMs = Date.now();
          const grantedAt = new Date(nowMs).toISOString();
          markGranted(nowMs);
          setOptInRecord({
            state: "granted",
            grantedAt,
            updatedAt: grantedAt,
          });
          setBannerMode("normal"); // banner unmount するので reset しておく
        } else {
          // coords が NaN/Infinity (異常値) → error 扱い
          setBannerMode("error");
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          // Phase 2-A blocker fix: in-memory state 直接更新 (上記 grant 経路と同パターン)
          const updatedAt = new Date().toISOString();
          markDeclined();
          setOptInRecord({
            state: "declined",
            updatedAt,
          });
          setBannerMode("normal"); // banner unmount するので reset
        } else {
          // POSITION_UNAVAILABLE / TIMEOUT: state 不変、ユーザー再操作可能
          setBannerMode("error");
        }
      },
      { timeout: 5000, maximumAge: 5 * 60 * 1000, enableHighAccuracy: false },
    );
  }, []);

  /**
   * 「あとで」押下時のフロー。
   *
   * 副作用: markSnoozed() (7 日 snooze)、optInRecord 更新 → banner unmount。
   *
   * Phase 2-A blocker fix (2026-05-20、CEO smoke):
   *   in-memory state を直接 set して banner 即時 unmount を保証。
   *   localStorage 永続化は markSnoozed で別途 (次回 mount での復元用)。
   *   旧 setOptInRecord(readLocationOptIn()) は React 19 strict mode 等で race
   *   condition が起き、banner が unmount されないケースを観測したため変更。
   */
  const handleLocationOptInSnooze = useCallback(() => {
    const nowMs = Date.now();
    const snoozeUntil = new Date(nowMs + SNOOZE_DURATION_MS).toISOString();
    markSnoozed(nowMs);
    setOptInRecord({
      state: "snoozed",
      snoozeUntil,
      updatedAt: new Date(nowMs).toISOString(),
    });
    setBannerMode("normal");
  }, []);

  /**
   * 一度 granted になったユーザーの次回 mount 時自動取得。
   *
   * 厳格条件 (CEO/GPT 2026-05-02):
   *   - effectiveOptInState === "granted"
   *   - permissionState === "granted"  (prompt/unsupported/unavailable は対象外)
   *   - currentCoords 未取得
   *
   * permissionState が prompt/unsupported/unavailable の場合は自動取得しない。
   * ユーザー操作なしで browser permission ダイアログが出るリスクを避けるため。
   */
  useEffect(() => {
    if (effectiveOptInState !== "granted") return;
    if (permissionState !== "granted") return;
    if (currentCoords !== null) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          // CEO/GPT 2026-05-02 PR B-2d-c: 自動取得経路でも accuracy + pos.timestamp 採取
          setCurrentCoords({
            lat,
            lng,
            accuracy: Number.isFinite(pos.coords.accuracy)
              ? pos.coords.accuracy
              : null,
            capturedAt: Number.isFinite(pos.timestamp)
              ? new Date(pos.timestamp).toISOString()
              : null,
          });
        }
      },
      (err) => {
        if (cancelled) return;
        // browser 側で permission を後から denied にされたケース → declined に降格
        if (err.code === err.PERMISSION_DENIED) {
          markDeclined();
          setOptInRecord(readLocationOptIn());
        }
        // timeout / unavailable は黙って無視 (granted のまま、次回 mount で再試行)
      },
      { timeout: 5000, maximumAge: 5 * 60 * 1000, enableHighAccuracy: false },
    );
    return () => {
      cancelled = true;
    };
  }, [effectiveOptInState, permissionState, currentCoords]);

  /** βテスターフラグ（localStorage → API レスポンスで更新、制限バイパス用） */
  const [isBetaTester, setIsBetaTester] = useState<boolean>(() => {
    try {
      return localStorage.getItem(BETA_TESTER_KEY) === "1";
    } catch {
      return false;
    }
  });
  /** 今日の既存使用回数（localStorage から初期読み込み） */
  const [priorDailyCount, setPriorDailyCount] = useState<number>(() => readDailyUsage());
  const abortRef = useRef<AbortController | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Morning Session: 状態変更時に localStorage に保存
  useEffect(() => {
    if (!morningPhase) return; // セッション未開始なら保存しない
    saveMorningSession({
      date: getTodayJST(),
      phase: morningPhase,
      sessionId: morningSessionId,
      plan: morningPlan,
      rawInputs: morningRawInputs,
      parsedIntent: morningParsedIntent,
      sufficiency: morningSufficiency,
      personalizeHints: morningPersonalizeHints,
      planStateV2: morningPlanStateV2,
      ...(morningPipelineVersion ? { pipelineVersion: morningPipelineVersion } : {}),
      pendingClarify: morningPendingClarify,
      persistedEvents: morningPersistedEvents ?? undefined,
      // W3-PR-8 rev 3 commit 22b: dialogState を localStorage にも永続化
      //   タブ closing / reload を跨いでも focus 継承が切れないようにする。
      //   flag OFF では常に null のため spread 条件で field を省略。
      ...(morningDialogState ? { dialogState: morningDialogState } : {}),
    });
  }, [morningPhase, morningSessionId, morningPlan, morningRawInputs, morningParsedIntent, morningSufficiency, morningPersonalizeHints, morningPlanStateV2, morningPipelineVersion, morningPendingClarify, morningPersistedEvents, morningDialogState]);

  const sessionAlterCount = messages.filter((m) => m.role === "alter").length;
  const roundCount = priorDailyCount + sessionAlterCount;
  // βテスターは制限なし
  const limitReached = isBetaTester ? false : roundCount >= MAX_DAILY_ROUNDS;
  const remainingRounds = isBetaTester
    ? MAX_DAILY_ROUNDS // βテスターには常に最大値を表示（実質無制限）
    : Math.max(0, MAX_DAILY_ROUNDS - roundCount);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading || limitReached) return;

    // Abort previous request if any
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg: AlterMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setError(null);
    setLastIsEmotional(isEmotionalQuestion(trimmed));

    try {
      const homeCtx = optionsRef.current?.homeContext;

      const res = await fetch("/api/stargazer/alter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          sessionId: sessionId ?? undefined,
          message: trimmed,
          mode: "warm",
          source: "home",
          ...(homeCtx ? { homeContext: homeCtx } : {}),
          // Morning Protocol: 進行中セッションの状態を送信
          // P0-1: parsedIntent / rawInputs / sufficiency もターン間で保持する
          ...(morningPhase && !["completed", "skipped"].includes(morningPhase) ? {
            morningSession: {
              sessionId: morningSessionId ?? undefined,
              phase: morningPhase,
              plan: morningPlan ?? undefined,
              rawInputs: morningRawInputs,
              personalizeHints: morningPersonalizeHints,
              parsedIntent: morningParsedIntent ?? undefined,
              sufficiency: morningSufficiency ?? undefined,
              planStateV2: morningPlanStateV2 ?? undefined,
              // W3-PR-6: v2 stickiness を route に返送する
              ...(morningPipelineVersion ? { pipelineVersion: morningPipelineVersion } : {}),
              // W3-PR-7 Commit 2: dialog state を route に返送する
              ...(morningPendingClarify ? { pendingClarify: morningPendingClarify } : {}),
              ...(morningPersistedEvents ? { persistedEvents: morningPersistedEvents } : {}),
              // W3-PR-8 rev 3 commit 22b: DialogState v2 を route に返送する
              //   この 1 箇所が欠けていたため commit 22 の focus 継承が発動せず、
              //   2026-04-22 preview で全 turn prev_focus=null 恒常 fallback。
              ...(morningDialogState ? { dialogState: morningDialogState } : {}),
            },
          } : {}),
          // Soft Bridge: 直前のAlter返答がSoft Bridge確認だったか
          ...(softBridgePending ? { softBridgePending: true } : {}),
          // CEO 2026-04-28 Option B: browser geolocation 由来の現在地座標。
          //   server で home anchor の優先 1 として採用される。
          //   取得に失敗 / 拒否されていれば送らない（registered home が代替）。
          // CEO/GPT 2026-05-02 PR B-2d-c: accuracy / capturedAt も同送し、
          //   server 側 evaluateCurrentLocation で gating 判定 (低精度 / stale を reject)。
          //   accuracy = m、capturedAt = pos.timestamp 由来 ISO 8601 (cached 対応必須)。
          ...(currentCoords
            ? {
                currentLat: currentCoords.lat,
                currentLng: currentCoords.lng,
                ...(currentCoords.accuracy != null
                  ? { accuracy: currentCoords.accuracy }
                  : {}),
                ...(currentCoords.capturedAt != null
                  ? { capturedAt: currentCoords.capturedAt }
                  : {}),
              }
            : {}),
          // CEO/GPT 2026-05-02 PR B-2d-a: permission state contract
          //   currentCoords も baseline home も解決できず origin が unknown に
          //   なる時の理由説明として server 側で使用。raw 5 値を保持。
          //   coords がある場合、permissionState に関係なく current が採用される。
          ...(permissionState ? { permissionState } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 429 && data.error === "daily_limit_reached") {
          // サーバー側で上限検出 — localStorage も同期
          writeDailyUsage(MAX_DAILY_ROUNDS);
          setPriorDailyCount(MAX_DAILY_ROUNDS);
          throw new Error("今日の無料ラリー上限に達しました");
        }
        throw new Error(data.error ?? `API error ${res.status}`);
      }

      const data = await res.json();

      // βテスターフラグを API レスポンスから取得し localStorage に永続化
      if (data.isBetaTester && !isBetaTester) {
        setIsBetaTester(true);
        try { localStorage.setItem(BETA_TESTER_KEY, "1"); } catch {}
      }

      const alterMsg: AlterMessage = {
        id: `alter-${Date.now()}`,
        role: "alter",
        content: data.response ?? "...",
        timestamp: new Date().toISOString(),
        // P1.9: PE出典データ（CEOアプローチ: 目立たなく小さく表示）
        ...(data.perspectiveSources?.length > 0 ? {
          perspectiveSources: data.perspectiveSources,
        } : {}),
      };

      if (!sessionId && data.sessionId) {
        setSessionId(data.sessionId);
      }

      // Store reasoning basis for WhyCard integration
      if (data.reasoningBasis) {
        setLastReasoningBasis(data.reasoningBasis);
      }

      // Store action shape and domain for post-response CTA
      if (data.decisionMetadata?.action_shape) {
        setLastActionShape(data.decisionMetadata.action_shape as ActionShape);
      } else if (data.queryContext?.judgment_skeleton?.action_shape) {
        setLastActionShape(data.queryContext.judgment_skeleton.action_shape as ActionShape);
      }
      if (data.queryContext?.domain) {
        setLastDomain(data.queryContext.domain);
      }
      if (data.responseId) {
        setLastResponseId(data.responseId);
      }
      if (data.feedbackMeta) {
        setLastFeedbackMeta(data.feedbackMeta);
      }
      // Alter→Counselor ソフト導線（恋愛ドメイン時にAPIが返す）
      if (data.counselorSoftLink) {
        setLastCounselorSoftLink(data.counselorSoftLink);
      } else {
        setLastCounselorSoftLink(null);
      }
      // Soft Bridge: レスポンスにフラグがあれば次ターンで確認応答を受け付ける
      setSoftBridgePending(!!data.softBridgePending);

      // Morning Protocol: プランデータ
      // P0-1: parsedIntent / rawInputs / sufficiency もターン間で保持する
      if (data.morningProtocol) {
        setMorningPhase(data.morningProtocol.phase);
        if (data.morningProtocol.sessionId) {
          setMorningSessionId(data.morningProtocol.sessionId);
        }
        if (data.morningProtocol.plan) {
          setMorningPlan(data.morningProtocol.plan);
          // Conversation Starter: 途中状態のアイテムを永続化（途中離脱復帰用）
          if (!data.morningProtocol.plan.confirmed && data.morningProtocol.plan.items?.length > 0) {
            import("@/lib/alter-morning/conversationStarter").then(({ savePartialItems }) => {
              savePartialItems(data.morningProtocol.plan.items);
            });
          }
        }
        // P0-1: 追加セッション状態の保存
        if (data.morningProtocol.rawInputs) {
          setMorningRawInputs(data.morningProtocol.rawInputs);
        }
        if (data.morningProtocol.parsedIntent !== undefined) {
          setMorningParsedIntent(data.morningProtocol.parsedIntent);
        }
        if (data.morningProtocol.sufficiency !== undefined) {
          setMorningSufficiency(data.morningProtocol.sufficiency);
        }
        if (data.morningProtocol.personalizeHints) {
          setMorningPersonalizeHints(data.morningProtocol.personalizeHints);
        }
        // v2: PlanState ラウンドトリップ
        if (data.morningProtocol.planStateV2 !== undefined) {
          setMorningPlanStateV2(data.morningProtocol.planStateV2);
        }
        // W3-PR-6: v2 pipelineVersion round-trip
        if (data.morningProtocol.pipelineVersion !== undefined) {
          setMorningPipelineVersion(
            data.morningProtocol.pipelineVersion === "v2" ? "v2" : null,
          );
        }
        // W3-PR-7 Commit 2: dialog state round-trip
        if (data.morningProtocol.pendingClarify !== undefined) {
          setMorningPendingClarify(data.morningProtocol.pendingClarify ?? null);
        }
        if (data.morningProtocol.persistedEvents !== undefined) {
          setMorningPersistedEvents(data.morningProtocol.persistedEvents ?? null);
        }
        // W3-PR-8 rev 3 commit 22b: DialogState v2 round-trip 受信側
        //   server が flag ON 時のみ field を出力する（route.ts L9363-9365）。
        //   undefined check (!== undefined) で「field 省略」と「null リセット」を
        //   区別する。flag OFF では常に省略のため setter は走らない = baseline 不変。
        if (data.morningProtocol.dialogState !== undefined) {
          setMorningDialogState(data.morningProtocol.dialogState ?? null);
        }
        // A1-5-8-3: capture candidate surface を **client boundary で redacted DTO に抽出**して保持。
        //   selectMorningProtocolCaptureCandidate は morningProtocol.captureCandidate のみ読み、
        //   source_ref/UUID/raw を drop（redaction core 共有）。captureCandidate absent → undefined（毎 turn 再導出＝
        //   候補消滅時はクリア）。既存 plan/dialogState handling は上で完了済み・本行は read-only 追加（壊さない）。
        setMorningCaptureCandidate(selectMorningProtocolCaptureCandidate(data));
      }

      // localStorage の日次カウントを更新（βテスターはカウント不要だが記録は残す）
      const newTotal = priorDailyCount + sessionAlterCount + 1;
      writeDailyUsage(newTotal);

      setMessages((prev) => [...prev, alterMsg]);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message ?? "接続に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [loading, limitReached, sessionId, isBetaTester, morningPhase, morningPlan, morningRawInputs, morningParsedIntent, morningSufficiency, morningPersonalizeHints, morningPlanStateV2, morningPipelineVersion, morningPendingClarify, morningPersistedEvents, morningDialogState]);

  /**
   * W3-PR-9 commit 5c: Place candidate 選択ハンドラ。
   *
   * 契約（CEO 2026-04-23）:
   *   1. picker は `status === "search_candidates_presented" && activePresentation !== null`
   *      でのみ mount される前提。このハンドラも同条件を guard する。
   *   2. optimistic update しない — server canonical response のみ state を進める。
   *   3. pending 中（placeSelectionPending != null）は no-op（再クリック禁止）。
   *   4. stale-response guard: 応答到着時に dialogState の
   *      activePresentation.targetEventId/queryFingerprint が一致しない場合は破棄。
   *      user が mid-flight で別 turn を進めたケース対策。
   *   5. accepted=false は無害な no-op（error UI 出さない）。
   *   6. accepted=true は canonical morningSession で dialogState + events を置換。
   */
  const selectPlaceCandidate = useCallback(async (selectedPlaceId: string) => {
    const curr = morningDialogStateRef.current;
    if (!curr) return;
    if (curr.conversationStatus !== "search_candidates_presented") return;
    const active = curr.activePresentation;
    if (!active) return;
    if (!active.candidates.some((c) => c.placeId === selectedPlaceId)) return;
    // Race guard: 既に pending ならスキップ（UI 側 disabled だが defense in depth）
    if (placeSelectionPending !== null) return;

    // 旧 selection を abort（同時多重送信防止）
    selectionAbortRef.current?.abort();
    const controller = new AbortController();
    selectionAbortRef.current = controller;

    // Request 時点の fingerprint を capture（stale check 用）
    const requestTargetEventId = active.targetEventId;
    const requestFingerprint = active.queryFingerprint;
    const requestTurnIndex = active.presentedAtTurn + 1;

    setPlaceSelectionPending(selectedPlaceId);

    try {
      const morningSession = {
        ...(morningSessionId ? { sessionId: morningSessionId } : {}),
        ...(morningPhase ? { phase: morningPhase } : {}),
        dialogState: curr,
        persistedEvents: morningPersistedEvents ?? [],
        ...(morningPlan ? { plan: morningPlan } : {}),
        rawInputs: morningRawInputs,
        ...(morningParsedIntent ? { parsedIntent: morningParsedIntent } : {}),
        ...(morningSufficiency ? { sufficiency: morningSufficiency } : {}),
        personalizeHints: morningPersonalizeHints,
        ...(morningPlanStateV2 ? { planStateV2: morningPlanStateV2 } : {}),
        ...(morningPipelineVersion ? { pipelineVersion: morningPipelineVersion } : {}),
        ...(morningPendingClarify ? { pendingClarify: morningPendingClarify } : {}),
      };

      const res = await fetch("/api/stargazer/alter/selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          turnIndex: requestTurnIndex,
          targetEventId: requestTargetEventId,
          queryFingerprint: requestFingerprint,
          selectedPlaceId,
          morningSession,
          // CEO 2026-04-28 Option B: 現在地座標（home anchor 優先 1）。
          //   selection endpoint で travel item の home segment 生成に使う。
          // CEO/GPT 2026-05-02 PR B-2d-c: accuracy / capturedAt も同送 (gating 用)
          ...(currentCoords
            ? {
                currentLat: currentCoords.lat,
                currentLng: currentCoords.lng,
                ...(currentCoords.accuracy != null
                  ? { accuracy: currentCoords.accuracy }
                  : {}),
                ...(currentCoords.capturedAt != null
                  ? { capturedAt: currentCoords.capturedAt }
                  : {}),
              }
            : {}),
        }),
      });

      if (!res.ok) {
        console.warn("[selection] http error", res.status);
        return;
      }

      const data = await res.json().catch(() => null);
      if (!data) return;

      // Stale-response guard: response 到着時点で dialogState が別の presentation に
      // 移動していたら（または null になっていたら）この response は stale。破棄する。
      const latest = morningDialogStateRef.current;
      const stillSame =
        latest?.activePresentation?.targetEventId === requestTargetEventId &&
        latest?.activePresentation?.queryFingerprint === requestFingerprint;
      if (!stillSame) {
        console.info("[selection] stale response discarded");
        return;
      }

      if (!data.accepted) {
        // accepted=false は normal no-op（picker は次 server turn で unmount される）
        console.info("[selection] rejected", data.reason);
        // CEO/GPT 2026-05-03 PR B-3c-2 (GPT 1st 補正 #3): journey_origin promotion
        //   blocked 時は user に inline feedback を表示 (= 半壊 UX 防止)。
        //   activePresentation は維持されるため picker は閉じない。user が次 candidate
        //   を選ぶか「適切な候補なし」 の場合は cancel する。
        //   文言は技術用語回避 (= "coordinates" 等を出さない)。
        if (data.reason === "journey_anchor_promotion_not_possible") {
          setPlaceSelectionFeedback(
            "この候補は移動に必要な位置情報が不足しています。別の候補を選ぶか、場所をもう少し具体的に教えてください。",
          );
          // 5 秒後 auto-clear (= picker 維持で再選択促す)
          setTimeout(() => setPlaceSelectionFeedback(null), 5000);
        }
        return;
      }
      // accepted=true: 過去の reject feedback をクリア
      setPlaceSelectionFeedback(null);

      // accepted=true: canonical morningSession で置換
      //
      // CEO 2026-04-26 root-cause fix:
      //   旧実装は dialogState / persistedEvents / phase / plan の **4 fields のみ**
      //   propagate していた。pendingClarify を含む 7 fields が落ちており、
      //   selection で server が pendingClarify={slot:"transport"} を返しても
      //   client state は更新されず、次 turn の chat で stale pendingClarify が
      //   送られて Branch A (canBind) が起動せず Branch B fresh comprehension に
      //   落ちて「09:00のカフェはどのあたり？」 clarify が再発していた。
      //
      //   applySelectionMorningSession (hooks/applySelectionResponse.ts) は
      //   chat response handler (L457-) と同等の field set を propagate する。
      //   テスタビリティのため pure 関数として切り出してある。
      if (data.morningSession) {
        applySelectionMorningSession(data.morningSession, {
          setMorningDialogState,
          setMorningPersistedEvents,
          setMorningPhase,
          setMorningPlan,
          setMorningPendingClarify,
          setMorningRawInputs,
          setMorningParsedIntent,
          setMorningSufficiency,
          setMorningPersonalizeHints,
          setMorningPlanStateV2,
          setMorningPipelineVersion,
        });
      }

      // W3-PR-10 positive-path nudge: 1件目 place 確定直後に Alter から次の場所を自然に問う。
      // server 側 narrow trigger で gate 済（transportV2 flag ON + 0→1 place diff + !multiple + !endSignal）。
      // DB dialogues 永続化は初版では行わない（UI 表示のみ）。
      if (typeof data.alterFollowUp?.text === "string" && data.alterFollowUp.text.length > 0) {
        const followUpMsg: AlterMessage = {
          id: `alter-${Date.now()}-followup`,
          role: "alter",
          content: data.alterFollowUp.text,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, followUpMsg]);
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      console.warn("[selection] error", err);
    } finally {
      setPlaceSelectionPending(null);
      if (selectionAbortRef.current === controller) {
        selectionAbortRef.current = null;
      }
    }
  }, [placeSelectionPending, morningSessionId, morningPhase, morningPersistedEvents, morningPlan, morningRawInputs, morningParsedIntent, morningSufficiency, morningPersonalizeHints, morningPlanStateV2, morningPipelineVersion, morningPendingClarify]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    selectionAbortRef.current?.abort();
    setMessages([]);
    setLoading(false);
    setSessionId(null);
    setError(null);
    setLastReasoningBasis(null);
    setLastActionShape(null);
    setLastDomain(null);
    setLastIsEmotional(false);
    setLastResponseId(null);
    setLastFeedbackMeta(null);
    setLastCounselorSoftLink(null);
    setMorningPlan(null);
    setMorningPhase(null);
    setMorningSessionId(null);
    // P0-1: 追加状態もリセット
    setMorningRawInputs([]);
    setMorningParsedIntent(null);
    setMorningSufficiency(null);
    setMorningPersonalizeHints([]);
    // W3-PR-8 rev 3 commit 22b: DialogState v2 も reset でクリア
    setMorningDialogState(null);
    // W3-PR-9 commit 5c: pending selection もクリア
    setPlaceSelectionPending(null);
    // セッション永続化もクリア
    clearMorningSession();
  }, []);

  /** メッセージを外部から注入（リミット通知などAPI不使用の返答） */
  const injectMessage = useCallback((content: string, role: "user" | "alter" = "alter") => {
    const msg: AlterMessage = {
      id: `${role}-${Date.now()}`,
      role,
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, msg]);
    if (role === "alter") setLoading(false);
  }, []);

  return {
    messages,
    loading,
    sessionId,
    error,
    roundCount,
    limitReached,
    /** 今日の残りラリー数 */
    remainingRounds,
    sendMessage,
    injectMessage,
    reset,
    /** 思考中のリクエストを中断 */
    abort: () => { abortRef.current?.abort(); },
    isActive: messages.length > 0,
    /** βテスターか（制限バイパス中） */
    isBetaTester,
    /** 直近の Alter 応答の推論根拠（WhyCard 連携用） */
    lastReasoningBasis,
    /** 直近の action_shape（体験接続CTA用） */
    lastActionShape,
    /** 直近の質問ドメイン（機能ブリッジ用） */
    lastDomain,
    /** 直近の質問が感情質問だったか */
    lastIsEmotional,
    /** 直近のresponse_id（フィードバック紐付け用） */
    lastResponseId,
    /** 直近のフィードバック用メタデータ */
    lastFeedbackMeta,
    /** Alter→Counselor ソフト導線（恋愛ドメイン時） */
    lastCounselorSoftLink,
    /** Morning Protocol: プランデータ */
    morningPlan,
    /** Morning Protocol: 現在フェーズ */
    morningPhase,
    /** A1-5-8-3: capture candidate surface（redacted DTO・absent→undefined・banner 非表示／既存 UI 不変） */
    morningCaptureCandidate,
    /** Morning Protocol: プランを更新（UI操作後） */
    setMorningPlan,
    /** Morning Protocol: パーソナライズヒント（性格ベースの提案含む） */
    morningPersonalizeHints,
    /**
     * W3-PR-9 commit 5c: DialogState v2（picker の条件描画に使う）。
     * `conversationStatus === "search_candidates_presented" && activePresentation !== null`
     * のときだけ picker を mount する。
     */
    morningDialogState,
    /**
     * W3-PR-9 commit 5c: place 候補選択ハンドラ。placeId のみ受け取り、
     * server canonical response で dialogState + events を置換する。
     */
    selectPlaceCandidate,
    /**
     * W3-PR-9 commit 5c: 送信中の placeId（null なら非送信中）。
     * picker に pending flag として渡して全ボタン disable する。
     */
    placeSelectionPending,
    /**
     * CEO/GPT 2026-05-03 PR B-3c-2 (GPT 1st 補正 #3): selection 失敗時の inline feedback 文言。
     * picker 上部に inline message として表示することで「選んだのに変わらない」
     * 半壊 UX を防ぐ。null の時は picker は何も追加表示しない。
     */
    placeSelectionFeedback,
    /**
     * W3-PR-13 M3: persisted comprehension events（MorningMapView の pin source）。
     * 既存 internal state (L218) をそのまま expose（非破壊 export）。
     * 読み取り戦略 β: plan.items[].location は rebuildPlan (transportV2 flag 依存)
     * 経由なので、flag OFF でも map が描画できるよう events から直接読む。
     */
    morningPersistedEvents,
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PR B-2d-b: location opt-in banner state + handlers (CEO/GPT 2026-05-02)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    /** banner を表示するか (= effectiveOptInState === "not_asked") */
    showLocationOptInBanner,
    /** banner の表示モード (normal / loading / error) */
    locationOptInBannerMode: bannerMode,
    /** 「位置情報を使う」押下時のハンドラ */
    handleLocationOptInGrant,
    /** 「あとで」押下時のハンドラ */
    handleLocationOptInSnooze,
  } as const;
}
