/**
 * Slice 2 (Option A) — flat-lay 1 アイテムの **表示アセット器** (presentational pure)
 *
 * 役割:
 *   - 1 アイテムを 3 状態 (withImage / placeholder / missing) のいずれかとして安全に描く。
 *   - 呼び出し側 (OutfitCard) は状態を意識しない。 ここが分岐を吸収する。
 *
 * 設計意図 (CEO/GPT Option A):
 *   - 「画像がなくても破綻しない、 画像が来たら一気に強くなる」 器。
 *   - 実アイテム画像 (WardrobeItem.imageUrl) が来たら withImage で表示。
 *   - 画像が無く形 + 色が分かるうちは、 既存 SVG シルエットを **高品質プレースホルダー**として継続。
 *   - 画像も形も不明なら、 中立シルエット (ハンガー) で静かに穴埋め (煽らない)。
 *
 * 不変原則:
 *   - presentational pure。 副作用 / 現在時刻参照 / network / DB なし。
 *   - 実画像の外部取得はしない (src を受け取って描くだけ)。
 *   - アクセシビリティはこの器が担保する (実画像 = alt / 装飾 SVG = aria-hidden + sr-only)。
 */

import type { CalendarOutfitItemAsset, OutfitItemAssetSource } from "./types";
import { OutfitItemSilhouette } from "./OutfitItemSilhouette";

/**
 * 緩い入力 (`OutfitItemAssetSource`) → 3 状態アセットへの **純粋写像**。
 *
 *   - imageUrl があれば         → withImage
 *   - 画像は無いが shape+color  → placeholder (SVG シルエット)
 *   - どちらも無ければ          → missing (中立シルエット)
 *
 * 現行 mock の item (shape + color 必須、 imageUrl なし) は常に placeholder へ落ちるため、
 * 既存の見た目は一切変わらない。 将来の実 wardrobe item (画像のみ / 情報欠損あり) も同じ
 * 写像で 3 状態へ分岐する (= カード側を作り直さない)。
 */
export function toOutfitItemAsset(source: OutfitItemAssetSource): CalendarOutfitItemAsset {
  const category = source.category && source.category.length > 0 ? source.category : undefined;

  if (source.imageUrl && source.imageUrl.length > 0) {
    return {
      kind: "withImage",
      id: source.id,
      label: source.label,
      category: category ?? "",
      imageUrl: source.imageUrl,
      ...(source.color ? { colorHint: source.color } : {}),
    };
  }

  if (source.shape && source.color) {
    return {
      kind: "placeholder",
      id: source.id,
      label: source.label,
      category: category ?? "",
      shape: source.shape,
      color: source.color,
    };
  }

  return {
    kind: "missing",
    id: source.id,
    label: source.label,
    ...(category ? { category } : {}),
  };
}

/** スクリーンリーダ向けのアイテム説明 (カテゴリがあれば括弧で添える) */
function itemA11yText(label: string, category?: string): string {
  return category && category.length > 0 ? `${label}（${category}）` : label;
}

/** missing 状態の中立シルエット (ハンガー)。 警告色は使わず、 穏やかなニュートラルで穴埋めする。 */
function MissingTile({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="46" height="46" rx="13" fill="#eef1f5" />
      {/* フック */}
      <path
        d="M32 24 v-2.4 a2.8 2.8 0 1 0 -2.8 -2.8"
        fill="none"
        stroke="#aeb7c4"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* 肩 + バー (ハンガー本体) */}
      <path
        d="M32 24 L18.5 35.5 H45.5 Z"
        fill="none"
        stroke="#aeb7c4"
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** floating（styling board 上）の柔らかい影。 背景つき写真でも「置かれている」感を出す。 */
const FLOAT_SHADOW = "[filter:drop-shadow(0_8px_16px_rgba(76,29,149,0.22))]";

export function OutfitItemView({
  asset,
  size,
  floating = false,
}: {
  asset: CalendarOutfitItemAsset;
  size: number;
  /**
   * styling board 上の floating 表示（V1）。
   *   - 枠を弱め（frameless 寄り）、 柔らかい drop-shadow を付け、 コラージュとして「置かれた」感を出す。
   *   - 背景つき写真を CSS で無理に切り抜かない（mix-blend は使わない）。 配置と影で「組まれた」感を出す。
   */
  floating?: boolean;
}) {
  switch (asset.kind) {
    case "withImage":
      return (
        // 実アイテム画像は localStorage / IndexedDB 由来の data URL になり得るため、
        // next/image ではなく素の <img> を使う (リポジトリ既定の慣習)。
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={asset.imageUrl}
          alt={itemA11yText(asset.label, asset.category)}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          className={
            floating ? `rounded-xl object-contain ${FLOAT_SHADOW}` : "rounded-2xl object-contain"
          }
          style={{ width: size, height: size }}
        />
      );

    case "placeholder":
      return (
        <span className={floating ? `inline-block ${FLOAT_SHADOW}` : undefined}>
          <OutfitItemSilhouette shape={asset.shape} color={asset.color} size={size} />
          <span className="sr-only">{itemA11yText(asset.label, asset.category)}</span>
        </span>
      );

    case "missing":
    default:
      return (
        <span className={floating ? `inline-block ${FLOAT_SHADOW}` : undefined}>
          <MissingTile size={size} />
          <span className="sr-only">{itemA11yText(asset.label, asset.category)}（画像準備中）</span>
        </span>
      );
  }
}
