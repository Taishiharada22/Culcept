/* ─────────────────────────────────────────────
   顔パーツ自動分類
   MediaPipe 478点ランドマークの幾何学計算から
   顔型・目・眉・鼻印象・口印象を推定
   ───────────────────────────────────────────── */

import type {
  FaceShapeKey,
  EyeShapeKey,
  BrowShapeKey,
  NoseImpression,
  MouthImpression,
  FaceImpressionScores,
} from "@/types/face-phenotype";
import {
  FACE_TOP, FACE_BOTTOM, FACE_LEFT, FACE_RIGHT,
  JAW_LEFT, JAW_RIGHT, FOREHEAD_LEFT, FOREHEAD_RIGHT,
  LEFT_EYE_INNER, LEFT_EYE_OUTER, LEFT_EYE_TOP, LEFT_EYE_BOTTOM,
  RIGHT_EYE_INNER, RIGHT_EYE_OUTER, RIGHT_EYE_TOP, RIGHT_EYE_BOTTOM,
  LEFT_BROW_INNER, LEFT_BROW_OUTER, LEFT_BROW,
  RIGHT_BROW_INNER, RIGHT_BROW_OUTER, RIGHT_BROW,
  NOSE_TIP, NOSE_BRIDGE, NOSE_WING_LEFT, NOSE_WING_RIGHT,
  MOUTH_LEFT, MOUTH_RIGHT,
  UPPER_LIP_TOP, UPPER_LIP_BOTTOM, LOWER_LIP_TOP, LOWER_LIP_BOTTOM,
  landmarkToPixel, dist,
  type Point2D,
} from "./landmarkIndices";

/* ─── 共通型 ─── */

interface NLandmark { x: number; y: number; z: number }

interface CategoryResult<K extends string> {
  primary: K;
  runner_up?: K;
  confidence: number;
}

export interface FacePartsClassification {
  faceShape: CategoryResult<FaceShapeKey>;
  eyeShape: CategoryResult<EyeShapeKey>;
  browShape: CategoryResult<BrowShapeKey>;
  noseImpression: NoseImpression;
  mouthImpression: MouthImpression;
  faceImpression: FaceImpressionScores;
}

/* ─── ヘルパー ─── */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const p = (lm: NLandmark[], idx: number): Point2D => landmarkToPixel(lm[idx], 1, 1); // 正規化座標のまま

function scoresToRanking<K extends string>(
  scores: Record<K, number>,
): { primary: K; runner_up?: K; confidence: number } {
  const entries = Object.entries(scores) as [K, number][];
  entries.sort((a, b) => (b[1] as number) - (a[1] as number));
  const top = entries[0][1] as number;
  const second = entries[1]?.[1] as number ?? 0;
  const total = entries.reduce((s, e) => s + (e[1] as number), 0) || 1;
  return {
    primary: entries[0][0],
    runner_up: entries[1]?.[0],
    confidence: clamp(top / total + (top - second) / (total || 1) * 0.3, 0, 1),
  };
}

/* ═══════════════════ 顔型分類 ═══════════════════ */

