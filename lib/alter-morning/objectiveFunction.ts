/**
 * Objective Function — プラン最適化の客観関数
 *
 * CEO方針 (2026-04-17):
 * 1. hard anchor 絶対優先 (明示時刻・明示場所・明示相手)
 * 2. soft recommendation 距離ペナルティ
 * 3. 明示順序保持ペナルティ
 * 4. 往復移動ペナルティ
 * 5. 近傍優先
 *
 * 原則:
 * - この関数は「候補 X の再ランク用スコア補正」を返す。
 * - 絶対値ではなく相対値。既存 matchScore / priority とマージされる前提。
 * - fail-open: lat/lng 欠落・anchor 無しでは常に 0 を返す（何もしない）。
 *
 * 使用箇所:
 * - placeResolver.resolveAnchors → soft な place 候補の再ランク
 * - gapFillEngine.fillGaps → hard anchor 近傍 gap の候補選定
 * - planningEngine → 明示順序保持の検査
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 緯度経度 */
export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Hard anchor — ユーザーが明示的に指定した予定
 *
 * 分類:
 * - 時刻明示 (explicit_time): 「14時に病院」
 * - 場所明示 (named_place): 「サドヤで」
 * - 相手明示 (named_companion): 「鈴木さんと」
 *
 * anchorScore: 上記が揃うほど高い (0-6)
 *   explicit_time +3 / named_place(proper_noun) +2 / chain +1 / companion +1
 */
export interface HardAnchor {
  /** 元セグメント ID */
  segmentId: string;
  /** 順序位置 (sequenceOrder) */
  order: number;
  /** アンカー強度 */
  anchorScore: number;
  /** 場所 (解決済み) */
  coords?: LatLng;
  /** 場所ラベル (デバッグ用) */
  label?: string;
  /** 開始時刻 "HH:MM" */
  startTime?: string;
}

/** Soft candidate — 再ランクしたい候補 */
export interface SoftCandidate {
  /** 候補の座標 */
  coords?: LatLng;
  /** 候補のラベル */
  label?: string;
  /** 現在のスコア (0-1 目安) */
  baseScore: number;
}

