/**
 * 原稿の該当セル拡大表示（Source Cell Zoom）— S-geo-3-1
 *
 * 設計: docs/alter-plan-s-geo-3-source-cell-zoom-readiness.md（CEO 案A・2026-06-05）。
 * 巨大なフル表に極小枠ではなく、hover/tap した日の **source セルだけを crop して拡大**し、
 * 太枠で囲って「参照元」を四角く強調する。
 *
 * 不変原則: 純 presentational（hooks/state/effect なし）。calibrated grid geometry から
 *   決定論的に crop region を算出（cellCropRegion + sourceColumnForDay を共有）。
 *   **CSS の crop+zoom のみ**（canvas / 画像生成 / base64 / dataURI を作らない）。
 *   raw 画像非依存（src は呼出側の ObjectURL）。VLM / DB / save に触れない。
 */

import {
  cellCropRegion,
  sourceColumnForDay,
  type ShiftGridGeometry,
} from "@/lib/plan/shift/shiftGridGeometry";

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

/** 該当セルの左右/上下に見せる文脈（セル幅・高さ比）。最小文脈（CEO: 最初は最小）。 */
const CONTEXT_X = 0.5;
const CONTEXT_Y = 0.4;

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

  const zoom = displayWidth / vw;
  const displayHeight = Math.round(vh * zoom);

  // cell を view 内の表示座標へ写像（太枠の位置）。
  const frame = {
    left: (cell.x - vx) * zoom,
    top: (cell.y - vy) * zoom,
    width: cell.width * zoom,
    height: cell.height * zoom,
  };

  return (
    <div
      className="mt-3"
      data-testid="source-cell-zoom"
      data-source-col={col}
      data-source-day={day}
    >
      <p className="mb-1 text-[11px] text-gray-500">原稿の該当セル（拡大）</p>
      <div
        className="relative overflow-hidden rounded-xl border border-emerald-200 bg-white/50 shadow-sm"
        style={{ width: displayWidth, height: displayHeight }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt="原稿の該当セル拡大"
          draggable={false}
          className="absolute select-none"
          style={{
            left: -vx * zoom,
            top: -vy * zoom,
            width: geometry.imageWidth * zoom,
            height: geometry.imageHeight * zoom,
            maxWidth: "none",
          }}
        />
        {/* 太枠（現在参照しているセルを四角く強調） */}
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
