"use client";

/**
 * V2a — 描画時 cutout フック（既存 removeBackground を再利用・read-only・保存なし）
 *
 * 役割:
 *   - wardrobe 画像 (data URL) を **描画時にだけ** client-side で背景除去し、 成功すれば cutout を返す。
 *   - 失敗 / 処理中 / 非対応は **元画像にフォールバック**（null を返し、 呼び出し側が src ?? original）。
 *
 * 厳守:
 *   - 既存 `@/app/my-style/_lib/backgroundRemoval` を **dynamic import**（重い canvas 実装を static
 *     bundle / SSR に載せない）。 My-Style 側は一切変更しない。
 *   - **保存しない**（localStorage / IndexedDB / server / wardrobe item いずれも）。 session cache のみ。
 *   - ブラウザ + `data:` URL のときだけ実行。 SSR / node / 非 data URL では何もしない。
 *   - 品質ゲート: confidence >= しきい値のときだけ cutout を採用（除去し過ぎ/しなさ過ぎを弾く）。
 */

import { useEffect, useState } from "react";

import { getCachedCutout, setCachedCutout } from "./cutoutImageCache";

/** confidence がこの値未満なら cutout を採用しない（元画像のまま）。 0.3 = 除去 <10% or >90% の失敗系。 */
const MIN_CONFIDENCE = 0.5;

async function dataUrlToFile(dataUrl: string): Promise<File | null> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], "wardrobe.png", { type: blob.type || "image/png" });
  } catch {
    return null;
  }
}

/**
 * src（data URL）に対する cutout を返す。 未取得 / 失敗 / 非対応では null（= 元画像を使う）。
 */
export function useCutoutImage(src: string | null | undefined): string | null {
  const [cutout, setCutout] = useState<string | null>(() =>
    src ? getCachedCutout(src) : null,
  );

  useEffect(() => {
    if (!src) {
      setCutout(null);
      return;
    }
    const cached = getCachedCutout(src);
    if (cached) {
      setCutout(cached);
      return;
    }
    // ブラウザ + data URL のときだけ処理（SSR / node / 外部 URL はスキップ）。
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (!src.startsWith("data:")) return;

    let cancelled = false;
    void (async () => {
      try {
        const file = await dataUrlToFile(src);
        if (cancelled || !file) return;
        const mod = await import("@/app/my-style/_lib/backgroundRemoval");
        const result = await mod.removeBackground(file);
        if (cancelled) return;
        if (result && result.processedUrl && result.confidence >= MIN_CONFIDENCE) {
          setCachedCutout(src, result.processedUrl);
          setCutout(result.processedUrl);
        }
        // confidence 不足 / 失敗 → cutout は null のまま（元画像にフォールバック）。
      } catch {
        // 背景除去失敗 → 元画像にフォールバック（UI を壊さない）。
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [src]);

  return cutout;
}
