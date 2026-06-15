"use client";

/**
 * app/(culcept)/plan/components/CandidateLensPanel.tsx
 *   — Purpose-Adaptive Candidate Lens / Phase 2 UI（参照画像 add-search1/2/3 を**非トレース**で忠実再構成）
 *
 * ★flag default OFF / dev-only（呼び側 PlaceCandidatesPanel が isCandidateLensUiEnabled で分岐）。flag OFF は既存 <ul> 不変。
 * ★参照画像の正確な構造（REDO-3 で読み直し）:
 *   ① 候補が出る   … 「おすすめの候補」見出し＋**コンパクトカード**（小さな抽象タイル[左]＋名前＋相性高め＋理由＋
 *                    honest チップ＋住所＋「詳細を見る／比較する」2 ボタン）。**常に 1 候補だけ**を主役に、下に次がのぞき、
 *                    スクロールで次々送る（snap）。
 *   ② 詳細がひらく … 同じカードを**その場でインライン展開**（大メディア＋∧で畳む＋住所＋evidence チップ＋「なぜここをおすすめ？」）。
 *   ③ 候補を比較   … 別状態の全画面 takeover（2 候補ヘッダー＋アイコン付き比較表＋優位薄紫✓＋✨おすすめバナー）。
 * ★既存の枠 chrome（intent ラベル/privacy/枠付き close）は撤廃。候補 UI そのものを再構築。
 * ★honesty（CEO）: 写真/Wi-Fi/電源/静か等の未確認は**捏造しない**。写真→抽象タイル・未確認は主表から外す・
 *   優位ハイライトは「表示値に差がある行」のみ・Evidence B は「約/目安」。トレース/画像切り貼り/写真捏造なし。
 */
import { useState } from "react";
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
  /** 予定名（→ 目的レンズ）。 */
  readonly title: string;
  /** 予定の前後 gap（分・あれば予定接続/余白を計算）。 */
  readonly gapMinutes?: number | null;
  /** 候補ごとの観測 reason（Place Affinity 由来・無ければ null）。 */
  readonly affinityReasonFor?: (candidate: LensCandidate) => string | null;
  /** 確定 → 場所として設定し ① へ戻る（親が canonical 化 + close）。 */
  readonly onSelect: (candidate: LensCandidate) => void;
  /** 「場所を選ばずに保存」（非強制・任意）。 */
  readonly onSkip?: () => void;
}

/** evidenceType → 小ラベル（A 事実 / B 計算 / C 推定 / D 未確認）。 */
const EVIDENCE_TAG: Record<EvidenceType, string> = { fact: "事実", computed: "計算", weak: "推定", unconfirmed: "未確認" };

/** 属性 → アイコン（参照画像のアイコン付き行・チップを再現。絵文字＝外部 API 不要）。 */
const ATTR_ICON: Record<AttributeKey, string> = {
  walk_estimate: "🚶",
  schedule_fit: "🗓️",
  margin_impact: "🌿",
  affinity_reason: "💜",
  category: "🏷️",
  address: "📍",
  social_fit: "💬",
  quiet: "🤫",
  wifi: "📶",
  power: "🔌",
  hours: "🕐",
  crowd: "👥",
  photo: "📷",
};

/** カテゴリ → 抽象タイルの色味（写真でない・designed placeholder と分かる装飾）。 */
function tileTone(category: string | null): string {
  switch (category) {
    case "カフェ":
    case "ベーカリー":
      return "from-amber-100 to-orange-50 text-amber-700";
    case "レストラン":
    case "バー":
    case "テイクアウト":
      return "from-rose-100 to-red-50 text-rose-700";
    case "図書館":
    case "書店":
      return "from-sky-100 to-indigo-50 text-sky-700";
    case "公園":
      return "from-emerald-100 to-green-50 text-emerald-700";
    case "ジム":
      return "from-violet-100 to-purple-50 text-violet-700";
    default:
      return "from-slate-100 to-slate-50 text-slate-500";
  }
}

