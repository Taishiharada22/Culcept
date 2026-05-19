/**
 * HomePlanPane — Home 横スワイプの Plan summary pane
 *
 * 役割:
 *   Home から左 swipe で到達する Plan の summary view。
 *   CEO 補正 (2026-05-19): summary のみ、編集 / 詳細操作は /plan 直 URL で行う。
 *
 * 設計書: docs/alter-plan-home-integration-mini-design.md §4.3 (B1, F)
 *
 * 表示内容:
 *   - 次の予定 (nextUpcoming)
 *   - 今日 / 明日 の anchor 上位 3 件ずつ
 *   - 今週 one_off 件数 / recurring 件数 (small text)
 *   - "Plan を開く" CTA (/plan へ Link)
 *
 * 表示しない内容 (CEO 補正で明示):
 *   - /plan 全機能の完全埋め込み
 *   - 重い編集 UI (新規登録 form / edit form / detail modal)
 *   - モーダル大量展開
 *
 * Beyond 設計 (philosophy 整合):
 *   - empty state copy: "あなたのこの先がここに置かれていきます" (Aneurasync 文脈)
 *   - header: "この先" (= "予定リスト" ではなく "第二の自己が知る、自分のこの先")
 *   - error は subtle、retry button のみ
 *
 * 不変原則:
 *   - PlanClient / lib/plan/ の編集系を一切 touch しない
 *   - fetch は /api/plan/anchors (既存 GET、anon key + RLS、service_role 不使用)
 *   - anchor の操作 (edit / delete) は /plan に navigate して行う (本 pane では tap のみ)
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import {
  buildHomePlanSummary,
  type PlanSummary,
} from "@/lib/plan/home-plan-summary";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fetch state
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type FetchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; anchors: ExternalAnchor[] };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface HomePlanPaneProps {
  /** test 用、現在時刻 (default: new Date()) */
  now?: Date;
  /** test 用、anchors 直接注入 (fetch を bypass) */
  injectedAnchors?: ExternalAnchor[];
}

