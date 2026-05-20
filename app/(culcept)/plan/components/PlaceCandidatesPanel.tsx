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

import { useEffect, useRef, useState } from "react";

import {
  formatCanonicalLocationText,
  isCanonicalLocationText,
} from "@/lib/shared/canonicalLocationText";

import type { BiasContext } from "./_useBiasContext";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEBOUNCE_MS = 500;
const MIN_QUERY_LENGTH = 3;

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
  /** test 用、初期 closedAtQuery (default: null) */
  initialClosedAtQuery?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function PlaceCandidatesPanel({
  query,
  biasContext,
  sensitive,
  onSelect,
  onSkip,
  initialClosedAtQuery = null as unknown as string,
}: PlaceCandidatesPanelProps) {
  const [debouncedQuery, setDebouncedQuery] = useState<string>(query);
  const [results, setResults] = useState<PlaceCandidate[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /**
   * close × button / skip link でユーザーが明示的に閉じた query を記録。
   * 同 query では panel が再開しない (user 意思尊重)。
   * 新 query で reset され再表示可能 (= mini design §5.7 整合)。
   */
  const [closedAtQuery, setClosedAtQuery] = useState<string | null>(
    initialClosedAtQuery,
  );
  const abortRef = useRef<AbortController | null>(null);

  // ── Debounce ──
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // ── closed reset on query change ──
  useEffect(() => {
    if (closedAtQuery !== null && closedAtQuery !== debouncedQuery) {
      setClosedAtQuery(null);
    }
  }, [debouncedQuery, closedAtQuery]);

  // ── Sensitive 監視: abort + auto-close ──
  useEffect(() => {
    if (sensitive) {
      abortRef.current?.abort();
      // 現 query を closed として記録、sensitive 解除後も自動再 open しない (user 明示再 trigger 必要)
      setClosedAtQuery(query);
      setResults([]);
      setLoading(false);
      setErrorMessage(null);
    }
  }, [sensitive, query]);

  // ── isActive 判定 ──
  // closed (user 意思) / canonical (確定済) / sensitive / 短すぎ query では panel 非アクティブ
  const isClosedAtCurrentQuery =
    closedAtQuery !== null && closedAtQuery === debouncedQuery;
  const isCanonical = isCanonicalLocationText(debouncedQuery);
  const isActive =
    !sensitive &&
    !isClosedAtCurrentQuery &&
    debouncedQuery.trim().length >= MIN_QUERY_LENGTH &&
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

    const body: Record<string, unknown> = { query: debouncedQuery.trim() };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isActive,
    debouncedQuery,
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

  // ── handlers ──
  const handleSelect = (c: PlaceCandidate) => {
    abortRef.current?.abort();
    const canonical = formatCanonicalLocationText(c.name, c.address);
    onSelect(canonical, c);
  };

  const handleClose = () => {
    abortRef.current?.abort();
    setClosedAtQuery(debouncedQuery);
    setResults([]);
    setErrorMessage(null);
  };

  const handleSkip = () => {
    abortRef.current?.abort();
    setClosedAtQuery(debouncedQuery);
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
      "
    >
      {/* close button (× icon、右上) */}
      <button
        type="button"
        onClick={handleClose}
        aria-label="場所候補パネルを閉じる"
        data-testid="plan-place-candidates-close"
        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        ✕
      </button>

      {/* privacy-first hint (proactive disclosure) */}
      <p
        className="text-[10px] text-slate-400 italic mb-1 pr-6"
        data-testid="plan-place-candidates-privacy-hint"
      >
        あなたが入力した場所を Google に確認します (キャンセル可能)
      </p>

      {/* header: title + bias label */}
      <header className="flex items-baseline justify-between mb-2 pr-6 gap-2">
        <p className="text-xs font-semibold text-slate-600 flex-shrink-0">
          ✨ 候補から場所を選ぶ (任意)
        </p>
        {biasContext.label && (
          <p
            className="text-xs italic text-slate-500 truncate"
            title={biasContext.label}
            data-testid="plan-place-candidates-bias-label"
          >
            {biasContext.label}
          </p>
        )}
      </header>

      {/* loading state */}
      {loading && (
        <p
          className="text-xs text-slate-400 py-2"
          data-testid="plan-place-candidates-loading"
        >
          候補を確認中...
        </p>
      )}

      {/* error state (friendly message + skip 推奨) */}
      {!loading && errorMessage && (
        <p
          className="text-xs text-slate-500 py-2 italic"
          data-testid="plan-place-candidates-error"
        >
          {errorMessage}
        </p>
      )}

      {/* empty state */}
      {!loading && !errorMessage && results.length === 0 && (
        <p
          className="text-xs text-slate-400 py-2"
          data-testid="plan-place-candidates-empty"
        >
          候補が見つかりませんでした (このまま保存しても OK)
        </p>
      )}

      {/* candidates list */}
      {!loading && results.length > 0 && (
        <ul className="space-y-1.5" data-testid="plan-place-candidates-list">
          {results.map((c) => (
            <li key={c.placeId}>
              <button
                type="button"
                onClick={() => handleSelect(c)}
                data-testid={`plan-place-candidate-${c.placeId}`}
                className="
                  w-full text-left rounded-lg
                  border border-slate-100 bg-white
                  hover:border-indigo-300 hover:bg-indigo-50
                  p-2 transition
                "
              >
                {/* displayName 主 (太字、 truncate)、address 補足 (薄字、 truncate)
                    — GPT 補正の世界トップ pattern 整合 */}
                <p className="text-sm font-medium text-slate-900 truncate">
                  {c.name}
                </p>
                {c.address && (
                  <p className="text-xs text-slate-500 truncate">{c.address}</p>
                )}
                {c.distanceMeters !== null && (
                  <p className="text-xs text-slate-400">
                    {formatDistance(c.distanceMeters)}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* skip option (常時 visible、user の skip 明示) */}
      <div className="mt-3 text-center">
        <button
          type="button"
          onClick={handleSkip}
          data-testid="plan-place-candidates-skip"
          className="text-xs text-slate-500 underline hover:text-slate-700"
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
