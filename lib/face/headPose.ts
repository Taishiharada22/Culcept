/* ─────────────────────────────────────────────
   3D 頭部姿勢推定
   MediaPipe facialTransformationMatrixes → Euler 角
   ───────────────────────────────────────────── */

export interface HeadPose {
  /** 上下回転（うなずき）: 正=下向き, 負=上向き */
  pitch: number;
  /** 左右回転（首振り）: 正=右向き, 負=左向き */
  yaw: number;
  /** 傾き: 正=右傾き, 負=左傾き */
  roll: number;
}

export type PoseStatus = "ok" | "unstable" | "ng";

export interface PoseAssessment {
  status: PoseStatus;
  pose: HeadPose | null;
  message: string;
}

/* ─── 閾値 ─── */
const OK_PITCH = 15;
const OK_YAW = 12;
const OK_ROLL = 10;

const UNSTABLE_PITCH = 25;
const UNSTABLE_YAW = 20;
const UNSTABLE_ROLL = 18;

/**
 * MediaPipe の facialTransformationMatrixes (4x4 行列, column-major)
 * から Euler 角を抽出。
 *
 * 行列レイアウト (column-major Float32Array[16]):
 * [m00, m10, m20, m30, m01, m11, m21, m31, m02, m12, m22, m32, m03, m13, m23, m33]
 *
 * Row-major 変換:
 *   R00=data[0], R01=data[4], R02=data[8]
 *   R10=data[1], R11=data[5], R12=data[9]
 *   R20=data[2], R21=data[6], R22=data[10]
 */
export function extractHeadPose(matrix: Float32Array): HeadPose {
  const R00 = matrix[0];
  const R01 = matrix[4];
  const R02 = matrix[8];
  const R10 = matrix[1];
  const R11 = matrix[5];
  const R12 = matrix[9];
  const R20 = matrix[2];
  const R21 = matrix[6];
  const R22 = matrix[10];

  const DEG = 180 / Math.PI;

  // ZYX Euler 分解
  const sy = Math.sqrt(R00 * R00 + R10 * R10);
  const singular = sy < 1e-6;

  let pitch: number, yaw: number, roll: number;

  if (!singular) {
    pitch = Math.atan2(R21, R22) * DEG;
    yaw = Math.atan2(-R20, sy) * DEG;
    roll = Math.atan2(R10, R00) * DEG;
  } else {
    pitch = Math.atan2(-R12, R11) * DEG;
    yaw = Math.atan2(-R20, sy) * DEG;
    roll = 0;
  }

  return { pitch, yaw, roll };
}

/**
 * ランドマークのみから簡易姿勢推定（変換行列がない場合のフォールバック）
 */
export function estimatePoseFromLandmarks(
  landmarks: { x: number; y: number; z: number }[],
): HeadPose {
  // 鼻先(1) と 額(10) と 顎(152) の相対位置から推定
  const noseTip = landmarks[1];
  const forehead = landmarks[10];
  const chin = landmarks[152];
  const leftEar = landmarks[234];
  const rightEar = landmarks[454];

  if (!noseTip || !forehead || !chin || !leftEar || !rightEar) {
    return { pitch: 0, yaw: 0, roll: 0 };
  }

  const DEG = 180 / Math.PI;

  // Yaw: 左右の耳の z 深度差
  const yaw = Math.atan2(rightEar.z - leftEar.z, rightEar.x - leftEar.x + 1e-6) * DEG;

  // Pitch: 鼻先の z と額・顎の z 中間値の差
  const midZ = (forehead.z + chin.z) / 2;
  const pitch = Math.atan2(noseTip.z - midZ, 0.15) * DEG;

  // Roll: 左右の耳の y 差
  const roll = Math.atan2(rightEar.y - leftEar.y, rightEar.x - leftEar.x) * DEG;

  return { pitch, yaw, roll };
}

/**
 * 姿勢を評価してステータスを返す
 */
export function assessPose(
  matrix: Float32Array | null,
  landmarks: { x: number; y: number; z: number }[] | null,
): PoseAssessment {
  let pose: HeadPose | null = null;

  if (matrix && matrix.length >= 16) {
    pose = extractHeadPose(matrix);
  } else if (landmarks && landmarks.length >= 478) {
    pose = estimatePoseFromLandmarks(landmarks);
  }

  if (!pose) {
    return { status: "unstable", pose: null, message: "姿勢を検出できませんでした" };
  }

  const absPitch = Math.abs(pose.pitch);
  const absYaw = Math.abs(pose.yaw);
  const absRoll = Math.abs(pose.roll);

  // NG 判定
  if (absPitch > UNSTABLE_PITCH || absYaw > UNSTABLE_YAW || absRoll > UNSTABLE_ROLL) {
    const msgs: string[] = [];
    if (absPitch > UNSTABLE_PITCH) msgs.push(pose.pitch > 0 ? "顔を上げてください" : "顔を下げてください");
    if (absYaw > UNSTABLE_YAW) msgs.push(pose.yaw > 0 ? "右を向きすぎています" : "左を向きすぎています");
    if (absRoll > UNSTABLE_ROLL) msgs.push("頭の傾きを直してください");
    return { status: "ng", pose, message: msgs.join("。") };
  }

  // Unstable 判定
  if (absPitch > OK_PITCH || absYaw > OK_YAW || absRoll > OK_ROLL) {
    return { status: "unstable", pose, message: "もう少し正面を向いてください" };
  }

  return { status: "ok", pose, message: "正面を向いています" };
}
