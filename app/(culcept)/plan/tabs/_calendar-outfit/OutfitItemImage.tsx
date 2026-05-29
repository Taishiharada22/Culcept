"use client";

/**
 * V2a — wardrobe 画像 1 枚（描画時 cutout 対応）
 *
 *   - useCutoutImage が成功すれば背景除去済み画像を、 それ以外は元画像をそのまま表示。
 *   - 保存はしない（session cache のみ）。 UI を壊さないフォールバック最優先。
 *   - hook を使うため client component として OutfitItemView の withImage から切り出す
 *     （OutfitItemView 本体は presentational のまま保つ）。
 */

import { useCutoutImage } from "./useCutoutImage";

export function OutfitItemImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className: string;
}) {
  const cutout = useCutoutImage(src);
  return (
    // data URL（localStorage / IndexedDB 由来）なので next/image ではなく素の <img>。
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cutout ?? src}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={className}
    />
  );
}
