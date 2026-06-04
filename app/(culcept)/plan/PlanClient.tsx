"use client";

/**
 * PlanClient — Alter Plan UI root (W1-5 + W1-X1 + W1-X3 + W1-Home-Swipe Phase 1)
 *
 * 設計書:
 *   - docs/alter-plan-w15-ui-mini-design.md (3 レンズ)
 *   - docs/alter-plan-w1x1-mini-design.md (Add/Delete UI)
 *   - docs/alter-plan-w1x3-cell-add-mini-design.md (cell add 導線)
 *   - docs/alter-plan-home-swipe-full-plan-pane-mini-design.md (Phase 1 設計)
 *
 * 責務:
 *   - GET /api/plan/anchors を 1 回 fetch（mount 時）+ POST/DELETE 成功時に refetch
 *   - tab state を管理
 *   - empty / loading / error を中央で扱う
 *   - 3 tab に共通データ (anchors[]) + onAddRequest callback を渡す
 *   - "+ 教える" / "📋 教えた予定" の 2 modal を制御
 *   - W1-X3: pending initialState / contextSubtitle を modal に渡す
 *
 * W1-Home-Swipe Phase 1 (2026-05-20):
 *   - `displayMode?: "route" | "pane"` prop で chrome 出し分け
 *   - route mode (default): /plan 直 URL 経由の単独画面、従来 chrome
 *   - pane mode: Home 横スワイプ pane 1 として embed、簡素 chrome、薄紫 gradient
 *   - fetch / Modal / tab logic は両 mode 共通 (機能差分なし)
 *   - /plan 直 URL は従来通り route mode で render される
 *
 * 範囲外 (Phase 1):
 *   - CalendarTab を月ビュー化 (現週ビュー継続、Phase 2)
 *   - FlowTab を image thumbnail 化 (Phase 2)
 *   - MapTab Google Maps integration (Phase 2)
 *   - 空き日 → ALTER 提案 flow (Phase 3)
 *   - DraftPlan / W1-6 passive drift logging
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// P3-A-1-1-h: Google Calendar OAuth banner 用 (= URL query 読み取り + clean 化)
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  GlassBadge,
  GlassButton,
  GlassCard,
  Skeleton,
} from "@/components/ui/glassmorphism-design";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { ExternalAnchorSource } from "@/lib/plan/external-anchor-source";
import { fetchAnchors, type AnchorFetchResult } from "@/lib/plan/anchor-fetch";
import type { PlanDayIndicator } from "@/lib/plan/planDayIndicatorReader";
import { dayIndicatorsByDate } from "@/lib/plan/dayIndicatorView";
import type { AnchorFormState } from "@/lib/plan/anchor-input-form";
// ── Phase 3-J-6e-1 / J-6e-2: Proposal 接続 ──
// 注: TestOverrideContext は import しない (= production import 禁止)。
//     dev/smoke 用 bypass は本 file で行わない (= 既存 unit test の testOverride 経路で対応)。
//
// J-6e-1 範囲: read-only display (= proposalsByDate を CalendarTab/MapTab に渡すだけ)
// J-6e-2 範囲: dismiss callback wiring
//   - 「無視」 link tap → recordDismissToStorage で localStorage write
//   - dismissEvents state refresh → useMemo proposalsByDate 再計算 → chip 静かに消える
//   - 7 日 cross-day memory (= 既存 dismissLog filter) で再表示抑制
//   - 24h dismiss 3+ で Theory-of-Mind Pause 自然発動 (= computeProposals 内 gate)
// J-6e-3 範囲: accept transaction + Quiet Undo Window
//   - 5-layer dup defense (L1 ref guard / L2 state lock / L3 in-session / L4 source.notes 由来 / L5 limit)
//   - subtle pending UX (= opacity-60 + pointer-events-none + aria-busy)
//   - 5 分 Quiet Undo (= 「戻す」 link、 警告色なし)
// J-6e-4 範囲 (= 本 commit): modify + AddAnchorModal wiring
//   - 「教え直す」 link tap → proposalDraftToFormState で prefill → openAdd で modal 起動
//   - localStorage 書込なし (= write key 2 種固定維持)
//   - source.notes trace baked しない (= accept と独立 sentiment)
//   - Aneurasync 思想: 「Alter の見立てを編集して取り入れる」 は user の意思決定 (= 通常の手動入力と区別不可な anchor を生成)
import {
  createStorageBackedDismissLogReader,
  getBrowserDismissStorage,
  recordDismissToStorage,
} from "@/lib/plan/proposal/dismissAction";
import type { DismissLogEntry } from "@/lib/plan/proposal/dismissLog";
import { computeProposals } from "@/lib/plan/proposal/computeProposals";
import {
  computeFirstUseDateFromAnchors,
  groupProposalsByDate,
} from "@/lib/plan/proposal/planClientProposalHelpers";
// 8b-7-B: List 新表示 flag (= header/subtitle/button/bg を flag ON で mock 整合に切替)
import { LIST_NEW_TIMELINE_ENABLED } from "@/lib/plan/list/featureFlags";

// ── Phase 3-N Map impl 9 closeout: MAP_NEW_SURFACE_ENABLED 削除済み、 Map 単一 path 化 ──
//   Map tab は常に新 shell。 List は LIST_NEW_TIMELINE_ENABLED で別管理 (= 既存維持)。
//   Calendar は LIST flag に乗っかる形 (= 既存挙動継続)。
import type { ProposedAnchor } from "@/lib/plan/proposal/proposalTypes";
// J-6e-3: accept transaction + Quiet Undo Window
import { acceptProposal } from "@/lib/plan/proposal/acceptProposal";
import { extractAcceptedProposalIdsFromSources } from "@/lib/plan/proposal/acceptedFromSources";
import { buildAnchorInputFromProposal } from "@/lib/plan/proposal/proposalToAnchorInput";
import {
  buildUndoRecord,
  filterActiveUndos,
  recordUndoToStorage,
  undoProposalAccept,
  type UndoRecord,
} from "@/lib/plan/proposal/quietUndoWindow";
// J-6e-4: modify path (= AddAnchorModal を proposal draft で prefill)
import { proposalDraftToFormState } from "@/lib/plan/proposal/proposalToFormState";
// K-2: DayGraph (= Layer 0、 computed projection) を PlanClient で計算
// K-3c-0: visible date window を計算対象に拡張 (= FlowTab 7 day + CalendarTab 選択週 +
//          recurring-only day 等を carve in)。 既存 UI に影響しない (= entry が増えるだけ)。
import {
  buildVisibleDateWindow,
  collectAnchoredDateStrings,
  computeDayGraphMapForAnchors,
} from "@/lib/plan/dayGraph/planClientDayGraphHelpers";
import type { BuildDayGraphResult } from "@/lib/plan/dayGraph/dayGraphTypes";

import { AddAnchorModal } from "./components/AddAnchorModal";
import { AnchorDetailModal } from "./components/AnchorDetailModal";
import { EditAnchorModal } from "./components/EditAnchorModal";
// P3 W2: .ics import modal (= CEO 2026-05-26、 review/approve UI)
import { IcsImportModal } from "./components/IcsImportModal";
// S1: 在 app シフト表取込 入口（flag gating・NEXT_PUBLIC_PLAN_SHIFT_IMPORT_ENTRY_ENABLED）
import { PlanShiftImportEntry } from "./components/PlanShiftImportEntry";
// P3-A-1-1-h: Google Calendar OAuth 結果 banner (= callback redirect 後の user feedback)
import {
  CalendarConnectBanner,
  parseBannerStatus,
} from "./components/CalendarConnectBanner";
import { SourceListModal } from "./components/SourceListModal";
import { CalendarTab } from "./tabs/CalendarTab";
import { FlowTab } from "./tabs/FlowTab";
import { MapTab } from "./tabs/MapTab";
import { anchorsForDay, formatJpDate, isoDate, utcMidnight } from "./tabs/_helpers";
import { shouldUseComposeSheet } from "@/lib/plan/compose/composeGate";
import { AddAnchorComposeContainer } from "./components/compose/AddAnchorComposeContainer";
import { anchorsToTimelineBlocks } from "./components/compose/anchorsToTimelineBlocks";
import {
  extractLocationUsages,
  type LocationUsage,
} from "@/lib/plan/compose/locationHistory";
import {
  anchorsToComposeEditable,
  type ComposeEditable,
} from "@/lib/plan/compose/composeEdit";
import type { TimelineBlock } from "./components/compose/DayTimelineCanvas";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type PlanTab = "calendar" | "flow" | "map";

// Phase 1 C2 (2026-05-20): tab label を CEO mock 寄せ ("Flow"→"リスト"、"聖地"→"地図")
// 旧 hint subtitle は pill segmented design では表示しない (mock 整合)。
// `key` は不変、内部の CalendarTab / FlowTab / MapTab には影響なし。
const TABS: ReadonlyArray<{
  key: PlanTab;
  label: string;
}> = [
  { key: "calendar", label: "カレンダー" },
  { key: "flow", label: "リスト" },
  { key: "map", label: "マップ" }, // 8b-9: CEO 「地図 → マップ」
];

type FetchState =
  | { kind: "loading" }
  | {
      kind: "ok";
      sources: ExternalAnchorSource[];
      anchors: ExternalAnchor[];
      /** 休み/希望休 day-level 印（SR #216 D2。timeline event でなく day-level metadata） */
      dayIndicators: PlanDayIndicator[];
    }
  | { kind: "error"; message: string; status: number };

