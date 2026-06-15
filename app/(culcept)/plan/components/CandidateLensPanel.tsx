"use client";

/**
 * app/(culcept)/plan/components/CandidateLensPanel.tsx
 *   — Purpose-Adaptive Candidate Lens / Phase 2 UI（理想画像 add-search1/2/3 を唯一の正として非トレース再構成 / REDO-6 最終仕様）
 *
 * ★flag default OFF / dev-only（呼び側 PlaceCandidatesPanel が isCandidateLensUiEnabled で分岐）。flag OFF は既存 <ul> 不変。
 * ★状態遷移そのものを 3 状態で表現（枠の使い方が①②③で違う）:
 *   ① 候補が出る   … 「おすすめの候補」見出し＋**1 件固定の主役カード**（次候補を見せない＝一覧感なし）。
 *                    **上下スワイプ / ▲▼ / pager** で前後候補へ「捲る」。カードは領域幅をしっかり使い密度を持つ。
 *   ② 詳細がひらく … ★ボトムシートにしない。タップで**候補領域全体が詳細モードに切替**わり、見出しを畳んで
 *                    入力欄群の直下から**大きく展開**。大メディア(place tile+map tile)＋住所＋徒歩＋チップ＋
 *                    「なぜここを選ぶ？」(複数行)＋比較導線を主役で出す。
 *   ③ 候補を比較   … ★比較専用モード。戻る/予定名/比較中N件/目的説明 → **2 候補ヘッダー(compact)** → **比較表(主役・最大面積)**
 *                    → おすすめサマリー。70–85vh の比較専用サーフェス(背景暗転)。比較表が画面の中心。
 * ★honesty: 写真→category タイル・地図→簡易 map タイル(装飾・実地図でない)・Wi-Fi/電源/静か/雰囲気/営業時間は捏造せず
 *   「未確認」注記・優位は表示値差のみ・B は約/目安。密度は寄せるが捏造しない。
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
import { PURPOSE_LENS_LABEL, type PurposeLens } from "@/lib/plan/candidateLens/purposeLens";
import { ATTRIBUTE_LABEL, type AttributeKey, type EvidenceType } from "@/lib/plan/candidateLens/placeAttributeModel";

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

/** 目的レンズ → 比較モードの「今回の目的」説明（UI コピー・捏造でない）。 */
const LENS_PURPOSE_LINE: Record<PurposeLens, string> = {
  meeting_prep: "会議前に落ち着いて準備できる場所を比べています",
  focus_work: "集中して作業しやすい場所を比べています",
  conversation: "ゆっくり話せる場所を比べています",
  errand: "ついでに寄りやすい場所を比べています",
  generic: "向かいやすい場所を比べています",
};

/** ② 詳細のサブタイトル（目的に対する一言・捏造でない UI コピー）。 */
const LENS_SUBTITLE: Record<PurposeLens, string> = {
  meeting_prep: "会議前に落ち着いて準備しやすい場所です",
  focus_work: "集中して作業しやすい場所です",
  conversation: "ゆっくり話しやすい場所です",
  errand: "ついでに寄りやすい場所です",
  generic: "向かいやすい場所です",
};

/** ②③ の密度づくり用：理想画像にある属性で**まだデータを持たない**もの。捏造でなく「未確認」と明示して並べる。 */
const UNCONFIRMED_COMMON: readonly AttributeKey[] = ["quiet", "wifi", "power", "hours"];

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

/** 写真の代わり＝category 色 abstract タイル（写真でない・category ラベル）。 */
function PlaceTile({ category, h = "h-[4.5rem]", w = "w-[4.5rem]" }: { category: string | null; h?: string; w?: string }) {
  return (
    <div aria-hidden className={`relative flex ${h} ${w} shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br ${tileTone(category)} ring-1 ring-black/5`}>
      <span className="text-[20px]">🏠</span>
      <span className="absolute bottom-1 left-1.5 rounded-full bg-white/55 px-1.5 py-0.5 text-[10px] font-medium">{category ?? "場所"}</span>
    </div>
  );
}

