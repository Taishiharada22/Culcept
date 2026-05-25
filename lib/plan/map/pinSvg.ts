/**
 * Phase 3-N Map impl sub-phase 9a-impl Step γ — Pin SVG data URI generator (= pure helper)
 *
 * 設計原則 (= CEO Q3 採用 X + mock 整合):
 *   - **涙型 pin** (= teardrop shape、 上に丸 + 下に尖り)
 *   - **カテゴリ色** (= EventCategory に応じた fill)
 *   - **白抜き SVG icon** (= 涙型 上半円内に icon overlay、 stroke=white)
 *   - **selected 時 size 拡大** (= 軽い scale up、 GPT/CEO 「強すぎない first-pass」 整合)
 *   - **pure module** (= LLM / API / DB / network 不使用、 input mutate なし)
 *   - **絵文字 0** (= 全 SVG path)
 *
 * 出力:
 *   - `data:image/svg+xml;charset=utf-8,...` 形式の data URI string
 *   - Google Maps `Marker.icon.url` に直接渡せる
 *
 * 不変:
 *   - viewBox 40×48 (= unselected 標準 size、 selected で width/height 拡大、 viewBox 内 layout 同一)
 *   - anchor 想定: (width/2, height) = 下端中央 (= pin の尖り先が coord に attach)
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
 * 涙型 pin SVG path (= viewBox 40×48、 上に丸 + 下尖り)
 *
 * 形状:
 *   - 上半分: 半円 (= cx=20, cy=18, r=18)
 *   - 下半分: 滑らかな尖り (= bezier で 20,48 に集約)
 *
 * 数値根拠: viewBox 40×48 で aspect 5:6 (= 標準 Google Maps marker 比に近い)
 */
const TEARDROP_PATH = "M 20 0 C 9 0 0 9 0 20 C 0 30 20 48 20 48 C 20 48 40 30 40 20 C 40 9 31 0 20 0 Z";

/**
 * カテゴリ別 fill 色 (= EventCard / MapBottomSheet CATEGORY_CIRCLE_BG_CLASS 同 hex)
 *
 * Tailwind class 「bg-indigo-500」 等の hex 等価:
 *   - indigo-500 = #6366f1
 *   - orange-500 = #f97316
 *   - blue-500 = #3b82f6
 *   - emerald-500 = #10b981
 *   - slate-500 = #64748b
 */
const CATEGORY_FILL_COLOR: Record<EventCategory, string> = {
  cafe: '#6366f1',
  meal: '#f97316',
  work: '#3b82f6',
  home: '#10b981',
  other: '#64748b',
};

/**
 * カテゴリ別 SVG icon path (= 18×18 viewBox 内、 白抜き stroke、 涙型上半円内に重ねる)
 *
 * 各 icon は viewBox 0 0 18 18 + transform="translate(11, 9)" で涙型中央上に配置。
 *
 * 設計: TimelineSpine SVG icon と概念的に整合 (= 同 category 同 motif)、
 *        ただし pin 内表示用に簡素化 (= 細部省略、 16-18px で読みやすい形)。
 */
const CATEGORY_ICON_PATH: Record<EventCategory, string> = {
  // cafe: コーヒーカップ (= 本体 + 取っ手 + 蒸気 2 本)
  cafe:
    '<path d="M 3 9 H 12 V 14 Q 12 16 10 16 H 5 Q 3 16 3 14 Z"/>' +
    '<path d="M 12 10 Q 15 10 15 12 Q 15 14 12 13"/>' +
    '<path d="M 5 3 V 6"/>' +
    '<path d="M 9 3 V 6"/>',
  // meal: フォーク + ナイフ (= 左フォーク 3 歯 + 右ナイフ)
  meal:
    '<path d="M 4 2 V 7"/>' +
    '<path d="M 6 2 V 7"/>' +
    '<path d="M 8 2 V 7 Q 8 9 6 9 H 5 Q 3 9 3 7"/>' +
    '<path d="M 6 9 V 16"/>' +
    '<path d="M 13 2 Q 15 2 15 5 V 9 H 13 V 16"/>',
  // work: ブリーフケース (= 取っ手 + 本体 + 中央線)
  work:
    '<path d="M 6 4 V 3 Q 6 2 7 2 H 11 Q 12 2 12 3 V 4"/>' +
    '<path d="M 3 4 H 15 V 14 H 3 Z"/>' +
    '<path d="M 3 8 H 15"/>',
  // home: 家 (= 屋根 + 本体 + ドア)
  home:
    '<path d="M 2 8 L 9 2 L 16 8 V 16 H 2 Z"/>' +
    '<path d="M 7 16 V 11 H 11 V 16"/>',
  // other: 円ドット (= 中央配置)
  other:
    '<circle cx="9" cy="9" r="3"/>',
};

