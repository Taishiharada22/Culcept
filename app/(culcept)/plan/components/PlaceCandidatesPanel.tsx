"use client";

/**
 * Plan Phase 2-D — PlaceCandidatesPanel (anchor 追加時の場所候補選択 UI)
 *
 * 設計書: docs/alter-plan-phase2-d-place-picker-mini-design.md v2 §5
 *
 * 役割:
 *   AnchorFormFields の locationText 入力直下に表示する **非強制 UI**。
 *   user 入力 query を `/api/plan/places/search` に POST し、候補 3-5 件を提示。
 *   tap で locationText を canonical text に update、skip で何もせず保存。
 *
 * 不変原則 (CEO + GPT v2 整合):
 *   1. **非強制**: close × button、skip link 常時表示、自動選択禁止
 *   2. **debounce 500ms**: 入力ごとに API call せず、user 確定タイピングで 1 回
 *   3. **min 3 文字**: 短すぎる query は API call なし (cost / UX 両側)
 *   4. **AbortController で in-flight cancel**: new query / panel close / sensitive set / unmount で abort
 *   5. **sensitive sensitive set 完全抑制**: panel 非表示 + in-flight cancel + cache write 阻止
 *   6. **canonical text 化**: tap 時 locationText を `${displayName} · ${formattedAddress}` に update
 *   7. **ARIA `role="complementary"`**: 補助 UI、modal ではない、focus trap 不要
 *   8. **privacy-first hint**: panel 上部に "Google に確認します" proactive disclosure
 *   9. **isCanonical 状態は panel 自動非表示**: user 確定済 (= 編集後 isCanonical→false で再 open)
 *  10. **fail-open**: 429 / Places API throw / network error → empty results + 友好的 message
 *
 * 範囲外 (Phase 2-D+ 預け):
 *   - keyboard navigation (mobile-first v1、tap focus)
 *   - place_resolution_cache への write endpoint call (= MapTab 初回 geocode で resolved になる、cost ±1 call)
 *   - same-day anchor / recent freq / geolocation bias (useBiasContext v1 は baseline-only)
 *   - session recent places memory (C3 候補)
 */

import { useEffect, useMemo, useRef, useState } from "react";

import {
  formatCanonicalLocationText,
  isCanonicalLocationText,
} from "@/lib/shared/canonicalLocationText";
import { classifyPlaceIntent } from "@/lib/plan/intentClassification";
import { classifyActivityIconKey } from "@/lib/plan/compose/activityIcon";
import { rerankGoogleCandidatesByActivity } from "@/lib/plan/compose/placeCandidateRanking";
import { buildPlaceAffinityReadiness } from "@/lib/plan/compose/placeAffinityReadiness";
import { buildPlaceConditionAffinity, placeConditionLabel, type PlaceCondition } from "@/lib/plan/compose/placeConditionAffinity";
import { useTodayWeather } from "@/lib/plan/context/useTodayWeather";
import { isPlaceAffinityReasonEnabled, isPlaceAffinityRankingEnabled, placeCandidateBestReason } from "@/lib/plan/compose/placeAffinityReasonUi";
import { scorePlaceCandidates } from "@/lib/plan/compose/placeAffinityCombiner";
import { loadAllObservations, normalizeLocationText, toTimeband, toWeekdayBucket } from "@/lib/plan/mobility/mobilityObservationStore";
import { buildShadowRanking, shadowInputsFromDisplayOrder } from "@/lib/plan/compose/placeAffinityShadowRanking";
import { recordPlaceAffinitySafetyEntry, summarizePlaceAffinityShadow } from "@/lib/plan/compose/placeAffinitySafetyJournal";

import type { BiasContext } from "./_useBiasContext";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEBOUNCE_MS = 500;

/**
 * Phase 2-H smoke fix (2026-05-21):
 *   MIN_QUERY_LENGTH = 3 を撤廃。
 *   理由: 「新宿」 「渋谷」 等の 2 文字日本語地名で reject されていた。
 *   過剰 fetch 防止は classifyPlaceIntent の ambiguous 判定 (= title 短すぎ + locationText 空) に委ねる。
 *   - intent_with_area:  title + locationText 両方ある → 必ず active (= 短い地名でも検索)
 *   - intent_only:       title >= 2 (= classifyPlaceIntent で保証)
 *   - explicit_place:    locationText keyword match
 *   - ambiguous:         panel 非表示
 */

