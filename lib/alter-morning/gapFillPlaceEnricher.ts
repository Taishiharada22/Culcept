/**
 * Gap Fill Place Enricher — Block 2-(b): gapFillEngine × Places Nearby
 *
 * gap-fill 提案（proposal=true）に対して Places API で近傍候補を付与する。
 *
 * CEO方針 2026-04-17:
 *   1. anchor が高確信で解決済みの時だけ Nearby を使う
 *      → hardAnchors（anchorScore>=4 かつ resolvedLat/lng 有り）が存在しないとスキップ
 *   2. 勝手に自動採用しない
 *      → resolvedPlaceName は触らず、proposedPlaceCandidates に添えるだけ
 *      → UI 側で medium confidence として表示、ユーザー選択で初めて採用
 *   3. objective function をそのまま効かせる
 *      → adjustCandidateScore（距離ペナルティ・近傍ボーナス・往復ペナルティ）
 *   4. gap fill の主題を壊さない
 *      → 非 proposal アイテムや category 対象外は一切触らない
 *      → proposal の reason / taxonomy / startTime / durationMin も不変
 *
 * スコープ（最小実装）:
 *   - category: life_rest（カフェで一息）/ social_meal（軽い食事）のみ
 *   - top 1〜3 件、placeId → address → name で dedupe
 *   - 近傍 anchor は時間軸で直前/直後の近い方を採用
 *   - fail-open: API キー欠落・API 失敗・anchor 無しは静かにスキップ
 */

import type { PlanItem } from "./types";
import { isPlacesApiAvailable, searchPlacesByText, type PlacesApiPlace } from "./placesApiClient";
import {
  adjustCandidateScore,
  haversineKm,
  type HardAnchor,
  type LatLng,
} from "./objectiveFunction";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 定数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * category → Places API textQuery の対応表。
 *
 * 最小スコープ（CEO 2026-04-17）: cafe / restaurant のみ。
 * library / park / quiet place への拡張は次フェーズ。
 */
const CATEGORY_TO_QUERY: Record<string, string> = {
  life_rest: "カフェ",
  social_meal: "レストラン",
};

/** カテゴリ別検索半径（m）。near-anchor resolver と同じ思想で近傍優先。 */
const RADIUS_BY_CATEGORY: Record<string, number> = {
  life_rest: 1000,
  social_meal: 1500,
};

const DEFAULT_RADIUS_M = 1200;

/** Places API に投げる最大件数。dedupe 後に top 3 に切る。 */
const MAX_RESULT_COUNT = 5;

/** proposedPlaceCandidates の最大件数（ユーザー負荷を抑える）。 */
const MAX_ATTACHED_CANDIDATES = 3;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ユーティリティ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** category → textQuery。対象外は null を返す（スキップ判定）。 */
function mapCategoryToQuery(category: string | undefined): string | null {
  if (!category) return null;
  return CATEGORY_TO_QUERY[category] ?? null;
}

function getRadiusForCategory(category: string): number {
  return RADIUS_BY_CATEGORY[category] ?? DEFAULT_RADIUS_M;
}

/**
 * proposal item に最も近い hard anchor を返す（時間軸ベース）。
 *
 * - item.startTime と anchor.startTime の差が最小のものを選ぶ
 * - startTime 無しの anchor は除外
 * - 同着の場合は直後側（「これから行く場所」の近くで休憩）を優先
 *
 * 返り値: { anchor, prev, next } — objective function に渡す往復ペナルティ用
 */
function findSurroundingAnchors(
  item: PlanItem,
  anchors: HardAnchor[],
): { nearest: HardAnchor; prev?: HardAnchor; next?: HardAnchor } | null {
  if (!item.startTime) return null;
  const coordAnchors = anchors.filter(a => a.coords && a.startTime);
  if (coordAnchors.length === 0) return null;

  const itemMin = timeToMinutes(item.startTime);

  // 時間順にソート
  const sorted = [...coordAnchors].sort(
    (a, b) => timeToMinutes(a.startTime!) - timeToMinutes(b.startTime!),
  );

  // 直前・直後を特定
  let prev: HardAnchor | undefined;
  let next: HardAnchor | undefined;
  for (const a of sorted) {
    const aMin = timeToMinutes(a.startTime!);
    if (aMin <= itemMin) prev = a;
    if (aMin > itemMin && !next) next = a;
  }

  // nearest: prev / next のうち時間差が小さい方（同着なら next 優先）
  let nearest: HardAnchor;
  if (prev && next) {
    const prevDiff = itemMin - timeToMinutes(prev.startTime!);
    const nextDiff = timeToMinutes(next.startTime!) - itemMin;
    nearest = nextDiff <= prevDiff ? next : prev;
  } else if (next) {
    nearest = next;
  } else if (prev) {
    nearest = prev;
  } else {
    return null;
  }

  return { nearest, prev, next };
}

