"use client";

/**
 * wardrobe 画像 1 枚（C1L hotfix: 描画時の背景除去を廃止）
 *
 *   - 以前は描画時に背景除去フックを呼び、 旧アルゴリズム（O(n²) flood-fill・同期）を実行していたが、
 *     これが main thread をブロックし /plan を固まらせる主因だったため **除去**（freeze root-cause audit 確定）。
 *   - 背景透過は登録時（My-Style）に生成・保存され、 /plan は getWardrobeDisplayImageUrl 経由で
 *     確定済み透過画像（cutoutStatus=success）を src として受け取る。 ここでは **src をそのまま表示**し、 再処理しない。
 *   - data URL（透過済み / 原画）も外部 URL もそのまま <img> に渡す。
 */

export function OutfitItemImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={className}
    />
  );
}