/** 距離ペナルティの計算結果 */
export interface DistancePenaltyBreakdown {
  /** 最近 hard anchor への距離 (km) */
  nearestKm: number;
  /** ペナルティ値 (0-1, 大きいほど減点が重い) */
  penalty: number;
  /** 近傍ボーナス (0-1, 大きいほど優遇) */
  proximityBonus: number;
  /** 最近 anchor ID */
  nearestAnchorId?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Distance helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EARTH_RADIUS_KM = 6371;

/**
 * Haversine 距離 (km)
 *
 * 2点間の大圏距離。日本国内の近距離 (数 km 〜数十 km) では
 * 誤差 0.5% 未満で実用的に十分。
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Distance penalty (soft candidate vs hard anchors)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 距離ペナルティのスケーリング。
 *
 * CEO例: 甲府↔増穂は約 15 km。同一都道府県内の「遠い」は 10-20 km 帯。
 *
 * - 2 km 以下: ペナルティ 0 (許容範囲)
 * - 2-10 km: 線形に 0 → 0.3
 * - 10-30 km: 線形に 0.3 → 0.7 (「不自然」帯)
 * - 30 km 超: 0.7 → 0.9 で頭打ち
 *
 * 返り値は 0-0.9 の減点量。matchScore (0-1) から引き算する前提。
 */
export function computeDistancePenalty(km: number): number {
  if (km <= 2) return 0;
  if (km <= 10) return ((km - 2) / 8) * 0.3;
  if (km <= 30) return 0.3 + ((km - 10) / 20) * 0.4;
  return Math.min(0.9, 0.7 + ((km - 30) / 30) * 0.2);
}

/**
 * 近傍ボーナス — hard anchor のすぐ近くなら優遇する。
 *
 * - 0.5 km 以下: 0.2 (強い優遇)
 * - 0.5-2 km: 線形に 0.2 → 0 (優遇弱まる)
 * - 2 km 超: 0 (ボーナスなし)
 */
export function computeProximityBonus(km: number): number {
  if (km <= 0.5) return 0.2;
  if (km <= 2) return 0.2 * (1 - (km - 0.5) / 1.5);
  return 0;
}

/**
 * 候補に対する距離ペナルティを計算する。
 *
 * 最も近い hard anchor との距離で減点する。
 * 複数 anchor がある場合は「前後どちらからも近い」方が優遇される
 * (往復ペナルティは別途 computeRoundTripPenalty で処理)。
 *
 * anchor が無い / 候補に coords が無い場合は 0 を返す (fail-open)。
 */
export function computeDistanceImpact(
  candidate: SoftCandidate,
  anchors: HardAnchor[],
): DistancePenaltyBreakdown {
  if (!candidate.coords || anchors.length === 0) {
    return { nearestKm: 0, penalty: 0, proximityBonus: 0 };
  }

  let nearestKm = Infinity;
  let nearestAnchorId: string | undefined;
  for (const anchor of anchors) {
    if (!anchor.coords) continue;
    const km = haversineKm(candidate.coords, anchor.coords);
    if (km < nearestKm) {
      nearestKm = km;
      nearestAnchorId = anchor.segmentId;
    }
  }

  if (!Number.isFinite(nearestKm)) {
    return { nearestKm: 0, penalty: 0, proximityBonus: 0 };
  }

  return {
    nearestKm,
    penalty: computeDistancePenalty(nearestKm),
    proximityBonus: computeProximityBonus(nearestKm),
    nearestAnchorId,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Round-trip penalty
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 往復ペナルティ — A→B→A' パターンで A≈A' かつ B が遠いとき減点。
 *
 * CEO例: 「甲府↔増穂のような不自然な逆走」
 *
 * 判定ロジック:
 *   - prev と next が近い (< 2 km) かつ candidate が両方から遠い (> 5 km) → 減点
 *   - 幾何的に言うと candidate が prev-next の中点から離れすぎ
 *
 * prev / next / candidate いずれかの coords 欠落 → 0
 */
export function computeRoundTripPenalty(
  prev: LatLng | undefined | null,
  candidate: LatLng | undefined | null,
  next: LatLng | undefined | null,
): number {
  if (!prev || !candidate || !next) return 0;

  const prevNextKm = haversineKm(prev, next);
  // prev と next が離れている(順路上の中継地としてありうる) → 往復とは見なさない
  if (prevNextKm > 3) return 0;

  const prevCandKm = haversineKm(prev, candidate);
  const nextCandKm = haversineKm(next, candidate);
  const detourKm = prevCandKm + nextCandKm - prevNextKm;

  // 順路通り (迂回量 < 4 km) なら減点なし
  if (detourKm < 4) return 0;

  // 迂回量を 4-30 km で 0 → 0.5 にマップ
  return Math.min(0.5, ((detourKm - 4) / 26) * 0.5);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Order-preservation penalty
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 明示順序違反を検査する。
 *
 * CEO例: 「朝マック → 昼サドヤ の順を崩さない」
 *
 * items に hard anchor が複数ある場合、order (sequenceOrder) 順と
 * startTime 順が一致しないなら違反。
 *
 * 返り値: 違反ペアの配列 (empty = OK)
 */
export interface OrderViolation {
  earlierSegmentId: string;
  laterSegmentId: string;
  earlierStart: string;
  laterStart: string;
}

export function detectOrderViolations(anchors: HardAnchor[]): OrderViolation[] {
  const withTime = anchors.filter(a => a.startTime);
  const byOrder = [...withTime].sort((a, b) => a.order - b.order);

  const violations: OrderViolation[] = [];
  for (let i = 0; i < byOrder.length - 1; i++) {
    const earlier = byOrder[i];
    const later = byOrder[i + 1];
    if (toMin(earlier.startTime!) > toMin(later.startTime!)) {
      violations.push({
        earlierSegmentId: earlier.segmentId,
        laterSegmentId: later.segmentId,
        earlierStart: earlier.startTime!,
        laterStart: later.startTime!,
      });
    }
  }
  return violations;
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Composite scoring
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface AdjustScoreContext {
  /** 既に解決済みの hard anchor 群 */
  anchors: HardAnchor[];
  /** この候補の配置前 anchor (時刻 / 順序上の直前) */
  prevAnchor?: HardAnchor;
  /** この候補の配置後 anchor (時刻 / 順序上の直後) */
  nextAnchor?: HardAnchor;
}

/**
 * 候補スコアの総合調整値 (距離・近傍・往復を合算) を返す。
 *
 * 返り値: -0.9 〜 +0.2 の範囲の補正値
 *   正の値 = ブースト (近傍優遇)
 *   負の値 = 減点 (遠い / 逆走)
 *
 * matchScore += adjustCandidateScore(...) で使う。
 * 0 以下で下限クリップ、1 以上で上限クリップするのは呼び出し側の責務。
 */
export function adjustCandidateScore(
  candidate: SoftCandidate,
  context: AdjustScoreContext,
): {
  adjustment: number;
  breakdown: {
    distancePenalty: number;
    proximityBonus: number;
    roundTripPenalty: number;
    nearestKm: number;
  };
} {
  const dist = computeDistanceImpact(candidate, context.anchors);
  const rt = computeRoundTripPenalty(
    context.prevAnchor?.coords ?? null,
    candidate.coords ?? null,
    context.nextAnchor?.coords ?? null,
  );

  const adjustment = -dist.penalty + dist.proximityBonus - rt;

  return {
    adjustment,
    breakdown: {
      distancePenalty: dist.penalty,
      proximityBonus: dist.proximityBonus,
      roundTripPenalty: rt,
      nearestKm: dist.nearestKm,
    },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hard anchor extraction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 汎用: 任意のセグメント風オブジェクトから hard anchor を抽出する。
 *
 * 条件:
 *   anchorScore >= HARD_ANCHOR_THRESHOLD (default 4)
 *   かつ lat/lng が解決済み
 *
 * 閾値は「時刻明示(3) + 場所明示(2) + 任意(1)」で 4 以上を想定。
 */
export const HARD_ANCHOR_THRESHOLD = 4;

export interface AnchorSource {
  id: string;
  order?: number;
  anchorScore?: number;
  startTime?: string;
  resolvedLat?: number;
  resolvedLng?: number;
  resolvedPlaceName?: string;
  /**
   * 場所解決の確信度（CEO方針 2026-04-17 P0）
   *
   * high / 明示確認済み のみ hard anchor に昇格させる。medium は pendingPlaceConfirmations
   * 経由でユーザーに確認した結果 high 相当（cache source で high）になってから anchor 化する。
   * 未指定（legacy 経路）は従来動作を維持するため permissive に通す。
   */
  resolutionConfidence?: "high" | "medium" | "low" | "unresolved";
}

/**
 * hard anchor に昇格可能な confidence のみ通すゲート。
 *
 * CEO方針 2026-04-17 P0:
 *   - high = Places API で強く一致 or 確認後のキャッシュヒット → 通す
 *   - medium = 候補が拮抗 or ユーザー確認未了 → 通さない（距離ペナルティ基点に使うと逆に事故）
 *   - low / unresolved → 通さない
 *   - undefined = legacy 呼び出し（テスト含む）。従来動作維持のため通す
 */
function isAnchorableConfidence(conf: AnchorSource["resolutionConfidence"]): boolean {
  if (conf === undefined) return true;
  return conf === "high";
}

export function extractHardAnchors(segments: AnchorSource[]): HardAnchor[] {
  const anchors: HardAnchor[] = [];
  for (const s of segments) {
    if ((s.anchorScore ?? 0) < HARD_ANCHOR_THRESHOLD) continue;
    if (s.resolvedLat == null || s.resolvedLng == null) continue;
    if (!isAnchorableConfidence(s.resolutionConfidence)) continue;
    anchors.push({
      segmentId: s.id,
      order: s.order ?? 0,
      anchorScore: s.anchorScore ?? 0,
      coords: { lat: s.resolvedLat, lng: s.resolvedLng },
      label: s.resolvedPlaceName,
      startTime: s.startTime,
    });
  }
  return anchors.sort((a, b) => a.order - b.order);
}