export function classifyFaceShape(lm: NLandmark[]): CategoryResult<FaceShapeKey> {
  const top = p(lm, FACE_TOP);
  const bottom = p(lm, FACE_BOTTOM);
  const left = p(lm, FACE_LEFT);
  const right = p(lm, FACE_RIGHT);
  const jawL = p(lm, JAW_LEFT);
  const jawR = p(lm, JAW_RIGHT);
  const fhL = p(lm, FOREHEAD_LEFT);
  const fhR = p(lm, FOREHEAD_RIGHT);

  const faceH = dist(top, bottom);
  const faceW = dist(left, right);
  const jawW = dist(jawL, jawR);
  const fhW = dist(fhL, fhR);

  const aspect = faceW / (faceH || 1);
  const jawRatio = jawW / (faceW || 1);
  const fhRatio = fhW / (faceW || 1);

  // 顎角度（3点の角度）
  const jawAngle = angleDeg(jawL, bottom, jawR);

  const scores: Record<FaceShapeKey, number> = {
    oval: 0,
    round: 0,
    oblong: 0,
    square: 0,
    heart: 0,
    inverted_triangle: 0,
  };

  // Round: 横幅≒縦, 丸い顎
  scores.round += gaussian(aspect, 0.92, 0.12) + gaussian(jawRatio, 0.80, 0.10) + gaussian(jawAngle, 145, 15);
  // Oblong: 縦長
  scores.oblong += gaussian(aspect, 0.62, 0.10) + gaussian(jawRatio, 0.70, 0.12);
  // Square: 顎が広い, 角ばった顎角
  scores.square += gaussian(jawRatio, 0.88, 0.08) + gaussian(jawAngle, 155, 10) + gaussian(aspect, 0.78, 0.10);
  // Heart: 額広い + 顎が狭い
  const fhJawDiff = fhRatio - jawRatio;
  scores.heart += gaussian(fhJawDiff, 0.18, 0.08) + gaussian(jawAngle, 110, 15);
  // Inverted triangle: 額広い + 顎が鋭い
  scores.inverted_triangle += gaussian(fhJawDiff, 0.15, 0.08) + gaussian(jawAngle, 100, 12);
  // Oval: バランス型（デフォルト寄り）
  scores.oval += gaussian(aspect, 0.75, 0.10) + gaussian(jawRatio, 0.72, 0.10) + gaussian(fhJawDiff, 0.05, 0.08) + 0.3;

  return scoresToRanking(scores);
}

/* ═══════════════════ 目の形状分類 ═══════════════════ */

export function classifyEyeShape(lm: NLandmark[]): CategoryResult<EyeShapeKey> {
  // 左目
  const lInner = p(lm, LEFT_EYE_INNER);
  const lOuter = p(lm, LEFT_EYE_OUTER);
  const lTop = p(lm, LEFT_EYE_TOP);
  const lBottom = p(lm, LEFT_EYE_BOTTOM);

  // 右目
  const rInner = p(lm, RIGHT_EYE_INNER);
  const rOuter = p(lm, RIGHT_EYE_OUTER);
  const rTop = p(lm, RIGHT_EYE_TOP);
  const rBottom = p(lm, RIGHT_EYE_BOTTOM);

  // 平均値で判定
  const eyeW = (dist(lInner, lOuter) + dist(rInner, rOuter)) / 2;
  const eyeH = (dist(lTop, lBottom) + dist(rTop, rBottom)) / 2;
  const aspect = eyeW / (eyeH || 1);
  const roundness = eyeH / (eyeW || 1);

  // つり/たれ角（外角と内角のY差）
  const lTilt = (lOuter.y - lInner.y) / (eyeW || 1);
  const rTilt = (rInner.y - rOuter.y) / (eyeW || 1); // 右は逆
  const tilt = (lTilt + rTilt) / 2;

  const scores: Record<EyeShapeKey, number> = {
    armond: 0, kirenaga: 0, tsurime: 0, tareme: 0, marume: 0, yanagiba: 0,
  };

  // Tsurime（つり目）: 外角が高い
  scores.tsurime += gaussian(tilt, -0.10, 0.04) + gaussian(aspect, 2.8, 0.5);
  // Tareme（たれ目）: 外角が低い
  scores.tareme += gaussian(tilt, 0.08, 0.04) + gaussian(roundness, 0.38, 0.08);
  // Marume（丸目）: 縦開きが大きい
  scores.marume += gaussian(roundness, 0.50, 0.08) + gaussian(Math.abs(tilt), 0, 0.04);
  // Kirenaga（切れ長）: 非常に横長
  scores.kirenaga += gaussian(aspect, 3.5, 0.4) + gaussian(roundness, 0.28, 0.06);
  // Yanagiba（柳葉）: 横長 + ゆるいカーブ
  scores.yanagiba += gaussian(aspect, 3.0, 0.4) + gaussian(roundness, 0.32, 0.06) + gaussian(Math.abs(tilt), 0.02, 0.03);
  // Armond（アーモンド）: バランス型
  scores.armond += gaussian(aspect, 2.5, 0.4) + gaussian(roundness, 0.40, 0.06) + gaussian(Math.abs(tilt), 0.02, 0.04) + 0.2;

  return scoresToRanking(scores);
}

