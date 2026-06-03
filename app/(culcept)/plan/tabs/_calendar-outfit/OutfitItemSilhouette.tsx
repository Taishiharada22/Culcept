/**
 * Slice 1 — section ④ flat-lay の 1 アイテム SVG シルエット (presentational pure)
 *
 * CEO 制約: 実アイテム画像は使わない (「画像そのものを貼るのは禁止」)。
 *   shape + color から、服の形を想起させる SVG プレースホルダーを描く。
 *   塗りは item.color、 シーム / 留め具は控えめな暗色 stroke で表情を添える。
 *
 * 不変原則: presentational pure。 副作用 / 現在時刻参照 / I/O なし。
 */

import type { CalendarOutfitItemShape } from "./types";

/** 控えめなシーム / ディテール色 (slate-900 ~14%) */
const SEAM = "rgba(15, 23, 42, 0.14)";

function ShapePath({
  shape,
  color,
}: {
  shape: CalendarOutfitItemShape;
  color: string;
}) {
  switch (shape) {
    case "top":
      return (
        <path
          d="M24 16 Q32 20 40 16 L48 20 L56 34 L50 38 L44 28 L44 54 L20 54 L20 28 L14 38 L8 34 L16 20 Z"
          fill={color}
        />
      );
    case "blouse":
      return (
        <g>
          <path
            d="M24 16 L40 16 L48 20 L56 34 L50 38 L44 28 L44 54 L20 54 L20 28 L14 38 L8 34 L16 20 Z"
            fill={color}
          />
          <path
            d="M27 16 L32 24 L37 16"
            fill="none"
            stroke={SEAM}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <line x1="32" y1="24" x2="32" y2="52" stroke={SEAM} strokeWidth="1.4" />
          <circle cx="32" cy="33" r="1" fill={SEAM} />
          <circle cx="32" cy="42" r="1" fill={SEAM} />
        </g>
      );
    case "outer":
      return (
        <g>
          <path
            d="M24 16 L40 16 L48 20 L56 34 L50 38 L44 28 L44 54 L20 54 L20 28 L14 38 L8 34 L16 20 Z"
            fill={color}
          />
          <path
            d="M32 16 L24 27 L30 31 L32 23 L34 31 L40 27 Z"
            fill={SEAM}
            opacity="0.55"
          />
          <line x1="32" y1="23" x2="32" y2="54" stroke={SEAM} strokeWidth="1.4" />
        </g>
      );
    case "bottom":
      return (
        <path d="M22 14 L42 14 L40 54 L34 54 L32 32 L30 54 L24 54 Z" fill={color} />
      );
    case "skirt":
      return (
        <g>
          <path d="M24 18 L40 18 L48 52 L16 52 Z" fill={color} />
          <line x1="24" y1="21" x2="40" y2="21" stroke={SEAM} strokeWidth="1.4" />
          <line x1="30" y1="24" x2="26" y2="50" stroke={SEAM} strokeWidth="1" opacity="0.6" />
          <line x1="36" y1="24" x2="40" y2="50" stroke={SEAM} strokeWidth="1" opacity="0.6" />
        </g>
      );
    case "shoes":
      return (
        <g>
          <path
            d="M8 42 L8 38 Q9 30 16 28 L24 27 L30 22 Q34 21 36 24 L40 28 Q50 30 52 40 L52 42 Z"
            fill={color}
          />
          <rect x="8" y="41" width="44" height="3" rx="1.5" fill={SEAM} />
          <line x1="22" y1="30" x2="26" y2="34" stroke={SEAM} strokeWidth="1.2" />
          <line x1="28" y1="28" x2="32" y2="33" stroke={SEAM} strokeWidth="1.2" />
        </g>
      );
    case "heels":
      return (
        <g>
          <path d="M12 26 Q26 18 46 24 L48 28 Q40 34 18 34 L14 34 Z" fill={color} />
          <path d="M42 34 L47 34 L45 46 L43 46 Z" fill={color} />
        </g>
      );
    case "bag":
      return (
        <g>
          <path
            d="M22 28 Q22 16 32 16 Q42 16 42 28"
            fill="none"
            stroke={color}
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <path d="M16 28 L48 28 L46 52 L18 52 Z" fill={color} />
        </g>
      );
    case "watch":
      return (
        <g>
          <rect x="27" y="10" width="10" height="14" rx="2" fill={color} />
          <rect x="27" y="40" width="10" height="14" rx="2" fill={color} />
          <circle cx="32" cy="32" r="12" fill={color} />
          <circle cx="32" cy="32" r="8" fill="#ffffff" opacity="0.82" />
          <line x1="32" y1="32" x2="32" y2="26" stroke={SEAM} strokeWidth="1.4" strokeLinecap="round" />
          <line x1="32" y1="32" x2="36" y2="32" stroke={SEAM} strokeWidth="1.4" strokeLinecap="round" />
        </g>
      );
    default:
      return null;
  }
}

export function OutfitItemSilhouette({
  shape,
  color,
  size = 46,
}: {
  shape: CalendarOutfitItemShape;
  color: string;
  size?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <ShapePath shape={shape} color={color} />
    </svg>
  );
}
