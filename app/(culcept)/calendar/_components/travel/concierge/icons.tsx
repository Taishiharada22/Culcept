// app/(culcept)/calendar/_components/travel/concierge/icons.tsx
// Concierge 用の軽量ラインアイコン（emoji を避け serif の世界観に合わせる）。stroke=currentColor。
import * as React from "react";
import type { TransportMode } from "../../../_lib/travel/types";

type IconProps = { className?: string; size?: number; strokeWidth?: number; style?: React.CSSProperties };

function Svg({ className, size = 18, strokeWidth = 1.6, style, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const ChevronRight = (p: IconProps) => <Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>;
export const ChevronLeft = (p: IconProps) => <Svg {...p}><path d="M15 6l-6 6 6 6" /></Svg>;
export const ChevronDown = (p: IconProps) => <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>;
export const Bell = (p: IconProps) => <Svg {...p}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></Svg>;
export const Bookmark = (p: IconProps) => <Svg {...p}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></Svg>;
export const Share = (p: IconProps) => <Svg {...p}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></Svg>;
export const MapPin = (p: IconProps) => <Svg {...p}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="2.6" /></Svg>;
export const Phone = (p: IconProps) => <Svg {...p}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8.1 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2Z" /></Svg>;
export const Clock = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>;
export const Star = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p}><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.2l1-5.8L3.5 9.2l5.9-.9z" fill={filled ? "currentColor" : "none"} /></Svg>
);
export const Plus = (p: IconProps) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const Camera = (p: IconProps) => <Svg {...p}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l2-3h8l2 3h3a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="3.4" /></Svg>;
export const Sparkle = (p: IconProps) => <Svg {...p}><path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /></Svg>;
export const Lightbulb = (p: IconProps) => <Svg {...p}><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z" /></Svg>;
export const ConciergeBell = (p: IconProps) => <Svg {...p}><path d="M3 19h18M12 6a8 8 0 0 0-8 8v1h16v-1a8 8 0 0 0-8-8Z" /><path d="M12 6V4M10 4h4" /></Svg>;
export const Flag = (p: IconProps) => <Svg {...p}><path d="M5 21V4M5 4h11l-1.5 3L16 10H5" /></Svg>;
export const Pencil = (p: IconProps) => <Svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></Svg>;
export const Crest = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 6c2 2 2 4 0 6-2-2-2-4 0-6ZM12 18c-2-2-2-4 0-6 2 2 2 4 0 6ZM6 12c2-2 4-2 6 0-2 2-4 2-6 0ZM18 12c-2 2-4 2-6 0 2-2 4-2 6 0Z" /></Svg>;
export const Sun = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>;
export const Cloud = (p: IconProps) => <Svg {...p}><path d="M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.6-1.5A4 4 0 0 0 6.5 19z" /></Svg>;
export const Map = (p: IconProps) => <Svg {...p}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path d="M9 4v14M15 6v14" /></Svg>;
export const Ticket = (p: IconProps) => <Svg {...p}><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4Z" /><path d="M13 6v12" strokeDasharray="2 2" /></Svg>;
export const Menu = (p: IconProps) => <Svg {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Svg>;
export const Grid = (p: IconProps) => <Svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.2" /><rect x="14" y="3" width="7" height="7" rx="1.2" /><rect x="3" y="14" width="7" height="7" rx="1.2" /><rect x="14" y="14" width="7" height="7" rx="1.2" /></Svg>;
export const CalendarIcon = (p: IconProps) => <Svg {...p}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></Svg>;
export const Compass = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></Svg>;
export const User = (p: IconProps) => <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Svg>;
export const Check = (p: IconProps) => <Svg {...p}><path d="M5 12l4.5 4.5L19 7" /></Svg>;
export const CircleSlash = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M6 6l12 12" /></Svg>;
export const AlertCircle = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.5" /></Svg>;
export const ListChecks = (p: IconProps) => <Svg {...p}><path d="M4 6l1.5 1.5L8 5M4 13l1.5 1.5L8 11M4 19l1.5 1.5L8 17M11 6h9M11 12h9M11 18h9" /></Svg>;
export const Leaf = (p: IconProps) => <Svg {...p}><path d="M4 20c0-8 6-14 16-14 0 10-6 16-14 16M4 20c2-4 5-7 9-9" /></Svg>;
export const Yen = (p: IconProps) => <Svg {...p}><path d="M7 5l5 7 5-7M12 12v7M8 14h8M8 17h8" /></Svg>;

// 宿泊/食事/交通/体験 のカテゴリアイコン（円形アバター用）。
export const BedIcon = (p: IconProps) => <Svg {...p}><path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 14h18M3 18v2M21 18v2M7 10V8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" /></Svg>;
export const ForkKnife = (p: IconProps) => <Svg {...p}><path d="M7 3v18M5 3v5a2 2 0 0 0 4 0V3M16 3c-1.5 0-2.5 2-2.5 4.5S15 12 16 12v9" /></Svg>;
export const TrainFront = (p: IconProps) => <Svg {...p}><rect x="6" y="3" width="12" height="14" rx="3" /><path d="M6 11h12M9 17l-2 4M15 17l2 4" /><circle cx="9" cy="14" r="0.6" fill="currentColor" /><circle cx="15" cy="14" r="0.6" fill="currentColor" /></Svg>;
export const Camera2 = Camera;

// 交通手段 → アイコン。
export function TransportIcon({ mode, ...p }: IconProps & { mode: TransportMode }) {
  switch (mode) {
    case "walk":
      return <Svg {...p}><circle cx="13" cy="4" r="1.6" /><path d="M11 21l1.5-6L9 12l1-5 3 1 2 3M12.5 15l2 6M9 9l-2 2" /></Svg>;
    case "taxi":
    case "car":
      return <Svg {...p}><path d="M5 17h14M6.5 17v2M17.5 17v2M4 17l1.2-4.5A2 2 0 0 1 7.1 11h9.8a2 2 0 0 1 1.9 1.5L20 17M4 17a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 17" /><path d="M9 8h6M12 6v2" /></Svg>;
    case "bus":
      return <Svg {...p}><rect x="4" y="5" width="16" height="12" rx="2" /><path d="M4 12h16M7 17v2M17 17v2M8 5V4h8v1" /><circle cx="8" cy="14.5" r="0.6" fill="currentColor" /><circle cx="16" cy="14.5" r="0.6" fill="currentColor" /></Svg>;
    case "train":
      return <TrainFront {...p} />;
    case "bike":
      return <Svg {...p}><circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><path d="M6 17l4-7h5l-3 7M10 10l-1-3H7M15 10l3 7" /></Svg>;
    default:
      return <MapPin {...p} />;
  }
}
