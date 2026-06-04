/**
 * lib/plan/map/routeMode.ts — MapTab 移動手段 vocab + visual helper (FH MapTab から復元移植・A5-1)
 * RouteTransportMode = MapTab UI の移動手段選択 vocab(9語)。canonical TransportMode(5語)とは別 —
 * UI は richer set を保持(taxi/bus/bicycle/shinkansen/train を畳まない)。canonical 写像は A2 で別途。
 * 思想継承: 距離→mode 推定しない・偽の経路を見せない(note で対応状況を正直に明示)。
 */
export type RouteTransportMode =
  | "walk" | "car" | "taxi" | "train" | "shinkansen" | "bus" | "bicycle" | "flight" | "unknown";

export const ROUTE_MODE_COLORS: Record<RouteTransportMode, string> = {
  walk: "#2e9e5b", car: "#1a73e8", taxi: "#f59e0b", train: "#1565c0",
  shinkansen: "#0b3d91", bus: "#8e24aa", bicycle: "#0d9488", flight: "#0891b2", unknown: "#64748b",
};

export const MOBILITY_MAIN_MODES: readonly RouteTransportMode[] = ["walk", "car", "taxi", "train", "bus"];
export const MOBILITY_LIMITED_MODES: readonly RouteTransportMode[] = ["bicycle", "flight", "shinkansen"];

export const MOBILITY_MODE_META: Record<RouteTransportMode, { label: string; note?: string }> = {
  walk: { label: "徒歩" },
  car: { label: "車" },
  taxi: { label: "タクシー" },
  train: { label: "電車", note: "乗換経路は地域により未対応" },
  shinkansen: { label: "新幹線", note: "乗換経路は地域により未対応" },
  bus: { label: "バス", note: "乗換経路は地域により未対応" },
  bicycle: { label: "自転車", note: "日本は経路未対応・概念表示" },
  flight: { label: "飛行機", note: "空路（概念表示）" },
  unknown: { label: "未設定" },
};

const VALID_ROUTE_MODES: ReadonlySet<string> = new Set(Object.keys(MOBILITY_MODE_META));
export function isRouteTransportMode(value: unknown): value is RouteTransportMode {
  return typeof value === "string" && VALID_ROUTE_MODES.has(value);
}

export function legKeyOf(fromAnchorId: string, toAnchorId: string): string {
  return `${fromAnchorId}__${toAnchorId}`;
}

function mobilityGlyphLucide(mode: RouteTransportMode): string {
  switch (mode) {
    case "walk":
      return '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/>';
    case "car":
      return '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>';
    case "taxi":
      return '<path d="M10 2h4"/><path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8"/><path d="M7 14h.01"/><path d="M17 14h.01"/><rect width="18" height="8" x="3" y="10" rx="2"/><path d="M5 18v2"/><path d="M19 18v2"/>';
    case "train":
    case "shinkansen":
      return '<path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/><path d="m9 15-1-1"/><path d="m15 15 1-1"/><path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/><path d="m8 19-2 3"/><path d="m16 19 2 3"/>';
    case "bus":
      return '<path d="M4 6 2 7"/><path d="M10 6h4"/><path d="m22 7-2-1"/><rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16"/><path d="M8 15h.01"/><path d="M16 15h.01"/><path d="M6 19v2"/><path d="M18 21v-2"/>';
    case "bicycle":
      return '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>';
    case "flight":
      return '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>';
    default:
      return '<path d="m10.586 5.414-5.172 5.172"/><path d="m18.586 13.414-5.172 5.172"/><path d="M6 12h12"/><circle cx="12" cy="20" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="20" cy="12" r="2"/><circle cx="4" cy="12" r="2"/>';
  }
}

function mobilityGlyphLayer(mode: RouteTransportMode): string {
  return '<g transform="translate(7.3,7.3) scale(0.64)" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' + mobilityGlyphLucide(mode) + "</g>";
}

export function mobilitySquircleDataUri(mode: RouteTransportMode): string {
  const color = ROUTE_MODE_COLORS[mode];
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">' +
    '<defs><filter id="sq" x="-30%" y="-30%" width="160%" height="160%">' +
    `<feDropShadow dx="0" dy="0.7" stdDeviation="0.8" flood-color="${color}" flood-opacity="0.35"/></filter></defs>` +
    '<g filter="url(#sq)">' +
    `<rect x="3" y="3" width="24" height="24" rx="8" fill="${color}"/>` +
    '<rect x="3" y="3" width="24" height="11" rx="8" fill="#ffffff" opacity="0.12"/>' +
    "</g>" + mobilityGlyphLayer(mode) + "</svg>";
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/** leg chip (= tap して移動手段を選ぶ・区間中点に置く中立 marker)。mode 非依存(A5-2)。 */
export function legChipDataUri(): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">' +
    '<circle cx="11" cy="11" r="9.5" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>' +
    '<g transform="translate(5,5) scale(0.5)" fill="none" stroke="#475569" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="m10.586 5.414-5.172 5.172"/><path d="m18.586 13.414-5.172 5.172"/><path d="M6 12h12"/><circle cx="12" cy="20" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="20" cy="12" r="2"/><circle cx="4" cy="12" r="2"/></g>' +
    '</svg>';
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
