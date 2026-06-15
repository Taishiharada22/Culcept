"use client";

/**
 * app/(culcept)/plan/components/CandidateLensPanel.tsx
 *   — Purpose-Adaptive Candidate Lens / Phase 2 UI（redline 仕様 `docs/purpose-adaptive-candidate-lens-redline-spec.md` 準拠・非トレース再構成）
 *
 * ★flag default OFF / dev-only（呼び側 PlaceCandidatesPanel が isCandidateLensUiEnabled で分岐）。flag OFF は既存 <ul> 不変。
 * ★3 状態（枠の大きさ・形・出し方が全部違う）:
 *   ① 候補が出る   … 候補が主役。1 候補カード（密度を参照画像に寄せる＝サムネ/名前/相性/理由/属性/住所/簡易map/2導線）を
 *                    主役表示し、下に次候補が少しのぞく。縦 snap でスクロール送り。
 *   ② 詳細がひらく … ★ボトムシートにしない。**①と同じ候補領域の中でカードがその場で大きく展開**（accordion）。
 *                    大メディア＋住所＋徒歩目安＋目的レンズ由来「なぜここを選ぶ？」。
 *   ③ 候補を比較   … ★全画面ページにしない・既存スクロールにも収めない。**画面下から立ち上がる 70–85vh の比較専用
 *                    ボトムシート**（背景暗転・比較表が主役・2 候補ヘッダー＋優位ハイライト＋✨おすすめ＋確定）。
 * ★honesty: 写真→abstract tile・地図→簡易 map tile(装飾・実地図でない)・Wi-Fi/電源/静か/雰囲気/営業時間は捏造せず
 *   主表から外し「未確認」を小さく注記・優位は表示値差のみ・B は約/目安。スカスカ禁止＝密度は参照画像に寄せる。
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

/** 写真の代わり＝category 色の abstract タイル（写真でない・category ラベル＋📍）。 */
function PlaceTile({ category, size = "thumb" }: { category: string | null; size?: "thumb" | "mini" }) {
  const dim = size === "mini" ? "h-14 w-full" : "h-[4.5rem] w-[4.5rem]";
  return (
    <div aria-hidden className={`relative flex ${dim} shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br ${tileTone(category)} ring-1 ring-black/5`}>
      <span className="text-[20px]">🏠</span>
      <span className="absolute bottom-1 left-1.5 rounded-full bg-white/55 px-1.5 py-0.5 text-[10px] font-medium">{category ?? "場所"}</span>
    </div>
  );
}

