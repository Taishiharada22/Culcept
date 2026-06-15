"use client";

/**
 * app/(culcept)/plan/components/CandidateLensPanel.tsx
 *   — Purpose-Adaptive Candidate Lens / Phase 2 UI（参照画像 add-search1/2/3 を**非トレース**で忠実再構成）
 *
 * ★flag default OFF / dev-only（呼び側 PlaceCandidatesPanel が isCandidateLensUiEnabled で分岐）。flag OFF は既存 <ul> 不変。
 * ★参照画像は ①②③で「枠の大きさ・形・出し方」が**全部違う**。既存シートのスクロール内に押し込まない:
 *   ① 候補が出る   … フォーム内の**インライン枠**。コンパクトカードを 1 候補ずつ主役に、下に次がのぞき、スクロールで送る。
 *   ② 詳細がひらく … **下から立ち上がる大きなボトムシート**（portal・画面下半分〜2/3・大メディア＋なぜここをおすすめ？）。
 *   ③ 候補を比較   … **全画面ページ**（portal・戻る＋比較中 N 件・2 候補ヘッダー＋比較表＋推薦＋確定）。既存枠から完全に脱出。
 * ★honesty（CEO）: 写真/Wi-Fi/電源/静か等の未確認は**捏造しない**。写真→抽象タイル・未確認は主表から外す・
 *   優位ハイライトは「表示値に差がある行」のみ・Evidence B は「約/目安」。トレース/画像切り貼り/写真捏造なし。
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  buildLensCandidateView,
  buildLensComparisonView,
  purposeLensFromSchedule,
  type LensCandidate,
  type LensCandidateView,
} from "@/lib/plan/candidateLens/candidateLensUi";
import { PURPOSE_LENS_LABEL } from "@/lib/plan/candidateLens/purposeLens";
import type { AttributeKey, EvidenceType } from "@/lib/plan/candidateLens/placeAttributeModel";

export interface CandidateLensPanelProps {
  readonly candidates: readonly LensCandidate[];
  readonly title: string;
  readonly gapMinutes?: number | null;
  readonly affinityReasonFor?: (candidate: LensCandidate) => string | null;
  readonly onSelect: (candidate: LensCandidate) => void;
  readonly onSkip?: () => void;
}

const EVIDENCE_TAG: Record<EvidenceType, string> = { fact: "事実", computed: "計算", weak: "推定", unconfirmed: "未確認" };

const ATTR_ICON: Record<AttributeKey, string> = {
  walk_estimate: "🚶", schedule_fit: "🗓️", margin_impact: "🌿", affinity_reason: "💜", category: "🏷️",
  address: "📍", social_fit: "💬", quiet: "🤫", wifi: "📶", power: "🔌", hours: "🕐", crowd: "👥", photo: "📷",
};

function tileTone(category: string | null): string {
  switch (category) {
    case "カフェ": case "ベーカリー": return "from-amber-100 to-orange-50 text-amber-700";
    case "レストラン": case "バー": case "テイクアウト": return "from-rose-100 to-red-50 text-rose-700";
    case "図書館": case "書店": return "from-sky-100 to-indigo-50 text-sky-700";
    case "公園": return "from-emerald-100 to-green-50 text-emerald-700";
    case "ジム": return "from-violet-100 to-purple-50 text-violet-700";
    default: return "from-slate-100 to-slate-50 text-slate-500";
  }
}

/** 写真でない抽象メディアタイル。size で thumb/banner/mini を切替。 */
function PlaceMedia({ category, size = "thumb" }: { category: string | null; size?: "banner" | "thumb" | "mini" }) {
  const dim = size === "banner" ? "h-40 w-full" : size === "mini" ? "h-14 w-full" : "h-[4.25rem] w-[4.25rem]";
  const glyph = size === "banner" ? "text-[34px]" : "text-[20px]";
  return (
    <div aria-hidden className={`relative flex ${dim} shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br ${tileTone(category)} ring-1 ring-black/5`}>
      <span className={glyph}>📍</span>
      <span className="absolute bottom-1.5 left-2 rounded-full bg-white/55 px-2 py-0.5 text-[11px] font-medium">{category ?? "場所"}</span>
    </div>
  );
}

function ChipRow({ view, withEvidence = false, className = "mt-2.5" }: { view: LensCandidateView; withEvidence?: boolean; className?: string }) {
  if (view.primaryChips.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {view.primaryChips.map((chip) => (
        <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-[12px] text-slate-700 ring-1 ring-black/5">
          <span aria-hidden className="text-[11px]">{ATTR_ICON[chip.key]}</span>{chip.value}
          {withEvidence && <span className="ml-0.5 text-[9px] text-slate-300">{EVIDENCE_TAG[view.attrs[chip.key].evidenceType]}</span>}
        </span>
      ))}
    </div>
  );
}

