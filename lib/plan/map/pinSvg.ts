/**
 * Phase 3-N Map impl sub-phase 9a-impl Step δ-corrective — Pin SVG redesign
 *
 * 設計原則 (= CEO + GPT 補正受領、 9a-impl Step δ corrective):
 *   - **label を pin の上に配置** (= sheet が下から出ても title/time ラベル隠れない)
 *   - **icon を upper bulb の visual center に正しく centering** (= 旧 (11,9) ズレ修正)
 *   - **クリーンな pin デザイン** (= proportions / stroke / 余白整理)
 *   - **anchor は pin tip 下端** (= coord に attach、 不変)
 *
 * 新 viewBox layout (= 40 × 64):
 *   y 0-14:  label area (= 白カード + 時刻 text、 pin の上)
 *   y 14-16: gap
 *   y 16-64: pin teardrop (= 48px tall、 上半円 + 下尖り)
 *     - upper bulb visual center: (20, 34)
 *     - tip: (20, 64)
 *   anchor: (width/2, 64) (= pin tip = coord)
 *
 * icon centering:
 *   icon viewBox 18×18 → translate(11, 25) で SVG (11, 25) - (29, 43)、 center = (20, 34) ← upper bulb center
 *
 * 設計書:
 *   - docs/alter-plan-map-redesign-spec-audit.md v3 §4 (= pin 仕様)
 *   - lib/plan/list/types.ts (= EventCategory)
 */

import { type EventCategory } from "@/lib/plan/list/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 涙型 pin SVG path (= y 16-64 領域、 上半円 + 下尖り、 shifted by +16 from origin layout)
 *
 * 形状:
 *   - 上半円: cx=20, cy=34, r=18 (= visual centered for icon overlay)
 *   - 下半分: bezier で (20, 64) に集約 (= 尖り tip)
 *
 * 数値: viewBox 40×64 で aspect 5:8 (= 標準 pin marker + label area)
 */
const TEARDROP_PATH =
  "M 20 16 C 9 16 0 25 0 36 C 0 46 20 64 20 64 C 20 64 40 46 40 36 C 40 25 31 16 20 16 Z";

/**
 * カテゴリ別 fill 色 (= EventCard / MapBottomSheet CATEGORY_CIRCLE_BG_CLASS 同 hex)
 */
const CATEGORY_FILL_COLOR: Record<EventCategory, string> = {
  cafe: '#6366f1',
  meal: '#f97316',
  work: '#3b82f6',
  home: '#10b981',
  other: '#64748b',
};

/**
 * カテゴリ別 SVG icon path (= 18×18 viewBox 内、 全 icon center (9, 9) に揃え redesigned)
 *
 * 配置: transform="translate(11, 25)" で SVG 座標 (11, 25)-(29, 43)、
 *        icon visual center = (20, 34) ← 涙型 upper bulb center に正しく重なる。
 *
 * Step δ-corrective: 旧 icon path は icon viewBox 内 center が (9, 9) ではなかったため
 *                     pin 内で見ると ズレていた。 全 icon を center (9, 9) に redesign。
 */
const CATEGORY_ICON_PATH: Record<EventCategory, string> = {
  // cafe: コーヒーカップ (= 本体 4-13 中央 + 取っ手右 + 蒸気 2 本上)、 center ≈ (9, 9)
  cafe:
    '<path d="M 4 8 H 13 V 13 Q 13 15 11 15 H 6 Q 4 15 4 13 Z"/>' +
    '<path d="M 13 9 Q 16 9 16 11 Q 16 13 13 12.5"/>' +
    '<path d="M 6 3 V 6"/>' +
    '<path d="M 10 3 V 6"/>',
  // meal: フォーク (左 3 歯) + ナイフ (右)、 center ≈ (9, 9)
  meal:
    '<path d="M 4 3 V 7"/>' +
    '<path d="M 6 3 V 7"/>' +
    '<path d="M 8 3 V 7 Q 8 9 6 9 H 5 Q 3 9 3 7"/>' +
    '<path d="M 6 9 V 15"/>' +
    '<path d="M 13 3 Q 15 3 15 7 V 10 H 13 V 15"/>',
  // work: ブリーフケース (取っ手 + 本体 + 中央線)、 center (9, 9)
  work:
    '<path d="M 7 4 V 3 Q 7 2 8 2 H 10 Q 11 2 11 3 V 4"/>' +
    '<path d="M 3.5 4 H 14.5 V 14 H 3.5 Z"/>' +
    '<path d="M 3.5 8 H 14.5"/>',
  // home: 家 (屋根 + 本体 + ドア)、 center ≈ (9, 9-10)
  home:
    '<path d="M 3 9 L 9 3 L 15 9 V 15 H 3 Z"/>' +
    '<path d="M 7 15 V 11 H 11 V 15"/>',
  // other: 円ドット中央、 center (9, 9)
  other:
    '<circle cx="9" cy="9" r="3"/>',
};

