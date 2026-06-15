"use client";

/**
 * app/(culcept)/plan/components/CandidateLensPanel.tsx
 *   — Purpose-Adaptive Candidate Lens / Phase 2 UI（3 画面・参照画像 add-search1/2/3 準拠で再構成）
 *
 * ★flag default OFF / dev-only（呼び側 PlaceCandidatesPanel が isCandidateLensUiEnabled で分岐）。既存パネルは不変。
 * ★CEO 補正(2026-06-15): 未確認は主比較表に「—」を並べず名前だけ補助注記・写真は外部 API なしゆえ出さない
 *   （map/address/reason/種別 を主役・抽象タイルは写真でない）・evidenceType を UI に反映・B は「約/目安」表記。
 * ★トレース/画像切り貼り/写真捏造なし。pure helper(candidateLensUi)を消費。確定は onSelect → ① へ戻る（親が close）。
 */
import { useState } from "react";
import {
  buildLensCandidateView,
  buildLensComparisonView,
  purposeLensFromSchedule,
  type LensCandidate,
} from "@/lib/plan/candidateLens/candidateLensUi";
import { PURPOSE_LENS_LABEL } from "@/lib/plan/candidateLens/purposeLens";
import type { EvidenceType } from "@/lib/plan/candidateLens/placeAttributeModel";

export interface CandidateLensPanelProps {
  readonly candidates: readonly LensCandidate[];
  /** 予定名（→ 目的レンズ）。 */
  readonly title: string;
  /** 予定の前後 gap（分・あれば予定接続/余白を計算）。 */
  readonly gapMinutes?: number | null;
  /** 候補ごとの観測 reason（Place Affinity 由来・無ければ null）。 */
  readonly affinityReasonFor?: (candidate: LensCandidate) => string | null;
  /** 確定 → 場所として設定し ① へ戻る（親が canonical 化 + close）。 */
  readonly onSelect: (candidate: LensCandidate) => void;
}

/** evidenceType → 小さなラベル（A 事実 / B 計算 / C 推定 / D 未確認）。 */
const EVIDENCE_TAG: Record<EvidenceType, string> = { fact: "事実", computed: "計算", weak: "推定", unconfirmed: "未確認" };

/** 写真でない抽象タイル（種別の頭文字・写真捏造でない装飾）。 */
function PlaceTile({ category }: { category: string | null }) {
  return (
    <div
      aria-hidden
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 text-[11px] font-medium text-slate-500 ring-1 ring-black/5"
    >
      {category ?? "場所"}
    </div>
  );
}

