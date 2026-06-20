/**
 * CoAlter /plan タブ — 共有ミニアイコン（inline SVG・依存追加なし）
 *
 * 既存 PlanClient の TabIcon と同じ「currentColor stroke の素朴な line icon」流儀。
 * 色は親の text-* class で与える。
 */

interface IconProps {
  readonly size?: number;
  readonly className?: string;
  readonly strokeWidth?: number;
}

function base(size: number, strokeWidth: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
    className: className ? `flex-shrink-0 ${className}` : "flex-shrink-0",
  };
}

export function WalkIcon({ size = 13, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth, className)}>
      <circle cx="13" cy="4.5" r="1.8" />
      <path d="M10 21 L12 15 L10.5 12 L11.5 8.5 L15 9.5 L17 12" />
      <path d="M11.5 8.5 L8 10 L7 13" />
      <path d="M12 15 L15 17 L16 21" />
    </svg>
  );
}

export function ClockIcon({ size = 13, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth, className)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5 V12 L15 14" />
    </svg>
  );
}

export function ChatRoundIcon({ size = 13, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth, className)}>
      <path d="M12 4 a8 7 0 0 1 8 7 a8 7 0 0 1 -8 7 c-1 0-2-.2-2.9-.5 L5 19 l1-3.2 A7 7 0 0 1 4 11 a8 7 0 0 1 8-7 z" />
    </svg>
  );
}

export function YenIcon({ size = 13, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth, className)}>
      <path d="M7 4 L12 11 L17 4" />
      <path d="M12 11 V20" />
      <path d="M8 13 H16" />
      <path d="M8 16.5 H16" />
    </svg>
  );
}

export function PaceIcon({ size = 13, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth, className)}>
      <path d="M4 12 C7 6, 11 6, 13 12 S19 18, 21 12" />
    </svg>
  );
}

export function LeafIcon({ size = 13, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth, className)}>
      <path d="M6 18 C6 9, 12 5, 19 5 C19 13, 14 19, 7 19 Z" />
      <path d="M5 20 C8 15, 11 12, 15 9" />
    </svg>
  );
}

export function CheckIcon({ size = 13, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth, className)}>
      <path d="M5 12.5 L10 17.5 L19 7" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 13, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth, className)}>
      <path d="M7 10 L12 15 L17 10" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 13, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth, className)}>
      <path d="M10 7 L15 12 L10 17" />
    </svg>
  );
}

export function CalendarMiniIcon({ size = 14, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth, className)}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5 H20.5" />
      <path d="M8 3 V7" />
      <path d="M16 3 V7" />
    </svg>
  );
}

export function SunIcon({ size = 14, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth, className)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3 V5 M12 19 V21 M3 12 H5 M19 12 H21 M5.6 5.6 L7 7 M17 17 L18.4 18.4 M18.4 5.6 L17 7 M7 17 L5.6 18.4" />
    </svg>
  );
}

export function CloudSunIcon({ size = 14, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth, className)}>
      <path d="M15 5 a3.5 3.5 0 0 1 3.4 2.7" />
      <path d="M15 2.5 V3.5 M20.5 8 H21.5 M19.2 4.3 L18.5 5" />
      <path d="M6.5 19.5 a4 4 0 0 1 -.3-8 a5 5 0 0 1 9.6-1.2 a3.6 3.6 0 0 1 1.7 6.9 q-.5.3-1.5.3 z" />
    </svg>
  );
}

export function DotsIcon({ size = 15, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth, className)}>
      <circle cx="5" cy="12" r="0.8" fill="currentColor" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" />
      <circle cx="19" cy="12" r="0.8" fill="currentColor" />
    </svg>
  );
}

export function CloseIcon({ size = 13, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth, className)}>
      <path d="M6 6 L18 18 M18 6 L6 18" />
    </svg>
  );
}

export function SendIcon({ size = 14, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth, className)}>
      <path d="M4 12 L20 4 L14.5 20 L11.5 13 Z" />
      <path d="M11.5 13 L20 4" />
    </svg>
  );
}

export function InfoIcon({ size = 12, className, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...base(size, strokeWidth, className)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11 V16" />
      <circle cx="12" cy="8" r="0.7" fill="currentColor" />
    </svg>
  );
}

/** CoAlter のシンボル（4点スパークル・fill 描画） */
export function SparkleIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className ? `flex-shrink-0 ${className}` : "flex-shrink-0"}
    >
      <path d="M12 2 C12.8 7 14.5 9 19.5 10 C14.5 11 12.8 13 12 18 C11.2 13 9.5 11 4.5 10 C9.5 9 11.2 7 12 2 Z" />
      <path d="M19 14 C19.4 16.2 20.2 17 22 17.5 C20.2 18 19.4 18.8 19 21 C18.6 18.8 17.8 18 16 17.5 C17.8 17 18.6 16.2 19 14 Z" opacity="0.7" />
    </svg>
  );
}

/** SharedCondition.kind → アイコン */
export function ConditionKindIcon({
  kind,
  size = 12,
  className,
}: {
  kind: "mobility" | "time" | "place_quality" | "budget" | "pace" | "other";
  size?: number;
  className?: string;
}) {
  switch (kind) {
    case "mobility":
      return <WalkIcon size={size} className={className} />;
    case "time":
      return <ClockIcon size={size} className={className} />;
    case "place_quality":
      return <ChatRoundIcon size={size} className={className} />;
    case "budget":
      return <YenIcon size={size} className={className} />;
    case "pace":
      return <PaceIcon size={size} className={className} />;
    default:
      return <SparkleIcon size={size} className={className} />;
  }
}
