/**
 * 小型 線画アイコン（emoji の代わり）。 reason / wardrobe チップ用に統一トーンで描く。
 *
 * 方針:
 *   - 24x24 viewBox / stroke = currentColor / fill none / 細線・角丸。 色は呼び出し側の text-* で制御。
 *   - VM の安定 id（rf-* / stat-*）→ アイコン名へ写像（builder 非改変）。 未対応は emoji へ fallback。
 *   - 天気 / 日付ボードのアイコンは対象外（CEO 指示）。
 */

export type CalIconName =
  | "temp"
  | "walk"
  | "meeting"
  | "cafe"
  | "sparkle"
  | "tops"
  | "bottoms"
  | "umbrella"
  | "shoes"
  | "palette"
  | "work"
  | "home"
  | "school"
  | "meal"
  | "calendar";

/** reason factor VM id → アイコン名 */
export const REASON_ICON: Record<string, CalIconName> = {
  "rf-temp": "temp",
  "rf-move": "walk",
  "rf-tpo": "meeting",
  "rf-place": "cafe",
  "rf-mood": "sparkle",
};

/** wardrobe stat VM id → アイコン名 */
export const WARDROBE_ICON: Record<string, CalIconName> = {
  "stat-top": "tops",
  "stat-bottom": "bottoms",
  "stat-rain": "umbrella",
  "stat-walk": "shoes",
  "stat-color": "palette",
};

/** schedule の場所カテゴリ emoji（CATEGORY_META）→ アイコン名。 未対応は呼び出し側で "calendar" にフォールバック。 */
export const SCHEDULE_EMOJI_ICON: Record<string, CalIconName> = {
  "🏢": "work",
  "🏠": "home",
  "🎓": "school",
  "☕": "cafe",
};

function paths(name: CalIconName) {
  switch (name) {
    case "temp":
      return <path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z" />;
    case "walk":
      return (
        <>
          <circle cx="13" cy="4.2" r="1.6" />
          <path d="M11.5 8l2.2 1.2 1 3.3M11.5 8l-2 3.2 1 4.3-2 4.3M13.7 12.5l2.3 3.5" />
        </>
      );
    case "meeting":
      return (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
          <path d="M16 5.6a3 3 0 0 1 0 5.6M20.5 20a5.5 5.5 0 0 0-4-5.3" />
        </>
      );
    case "cafe":
      return (
        <>
          <path d="M5 8.5h11v4.5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8.5z" />
          <path d="M16 9.5h2.5a2 2 0 0 1 0 4H16" />
          <path d="M8 3.5c0 1-1 1.2-1 2.2M11 3.5c0 1-1 1.2-1 2.2" />
        </>
      );
    case "sparkle":
      return <path d="M12 3.2l1.8 5.4 5.4 1.8-5.4 1.8L12 17.6l-1.8-5.4L4.8 10.4l5.4-1.8L12 3.2z" />;
    case "tops":
      return <path d="M8.5 3.5l-4.5 3 2 3 2-1.2V20.5h8V8.3l2 1.2 2-3-4.5-3-1.8 2h-3.4z" />;
    case "bottoms":
      return <path d="M6.5 3.5h11l-.8 17h-4l-1.2-10-1.2 10h-4z" />;
    case "umbrella":
      return (
        <>
          <path d="M12 3.5a8.5 8.5 0 0 1 8.5 7.5H3.5A8.5 8.5 0 0 1 12 3.5z" />
          <path d="M12 11v7.5a2 2 0 0 1-4 0" />
        </>
      );
    case "shoes":
      return (
        <>
          <path d="M3 16.5l.5-4 3.5-1.8 1.8 1.8 3.7-.8.5 2.6 5 1.5h2v2.5H3z" />
          <path d="M8.8 12.3l1.5 1.2M11.5 11.7l1.3 1.2" />
        </>
      );
    case "palette":
      return (
        <>
          <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 1.8-1 1.4-1.9-.5-1 .2-1.9 1.3-1.9h2.1a3 3 0 0 0 3-3 8.5 8.5 0 0 0-7.8-9.2z" />
          <circle cx="8" cy="11" r="1" />
          <circle cx="12" cy="8" r="1" />
          <circle cx="16" cy="11" r="1" />
        </>
      );
    case "work":
      return (
        <>
          <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
          <path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5" />
          <path d="M3.5 12.5h17" />
        </>
      );
    case "home":
      return (
        <>
          <path d="M4 11l8-6.5 8 6.5" />
          <path d="M6 10v9.5h12V10" />
        </>
      );
    case "school":
      return (
        <>
          <path d="M12 4l9 4-9 4-9-4 9-4z" />
          <path d="M7 10.2v4.3c0 1.4 10 1.4 10 0v-4.3" />
        </>
      );
    case "meal":
      return (
        <>
          <path d="M7 3.5v8M5 3.5v4a2 2 0 0 0 4 0v-4M7 11.5v9" />
          <path d="M16.5 3.5c-1.5 0-2.5 1.8-2.5 4.5s1 4 2.5 4 2.5-1.3 2.5-4-1-4.5-2.5-4.5zM16.5 12v8.5" />
        </>
      );
    case "calendar":
      return (
        <>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3.2v3.6M16 3.2v3.6M4 10h16" />
        </>
      );
    default:
      return null;
  }
}

export function CalIcon({
  name,
  size = 16,
  className,
}: {
  name: CalIconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {paths(name)}
    </svg>
  );
}