export default function HomePlanPane({
  now,
  injectedAnchors,
}: HomePlanPaneProps = {}) {
  const [state, setState] = useState<FetchState>(() =>
    injectedAnchors
      ? { status: "ready", anchors: injectedAnchors }
      : { status: "loading" }
  );

  useEffect(() => {
    // test injection bypass
    if (injectedAnchors) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/plan/anchors", {
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as {
          ok?: boolean;
          data?: { anchors?: ExternalAnchor[] };
          error?: string;
        };
        if (cancelled) return;
        if (body.ok && body.data?.anchors) {
          setState({ status: "ready", anchors: body.data.anchors });
        } else {
          setState({
            status: "error",
            message: body.error ?? "unknown error",
          });
        }
      } catch (e: unknown) {
        if (cancelled) return;
        setState({
          status: "error",
          message: e instanceof Error ? e.message : "fetch failed",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [injectedAnchors]);

  return (
    <div
      className="flex flex-col h-full overflow-y-auto bg-gradient-to-b from-white via-indigo-50/30 to-white"
      data-testid="home-plan-pane"
    >
      <div className="flex-1 px-5 pt-8 pb-6">
        {/* ─── Header (philosophy 文脈) ─── */}
        <header className="mb-6">
          <h2 className="text-2xl font-semibold text-slate-800">この先</h2>
          <p className="text-sm text-slate-500 mt-1">
            あなたの予定が、ここにあります
          </p>
        </header>

        {/* ─── Loading ─── */}
        {state.status === "loading" && (
          <div
            className="text-slate-400 text-sm py-10 text-center"
            data-testid="home-plan-pane-loading"
          >
            読み込んでいます…
          </div>
        )}

        {/* ─── Error (subtle) ─── */}
        {state.status === "error" && (
          <div
            className="text-slate-400 text-xs py-10 text-center"
            data-testid="home-plan-pane-error"
          >
            <p>予定を取得できませんでした</p>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") window.location.reload();
              }}
              className="mt-2 text-indigo-500 underline hover:no-underline"
            >
              再試行
            </button>
          </div>
        )}

        {/* ─── Ready ─── */}
        {state.status === "ready" && (
          <ReadyContent anchors={state.anchors} now={now} />
        )}
      </div>

      {/* ─── CTA (常時 footer 配置、empty state 時もここで誘導) ─── */}
      <div className="px-5 pb-8 pt-2">
        <Link
          href="/plan"
          className="block w-full text-center px-6 py-3 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-medium shadow-md hover:shadow-lg active:scale-[0.98] transition-all"
          data-testid="home-plan-pane-open-cta"
        >
          Plan を開く
        </Link>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Ready content
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ReadyContent({
  anchors,
  now,
}: {
  anchors: ExternalAnchor[];
  now?: Date;
}) {
  const summary: PlanSummary = buildHomePlanSummary(anchors, now ?? new Date());

  if (summary.isEmpty) {
    return (
      <div
        className="text-center py-12"
        data-testid="home-plan-pane-empty"
      >
        <p className="text-slate-500 text-sm leading-relaxed">
          あなたのこの先が、
          <br />
          ここに置かれていきます
        </p>
      </div>
    );
  }

  return (
    <div data-testid="home-plan-pane-ready">
      {/* Next upcoming */}
      {summary.nextUpcoming && (
        <section className="mb-6 p-4 rounded-2xl bg-white shadow-sm border border-indigo-100">
          <p className="text-[10px] tracking-wide text-indigo-500 font-medium mb-1">
            次の予定
          </p>
          <h3 className="text-lg font-semibold text-slate-800">
            {summary.nextUpcoming.title}
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            {summary.nextUpcoming.startTime}
          </p>
        </section>
      )}

      {/* Today */}
      {summary.today.length > 0 && (
        <section className="mb-4" data-testid="home-plan-pane-today">
          <h3 className="text-sm font-medium text-slate-700 mb-2">今日</h3>
          <ul className="space-y-1.5">
            {summary.today.slice(0, 3).map((a) => (
              <li
                key={a.id}
                className="text-sm text-slate-700 flex gap-3 items-baseline"
              >
                <span className="text-slate-400 tabular-nums w-12 shrink-0">
                  {a.startTime}
                </span>
                <span className="truncate">{a.title}</span>
              </li>
            ))}
            {summary.today.length > 3 && (
              <li className="text-xs text-slate-400 pl-15">
                ほか {summary.today.length - 3} 件
              </li>
            )}
          </ul>
        </section>
      )}

      {/* Tomorrow */}
      {summary.tomorrow.length > 0 && (
        <section className="mb-4" data-testid="home-plan-pane-tomorrow">
          <h3 className="text-sm font-medium text-slate-700 mb-2">明日</h3>
          <ul className="space-y-1.5">
            {summary.tomorrow.slice(0, 3).map((a) => (
              <li
                key={a.id}
                className="text-sm text-slate-700 flex gap-3 items-baseline"
              >
                <span className="text-slate-400 tabular-nums w-12 shrink-0">
                  {a.startTime}
                </span>
                <span className="truncate">{a.title}</span>
              </li>
            ))}
            {summary.tomorrow.length > 3 && (
              <li className="text-xs text-slate-400 pl-15">
                ほか {summary.tomorrow.length - 3} 件
              </li>
            )}
          </ul>
        </section>
      )}

      {/* Week / Recurring summary footer */}
      {(summary.thisWeekOneOffCount > 0 ||
        summary.recurringTemplateCount > 0) && (
        <p
          className="text-xs text-slate-400 mt-4"
          data-testid="home-plan-pane-week-summary"
        >
          {summary.thisWeekOneOffCount > 0 && (
            <span>今週 {summary.thisWeekOneOffCount} 件</span>
          )}
          {summary.thisWeekOneOffCount > 0 &&
            summary.recurringTemplateCount > 0 && <span> · </span>}
          {summary.recurringTemplateCount > 0 && (
            <span>繰り返し {summary.recurringTemplateCount} 件</span>
          )}
        </p>
      )}
    </div>
  );
}