/** CLOSED_PERMANENTLY を除外し、distance-based matchScore と距離メタを計算 */
function placesApiToProposalCandidate(
  p: PlacesApiPlace,
  anchorCoords: LatLng,
  radiusM: number,
): {
  name: string;
  address?: string;
  placeId?: string;
  lat?: number;
  lng?: number;
  matchScore: number;
  distanceM?: number;
} {
  const lat = p.location?.latitude;
  const lng = p.location?.longitude;
  // 距離ベースのベーススコア: 1.0 at 0m → 0.5 at radius → 0.0 at 2×radius
  let matchScore = 0.5;
  let distanceM: number | undefined;
  if (lat !== undefined && lng !== undefined) {
    const distM = haversineKm(anchorCoords, { lat, lng }) * 1000;
    matchScore = Math.max(0, 1 - distM / (radiusM * 2));
    distanceM = Math.round(distM / 50) * 50; // 50m 刻みに丸め（UI 表示を安定させる）
  }
  return {
    name: p.displayName?.text ?? "",
    address: p.shortFormattedAddress ?? p.formattedAddress,
    placeId: p.id,
    lat,
    lng,
    matchScore,
    distanceM,
  };
}

/**
 * recommendReason を生成する。
 *
 * 原則: speculation しない（「静か」「おすすめ」等の検証不能な形容は使わない）。
 *       幾何学的事実 + anchor ラベルから言えることだけ。
 *
 * 出力例:
 *   - 「ランチの近く・徒歩約200m」
 *   - 「打ち合わせの近く・徒歩約450m」
 *   - 「予定の近く・徒歩約300m」（anchor ラベル無し）
 *   - 「動線が自然」（往復ペナルティ 0 + 近傍ボーナス有り時）
 *   - 「ランチの近く」（distanceM 不明時）
 */
function buildRecommendReason(opts: {
  anchorLabel?: string;
  distanceM?: number;
  roundTripPenalty: number;
  proximityBonus: number;
}): string {
  const { anchorLabel, distanceM, roundTripPenalty, proximityBonus } = opts;
  const label = anchorLabel ? `${anchorLabel}の近く` : "予定の近く";

  // 動線が特に自然（往復ペナルティ無し + 近傍ボーナス有り）
  if (roundTripPenalty === 0 && proximityBonus > 0.1 && distanceM !== undefined) {
    if (distanceM <= 300) return `${label}・徒歩約${distanceM}m`;
    return `動線が自然・${label}から約${distanceM}m`;
  }

  if (distanceM !== undefined) {
    return `${label}・徒歩約${distanceM}m`;
  }
  return label;
}

/**
 * placeId → 正規化 address → 正規化 name の順で dedupe。
 * placeResolver.ts の dedupeCandidates と同じロジックを proposed 候補向けに複製。
 */
