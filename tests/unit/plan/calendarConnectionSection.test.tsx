/**
 * P3-A-1-2 G-α — CalendarConnectionSection + connectionDisplay test
 *
 * 既存 plan test pattern (= renderToStaticMarkup) 踏襲:
 *   - @testing-library なし
 *   - LLM / API / DB / network 不使用
 *   - useEffect の fetch 内部実行は SSR で発火しないため、 初期 loading state のみ markup 検証
 *
 * 検証範囲:
 *   - describeConnectionStatus: 3 status 全カバー
 *   - formatRelativeTime: null / 「たった今」 / 分 / 時間 / 日 / 月 越え
 *   - describeAccessRole + isLikelyEnabledByDefault: 3 role × primary 組み合わせ
 *   - render markup: 初期 loading state 表示 (= fetch 前)
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CalendarConnectionSection } from "@/app/(culcept)/settings/integrations/CalendarConnectionSection";
import {
  describeAccessRole,
  describeConnectionStatus,
  formatRelativeTime,
  isLikelyEnabledByDefault,
} from "@/app/(culcept)/settings/integrations/connectionDisplay";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// describeConnectionStatus
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("describeConnectionStatus", () => {
  it("active → 「接続中」", () => {
    expect(describeConnectionStatus("active")).toBe("接続中");
  });

  it("revoked → 「接続が解除されました」", () => {
    expect(describeConnectionStatus("revoked")).toBe("接続が解除されました");
  });

  it("token_expired → 「再連携が必要です」", () => {
    expect(describeConnectionStatus("token_expired")).toBe("再連携が必要です");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// formatRelativeTime
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatRelativeTime", () => {
  const NOW = new Date("2026-05-26T12:00:00Z").getTime();

  it("null → 「未同期」", () => {
    expect(formatRelativeTime(null, NOW)).toBe("未同期");
  });

  it("空文字 → 「未同期」", () => {
    expect(formatRelativeTime("", NOW)).toBe("未同期");
  });

  it("malformed ISO → 「未同期」", () => {
    expect(formatRelativeTime("not-an-iso", NOW)).toBe("未同期");
  });

  it("30 秒前 → 「たった今」", () => {
    const iso = new Date(NOW - 30_000).toISOString();
    expect(formatRelativeTime(iso, NOW)).toBe("たった今");
  });

  it("5 分前 → 「5 分前」", () => {
    const iso = new Date(NOW - 5 * 60_000).toISOString();
    expect(formatRelativeTime(iso, NOW)).toBe("5 分前");
  });

  it("3 時間前 → 「3 時間前」", () => {
    const iso = new Date(NOW - 3 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(iso, NOW)).toBe("3 時間前");
  });

  it("2 日前 → 「2 日前」", () => {
    const iso = new Date(NOW - 2 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(iso, NOW)).toBe("2 日前");
  });

  it("60 日前 → YYYY/MM/DD 形式", () => {
    const iso = new Date(NOW - 60 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(iso, NOW)).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
  });

  it("未来時刻 (= clock skew) → 「たった今」 (= 安全側)", () => {
    const iso = new Date(NOW + 5_000).toISOString();
    expect(formatRelativeTime(iso, NOW)).toBe("たった今");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// describeAccessRole + isLikelyEnabledByDefault
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("describeAccessRole", () => {
  it("owner / writer / reader それぞれ正しい日本語", () => {
    expect(describeAccessRole("owner")).toBe("自分のカレンダー");
    expect(describeAccessRole("writer")).toBe("編集できる共有");
    expect(describeAccessRole("reader")).toBe("閲覧のみ共有");
  });
});

describe("isLikelyEnabledByDefault (= 親 Q2 採用案 c 反映)", () => {
  it("primary=true → 必ず true (= role 問わず)", () => {
    expect(isLikelyEnabledByDefault("reader", true)).toBe(true);
    expect(isLikelyEnabledByDefault("owner", true)).toBe(true);
  });

  it("owner / writer non-primary → true", () => {
    expect(isLikelyEnabledByDefault("owner", false)).toBe(true);
    expect(isLikelyEnabledByDefault("writer", false)).toBe(true);
  });

  it("reader non-primary → false (= shared 他人 calendar 防止)", () => {
    expect(isLikelyEnabledByDefault("reader", false)).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CalendarConnectionSection render markup (= 初期 loading state)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CalendarConnectionSection — initial markup (= fetch 前 loading state)", () => {
  it("section ルート + Google ヘッダー + loading state", () => {
    const html = renderToStaticMarkup(<CalendarConnectionSection />);

    // section root + aria-label
    expect(html).toContain('data-testid="calendar-connection-section"');
    expect(html).toContain('aria-label="連携 / Google カレンダー"');

    // header text
    expect(html).toContain("Google カレンダー");
    expect(html).toContain("外部の予定を Aneurasync に取り込む連携");

    // initial loading state (= useEffect 前)
    expect(html).toContain('data-testid="calendar-section-loading"');
    expect(html).toContain("接続状態を確認しています");
  });

  it("loading 中は disconnected / connected の content が含まれない", () => {
    const html = renderToStaticMarkup(<CalendarConnectionSection />);
    expect(html).not.toContain('data-testid="calendar-section-disconnected"');
    expect(html).not.toContain('data-testid="calendar-section-connected"');
    expect(html).not.toContain('data-testid="calendar-section-disconnect-button"');
  });

  it("Google G icon (= 4 path SVG) を含む", () => {
    const html = renderToStaticMarkup(<CalendarConnectionSection />);
    // 4 path = Google 4 色 (= 青/緑/黄/赤)
    expect((html.match(/<path/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});