/* ═══════════════════ 眉の形状分類 ═══════════════════ */

export function classifyBrowShape(lm: NLandmark[]): CategoryResult<BrowShapeKey> {
  // 左眉の分析
  const lbInner = p(lm, LEFT_BROW_INNER);
  const lbOuter = p(lm, LEFT_BROW_OUTER);
  const lbLength = dist(lbInner, lbOuter);

  // 眉のアーチ高さ（内端→外端の直線からの最大距離）
  const lbArchData = computeArchMetrics(lm, LEFT_BROW, lbInner, lbOuter, lbLength);

  // 右眉の分析
  const rbInner = p(lm, RIGHT_BROW_INNER);
  const rbOuter = p(lm, RIGHT_BROW_OUTER);
  const rbLength = dist(rbInner, rbOuter);
  const rbArchData = computeArchMetrics(lm, RIGHT_BROW, rbInner, rbOuter, rbLength);

  // 平均
  const archRatio = (lbArchData.archRatio + rbArchData.archRatio) / 2;
  const archPos = (lbArchData.archPosition + rbArchData.archPosition) / 2;
  const slope = ((lbOuter.y - lbInner.y) / (lbLength || 1) + (rbInner.y - rbOuter.y) / (rbLength || 1)) / 2;

  const scores: Record<BrowShapeKey, number> = {
    straight: 0, soft_arch: 0, high_arch: 0, round: 0, flat: 0, ascending: 0, thick_natural: 0,
  };

  // Straight: アーチ低い + 傾きなし
  scores.straight += gaussian(archRatio, 0.04, 0.02) + gaussian(Math.abs(slope), 0.0, 0.03);
  // Flat: アーチ非常に低い
  scores.flat += gaussian(archRatio, 0.03, 0.02) + gaussian(Math.abs(slope), 0.0, 0.04);
  // Soft arch: 中程度のアーチ
  scores.soft_arch += gaussian(archRatio, 0.09, 0.03) + gaussian(archPos, 0.38, 0.10);
  // High arch: 高いアーチ
  scores.high_arch += gaussian(archRatio, 0.15, 0.04);
  // Round: アーチが中央寄り + 均等なカーブ
  scores.round += gaussian(archRatio, 0.10, 0.04) + gaussian(archPos, 0.50, 0.08);
  // Ascending: 外端が高い
  scores.ascending += gaussian(slope, -0.08, 0.03);
  // Thick natural: 太め + 低めアーチ
  scores.thick_natural += gaussian(archRatio, 0.07, 0.04) + 0.15; // 太さは2Dランドマークだけでは推定困難→やや控えめ

  return scoresToRanking(scores);
}

function computeArchMetrics(
  lm: NLandmark[],
  browIndices: readonly number[],
  inner: Point2D,
  outer: Point2D,
  length: number,
) {
  // 直線ベースライン (inner → outer)
  const dx = outer.x - inner.x;
  const dy = outer.y - inner.y;
  const len = length || 1;

  let maxDist = 0;
  let maxPos = 0;

  for (const idx of browIndices) {
    const bp = p(lm, idx);
    // 直線からの垂直距離（符号付き）
    const t = ((bp.x - inner.x) * dx + (bp.y - inner.y) * dy) / (len * len);
    const projX = inner.x + t * dx;
    const projY = inner.y + t * dy;
    const d = Math.sqrt((bp.x - projX) ** 2 + (bp.y - projY) ** 2);
    if (d > maxDist) {
      maxDist = d;
      maxPos = t;
    }
  }

  return {
    archRatio: maxDist / len,
    archPosition: clamp(maxPos, 0, 1),
  };
}