/**
 * pin SVG width/height (= 通常 vs selected、 time label embedded 含む)
 *
 * Step γ: label を SVG 内に embedded (= 白カード風、 mock 整合)、 anchor は pin 尖り先のまま。
 *   - unselected: 40×64 (= pin 48 + label 16 余裕)
 *   - selected: 48×72 (= 1.2x scale + label 余裕)
 *
 * anchor 位置: (width/2, pin tip height = 48) で coord に attach、 label は pin の下に visible。
 */
const PIN_SIZE = {
  unselected: { width: 40, height: 64, pinTipY: 48 },
  selected: { width: 48, height: 72, pinTipY: 48 },
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * SVG string を data URI に変換 (= base64 ではなく encodeURIComponent、 デバッグ容易)
 */
function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * XML 安全文字 escape (= SVG text 要素に入れる際の最低限の防御)
 *   - < > & を escape
 *   - 改行 / quote 等は対象外 (= time label "09:00" 等で発生しない想定)
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Pin SVG data URI を生成 (= Google Maps Marker.icon.url に渡す)
 *
 * @param category EventCategory (= cafe / meal / work / home / other)
 * @param isSelected selected pin かどうか (= size 拡大)
 * @param timeLabel optional 時刻ラベル (= "09:00" 等、 pin 下に白カード風で embed)、 undefined なら label 出さない
 * @returns data:image/svg+xml;charset=utf-8,... 形式の URI string
 *
 * 構造:
 *   <svg width="40" height="64" viewBox="0 0 40 64">
 *     <path d="..." fill="{categoryColor}" stroke="white" stroke-width="2"/>  ← 涙型本体 (= y 0-48)
 *     <g transform="translate(11, 9)" stroke="white" ...>                      ← icon 白抜き
 *       {iconPath}
 *     </g>
 *     <rect x="2" y="50" width="36" height="14" rx="3" fill="white" stroke="..."/>  ← 白カードラベル
 *     <text x="20" y="60" text-anchor="middle" font-size="10" fill="#374151">09:00</text>
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

  // selected はさらに白い「halo」 stroke で強調 (= GPT 「軽い scale up + shadow 強化」 substitute)
  const strokeWidth = isSelected ? 3 : 2;

  // viewBox: pin tip (y=48) + label area (= 16px 余裕 = 64 total) / selected は + 8 = 72
  const viewBoxHeight = isSelected ? 72 : 64;
  const viewBoxWidth = 40;

  const labelEl = timeLabel
    ? `<rect x="2" y="50" width="36" height="13" rx="3" fill="white" stroke="${color}" stroke-width="1"/>` +
      `<text x="20" y="60" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="${isSelected ? 10 : 9}" font-weight="600" fill="#374151">${escapeXml(timeLabel)}</text>`
    : '';

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}">` +
    `<path d="${TEARDROP_PATH}" fill="${color}" stroke="white" stroke-width="${strokeWidth}"/>` +
    `<g transform="translate(11, 9)" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">` +
    iconPath +
    `</g>` +
    labelEl +
    `</svg>`;

  return svgToDataUri(svg);
}

/**
 * Pin 物理 size (= Marker.icon.scaledSize 用、 anchor 計算用)
 *
 * 返り値:
 *   - width: SVG 幅 (= scaledSize)
 *   - height: SVG 全体高さ (= label 含む)
 *   - pinTipY: 涙型尖り先の Y 座標 (= anchor 用、 「coord に attach する位置」)
 */
export function getPinSize(isSelected: boolean): {
  width: number;
  height: number;
  pinTipY: number;
} {
  return isSelected ? PIN_SIZE.selected : PIN_SIZE.unselected;
}
