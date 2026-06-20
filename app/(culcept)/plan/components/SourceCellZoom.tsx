/**
 * 原稿の該当セル拡大表示（Source Cell Zoom）— S-geo-3-1 / 3-1b（SourceCellCrop 合成）
 *
 * 設計: docs/alter-plan-s-geo-3-source-cell-zoom-readiness.md（CEO 案A・2026-06-05）。
 * 巨大なフル表に極小枠ではなく、hover/tap した日の **source セルを crop して拡大**し、
 * 太枠で囲って「参照元」を四角く強調する。
 *
 * 責務（CEO Option A・reuse）:
 *   - **crop の実描画は既存 SourceCellCrop に委譲**（background-image crop プリミティブを再利用・技法を一本化）。
 *   - SourceCellZoom は「viewRegion（セル + 文脈）を決める / 拡大幅を渡す / 太枠を重ねる」に限定。
 *
 * 不変原則: 純 presentational（hooks/state/effect なし）。crop region は
 *   cellCropRegion + sourceColumnForDay（packing 補正）を共有。canvas / 画像生成 / base64 を作らない。
 *   VLM / DB / save に触れない。
 */

import {
  cellCropRegion,
  sourceColumnForDay,
  type CropRegion,
  type ShiftGridGeometry,
} from "@/lib/plan/shift/shiftGridGeometry";
import { SourceCellCrop } from "./SourceCellCrop";

interface SourceCellZoomProps {
  /** 原画像（ObjectURL 等）。欠ければ非表示。 */
  imageSrc?: string;
  /** calibrated grid geometry。欠ければ非表示。 */
  geometry?: ShiftGridGeometry;
  /** 拡大表示する日（null/undefined なら非表示）。 */
  day: number | null;
  /** 空の日（原画像で詰められた日）。列写像で空をスキップ（packing 補正）。 */
  blankDays?: readonly number[];
  /** 表示幅(px)。crop はこの幅に拡大。 */
  displayWidth?: number;
}

/**
 * 該当セルの左右/上下に見せる文脈（セル幅・高さ比）。
 * 広めに取り、2点校正の線形ドリフト（±1列程度）でも該当セルが視野に残るようにする。
 */
const CONTEXT_X = 1.5;
const CONTEXT_Y = 0.8;
/** パネル最大高さ(px)。倍率を上限で頭打ちし、縦長ストリップ/過剰拡大を防ぐ（有界ボックス）。幅は displayWidth。 */
const MAX_PANEL_H = 200;

export function SourceCellZoom({
  imageSrc,
  geometry,
  day,
  blankDays = [],
  displayWidth = 280,
}: SourceCellZoomProps) {
  // fail-soft: 必須が欠けたら非表示（確認画面は壊さない）。
  if (!imageSrc || !geometry || day == null) return null;

  // packing 補正済の列 → 原画像 px の該当セル矩形。
  const col = sourceColumnForDay(day, blankDays);
  const cell = cellCropRegion(geometry, col);

  // view 矩形（セル + 最小文脈）を原画像範囲に clamp。
  const marginX = cell.width * CONTEXT_X;
  const marginY = cell.height * CONTEXT_Y;
  const vx = Math.max(0, cell.x - marginX);
  const vy = Math.max(0, cell.y - marginY);
  const vw = Math.min(geometry.imageWidth - vx, cell.width + 2 * marginX);
  const vh = Math.min(geometry.imageHeight - vy, cell.height + 2 * marginY);
  if (!(vw > 0) || !(vh > 0)) return null;

  const viewRegion: CropRegion = { x: vx, y: vy, width: vw, height: vh };
  // 有界ボックスに fit（幅 displayWidth / 高さ MAX_PANEL_H の小さい方で頭打ち）→ 過剰拡大・縦長を防ぐ。
  const scale = Math.min(displayWidth / vw, MAX_PANEL_H / vh);
  const effW = Math.round(vw * scale); // 実表示幅（高さ上限で頭打ちした分縮む）

  // cell を view 内の表示座標へ写像（太枠の位置）。SourceCellCrop と同 scale。
  const frame = {
    left: (cell.x - vx) * scale,
    top: (cell.y - vy) * scale,
    width: cell.width * scale,
    height: cell.height * scale,
  };

  return (
    <div
      className="mt-3"
      data-testid="source-cell-zoom"
      data-source-col={col}
      data-source-day={day}
    >
      <p className="mb-1 text-[11px] text-gray-500">原稿の該当セル（拡大）</p>
      <div className="relative inline-block">
        {/* crop の実描画は既存プリミティブに委譲（view 範囲を拡大幅で切り出し）。 */}
        <SourceCellCrop
          imageSrc={imageSrc}
          imageWidth={geometry.imageWidth}
          imageHeight={geometry.imageHeight}
          region={viewRegion}
          displayWidth={effW}
        />
        {/* 太枠（現在参照しているセルを四角く強調）。crop の上に重ねる。 */}
        <div
          data-testid="source-cell-zoom-frame"
          aria-hidden="true"
          className="pointer-events-none absolute rounded-sm ring-2 ring-emerald-500 bg-emerald-400/10"
          style={{
            left: frame.left,
            top: frame.top,
            width: frame.width,
            height: frame.height,
          }}
        />
      </div>
    </div>
  );
}
