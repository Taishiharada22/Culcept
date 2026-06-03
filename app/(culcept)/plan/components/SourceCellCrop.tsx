/**
 * 原稿セル crop 表示（calibrated grid geometry から算出した領域を切り出して表示）
 *
 * 設計書: docs/alter-plan-shift-import-cell-review-readiness.md §2
 *
 * VLM bbox でなく、CropRegion（元画像 px 座標）を background-position で切り出す。
 * 純粋 presentational。imageSrc が無い場合は呼び出し側で placeholder を出す。
 */

import type { CSSProperties } from "react";
import type { CropRegion } from "@/lib/plan/shift/shiftGridGeometry";

interface SourceCellCropProps {
  imageSrc: string;
  imageWidth: number;
  imageHeight: number;
  region: CropRegion;
  /** 表示幅(px)。crop 縦横比を保って高さを算出 */
  displayWidth?: number;
}

export function SourceCellCrop({
  imageSrc,
  imageWidth,
  imageHeight,
  region,
  displayWidth = 76,
}: SourceCellCropProps) {
  const scale = region.width > 0 ? displayWidth / region.width : 1;
  const displayHeight = Math.round(region.height * scale);

  const style: CSSProperties = {
    width: displayWidth,
    height: displayHeight,
    overflow: "hidden",
    backgroundImage: `url(${imageSrc})`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: `-${region.x * scale}px -${region.y * scale}px`,
    backgroundSize: `${imageWidth * scale}px ${imageHeight * scale}px`,
  };

  return (
    <div
      data-testid="source-cell-crop"
      role="img"
      aria-label="原稿の該当セル"
      className="shrink-0 rounded-lg border border-gray-300 shadow-sm"
      style={style}
    />
  );
}
