/**
 * Outfit Card Visual Redesign V1 — styling board（presentational pure）
 *
 * 役割:
 *   - コーデアイテムを「横並び商品列」ではなく、 少し重なって組まれた 1 枚のコーデ
 *     （styling board）として描く。 配置は outfitCollagePlacement の純関数に委譲。
 *   - 各アイテムは absolute 配置 + z-index + 軽い回転 + drop-shadow（OutfitItemView floating）。
 *
 * 不変原則:
 *   - presentational pure。 副作用 / 現在時刻 / network / DB なし。
 *   - withImage / placeholder / missing いずれも同じ board 上に配置（fallback でも破綻しない）。
 */

import type { CalendarOutfitItemVM } from "./types";
import { OutfitItemView, toOutfitItemAsset } from "./OutfitItemView";
import { collagePlacements } from "./outfitCollagePlacement";

/** board の高さ（px）。 理想画像のようにコーデがカードの主役になるよう、 active を大きめに取る。 */
const BOARD_HEIGHT = { active: 224, inactive: 148 } as const;

export function OutfitCollage({
  items,
  active,
}: {
  items: ReadonlyArray<CalendarOutfitItemVM>;
  active: boolean;
}) {
  if (items.length === 0) return null;
  const boardHeight = active ? BOARD_HEIGHT.active : BOARD_HEIGHT.inactive;
  const placements = collagePlacements(items);

  return (
    <div
      className="relative mx-auto w-full overflow-visible"
      style={{ height: boardHeight }}
      data-testid="plan-calendar-outfit-collage"
    >
      {items.map((item, i) => {
        const p = placements[i];
        if (!p) return null;
        const size = Math.round(boardHeight * p.scale);
        return (
          <div
            key={item.id}
            className="absolute"
            style={{
              left: `${p.leftPct}%`,
              top: `${p.topPct}%`,
              zIndex: p.z,
              transform: `translate(-50%, -50%) rotate(${p.rotateDeg}deg)`,
            }}
          >
            <OutfitItemView asset={toOutfitItemAsset(item)} size={size} floating />
          </div>
        );
      })}
    </div>
  );
}
