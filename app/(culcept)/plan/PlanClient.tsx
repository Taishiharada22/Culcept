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

import { useEffect, useMemo, useState } from "react";

import {
  GlassBadge,
  GlassButton,
  GlassCard,
  Skeleton,
} from "@/components/ui/glassmorphism-design";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { ExternalAnchorSource } from "@/lib/plan/external-anchor-source";
import { fetchAnchors, type AnchorFetchResult } from "@/lib/plan/anchor-fetch";
import type { AnchorFormState } from "@/lib/plan/anchor-input-form";
// ── Phase 3-J-6e-1: Proposal read-only 接続 ──
// 注: TestOverrideContext は import しない (= production import 禁止)。
//     dev/smoke 用 bypass は本 file で行わない (= 既存 unit test の testOverride 経路で対応)。
import {
  createStorageBackedDismissLogReader,
  getBrowserDismissStorage,
} from "@/lib/plan/proposal/dismissAction";
import type { DismissLogEntry } from "@/lib/plan/proposal/dismissLog";
import { computeProposals } from "@/lib/plan/proposal/computeProposals";
import {
  computeFirstUseDateFromAnchors,
  groupProposalsByDate,
} from "@/lib/plan/proposal/planClientProposalHelpers";

import { AddAnchorModal } from "./components/AddAnchorModal";
import { AnchorDetailModal } from "./components/AnchorDetailModal";
import { EditAnchorModal } from "./components/EditAnchorModal";
import { SourceListModal } from "./components/SourceListModal";
import { CalendarTab } from "./tabs/CalendarTab";
import { FlowTab } from "./tabs/FlowTab";
import { MapTab } from "./tabs/MapTab";

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
  { key: "map", label: "地図" },
];

type FetchState =
  | { kind: "loading" }
  | { kind: "ok"; sources: ExternalAnchorSource[]; anchors: ExternalAnchor[] }
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
}

export default function PlanClient({
  displayMode = "route",
}: PlanClientProps = {}) {
  const isPane = displayMode === "pane";

  const [activeTab, setActiveTab] = useState<PlanTab>("calendar");
  const [state, setState] = useState<FetchState>({ kind: "loading" });
  const [addOpen, setAddOpen] = useState(false);
  const [addInitial, setAddInitial] = useState<Partial<AnchorFormState> | undefined>(undefined);
  const [addSubtitle, setAddSubtitle] = useState<string | undefined>(undefined);
  const [listOpen, setListOpen] = useState(false);
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

  const proposalsByDate = useMemo<Readonly<
    Record<string, ReadonlyArray<import("@/lib/plan/proposal/proposalTypes").ProposedAnchor>>
  >>(() => {
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

  const load = async () => {
    setState({ kind: "loading" });
    const r: AnchorFetchResult = await fetchAnchors();
    if (r.ok) {
      setState({ kind: "ok", sources: r.data.sources, anchors: r.data.anchors });
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

  // ── chrome 出し分け (Phase 1) ──
  // route mode: min-h-screen + white→slate gradient + full header chrome
  // pane mode : h-full overflow-y-auto + 薄紫 gradient + 簡素 chrome
  const containerClass = isPane
    ? "h-full overflow-y-auto bg-gradient-to-b from-white via-indigo-50/40 to-purple-50/30 px-4 py-6"
    : "min-h-screen bg-gradient-to-b from-white to-slate-50 px-4 py-8";

  return (
    <main className={containerClass} data-display-mode={displayMode}>
      {/* ── Header (mode で chrome 出し分け、機能 button は両 mode 共通) ── */}
      <header className="mx-auto mb-6 max-w-3xl">
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
              : "text-2xl font-bold text-slate-900"
          }>
            {isPane ? "Plan" : "あなたの生活、3 つのレンズ"}
          </h1>
          <div className="flex gap-2">
            <GlassButton size="sm" variant="primary" onClick={() => openAdd()}>
              + 教える
            </GlassButton>
            <GlassButton size="sm" variant="secondary" onClick={() => setListOpen(true)}>
              📋 教えた予定
            </GlassButton>
          </div>
        </div>
        {!isPane && (
          <p className="mt-2 text-sm text-slate-500">
            同じ予定を 3 つの視点で見ると、自分の生活パターンが見えてきます。
          </p>
        )}
      </header>

      {/* ── Tab nav (Phase 1 C2 で pill segmented control に refactor、CEO mock 寄せ) ── */}
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

      {/* ── Content area ── */}
      <section
        id={`plan-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`plan-tab-${activeTab}`}
        className="mx-auto max-w-3xl"
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
          <EmptyState onStartTeaching={() => openAdd()} />
        )}
        {state.kind === "ok" && state.anchors.length > 0 && (
          <>
            {/*
             * Phase 3-J-6e-1: proposalsByDate を CalendarTab / MapTab に pass。
             * - callback (onProposalAccept/Modify/Dismiss) は **未配線** (= J-6e-2/3/4 預け)
             * - proposalTemplateVariables は未指定 (= ProposalChip 側で draft fallback)
             * - FlowTab は J-6 scope 外 (= Phase 3.5 預け)、 proposal props 渡さない
             */}
            {activeTab === "calendar" && (
              <CalendarTab
                anchors={state.anchors}
                onAddRequest={openAdd}
                onAnchorClick={openDetail}
                proposalsByDate={proposalsByDate}
              />
            )}
            {activeTab === "flow" && (
              <FlowTab
                anchors={state.anchors}
                onAddRequest={openAdd}
                onAnchorClick={openDetail}
              />
            )}
            {activeTab === "map" && (
              <MapTab
                anchors={state.anchors}
                onAddRequest={openAdd}
                onAnchorClick={openDetail}
                proposalsByDate={proposalsByDate}
              />
            )}
          </>
        )}
      </section>

      {/* ── Modals ── */}
      <AddAnchorModal
        isOpen={addOpen}
        onClose={handleAddClose}
        onSuccess={handleAddSuccess}
        initialState={addInitial}
        contextSubtitle={addSubtitle}
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

function EmptyState({ onStartTeaching }: { onStartTeaching: () => void }) {
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
    </GlassCard>
  );
}
