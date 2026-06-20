"use client";

/**
 * SR A4 visual smoke — dev preview client（合成 fixture で ShiftReviewGrid を描画）
 *
 * 合成画像は **runtime に canvas → Blob → ObjectURL** で生成（commit しない・base64 直書きしない）。
 * unmount で ObjectURL を revoke。保存は **saveEnabled=false**（保存導線を出さない）。
 * positive な warning 発火は実ブラウザ（V-2 Playwright）で確認する。
 */

import { useEffect, useRef, useState } from "react";

import { ShiftReviewGrid } from "../components/ShiftReviewGrid";
import { HARADA_SPRIX_DICTIONARY } from "@/lib/plan/shift/shiftCodeDictionary";
import {
  A4_SMOKE_CELLS,
  A4_SMOKE_GEOMETRY,
  drawA4SmokeImage,
} from "./a4SmokeFixture";

export function DevA4SmokeClient() {
  const [imageSrc, setImageSrc] = useState<string | undefined>(undefined);
  const urlRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const canvas = document.createElement("canvas");
    canvas.width = A4_SMOKE_GEOMETRY.imageWidth;
    canvas.height = A4_SMOKE_GEOMETRY.imageHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      drawA4SmokeImage(ctx);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setImageSrc(url);
      });
    }
    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = undefined;
      }
    };
  }, []);

  return (
    <div className="p-4" data-testid="a4-smoke-preview">
      <h1 className="mb-2 text-sm font-semibold text-gray-700">
        A4 visual smoke（dev preview・合成 fixture・保存無効）
      </h1>
      <p className="mb-3 text-[11px] text-gray-400">
        空欄セル（day {3}）の原稿位置に content を置いた合成画像。source mismatch warning と cell amber の発火を確認する。
      </p>
      <ShiftReviewGrid
        cells={A4_SMOKE_CELLS}
        dictionary={HARADA_SPRIX_DICTIONARY}
        monthLabel="A4 smoke"
        year={2025}
        month={7}
        imageSrc={imageSrc}
        geometry={A4_SMOKE_GEOMETRY}
        saveEnabled={false}
      />
    </div>
  );
}
