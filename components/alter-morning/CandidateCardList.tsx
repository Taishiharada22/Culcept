/**
 * CandidateCardList — W3 P2 (candidate UI bridge)
 *
 * 朝予定の候補地リスト (search_candidates_presented 状態で server から bridge) を
 * 表示する shared component. Home Alter (AskHero.tsx) と Stargazer Alter
 * (AlterClient.tsx) の両方から使う.
 *
 * CEO 不変条件:
 *   - search_candidates_presented 状態で server が bridge した候補を表示するのみ
 *   - 候補選択は P2 では仕様外 (UI 表示のみ、tap で何も起きない)
 *   - phase / plan / persistedEvents を変更する操作は含めない
 *   - 0 件の時は親側で render しないため、ここでは empty state を持たない
 *
 * server side 仕様:
 *   response.morningProtocol.candidates が存在する場合、
 *   activePresentation.candidates と同じ配列がそのまま入る (route.ts P2 bridge).
 */

"use client";

/**
 * 候補カード描画用の最小 type (lib/alter-morning/search/normalizedPlace の subset).
 * server から送られてくる morningProtocol.candidates をそのまま受ける形で型定義.
 */
export interface AlterMorningCandidate {
  placeId: string;
  displayName: string;
  address: string;
  coordinates: { lat: number; lng: number };
  distanceFromAnchor: number | null;
  category: string | null;
  chainToken: string | null;
}

export interface CandidateCardListProps {
  candidates: AlterMorningCandidate[];
}

export function CandidateCardList({ candidates }: CandidateCardListProps) {
  if (!candidates || candidates.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-[11px] font-medium text-slate-500">
        候補がいくつか見つかりました
      </p>
      {candidates.map((c) => (
        <div
          key={c.placeId}
          className="rounded-xl border border-slate-200/60 bg-white/60 backdrop-blur-sm px-3 py-2 shadow-sm"
        >
          <p className="text-[13px] font-semibold text-slate-800 leading-tight">
            {c.displayName}
          </p>
          {c.address && (
            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
              {c.address}
            </p>
          )}
          {c.distanceFromAnchor != null && (
            <p className="text-[10px] text-slate-400 mt-0.5">
              アンカーから {Math.round(c.distanceFromAnchor)}m
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
