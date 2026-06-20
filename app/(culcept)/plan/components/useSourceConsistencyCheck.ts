"use client";

/**
 * SR A4-2b（client hook）— review 画面で source-cell consistency を算出する小 hook。
 *
 * 役割: imageSrc + geometry + cells + blankDays から、**空欄セル(rawCode="")だけ**の原稿 content を
 *   canvas で読み（defaultCanvasReader）、pure `computeSourceConsistencyMismatches` で P1 不一致を算出する。
 *   **warning UI は出さない（A4-3）**。本 hook は transient な structured hint を返すだけ。
 *
 * 安全（CEO/GPT A4-2b 指示の実装ガード）:
 *   - imageSrc/geometry/blank なし → 何もしない（pure 側 dormant）。
 *   - image load 失敗 / getImageData throw / canvas taint → **fail-open**（reader が空で resolve・reject しない）。
 *   - **stale async 破棄**（reqId）・**unmount 後 setState しない**（mountedRef）・**debounce**（既定 250ms）。
 *   - 戻り値は structured hint のみ。raw 画像/base64 を state に持たず、save payload に混ぜない。
 *
 * canvas は DI（reader 引数）。jsdom では fake reader を渡してロジックを検証できる。
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { readSourceCellContent } from "@/lib/plan/shift/sourceCellContentReadout";
import {
  computeSourceConsistencyMismatches,
  type SourceCellScoreReader,
} from "@/lib/plan/shift/sourceConsistencyReadout";
import type { SourceMismatchHint } from "@/lib/plan/shift/sourceCellConsistency";
import type { ShiftGridGeometry } from "@/lib/plan/shift/shiftGridGeometry";

/** 既定 reader: 原稿画像を canvas に geometry 空間で描画し、各 blank セル領域の content を A4-2a で読む。 */
export const defaultCanvasReader: SourceCellScoreReader = (imageSrc, geometry, targets) =>
  new Promise((resolve) => {
    try {
      if (typeof document === "undefined" || !imageSrc || !geometry || targets.length === 0) {
        resolve([]);
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.floor(geometry.imageWidth));
          canvas.height = Math.max(1, Math.floor(geometry.imageHeight));
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) {
            resolve([]);
            return;
          }
          // geometry 空間へスケール描画 → region 座標が直接対応
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const out: { day: number; score: number }[] = [];
          for (const t of targets) {
            try {
              const r = t.region;
              const x = Math.max(0, Math.min(Math.floor(r.x), canvas.width - 1));
              const y = Math.max(0, Math.min(Math.floor(r.y), canvas.height - 1));
              const w = Math.max(1, Math.min(Math.floor(r.width), canvas.width - x));
              const h = Math.max(1, Math.min(Math.floor(r.height), canvas.height - y));
              const imageData = ctx.getImageData(x, y, w, h); // taint → throw → per-cell fail-open
              const readout = readSourceCellContent(
                { data: imageData.data, width: imageData.width, height: imageData.height },
                { x: 0, y: 0, width: imageData.width, height: imageData.height }
              );
              out.push({ day: t.day, score: readout.score });
            } catch {
              // per-cell fail-open: skip（該当 day は欠落 → 呼び元で score 0 扱い）
            }
          }
          resolve(out);
        } catch {
          resolve([]); // fail-open
        }
      };
      img.onerror = () => resolve([]); // fail-open（load 失敗）
      img.src = imageSrc;
    } catch {
      resolve([]); // fail-open
    }
  });

export interface UseSourceConsistencyCheckInput {
  imageSrc?: string;
  geometry?: ShiftGridGeometry;
  cells: ReadonlyArray<{ day: number; rawCode: string }>;
  blankDays: readonly number[];
}

/**
 * source-cell consistency（P1: 空欄だが原稿に content）を算出して返す（transient・warning 非表示）。
 * geometry/imageSrc/cells/blankDays 変更で（debounce 後）再計算。stale/unmount を破棄。
 */
export function useSourceConsistencyCheck(
  input: UseSourceConsistencyCheckInput,
  reader: SourceCellScoreReader = defaultCanvasReader,
  debounceMs = 250
): SourceMismatchHint[] {
  const { imageSrc, geometry, cells, blankDays } = input;
  const [mismatches, setMismatches] = useState<SourceMismatchHint[]>([]);
  const reqIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const geometryKey = geometry
    ? `${geometry.gridLeft},${geometry.colWidth},${geometry.imageWidth},${geometry.imageHeight},${geometry.cropTop},${geometry.cropHeight}`
    : "";
  const cellsKey = useMemo(() => cells.map((c) => `${c.day}:${c.rawCode}`).join("|"), [cells]);
  const blankDaysKey = useMemo(() => [...blankDays].join(","), [blankDays]);

  useEffect(() => {
    const reqId = reqIdRef.current + 1;
    reqIdRef.current = reqId;
    const timer = setTimeout(() => {
      computeSourceConsistencyMismatches({ imageSrc, geometry, cells, blankDays }, reader)
        .then((hints) => {
          if (mountedRef.current && reqIdRef.current === reqId) setMismatches(hints);
        })
        .catch(() => {
          if (mountedRef.current && reqIdRef.current === reqId) setMismatches([]);
        });
    }, debounceMs);
    return () => clearTimeout(timer);
    // cells/geometry/blankDays は安定キー(*Key)経由で監視（参照不安定を回避）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSrc, geometryKey, cellsKey, blankDaysKey, reader, debounceMs]);

  return mismatches;
}
