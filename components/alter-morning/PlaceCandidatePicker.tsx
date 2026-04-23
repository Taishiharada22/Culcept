"use client";

/**
 * PlaceCandidatePicker — W3-PR-9 Commit 5b
 *
 * 責務:
 *   Places Search で返った候補 (NormalizedPlaceCandidate[]) を user 選択可能な
 *   リストとして描画する。選択時は placeId のみを親に通知する。
 *
 * 設計方針（CEO 2026-04-23）:
 *   - このコンポーネントは **純粋な presentation**。状態は持たない。
 *   - 親 (AlterClient) が status === "search_candidates_presented" &&
 *     activePresentation !== null の時だけ mount する契約。
 *   - pending 中は全ボタン disabled。内部で click race guard を持たない
 *     （親が pending フラグを制御し、server canonical response 後に unmount）。
 *   - onSelect は placeId のみ渡す。coordinates 偽装を構造的に禁止する設計。
 *   - parked presentation は親の責務。ここは渡された candidates を描画するだけ。
 *
 * 不変条件:
 *   - candidates.length >= 1 を前提（親が 0 件を渡さない）。防御的に empty guard。
 *   - candidate.placeId は候補内で unique（parent orchestrator が保証）。
 */

import { motion } from "framer-motion";
import { MapPin, Loader2 } from "lucide-react";
import type { NormalizedPlaceCandidate } from "@/lib/alter-morning/search/normalizedPlace";

export interface PlaceCandidatePickerProps {
  /** 提示対象の候補。親 (activePresentation.candidates) から渡す。 */
  candidates: ReadonlyArray<NormalizedPlaceCandidate>;
  /**
   * 選択時に呼ばれる。placeId のみ受け取る（coordinates 偽装防止）。
   * 親は endpoint に `{ targetEventId, queryFingerprint, selectedPlaceId }` を送る。
   */
  onSelect: (placeId: string) => void;
  /**
   * true の時はすべてのボタンを disable し、pending インジケータを表示する。
   * server canonical response 待ちの間 true。
   */
  pending?: boolean;
  /**
   * pending 時にどの候補をクリックしたか（ハイライト用、任意）。
   */
  pendingPlaceId?: string | null;
}

export function formatDistance(meters: number | null): string | null {
  if (meters == null) return null;
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * 候補クリック時の安全ハンドラ。pending 中は no-op。
 * pure helper として export し、unit test の主検証対象にする。
 */
export function handleCandidateClick(
  placeId: string,
  ctx: { pending: boolean; onSelect: (placeId: string) => void },
): { dispatched: boolean } {
  if (ctx.pending) return { dispatched: false };
  ctx.onSelect(placeId);
  return { dispatched: true };
}

export function PlaceCandidatePicker({
  candidates,
  onSelect,
  pending = false,
  pendingPlaceId = null,
}: PlaceCandidatePickerProps) {
  // 防御的: 親の契約違反（0 件）時は描画しない
  if (candidates.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mt-2 rounded-2xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm p-2"
      role="listbox"
      aria-label="候補の店舗"
      aria-busy={pending || undefined}
    >
      <ul className="flex flex-col gap-1.5">
        {candidates.map((c) => {
          const isThisPending = pending && pendingPlaceId === c.placeId;
          const distanceLabel = formatDistance(c.distanceFromAnchor);
          return (
            <li key={c.placeId}>
              <button
                type="button"
                role="option"
                aria-selected={isThisPending || undefined}
                disabled={pending}
                onClick={() => {
                  handleCandidateClick(c.placeId, { pending, onSelect });
                }}
                className={[
                  "w-full text-left px-3 py-2.5 rounded-xl transition",
                  "bg-white/50 hover:bg-white/80 disabled:opacity-60",
                  "disabled:cursor-not-allowed",
                  isThisPending ? "ring-2 ring-blue-400/60 bg-white/90" : "",
                ].join(" ")}
              >
                <div className="flex items-start gap-2">
                  <MapPin
                    aria-hidden
                    className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[14px] font-medium text-gray-900 truncate">
                        {c.displayName}
                      </span>
                      {distanceLabel && (
                        <span className="text-[11px] text-gray-500 flex-shrink-0">
                          {distanceLabel}
                        </span>
                      )}
                    </div>
                    {c.address && (
                      <div className="text-[12px] text-gray-600 truncate mt-0.5">
                        {c.address}
                      </div>
                    )}
                  </div>
                  {isThisPending && (
                    <Loader2
                      aria-hidden
                      className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0 mt-0.5"
                    />
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </motion.div>
  );
}

export default PlaceCandidatePicker;