/** Places API endpoint response の PlaceCandidate と同 shape (server で normalize 済) */
export interface PlaceCandidate {
  placeId: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  types: string[];
  distanceMeters: number | null;
}

interface SearchApiResponse {
  ok: boolean;
  data?: {
    results: PlaceCandidate[];
    apiAvailable: boolean;
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PlaceCandidatesPanelProps {
  /** AnchorFormFields の locationText 値 (debounce 前の生入力) */
  query: string;
  /**
   * Phase 2-H: AnchorFormFields の title 値 (= 予定名)。
   * server に title field として送信、 server 側で query + title を combine。
   * panel header の文言で intent transparency 表示 (= 「『◯◯』 を ▲▲ 周辺で探しています」)。
   * 不在 (= "") なら既存 Phase 2-D 挙動 (= query のみで explicit_place 検索)。
   */
  title?: string;
  /** useBiasContext() の biasContext (= Places API locationBias 用) */
  biasContext: BiasContext;
  /** sensitiveCategory が設定済か (true なら panel 完全抑制 + in-flight cancel) */
  sensitive: boolean;
  /**
   * 候補 tap 時の callback。canonical text と元 candidate を渡す。
   * 親 (AnchorFormFields) は locationText を canonical text に更新。
   */
  onSelect: (canonicalText: string, candidate: PlaceCandidate) => void;
  /**
   * "場所を選ばずに保存" tap 時の callback。
   * 親への通知のみ、panel の close logic は内部で完結。
   */
  onSkip: () => void;
  /**
   * test 用、初期 closedAtSearchKey (default: null)。
   * Phase 2-H smoke fix: closedAtQuery → closedAtSearchKey に rename
   * (= intentType + title + locationText の 3 軸 key で 「同一検索」 を判定)。
   */
  initialClosedAtSearchKey?: string;
  /**
   * P1A-2a: true の時のみ Google 候補を予定タイプ(activityKey)に寄せて gentle reorder
   * ＋ type 整合の fact reason 表示。default false ＝ 従来挙動（AnchorFormFields は不変）。
   * persona / 履歴 / 距離 / 外部API は一切使わない。generic（title 空含む）は並べ替えない。
   */
  rankByAffinity?: boolean;
  /** ★P5.1: 予定の開始時刻("HH:mm")。条件付き reason(この時間帯) 用・任意・順位不変。 */
  anchorStartTime?: string;
  /** ★P5.1: 予定日(YYYY-MM-DD)。条件付き reason(平日/週末) 用・任意・順位不変。 */
  anchorDateISO?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function PlaceCandidatesPanel({
  query,
  title = "",
  biasContext,
  sensitive,
  onSelect,
  onSkip,
  initialClosedAtSearchKey = null as unknown as string,
  rankByAffinity = false,
  anchorStartTime,
  anchorDateISO,
}: PlaceCandidatesPanelProps) {
  const [debouncedQuery, setDebouncedQuery] = useState<string>(query);
  const [debouncedTitle, setDebouncedTitle] = useState<string>(title);
  const [results, setResults] = useState<PlaceCandidate[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /**
   * Phase 2-H smoke fix: close × / skip link で user が閉じた searchKey を記録。
   * searchKey = `${intentType}|${title}|${locationText}` (= 3 軸)。
   * title or locationText のいずれかが変われば searchKey が変わり、 close 解除 → 再 open される。
   *
   * 例:
   *   1. title="ショッピング" + locationText="" → searchKey="intent_only|ショッピング|"
   *      user が close → closedAtSearchKey = "intent_only|ショッピング|"
   *   2. user が locationText="新宿" を追加
   *      → searchKey = "intent_with_area|ショッピング|新宿" (= 新 key)
   *      → closedAtSearchKey と一致しない → close 解除 → 再 fetch
   */
  const [closedAtSearchKey, setClosedAtSearchKey] = useState<string | null>(
    initialClosedAtSearchKey,
  );
  const abortRef = useRef<AbortController | null>(null);

  // ── Debounce ──
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Phase 2-H: title も同 debounce で fetch trigger に integrate
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTitle(title), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [title]);

  // ── intent + searchKey 導出 (Phase 2-H smoke fix) ──
  // searchKey = `${intentType}|${title}|${locationText}` で 3 軸統合 key
  // title or locationText のいずれかが変われば必ず別検索として扱う (= GPT 補正)。
  const intentType = classifyPlaceIntent({
    title: debouncedTitle,
    locationText: debouncedQuery,
  });
  const searchKey = `${intentType}|${debouncedTitle.trim()}|${debouncedQuery.trim()}`;

  // ── closed reset on searchKey change ──
  // Phase 2-H smoke fix: searchKey が変われば closed 解除 (= title or locationText 変更で再 open)
  useEffect(() => {
    if (closedAtSearchKey !== null && closedAtSearchKey !== searchKey) {
      setClosedAtSearchKey(null);
    }
  }, [searchKey, closedAtSearchKey]);

  // ── Sensitive 監視: abort + auto-close ──
  useEffect(() => {
    if (sensitive) {
      abortRef.current?.abort();
      // 現 searchKey を closed として記録、sensitive 解除後も自動再 open しない
      setClosedAtSearchKey(searchKey);
      setResults([]);
      setLoading(false);
      setErrorMessage(null);
    }
  }, [sensitive, searchKey]);

  // ── isActive 判定 ──
  // Phase 2-H smoke fix: MIN_QUERY_LENGTH 制約を撤廃、 ambiguous 判定 (= classifyPlaceIntent) に委ねる
  // intent_with_area の場合、 locationText が 2 文字 (= 「新宿」) でも active になるべき。
  const isClosedAtCurrentSearchKey =
    closedAtSearchKey !== null && closedAtSearchKey === searchKey;
  const isCanonical = isCanonicalLocationText(debouncedQuery);
  const isActive =
    !sensitive &&
    !isClosedAtCurrentSearchKey &&
    intentType !== "ambiguous" &&
    !isCanonical;

  // ── Fetch effect ──
  useEffect(() => {
    // 前 fetch を必ず abort
    abortRef.current?.abort();

    if (!isActive) {
      setResults([]);
      setLoading(false);
      setErrorMessage(null);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setErrorMessage(null);

    // Phase 2-H: title を server に送信 (= server 側で combine、 outbound privacy 維持)
    const body: Record<string, unknown> = { query: debouncedQuery.trim() };
    if (debouncedTitle.trim().length > 0) {
      body.title = debouncedTitle.trim();
    }
    if (biasContext.coord) {
      body.bias = {
        lat: biasContext.coord.lat,
        lng: biasContext.coord.lng,
        radiusMeters: biasContext.radiusMeters,
      };
    }

    fetch("/api/plan/places/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then(async (r) => {
        if (controller.signal.aborted) return null;
        if (r.status === 429) {
          setErrorMessage(
            "少し時間をおいてから再度お試しください (このまま手入力で保存できます)",
          );
          return null;
        }
        try {
          return (await r.json()) as SearchApiResponse;
        } catch {
          return null;
        }
      })
      .then((res) => {
        if (controller.signal.aborted) return;
        if (res && res.ok && res.data) {
          setResults(res.data.results);
          if (!res.data.apiAvailable) {
            setErrorMessage(
              "場所候補は現在利用できません (このまま手入力で保存できます)",
            );
          }
        } else if (!errorMessage) {
          setResults([]);
        }
      })
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        setResults([]);
        setErrorMessage(
          "候補を取得できませんでした (このまま手入力で保存できます)",
        );
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
      });

    return () => controller.abort();
    // errorMessage は dep に含めない (intentionally、loop 防止)
    // Phase 2-H smoke fix: searchKey を dep に (= title or locationText 変更で再 fetch)
    // searchKey は debouncedTitle / debouncedQuery / intentType から導出されるため、
    // searchKey 1 つで title / locationText / intent 変更すべてを cover。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isActive,
    searchKey,
    biasContext.coord?.lat,
    biasContext.coord?.lng,
    biasContext.radiusMeters,
  ]);

  // ── unmount cleanup ──
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ── P1A-2a: opt-in gentle reorder（persona 非関与・generic は Google 順維持）──
  const displayList = useMemo(
    () =>
      rankByAffinity
        ? rerankGoogleCandidatesByActivity(results, classifyActivityIconKey(title))
        : results.map((candidate) => ({ candidate, typeReason: null as string | null })),
    [rankByAffinity, results, title],
  );

  // ── P5/P5.1: 本人固有の観測 reason を **順位を変えずに** 添える（flag default OFF・dev-only）──
  //   flag OFF → null → personalReason 全て null＝既存挙動完全不変。座標/住所/内部値は出さない。
  //   ★P5.1 条件付き（この時間帯/平日週末）は anchor の予定時刻/日付から derive（external 依存なし・順位不変）。
  //   ★P5.2 weather 条件は A2 既存 useTodayWeather を再利用（新規 API/DB なし・A2 flag/非 production gate 内・fail-open）。
  const todayWeather = useTodayWeather(); // Sourced<WeatherKind> | null（flag OFF/production は null）
  const placeAffinitySignals = useMemo(() => {
    if (!isPlaceAffinityReasonEnabled()) return null;
    const observations = loadAllObservations();
    const p2 = buildPlaceAffinityReadiness(observations);
    const conditions: PlaceCondition[] = [];
    // ★優先順: weather > timeband > weekday。weather は label 付き（rain/snow/storm/heat/cold）のみ・normal/null は沈黙。
    if (todayWeather && placeConditionLabel({ dimension: "weather", value: todayWeather.value })) {
      conditions.push({ dimension: "weather", value: todayWeather.value });
    }
    if (anchorStartTime) conditions.push({ dimension: "timeband", value: toTimeband(anchorStartTime) });
    if (anchorDateISO) conditions.push({ dimension: "weekday", value: toWeekdayBucket(anchorDateISO) });
    const p3List = conditions.map((c) => buildPlaceConditionAffinity(observations, c));
    return { p2, p3List };
  }, [anchorStartTime, anchorDateISO, todayWeather]);
  const displayListWithReason = useMemo(
    () =>
      displayList.map((d) => ({
        ...d,
        personalReason: placeAffinitySignals
          ? placeCandidateBestReason(
              formatCanonicalLocationText(d.candidate.name, d.candidate.address),
              placeAffinitySignals.p2,
              placeAffinitySignals.p3List,
            )
          : null,
      })),
    [displayList, placeAffinitySignals],
  );

  // ── P6-0: shadow ranking 観測（dev console・★順序は変えない・metrics のみ・place 名は出さない）──
  //   A1-8 pattern: flag ON/dev のみ。「今の候補順を personal がどう並べ替えるか」を適用せず観測。
  //   flag OFF/production → 何もしない＝完全不変。combiner の bounded 性（maxRankShift 小）の実データ検証。
  useEffect(() => {
    if (!isPlaceAffinityReasonEnabled() || !placeAffinitySignals || displayListWithReason.length === 0) return;
    const keys = displayListWithReason.map(
      (d) => normalizeLocationText(formatCanonicalLocationText(d.candidate.name, d.candidate.address)) ?? "",
    );
    const shadow = buildShadowRanking(shadowInputsFromDisplayOrder(keys), {
      p2: placeAffinitySignals.p2,
      p3: placeAffinitySignals.p3List[0] ?? null, // 最優先条件のみ
    });
    // ★metrics のみ（placeKey/place 名/座標は出さない）。順序は変えない。
    console.debug("[place-affinity shadow]", {
      candidateCount: keys.length,
      orderChanged: shadow.orderChanged,
      changedPositionCount: shadow.changedPositionCount,
      maxRankShift: shadow.maxRankShift,
      personalAppliedCount: shadow.personalAppliedCount,
    });
    // ★検証基盤: dogfood で派生サマリーを journal に蓄積（local-only・raw なし）。蓄積後に安全性を assess。
    recordPlaceAffinitySafetyEntry(summarizePlaceAffinityShadow(shadow, placeAffinitySignals.p2));
  }, [displayListWithReason, placeAffinitySignals]);

  // ── P6-1: ranking 実反映（別 flag・default OFF・dev-only）。familiar/condition-fit を **穏やかに** 上位へ。──
  //   ★shadow(P6-0)と同じ signal(p2 + p3List[0])・bounded nudge≥0/clamp(未訪問を罰しない・general 勝者を覆さない)。
  //   flag OFF/production → displayListWithReason のまま＝順位不変。reason は P5.x で「なぜ上位か」を説明。
  const rankedDisplayList = useMemo(() => {
    if (!isPlaceAffinityRankingEnabled() || !placeAffinitySignals || displayListWithReason.length === 0) {
      return displayListWithReason;
    }
    const n = displayListWithReason.length;
    const scores = scorePlaceCandidates(
      displayListWithReason.map((d, i) => ({
        placeKey: normalizeLocationText(formatCanonicalLocationText(d.candidate.name, d.candidate.address)) ?? "",
        generalScore: n - i, // 現在の表示順を baseline に
      })),
      { p2: placeAffinitySignals.p2, p3: placeAffinitySignals.p3List[0] ?? null },
    );
    // combinedScore 降順・同点は現順序維持（安定）
    return displayListWithReason
      .map((d, i) => ({ d, score: scores[i].combinedScore, i }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .map(({ d }) => d);
  }, [displayListWithReason, placeAffinitySignals]);

  // ── handlers ──
  const handleSelect = (c: PlaceCandidate) => {
    abortRef.current?.abort();
    const canonical = formatCanonicalLocationText(c.name, c.address);
    onSelect(canonical, c);
  };

  const handleClose = () => {
    abortRef.current?.abort();
    // Phase 2-H smoke fix: searchKey 単位で close 抑制 (= title / locationText 変更で再 open)
    setClosedAtSearchKey(searchKey);
    setResults([]);
    setErrorMessage(null);
  };

  const handleSkip = () => {
    abortRef.current?.abort();
    // Phase 2-H smoke fix: searchKey 単位で close 抑制
    setClosedAtSearchKey(searchKey);
    setResults([]);
    setErrorMessage(null);
    onSkip();
  };

  if (!isActive) return null;

  return (
    <section
      role="complementary"
      aria-label="場所候補 (任意)"
      data-testid="plan-place-candidates-panel"
      className="
        mt-2 rounded-xl border border-slate-200 bg-white p-3
        max-h-60 overflow-y-auto
        relative
        shadow-sm
      "
    >
      {/* close button (× icon、右上、tap target 28px、C3 polish) */}
      <button
        type="button"
        onClick={handleClose}
        aria-label="場所候補パネルを閉じる"
        data-testid="plan-place-candidates-close"
        className="
          absolute top-2 right-2 w-7 h-7
          flex items-center justify-center rounded-full
          text-slate-400
          transition-colors duration-150
          hover:bg-slate-100 hover:text-slate-700
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300
          active:scale-95
        "
      >
        ✕
      </button>

      {/*
       * header: Phase 2-H で intent transparency 表示
       *   - intent_with_area: 「『◯◯』 を ▲▲ 周辺で探しています」
       *   - intent_only:      「『◯◯』 候補を探しています」
       *   - explicit_place:   「✨ 候補から場所を選ぶ (任意)」 (= 既存 Phase 2-D 文言)
       *   - ambiguous:        panel 自体非表示 (= isActive=false)
       */}
      <header className="mb-3 pr-9">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className="text-xs font-semibold text-slate-700 flex-shrink-0"
            data-testid="plan-place-candidates-intent-label"
          >
            {(() => {
              const titleTrim = debouncedTitle.trim();
              const queryTrim = debouncedQuery.trim();
              if (intentType === "intent_with_area") {
                return `「${titleTrim}」 を ${queryTrim} 周辺で探しています`;
              }
              if (intentType === "intent_only") {
                return `「${titleTrim}」 候補を探しています`;
              }
              // explicit_place
              return "✨ 候補から場所を選ぶ (任意)";
            })()}
          </p>
          {biasContext.label && (
            <p
              className="text-xs italic text-slate-600 truncate"
              title={biasContext.label}
              data-testid="plan-place-candidates-bias-label"
            >
              {biasContext.label}
            </p>
          )}
        </div>
        <p
          className="text-[10px] text-slate-500 italic mt-1"
          data-testid="plan-place-candidates-privacy-hint"
        >
          あなたが入力した場所を Google に確認します (キャンセル可能)
        </p>
      </header>

      {/* loading state: 3 行 skeleton shimmer (C3 polish、候補の長さ感を予告) */}
      {loading && (
        <div
          className="space-y-1.5 py-1"
          aria-busy="true"
          aria-label="場所候補を取得中"
          data-testid="plan-place-candidates-loading"
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="
                w-full rounded-lg border border-slate-100 bg-slate-50/70
                p-2 animate-pulse
              "
            >
              <div className="h-3 w-3/4 rounded bg-slate-200" />
              <div className="h-2 w-1/2 rounded bg-slate-100 mt-1.5" />
            </div>
          ))}
        </div>
      )}

      {/* error state (friendly message + skip 推奨、C3 polish: アクセス可能な role) */}
      {!loading && errorMessage && (
        <p
          role="alert"
          className="text-xs text-slate-500 py-2 italic"
          data-testid="plan-place-candidates-error"
        >
          {errorMessage}
        </p>
      )}

      {/* empty state (C3 polish: 文言整理、自由入力で保存できることを明示) */}
      {!loading && !errorMessage && results.length === 0 && (
        <p
          className="text-xs text-slate-500 py-2"
          data-testid="plan-place-candidates-empty"
        >
          該当する場所が見つかりませんでした (このまま自由入力で保存できます)
        </p>
      )}

      {/* candidates list (C3 polish: 56px tap target、focus-visible ring、active scale) */}
      {!loading && results.length > 0 && (
        <ul className="space-y-1.5" data-testid="plan-place-candidates-list">
          {rankedDisplayList.map(({ candidate: c, typeReason, personalReason }) => (
            <li key={c.placeId}>
              <button
                type="button"
                onClick={() => handleSelect(c)}
                data-testid={`plan-place-candidate-${c.placeId}`}
                className="
                  w-full text-left rounded-lg
                  border border-slate-100 bg-white
                  min-h-14 p-2.5
                  transition-colors duration-150
                  hover:border-indigo-300 hover:bg-indigo-50/60
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300
                  focus-visible:border-slate-300
                  active:scale-[0.98]
                "
              >
                {/* displayName 主 (太字、 truncate)、address 補足 (薄字、 truncate)
                    — GPT 補正の世界トップ pattern 整合 */}
                <p className="text-sm font-medium text-slate-900 truncate">
                  {c.name}
                </p>
                {c.address && (
                  <p className="text-xs text-slate-500 truncate mt-0.5">{c.address}</p>
                )}
                {c.distanceMeters !== null && (
                  <p className="text-[10px] text-slate-400 tabular-nums mt-0.5">
                    {formatDistance(c.distanceMeters)}
                  </p>
                )}
                {/* P1A-2a: type 整合の fact reason のみ（距離は数値で既出のため出さない） */}
                {typeReason && (
                  <p
                    data-testid="plan-place-candidate-reason"
                    className="text-[10px] text-indigo-500 mt-0.5"
                  >
                    {typeReason}
                  </p>
                )}
                {/* ★P5 案A: 本人固有の観測 reason（控えめ・順位に影響しない・flag OFF では非表示）。 */}
                {personalReason && (
                  <p
                    data-testid="plan-place-candidate-personal-reason"
                    className="text-[10px] text-slate-400 mt-0.5"
                  >
                    {personalReason}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* skip option (常時 visible、user の skip 明示、C3 polish: focus ring + tap target) */}
      <div className="mt-3 text-center">
        <button
          type="button"
          onClick={handleSkip}
          data-testid="plan-place-candidates-skip"
          className="
            inline-block px-3 py-1.5 rounded-md
            text-xs text-slate-500 underline
            transition-colors duration-150
            hover:text-slate-700 hover:bg-slate-50
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300
          "
        >
          場所を選ばずに保存
        </button>
      </div>
    </section>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 距離を user-facing format (m or km、小数 1 桁) に。
 * 距離 < 1000m なら "750 m"、1000m 以上なら "1.2 km"。
 */
function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
