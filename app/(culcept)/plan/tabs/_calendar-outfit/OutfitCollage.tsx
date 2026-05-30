/**
 * Outfit Card Visual Redesign V1.5 — styling board（presentational pure）
 *
 * 役割:
 *   - コーデアイテムを「横並び商品列」ではなく、 少し重なって組まれた 1 枚のコーデ
 *     （styling board）として描く。 配置は outfitCollagePlacement の純関数に委譲。
 *   - 各アイテムは absolute 配置 + z-index + 軽い回転 + drop-shadow（OutfitItemView floating）。
 *
 * レイアウト:
 *   - board は **縦長（portrait）**。 幅は親（カード内パネル）に追従し、 高さは aspect-ratio で決まる。
 *   - アイテムは **board 幅に対する %** で寸法・配置（正方ボックス＋object-contain）。
 *     → 幅が変わっても外接箱の収まり（横:左右1/9・縦:上下1/5 余白目安）が崩れない。
 *
 * 不変原則:
 *   - presentational pure。 副作用 / 現在時刻 / network / DB なし。
 *   - withImage / placeholder / missing いずれも同じ board 上に配置（fallback でも破綻しない）。
 */

import type { CalendarOutfitItemVM } from "./types";
import { OutfitItemView, toOutfitItemAsset } from "./OutfitItemView";
import { collagePlacements } from "./outfitCollagePlacement";

/** board のアスペクト比。 横長めで高さを抑え（ボードを一回り小さく）、 縦配置のまま服が面を使い切るように。 */
const BOARD_ASPECT = { active: "4 / 3", inactive: "4 / 3" } as const;

export function OutfitCollage({
  items,
  active,
}: {
  items: ReadonlyArray<CalendarOutfitItemVM>;
  active: boolean;
}) {
  if (items.length === 0) return null;
  const placements = collagePlacements(items);

  return (
    <div
      className="relative mx-auto w-full overflow-visible"
      style={{ aspectRatio: active ? BOARD_ASPECT.active : BOARD_ASPECT.inactive }}
      data-testid="plan-calendar-outfit-collage"
    >
      {items.map((item, i) => {
        const p = placements[i];
        if (!p) return null;
        return (
          <div
            key={item.id}
            className="absolute"
            style={{
              left: `${p.leftPct}%`,
              top: `${p.topPct}%`,
              width: `${p.scale * 100}%`,
              aspectRatio: "1 / 1",
              zIndex: p.z,
              transform: `translate(-50%, -50%) rotate(${p.rotateDeg}deg)`,
            }}
          >
            <OutfitItemView asset={toOutfitItemAsset(item)} fill floating />
          </div>
        );
      })}
    </div>
  );
}