/* ═══════════════════ 鼻の印象推定 ═══════════════════ */

export function estimateNoseImpression(lm: NLandmark[]): NoseImpression {
  const tip = p(lm, NOSE_TIP);
  const bridgeTop = p(lm, NOSE_BRIDGE[0]); // landmark 6
  const wingL = p(lm, NOSE_WING_LEFT);
  const wingR = p(lm, NOSE_WING_RIGHT);

  const faceTop = p(lm, FACE_TOP);
  const faceBottom = p(lm, FACE_BOTTOM);
  const faceH = dist(faceTop, faceBottom) || 1;

  // 鼻筋の長さ（顔全体に対する比率）
  const bridgeLen = dist(bridgeTop, tip);
  const heightRatio = bridgeLen / faceH;
  // 0.28前後が平均的→ ±1 にマッピング
  const height = clamp((heightRatio - 0.28) / 0.06, -1, 1);

  // 鼻翼の幅 vs 鼻筋の長さ
  const wingWidth = dist(wingL, wingR);
  const widthRatio = wingWidth / (bridgeLen || 1);
  // 0.75前後が平均→小さい方がシャープ
  const sharpness = clamp((0.75 - widthRatio) / 0.15, -1, 1);

  // 突出度（z軸）
  const tipZ = lm[NOSE_TIP]?.z ?? 0;
  const bridgeZ = lm[NOSE_BRIDGE[0]]?.z ?? 0;
  const presence = clamp((bridgeZ - tipZ) / 0.04, -1, 1);

  return {
    height: Math.round(height * 100) / 100,
    sharpness: Math.round(sharpness * 100) / 100,
    presence: Math.round(presence * 100) / 100,
  };
}

/* ═══════════════════ 口の印象推定 ═══════════════════ */

export function estimateMouthImpression(lm: NLandmark[]): MouthImpression {
  const mouthL = p(lm, MOUTH_LEFT);
  const mouthR = p(lm, MOUTH_RIGHT);
  const upperTop = p(lm, UPPER_LIP_TOP);
  const upperBottom = p(lm, UPPER_LIP_BOTTOM);
  const lowerTop = p(lm, LOWER_LIP_TOP);
  const lowerBottom = p(lm, LOWER_LIP_BOTTOM);

  const mouthW = dist(mouthL, mouthR) || 1;

  // 唇の厚さ（上唇＋下唇の縦幅 / 口幅）
  const upperH = dist(upperTop, upperBottom);
  const lowerH = dist(lowerTop, lowerBottom);
  const totalH = upperH + lowerH;
  const thicknessRatio = totalH / mouthW;
  // 0.30前後が平均
  const thickness = clamp((thicknessRatio - 0.30) / 0.10, -1, 1);

  // 口角の角度（口角が中心より上か下か）
  const centerY = (upperTop.y + lowerBottom.y) / 2;
  const cornerY = (mouthL.y + mouthR.y) / 2;
  const cornerDelta = (centerY - cornerY) / (totalH || 1);
  // 正=口角が上（微笑み）
  const corner = clamp(cornerDelta / 0.5, -1, 1);

  // 柔らかさ（上唇のカーブ度合い）
  // 上唇の中点と口角を結ぶ直線からの乖離
  const midUpperY = (upperTop.y + upperBottom.y) / 2;
  const lineY = (mouthL.y + mouthR.y) / 2;
  const curvature = (lineY - midUpperY) / (totalH || 1);
  const softness = clamp(curvature / 0.3, -1, 1);

  return {
    thickness: Math.round(thickness * 100) / 100,
    corner: Math.round(corner * 100) / 100,
    softness: Math.round(softness * 100) / 100,
  };
}

/* ═══════════════════ 顔全体の印象スコア ═══════════════════ */

