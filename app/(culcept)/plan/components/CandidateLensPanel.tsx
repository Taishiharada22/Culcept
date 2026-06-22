"use client";

/**
 * app/(culcept)/plan/components/CandidateLensPanel.tsx
 *   — Purpose-Adaptive Candidate Lens / Phase 2 UI（理想画像 add-search1/2/3 を唯一の正として非トレース再構成 / REDO-7）
 *
 * ★flag default OFF / dev-only。呼び側 PlaceCandidatesPanel が **Lens Overlay(rect anchor portal・700px・中央配置)** で本体を描画。
 * ★文言・表示・サイズを理想画像に正確に寄せる（値は honest・捏造しない）:
 *   ① おすすめの候補 … 薄紫カード1枚(写真→abstractタイル/名前2行/相性高めバッジ/理由2行/チップ/◎住所1行省略/簡易map/
 *      「詳細を見る」「＋ 比較に追加」)。1件のみ・上下スワイプ/▲▼/ドットで捲る。
 *   ② 詳細 … 同 Overlay 内で大展開(名前+∧/サブタイトル/大メディア2分割/住所2行整理/チップ/「なぜここをおすすめ？」複数行)。
 *   ③ 候補を比較 … 下から立ち上がる比較専用シート。2候補カード(2分割)+「候補を比較」+比較表(主役・7行死守)+おすすめ。
 * ★honesty: 写真→categoryタイル・地図→簡易mapタイル・Wi-Fi/電源/静か/雰囲気/営業時間は捏造せず dimmed「未確認」・
 *   優位は表示値差のみ・B は約/目安。住所は ① 1行省略 / ② 2行整理。
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  buildLensCandidateView,
  buildLensComparisonView,
  buildWhyBullets,
  buildExplanationCopy,
  isCandidateLensExplanationEnabled,
  isCandidateLensMapEnabled,
  purposeLensFromSchedule,
  shortAddress,
  splitAddressLines,
  type LensCandidate,
  type LensCandidateView,
  type LensComparisonView,
} from "@/lib/plan/candidateLens/candidateLensUi";
import { useGoogleMapsScript, type GmapsMap, type GmapsMarker } from "@/lib/shared/googleMapsLoader";
import { PURPOSE_LENS_LABEL, type PurposeLens } from "@/lib/plan/candidateLens/purposeLens";
import { ATTRIBUTE_LABEL, type AttributeKey } from "@/lib/plan/candidateLens/placeAttributeModel";
import type { UserPlacePreference } from "@/lib/plan/candidateLens/userPlacePreference";
// ★P3-b: shadow 記録（記録のみ・resolver 未供給・flag default OFF・production hard block）。UI/順位/行順は一切変えない。
import { buildPreferenceObservation } from "@/lib/plan/candidateLens/candidateLensPreferenceObs";
import { isCandidateLensPrefObsEnabled, recordPreferenceObservation, opaquePlaceKey } from "@/lib/plan/candidateLens/candidateLensPreferenceStore";
// ★P4-d: Place Details enrichment（写真/営業時間・flag OFF で完全不変・dev-only・②③ 開封時のみ lazy fetch）。
import { usePlaceDetailsEnrichment } from "./usePlaceDetailsEnrichment";
import { isPlaceDetailsUiEnabled, type EnrichmentResolution } from "@/lib/plan/candidateLens/placeDetailsEnrichment";
// ★評価OS: ②詳細(Stage 1-C) + ③比較の「もう一つの見方」(Stage 1-D)に Fit-Arc readout。
//   flag OFF で null＝DOM 不変・ranking/winner/comparison logic 不変・比較表には入れない・winner の根拠にしない。
import { PlaceFitArcReadout } from "./PlaceFitArcReadout";
import { isFitArcReadoutEnabled } from "@/lib/plan/postVisit/fitArcReadout";

export interface CandidateLensPanelProps {
  readonly candidates: readonly LensCandidate[];
  readonly title: string;
  readonly gapMinutes?: number | null;
  readonly affinityReasonFor?: (candidate: LensCandidate) => string | null;
  readonly onSelect: (candidate: LensCandidate) => void;
  readonly onSkip?: () => void;
  /** ★P3-c: ユーザー嗜好（gate 済・apply flag ON 時のみ親が渡す）。**③ 比較表の表示行順だけ**に使う（推薦/順位/①②は不変）。 */
  readonly preference?: UserPlacePreference;
  /**
   * ★REDO-14: Overlay が viewport top から始まる px（= 親が createPortal する fixed 要素の top）。
   *   ② 詳細カードの max-height を「overlay の top を起点に viewport 内へ収まる」よう動的算出するために使う
   *   （input 欄が画面下方にあると 80vh 固定では card 下部が見切れるため）。未指定なら従来の 80vh 固定。①③ には影響しない。
   */
  readonly overlayTopOffset?: number;
}

const ATTR_ICON: Record<AttributeKey, string> = {
  walk_estimate: "🚶", schedule_fit: "🗓️", margin_impact: "🌿", affinity_reason: "💜", category: "🏷️",
  address: "📍", social_fit: "💬", quiet: "🤫", wifi: "📶", power: "🔌", hours: "🕐", crowd: "👥", photo: "📷",
};