/** W1-X3: cell add 起動時の pre-fill */
export interface AddRequest {
  initial?: Partial<AnchorFormState>;
  subtitle?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** display mode (Phase 1 で追加) */
export type PlanDisplayMode = "route" | "pane";

export interface PlanClientProps {
  /**
   * display mode (W1-Home-Swipe Phase 1):
   *   - "route" (default): /plan 直 URL 経由、full chrome (min-h-screen)
   *   - "pane": Home 横スワイプ pane 1、簡素 chrome (h-full overflow-y-auto)
   *
   * 両 mode で機能は完全同等。chrome / 配色のみ差分。
   */
  displayMode?: PlanDisplayMode;
  /**
   * A-4b: 予定追加 compose 体験を使うか。server（plan/page.tsx）が PLAN_FLAGS を
   * 読み取り prop で渡す（PLAN_FLAGS は server-only のため client 直読み不可）。default false。
   */
  composeTimelineEnabled?: boolean;
  /**
   * S3A-2-2-1: 在app入口の live VLM 下書き抽出を許可するか。server（plan/page.tsx）が
   * PLAN_FLAGS.shiftDraftLiveEnabled を読み prop で渡す（server-only flag・client 直読み不可）。
   * default false。S3A-2-2-1 は plumbing のみ＝この prop で live UI はまだ出さない。
   */
  draftLiveEnabled?: boolean;
  /**
   * S3A-2-2-2: 在app live draft flow の VLM 入力モード（combined-biased）。server（plan/page.tsx）が
   * PLAN_SHIFT_VLM_INPUT_MODE を resolveShiftDraftVlmInputMode で正規化し prop で渡す。default combined。
   * 注: action 側は split-bias なので client==action には env を明示設定（smoke で combined）。
   */
  shiftDraftVlmInputMode?: "split" | "combined";
  /**
   * S-save-2: 在app live draft 確認画面の保存導線を出すか（server-only flag PLAN_SHIFT_IMPORT_SAVE）。
   * server（plan/page.tsx）が PLAN_FLAGS.shiftImportSave を読み prop で渡す（client 直読み禁止）。
   * **default false で dormant**（保存ボタン無効・action 未呼出・DB write なし）。本番既定 OFF。
   */
  shiftImportSaveEnabled?: boolean;
}

export default function PlanClient({
  displayMode = "route",
  composeTimelineEnabled = false,
  draftLiveEnabled = false,
  shiftDraftVlmInputMode = "combined",
  shiftImportSaveEnabled = false,
}: PlanClientProps = {}) {
  const isPane = displayMode === "pane";

  const [activeTab, setActiveTab] = useState<PlanTab>("calendar");

  // ── 9 closeout corrective (= 2026-05-25 CEO 「最新の状態に」): useNewShell = true 固定 ──
  //   旧 (= MAP smoke 期間): MAP_NEW_SURFACE_ENABLED の副作用で全 tab 新 shell
  //   9 closeout 直後: useNewShell = LIST || activeTab === "map" で List/Calendar 旧 shell に戻った (= bug)
  //   corrective: useNewShell = true 固定で全 tab 常に新 shell (= 「最新の状態」 復元)
  //   LIST_NEW_TIMELINE_ENABLED は引き続き保持 (= List unit 別管理、 削除は別 closeout)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _listFlagPlaceholder = LIST_NEW_TIMELINE_ENABLED;
  const useNewShell: boolean = true;
  const [state, setState] = useState<FetchState>({ kind: "loading" });
  const [addOpen, setAddOpen] = useState(false);
  const [addInitial, setAddInitial] = useState<Partial<AnchorFormState> | undefined>(undefined);
  const [addSubtitle, setAddSubtitle] = useState<string | undefined>(undefined);
  const [listOpen, setListOpen] = useState(false);
  // P3 W2: .ics import modal state (= CEO 2026-05-26、 「カレンダーから取り込む」 entry)
  const [icsImportOpen, setIcsImportOpen] = useState(false);

  // P3-A-1-1-h: Google Calendar OAuth callback redirect 後の banner status
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const bannerStatus = useMemo(
    () => parseBannerStatus(searchParams),
    [searchParams],
  );
  // banner dismiss / retry 後、 URL から calendar_* query を消す (= 二重 trigger 防止)
  const clearCalendarQuery = useCallback(() => {
    if (!pathname) return;
    const next = new URLSearchParams(searchParams.toString());
    let touched = false;
    for (const key of [
      "calendar_connected",
      "calendar_connect_error",
      "calendar_connect_partial",
      "google_error",
    ]) {
      if (next.has(key)) {
        next.delete(key);
        touched = true;
      }
    }
    if (touched) {
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [pathname, router, searchParams]);
  const handleBannerRetry = useCallback(() => {
    clearCalendarQuery();
    setIcsImportOpen(true);
  }, [clearCalendarQuery]);
  // W1-X2: edit modal state
  const [editAnchor, setEditAnchor] = useState<ExternalAnchor | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  // W1-X5: detail modal state
  const [detailAnchor, setDetailAnchor] = useState<ExternalAnchor | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // ── Phase 3-J-6e-1: Proposal state (= read-only) ──
  //
  // SSR hydration safety: now / dismissEvents は mount 後に確定 (= initial null / [])。
  // server render は always empty proposalsByDate → client mount 後 useEffect で localStorage read。
  // ProposalChip は callback 未渡し (= 非 interactive、 J-6e-2/3/4 で wiring 予定)。
  //
  // Onboarding Quietude (= Invariant 36): 利用初期 7 日 silent。
  // dev/smoke で proposal を確認するには:
  //   - anchor を confirmedAt 30 日以上前で fixture inject (= API 経由)
  //   - もしくは unit test の testOverride.forceOnboardingPhase="normal_30d_plus" を使用
  // (= 詳細は commit message 参照)
  const [now, setNow] = useState<Date | null>(null);
  const [dismissEvents, setDismissEvents] = useState<
    ReadonlyArray<DismissLogEntry>
  >([]);

  useEffect(() => {
    // mount 後に now / dismissEvents を確定 (= SSR mismatch 防止)
    setNow(new Date());
    const storage = getBrowserDismissStorage();
    if (storage) {
      const reader = createStorageBackedDismissLogReader(storage);
      setDismissEvents(reader.readAll());
    }
  }, []);

  const proposalsByDate = useMemo<
    Readonly<Record<string, ReadonlyArray<ProposedAnchor>>>
  >(() => {
    if (!now) return {}; // SSR / mount 前 → 空
    if (state.kind !== "ok") return {};
    const nowIso = now.toISOString();
    const firstUseDate = computeFirstUseDateFromAnchors(state.anchors, nowIso);
    const result = computeProposals({
      anchors: state.anchors,
      now: nowIso,
      firstUseDate,
      dismissEvents,
      // testOverride は production code path では渡さない (= Invariant 38)
    });
    return groupProposalsByDate(result.proposals);
  }, [now, state, dismissEvents]);

  // ── Phase 3-J-6e-2: dismiss callback (= localStorage write、 silent preference) ──
  //
  // 不変原則 (= CEO 指示 + 思想整合):
  //   - silent: 通知 / トーストなし、 「無視しました」 系コピー禁止
  //   - sentiment 中立: dismiss しても source.notes / anchor は不変
  //   - immediate refresh: setDismissEvents で useMemo 再計算 → chip 静かに消える
  //   - 7 日 cross-day memory (= 既存 dismissLog filter で再表示抑制)
  //   - 24h dismiss 3+ で Theory-of-Mind Pause 自然発動 (= 別 commit ではなく既存 computeProposals 内 gate)
  //
  // 注:
  //   - SSR / non-browser env では getBrowserDismissStorage が null を返し、 silent no-op
  //   - 同 proposal 連続 dismiss は localStorage に entry 2 件追加するが count >= 3 gate で harmless
  //   - localStorage write key は `aneurasync.plan.proposalDismiss.v1` のみ
  const handleProposalDismiss = useCallback((proposal: ProposedAnchor) => {
    const storage = getBrowserDismissStorage();
    if (!storage) return; // SSR / non-browser → silent
    recordDismissToStorage(storage, {
      proposal,
      dismissedAt: new Date().toISOString(),
    });
    // 即座に dismissEvents state 更新 → useMemo proposalsByDate 再計算 → chip 消える
    const reader = createStorageBackedDismissLogReader(storage);
    setDismissEvents(reader.readAll());
  }, []);

  // ── Phase 3-J-6e-3: accept transaction + Quiet Undo Window ──
  //
  // 二重作成防止 (= CEO 補正 1):
  //   L1: useRef synchronous guard (= acceptingRef、 React batching を超えて即時 reject)
  //   L2: useState UI 反映 (= acceptingProposalIds、 subtle pending 表示用)
  //   L3: in-session suppression (= inSessionAcceptedIds、 accept 成功直後 chip 即除外)
  //   L4: source.notes 由来 suppression (= reload-safe、 補正 2 で導入)
  //   L5: server-side idempotency なし (= 限界、 Phase 3-K)
  //
  // Transaction order (= CEO 補正 3 厳守):
  //   1. ref guard check (sync)
  //   2. state lock + ref lock
  //   3. buildAnchorInputFromProposal (= pure)
  //   4. acceptProposal API call
  //   5. on success: recordUndoToStorage (= proposalUndo localStorage key)
  //   6. setInSessionAcceptedIds (= chip 即消滅)
  //   7. refreshUndoRecords (= 「戻す」 link 表示用)
  //   8. await load() (= anchors refetch、 source.notes 経由 reload-safe suppress 確定)
  //   9. finally: ref/state lock 解放
  //
  // dismiss log には書かない (= 「採用は試行、 戻すも観察」 思想、 Theory-of-Mind 分離)
  const acceptingRef = useRef<Set<string>>(new Set());
  const undoingRef = useRef<Set<string>>(new Set());
  const [acceptingProposalIds, setAcceptingProposalIds] = useState<
    ReadonlySet<string>
  >(new Set());
  const [inSessionAcceptedIds, setInSessionAcceptedIds] = useState<
    ReadonlySet<string>
  >(new Set());
  const [recentUndoRecords, setRecentUndoRecords] = useState<
    ReadonlyArray<UndoRecord>
  >([]);
  const [undoTick, setUndoTick] = useState(0); // 1 分 tick で undo 期限自動失効反映

  // undo records 再計算 helper
  const refreshUndoRecords = useCallback(() => {
    const storage = getBrowserDismissStorage();
    if (!storage) {
      setRecentUndoRecords([]);
      return;
    }
    setRecentUndoRecords(filterActiveUndos(storage, new Date().toISOString()));
  }, []);

  // mount 後 + 1 分 tick で undo records 自動 refresh
  useEffect(() => {
    refreshUndoRecords();
    const interval = setInterval(() => {
      setUndoTick((t) => t + 1);
    }, 60_000);
    return () => clearInterval(interval);
  }, [refreshUndoRecords]);

  // undoTick 更新時に records refresh (= 5 分超過 record 自動消滅)
  useEffect(() => {
    if (undoTick === 0) return; // 初回 mount は別 useEffect で済
    refreshUndoRecords();
  }, [undoTick, refreshUndoRecords]);

  // sources から accept 済 proposalId を server-derived で抽出 (= 補正 2、 reload-safe)
  const serverDerivedAcceptedIds = useMemo<ReadonlySet<string>>(() => {
    if (state.kind !== "ok") return new Set();
    return extractAcceptedProposalIdsFromSources(state.sources);
  }, [state]);

  // in-session + server-derived の合算 (= chip filter 用)
  const allAcceptedIds = useMemo<ReadonlySet<string>>(() => {
    if (serverDerivedAcceptedIds.size === 0 && inSessionAcceptedIds.size === 0) {
      return new Set();
    }
    const merged = new Set<string>();
    serverDerivedAcceptedIds.forEach((id) => merged.add(id));
    inSessionAcceptedIds.forEach((id) => merged.add(id));
    return merged;
  }, [serverDerivedAcceptedIds, inSessionAcceptedIds]);

  // accept 済 proposal を proposalsByDate から filter (= chip 即消滅 + reload-safe)
  const filteredProposalsByDate = useMemo<
    Readonly<Record<string, ReadonlyArray<ProposedAnchor>>>
  >(() => {
    if (allAcceptedIds.size === 0) return proposalsByDate;
    const out: Record<string, ReadonlyArray<ProposedAnchor>> = {};
    for (const [date, list] of Object.entries(proposalsByDate)) {
      const filtered = list.filter((p) => !allAcceptedIds.has(p.id));
      if (filtered.length > 0) out[date] = filtered;
    }
    return out;
  }, [proposalsByDate, allAcceptedIds]);

  // ── Phase 3-K-2: DayGraph (= Layer 0 computed projection) を計算 ──
  //
  // 不変原則:
  //   - pure computed projection (= 永続化なし、 mutation なし)
  //   - UI render は K-2 では行わない (= K-3 以降預け、 tab には optional prop として渡すが
  //     tab 側は受け取って **使わない**)
  //   - SSR hydration safety: now が null の間は空 Record を返す (= 既存 proposal 経路と同 pattern)
  //   - JSON-safe output (= Record<string, BuildDayGraphResult>、 Set / Map なし、 §22.9)
  //   - 警告 (= warnings) も保持するが UI 表示しない (= dev / debug 用、 K-2 範囲外)
  //
  // 設計判断:
  //   - 対象 date は collectAnchoredDateStrings で「今日 + one_off anchor の date」 に絞る
  //     (= recurring 展開は anchorsForDay (= resolver) に委ねる、 visible range は K-3 で決める)
  //   - anchorsForDay (= 既存 _helpers.ts) を resolver として inject (= lib/ → app/ 依存なし)
  //   - buildDayGraph option (= startTime / endTime / minGapMinutes) は default (= 06:00-23:00 / 30 min)
  //   - K-3 以降で user settings 由来 options を追加可能
  const dayGraphState = useMemo<{
    byDate: Readonly<Record<string, BuildDayGraphResult>>;
    allWarnings: ReadonlyArray<import("@/lib/plan/dayGraph/dayGraphTypes").DayGraphWarning>;
  }>(() => {
    if (!now) return { byDate: {}, allWarnings: [] };
    if (state.kind !== "ok") return { byDate: {}, allWarnings: [] };
    // K-3c-0: visible date window (= today ± 7 days = 計 15 days) を extra として
    // 渡す。 これにより FlowTab 7 day 表示 / CalendarTab 選択週 / recurring-only day
    // が dayGraphByDate に含まれるようになる (= K-3c-i / ii の前提)。
    // 既存 K-3b CalendarTab 動作は不変 (= entry が増えるだけで lookup は同じ key)。
    const visibleWindow = buildVisibleDateWindow(now, 7, 7);
    const dateStrings = collectAnchoredDateStrings({
      anchors: state.anchors,
      nowDate: now,
      extraDateStrings: visibleWindow,
    });
    return computeDayGraphMapForAnchors({
      anchors: state.anchors,
      dateStrings,
      resolveAnchorsForDate: (allAnchors, date) =>
        anchorsForDay([...allAnchors], date),
    });
  }, [now, state]);
  // K-2: tab に渡す optional prop。 tab は受け取るが使わない (= UI 不変)。
  const dayGraphByDate = dayGraphState.byDate;

  // ── A-4b: compose sheet（flag ON 時）の対象日 + 既存予定 block ──
  //   flag OFF では null/[] を返し一切計算しない（legacy AddAnchorModal 完全不変）。
  const composeTargetUTC = useMemo<Date | null>(() => {
    if (!shouldUseComposeSheet(composeTimelineEnabled)) return null;
    const iso = addInitial?.date;
    if (iso) return new Date(`${iso}T00:00:00.000Z`);
    return now ? utcMidnight(now) : null;
  }, [composeTimelineEnabled, addInitial, now]);

  const composeExistingBlocks = useMemo<TimelineBlock[]>(() => {
    if (!composeTargetUTC || state.kind !== "ok") return [];
    return anchorsToTimelineBlocks(
      anchorsForDay([...state.anchors], composeTargetUTC),
    );
  }, [composeTargetUTC, state]);

  // ②-3: 当日既存予定 → インライン編集ロード用（block id=anchor id で対応）。
  const composeEditable = useMemo<Record<string, ComposeEditable>>(() => {
    if (!composeTargetUTC || state.kind !== "ok") return {};
    return anchorsToComposeEditable(
      anchorsForDay([...state.anchors], composeTargetUTC),
    );
  }, [composeTargetUTC, state]);

  // ④ Phase 1a: 全 anchor（既ロード）から場所利用ログを抽出（具体的な場所のみ）。
  // 新 endpoint / migration なし＝fail-open by construction（未ロード時は空）。
  // チップ集計（よく行く / title 連動）は panel 側で title に反応して行う。
  const composeLocationUsages = useMemo<LocationUsage[]>(
    () => (state.kind === "ok" ? extractLocationUsages(state.anchors) : []),
    [state],
  );

  // SR #216 D3: 休み/希望休 を iso → viewModel に index 化（anchor と別レイヤー / day-level badge 用）
  const dayIndicatorByIso = useMemo(
    () => dayIndicatorsByDate(state.kind === "ok" ? state.dayIndicators : []),
    [state]
  );

  // accept callback (= 9-step transaction、 ref + state 二段防御)
  const handleProposalAccept = useCallback(
    async (proposal: ProposedAnchor) => {
      // [1] L1 ref guard (sync) — rapid tap 即時 reject
      if (acceptingRef.current.has(proposal.id)) return;
      acceptingRef.current.add(proposal.id);
      // [2] L2 state lock — UI subtle pending 表示
      setAcceptingProposalIds((s) => {
        const n = new Set(s);
        n.add(proposal.id);
        return n;
      });

      try {
        // [3] pure converter (= ProposedAnchor → CreateExternalAnchorInput)
        const buildResult = buildAnchorInputFromProposal(proposal);
        if (!buildResult.ok) {
          // silent (= dev console 出力のみ、 user toast 出さない)
          console.warn(
            "[Phase 3-J-6e-3 accept] build failed:",
            buildResult.reason,
            proposal.id,
          );
          return;
        }

        // [4] API call (= acceptProposal → createAnchorBundle POST)
        const apiResult = await acceptProposal(proposal, buildResult.input);
        if (!apiResult.ok) {
          // silent (= toast / banner 禁止)
          console.warn(
            "[Phase 3-J-6e-3 accept] API failed:",
            apiResult.error,
            proposal.id,
          );
          return;
        }

        // [5] recordUndoToStorage (= 補正 3 厳守: API success 後にのみ undo record 作成)
        const storage = getBrowserDismissStorage();
        if (storage) {
          recordUndoToStorage(
            storage,
            buildUndoRecord({
              proposalId: proposal.id,
              anchorSourceId: apiResult.data.source.id,
              acceptedAt: new Date().toISOString(),
              proposalDate:
                typeof proposal.draft.date === "string"
                  ? proposal.draft.date
                  : undefined,
            }),
          );
        }

        // [6] L3 in-session suppression (= 即座に chip 消滅)
        setInSessionAcceptedIds((s) => {
          const n = new Set(s);
          n.add(proposal.id);
          return n;
        });

        // [7] undo records refresh (= 「戻す」 link 表示開始)
        refreshUndoRecords();

        // [8] anchors refetch (= L4 source.notes 由来 suppression 確定)
        await load();
      } finally {
        // [9] ref / state lock 解放
        acceptingRef.current.delete(proposal.id);
        setAcceptingProposalIds((s) => {
          const n = new Set(s);
          n.delete(proposal.id);
          return n;
        });
      }
    },
    [refreshUndoRecords],
  );

  // undo callback (= 「戻す」 link tap、 anchor 削除 + record cleanup)
  const handleProposalUndo = useCallback(
    async (proposalId: string) => {
      // 同期 ref guard
      if (undoingRef.current.has(proposalId)) return;
      undoingRef.current.add(proposalId);

      try {
        const storage = getBrowserDismissStorage();
        if (!storage) {
          console.warn(
            "[Phase 3-J-6e-3 undo] storage unavailable",
            proposalId,
          );
          return;
        }
        const result = await undoProposalAccept(
          storage,
          proposalId,
          new Date().toISOString(),
        );
        if (!result.ok) {
          // silent (= toast / banner 禁止)
          console.warn(
            "[Phase 3-J-6e-3 undo] failed:",
            result.reason,
            proposalId,
          );
          return;
        }
        // success: in-session 解除 (= chip 復活可能、 「採用は試行、 戻すも観察」 思想)
        setInSessionAcceptedIds((s) => {
          const n = new Set(s);
          n.delete(proposalId);
          return n;
        });
        // dismiss log には書かない (= 補正 3、 sentiment 中立、 Theory-of-Mind 分離)
        refreshUndoRecords();
        await load();
      } finally {
        undoingRef.current.delete(proposalId);
      }
    },
    [refreshUndoRecords],
  );

  // ── Phase 3-J-6e-4: modify callback (= AddAnchorModal を proposal draft で prefill して開く) ──
  //
  // 不変原則 (= CEO 制約 + Aneurasync 思想整合):
  //   - proposal.draft を pure helper proposalDraftToFormState で AnchorFormState に変換
  //   - sensitive は proposalDraftToFormState で除外済 (= Invariant 4 privacy first、 三重防御の三段目)
  //   - **既存 openAdd 経路を再利用** (= modify 専用 modal を増やさない、 J-5 設計と一致)
  //   - subtle subtitle で context を明示 (= contextSubtitle、 通知 / 警告色 / pulse なし)
  //   - dismiss log / accept transaction には書かない (= modify は単独 action、 Theory-of-Mind 中立)
  //   - **localStorage 書込しない** (= write key 2 種固定 [proposalDismiss.v1 / proposalUndo.v1] を 3 種目で汚さない)
  //   - **source.notes prefix `alter-proposal:<id>` を baked しない** (= modify は user の意思決定であり、
  //       accept とは別の意味論。 通常の手動入力 anchor と区別不可な anchor を生成する)
  //   - L1-L5 accept dup defense と無関係 (= modify path 独立、 二重作成 guard 不要 = modal 1 個しか開かない)
  //
  // post-modify chip 挙動:
  //   - 本 callback は modal 起動のみ。 anchor 作成は AddAnchorModal の onSubmit → load() 経由
  //   - 作成後の chip 可視性は computeProposals の deterministic logic に委ねる:
  //     · user が同 group (= 同曜日 + 同 hour + 同 verb) で submit → 次 computeProposals で reinforce、 chip 継続
  //     · 異なる group で submit → 元 proposal の group は変わらず、 chip は元のまま (= 自然挙動)
  //     · 明示 silencing が欲しい場合は user が 「無視」 link で dismiss する (= J-3 既存導線)
  //   - これは CEO 制約 「accept と modify を別 sentiment に保つ」 + Invariant 39 No Penalty for Ignore と整合
  //
  // useCallback dependency 注:
  //   setAddInitial / setAddSubtitle / setAddOpen は useState setter (= stable identity、 依存配列に不要)
  //   proposalDraftToFormState は pure module-level function (= 依存不要)
  const handleProposalModify = useCallback((proposal: ProposedAnchor) => {
    const initial = proposalDraftToFormState(proposal);
    const dateSuffix =
      typeof proposal.draft.date === "string" && proposal.draft.date.length > 0
        ? ` / ${proposal.draft.date}`
        : "";
    setAddInitial(initial);
    setAddSubtitle(`提案を編集${dateSuffix}`);
    setAddOpen(true);
  }, []);

  const load = async () => {
    setState({ kind: "loading" });
    const r: AnchorFetchResult = await fetchAnchors();
    if (r.ok) {
      setState({
        kind: "ok",
        sources: r.data.sources,
        anchors: r.data.anchors,
        dayIndicators: r.data.dayIndicators,
      });
    } else {
      setState({ kind: "error", message: r.error, status: r.status });
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openAdd = (req: AddRequest = {}) => {
    setAddInitial(req.initial);
    setAddSubtitle(req.subtitle);
    setAddOpen(true);
  };

  const handleAddClose = () => {
    setAddOpen(false);
    // initial / subtitle は modal の close→reset 副作用と合わせるため、
    // 次の open までは保持しておいて構わない（次 open 時に setAddInitial で上書きされる）
  };

  const handleAddSuccess = () => {
    setAddOpen(false);
    setAddInitial(undefined);
    setAddSubtitle(undefined);
    void load();
  };

  const handleDeleteSuccess = () => {
    void load();
  };

  // W1-X2: edit handlers
  const openEdit = (anchor: ExternalAnchor) => {
    setEditAnchor(anchor);
    setEditOpen(true);
  };
  const handleEditClose = () => {
    setEditOpen(false);
    // editAnchor は次の open まで保持（次 open 時に setEditAnchor で上書き）
  };
  const handleEditSuccess = () => {
    setEditOpen(false);
    setEditAnchor(null);
    void load();
  };

  // W1-X5: detail modal handlers
  const openDetail = (anchor: ExternalAnchor) => {
    setDetailAnchor(anchor);
    setDetailOpen(true);
  };
  const handleDetailClose = () => {
    setDetailOpen(false);
  };
  const handleDetailEditRequest = (anchor: ExternalAnchor) => {
    // Detail を閉じて Edit を開く（modal の重ね合わせ回避）
    setDetailOpen(false);
    openEdit(anchor);
  };
  const handleDetailDeleteSuccess = () => {
    setDetailOpen(false);
    setDetailAnchor(null);
    void load();
  };

  // ── chrome 出し分け (Phase 1 + 8b-7-B / 8b-10 mock 整合) ──
  // route mode: min-h-screen + 上品な白背景 (= 8b-7-B 以降)
  // pane mode : h-full overflow-y-auto + 薄紫 gradient + 簡素 chrome (= 既存維持)
  // 8b-10: py-8 → py-4 (= 余白縮小、 CEO 「上に詰める」)
  // calendar タブは画面全面を淡いラベンダーに（ヘッダー・タブ・上下左右端まで）。 白カードがその上に浮く。
  // 他タブ（list/map）は従来の白系を維持（CEO 承認の calendar 限定変更）。
  const calBg = "bg-gradient-to-b from-violet-50 via-violet-50/70 to-violet-50/40";
  const containerClass = isPane
    ? `h-full overflow-y-auto px-4 py-6 ${activeTab === "calendar" ? calBg : "bg-gradient-to-b from-white via-indigo-50/40 to-purple-50/30"}`
    : useNewShell
      ? `min-h-screen px-4 py-4 ${activeTab === "calendar" ? calBg : "bg-white"}`
      : "min-h-screen bg-gradient-to-b from-white to-slate-50 px-4 py-8";

  return (
    <main className={containerClass} data-display-mode={displayMode}>
      {/* P3-A-1-1-h: Google Calendar OAuth callback redirect 後の user feedback banner */}
      <CalendarConnectBanner
        status={bannerStatus}
        onRetry={handleBannerRetry}
        onDismiss={clearCalendarQuery}
      />
      {/* ── Header (8b-10: mb-6 → flag ON で mb-3 余白縮小、 9a-impl Step α で useNewShell 統一) ── */}
      <header className={useNewShell ? "mx-auto mb-3 max-w-3xl" : "mx-auto mb-6 max-w-3xl"}>
        {!isPane && (
          <p className="text-xs font-medium uppercase tracking-widest text-indigo-600">
            ALTER · PLAN
          </p>
        )}
        <div className={
          isPane
            ? "flex flex-wrap items-baseline justify-between gap-3"
            : "mt-1 flex flex-wrap items-baseline justify-between gap-3"
        }>
          <h1 className={
            isPane
              ? "text-3xl font-semibold text-slate-900"
              : useNewShell
                ? "text-lg font-bold text-slate-900" // 8b-10: 小さく (text-2xl → text-lg)
                : "text-2xl font-bold text-slate-900"
          }>
            {/* 8b-7-B → 9a-impl Step α: useNewShell で 「今日のプラン」 (= mock 整合、 list/map 統一) */}
            {isPane
              ? "Plan"
              : useNewShell
                ? "今日のプラン"
                : "あなたの生活、3 つのレンズ"}
          </h1>
          {/* 8b-8 / 8b-9 / 8b-10: title 行右側 tabs (= 8b-10 で 小さく + 左 icon 追加、 9a-impl Step α: useNewShell 統一) */}
          {useNewShell ? (
            <div
              className="inline-flex rounded-lg bg-slate-100 p-0.5 gap-0.5"
              role="tablist"
              aria-label="Plan tabs"
            >
              {TABS.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`plan-panel-${tab.key}`}
                    id={`plan-tab-${tab.key}`}
                    onClick={() => setActiveTab(tab.key)}
                    className={
                      // 8b-11: text-xs → text-[10px] (= 「カレンダー」 文字小さく、 5 文字でも均一幅収まる)、 w-[68px]→w-16 さらに縮小
                      "w-16 px-2 py-1 rounded-md text-[10px] font-medium transition-all inline-flex items-center justify-center gap-1 " +
                      (isActive
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-800")
                    }
                  >
                    <TabIcon tabKey={tab.key} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex gap-2">
              {/* 8b-7-B / 8b-8: 「+ 教える」 button は flag ON で非表示 (= CEO 「+教える 消していい」)
                  flag OFF (= 既存 default) では維持 */}
              <GlassButton size="sm" variant="primary" onClick={() => openAdd()}>
                + 教える
              </GlassButton>
              <GlassButton size="sm" variant="secondary" onClick={() => setListOpen(true)}>
                📋 教えた予定
              </GlassButton>
            </div>
          )}
          {/* P3 W2 (= CEO 2026-05-26): .ics import entry point は常時表示 (= useNewShell 不問)。
              「+ 教える」 が flag ON で非表示でも 取り込み 経路は user に必要。
              CEO 補正 (= 2026-05-26): 既存独自 calendar svg + 「取り込み」 矢印 + gradient。 */}
          {!isPane && (
            <button
              type="button"
              onClick={() => setIcsImportOpen(true)}
              className="text-[10px] px-2 py-1 rounded-md text-indigo-600 hover:text-purple-700 hover:bg-indigo-50 transition-colors inline-flex items-center gap-1.5 font-medium"
              data-testid="plan-header-ics-import"
              aria-label="カレンダー (.ics) から取り込む"
            >
              <IcsImportIcon />
              <span>取り込む</span>
            </button>
          )}
          {/* S1: シフト表（画像/PDF）取込 入口。flag OFF（本番既定）なら null = UI 不変。 */}
          {!isPane && (
            <PlanShiftImportEntry
              draftLiveEnabled={draftLiveEnabled}
              vlmInputMode={shiftDraftVlmInputMode}
              saveEnabled={shiftImportSaveEnabled}
            />
          )}
        </div>
        {/* calendar タブは dashboard 側の day-context intro（その日の文脈文）が主役のため、
            固定 subtitle を出さない（重複・縦圧迫の解消、 CEO 承認の最小変更）。 他タブは従来通り。 */}
        {!isPane && activeTab !== "calendar" && (
          <p className={useNewShell ? "mt-0.5 text-xs text-slate-500" : "mt-2 text-sm text-slate-500"}>
            {/* 8b-7-B / 8b-10 / 9a-impl Step α: subtitle 小さく + tab-aware
             *   - map: 「場所を地図で確認して、流れをつかみましょう。」 (= mock 整合)
             *   - flow: 「時間の流れを把握して、心地よい1日に。」 (= 8b-7-B 既存)
             */}
            {useNewShell
              ? activeTab === "map"
                ? "場所を地図で確認して、流れをつかみましょう。"
                : "時間の流れを把握して、心地よい1日に。"
              : "同じ予定を 3 つの視点で見ると、自分の生活パターンが見えてきます。"}
          </p>
        )}
      </header>

      {/* ── Tab nav (= flag OFF default、 既存 placement 維持、 9a-impl Step α: useNewShell 統一) ── */}
      {!useNewShell && (
        <nav
          role="tablist"
          aria-label="Plan tabs"
          className="mx-auto mb-6 max-w-3xl"
        >
          <div className="inline-flex rounded-full bg-slate-100/80 p-1 shadow-inner">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`plan-panel-${tab.key}`}
                  id={`plan-tab-${tab.key}`}
                  onClick={() => setActiveTab(tab.key)}
                  className={
                    "px-5 py-2 rounded-full text-sm font-medium transition-all " +
                    (isActive
                      ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-800")
                  }
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* ── Content area ──
       *  Step δ-corrective: map newMode 時は full-bleed (= 横方向に container padding を相殺、
       *    max-width 制約解除)。 header と tab は max-w-3xl 維持、 map のみ全画面。
       *  flag OFF / 他 tab は既存 max-w-3xl mx-auto。
       */}
      <section
        id={`plan-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`plan-tab-${activeTab}`}
        className={
          useNewShell && activeTab === "map"
            ? "-mx-4" // 親 px-4 を相殺、 full-bleed
            : "mx-auto max-w-3xl"
        }
      >
        {state.kind === "loading" && <LoadingState />}
        {state.kind === "error" && (
          <ErrorState
            message={state.message}
            status={state.status}
            onRetry={() => void load()}
          />
        )}
        {state.kind === "ok" && state.anchors.length === 0 && (
          <EmptyState
            onStartTeaching={() => openAdd()}
            onIcsImport={() => setIcsImportOpen(true)}
          />
        )}
        {state.kind === "ok" && state.anchors.length > 0 && (
          <>
            {/*
             * Phase 3-J-6e-1: proposalsByDate を CalendarTab / MapTab に pass (= read-only display)
             * Phase 3-J-6e-2: onProposalDismiss callback を pass (= silent dismiss、 localStorage write)
             * Phase 3-J-6e-3: onProposalAccept + acceptingProposalIds + recentUndoRecords + onProposalUndo を pass
             *                  (= accept transaction + Quiet Undo Window UI)
             *                  filteredProposalsByDate (= L3 in-session + L4 source.notes 由来 suppression 適用後)
             * Phase 3-J-6e-4: onProposalModify を pass (= AddAnchorModal 起動 + proposal draft prefill)
             *                  - 既存 openAdd 経路再利用 (= 専用 modal なし)
             *                  - dismiss / accept とは独立 sentiment (= localStorage 書込なし、 source.notes trace なし)
             *
             * proposalTemplateVariables は未指定 (= ProposalChip 側で draft fallback)
             * FlowTab は J-6 scope 外 (= Phase 3.5 預け)、 proposal props 渡さない
             */}
            {activeTab === "calendar" && (
              <CalendarTab
                anchors={state.anchors}
                onAddRequest={openAdd}
                onAnchorClick={openDetail}
                proposalsByDate={filteredProposalsByDate}
                onProposalAccept={handleProposalAccept}
                onProposalModify={handleProposalModify}
                onProposalDismiss={handleProposalDismiss}
                acceptingProposalIds={acceptingProposalIds}
                recentUndoRecords={recentUndoRecords}
                onProposalUndo={handleProposalUndo}
                dayGraphByDate={dayGraphByDate}
                dayIndicatorByIso={dayIndicatorByIso}
              />
            )}
            {activeTab === "flow" && (
              <FlowTab
                anchors={state.anchors}
                onAddRequest={openAdd}
                onAnchorClick={openDetail}
                dayGraphByDate={dayGraphByDate}
                dayIndicatorByIso={dayIndicatorByIso}
              />
            )}
            {/* 9 closeout cleanup: MapTab 単一 path 化、 受領 prop は anchors + now + onAnchorClick のみ。
              * 旧 FAB / SelectedAnchorCard / CategoryGrid / DayGraphTimeline 削除に伴い、
              * onAddRequest / proposal hint 系 / dayGraphByDate は dead props として削除。 */}
            {activeTab === "map" && (
              <MapTab
                anchors={state.anchors}
                onAnchorClick={openDetail}
              />
            )}
          </>
        )}
      </section>

      {/* ── Modals ── */}
      {/* A-4b: flag ON で compose 体験、OFF で既存 AddAnchorModal（完全不変） */}
      {shouldUseComposeSheet(composeTimelineEnabled) ? (
        composeTargetUTC ? (
          <AddAnchorComposeContainer
            isOpen={addOpen}
            onClose={handleAddClose}
            dateISO={isoDate(composeTargetUTC)}
            dateLabel={formatJpDate(composeTargetUTC)}
            existingBlocks={composeExistingBlocks}
            locationUsages={composeLocationUsages}
            onSaved={handleAddSuccess}
            existingEditable={composeEditable}
          />
        ) : null
      ) : (
        <AddAnchorModal
          isOpen={addOpen}
          onClose={handleAddClose}
          onSuccess={handleAddSuccess}
          initialState={addInitial}
          contextSubtitle={addSubtitle}
        />
      )}
      {/* P3 W2: .ics import modal (= CEO 2026-05-26、 review/approve UI) */}
      <IcsImportModal
        isOpen={icsImportOpen}
        onClose={() => setIcsImportOpen(false)}
        onSuccess={() => {
          // 取り込み成功時、 anchor 一覧を再 fetch (= addOnSuccess と同等 pattern)
          setIcsImportOpen(false);
          handleAddSuccess();
        }}
        existingAnchors={state.kind === "ok" ? state.anchors : []}
        onSwitchToManualInput={() => {
          // CEO 補正 (= 2026-05-26): .ics 不在 user の手入力経路
          //   ics modal を閉じる → AddAnchorModal を開く
          setIcsImportOpen(false);
          openAdd();
        }}
      />
      <SourceListModal
        isOpen={listOpen}
        onClose={() => setListOpen(false)}
        sources={state.kind === "ok" ? state.sources : []}
        anchors={state.kind === "ok" ? state.anchors : []}
        onSuccess={handleDeleteSuccess}
        onEditRequest={(a) => {
          // SourceListModal から「教え直す」が呼ばれたら、SourceList を閉じて EditModal を開く
          setListOpen(false);
          openEdit(a);
        }}
      />
      <EditAnchorModal
        isOpen={editOpen}
        onClose={handleEditClose}
        onSuccess={handleEditSuccess}
        anchor={editAnchor}
      />
      <AnchorDetailModal
        isOpen={detailOpen}
        onClose={handleDetailClose}
        anchor={detailAnchor}
        allAnchors={state.kind === "ok" ? state.anchors : []}
        source={
          state.kind === "ok" && detailAnchor
            ? state.sources.find((s) => s.id === detailAnchor.sourceId) ?? null
            : null
        }
        onEditRequest={handleDetailEditRequest}
        onDeleteSuccess={handleDetailDeleteSuccess}
      />
    </main>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8b-10: Tab icon component (= カレンダー / リスト / マップ 各 tab の左 icon)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TabIcon({ tabKey }: { tabKey: string }): React.ReactElement {
  const baseProps = {
    width: 12,
    height: 12,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "flex-shrink-0",
  };
  switch (tabKey) {
    case "calendar":
      return (
        <svg {...baseProps}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 9 H21" />
          <path d="M8 3 V7" />
          <path d="M16 3 V7" />
        </svg>
      );
    case "flow":
      // List icon (= 3 lines)
      return (
        <svg {...baseProps}>
          <path d="M4 6 H20" />
          <path d="M4 12 H20" />
          <path d="M4 18 H20" />
          <circle cx="4" cy="6" r="0.5" fill="currentColor" />
          <circle cx="4" cy="12" r="0.5" fill="currentColor" />
          <circle cx="4" cy="18" r="0.5" fill="currentColor" />
        </svg>
      );
    case "map":
      // Map pin icon
      return (
        <svg {...baseProps}>
          <path d="M12 22 s8-7.5 8-13 a8 8 0 0 0 -16 0 c0 5.5 8 13 8 13 z" />
          <circle cx="12" cy="9" r="2.5" />
        </svg>
      );
    default:
      return <svg {...baseProps} />;
  }
}

/**
 * P3 W2 (= CEO 2026-05-26): .ics import 専用 icon
 *
 * 既存 TabIcon の `calendar` shape を基に:
 *   - indigo → purple gradient stroke (= 「特別な経路」 を視覚で示す)
 *   - 内側に下向き矢印 (= 「外から取り込む」 を暗示)
 */
function IcsImportIcon(): React.ReactElement {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="flex-shrink-0"
    >
      <defs>
        <linearGradient id="ics-import-icon-gradient" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      {/* Calendar frame (= 既存 TabIcon calendar pattern を踏襲) */}
      <rect x="3" y="5" width="18" height="16" rx="2.5" stroke="url(#ics-import-icon-gradient)" />
      <path d="M3 9 H21" stroke="url(#ics-import-icon-gradient)" />
      <path d="M8 3 V7" stroke="url(#ics-import-icon-gradient)" />
      <path d="M16 3 V7" stroke="url(#ics-import-icon-gradient)" />
      {/* Inbound arrow (= 「外から取り込む」 を暗示、 calendar 内側に配置) */}
      <path d="M12 12 V18" stroke="url(#ics-import-icon-gradient)" />
      <path d="M9 15 L12 18 L15 15" stroke="url(#ics-import-icon-gradient)" />
    </svg>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// State views
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function LoadingState() {
  return (
    <div data-testid="plan-loading" className="space-y-3">
      <Skeleton variant="rectangular" height={60} />
      <Skeleton variant="rectangular" height={60} />
      <Skeleton variant="rectangular" height={60} />
    </div>
  );
}

function ErrorState({
  message,
  status,
  onRetry,
}: {
  message: string;
  status: number;
  onRetry: () => void;
}) {
  return (
    <GlassCard data-testid="plan-error" className="p-8 text-center">
      <p className="text-base font-medium text-rose-700">読み込みに失敗しました</p>
      <p className="mt-2 text-sm text-slate-500">
        {status > 0 ? `${status} — ${message}` : message}
      </p>
      <div className="mt-4 flex justify-center">
        <GlassButton onClick={onRetry} variant="primary">
          再試行
        </GlassButton>
      </div>
    </GlassCard>
  );
}

function EmptyState({
  onStartTeaching,
  onIcsImport,
}: {
  onStartTeaching: () => void;
  onIcsImport: () => void;
}) {
  return (
    <GlassCard data-testid="plan-empty" className="p-8 text-center">
      <GlassBadge variant="default">予定なし</GlassBadge>
      <h2 className="mt-3 text-lg font-semibold text-slate-900">
        まだ予定が登録されていません
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        仕事 / 学校 / バイト / 通院などの「動かせない予定」を Alter に教えると、
        あなたの生活パターンが 3 つのレンズで見えるようになります。
      </p>
      <div className="mt-4 flex justify-center">
        <GlassButton variant="primary" onClick={onStartTeaching}>
          + Alter に教える
        </GlassButton>
      </div>
      {/* P3 W2: .ics import entry (= 既存「教える」 の隣に小さく secondary、 CEO 補正でアイコン付き) */}
      <div className="mt-3 flex justify-center">
        <button
          type="button"
          onClick={onIcsImport}
          className="text-xs text-indigo-600 hover:text-purple-700 inline-flex items-center gap-1.5 font-medium"
          data-testid="plan-empty-ics-import"
        >
          <IcsImportIcon />
          <span>カレンダー (.ics) から取り込む</span>
        </button>
      </div>
    </GlassCard>
  );
}