/** 写真でない抽象メディアタイル（場所グリフ＋category ラベル）。size で thumb/banner/mini を切替。 */
function PlaceMedia({ category, size = "thumb" }: { category: string | null; size?: "banner" | "thumb" | "mini" }) {
  const dim = size === "banner" ? "h-32 w-full" : size === "mini" ? "h-14 w-full" : "h-[4.25rem] w-[4.25rem]";
  const glyph = size === "banner" ? "text-[30px]" : "text-[20px]";
  return (
    <div
      aria-hidden
      className={`relative flex ${dim} shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br ${tileTone(category)} ring-1 ring-black/5`}
    >
      <span className={glyph}>📍</span>
      <span className="absolute bottom-1 left-1.5 rounded-full bg-white/55 px-1.5 py-0.5 text-[10px] font-medium">{category ?? "場所"}</span>
    </div>
  );
}

/** honest チップ（実値のある主役軸のみ・evidence 付き任意）。 */
function ChipRow({ view, withEvidence = false, className = "mt-2.5" }: { view: LensCandidateView; withEvidence?: boolean; className?: string }) {
  if (view.primaryChips.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {view.primaryChips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-[12px] text-slate-700 ring-1 ring-black/5"
        >
          <span aria-hidden className="text-[11px]">{ATTR_ICON[chip.key]}</span>
          {chip.value}
          {withEvidence && <span className="ml-0.5 text-[9px] text-slate-300">{EVIDENCE_TAG[view.attrs[chip.key].evidenceType]}</span>}
        </span>
      ))}
    </div>
  );
}