export function estimateFaceImpression(
  lm: NLandmark[],
  faceShape: CategoryResult<FaceShapeKey>,
  eyeShape: CategoryResult<EyeShapeKey>,
  browShape: CategoryResult<BrowShapeKey>,
): FaceImpressionScores {
  // 顔の丸さ → warm/cool
  const roundFaces: FaceShapeKey[] = ["round", "oval"];
  const sharpFaces: FaceShapeKey[] = ["square", "inverted_triangle"];
  const warm_cool = roundFaces.includes(faceShape.primary)
    ? clamp(-0.3 - faceShape.confidence * 0.3, -1, 1)  // warm寄り (負)
    : sharpFaces.includes(faceShape.primary)
      ? clamp(0.3 + faceShape.confidence * 0.3, -1, 1)  // cool寄り (正)
      : 0;

  // 顔型 + 眉 → soft/sharp
  const softBrows: BrowShapeKey[] = ["round", "soft_arch"];
  const sharpBrows: BrowShapeKey[] = ["straight", "high_arch", "ascending"];
  const softFactor = softBrows.includes(browShape.primary) ? -0.4 : sharpBrows.includes(browShape.primary) ? 0.4 : 0;
  const soft_sharp = clamp(warm_cool * 0.3 + softFactor, -1, 1);

  // 顔の縦横比 → mature/youthful
  const top = p(lm, FACE_TOP);
  const bottom = p(lm, FACE_BOTTOM);
  const left = p(lm, FACE_LEFT);
  const right = p(lm, FACE_RIGHT);
  const aspect = dist(left, right) / (dist(top, bottom) || 1);
  const mature_youthful = clamp((0.78 - aspect) / 0.15, -1, 1); // 縦長=mature, 丸=youthful

  // 目の丸さ → cute/cool
  const cuteEyes: EyeShapeKey[] = ["marume", "tareme"];
  const coolEyes: EyeShapeKey[] = ["kirenaga", "tsurime"];
  const cute_cool = cuteEyes.includes(eyeShape.primary)
    ? clamp(-0.4 - eyeShape.confidence * 0.2, -1, 1)
    : coolEyes.includes(eyeShape.primary)
      ? clamp(0.4 + eyeShape.confidence * 0.2, -1, 1)
      : 0;

  // 総合 → friendly/mysterious
  const friendly_mysterious = clamp((cute_cool * 0.4 + soft_sharp * 0.3 + warm_cool * 0.3), -1, 1);

  return {
    warm_cool: Math.round(warm_cool * 100) / 100,
    soft_sharp: Math.round(soft_sharp * 100) / 100,
    mature_youthful: Math.round(mature_youthful * 100) / 100,
    cute_cool: Math.round(cute_cool * 100) / 100,
    friendly_mysterious: Math.round(friendly_mysterious * 100) / 100,
  };
}

/* ═══════════════════ オーケストレータ ═══════════════════ */

/**
 * ランドマーク478点から全顔パーツを一括分類
 */
export function classifyFaceParts(
  landmarks: NLandmark[],
): FacePartsClassification {
  const faceShape = classifyFaceShape(landmarks);
  const eyeShape = classifyEyeShape(landmarks);
  const browShape = classifyBrowShape(landmarks);
  const noseImpression = estimateNoseImpression(landmarks);
  const mouthImpression = estimateMouthImpression(landmarks);
  const faceImpression = estimateFaceImpression(landmarks, faceShape, eyeShape, browShape);

  return { faceShape, eyeShape, browShape, noseImpression, mouthImpression, faceImpression };
}

/* ─── 数学ヘルパー ─── */

/** ガウス関数（スコアリング用）*/
function gaussian(x: number, mean: number, sigma: number): number {
  return Math.exp(-0.5 * ((x - mean) / sigma) ** 2);
}

/** 3点の角度（度数） */
function angleDeg(a: Point2D, vertex: Point2D, b: Point2D): number {
  const v1 = { x: a.x - vertex.x, y: a.y - vertex.y };
  const v2 = { x: b.x - vertex.x, y: b.y - vertex.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const cross = v1.x * v2.y - v1.y * v2.x;
  return Math.abs(Math.atan2(cross, dot) * (180 / Math.PI));
}