export function CandidateLensPanel({ candidates, title, gapMinutes, affinityReasonFor, onSelect }: CandidateLensPanelProps) {
  const lens = purposeLensFromSchedule(title);
  const views = candidates.map((c) =>
    buildLensCandidateView(c, lens, { gapMinutes, affinityReason: affinityReasonFor?.(c) ?? null }),
  );

  const [mode, setMode] = useState<"list" | "detail" | "compare">("list");
  const [primaryIndex, setPrimaryIndex] = useState(0);
  const [compareIndex, setCompareIndex] = useState(1);
  const [selectedSide, setSelectedSide] = useState<"left" | "right" | null>(null);
  const touchStartY = useState<{ y: number | null }>({ y: null })[0];

  if (views.length === 0) return null;

  const openDetail = (i: number) => { setPrimaryIndex(i); setMode("detail"); };
  const openCompare = (i: number) => {
    setPrimaryIndex(i);
    setCompareIndex(views.findIndex((_, j) => j !== i) >= 0 ? views.findIndex((_, j) => j !== i) : i);
    setSelectedSide(null);
    setMode("compare");
  };
  const otherIndices = views.map((_, j) => j).filter((j) => j !== primaryIndex);
  const cycleCompare = (dir: 1 | -1) => {
    if (otherIndices.length === 0) return;
    const pos = otherIndices.indexOf(compareIndex);
    const next = otherIndices[(pos + dir + otherIndices.length) % otherIndices.length];
    setCompareIndex(next);
    setSelectedSide(null);
  };

  // ───────────────────────── ① 候補が出る（1 枚ずつ・スクロール） ─────────────────────────
  if (mode === "list") {
    return (
      <div data-testid="lens-list" className="space-y-2">
        <p className="px-0.5 text-[13px] font-semibold tracking-tight text-slate-900">
          おすすめの候補
          <span className="ml-1.5 text-[11px] font-normal text-slate-400">{PURPOSE_LENS_LABEL[lens]}の目的で</span>
        </p>
        <div className="max-h-[19rem] snap-y space-y-2 overflow-y-auto pr-0.5">
          {views.map((v, i) => (
            <article
              key={v.placeId}
              data-testid="lens-card"
              className="snap-start rounded-2xl bg-white p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_6px_24px_rgba(0,0,0,0.06)] ring-1 ring-black/5"
            >
              <div className="flex items-start gap-3">
                <PlaceTile category={v.category} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="truncate text-[15px] font-semibold tracking-tight text-slate-900">{v.name}</h4>
                    {v.affinityBadge && (
                      <span className="shrink-0 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700">{v.affinityBadge}高め</span>
                    )}
                  </div>
                  {v.whyLine && <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{v.whyLine}</p>}
                  {v.primaryChips.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {v.primaryChips.map((chip) => (
                        <span key={chip.key} className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-black/5">
                          {chip.label} {chip.value}
                        </span>
                      ))}
                    </div>
                  )}
                  {v.address && <p className="mt-1.5 truncate text-[11px] text-slate-400">{v.address}</p>}
                  <div className="mt-2.5 flex gap-2">
                    <button type="button" onClick={() => openDetail(i)} data-testid="lens-card-detail"
                      className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-medium text-slate-700 transition hover:bg-slate-200">詳細を見る</button>
                    {views.length > 1 && (
                      <button type="button" onClick={() => openCompare(i)} data-testid="lens-card-compare"
                        className="rounded-full bg-purple-50 px-3 py-1 text-[12px] font-medium text-purple-700 transition hover:bg-purple-100">比較に追加</button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    );
  }

  // ───────────────────────── ② タップで詳細がひらく（インライン展開） ─────────────────────────
  if (mode === "detail") {
    const v = views[primaryIndex]!;
    return (
      <div data-testid="lens-detail" className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_30px_rgba(0,0,0,0.06)] ring-1 ring-black/5">
        <div className="flex items-start gap-3">
          <PlaceTile category={v.category} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-[16px] font-semibold tracking-tight text-slate-900">{v.name}</h4>
              {v.affinityBadge && <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700">{v.affinityBadge}高め</span>}
            </div>
            {v.category && <p className="mt-0.5 text-[12px] text-slate-400">{v.category}</p>}
            {v.address && <p className="mt-1 text-[12px] text-slate-500">{v.address}</p>}
          </div>
        </div>
        {/* 主役チップ（evidenceType を小さく） */}
        {v.primaryChips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {v.primaryChips.map((chip) => (
              <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-[12px] text-slate-700 ring-1 ring-black/5">
                {chip.label} {chip.value}
                <span className="text-[9px] text-slate-300">{EVIDENCE_TAG[v.attrs[chip.key].evidenceType]}</span>
              </span>
            ))}
          </div>
        )}
        {/* なぜここを選ぶ？ */}
        {v.whyLine && (
          <div className="mt-3 rounded-xl bg-slate-50/80 px-3.5 py-3">
            <p className="text-[11px] font-medium text-slate-400">なぜここを選ぶ？</p>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-700">{v.whyLine}</p>
          </div>
        )}
        <div className="mt-3 flex items-center justify-between">
          <button type="button" onClick={() => setMode("list")} data-testid="lens-detail-close"
            className="text-[12px] font-medium text-slate-400 transition hover:text-slate-600">‹ 候補一覧</button>
          {views.length > 1 && (
            <button type="button" onClick={() => openCompare(primaryIndex)} data-testid="lens-detail-compare"
              className="rounded-full bg-purple-50 px-3.5 py-1.5 text-[12px] font-medium text-purple-700 transition hover:bg-purple-100">比較に追加 ↑</button>
          )}
        </div>
      </div>
    );
  }

  // ───────────────────────── ③ 候補を比較する（理解する画面） ─────────────────────────
  const left = views[primaryIndex]!;
  const right = views[compareIndex]!;
  const comp = buildLensComparisonView(lens, left, right);

  const confirmSide = (side: "left" | "right") => {
    if (selectedSide === side) {
      onSelect(candidates[side === "left" ? primaryIndex : compareIndex]!);
      return;
    }
    setSelectedSide(side);
  };

  const headerCls = (side: "left" | "right") =>
    `min-w-0 flex-1 rounded-xl px-3 py-2 text-left transition ring-1 ${
      selectedSide === side ? "bg-purple-50 ring-purple-300" : "bg-white ring-black/5 hover:bg-slate-50"
    }`;

  return (
    <div data-testid="lens-compare" className="space-y-3">
      <div className="flex items-center justify-between px-0.5">
        <button type="button" onClick={() => setMode("list")} data-testid="lens-compare-back"
          className="text-[12px] font-medium text-slate-400 transition hover:text-slate-600">‹ 候補一覧</button>
        <span className="text-[11px] font-medium text-slate-400">{PURPOSE_LENS_LABEL[lens]}で比較中</span>
      </div>

      {/* 上部: 2 つの場所ヘッダー（タップで選択・再タップで確定） */}
      <div className="flex items-stretch gap-2">
        <button type="button" onClick={() => confirmSide("left")} data-testid="lens-compare-left" className={headerCls("left")}>
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold text-slate-900">{left.name}</span>
            {left.affinityBadge && <span className="shrink-0 text-[10px] text-purple-600">相性</span>}
          </span>
          {left.category && <span className="mt-0.5 block text-[10px] text-slate-400">{left.category}</span>}
        </button>
        {/* 右列: ▲▼ で比較対象を変更（スワイプも可） */}
        <div
          className="flex min-w-0 flex-1 items-stretch gap-1"
          onTouchStart={(e) => { touchStartY.y = e.touches[0]?.clientY ?? null; }}
          onTouchEnd={(e) => {
            if (touchStartY.y == null) return;
            const dy = (e.changedTouches[0]?.clientY ?? touchStartY.y) - touchStartY.y;
            if (Math.abs(dy) > 30) cycleCompare(dy < 0 ? 1 : -1);
            touchStartY.y = null;
          }}
        >
          <button type="button" onClick={() => confirmSide("right")} data-testid="lens-compare-right" className={headerCls("right")}>
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold text-slate-900">{right.name}</span>
              {right.affinityBadge && <span className="shrink-0 text-[10px] text-purple-600">相性</span>}
            </span>
            {right.category && <span className="mt-0.5 block text-[10px] text-slate-400">{right.category}</span>}
          </button>
          {otherIndices.length > 1 && (
            <div className="flex shrink-0 flex-col justify-center gap-0.5">
              <button type="button" onClick={() => cycleCompare(-1)} aria-label="前の候補" data-testid="lens-compare-prev"
                className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 text-[10px] text-slate-500 hover:bg-slate-200">▲</button>
              <button type="button" onClick={() => cycleCompare(1)} aria-label="次の候補" data-testid="lens-compare-next"
                className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 text-[10px] text-slate-500 hover:bg-slate-200">▼</button>
            </div>
          )}
        </div>
      </div>

      {/* 確定（控えめ・選択時のみ） */}
      {selectedSide && (
        <button type="button" data-testid="lens-compare-confirm" onClick={() => confirmSide(selectedSide)}
          className="w-full rounded-xl bg-purple-600 py-2 text-[13px] font-medium text-white transition hover:bg-purple-700">
          {(selectedSide === "left" ? left.name : right.name)} にする
        </button>
      )}

      {/* 比較表（目的レンズで行が変わる・優位は薄紫・未確認は出さない） */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_30px_rgba(0,0,0,0.06)] ring-1 ring-black/5 divide-y divide-black/5">
        {comp.mainRows.map((row) => (
          <div key={row.key} data-testid="lens-row" data-key={row.key} className="grid grid-cols-[5.5rem_1fr_1fr] items-center gap-2 px-3 py-2.5">
            <span className="flex items-center gap-1 text-[12px] text-slate-500">
              {row.label}
              <span className="text-[9px] text-slate-300">{EVIDENCE_TAG[row.evidenceType]}</span>
            </span>
            <span className={`rounded-md px-2 py-1 text-[12px] ${row.left.isBest ? "bg-purple-50 font-medium text-purple-900" : "text-slate-700"}`}>
              {row.left.value ?? "—"}{row.left.isBest && " ✓"}
            </span>
            <span className={`rounded-md px-2 py-1 text-[12px] ${row.right.isBest ? "bg-purple-50 font-medium text-purple-900" : "text-slate-700"}`}>
              {row.right.value ?? "—"}{row.right.isBest && " ✓"}
            </span>
          </div>
        ))}
      </div>

      {/* 未確認の項目（名前だけ・値は出さない） */}
      {comp.unconfirmedLabels.length > 0 && (
        <p data-testid="lens-unconfirmed" className="px-1 text-[11px] leading-relaxed text-slate-400">
          {comp.unconfirmedLabels.join("・")} は、この目的でも大切ですが、まだ確認できていません。
        </p>
      )}

      {/* 推薦サマリー（控えめ・根拠 trace 由来） */}
      {comp.recommendation && (
        <div data-testid="lens-recommendation" className="rounded-xl bg-purple-50/70 px-3.5 py-2.5">
          <p className="text-[12px] text-purple-900">
            <span className="font-medium">{comp.recommendation.side === "left" ? left.name : right.name}</span>
            {" が、"}{comp.recommendation.basisPhrase}
          </p>
        </div>
      )}
    </div>
  );
}