/** ② 詳細サブタイトル（目的に対する一言・捏造でない UI コピー）。 */
const LENS_SUBTITLE: Record<PurposeLens, string> = {
  meeting_prep: "会議前に落ち着いて準備しやすい場所です",
  focus_work: "集中して作業しやすい場所です",
  conversation: "ゆっくり話しやすい場所です",
  errand: "ついでに寄りやすい場所です",
  generic: "向かいやすい場所です",
};

/** ② 比較モードの「今回の目的」説明（1行）。 */
const LENS_PURPOSE_LINE: Record<PurposeLens, string> = {
  meeting_prep: "会議前に落ち着いて準備できる場所を比べています",
  focus_work: "集中して作業しやすい場所を比べています",
  conversation: "ゆっくり話せる場所を比べています",
  errand: "ついでに寄りやすい場所を比べています",
  generic: "向かいやすい場所を比べています",
};

/** ①②③ で「まだデータを持たない」属性（捏造でなく dimmed「未確認」で密度を理想画像に寄せる）。理想画像の行に対応。 */
const UNCONFIRMED_CHIPS: readonly { label: string }[] = [{ label: "Wi-Fi" }, { label: "電源" }, { label: "静か" }];
const UNCONFIRMED_ROWS: readonly { icon: string; label: string }[] = [
  { icon: "🎭", label: "雰囲気" }, { icon: "📶", label: "Wi-Fi" }, { icon: "🔌", label: "電源" }, { icon: "🤫", label: "静かさ" }, { icon: "🕐", label: "営業時間" },
];

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

/** category → 写真の代わりの絵（写真でない・abstract）。 */
function categoryGlyph(category: string | null): string {
  switch (category) {
    case "カフェ": case "ベーカリー": return "☕";
    case "レストラン": case "テイクアウト": return "🍽️";
    case "バー": return "🍷";
    case "図書館": case "書店": return "📚";
    case "公園": return "🌳";
    case "ジム": return "🏋️";
    case "商業施設": case "店舗": return "🛍️";
    default: return "📍";
  }
}

/** 写真の代わり＝category 色 abstract タイル（写真でない・category ラベル）。 */
function PlaceTile({ category, h = "h-[4.5rem]", w = "w-[4.5rem]" }: { category: string | null; h?: string; w?: string }) {
  return (
    <div aria-hidden className={`relative flex ${h} ${w} shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br ${tileTone(category)} ring-1 ring-black/5`}>
      <span className="text-[24px] opacity-80">{categoryGlyph(category)}</span>
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

/**
 * ★REDO-15: 実 Google 地図（②③ のみ）。既存 `useGoogleMapsScript`（browser key・singleton）を再利用。
 *   flag OFF / key 未設定 / 未 ready 前 / 座標なし → 装飾 MapTile に fail-open（捏造しない・honesty）。
 *   gestureHandling="none" + disableDefaultUI で「動かない地図プレビュー」（誤操作・スクロール奪取を防ぐ）。
 *   座標が変わった時（③ 比較相手の切替）は同 instance を re-center + marker 再生成（map instance を増やさない）。
 */
function LensPlaceMap({ lat, lng, name, h = "h-[4.5rem]", w = "w-[4.5rem]" }: { lat: number; lng: number; name?: string; h?: string; w?: string }) {
  const { ready, keyAvailable } = useGoogleMapsScript();
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GmapsMap | null>(null);
  const markerRef = useRef<GmapsMarker | null>(null);
  const enabled = isCandidateLensMapEnabled() && keyAvailable && Number.isFinite(lat) && Number.isFinite(lng);

  useEffect(() => {
    if (!enabled || !ready || !elRef.current || !window.google?.maps) return;
    const pos = { lat, lng };
    if (!mapRef.current) {
      mapRef.current = new window.google.maps.Map(elRef.current, {
        center: pos,
        zoom: 15,
        disableDefaultUI: true,
        gestureHandling: "none", // 動かない地図プレビュー（overlay 内での誤スクロール防止）
        clickableIcons: false,
      });
    } else {
      mapRef.current.setCenter(pos);
    }
    markerRef.current?.setMap(null);
    markerRef.current = new window.google.maps.Marker({ position: pos, map: mapRef.current, title: name });
    return () => { markerRef.current?.setMap(null); };
  }, [enabled, ready, lat, lng, name]);

  // 実地図が出せない（flag OFF / key なし / 座標なし）→ 従来の装飾タイル（honesty 維持）。
  if (!enabled) return <MapTile h={h} w={w} />;
  // ready 前は grid placeholder を下敷きに（map 描画で上書き）。
  return (
    <div data-testid="lens-map" className={`relative ${h} ${w} shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-black/5`}>
      <div ref={elRef} className="h-full w-full" aria-label={name ? `${name} の地図` : "地図"} />
      {!ready && (
        <div className="absolute inset-0" style={GRID_BG} aria-hidden>
          <span className="absolute inset-0 flex items-center justify-center text-[16px] opacity-60">📍</span>
        </div>
      )}
    </div>
  );
}

/** honest チップ（薄紫・徒歩/種別）＋未確認チップ（dimmed・Wi-Fi/電源/静か）。 */
function ChipRow({ view }: { view: LensCandidateView }) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {view.primaryChips.map((chip) => (
        <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[12px] font-medium text-purple-900 ring-1 ring-purple-200">
          <span aria-hidden className="text-[11px]">{ATTR_ICON[chip.key]}</span>{chip.value}
        </span>
      ))}
      {UNCONFIRMED_CHIPS.map((c) => (
        <span key={c.label} className="rounded-full bg-slate-50 px-2.5 py-1 text-[12px] text-slate-400 ring-1 ring-black/5">{c.label}</span>
      ))}
    </div>
  );
}