export function CandidateLensPanel({ candidates, title, gapMinutes, affinityReasonFor, onSelect, onSkip }: CandidateLensPanelProps) {
  const lens = purposeLensFromSchedule(title);
  const views = candidates.map((c) =>
    buildLensCandidateView(c, lens, { gapMinutes, affinityReason: affinityReasonFor?.(c) ?? null }),
  );

  const [expandedId, setExpandedId] = useState<string | null>(null); // ② inline 展開中の placeId
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
    const next = otherIndices[(pos + dir + otherIndices.length) % otherIndices.length];
    setCompareIndex(next);
    setSelectedSide(null);
  };

  // ───────────────────────── ③ 候補を比較する（全画面 takeover） ─────────────────────────
  if (mode === "compare") {
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
      `min-w-0 flex-1 rounded-xl p-2.5 text-left transition ring-1 ${
        selectedSide === side ? "bg-purple-50 ring-purple-300" : "bg-white ring-black/5 hover:bg-slate-50"
      }`;

    return (
      <div data-testid="lens-compare" className="space-y-3">
        <div className="flex items-center justify-between px-0.5">
          <button type="button" onClick={() => setMode("browse")} data-testid="lens-compare-back"
            className="flex items-center gap-1 text-[13px] font-medium text-slate-500 transition hover:text-slate-700">‹ 候補一覧</button>
          <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-[11px] font-medium text-purple-700">{PURPOSE_LENS_LABEL[lens]}で比較中</span>
        </div>

        <div className="flex items-stretch gap-2">
          <button type="button" onClick={() => confirmSide("left")} data-testid="lens-compare-left" className={headerCls("left")}>
            <PlaceMedia category={left.category} size="mini" />
            <span className="mt-1.5 block truncate text-[13px] font-semibold text-slate-900">{left.name}</span>
            <span className="flex items-center gap-1 text-[10px] text-slate-400">{left.category}{left.affinityBadge && <span className="text-purple-600">· 相性</span>}</span>
          </button>
          <div className="flex min-w-0 flex-1 items-stretch gap-1"
            onTouchStart={(e) => { touchStartY.y = e.touches[0]?.clientY ?? null; }}
            onTouchEnd={(e) => {
              if (touchStartY.y == null) return;
              const dy = (e.changedTouches[0]?.clientY ?? touchStartY.y) - touchStartY.y;
              if (Math.abs(dy) > 30) cycleCompare(dy < 0 ? 1 : -1);
              touchStartY.y = null;
            }}>
            <button type="button" onClick={() => confirmSide("right")} data-testid="lens-compare-right" className={headerCls("right")}>
              <PlaceMedia category={right.category} size="mini" />
              <span className="mt-1.5 block truncate text-[13px] font-semibold text-slate-900">{right.name}</span>
              <span className="flex items-center gap-1 text-[10px] text-slate-400">{right.category}{right.affinityBadge && <span className="text-purple-600">· 相性</span>}</span>
            </button>
            {otherIndices.length > 1 && (
              <div className="flex shrink-0 flex-col justify-center gap-1">
                <button type="button" onClick={() => cycleCompare(-1)} aria-label="前の候補" data-testid="lens-compare-prev"
                  className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-[11px] text-slate-500 hover:bg-slate-200">▲</button>
                <button type="button" onClick={() => cycleCompare(1)} aria-label="次の候補" data-testid="lens-compare-next"
                  className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-[11px] text-slate-500 hover:bg-slate-200">▼</button>
              </div>
            )}
          </div>
        </div>
        <p className="px-0.5 text-[11px] text-slate-400">候補をタップ → もう一度タップで確定</p>

        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_30px_rgba(0,0,0,0.07)] ring-1 ring-black/5">
          <div className="border-b border-black/5 px-3.5 py-2 text-[12px] font-semibold text-slate-500">候補を比較</div>
          <div className="divide-y divide-black/5">
            {comp.mainRows.map((row) => (
              <div key={row.key} data-testid="lens-row" data-key={row.key} className="grid grid-cols-[4.5rem_1fr_1fr] items-center gap-2 px-3 py-3">
                <span className="flex items-center gap-1 text-[12px] text-slate-500"><span aria-hidden className="text-[12px]">{ATTR_ICON[row.key]}</span>{row.label}</span>
                <span className={`rounded-lg px-2 py-1.5 text-[12px] leading-snug ${row.left.isBest ? "bg-purple-50 font-semibold text-purple-900" : "text-slate-700"}`}>{row.left.isBest && <span aria-hidden className="mr-0.5 text-purple-500">✓</span>}{row.left.value ?? "—"}</span>
                <span className={`rounded-lg px-2 py-1.5 text-[12px] leading-snug ${row.right.isBest ? "bg-purple-50 font-semibold text-purple-900" : "text-slate-700"}`}>{row.right.isBest && <span aria-hidden className="mr-0.5 text-purple-500">✓</span>}{row.right.value ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>

        {comp.unconfirmedLabels.length > 0 && (
          <p data-testid="lens-unconfirmed" className="px-1 text-[11px] leading-relaxed text-slate-400">{comp.unconfirmedLabels.join("・")} は、この目的でも大切ですが、まだ確認できていません。</p>
        )}

        {comp.recommendation && (
          <div data-testid="lens-recommendation" className="rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 px-4 py-3 ring-1 ring-purple-100">
            <p className="text-[12px] font-semibold text-purple-700">✨ おすすめ</p>
            <p className="mt-1 text-[14px] leading-relaxed text-slate-800"><span className="font-semibold">{comp.recommendation.side === "left" ? left.name : right.name}</span>{" が、"}{comp.recommendation.basisPhrase}</p>
          </div>
        )}

        {selectedSide && (
          <button type="button" data-testid="lens-compare-confirm" onClick={() => confirmSide(selectedSide)}
            className="w-full rounded-xl bg-purple-600 py-2.5 text-[14px] font-semibold text-white shadow-sm transition hover:bg-purple-700 active:scale-[0.99]">
            {(selectedSide === "left" ? left.name : right.name)} をこの予定の場所にする
          </button>
        )}
      </div>
    );
  }

  // ───────────────────────── ①②  候補が出る（1 候補ずつ・タップでその場展開＝accordion） ─────────────────────────
  return (
    <div data-testid="lens-list" className="mt-3">
      <p className="mb-2 px-0.5 text-[14px] font-semibold tracking-tight text-slate-900">おすすめの候補</p>

      {/* ★ブラウズ中: 1 候補を主役に・下に次がのぞくだけの短い snap 箱。展開中: 高さ制限を外し詳細を全部見せる。 */}
      <div className={expandedId !== null ? "space-y-3" : "h-[18.5rem] snap-y snap-mandatory space-y-3 overflow-y-auto pr-0.5"}>
        {views.map((v, i) => {
          const expanded = expandedId === v.placeId;
          return (
            <article
              key={v.placeId}
              data-testid="lens-card"
              data-expanded={expanded}
              className={`snap-start scroll-mt-1 rounded-2xl bg-white p-4 ring-1 transition ${
                expanded ? "ring-purple-200 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_14px_40px_rgba(124,58,237,0.10)]" : "ring-black/5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_28px_rgba(0,0,0,0.06)]"
              }`}
            >
              {!expanded ? (
                /* ───── ① コンパクトカード（小さな抽象タイル[左]＋名前＋相性＋理由） ───── */
                <>
                  <div className="flex items-start gap-3">
                    <PlaceMedia category={v.category} size="thumb" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-[15.5px] font-semibold leading-snug tracking-tight text-slate-900">{v.name}</h4>
                        {v.affinityBadge && (
                          <span className="mt-0.5 shrink-0 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700">{v.affinityBadge}高め</span>
                        )}
                      </div>
                      {v.whyLine && <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">{v.whyLine}</p>}
                    </div>
                  </div>

                  <ChipRow view={v} />

                  {v.address && (
                    <p className="mt-2 flex items-start gap-1 text-[12px] leading-relaxed text-slate-500">
                      <span aria-hidden className="mt-px text-[11px]">📍</span><span className="min-w-0">{v.address}</span>
                    </p>
                  )}

                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => setExpandedId(v.placeId)} data-testid="lens-card-detail"
                      className="flex-1 rounded-xl bg-slate-100 py-2 text-[13px] font-medium text-slate-700 transition hover:bg-slate-200 active:scale-[0.99]">詳細を見る</button>
                    {views.length > 1 && (
                      <button type="button" onClick={() => openCompare(i)} data-testid="lens-card-compare"
                        className="flex-1 rounded-xl bg-purple-600 py-2 text-[13px] font-medium text-white transition hover:bg-purple-700 active:scale-[0.99]">比較する ⇧</button>
                    )}
                  </div>
                </>
              ) : (
                /* ───── ② その場でインライン展開（大メディア＋∧で畳む＋なぜここをおすすめ？） ───── */
                <div data-testid="lens-detail">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-[16px] font-semibold tracking-tight text-slate-900">{v.name}</h4>
                      <div className="mt-0.5 flex items-center gap-2">
                        {v.category && <span className="text-[12px] text-slate-400">{v.category}</span>}
                        {v.affinityBadge && <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700">{v.affinityBadge}高め</span>}
                      </div>
                    </div>
                    <button type="button" onClick={() => setExpandedId(null)} data-testid="lens-detail-close" aria-label="詳細を閉じる"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200">⌃</button>
                  </div>

                  <div className="mt-3"><PlaceMedia category={v.category} size="banner" /></div>

                  {v.address && (
                    <p className="mt-3 flex items-start gap-1.5 text-[13px] leading-relaxed text-slate-600">
                      <span aria-hidden className="mt-px">📍</span><span className="min-w-0">{v.address}</span>
                    </p>
                  )}

                  <ChipRow view={v} withEvidence />

                  {v.whyLine && (
                    <div className="mt-4 rounded-xl bg-purple-50/60 px-4 py-3.5">
                      <p className="text-[12px] font-semibold text-purple-700">なぜここをおすすめ？</p>
                      <p className="mt-1.5 text-[14px] leading-relaxed text-slate-700">{v.whyLine}</p>
                    </div>
                  )}

                  <div className="mt-4 flex items-center gap-2">
                    <button type="button" onClick={() => setExpandedId(null)} data-testid="lens-detail-back"
                      className="flex-1 rounded-xl bg-slate-100 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-200">‹ 閉じる</button>
                    {views.length > 1 && (
                      <button type="button" onClick={() => openCompare(i)} data-testid="lens-detail-compare"
                        className="flex-1 rounded-xl bg-purple-600 py-2 text-[13px] font-medium text-white transition hover:bg-purple-700">比較する ⇧</button>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {onSkip && (
        <div className="mt-2 text-center">
          <button type="button" onClick={onSkip} data-testid="lens-skip"
            className="rounded-md px-3 py-1.5 text-[12px] text-slate-400 underline transition hover:text-slate-600">場所を選ばずに保存</button>
        </div>
      )}
    </div>
  );
}
