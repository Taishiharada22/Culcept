/**
 * Outfit Card Visual Redesign V1 — collage 配置ロジック（pure・presentational なし）
 *
 * 役割:
 *   - コーデアイテム（shape）を styling board 上の slot に写像し、
 *     各アイテムの配置（中心座標 % / 相対スケール / 回転 / z-index）を決める純関数。
 *   - 「横並び商品列」ではなく「少し重なって組まれたコーデ」に見せるための座標計算。
 *
 * 不変原則:
 *   - pure。 DOM / 副作用 / 現在時刻 / 乱数なし（テストで配置を固定する）。
 *   - 実画像でも placeholder でも同じ配置（OutfitItemView 側が描画を吸収）。
 */

import type { CalendarOutfitItemShape } from "./types";

/** styling board 上の役割スロット。 */
export type OutfitSlot = "outer" | "top" | "bottom" | "shoes" | "bag" | "accessory" | "extra";

/** 1 アイテムの配置仕様（board 正規化）。 */
export interface CollagePlacement {
  id: string;
  slot: OutfitSlot;
  /** 中心 X（board 幅に対する %） */
  leftPct: number;
  /** 中心 Y（board 高さに対する %） */
  topPct: number;
  /** アイテム一辺 = boardHeight * scale */
  scale: number;
  /** 軽い回転（度） */
  rotateDeg: number;
  z: number;
}

/** shape → slot 写像（主役/脇役の役割づけ）。 */
export function shapeToSlot(shape: CalendarOutfitItemShape): OutfitSlot {
  switch (shape) {
    case "top":
    case "blouse":
      return "top";
    case "outer":
      return "outer";
    case "bottom":
    case "skirt":
      return "bottom";
    case "shoes":
    case "heels":
      return "shoes";
    case "bag":
      return "bag";
    case "watch":
      return "accessory";
    default:
      return "extra";
  }
}

/**
 * slot ごとの基準配置（中心 %・スケール・回転・z）。
 *   - top/outer = 主役（中央上〜左寄り・大きめ）
 *   - bottom = 中央下〜右寄り（top に少し重なる）
 *   - shoes = 右下・小、 bag = 左下・小、 accessory = 右上・極小
 */
const SLOT_LAYOUT: Record<OutfitSlot, Omit<CollagePlacement, "id" | "slot">> = {
  outer: { leftPct: 32, topPct: 43, scale: 0.86, rotateDeg: -7, z: 1 },
  top: { leftPct: 46, topPct: 38, scale: 0.74, rotateDeg: -3, z: 3 },
  bottom: { leftPct: 57, topPct: 67, scale: 0.7, rotateDeg: 4, z: 2 },
  shoes: { leftPct: 78, topPct: 85, scale: 0.4, rotateDeg: 9, z: 4 },
  bag: { leftPct: 19, topPct: 79, scale: 0.46, rotateDeg: -9, z: 4 },
  accessory: { leftPct: 84, topPct: 18, scale: 0.28, rotateDeg: 7, z: 5 },
  extra: { leftPct: 50, topPct: 52, scale: 0.55, rotateDeg: 2, z: 2 },
};

const clampPct = (v: number): number => Math.min(100, Math.max(0, v));

/**
 * アイテム列 → 配置仕様列（入力順を保つ）。
 * 同一 slot が重複した場合は、 後続を少しずらして背面（低 z・小さめ）に重ねる（破綻させない）。
 */
export function collagePlacements(
  items: ReadonlyArray<{ id: string; shape: CalendarOutfitItemShape }>,
): CollagePlacement[] {
  const seen: Record<string, number> = {};
  return items.map((item) => {
    const slot = shapeToSlot(item.shape);
    const k = seen[slot] ?? 0;
    seen[slot] = k + 1;
    const base = SLOT_LAYOUT[slot];
    // 重複時のオフセット（主役系は左へ、 それ以外は右へ逃がし、 上に少し持ち上げる）。
    const dir = slot === "top" || slot === "outer" ? -1 : 1;
    const offLeft = k === 0 ? 0 : dir * 11 * k;
    const offTop = k === 0 ? 0 : -6 * k;
    return {
      id: item.id,
      slot,
      leftPct: clampPct(base.leftPct + offLeft),
      topPct: clampPct(base.topPct + offTop),
      scale: base.scale * (k === 0 ? 1 : Math.pow(0.88, k)),
      rotateDeg: base.rotateDeg + (k === 0 ? 0 : (k % 2 === 0 ? 5 : -5)),
      z: Math.max(0, base.z - k),
    };
  });
}
