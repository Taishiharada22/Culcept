"use client";

/**
 * 原稿画像 全体表示 + 該当日ハイライト（Source Image Highlight Review）
 *
 * 設計: CEO 案（2026-05-30）+ GPT P1-2。
 * 取り込み確認カレンダーの下に元画像をそのまま乗せ、カレンダーの日を hover/tap すると
 * 元画像上の原田行・該当日セルを枠線で強調 → 周囲の文脈ごと一目で確認でき負担が減る。
 *
 * 不変原則: 純 presentational。highlightDay の bbox は calibrated grid geometry から
 *           決定論的に算出（cellCropRegion を共有）。raw 画像非依存（src は呼出側）。
 */

import { useRef, useEffect } from "react";
import {
  cellCropRegion,
  sourceColumnForDay,
  type ShiftGridGeometry,
} from "@/lib/plan/shift/shiftGridGeometry";

interface SourceImageHighlightProps {
  imageSrc: string;
  geometry: ShiftGridGeometry;
  /** ハイライトする日（null なら強調なし） */
  highlightDay: number | null;
  /** 空の日（原画像で詰められた日）。枠の列算出で空をスキップし、空の日は直前列に stay */
  blankDays?: readonly number[];
  /** 表示幅(px)。画像はこの幅に縮尺。モバイルではコンテナ幅を超え横スクロール */
  displayWidth?: number;
  /** 校正用: 日数を渡すと全列の境界線（gridLeft + i*colWidth, i=0..dayCount）を重ねる。 */
  gridDayCount?: number;
}

export function SourceImageHighlight({
  imageSrc,
  geometry,
  highlightDay,
  blankDays = [],
  displayWidth = 600,
  gridDayCount,
}: SourceImageHighlightProps) {
  const scale = displayWidth / geometry.imageWidth;
  const displayHeight = Math.round(geometry.imageHeight * scale);
  const scrollRef = useRef<HTMLDivElement>(null);

  const box =
    highlightDay != null
      ? (() => {
          const r = cellCropRegion(
            geometry,
            sourceColumnForDay(highlightDay, blankDays)
          );
          return {
            left: r.x * scale,
            top: r.y * scale,
            width: r.width * scale,
            height: r.height * scale,
          };
        })()
      : null;

  // ハイライト位置が画面外なら横スクロールで寄せる
  useEffect(() => {
    if (box && scrollRef.current) {
      const el = scrollRef.current;
      const target = box.left + box.width / 2 - el.clientWidth / 2;
      el.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
    }
  }, [box]);

  return (
    <div className="mt-3">
      <p className="mb-1 text-[11px] text-gray-500">
        原稿（日をタップ/ホバーすると該当セルが光ります）
      </p>
      <div
        ref={scrollRef}
        data-testid="source-image-highlight"
        className="overflow-x-auto rounded-xl border border-white/60 bg-white/40 backdrop-blur"
      >
        <div className="relative" style={{ width: displayWidth, height: displayHeight }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt="原稿シフト表"
            width={displayWidth}
            height={displayHeight}
            className="block select-none"
            draggable={false}
          />
          {box && (
            <div
              data-testid="source-image-highlight-box"
              className="pointer-events-none absolute rounded-sm ring-2 ring-emerald-500 bg-emerald-400/20 transition-all"
              style={{
                left: box.left,
                top: box.top,
                width: box.width,
                height: box.height,
              }}
            />
          )}
          {/* 校正用: 全列境界線（gridLeft + i*colWidth）。全列が原稿の列に合えば geometry 正確。 */}
          {gridDayCount != null &&
            Array.from({ length: gridDayCount + 1 }, (_, i) => {
              const x = (geometry.gridLeft + i * geometry.colWidth) * scale;
              if (x < -0.5 || x > displayWidth + 0.5) return null;
              return (
                <div
                  key={i}
                  data-testid="source-image-grid-line"
                  className="pointer-events-none absolute inset-y-0 w-px bg-sky-500/70"
                  style={{ left: x }}
                />
              );
            })}
        </div>
      </div>
    </div>
  );
}