function dedupeProposed<T extends { name: string; address?: string; placeId?: string }>(
  candidates: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of candidates) {
    const normalizedAddress = c.address ? c.address.replace(/\s+/g, "") : null;
    const normalizedName = c.name.replace(/\s+/g, "");
    const key = c.placeId ?? normalizedAddress ?? normalizedName;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface AttachPlacesOptions {
  /** 最大件数（デフォルト 3）。テスト時に override 用。 */
  maxCandidates?: number;
}

/**
 * プランの proposal アイテム（gap fill）に近傍の Places API 候補を添える。
 *
 * 不変条件:
 *   - 非 proposal アイテム、対象外 category は完全スルー
 *   - hardAnchors 空ならプラン全体を変更しない
 *   - proposal の reason / taxonomy / startTime / durationMin / activityCategory は不変
 *   - resolvedPlaceName / resolvedLat / resolvedLng は一切触らない（medium confidence 原則）
 *
 * @param items - fillGaps 後の PlanItem 配列
 * @param hardAnchors - extractHardAnchors(segments) の結果（anchorScore>=4 かつ coords 有り）
 * @param options - 最大件数等
 * @returns proposedPlaceCandidates が添えられた新しい配列（元 items は変更しない）
 */
export async function attachNearbyPlacesToProposals(
  items: PlanItem[],
  hardAnchors: HardAnchor[],
  options?: AttachPlacesOptions,
): Promise<PlanItem[]> {
  // fail-open 1: API キー無しならスキップ
  if (!isPlacesApiAvailable()) return items;
  // fail-open 2: hard anchor が無ければそもそも位置基準が取れない
  if (hardAnchors.length === 0) return items;

  const maxCandidates = options?.maxCandidates ?? MAX_ATTACHED_CANDIDATES;

  // 先に対象 proposal を抽出（API 呼び出しゼロで済む早期 return）
  const targetIndices: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.proposal) continue;
    if (!it.startTime) continue;
    if (!it.activityCategory) continue;
    if (!mapCategoryToQuery(it.activityCategory)) continue;
    targetIndices.push(i);
  }
  if (targetIndices.length === 0) return items;

  const result = [...items];

  for (const i of targetIndices) {
    const item = result[i];
    const textQuery = mapCategoryToQuery(item.activityCategory!)!;
    const radiusM = getRadiusForCategory(item.activityCategory!);

    // 1) surrounding anchor 抽出
    const surrounding = findSurroundingAnchors(item, hardAnchors);
    if (!surrounding || !surrounding.nearest.coords) continue;
    const anchorCoords = surrounding.nearest.coords;

    // 2) Places API 呼び出し（fail-open）
    let apiResults: PlacesApiPlace[] = [];
    try {
      apiResults = await searchPlacesByText({
        textQuery,
        locationBias: {
          lat: anchorCoords.lat,
          lng: anchorCoords.lng,
          radius: radiusM,
        },
        maxResultCount: MAX_RESULT_COUNT,
        languageCode: "ja",
      });
    } catch (e) {
      console.warn("[gapFillPlaceEnricher] Places API failed (fail-open):", e);
      continue;
    }

    // 3) 候補変換 + CLOSED_PERMANENTLY 除外
    const raw = apiResults
      .filter(p => p.businessStatus !== "CLOSED_PERMANENTLY")
      .map(p => placesApiToProposalCandidate(p, anchorCoords, radiusM));

    if (raw.length === 0) continue;

    // 4) objective function でスコア補正 + recommendReason 生成
    //    - distance penalty: 遠い候補を減点
    //    - proximity bonus: 近い anchor を優遇
    //    - round-trip penalty: prev → cand → next が逆走なら減点
    //    - recommendReason: anchor ラベル + 距離 + 動線自然さから生成（speculation なし）
    const anchorLabel = surrounding.nearest.label;
    const scored = raw.map(c => {
      let proximityBonus = 0;
      let roundTripPenalty = 0;
      let adjustedScore = c.matchScore;

      if (c.lat !== undefined && c.lng !== undefined) {
        const adj = adjustCandidateScore(
          { coords: { lat: c.lat, lng: c.lng }, baseScore: c.matchScore, label: c.name },
          {
            anchors: hardAnchors,
            prevAnchor: surrounding.prev,
            nextAnchor: surrounding.next,
          },
        );
        adjustedScore = Math.max(0, Math.min(1, c.matchScore + adj.adjustment));
        proximityBonus = adj.breakdown.proximityBonus;
        roundTripPenalty = adj.breakdown.roundTripPenalty;
      }

      const recommendReason = buildRecommendReason({
        anchorLabel,
        distanceM: c.distanceM,
        roundTripPenalty,
        proximityBonus,
      });

      return {
        ...c,
        matchScore: adjustedScore,
        anchorLabel,
        recommendReason,
      };
    });

    // 5) スコア降順 → dedupe → top N
    scored.sort((a, b) => b.matchScore - a.matchScore);
    const candidates = dedupeProposed(scored).slice(0, maxCandidates);

    if (candidates.length === 0) continue;

    // 6) アイテム不変原則を守って proposedPlaceCandidates のみ添付
    result[i] = { ...item, proposedPlaceCandidates: candidates };
  }

  return result;
}
