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
// CEO/GPT 2026-05-03 PR B-3b'-2: PresentationTarget による click 無効化制御 (Layer 2)
import type { PresentationTarget } from "@/lib/alter-morning/dialog/types";

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
  /**
   * CEO/GPT 2026-05-03 PR B-3b'-2: 候補の **target** (= どの anchor の候補か)。
   *
   * 親 (= activePresentation.target) から渡す。指定されていない場合は legacy 経路
   * (= event_where と推定) として動く。
   *
   * 用途: target.kind が disabledTargetKinds に含まれる場合、click を無効化する
   *       (= Layer 2 半壊 UX 防止 gate)。
   */
  target?: PresentationTarget;
  /**
   * CEO/GPT 2026-05-03 PR B-3b'-2: 候補 click を無効化する target.kind 一覧。
   *
   * 用途:
   *   - B-3b'-2 では `["journey_origin"]` を渡すと、journey_origin 候補は click 不可
   *     (= staging で表示はされるが、selection は B-3c 未実装のため意図的に blocked)
   *   - B-3c で journey_origin の selection 経路が完成したら、本 props から
   *     "journey_origin" を削除して有効化
   *
   * 不変条件:
   *   - target.kind が含まれていない場合: 通常 click 可
   *   - target.kind が含まれている場合: button 全体 disabled、視覚 feedback で UX 整合
   *   - target 未指定 (= legacy 経路): disabled 判定対象外、通常 click 可
   */
  disabledTargetKinds?: ReadonlyArray<PresentationTarget["kind"]>;
  /**
   * CEO/GPT 2026-05-03 PR B-3c-2 (GPT 1st 補正 #3): selection 失敗時の inline 表示文言。
   *
   * 用途:
   *   - selection が `journey_anchor_promotion_not_possible` で reject された時、
   *     親 (= useAlterChat) が文言を set し、picker 上部に inline message を表示する
   *   - 「選んだのに何も変わらない」 半壊 UX を防ぐ (= 失敗理由 + 復旧経路提示)
   *
   * 不変条件:
   *   - undefined / null → 通常表示 (= 既存挙動完全維持)
   *   - string → picker 上部に warning 風 inline 表示
   */
  feedbackMessage?: string | null;
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

/**
 * CEO/GPT 2026-05-03 PR B-3b'-2: target.kind 由来 click 無効化判定 (Layer 2 pure helper)。
 *
 * candidate UI を disabled にすべきか判定する。半壊 UX 防止の Layer 2 gate。
 *
 * 規律:
 *   - target 未指定 (= legacy 経路) → disabled = false (= 既存挙動完全 preserve)
 *   - disabledTargetKinds 未指定 / 空 → disabled = false (= 通常 click 可)
 *   - target.kind が disabledTargetKinds に含まれる → disabled = true (= click 不可)
 *
 * 使用例:
 *   isCandidateClickDisabled({ kind: "journey_origin" }, ["journey_origin"]) === true
 *   isCandidateClickDisabled({ kind: "event_where", eventId: "x" }, ["journey_origin"]) === false
 *   isCandidateClickDisabled(undefined, ["journey_origin"]) === false (= legacy 経路)
 *
 * @param target activePresentation.target (= 候補の target、optional)
 * @param disabledTargetKinds 無効化対象の target.kind 一覧
 * @returns 候補 click を無効化すべきなら true
 */
export function isCandidateClickDisabled(
  target: PresentationTarget | undefined,
  disabledTargetKinds: ReadonlyArray<PresentationTarget["kind"]> | undefined,
): boolean {
  if (!target) return false; // legacy 経路 (= target なし) は通常 click 可
  if (!disabledTargetKinds || disabledTargetKinds.length === 0) return false;
  return disabledTargetKinds.includes(target.kind);
}

/**
 * CEO/GPT 2026-05-03 PR B-3c-2: candidate-level coordinates 妥当性判定 (Layer B pure helper)。
 *
 * candidate.validCoordinates が明示 false なら disabled。それ以外は enable。
 *
 * 規律:
 *   - 既存 candidate (= validCoordinates undefined) → disabled = false (= 既存挙動完全維持)
 *   - validCoordinates: true → disabled = false (= Layer A 通過済の通常 candidate)
 *   - validCoordinates: false → disabled = true (= Layer A をすり抜けた稀ケース、Layer B で防御)
 *
 * 通常 Layer A (= journeyAnchorHandoffOrchestrator) で除外されるため、
 * production で本 helper が true を返すことは稀。defense in depth として実装。
 *
 * @param candidate 1 つの NormalizedPlaceCandidate
 * @returns coords 不正で disabled にすべきなら true
 */
export function isCandidateInvalidCoordinates(candidate: {
  validCoordinates?: boolean;
}): boolean {
  return candidate.validCoordinates === false;
}

export function PlaceCandidatePicker({
  candidates,
  onSelect,
  pending = false,
  pendingPlaceId = null,
  target,
  disabledTargetKinds,
  feedbackMessage,
}: PlaceCandidatePickerProps) {
  // 防御的: 親の契約違反（0 件）時は描画しない
  if (candidates.length === 0) return null;

  // CEO/GPT 2026-05-03 PR B-3b'-2: target.kind 由来 disabled 判定 (Layer 2)
  const targetDisabled = isCandidateClickDisabled(target, disabledTargetKinds);
  const effectivelyDisabled = pending || targetDisabled;

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
      {/* CEO/GPT 2026-05-03 PR B-3c-2 (GPT 1st 補正 #3): selection 失敗時の inline feedback */}
      {feedbackMessage && (
        <div
          role="alert"
          className="mb-2 px-3 py-2 rounded-lg bg-amber-50/90 border border-amber-200 text-amber-900 text-[12px] leading-relaxed"
        >
          {feedbackMessage}
        </div>
      )}
      <ul className="flex flex-col gap-1.5">
        {candidates.map((c) => {
          const isThisPending = pending && pendingPlaceId === c.placeId;
          const distanceLabel = formatDistance(c.distanceFromAnchor);
          // CEO/GPT 2026-05-03 PR B-3c-2 (Layer B): coordinates 不正候補の disabled 判定
          //   通常 Layer A で除外されるため production では稀。defense in depth。
          const candidateInvalidCoords = isCandidateInvalidCoordinates(c);
          const candidateEffectivelyDisabled =
            effectivelyDisabled || candidateInvalidCoords;
          return (
            <li key={c.placeId}>
              <button
                type="button"
                role="option"
                aria-selected={isThisPending || undefined}
                disabled={candidateEffectivelyDisabled}
                aria-disabled={candidateEffectivelyDisabled || undefined}
                title={
                  targetDisabled
                    ? "この機能は準備中です (B-3c で対応予定)"
                    : candidateInvalidCoords
                      ? "この候補は移動に必要な位置情報が不足しています"
                      : undefined
                }
                onClick={() => {
                  // CEO/GPT 2026-05-03 PR B-3b'-2: target.kind 由来 disabled の場合は no-op
                  // (= Layer 2 半壊 UX 防止)
                  if (targetDisabled) return;
                  // CEO/GPT 2026-05-03 PR B-3c-2 (Layer B): coords 不正候補は no-op
                  // (= 半壊 UX 防止、user は disabled UI で気づく)
                  if (candidateInvalidCoords) return;
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