/** 簡易 map タイル（★装飾・実地図でない / 外部 API なし）。 */
const GRID_BG: React.CSSProperties = {
  backgroundImage: "linear-gradient(rgba(15,23,42,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.06) 1px, transparent 1px)",
  backgroundSize: "14px 14px",
};
function MapTile({ h = "h-[4.5rem]", w = "w-[4.5rem]" }: { h?: string; w?: string }) {
  return (
    <div aria-hidden className={`relative ${h} ${w} shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-black/5`}>
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

function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

export function CandidateLensPanel({ candidates, title, gapMinutes, affinityReasonFor, onSelect, onSkip }: CandidateLensPanelProps) {
  const lens = purposeLensFromSchedule(title);
  const views = candidates.map((c) => buildLensCandidateView(c, lens, { gapMinutes, affinityReason: affinityReasonFor?.(c) ?? null }));

  const [current, setCurrent] = useState(0);           // ① いま捲っている候補
  const [view, setView] = useState<"browse" | "detail" | "compare">("browse");
  const [compareIndex, setCompareIndex] = useState(1);
  const [selectedSide, setSelectedSide] = useState<"left" | "right" | null>(null);
  const touch = useState<{ y: number | null }>({ y: null })[0];

  if (views.length === 0) return null;
  const n = views.length;
  const go = (dir: 1 | -1) => setCurrent((c) => (c + dir + n) % n);
  const openCompare = (i: number) => {
    setCurrent(i);
    setCompareIndex(views.findIndex((_, j) => j !== i) >= 0 ? views.findIndex((_, j) => j !== i) : i);
    setSelectedSide(null);
    setView("compare");
  };
  const otherIndices = views.map((_, j) => j).filter((j) => j !== current);
  const cycleCompare = (dir: 1 | -1) => {
    if (otherIndices.length === 0) return;
    const pos = otherIndices.indexOf(compareIndex);
    setCompareIndex(otherIndices[(pos + dir + otherIndices.length) % otherIndices.length]);
    setSelectedSide(null);
  };

  const v = views[current]!;

  // ════════════════════ ② 詳細モード（候補領域全体が詳細に切替・見出しを畳む・どこで？直下から大きく・密度を理想画像に寄せる） ════════════════════
  if (view === "detail") {
    // 構造化 info 行（実値のある軸・密度づくり）。
    const infoKeys: AttributeKey[] = (["walk_estimate", "schedule_fit", "margin_impact", "affinity_reason", "category", "address"] as AttributeKey[])
      .filter((k) => v.attrs[k].value != null);
    return (
      <div data-testid="lens-detail" className="mt-3 rounded-[20px] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_20px_52px_rgba(124,58,237,0.14)] ring-1 ring-purple-200">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-[20px] font-semibold leading-snug tracking-tight text-slate-900">{v.name}</h3>
            <div className="mt-1 flex items-center gap-2">
              {v.category && <span className="text-[12px] text-slate-400">{v.category}</span>}
              {v.affinityBadge && <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700">{v.affinityBadge}高め</span>}
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">{LENS_SUBTITLE[lens]}</p>
          </div>
          <button type="button" onClick={() => setView("browse")} data-testid="lens-detail-close" aria-label="閉じる"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[15px] text-slate-500 transition hover:bg-slate-200">⌃</button>
        </div>

        {/* 大メディア領域（主役・写真相当=place tile ＋ 地図相当=簡易 map・2 分割で大きく） */}
        <div className="mt-3 flex gap-2">
          <PlaceTile category={v.category} h="h-[9.5rem]" w="w-[60%]" />
          <MapTile h="h-[9.5rem]" w="flex-1" />
        </div>

        {/* 構造化 info（アイコン＋ラベル＋値・密度） */}
        <div className="mt-3 overflow-hidden rounded-2xl ring-1 ring-black/5">
          {infoKeys.map((k, idx) => (
            <div key={k} className={`flex items-start gap-2 px-3.5 py-2.5 ${idx % 2 ? "bg-slate-50/50" : "bg-white"}`}>
              <span aria-hidden className="text-[14px]">{ATTR_ICON[k]}</span>
              <span className="w-[5.5rem] shrink-0 text-[12px] text-slate-400">{ATTRIBUTE_LABEL[k]}</span>
              <span className="min-w-0 flex-1 text-[13px] text-slate-700">{v.attrs[k].value}<span className="ml-1 text-[9px] text-slate-300">{EVIDENCE_TAG[v.attrs[k].evidenceType]}</span></span>
            </div>
          ))}
        </div>

        {/* 未確認（密度のため明示・捏造でなく「まだ持っていない」と正直に） */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-400">未確認:</span>
          {UNCONFIRMED_COMMON.map((k) => (
            <span key={k} className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-400 ring-1 ring-black/5">{ATTRIBUTE_LABEL[k]}</span>
          ))}
        </div>

        {/* なぜここをおすすめ？（主役・複数行） */}
        {v.whyLine && (
          <div className="mt-4 rounded-2xl bg-purple-50/70 px-4 py-4">
            <p className="text-[13px] font-semibold text-purple-700">なぜここをおすすめ？</p>
            <p className="mt-2 text-[14.5px] leading-relaxed text-slate-700">{v.whyLine}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{PURPOSE_LENS_LABEL[lens]}の目的に照らすと、距離と予定への接続のしやすさからこの候補が向いています。</p>
            {v.affinityBadge && <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">あなたが普段から訪れている傾向があり、迷いにくい場所です。</p>}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => setView("browse")} data-testid="lens-detail-back" className="flex-1 rounded-xl bg-slate-100 py-2.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-200">‹ 候補へ戻る</button>
          {n > 1 && <button type="button" onClick={() => openCompare(current)} data-testid="lens-detail-compare" className="flex-1 rounded-xl bg-purple-100 py-2.5 text-[13px] font-medium text-purple-700 transition hover:bg-purple-200">比較に追加 ⇧</button>}
          <button type="button" onClick={() => onSelect(candidates[current]!)} data-testid="lens-detail-select" className="flex-1 rounded-xl bg-slate-900 py-2.5 text-[13px] font-medium text-white transition hover:bg-slate-800">ここにする</button>
        </div>
      </div>
    );
  }

  // ════════════════════ ③ 比較専用モード（比較表が主役・70–85vh サーフェス・背景暗転） ════════════════════
  if (view === "compare") {
    const left = v;
    const right = views[compareIndex]!;
    const comp = buildLensComparisonView(lens, left, right);
    const confirmSide = (side: "left" | "right") => {
      if (selectedSide === side) { onSelect(candidates[side === "left" ? current : compareIndex]!); return; }
      setSelectedSide(side);
    };
    const headCls = (side: "left" | "right") =>
      `min-w-0 flex-1 rounded-xl p-2 text-left transition ring-1 ${selectedSide === side ? "bg-purple-50 ring-purple-300" : "bg-white ring-black/5 hover:bg-slate-50"}`;
    return (
      <Portal>
        <div className="fixed inset-0 z-[100] flex items-end justify-center" data-testid="lens-compare">
          <div className="absolute inset-0 bg-black/45" onClick={() => setView("browse")} aria-hidden />
          <div className="relative flex h-[85vh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[1.75rem] bg-slate-50 shadow-[0_-10px_44px_rgba(0,0,0,0.22)]">
            {/* ヘッダー: 戻る / 予定名 / 比較中N件 */}
            <div className="shrink-0 bg-white px-4 pb-2 pt-3">
              <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-slate-200" aria-hidden />
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setView("browse")} data-testid="lens-compare-back" className="flex items-center gap-1 text-[14px] font-medium text-slate-600 transition hover:text-slate-900">‹ 戻る</button>
                <span className="truncate px-2 text-[14px] font-semibold text-slate-900">{title || "候補を比較"}</span>
                <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-[11px] font-medium text-purple-700">比較中 2件</span>
              </div>
              <p className="mt-1 text-center text-[11.5px] text-slate-400">{LENS_PURPOSE_LINE[lens]}</p>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {/* 上部: 2 候補カード（写真相当 tile ＋ 地図相当 tile の 2 分割・名前・相性） */}
              <div className="flex items-stretch gap-2">
                <button type="button" onClick={() => confirmSide("left")} data-testid="lens-compare-left" className={headCls("left")}>
                  <div className="flex gap-1.5"><PlaceTile category={left.category} h="h-12" w="w-[58%]" /><MapTile h="h-12" w="flex-1" /></div>
                  <span className="mt-1.5 block truncate text-[13.5px] font-semibold text-slate-900">{left.name}</span>
                  <span className="text-[10.5px] text-slate-400">{left.category}{left.affinityBadge && " · 相性高め"}</span>
                </button>
                <div className="flex min-w-0 flex-1 items-stretch gap-1"
                  onTouchStart={(e) => { touch.y = e.touches[0]?.clientY ?? null; }}
                  onTouchEnd={(e) => { if (touch.y == null) return; const dy = (e.changedTouches[0]?.clientY ?? touch.y) - touch.y; if (Math.abs(dy) > 30) cycleCompare(dy < 0 ? 1 : -1); touch.y = null; }}>
                  <button type="button" onClick={() => confirmSide("right")} data-testid="lens-compare-right" className={headCls("right")}>
                    <div className="flex gap-1.5"><PlaceTile category={right.category} h="h-12" w="w-[58%]" /><MapTile h="h-12" w="flex-1" /></div>
                    <span className="mt-1.5 block truncate text-[13.5px] font-semibold text-slate-900">{right.name}</span>
                    <span className="text-[10.5px] text-slate-400">{right.category}{right.affinityBadge && " · 相性高め"}</span>
                  </button>
                  {otherIndices.length > 1 && (
                    <div className="flex shrink-0 flex-col justify-center gap-1">
                      <button type="button" onClick={() => cycleCompare(-1)} aria-label="前の候補" data-testid="lens-compare-prev" className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-[11px] text-slate-500 ring-1 ring-black/5 hover:bg-slate-100">▲</button>
                      <button type="button" onClick={() => cycleCompare(1)} aria-label="次の候補" data-testid="lens-compare-next" className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-[11px] text-slate-500 ring-1 ring-black/5 hover:bg-slate-100">▼</button>
                    </div>
                  )}
                </div>
              </div>

              {/* ★比較表（主役・最大面積・行ごとアイコン・優位セル紫塗り✓・おすすめ理由行・未確認は dimmed 行で密度） */}
              <p className="mb-1.5 mt-4 px-0.5 text-[13.5px] font-semibold text-slate-800">候補を比較</p>
              <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_30px_rgba(0,0,0,0.07)] ring-1 ring-black/5">
                <div className="grid grid-cols-[4.5rem_1fr_1fr] border-b border-black/5 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500"><span>項目</span><span className="truncate">{left.name}</span><span className="truncate">{right.name}</span></div>
                <div className="divide-y divide-black/5">
                  {comp.mainRows.map((row) => (
                    <div key={row.key} data-testid="lens-row" data-key={row.key} className="grid min-h-[54px] grid-cols-[4.5rem_1fr_1fr] items-stretch">
                      <span className="flex items-center gap-1 bg-slate-50/60 px-3 py-2 text-[12px] text-slate-500"><span aria-hidden className="text-[14px]">{ATTR_ICON[row.key]}</span>{row.label}</span>
                      <span className={`flex items-center px-2.5 py-2 text-[12.5px] leading-snug ${row.left.isBest ? "bg-purple-100/70 font-semibold text-purple-900" : "text-slate-600"}`}>{row.left.isBest && <span aria-hidden className="mr-1 text-purple-500">✓</span>}{row.left.value ?? "—"}</span>
                      <span className={`flex items-center px-2.5 py-2 text-[12.5px] leading-snug ${row.right.isBest ? "bg-purple-100/70 font-semibold text-purple-900" : "text-slate-600"}`}>{row.right.isBest && <span aria-hidden className="mr-1 text-purple-500">✓</span>}{row.right.value ?? "—"}</span>
                    </div>
                  ))}
                  {/* おすすめ理由行（候補ごとの why・密度） */}
                  {(left.whyLine || right.whyLine) && (
                    <div data-testid="lens-row" data-key="reason" className="grid min-h-[54px] grid-cols-[4.5rem_1fr_1fr] items-stretch">
                      <span className="flex items-center gap-1 bg-slate-50/60 px-3 py-2 text-[12px] text-slate-500"><span aria-hidden className="text-[14px]">⭐️</span>理由</span>
                      <span className="px-2.5 py-2 text-[12px] leading-snug text-slate-600">{left.whyLine ?? "—"}</span>
                      <span className="px-2.5 py-2 text-[12px] leading-snug text-slate-600">{right.whyLine ?? "—"}</span>
                    </div>
                  )}
                  {/* 未確認行（dimmed・密度づくり・捏造でなく「未確認」と明示） */}
                  {UNCONFIRMED_COMMON.map((k) => (
                    <div key={k} data-testid="lens-row-unconfirmed" className="grid min-h-[40px] grid-cols-[4.5rem_1fr_1fr] items-stretch bg-slate-50/30">
                      <span className="flex items-center gap-1 bg-slate-50/60 px-3 py-1.5 text-[11.5px] text-slate-400"><span aria-hidden className="text-[13px]">{ATTR_ICON[k]}</span>{ATTRIBUTE_LABEL[k]}</span>
                      <span className="flex items-center px-2.5 py-1.5 text-[11.5px] text-slate-300">未確認</span>
                      <span className="flex items-center px-2.5 py-1.5 text-[11.5px] text-slate-300">未確認</span>
                    </div>
                  ))}
                </div>
              </div>
              <p data-testid="lens-unconfirmed" className="mt-1.5 px-1 text-[10.5px] leading-relaxed text-slate-400">「未確認」はまだデータを持っていない項目です（捏造はしません）。</p>

              {/* 下部: おすすめサマリー */}
              {comp.recommendation ? (
                <div data-testid="lens-recommendation" className="mt-3 rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 px-4 py-4 ring-1 ring-purple-100">
                  <div className="flex items-center gap-2"><span className="text-[12.5px] font-semibold text-purple-700">✨ おすすめ</span><span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-purple-700">{PURPOSE_LENS_LABEL[lens]}向き</span></div>
                  <p className="mt-1.5 text-[16px] font-semibold leading-snug text-slate-900">{comp.recommendation.side === "left" ? left.name : right.name}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{comp.recommendation.basisPhrase}</p>
                </div>
              ) : (
                <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-black/5">
                  <p className="text-[12.5px] font-semibold text-slate-500">甲乙つけがたい</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-500">表示できる差では優劣がつきませんでした。好みで選んでも大丈夫そうです。</p>
                </div>
              )}
            </div>

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
  }

  // ════════════════════ ① 候補が出る（1 件固定・上下スワイプ/▲▼/pager で捲る・次候補を見せない） ════════════════════
  return (
    <div data-testid="lens-list" className="mt-3">
      <div className="mb-2 flex items-center justify-between px-0.5">
        <p className="text-[14px] font-semibold tracking-tight text-slate-900">おすすめの候補</p>
        <span className="text-[11px] font-medium text-slate-400 tabular-nums">{current + 1} / {n}</span>
      </div>

      {/* 1 件固定の主役カード（領域幅いっぱい・次候補は出さない・スワイプ/▲▼/ドットで捲る） */}
      <article data-testid="lens-card" key={v.placeId}
        className="rounded-[20px] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_rgba(0,0,0,0.07)] ring-1 ring-purple-100"
        onTouchStart={(e) => { touch.y = e.touches[0]?.clientY ?? null; }}
        onTouchEnd={(e) => { if (touch.y == null) return; const dy = (e.changedTouches[0]?.clientY ?? touch.y) - touch.y; if (Math.abs(dy) > 30) go(dy < 0 ? 1 : -1); touch.y = null; }}>
        <div className="flex items-start gap-3.5">
          <PlaceTile category={v.category} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-[16.5px] font-semibold leading-snug tracking-tight text-slate-900">{v.name}</h4>
              {v.affinityBadge && <span className="mt-0.5 shrink-0 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700">{v.affinityBadge}高め</span>}
            </div>
            {v.category && <p className="mt-0.5 text-[11.5px] text-slate-400">{v.category}</p>}
            {v.whyLine && <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{v.whyLine}</p>}
          </div>
        </div>
        <ChipRow view={v} />
        <div className="mt-2.5 flex items-end gap-2">
          <p className="flex min-w-0 flex-1 items-start gap-1 text-[12px] leading-relaxed text-slate-500"><span aria-hidden className="mt-px text-[11px]">📍</span><span className="min-w-0">{v.address ?? "住所は未取得です"}</span></p>
          <MapTile />
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => setView("detail")} data-testid="lens-card-detail" className="flex-1 rounded-xl bg-slate-100 py-2.5 text-[13px] font-medium text-slate-700 transition hover:bg-slate-200 active:scale-[0.99]">詳細を見る</button>
          {n > 1 && <button type="button" onClick={() => openCompare(current)} data-testid="lens-card-compare" className="flex-1 rounded-xl bg-purple-600 py-2.5 text-[13px] font-medium text-white transition hover:bg-purple-700 active:scale-[0.99]">比較に追加 ⇧</button>}
        </div>
      </article>

      {/* 捲る pager（▲ 前 ・ ドット ・ ▼ 次）。上下スワイプと等価。 */}
      {n > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3">
          <button type="button" onClick={() => go(-1)} aria-label="前の候補" data-testid="lens-prev" className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[12px] text-slate-500 ring-1 ring-black/5 transition hover:bg-slate-50">▲</button>
          <div className="flex items-center gap-1.5">
            {views.map((vv, i) => (
              <button key={vv.placeId} type="button" aria-label={`候補 ${i + 1}`} onClick={() => setCurrent(i)}
                className={`h-1.5 rounded-full transition-all ${i === current ? "w-4 bg-purple-500" : "w-1.5 bg-slate-300 hover:bg-slate-400"}`} />
            ))}
          </div>
          <button type="button" onClick={() => go(1)} aria-label="次の候補" data-testid="lens-next" className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[12px] text-slate-500 ring-1 ring-black/5 transition hover:bg-slate-50">▼</button>
        </div>
      )}

      {onSkip && (
        <div className="mt-2 text-center">
          <button type="button" onClick={onSkip} data-testid="lens-skip" className="rounded-md px-3 py-1.5 text-[12px] text-slate-400 underline transition hover:text-slate-600">場所を選ばずに保存</button>
        </div>
      )}
    </div>
  );
}
