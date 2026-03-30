/* ─────────────────────────────────────────────
   MediaPipe FaceLandmarker 478点 ランドマーク定数
   各顔領域のインデックスグループ
   ───────────────────────────────────────────── */

/** 額（スキンサンプリング用） */
export const FOREHEAD = [10, 67, 69, 104, 108, 109, 151, 299, 297, 332, 333, 338] as const;

/** 左頬（スキンサンプリング用） */
export const LEFT_CHEEK = [123, 50, 36, 137, 205, 206] as const;

/** 右頬（スキンサンプリング用） */
export const RIGHT_CHEEK = [352, 280, 266, 366, 425, 426] as const;

/** 顎先 */
export const CHIN = [152, 148, 176, 149, 150, 136, 172, 58, 132, 377, 378, 365, 397, 288, 361, 323] as const;

/** 顎輪郭（顔型分類用） — 額頂点から時計回りで一周 */
export const JAW_CONTOUR = [
  10, 338, 297, 332, 284, 251, 389, 356, 454,
  323, 361, 288, 397, 365, 379, 378, 400, 377,
  152,
  148, 176, 149, 150, 136, 172, 58, 132,
  93, 234, 127, 162, 21, 54, 103, 67, 109,
] as const;

/** 左目 */
export const LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246] as const;
/** 左目 — 内角・外角 */
export const LEFT_EYE_INNER = 133;
export const LEFT_EYE_OUTER = 33;
/** 左目 — 上端・下端（開きの計算用） */
export const LEFT_EYE_TOP = 159;
export const LEFT_EYE_BOTTOM = 145;

/** 右目 */
export const RIGHT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398] as const;
export const RIGHT_EYE_INNER = 362;
export const RIGHT_EYE_OUTER = 263;
export const RIGHT_EYE_TOP = 386;
export const RIGHT_EYE_BOTTOM = 374;

/** 左眉 */
export const LEFT_BROW = [46, 53, 52, 65, 55, 70, 63, 105, 66, 107] as const;
/** 左眉 — 内端・外端 */
export const LEFT_BROW_INNER = 107;
export const LEFT_BROW_OUTER = 46;

/** 右眉 */
export const RIGHT_BROW = [276, 283, 282, 295, 285, 300, 293, 334, 296, 336] as const;
export const RIGHT_BROW_INNER = 336;
export const RIGHT_BROW_OUTER = 276;

/** 鼻 */
export const NOSE = [1, 2, 4, 5, 6, 19, 94, 97, 168, 195, 197] as const;
export const NOSE_TIP = 1;
export const NOSE_BRIDGE = [6, 197, 195, 5, 4] as const;
/** 鼻翼（小鼻の幅） */
export const NOSE_WING_LEFT = 129;
export const NOSE_WING_RIGHT = 358;

/** 口 — 外輪郭 */
export const MOUTH_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185] as const;
/** 口 — 内輪郭 */
export const MOUTH_INNER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191] as const;
/** 口角 */
export const MOUTH_LEFT = 61;
export const MOUTH_RIGHT = 291;
/** 唇の上端・下端 */
export const UPPER_LIP_TOP = 0;
export const UPPER_LIP_BOTTOM = 13;
export const LOWER_LIP_TOP = 14;
export const LOWER_LIP_BOTTOM = 17;

/** 虹彩（左） — 中心 + 4点 */
export const LEFT_IRIS = [468, 469, 470, 471, 472] as const;
export const LEFT_IRIS_CENTER = 468;
/** 虹彩（右） — 中心 + 4点 */
export const RIGHT_IRIS = [473, 474, 475, 476, 477] as const;
export const RIGHT_IRIS_CENTER = 473;

/** ヘアライン参照点（額上端） */
export const HAIR_REF = [10, 151, 9, 8] as const;

/** 顔型分類で使う主要ポイント */
export const FACE_TOP = 10;      // 額頂点
export const FACE_BOTTOM = 152;  // 顎先端
export const FACE_LEFT = 234;    // 左頬骨外側
export const FACE_RIGHT = 454;   // 右頬骨外側
export const JAW_LEFT = 172;     // 左顎角
export const JAW_RIGHT = 397;    // 右顎角
export const FOREHEAD_LEFT = 67; // 左額端
export const FOREHEAD_RIGHT = 297; // 右額端

/* ─── ヘルパー ─── */

export interface Point2D { x: number; y: number }

/** 正規化ランドマーク → ピクセル座標変換 */
export function landmarkToPixel(
  lm: { x: number; y: number },
  imgW: number,
  imgH: number,
): Point2D {
  return { x: lm.x * imgW, y: lm.y * imgH };
}

/** 2点間のユークリッド距離 */
export function dist(a: Point2D, b: Point2D): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/** ランドマーク配列の重心 */
export function centroid(
  landmarks: { x: number; y: number }[],
  indices: readonly number[],
  imgW: number,
  imgH: number,
): Point2D {
  let sx = 0, sy = 0;
  for (const i of indices) {
    const lm = landmarks[i];
    if (!lm) continue;
    sx += lm.x * imgW;
    sy += lm.y * imgH;
  }
  const n = indices.length || 1;
  return { x: sx / n, y: sy / n };
}

/** ランドマーク群からバウンディングボックスを算出 */
export function landmarksBBox(
  landmarks: { x: number; y: number }[],
  imgW: number,
  imgH: number,
): { x: number; y: number; width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const lm of landmarks) {
    const px = lm.x * imgW;
    const py = lm.y * imgH;
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