/** body への portal（SSR 安全）。②③の枠を既存シートのスクロールから脱出させる。 */
function Overlay({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

export function CandidateLensPanel({ candidates, title, gapMinutes, affinityReasonFor, onSelect, onSkip }: CandidateLensPanelProps) {
  const lens = purposeLensFromSchedule(title);
  const views = candidates.map((c) => buildLensCandidateView(c, lens, { gapMinutes, affinityReason: affinityReasonFor?.(c) ?? null }));

  const [detailIndex, setDetailIndex] = useState<number | null>(null); // ② ボトムシート表示中の候補
  const [mode, setMode] = useState<"browse" | "compare">("browse");
  const [primaryIndex, setPrimaryIndex] = useState(0);
  const [compareIndex, setCompareIndex] = useState(1);
  const [selectedSide, setSelectedSide] = useState<"left" | "right" | null>(null);
  const touchStartY = useState<{ y: number | null }>({ y: null })[0];

  if (views.length === 0) return null;

  const openCompare = (i: number) => {
    setPrimaryIndex(i);
    const other = views.findIndex((_, j) => j !== i);
    setCompareIndex(other >= 0 ? other : i);
    setSelectedSide(null);
    setDetailIndex(null);
    setMode("compare");
  };
  const otherIndices = views.map((_, j) => j).filter((j) => j !== primaryIndex);
  const cycleCompare = (dir: 1 | -1) => {
    if (otherIndices.length === 0) return;
    const pos = otherIndices.indexOf(compareIndex);
    setCompareIndex(otherIndices[(pos + dir + otherIndices.length) % otherIndices.length]);
    setSelectedSide(null);
  };

  // ════════════════════════ ① 候補が出る（フォーム内インライン枠・1 候補ずつ主役） ════════════════════════
  return (
    <>
      <div data-testid="lens-list" className="mt-3">
        <p className="mb-2 px-0.5 text-[14px] font-semibold tracking-tight text-slate-900">おすすめの候補</p>
        {/* ★1 候補を主役・下に次が少しのぞくだけの短い snap 枠。スクロールで次々送る。 */}
        <div className="h-[18.5rem] snap-y snap-mandatory space-y-3 overflow-y-auto pr-0.5">
          {views.map((v, i) => (
            <article key={v.placeId} data-testid="lens-card"
              className="snap-start scroll-mt-1 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_28px_rgba(0,0,0,0.06)] ring-1 ring-black/5">
              <div className="flex items-start gap-3">
                <PlaceMedia category={v.category} size="thumb" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-[15.5px] font-semibold leading-snug tracking-tight text-slate-900">{v.name}</h4>
                    {v.affinityBadge && <span className="mt-0.5 shrink-0 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700">{v.affinityBadge}高め</span>}
                  </div>
                  {v.whyLine && <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">{v.whyLine}</p>}
                </div>
              </div>
              <ChipRow view={v} />
              {v.address && (
                <p className="mt-2 flex items-start gap-1 text-[12px] leading-relaxed text-slate-500"><span aria-hidden className="mt-px text-[11px]">📍</span><span className="min-w-0">{v.address}</span></p>
              )}
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setDetailIndex(i)} data-testid="lens-card-detail"
                  className="flex-1 rounded-xl bg-slate-100 py-2 text-[13px] font-medium text-slate-700 transition hover:bg-slate-200 active:scale-[0.99]">詳細を見る</button>
                {views.length > 1 && (
                  <button type="button" onClick={() => openCompare(i)} data-testid="lens-card-compare"
                    className="flex-1 rounded-xl bg-purple-600 py-2 text-[13px] font-medium text-white transition hover:bg-purple-700 active:scale-[0.99]">比較する ⇧</button>
                )}
              </div>
            </article>
          ))}
        </div>
        {onSkip && (
          <div className="mt-2 text-center">
            <button type="button" onClick={onSkip} data-testid="lens-skip" className="rounded-md px-3 py-1.5 text-[12px] text-slate-400 underline transition hover:text-slate-600">場所を選ばずに保存</button>
          </div>
        )}
      </div>

      {/* ════════════════════ ② 詳細（下から立ち上がるボトムシート・別枠・portal） ════════════════════ */}
      {detailIndex !== null && (() => {
        const v = views[detailIndex]!;
        return (
          <Overlay>
            <div className="fixed inset-0 z-[90] flex items-end justify-center" data-testid="lens-detail">
              <div className="absolute inset-0 bg-black/40" onClick={() => setDetailIndex(null)} aria-hidden />
              <div className="relative w-full max-w-[480px] max-h-[86vh] overflow-y-auto rounded-t-[1.75rem] bg-white px-5 pb-6 pt-3 shadow-[0_-8px_40px_rgba(0,0,0,0.18)]">
                <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" aria-hidden />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-[18px] font-semibold tracking-tight text-slate-900">{v.name}</h3>
                    <div className="mt-0.5 flex items-center gap-2">
                      {v.category && <span className="text-[12px] text-slate-400">{v.category}</span>}
                      {v.affinityBadge && <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700">{v.affinityBadge}高め</span>}
                    </div>
                  </div>
                  <button type="button" onClick={() => setDetailIndex(null)} data-testid="lens-detail-close" aria-label="閉じる"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[15px] text-slate-500 transition hover:bg-slate-200">✕</button>
                </div>
                <div className="mt-3"><PlaceMedia category={v.category} size="banner" /></div>
                {v.address && (
                  <p className="mt-3 flex items-start gap-1.5 text-[13.5px] leading-relaxed text-slate-600"><span aria-hidden className="mt-px">📍</span><span className="min-w-0">{v.address}</span></p>
                )}
                <ChipRow view={v} withEvidence />
                {v.whyLine && (
                  <div className="mt-4 rounded-2xl bg-purple-50/70 px-4 py-4">
                    <p className="text-[12.5px] font-semibold text-purple-700">なぜここをおすすめ？</p>
                    <p className="mt-1.5 text-[14.5px] leading-relaxed text-slate-700">{v.whyLine}</p>
                  </div>
                )}
                <div className="mt-5 flex gap-2">
                  <button type="button" onClick={() => setDetailIndex(null)} data-testid="lens-detail-back"
                    className="flex-1 rounded-xl bg-slate-100 py-2.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-200">閉じる</button>
                  {views.length > 1 && (
                    <button type="button" onClick={() => openCompare(detailIndex)} data-testid="lens-detail-compare"
                      className="flex-1 rounded-xl bg-purple-600 py-2.5 text-[13px] font-medium text-white transition hover:bg-purple-700">比較する ⇧</button>
                  )}
                  <button type="button" onClick={() => onSelect(candidates[detailIndex]!)} data-testid="lens-detail-select"
                    className="flex-1 rounded-xl bg-slate-900 py-2.5 text-[13px] font-medium text-white transition hover:bg-slate-800">ここにする</button>
                </div>
              </div>
            </div>
          </Overlay>
        );
      })()}

      {/* ════════════════════ ③ 比較（全画面ページ・別枠・portal） ════════════════════ */}
      {mode === "compare" && (() => {
        const left = views[primaryIndex]!;
        const right = views[compareIndex]!;
        const comp = buildLensComparisonView(lens, left, right);
        const confirmSide = (side: "left" | "right") => {
          if (selectedSide === side) { onSelect(candidates[side === "left" ? primaryIndex : compareIndex]!); return; }
          setSelectedSide(side);
        };
        const headerCls = (side: "left" | "right") =>
          `min-w-0 flex-1 rounded-2xl p-3 text-left transition ring-1 ${selectedSide === side ? "bg-purple-50 ring-purple-300" : "bg-white ring-black/5 hover:bg-slate-50"}`;
        return (
          <Overlay>
            <div className="fixed inset-0 z-[100] flex flex-col bg-slate-50" data-testid="lens-compare">
              {/* top bar */}
              <div className="flex items-center justify-between border-b border-black/5 bg-white px-4 py-3">
                <button type="button" onClick={() => setMode("browse")} data-testid="lens-compare-back"
                  className="flex items-center gap-1 text-[14px] font-medium text-slate-600 transition hover:text-slate-900">‹ 戻る</button>
                <span className="text-[14px] font-semibold text-slate-800">候補を比較</span>
                <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-[11px] font-medium text-purple-700">{PURPOSE_LENS_LABEL[lens]}</span>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="mx-auto max-w-[560px] space-y-4">
                  {/* 2 候補ヘッダー */}
                  <div className="flex items-stretch gap-2">
                    <button type="button" onClick={() => confirmSide("left")} data-testid="lens-compare-left" className={headerCls("left")}>
                      <PlaceMedia category={left.category} size="mini" />
                      <span className="mt-2 block truncate text-[14px] font-semibold text-slate-900">{left.name}</span>
                      <span className="flex items-center gap-1 text-[11px] text-slate-400">{left.category}{left.affinityBadge && <span className="text-purple-600">· 相性</span>}</span>
                    </button>
                    <div className="flex min-w-0 flex-1 items-stretch gap-1"
                      onTouchStart={(e) => { touchStartY.y = e.touches[0]?.clientY ?? null; }}
                      onTouchEnd={(e) => { if (touchStartY.y == null) return; const dy = (e.changedTouches[0]?.clientY ?? touchStartY.y) - touchStartY.y; if (Math.abs(dy) > 30) cycleCompare(dy < 0 ? 1 : -1); touchStartY.y = null; }}>
                      <button type="button" onClick={() => confirmSide("right")} data-testid="lens-compare-right" className={headerCls("right")}>
                        <PlaceMedia category={right.category} size="mini" />
                        <span className="mt-2 block truncate text-[14px] font-semibold text-slate-900">{right.name}</span>
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">{right.category}{right.affinityBadge && <span className="text-purple-600">· 相性</span>}</span>
                      </button>
                      {otherIndices.length > 1 && (
                        <div className="flex shrink-0 flex-col justify-center gap-1">
                          <button type="button" onClick={() => cycleCompare(-1)} aria-label="前の候補" data-testid="lens-compare-prev" className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[12px] text-slate-500 ring-1 ring-black/5 hover:bg-slate-100">▲</button>
                          <button type="button" onClick={() => cycleCompare(1)} aria-label="次の候補" data-testid="lens-compare-next" className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[12px] text-slate-500 ring-1 ring-black/5 hover:bg-slate-100">▼</button>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="px-0.5 text-[11px] text-slate-400">候補をタップ → もう一度タップで確定（右は ▲▼ で入れ替え）</p>

                  {/* 比較表 */}
                  <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_30px_rgba(0,0,0,0.07)] ring-1 ring-black/5">
                    <div className="grid grid-cols-[5rem_1fr_1fr] border-b border-black/5 px-3.5 py-2 text-[12px] font-semibold text-slate-500">
                      <span>項目</span><span className="truncate">{left.name}</span><span className="truncate">{right.name}</span>
                    </div>
                    <div className="divide-y divide-black/5">
                      {comp.mainRows.map((row) => (
                        <div key={row.key} data-testid="lens-row" data-key={row.key} className="grid grid-cols-[5rem_1fr_1fr] items-center gap-2 px-3 py-3">
                          <span className="flex items-center gap-1 text-[12px] text-slate-500"><span aria-hidden className="text-[13px]">{ATTR_ICON[row.key]}</span>{row.label}</span>
                          <span className={`rounded-lg px-2 py-1.5 text-[12.5px] leading-snug ${row.left.isBest ? "bg-purple-50 font-semibold text-purple-900" : "text-slate-700"}`}>{row.left.isBest && <span aria-hidden className="mr-0.5 text-purple-500">✓</span>}{row.left.value ?? "—"}</span>
                          <span className={`rounded-lg px-2 py-1.5 text-[12.5px] leading-snug ${row.right.isBest ? "bg-purple-50 font-semibold text-purple-900" : "text-slate-700"}`}>{row.right.isBest && <span aria-hidden className="mr-0.5 text-purple-500">✓</span>}{row.right.value ?? "—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {comp.unconfirmedLabels.length > 0 && (
                    <p data-testid="lens-unconfirmed" className="px-1 text-[11px] leading-relaxed text-slate-400">{comp.unconfirmedLabels.join("・")} は、この目的でも大切ですが、まだ確認できていません。</p>
                  )}

                  {comp.recommendation && (
                    <div data-testid="lens-recommendation" className="rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 px-4 py-4 ring-1 ring-purple-100">
                      <p className="text-[12.5px] font-semibold text-purple-700">✨ おすすめ</p>
                      <p className="mt-1 text-[15px] leading-relaxed text-slate-800"><span className="font-semibold">{comp.recommendation.side === "left" ? left.name : right.name}</span>{" が、"}{comp.recommendation.basisPhrase}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 確定バー（下部固定） */}
              {selectedSide && (
                <div className="border-t border-black/5 bg-white px-4 py-3">
                  <button type="button" data-testid="lens-compare-confirm" onClick={() => confirmSide(selectedSide)}
                    className="mx-auto block w-full max-w-[560px] rounded-xl bg-purple-600 py-3 text-[15px] font-semibold text-white shadow-sm transition hover:bg-purple-700 active:scale-[0.99]">
                    {(selectedSide === "left" ? left.name : right.name)} をこの予定の場所にする
                  </button>
                </div>
              )}
            </div>
          </Overlay>
        );
      })()}
    </>
  );
}
