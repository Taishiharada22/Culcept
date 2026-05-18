"use client";

/**
 * PlanClient — Alter Plan UI root (W1-5 + W1-X1)
 *
 * 設計書:
 *   - docs/alter-plan-w15-ui-mini-design.md (3 レンズ)
 *   - docs/alter-plan-w1x1-mini-design.md (Add/Delete UI)
 *
 * 責務:
 *   - GET /api/plan/anchors を 1 回 fetch（mount 時）+ POST/DELETE 成功時に refetch
 *   - tab state を管理
 *   - empty / loading / error を中央で扱う
 *   - 3 tab に共通データ (anchors[]) を渡す
 *   - "+ 教える" / "📋 教えた予定" の 2 modal を制御
 *
 * 範囲外:
 *   - PATCH/PUT 編集
 *   - DraftPlan / 横スワイプ
 *   - W1-6 passive drift logging
 *   - W1-8 Home 導線
 */

import { useEffect, useState } from "react";

import {
  GlassBadge,
  GlassButton,
  GlassCard,
  Skeleton,
} from "@/components/ui/glassmorphism-design";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { ExternalAnchorSource } from "@/lib/plan/external-anchor-source";
import { fetchAnchors, type AnchorFetchResult } from "@/lib/plan/anchor-fetch";

import { AddAnchorModal } from "./components/AddAnchorModal";
import { SourceListModal } from "./components/SourceListModal";
import { CalendarTab } from "./tabs/CalendarTab";
import { FlowTab } from "./tabs/FlowTab";
import { MapTab } from "./tabs/MapTab";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type PlanTab = "calendar" | "flow" | "map";

const TABS: ReadonlyArray<{
  key: PlanTab;
  label: string;
  hint: string;
}> = [
  { key: "calendar", label: "カレンダー", hint: "今週どう過ごす？" },
  { key: "flow", label: "Flow", hint: "今日 1 日がどう流れる？" },
  { key: "map", label: "聖地", hint: "あなたはどこによく行く？" },
];

type FetchState =
  | { kind: "loading" }
  | { kind: "ok"; sources: ExternalAnchorSource[]; anchors: ExternalAnchor[] }
  | { kind: "error"; message: string; status: number };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function PlanClient() {
  const [activeTab, setActiveTab] = useState<PlanTab>("calendar");
  const [state, setState] = useState<FetchState>({ kind: "loading" });
  const [addOpen, setAddOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);

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

  const handleAddSuccess = () => {
    setAddOpen(false);
    void load();
  };
  const handleDeleteSuccess = () => {
    void load();
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-slate-50 px-4 py-8">
      {/* ── Header ── */}
      <header className="mx-auto mb-6 max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-widest text-indigo-600">
          ALTER · PLAN
        </p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">
            あなたの生活、3 つのレンズ
          </h1>
          <div className="flex gap-2">
            <GlassButton size="sm" variant="primary" onClick={() => setAddOpen(true)}>
              + 教える
            </GlassButton>
            <GlassButton size="sm" variant="secondary" onClick={() => setListOpen(true)}>
              📋 教えた予定
            </GlassButton>
          </div>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          同じ予定を 3 つの視点で見ると、自分の生活パターンが見えてきます。
        </p>
      </header>

      {/* ── Tab nav ── */}
      <nav
        role="tablist"
        aria-label="Plan tabs"
        className="mx-auto mb-6 flex max-w-3xl gap-2 border-b border-slate-200"
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
                "-mb-px flex flex-col items-start border-b-2 px-4 py-3 text-left transition-colors " +
                (isActive
                  ? "border-indigo-500 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-700")
              }
            >
              <span className="text-sm font-semibold">{tab.label}</span>
              <span className="text-xs text-slate-400">{tab.hint}</span>
            </button>
          );
        })}
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
          <EmptyState onStartTeaching={() => setAddOpen(true)} />
        )}
        {state.kind === "ok" && state.anchors.length > 0 && (
          <>
            {activeTab === "calendar" && <CalendarTab anchors={state.anchors} />}
            {activeTab === "flow" && <FlowTab anchors={state.anchors} />}
            {activeTab === "map" && <MapTab anchors={state.anchors} />}
          </>
        )}
      </section>

      {/* ── Modals ── */}
      <AddAnchorModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={handleAddSuccess}
      />
      <SourceListModal
        isOpen={listOpen}
        onClose={() => setListOpen(false)}
        sources={state.kind === "ok" ? state.sources : []}
        anchors={state.kind === "ok" ? state.anchors : []}
        onSuccess={handleDeleteSuccess}
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