/** 簡易 map タイル（★装飾・実地図でない／外部 API なし）。薄いグリッド＋斜めの道＋中心ピンで「地図っぽさ」だけ出す。 */
const GRID_BG: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(rgba(15,23,42,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.06) 1px, transparent 1px)",
  backgroundSize: "14px 14px",
};
function MapTile({ size = "sm" }: { size?: "sm" | "banner" }) {
  const dim = size === "banner" ? "h-[9.5rem] w-full" : "h-[4.5rem] w-[4.5rem]";
  return (
    <div aria-hidden className={`relative ${dim} shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-black/5`}>
      <div className="absolute inset-0" style={GRID_BG} />
      <div className="absolute -left-2 top-1/2 h-[3px] w-[140%] -rotate-[20deg] rounded-full bg-slate-200/80" />
      <div className="absolute left-1/3 -top-2 h-[150%] w-[3px] rotate-[12deg] rounded-full bg-slate-200/70" />
      <span className="absolute inset-0 flex items-center justify-center text-[18px]">📍</span>
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

/** body への portal（SSR 安全）。③比較専用シートを予定追加シートのスクロールから出す。 */
function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

export function CandidateLensPanel({ candidates, title, gapMinutes, affinityReasonFor, onSelect, onSkip }: CandidateLensPanelProps) {
  const lens = purposeLensFromSchedule(title);
  const views = candidates.map((c) => buildLensCandidateView(c, lens, { gapMinutes, affinityReason: affinityReasonFor?.(c) ?? null }));

  const [expandedId, setExpandedId] = useState<string | null>(null); // ② その場展開中の placeId
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
    setMode("compare");
  };
  const otherIndices = views.map((_, j) => j).filter((j) => j !== primaryIndex);
  const cycleCompare = (dir: 1 | -1) => {
    if (otherIndices.length === 0) return;
    const pos = otherIndices.indexOf(compareIndex);
    setCompareIndex(otherIndices[(pos + dir + otherIndices.length) % otherIndices.length]);
    setSelectedSide(null);
  };

  return (
    <>
      {/* ════════════ ①② 候補領域（①一覧 ＋ ②その場 accordion 展開・同じ枠の中で完結） ════════════ */}
      <div data-testid="lens-list" className="mt-3">
        <p className="mb-2 px-0.5 text-[14px] font-semibold tracking-tight text-slate-900">おすすめの候補</p>
        {/* ブラウズ中: 1 候補主役＋次が少しのぞく短い snap 枠。展開中: 高さ制限を外し詳細を全部見せる。 */}
        <div className={expandedId !== null ? "space-y-3" : "h-[19.5rem] snap-y snap-mandatory space-y-3 overflow-y-auto pr-0.5"}>
          {views.map((v, i) => {
            const expanded = expandedId === v.placeId;
            return (
              <article key={v.placeId} data-testid="lens-card" data-expanded={expanded}
                className={`snap-start scroll-mt-1 rounded-[20px] bg-white p-4 ring-1 transition ${expanded ? "ring-purple-200 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_44px_rgba(124,58,237,0.12)]" : "ring-black/5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_28px_rgba(0,0,0,0.06)]"}`}>
                {!expanded ? (
                  /* ───── ① コンパクト（密度を参照画像に寄せる：サムネ＋名前＋相性＋理由＋属性＋住所＋簡易map＋2導線） ───── */
                  <>
                    <div className="flex items-start gap-3">
                      <PlaceTile category={v.category} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-[16px] font-semibold leading-snug tracking-tight text-slate-900">{v.name}</h4>
                          {v.affinityBadge && <span className="mt-0.5 shrink-0 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700">{v.affinityBadge}高め</span>}
                        </div>
                        {v.category && <p className="mt-0.5 text-[11.5px] text-slate-400">{v.category}</p>}
                        {v.whyLine && <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{v.whyLine}</p>}
                      </div>
                    </div>
                    <ChipRow view={v} />
                    <div className="mt-2.5 flex items-end gap-2">
                      <p className="flex min-w-0 flex-1 items-start gap-1 text-[12px] leading-relaxed text-slate-500"><span aria-hidden className="mt-px text-[11px]">📍</span><span className="min-w-0">{v.address ?? "住所は未取得です"}</span></p>
                      <MapTile size="sm" />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => setExpandedId(v.placeId)} data-testid="lens-card-detail"
                        className="flex-1 rounded-xl bg-slate-100 py-2.5 text-[13px] font-medium text-slate-700 transition hover:bg-slate-200 active:scale-[0.99]">詳細を見る</button>
                      {views.length > 1 && (
                        <button type="button" onClick={() => openCompare(i)} data-testid="lens-card-compare"
                          className="flex-1 rounded-xl bg-purple-600 py-2.5 text-[13px] font-medium text-white transition hover:bg-purple-700 active:scale-[0.99]">比較する ⇧</button>
                      )}
                    </div>
                  </>
                ) : (
                  /* ───── ② その場展開（同じ枠の中で大きく・大メディア＋住所＋属性＋なぜここを選ぶ？） ───── */
                  <div data-testid="lens-detail">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-[17px] font-semibold tracking-tight text-slate-900">{v.name}</h4>
                        <div className="mt-0.5 flex items-center gap-2">
                          {v.category && <span className="text-[12px] text-slate-400">{v.category}</span>}
                          {v.affinityBadge && <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700">{v.affinityBadge}高め</span>}
                        </div>
                      </div>
                      <button type="button" onClick={() => setExpandedId(null)} data-testid="lens-detail-close" aria-label="閉じる"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200">⌃</button>
                    </div>
                    {/* 大メディア（abstract place tile ＋ 簡易 map banner で密度を出す） */}
                    <div className="mt-3 flex gap-2">
                      <div className="w-[38%]"><PlaceTile category={v.category} size="mini" /></div>
                      <div className="flex-1"><MapTile size="sm" /></div>
                    </div>
                    {v.address && (
                      <p className="mt-3 flex items-start gap-1.5 text-[13px] leading-relaxed text-slate-600"><span aria-hidden className="mt-px">📍</span><span className="min-w-0">{v.address}</span></p>
                    )}
                    <ChipRow view={v} withEvidence />
                    {v.whyLine && (
                      <div className="mt-4 rounded-xl bg-purple-50/70 px-4 py-3.5">
                        <p className="text-[12px] font-semibold text-purple-700">なぜここを選ぶ？</p>
                        <p className="mt-1.5 text-[14px] leading-relaxed text-slate-700">{v.whyLine}</p>
                      </div>
                    )}
                    <div className="mt-4 flex items-center gap-2">
                      <button type="button" onClick={() => setExpandedId(null)} data-testid="lens-detail-back"
                        className="flex-1 rounded-xl bg-slate-100 py-2.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-200">‹ 閉じる</button>
                      {views.length > 1 && (
                        <button type="button" onClick={() => openCompare(i)} data-testid="lens-detail-compare"
                          className="flex-1 rounded-xl bg-purple-600 py-2.5 text-[13px] font-medium text-white transition hover:bg-purple-700">比較する ⇧</button>
                      )}
                      <button type="button" onClick={() => onSelect(candidates[i]!)} data-testid="lens-detail-select"
                        className="flex-1 rounded-xl bg-slate-900 py-2.5 text-[13px] font-medium text-white transition hover:bg-slate-800">ここにする</button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
        {onSkip && (
          <div className="mt-2 text-center">
            <button type="button" onClick={onSkip} data-testid="lens-skip" className="rounded-md px-3 py-1.5 text-[12px] text-slate-400 underline transition hover:text-slate-600">場所を選ばずに保存</button>
          </div>
        )}
      </div>

      {/* ════════════ ③ 比較専用ボトムシート（70–85vh・背景暗転・比較表が主役・portal） ════════════ */}
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
          <Portal>
            <div className="fixed inset-0 z-[100] flex items-end justify-center" data-testid="lens-compare">
              <div className="absolute inset-0 bg-black/45" onClick={() => setMode("browse")} aria-hidden />
              <div className="relative flex h-[84vh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[1.75rem] bg-slate-50 shadow-[0_-10px_44px_rgba(0,0,0,0.22)]">
                {/* ヘッダー */}
                <div className="shrink-0 bg-white px-4 pb-3 pt-3">
                  <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-slate-200" aria-hidden />
                  <div className="flex items-center justify-between">
                    <button type="button" onClick={() => setMode("browse")} data-testid="lens-compare-back" className="flex items-center gap-1 text-[14px] font-medium text-slate-600 transition hover:text-slate-900">‹ 戻る</button>
                    <span className="text-[15px] font-semibold text-slate-900">候補を比較</span>
                    <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-[11px] font-medium text-purple-700">{PURPOSE_LENS_LABEL[lens]}</span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4">
                  <div className="mx-auto max-w-[520px] space-y-4">
                    {/* 2 候補ヘッダー */}
                    <div className="flex items-stretch gap-2">
                      <button type="button" onClick={() => confirmSide("left")} data-testid="lens-compare-left" className={headerCls("left")}>
                        <PlaceTile category={left.category} size="mini" />
                        <span className="mt-2 block truncate text-[14px] font-semibold text-slate-900">{left.name}</span>
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">{left.category}{left.affinityBadge && <span className="text-purple-600">· 相性</span>}</span>
                      </button>
                      <div className="flex min-w-0 flex-1 items-stretch gap-1"
                        onTouchStart={(e) => { touchStartY.y = e.touches[0]?.clientY ?? null; }}
                        onTouchEnd={(e) => { if (touchStartY.y == null) return; const dy = (e.changedTouches[0]?.clientY ?? touchStartY.y) - touchStartY.y; if (Math.abs(dy) > 30) cycleCompare(dy < 0 ? 1 : -1); touchStartY.y = null; }}>
                        <button type="button" onClick={() => confirmSide("right")} data-testid="lens-compare-right" className={headerCls("right")}>
                          <PlaceTile category={right.category} size="mini" />
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

                    {/* 比較表（主役） */}
                    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_30px_rgba(0,0,0,0.07)] ring-1 ring-black/5">
                      <div className="grid grid-cols-[4.5rem_1fr_1fr] border-b border-black/5 px-3.5 py-2 text-[12px] font-semibold text-slate-500"><span>項目</span><span className="truncate">{left.name}</span><span className="truncate">{right.name}</span></div>
                      <div className="divide-y divide-black/5">
                        {comp.mainRows.map((row) => (
                          <div key={row.key} data-testid="lens-row" data-key={row.key} className="grid min-h-[52px] grid-cols-[4.5rem_1fr_1fr] items-center gap-2 px-3 py-3">
                            <span className="flex items-center gap-1 text-[12px] text-slate-500"><span aria-hidden className="text-[13px]">{ATTR_ICON[row.key]}</span>{row.label}</span>
                            <span className={`rounded-lg px-2 py-1.5 text-[12.5px] leading-snug ${row.left.isBest ? "bg-purple-50 font-semibold text-purple-900" : "text-slate-700"}`}>{row.left.isBest && <span aria-hidden className="mr-0.5 text-purple-500">✓</span>}{row.left.value ?? "—"}</span>
                            <span className={`rounded-lg px-2 py-1.5 text-[12.5px] leading-snug ${row.right.isBest ? "bg-purple-50 font-semibold text-purple-900" : "text-slate-700"}`}>{row.right.isBest && <span aria-hidden className="mr-0.5 text-purple-500">✓</span>}{row.right.value ?? "—"}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 未確認（密度のため小さく明示・捏造でなく「まだ持っていない」と正直に） */}
                    {comp.unconfirmedLabels.length > 0 && (
                      <div data-testid="lens-unconfirmed" className="rounded-2xl bg-white px-3.5 py-3 ring-1 ring-black/5">
                        <p className="text-[11px] font-medium text-slate-400">まだ確認できていない項目（この目的で気になるなら現地で確認を）</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {comp.unconfirmedLabels.map((label) => (
                            <span key={label} className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-400 ring-1 ring-black/5">{label}：未確認</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {comp.recommendation && (
                      <div data-testid="lens-recommendation" className="rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 px-4 py-4 ring-1 ring-purple-100">
                        <p className="text-[12.5px] font-semibold text-purple-700">✨ おすすめ</p>
                        <p className="mt-1 text-[15px] leading-relaxed text-slate-800"><span className="font-semibold">{comp.recommendation.side === "left" ? left.name : right.name}</span>{" が、"}{comp.recommendation.basisPhrase}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 確定バー（選択時のみ・下部固定） */}
                {selectedSide && (
                  <div className="shrink-0 border-t border-black/5 bg-white px-4 py-3">
                    <button type="button" data-testid="lens-compare-confirm" onClick={() => confirmSide(selectedSide)}
                      className="mx-auto block w-full max-w-[520px] rounded-xl bg-purple-600 py-3 text-[15px] font-semibold text-white shadow-sm transition hover:bg-purple-700 active:scale-[0.99]">
                      {(selectedSide === "left" ? left.name : right.name)} をこの予定の場所にする
                    </button>
                  </div>
                )}
              </div>
            </div>
          </Portal>
        );
      })()}
    </>
  );
}
