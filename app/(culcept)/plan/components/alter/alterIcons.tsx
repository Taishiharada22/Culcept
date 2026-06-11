"use client";

/**
 * alterIcons — Alter タブ専用の小型ストロークアイコン（参照画像のカードアイコン群に対応）
 * 1.6px stroke / currentColor。装飾のみ・意味情報はラベル側が持つ（aria-hidden）。
 */

export interface IconProps {
  size?: number;
  className?: string;
}

function Svg({ size = 14, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function BrainIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9.5 4.5 a3 3 0 0 0 -3 3 a3 3 0 0 0 -2 3 a3 3 0 0 0 1.2 5.4 A3 3 0 0 0 9 19.5 c1.5 0 3 -1.2 3 -3 V7.5 a3 3 0 0 0 -2.5 -3 z" />
      <path d="M14.5 4.5 a3 3 0 0 1 3 3 a3 3 0 0 1 2 3 a3 3 0 0 1 -1.2 5.4 A3 3 0 0 1 15 19.5 c-1.5 0 -3 -1.2 -3 -3" />
    </Svg>
  );
}

export function HeartIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 20 C7 16 3.5 13 3.5 9.2 A4.2 4.2 0 0 1 12 7 a4.2 4.2 0 0 1 8.5 2.2 C20.5 13 17 16 12 20 z" />
    </Svg>
  );
}

export function BatteryIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.5" y="8" width="16" height="9" rx="2.5" />
      <path d="M21.5 11.5 v2" />
      <path d="M6 11 v3 M9.5 11 v3" />
    </Svg>
  );
}

export function WalkIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="13" cy="4.5" r="1.8" />
      <path d="M12.5 8 L9.5 9.8 L8.5 13" />
      <path d="M12.5 8 L13.5 13 L11 16.5 L9.5 21" />
      <path d="M13.5 13 L16 15.5 L16.5 20.5" />
    </Svg>
  );
}

export function MoonIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20 13.5 A8 8 0 1 1 10.5 4 A6.5 6.5 0 0 0 20 13.5 z" />
    </Svg>
  );
}

export function PulseIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.5 12 h4 l2.5 -6 l4 12 l2.5 -6 h6" />
    </Svg>
  );
}

export function LeafIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 19 C5 10 11 5 20 4.5 C19.5 13.5 14.5 19.5 6 19.5" />
      <path d="M5 19 C8 14 12 10.5 16.5 8" />
    </Svg>
  );
}

export function CarryIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="8.5" width="16" height="11" rx="2" />
      <path d="M9 8.5 V6.5 a3 3 0 0 1 6 0 V8.5" />
    </Svg>
  );
}

export function TargetIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.8" />
    </Svg>
  );
}

export function SunIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 3 v2 M12 19 v2 M3 12 h2 M19 12 h2 M5.5 5.5 l1.5 1.5 M17 17 l1.5 1.5 M18.5 5.5 L17 7 M7 17 l-1.5 1.5" />
    </Svg>
  );
}

export function SparkleIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.5 L13.8 9.2 L19.5 11 L13.8 12.8 L12 18.5 L10.2 12.8 L4.5 11 L10.2 9.2 Z" />
      <path d="M18.5 16.5 l0.7 2.3 l2.3 0.7 l-2.3 0.7 l-0.7 2.3 l-0.7 -2.3 l-2.3 -0.7 l2.3 -0.7 z" strokeWidth={1.1} />
    </Svg>
  );
}

export function MicIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="9.5" y="3.5" width="5" height="10" rx="2.5" />
      <path d="M6 11.5 a6 6 0 0 0 12 0" />
      <path d="M12 17.5 V20.5" />
    </Svg>
  );
}

export function SendIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M21 3.5 L11 13.5" />
      <path d="M21 3.5 L14.5 20.5 L11 13.5 L4 10.5 Z" />
    </Svg>
  );
}

export function SlidersIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 7 h10 M18 7 h2 M14 7 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0" />
      <path d="M4 17 h2 M10 17 h10 M6 17 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0" />
    </Svg>
  );
}