/** ★P4-d: 実写真が出せる時だけ <img>、出せなければ abstract PlaceTile。
 *   honesty: photoUri が無い／author attribution が無い場合は写真を表示しない（mapper が photoDisplayable=false にする）。 */
function PhotoOrTile({ category, resolution, h = "h-[4.5rem]", w = "w-[4.5rem]" }: { category: string | null; resolution: EnrichmentResolution; h?: string; w?: string }) {
  if (isPlaceDetailsUiEnabled() && resolution.photoDisplayable && resolution.photoMediaUrl) {
    const author = resolution.photoAttributions.find((a) => (a.displayName ?? "").trim().length > 0)?.displayName ?? null;
    return (
      <div data-testid="lens-photo" className={`relative flex ${h} ${w} shrink-0 overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-black/5`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 外部 Place Photo(lh3)・dev-only flag 下のみ・next/image domain 設定を避ける */}
        <img src={resolution.photoMediaUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        {author && <span data-testid="lens-photo-attribution" className="absolute inset-x-0 bottom-0 truncate bg-black/45 px-1.5 py-0.5 text-[9px] font-medium text-white/90">📷 {author}</span>}
      </div>
    );
  }
  return <PlaceTile category={category} h={h} w={w} />;
}

/** 営業状態の honest ラベル（confirmed でなければ「未確認」・openNow null は「確認済」）。 */
function openStateLabel(resolution: EnrichmentResolution): string {
  if (!resolution.hoursConfirmed) return "未確認";
  return resolution.openState === "open" ? "営業中" : resolution.openState === "closed" ? "閉店中" : "確認済";
}

/** ★Google 由来情報（写真/営業時間）を表示する時の必須 attribution（規約）。 */
function PoweredByGoogle() {
  return <p data-testid="lens-powered-by-google" className="mt-2 text-right text-[9.5px] text-slate-400">Powered by Google</p>;
}

function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

export function CandidateLensPanel({ candidates, title, gapMinutes, affinityReasonFor, onSelect, onSkip, preference, overlayTopOffset }: CandidateLensPanelProps) {
  const lens = purposeLensFromSchedule(title);
  const views = candidates.map((c) => buildLensCandidateView(c, lens, { gapMinutes, affinityReason: affinityReasonFor?.(c) ?? null }));

  const [current, setCurrent] = useState(0);
  const [view, setView] = useState<"browse" | "detail" | "compare">("browse");
  const [compareIndex, setCompareIndex] = useState(1);
  const [selectedSide, setSelectedSide] = useState<"left" | "right" | null>(null);
  // ★E-b: ③ 行順 explanation の「元の並びに戻す」状態（この ③ 表示だけ canonical order・観測/preference は消さない）。
  const [showCanonical, setShowCanonical] = useState(false);
  const touch = useState<{ y: number | null }>({ y: null })[0];
  // ★P4-d: enrichment 取得 hook（flag OFF で no-op＝完全不変・②③ 開封時のみ ensure・browse では呼ばない）。
  const enrich = usePlaceDetailsEnrichment();

  if (views.length === 0) return null;
  const n = views.length;
  const go = (dir: 1 | -1) => setCurrent((c) => (c + dir + n) % n);
  const openCompare = (i: number) => {
    const other = views.findIndex((_, j) => j !== i);
    const ci = other >= 0 ? other : i;
    setCurrent(i);
    setCompareIndex(ci);
    setSelectedSide(null);
    setShowCanonical(false); // ★③ を開く度に personalized 表示から開始（戻すは ③ 表示限り・1 回）。
    setView("compare");
    // ★③ 入場時だけ比較対象 2 件を fetch（memo dedup・browse 中は呼ばない）。
    enrich.ensure(views[i]?.placeId);
    enrich.ensure(views[ci]?.placeId);
  };
  const otherIndices = views.map((_, j) => j).filter((j) => j !== current);
  const cycleCompare = (dir: 1 | -1) => {
    if (otherIndices.length === 0) return;
    const pos = otherIndices.indexOf(compareIndex);
    const next = otherIndices[(pos + dir + otherIndices.length) % otherIndices.length]!;
    setCompareIndex(next);
    setSelectedSide(null);
    enrich.ensure(views[next]?.placeId); // 比較相手を切替えた時だけ追加 fetch（memo dedup）
  };
  const v = views[current]!;

  /**
   * ★P3-b: 候補確定の **shadow 記録**（記録だけ・fire-and-forget・flag/production gate・try/catch）。
   *   resolver には渡さない＝候補順位・比較表・行順・表示は一切変えない。onSelect の直前に薄く相乗りするだけ。
   */
  const observeSelect = (
    selectedView: LensCandidateView,
    choiceContext: "browse" | "detail" | "compare",
    extra?: { comparison?: LensComparisonView | null; selectedSide?: "left" | "right"; otherView?: LensCandidateView | null },
  ): void => {
    if (!isCandidateLensPrefObsEnabled()) return;
    try {
      const obs = buildPreferenceObservation({
        lens,
        selectedKey: opaquePlaceKey(`${selectedView.name} ${selectedView.address ?? ""}`) ?? "p_unknown",
        selectedView,
        choiceContext,
        at: Date.now(),
        comparison: extra?.comparison ?? null,
        selectedSide: extra?.selectedSide,
        comparedAgainstKey: extra?.otherView ? opaquePlaceKey(`${extra.otherView.name} ${extra.otherView.address ?? ""}`) : null,
      });
      recordPreferenceObservation(obs);
    } catch {
      /* fire-and-forget: 記録失敗は本人 UX に影響させない */
    }
  };

  // ════════════════════ ② 詳細（Overlay 内で大展開・大メディア2分割・なぜここをおすすめ？） ════════════════════
  if (view === "detail") {
    const addrLines = splitAddressLines(v.address);
    const detailRes = enrich.resolutionFor(v.placeId); // ★flag OFF/未取得なら全 fallback（abstract/未確認）
    // ★REDO-8: 縦を理想画像②とほぼ同じに圧縮（巨大化禁止）。横だけ広い。メディア小・なぜは2行まで・余白を詰める。
    // ★REDO-14: max-height を overlay の top 起点で「viewport 内に収まる」よう動的化（下部 CTA 見切れ防止・内部スクロール）。
    //   overlayTopOffset 未指定（standalone）は従来の 80vh 固定。`min(80vh, …)` で高い viewport でも巨大化させない。
    return (
      <div data-testid="lens-detail"
        style={overlayTopOffset != null ? { maxHeight: `min(80vh, calc(100vh - ${Math.round(overlayTopOffset) + 12}px))` } : undefined}
        className="max-h-[80vh] overflow-y-auto rounded-3xl bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.20)] ring-1 ring-purple-200">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-[17px] font-bold leading-snug tracking-tight text-slate-900">{v.name}</h3>
            <div className="mt-0.5 flex items-center gap-2">
              {v.category && <span className="text-[11.5px] text-slate-400">{v.category}</span>}
              {v.affinityBadge && <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700">{v.affinityBadge}高め</span>}
            </div>
            <p className="mt-1 text-[12.5px] leading-snug text-slate-500">{LENS_SUBTITLE[lens]}</p>
          </div>
          <button type="button" onClick={() => setView("browse")} data-testid="lens-detail-close" aria-label="閉じる"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[14px] text-slate-500 transition hover:bg-slate-200">⌃</button>
        </div>

        {/* メディア 2 分割（実写真 or abstract タイル ＋ 実地図・高さは控えめに） */}
        <div className="mt-2.5 flex gap-2">
          <PhotoOrTile category={v.category} resolution={detailRes} h="h-[5.25rem]" w="w-[58%]" />
          <LensPlaceMap lat={v.lat} lng={v.lng} name={v.name} h="h-[5.25rem]" w="flex-1" />
        </div>

        {/* 住所（◎ ＋ 2 行整理） */}
        <div className="mt-2.5 flex items-start gap-1.5 text-[13px] leading-snug text-slate-700">
          <span aria-hidden className="mt-0.5 text-slate-400">◎</span>
          <span className="min-w-0">{addrLines.length ? addrLines.map((l, i) => <span key={i} className="block">{l}</span>) : "住所は未取得です"}</span>
        </div>

        {/* ★営業時間（取得できた時だけ確認済み表示・取れなければ非表示=未確認のまま） */}
        {isPlaceDetailsUiEnabled() && detailRes.hoursConfirmed && (
          <div data-testid="lens-detail-hours" className="mt-2 flex items-center gap-1.5 text-[12.5px] text-slate-700">
            <span aria-hidden>🕐</span><span className="font-medium">営業時間: {openStateLabel(detailRes)}</span>
            {detailRes.hoursLines[0] && <span className="truncate text-slate-400">· {detailRes.hoursLines[0]}</span>}
          </div>
        )}

        <ChipRow view={v} />

        {/* ★Stage 1-C: この人・この目的・この状態への適合 readout（観測あり時のみ意味。flag OFF で null＝②詳細 DOM 不変・
            ranking/winner/highlight/comparison logic には一切触れない・件数チップ必須）。同 placeDescriptor→opaque key で照合。 */}
        <div className="mt-3 flex justify-center">
          <PlaceFitArcReadout placeDescriptor={`${v.name} ${v.address ?? ""}`} size={76} />
        </div>

        {/* なぜここをおすすめ？（★理想画像どおり ✓ 付きチェックリスト・honest 項目のみ・捏造しない） */}
        <div className="mt-3 rounded-2xl bg-purple-50/70 px-3.5 py-3">
          <p className="text-[12.5px] font-bold text-purple-700">なぜここをおすすめ？</p>
          <ul className="mt-1.5 space-y-1.5">
            {buildWhyBullets(v, lens).map((b, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[13px] leading-relaxed text-slate-700">
                <span aria-hidden className="mt-0.5 text-purple-500">✓</span>
                <span className="min-w-0">{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ★Google 由来情報（写真/営業時間）を出している時だけ Powered by Google（規約） */}
        {isPlaceDetailsUiEnabled() && detailRes.showGoogleAttribution && <PoweredByGoogle />}

        <div className="mt-3 flex gap-2">
          {n > 1 && <button type="button" onClick={() => openCompare(current)} data-testid="lens-detail-compare" className="flex-1 rounded-xl bg-white py-2 text-[13px] font-medium text-purple-700 ring-1 ring-purple-300 transition hover:bg-purple-50">＋ 比較に追加</button>}
          <button type="button" onClick={() => { observeSelect(v, "detail"); onSelect(candidates[current]!); }} data-testid="lens-detail-select" className="flex-1 rounded-xl bg-purple-600 py-2 text-[13px] font-semibold text-white transition hover:bg-purple-700">ここにする</button>
        </div>
      </div>
    );
  }

  // ════════════════════ ③ 候補を比較する（比較専用シート・比較表が主役・7行死守） ════════════════════
  if (view === "compare") {
    const left = v;
    const right = views[compareIndex]!;
    // ★P4-d: 比較 2 候補の enrichment（flag OFF/未取得は全 fallback）。営業時間が片側でも取れたら確認済み行を出す。
    const leftRes = enrich.resolutionFor(left.placeId);
    const rightRes = enrich.resolutionFor(right.placeId);
    const hoursConfirmedEither = isPlaceDetailsUiEnabled() && (leftRes.hoursConfirmed || rightRes.hoursConfirmed);
    const showGoogle = isPlaceDetailsUiEnabled() && (leftRes.showGoogleAttribution || rightRes.showGoogleAttribution);
    // 営業時間が確認済みなら未確認群から外し、確認済み行へ昇格（雰囲気/Wi-Fi/電源/静かは未確認のまま）。
    const unconfirmedRows = hoursConfirmedEither ? UNCONFIRMED_ROWS.filter((r) => r.label !== "営業時間") : UNCONFIRMED_ROWS;
    // ★P3-c: preference は ③ 比較表の**表示行順だけ**に反映（apply flag ON＋gate 済の時のみ親が渡す）。
    //   recommendation/winner/highlight は buildLensComparisonView 内で canonical 固定＝preference 不依存（順位/推薦は不変）。
    // ★E-b: 「元の並びに戻す」(showCanonical) の間は **この ③ 表示だけ** preference を渡さず canonical order に戻す。
    //   （観測/preference record/localStorage は一切変えない＝次回以降の挙動は不変・その場の表示のみ）。
    const effectivePreference = showCanonical ? undefined : preference;
    const comp = buildLensComparisonView(lens, left, right, effectivePreference);
    const confirmSide = (side: "left" | "right") => {
      if (selectedSide === side) {
        observeSelect(side === "left" ? left : right, "compare", { comparison: comp, selectedSide: side, otherView: side === "left" ? right : left });
        onSelect(candidates[side === "left" ? current : compareIndex]!);
        return;
      }
      setSelectedSide(side);
    };
    const headCls = (side: "left" | "right") =>
      `min-w-0 flex-1 rounded-2xl p-2.5 text-left transition ring-1 ${selectedSide === side ? "bg-purple-50 ring-purple-300" : "bg-white ring-black/5 hover:bg-slate-50"}`;
    return (
      <Portal>
        <div className="fixed inset-0 z-[100] flex items-end justify-center" data-testid="lens-compare">
          <div className="absolute inset-0 bg-black/45" onClick={() => setView("browse")} aria-hidden />
          <div className="relative flex max-h-[88vh] w-full max-w-[600px] flex-col overflow-hidden rounded-t-[1.75rem] bg-slate-50 shadow-[0_-10px_44px_rgba(0,0,0,0.22)]">
            {/* ヘッダー: 戻る / 予定名 / 比較中 N 件 / 目的説明 */}
            <div className="shrink-0 bg-white px-4 pb-2.5 pt-3">
              <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-slate-200" aria-hidden />
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setView("browse")} data-testid="lens-compare-back" className="flex items-center gap-1 text-[14px] font-medium text-slate-600 transition hover:text-slate-900">‹ 戻る</button>
                <span className="truncate px-2 text-[15px] font-bold text-slate-900">{title || "候補を比較"}</span>
                <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-[11px] font-medium text-purple-700">比較中 2件</span>
              </div>
              <p className="mt-1 text-center text-[11.5px] text-slate-400">{LENS_PURPOSE_LINE[lens]}</p>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {/* 上部 2 候補カード（写真相当 ＋ 地図相当 2 分割・しっかり高さ） */}
              <div className="flex items-stretch gap-2">
                <button type="button" onClick={() => confirmSide("left")} data-testid="lens-compare-left" className={headCls("left")}>
                  <div className="flex gap-1.5"><PhotoOrTile category={left.category} resolution={leftRes} h="h-14" w="w-[56%]" /><LensPlaceMap lat={left.lat} lng={left.lng} name={left.name} h="h-14" w="flex-1" /></div>
                  <span className="mt-2 block truncate text-[14px] font-bold text-slate-900">{left.name}</span>
                  <span className="text-[10.5px] text-slate-400">{left.category}{left.affinityBadge && " · 相性高め"}</span>
                </button>
                <div className="flex min-w-0 flex-1 items-stretch gap-1"
                  onTouchStart={(e) => { touch.y = e.touches[0]?.clientY ?? null; }}
                  onTouchEnd={(e) => { if (touch.y == null) return; const dy = (e.changedTouches[0]?.clientY ?? touch.y) - touch.y; if (Math.abs(dy) > 30) cycleCompare(dy < 0 ? 1 : -1); touch.y = null; }}>
                  <button type="button" onClick={() => confirmSide("right")} data-testid="lens-compare-right" className={headCls("right")}>
                    <div className="flex gap-1.5"><PhotoOrTile category={right.category} resolution={rightRes} h="h-14" w="w-[56%]" /><LensPlaceMap lat={right.lat} lng={right.lng} name={right.name} h="h-14" w="flex-1" /></div>
                    <span className="mt-2 block truncate text-[14px] font-bold text-slate-900">{right.name}</span>
                    <span className="text-[10.5px] text-slate-400">{right.category}{right.affinityBadge && " · 相性高め"}</span>
                  </button>
                  {otherIndices.length > 1 && (
                    <div className="flex shrink-0 flex-col justify-center gap-1">
                      <button type="button" onClick={() => cycleCompare(-1)} aria-label="前の候補" data-testid="lens-compare-prev" className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[12px] text-slate-500 ring-1 ring-black/5 hover:bg-slate-100">▲</button>
                      <button type="button" onClick={() => cycleCompare(1)} aria-label="次の候補" data-testid="lens-compare-next" className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[12px] text-slate-500 ring-1 ring-black/5 hover:bg-slate-100">▼</button>
                    </div>
                  )}
                </div>
              </div>

              {/* 「候補を比較」見出し ＋ 基準について */}
              <div className="mb-1.5 mt-4 flex items-baseline justify-between px-0.5">
                <p className="text-[14px] font-bold text-slate-800">候補を比較</p>
                <span className="text-[11px] text-slate-400">基準について</span>
              </div>

              {/* ★E-b: 行順 explanation note（flag ON かつ行順が canonical と変わった時=explanation 非 null の時だけ・register A 行為説明）。
                   「元の並びに戻す」= この ③ 表示だけ canonical（観測/preference は消さない）。flag OFF/順序不変では非表示＝現状不変。 */}
              {isCandidateLensExplanationEnabled() && comp.explanation && (
                <div data-testid="lens-explanation" className="mb-1.5 flex items-center justify-between gap-2 rounded-xl bg-purple-50/70 px-3 py-2 ring-1 ring-purple-100">
                  <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-purple-800">{buildExplanationCopy(comp.explanation.leadAxes)}</p>
                  <button type="button" data-testid="lens-explanation-reset" onClick={() => setShowCanonical(true)} className="shrink-0 text-[11px] font-medium text-purple-600 underline transition hover:text-purple-800">元の並びに戻す</button>
                </div>
              )}

              {/* ★比較表（主役・面積支配・7 行死守・優位セル紫塗り✓・未確認は dimmed） */}
              <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_30px_rgba(0,0,0,0.07)] ring-1 ring-black/5">
                <div className="grid grid-cols-[4.5rem_1fr_1fr] border-b border-black/5 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500"><span>項目</span><span className="truncate">{left.name}</span><span className="truncate">{right.name}</span></div>
                <div className="divide-y divide-black/5">
                  {comp.mainRows.map((row) => (
                    <div key={row.key} data-testid="lens-row" data-key={row.key} className="grid min-h-[54px] grid-cols-[4.5rem_1fr_1fr] items-stretch">
                      <span className="flex items-center gap-1 bg-slate-50/60 px-3 py-2 text-[12px] text-slate-500"><span aria-hidden className="text-[14px]">{ATTR_ICON[row.key]}</span>{row.label}</span>
                      <span className={`flex items-center px-2.5 py-2 text-[12.5px] leading-snug ${row.left.isBest ? "bg-purple-100/70 font-semibold text-purple-900" : "text-slate-600"}`}>{row.left.isBest && <span aria-hidden className="mr-1 text-purple-500">✓</span>}{row.key === "address" ? (shortAddress(row.left.value, 14) ?? "—") : (row.left.value ?? "—")}</span>
                      <span className={`flex items-center px-2.5 py-2 text-[12.5px] leading-snug ${row.right.isBest ? "bg-purple-100/70 font-semibold text-purple-900" : "text-slate-600"}`}>{row.right.isBest && <span aria-hidden className="mr-1 text-purple-500">✓</span>}{row.key === "address" ? (shortAddress(row.right.value, 14) ?? "—") : (row.right.value ?? "—")}</span>
                    </div>
                  ))}
                  {(left.whyLine || right.whyLine) && (
                    <div data-testid="lens-row" data-key="reason" className="grid min-h-[54px] grid-cols-[4.5rem_1fr_1fr] items-stretch">
                      <span className="flex items-center gap-1 bg-slate-50/60 px-3 py-2 text-[12px] text-slate-500"><span aria-hidden className="text-[14px]">⭐️</span>おすすめ理由</span>
                      <span className="px-2.5 py-2 text-[12px] leading-snug text-slate-600">{left.whyLine ?? "—"}</span>
                      <span className="px-2.5 py-2 text-[12px] leading-snug text-slate-600">{right.whyLine ?? "—"}</span>
                    </div>
                  )}
                  {/* ★営業時間: 取得できた時だけ確認済み行へ昇格（片側未取得は「未確認」表記） */}
                  {hoursConfirmedEither && (
                    <div data-testid="lens-row-hours" data-key="hours" className="grid min-h-[40px] grid-cols-[4.5rem_1fr_1fr] items-stretch">
                      <span className="flex items-center gap-1 bg-slate-50/60 px-3 py-1.5 text-[11.5px] text-slate-500"><span aria-hidden className="text-[13px]">🕐</span>営業時間</span>
                      <span className="flex items-center px-2.5 py-1.5 text-[11.5px] text-slate-600">{openStateLabel(leftRes)}</span>
                      <span className="flex items-center px-2.5 py-1.5 text-[11.5px] text-slate-600">{openStateLabel(rightRes)}</span>
                    </div>
                  )}
                  {unconfirmedRows.map((r) => (
                    <div key={r.label} data-testid="lens-row-unconfirmed" className="grid min-h-[40px] grid-cols-[4.5rem_1fr_1fr] items-stretch bg-slate-50/30">
                      <span className="flex items-center gap-1 bg-slate-50/60 px-3 py-1.5 text-[11.5px] text-slate-400"><span aria-hidden className="text-[13px]">{r.icon}</span>{r.label}</span>
                      <span className="flex items-center px-2.5 py-1.5 text-[11.5px] text-slate-300">未確認</span>
                      <span className="flex items-center px-2.5 py-1.5 text-[11.5px] text-slate-300">未確認</span>
                    </div>
                  ))}
                </div>
              </div>
              <p data-testid="lens-unconfirmed" className="mt-1.5 px-1 text-[10.5px] leading-relaxed text-slate-400">「未確認」はまだデータを持っていない項目です（捏造はしません）。</p>
              {/* ★Google 由来情報（写真/営業時間）を出している時だけ Powered by Google（規約） */}
              {showGoogle && <PoweredByGoogle />}

              {/* おすすめサマリー */}
              {comp.recommendation ? (
                <div data-testid="lens-recommendation" className="mt-3 rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 px-4 py-4 ring-1 ring-purple-100">
                  <div className="flex items-center gap-2"><span className="text-[12.5px] font-bold text-purple-700">✨ おすすめ</span><span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-purple-700">{PURPOSE_LENS_LABEL[lens]}向き</span></div>
                  <p className="mt-1.5 text-[16px] font-bold leading-snug text-slate-900">{comp.recommendation.side === "left" ? left.name : right.name}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{comp.recommendation.basisPhrase}</p>
                </div>
              ) : (
                <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-black/5">
                  <p className="text-[12.5px] font-bold text-slate-500">甲乙つけがたい</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-500">表示できる差では優劣がつきませんでした。好みで選んでも大丈夫そうです。</p>
                </div>
              )}

              {/* ★Stage 1-D: もう一つの見方（Fit-Arc）。メイン「おすすめ」/winner とは **分離した補助**・比較表には入れない・
                  winner / highlight / comparison logic の根拠にしない（表示専用）。観測不足は empty・少数は仮説・件数チップ必須。
                  flag OFF では非描画＝③比較 DOM 不変。 */}
              {isFitArcReadoutEnabled() && (
                <div data-testid="lens-another-view" className="mt-4 rounded-2xl bg-slate-50 px-3.5 py-3 ring-1 ring-black/5">
                  <p className="text-[12.5px] font-bold text-slate-600">もう一つの見方</p>
                  <p className="mt-0.5 text-[10.5px] leading-snug text-slate-400">過去の答え合わせにもとづく「あなたへの適合」です。上の「おすすめ」とは別の参考表示で、勝敗には使いません。</p>
                  <div className="mt-2.5 flex items-start justify-around gap-3">
                    <div className="flex flex-col items-center gap-1">
                      <PlaceFitArcReadout placeDescriptor={`${left.name} ${left.address ?? ""}`} size={70} showHeader={false} />
                      <span className="max-w-[100px] truncate text-[10px] text-slate-500">{left.name}</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <PlaceFitArcReadout placeDescriptor={`${right.name} ${right.address ?? ""}`} size={70} showHeader={false} />
                      <span className="max-w-[100px] truncate text-[10px] text-slate-500">{right.name}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {selectedSide && (
              <div className="shrink-0 border-t border-black/5 bg-white px-4 py-3">
                <button type="button" data-testid="lens-compare-confirm" onClick={() => confirmSide(selectedSide)}
                  className="mx-auto block w-full max-w-[600px] rounded-xl bg-purple-600 py-3 text-[15px] font-semibold text-white shadow-sm transition hover:bg-purple-700 active:scale-[0.99]">
                  {(selectedSide === "left" ? left.name : right.name)} をこの予定の場所にする
                </button>
              </div>
            )}
          </div>
        </div>
      </Portal>
    );
  }

  // ════════════════════ ① おすすめの候補（薄紫カード1枚・上下スワイプ/▲▼/ドットで捲る・全体コンパクト） ════════════════════
  return (
    <div data-testid="lens-list" className="rounded-[20px] bg-white p-3 shadow-[0_16px_44px_rgba(15,23,42,0.18)] ring-1 ring-black/5">
      <div className="mb-1.5 px-0.5">
        <p className="text-[12.5px] font-bold tracking-tight text-slate-900">おすすめの候補</p>
      </div>

      {/* 薄紫の候補カード（写真→タイル左・名前・相性高め・理由・チップ・◎住所1行省略・簡易map・2ボタン）・小さめ */}
      <article data-testid="lens-card" key={v.placeId}
        className="rounded-2xl bg-purple-50/50 p-3 ring-1 ring-purple-200"
        onTouchStart={(e) => { touch.y = e.touches[0]?.clientY ?? null; }}
        onTouchEnd={(e) => { if (touch.y == null) return; const dy = (e.changedTouches[0]?.clientY ?? touch.y) - touch.y; if (Math.abs(dy) > 30) go(dy < 0 ? 1 : -1); touch.y = null; }}>
        <div className="flex items-start gap-2.5">
          <PlaceTile category={v.category} h="h-12" w="w-12" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-[14px] font-bold leading-snug tracking-tight text-slate-900">{v.name}</h4>
              {v.affinityBadge && <span className="mt-0.5 shrink-0 rounded-full bg-purple-100 px-1.5 py-0.5 text-[9.5px] font-medium text-purple-700">{v.affinityBadge}高め</span>}
            </div>
            {v.whyLine && <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-slate-600">{v.whyLine}</p>}
          </div>
        </div>
        <ChipRow view={v} />
        <div className="mt-2 flex items-end gap-2">
          <p className="flex min-w-0 flex-1 items-center gap-1 text-[11px] text-slate-500"><span aria-hidden className="text-slate-400">◎</span><span className="truncate">{shortAddress(v.address) ?? "住所は未取得です"}</span></p>
          <MapTile h="h-[2.75rem]" w="w-[4.25rem]" />
        </div>
        <div className="mt-2.5 flex gap-2">
          <button type="button" onClick={() => { enrich.ensure(v.placeId); setView("detail"); }} data-testid="lens-card-detail" className="flex-1 rounded-xl bg-white py-2 text-[12.5px] font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 active:scale-[0.99]">詳細を見る</button>
          {n > 1 && <button type="button" onClick={() => openCompare(current)} data-testid="lens-card-compare" className="flex-1 rounded-xl bg-white py-2 text-[12.5px] font-medium text-purple-700 ring-1 ring-purple-300 transition hover:bg-purple-50 active:scale-[0.99]">＋ 比較に追加</button>}
        </div>
      </article>

      {/* 捲る pager（▲ 前・ドット・▼ 次）。上下スワイプと等価。 */}
      {n > 1 && (
        <div className="mt-2.5 flex items-center justify-center gap-3">
          <button type="button" onClick={() => go(-1)} aria-label="前の候補" data-testid="lens-prev" className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[11px] text-slate-500 ring-1 ring-black/5 transition hover:bg-slate-50">▲</button>
          <div className="flex items-center gap-1.5">
            {views.map((vv, i) => (
              <button key={vv.placeId} type="button" aria-label={`候補 ${i + 1}`} onClick={() => setCurrent(i)}
                className={`h-1.5 rounded-full transition-all ${i === current ? "w-4 bg-purple-500" : "w-1.5 bg-slate-300 hover:bg-slate-400"}`} />
            ))}
          </div>
          <button type="button" onClick={() => go(1)} aria-label="次の候補" data-testid="lens-next" className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[11px] text-slate-500 ring-1 ring-black/5 transition hover:bg-slate-50">▼</button>
        </div>
      )}

      {onSkip && (
        <div className="mt-1.5 text-center">
          <button type="button" onClick={onSkip} data-testid="lens-skip" className="rounded-md px-3 py-1 text-[11.5px] text-slate-400 underline transition hover:text-slate-600">場所を選ばずに保存</button>
        </div>
      )}
    </div>
  );
}
