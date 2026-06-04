/**
 * buildShiftGridGeometry — S-geo-1: assisted 入力から ShiftGridGeometry を決定論的に算出する pure helper
 *
 * 設計: docs/alter-plan-s-geo-geometry-calibration-readiness.md / S-geo-1（CEO 2026-06-05）。
 *
 * 背景: `AssistedRowSelection` は Y 帯（headerBand/personRowBand）+ imageW/H のみ捕捉し X を持たない。
 *   固定 fixture `HARADA_SPRIX_JULY_GEOMETRY` は July SPRIX 専用の手動 calibration。
 *   任意画像で照合枠を出すには、ユーザーが指定した **day1 列中心 / 月末日 列中心** + 月日数 から
 *   gridLeft/colWidth を逆算する（VLM bbox 不使用・決定論・案A-1）。
 *
 * 算出（CEO 確定 2026-06-05）:
 *   colWidth = (lastDayCenterX - firstDayCenterX) / (dayCount - 1)
 *   gridLeft = firstDayCenterX - colWidth / 2
 *   cropTop/cropHeight は **personRowBand 由来**（headerBand は将来の UI 説明/検証用・任意）。
 *
 * 不変原則: **pure**（IO / canvas / DOM / Date / random / env なし・同入力同出力）。throw しない（ok/issues）。
 *   **過剰に丸めない**（float 維持。HARADA は colWidth=51.5）。raw 画像非依存（数値座標のみ）。
 *
 * 注（独立補正・evidence 付）: 「最終列右端 ≤ imageW」を strict にすると実 HARADA を弾く
 *   （gridLeft+colWidth*dayCount = lastDayCenterX + colWidth/2 = 1871.5 > imageW=1860）。
 *   day 中心が画像内なら overflow は ≤ colWidth/2 で cellCropRegion の clamp が吸収するため、
 *   **半列 + float の端数を許容**し、明らかに画像外の gross overflow のみ invalid とする。
 */

import type { ShiftGridGeometry } from "./shiftGridGeometry";

/** day1中心 + 月末日中心 + personRow帯 + 寸法（X capture UI の出力契約・S-geo-2 で UI が満たす）。 */
export interface ShiftGridGeometryInput {
  /** 原画像 px 幅 */
  imageW: number;
  /** 原画像 px 高さ */
  imageH: number;
  /** 本人行帯（cropTop/cropHeight の由来）。top < bottom。 */
  personRowBand: { top: number; bottom: number };
  /** 対象月の日数（28–31）。 */
  dayCount: number;
  /** day1（=1 日）列の中心 x（px・ヘッダ数字基準）。 */
  firstDayCenterX: number;
  /** 月末日（=dayCount 日）列の中心 x（px・ヘッダ数字基準）。 */
  lastDayCenterX: number;
  /** 任意: 日付ヘッダ帯（将来の UI 説明/検証用。cropTop/Height には使わない）。 */
  headerBand?: { top: number; bottom: number };
}

/** validation issue（field + 人間可読メッセージ・raw を含まない）。 */
export interface GeometryIssue {
  field: string;
  message: string;
}

/** 算出結果。invalid なら geometry=null + issues。 */
export interface BuildShiftGridGeometryResult {
  ok: boolean;
  geometry: ShiftGridGeometry | null;
  issues: GeometryIssue[];
}

const MIN_DAYS = 28;
const MAX_DAYS = 31;
/** float 端数許容。 */
const EPS = 1e-6;

function isFiniteNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * assisted 入力（day1中心 + 月末日中心 + personRow帯 + 寸法）から ShiftGridGeometry を算出する（pure）。
 * 検証に失敗したら `{ ok:false, geometry:null, issues }` を返す（throw しない）。
 */
export function buildShiftGridGeometry(
  input: ShiftGridGeometryInput
): BuildShiftGridGeometryResult {
  const issues: GeometryIssue[] = [];
  const { imageW, imageH, personRowBand, dayCount, firstDayCenterX, lastDayCenterX } =
    input;

  // ── 1. 型・finite ガード（以降の算出が NaN にならないことを保証）──
  if (!isFiniteNum(imageW) || imageW <= 0)
    issues.push({ field: "imageW", message: "imageW must be a finite number > 0" });
  if (!isFiniteNum(imageH) || imageH <= 0)
    issues.push({ field: "imageH", message: "imageH must be a finite number > 0" });
  if (!Number.isInteger(dayCount) || dayCount < MIN_DAYS || dayCount > MAX_DAYS)
    issues.push({ field: "dayCount", message: `dayCount must be an integer ${MIN_DAYS}–${MAX_DAYS}` });
  if (!personRowBand || !isFiniteNum(personRowBand.top) || !isFiniteNum(personRowBand.bottom))
    issues.push({ field: "personRowBand", message: "personRowBand.top/bottom must be finite numbers" });
  if (!isFiniteNum(firstDayCenterX) || !isFiniteNum(lastDayCenterX))
    issues.push({ field: "dayCenterX", message: "firstDayCenterX/lastDayCenterX must be finite numbers" });

  if (issues.length) return { ok: false, geometry: null, issues };

  // ── 2. 範囲・順序ガード（数値は finite 確定済）──
  if (!(personRowBand.top < personRowBand.bottom))
    issues.push({ field: "personRowBand", message: "top must be < bottom" });
  if (personRowBand.top < -EPS || personRowBand.bottom > imageH + EPS)
    issues.push({ field: "personRowBand", message: "must lie within [0, imageH]" });
  if (!(firstDayCenterX < lastDayCenterX))
    issues.push({ field: "dayCenterX", message: "firstDayCenterX must be < lastDayCenterX" });
  if (firstDayCenterX < -EPS || firstDayCenterX > imageW + EPS)
    issues.push({ field: "firstDayCenterX", message: "must lie within [0, imageW]" });
  if (lastDayCenterX < -EPS || lastDayCenterX > imageW + EPS)
    issues.push({ field: "lastDayCenterX", message: "must lie within [0, imageW]" });

  if (issues.length) return { ok: false, geometry: null, issues };

  // ── 3. 算出（float 維持・過剰に丸めない）──
  const colWidth = (lastDayCenterX - firstDayCenterX) / (dayCount - 1);
  const gridLeft = firstDayCenterX - colWidth / 2;
  const cropTop = personRowBand.top;
  const cropHeight = personRowBand.bottom - personRowBand.top;

  // ── 4. 派生ガード ──
  if (!(colWidth > 0))
    issues.push({ field: "colWidth", message: "colWidth must be > 0" });
  if (gridLeft < -EPS)
    issues.push({ field: "gridLeft", message: "gridLeft must be >= 0" });
  // 最終列右端 = lastDayCenterX + colWidth/2。day 中心が画像内なら overflow ≤ colWidth/2（clamp 吸収）。
  // strict（<= imageW）は実 HARADA を弾くため、半列 + float の端数を許容し gross overflow のみ reject。
  if (gridLeft + colWidth * dayCount > imageW + colWidth / 2 + 1)
    issues.push({ field: "gridExtent", message: "grid extends clearly outside the image" });

  if (issues.length) return { ok: false, geometry: null, issues };

  const geometry: ShiftGridGeometry = {
    imageWidth: imageW,
    imageHeight: imageH,
    gridLeft,
    colWidth,
    cropTop,
    cropHeight,
  };
  return { ok: true, geometry, issues: [] };
}