/**
 * pin SVG width/height (= 通常 vs selected、 label を pin の上に配置)
 *
 * Step δ-corrective: viewBox 40×64 統一 (= label y 0-14 / pin y 16-64)、
 *                     anchor (width/2, pin tip = height) で coord に attach。
 *   - unselected: 40 × 64
 *   - selected: 48 × 77 (= 1.2x scale)
 *
 * pinTipY: 物理 px の anchor Y (= height と同値、 pin tip = 画像下端 = coord 位置)
 */
const PIN_SIZE = {
  unselected: { width: 40, height: 64, pinTipY: 64 },
  selected: { width: 48, height: 77, pinTipY: 77 },
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * XML 安全文字 escape (= SVG text 要素に入れる際の最低限の防御、 < > & を escape)
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * SVG string を data URI に変換 (= base64 ではなく encodeURIComponent、 デバッグ容易)
 */
function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Pin SVG data URI を生成 (= Google Maps Marker.icon.url に渡す)
 *
 * @param category EventCategory
 * @param isSelected selected pin かどうか (= size 拡大 + stroke 強化)
 * @param timeLabel optional 時刻ラベル (= 「09:00」 等、 pin の上に白カードで embed)
 * @returns data:image/svg+xml;charset=utf-8,... 形式の URI string
 *
 * 構造 (= viewBox 0 0 40 64):
 *   <svg>
 *     <!-- label area: y 0-14 (= pin の上、 sheet で隠れない) -->
 *     <rect x="2" y="1" width="36" height="13" rx="3" fill="white" stroke="{color}"/>
 *     <text x="20" y="10.5" text-anchor="middle" font-size="9" fill="#374151">09:00</text>
 *     <!-- pin teardrop: y 16-64 -->
 *     <path d="..." fill="{color}" stroke="white" stroke-width="2"/>
 *     <!-- icon: translate(11, 25) で center (20, 34) = upper bulb center -->
 *     <g transform="translate(11, 25)" stroke="white" ...>
 *       {iconPath}
 *     </g>
 *   </svg>
 */
export function generatePinSvgDataUri(
  category: EventCategory,
  isSelected: boolean,
  timeLabel?: string,
): string {
  const size = isSelected ? PIN_SIZE.selected : PIN_SIZE.unselected;
  const color = CATEGORY_FILL_COLOR[category];
  const iconPath = CATEGORY_ICON_PATH[category];

  // selected: stroke-width 3 (= halo 強化、 視覚差別化)
  const teardropStroke = isSelected ? 3 : 2;

  // viewBox は label 含む total height (= unselected 64 / selected 64 同統一、 表示 size のみ変える)
  const viewBoxHeight = 64;
  const viewBoxWidth = 40;

  // label を pin の上 (y 0-14) に配置 (= Step δ-corrective、 sheet で隠れない)
  const labelEl = timeLabel
    ? `<rect x="2" y="1" width="36" height="13" rx="3" fill="white" stroke="${color}" stroke-width="1"/>` +
      `<text x="20" y="10.5" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="${isSelected ? 10 : 9}" font-weight="600" fill="#374151">${escapeXml(timeLabel)}</text>`
    : '';

  // 9b-1 carry: icon 中心微調整
  //   旧 transform (11, 25): icon center (20, 34) ← upper bulb 幾何中心
  //   新 transform (11, 24): icon center (20, 33) ← 視覚的重心 (= cafe/work 等が下重心の補正)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}">` +
    labelEl +
    `<path d="${TEARDROP_PATH}" fill="${color}" stroke="white" stroke-width="${teardropStroke}"/>` +
    `<g transform="translate(11, 24)" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">` +
    iconPath +
    `</g>` +
    `</svg>`;

  return svgToDataUri(svg);
}

/**
 * Pin 物理 size + viewBox 内 anchor 座標
 *
 * 返り値:
 *   - width: 物理 px (= scaledSize)
 *   - height: 物理 px
 *   - pinTipY: viewBox 内 anchor Y (= 64 固定、 物理 size と独立)
 *
 * Google Maps Marker.icon の anchor は **viewBox 座標ではなく 物理 px**。
 * 呼び出し側で `pinTipY / viewBoxHeight * physicalHeight` で物理 px 換算する。
 */
export function getPinSize(isSelected: boolean): {
  width: number;
  height: number;
  pinTipY: number;
} {
  return isSelected ? PIN_SIZE.selected : PIN_SIZE.unselected;
}
