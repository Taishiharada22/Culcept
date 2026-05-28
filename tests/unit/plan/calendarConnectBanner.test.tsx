/**
 * P3-A-1-1-h — CalendarConnectBanner render contract + parser test
 *
 * 既存 plan test pattern (= eventCardRenderContract.test.tsx) 踏襲:
 *   - @testing-library なし (= react-dom/server.renderToStaticMarkup のみ)
 *   - LLM / API / DB / network 不使用
 *   - event handler test は本 module の範囲外 (= 別 integration phase)
 *
 * 検証範囲:
 *   - parseBannerStatus: URL params → status 全 kind 網羅
 *   - describeError: 13 error code 全てに非空 message
 *   - isRetryable: not_configured / token_invalid_client / auth_failed → false、 他 true
 *   - render markup: idle → null / success / canceled / error の role + text + testid
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CalendarConnectBanner,
  describeError,
  isRetryable,
  parseBannerStatus,
} from "@/app/(culcept)/plan/components/CalendarConnectBanner";

function paramsFrom(obj: Record<string, string>): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) sp.set(k, v);
  return sp;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// parseBannerStatus (= pure)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parseBannerStatus", () => {
  it("calendar_connected=1 → success, partial=false", () => {
    const s = parseBannerStatus(paramsFrom({ calendar_connected: "1" }));
    expect(s.kind).toBe("success");
    if (s.kind === "success") expect(s.partial).toBe(false);
  });

  it("calendar_connected=1 + partial=1 → success, partial=true", () => {
    const s = parseBannerStatus(
      paramsFrom({ calendar_connected: "1", calendar_connect_partial: "1" }),
    );
    expect(s.kind).toBe("success");
    if (s.kind === "success") expect(s.partial).toBe(true);
  });

  it("error=canceled → canceled kind", () => {
    const s = parseBannerStatus(paramsFrom({ calendar_connect_error: "canceled" }));
    expect(s.kind).toBe("canceled");
  });

  it("error=not_configured → error code='not_configured'", () => {
    const s = parseBannerStatus(
      paramsFrom({ calendar_connect_error: "not_configured" }),
    );
    expect(s.kind).toBe("error");
    if (s.kind === "error") expect(s.code).toBe("not_configured");
  });

  it("error code 未知値 → token_unknown fallback", () => {
    const s = parseBannerStatus(
      paramsFrom({ calendar_connect_error: "nonsense_code" }),
    );
    expect(s.kind).toBe("error");
    if (s.kind === "error") expect(s.code).toBe("token_unknown");
  });

  it("query なし → idle", () => {
    const s = parseBannerStatus(paramsFrom({}));
    expect(s.kind).toBe("idle");
  });

  it("googleError 付き error → error 経路で googleError 設定", () => {
    const s = parseBannerStatus(
      paramsFrom({
        calendar_connect_error: "token_invalid_grant",
        google_error: "expired",
      }),
    );
    expect(s.kind).toBe("error");
    if (s.kind === "error") {
      expect(s.code).toBe("token_invalid_grant");
      expect(s.googleError).toBe("expired");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// describeError / isRetryable (= pure)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("describeError", () => {
  it("13 error code 全てに非空 message を返す", () => {
    const codes = [
      "not_configured",
      "canceled",
      "invalid_request",
      "state_missing",
      "state_mismatch",
      "token_invalid_grant",
      "token_invalid_client",
      "token_invalid_request",
      "token_network",
      "token_missing_refresh_token",
      "token_unknown",
      "auth_failed",
      "db_connection_failed",
    ] as const;
    for (const c of codes) {
      const msg = describeError(c);
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it("token_invalid_grant の文言に 「有効期限」 が含まれる", () => {
    expect(describeError("token_invalid_grant")).toContain("有効期限");
  });
});

describe("isRetryable", () => {
  it("not_configured / token_invalid_client / auth_failed → false", () => {
    expect(isRetryable("not_configured")).toBe(false);
    expect(isRetryable("token_invalid_client")).toBe(false);
    expect(isRetryable("auth_failed")).toBe(false);
  });

  it("retryable code 群 → true", () => {
    expect(isRetryable("invalid_request")).toBe(true);
    expect(isRetryable("state_mismatch")).toBe(true);
    expect(isRetryable("token_invalid_grant")).toBe(true);
    expect(isRetryable("token_network")).toBe(true);
    expect(isRetryable("db_connection_failed")).toBe(true);
    expect(isRetryable("token_unknown")).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Render markup (= renderToStaticMarkup で string HTML 検査)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CalendarConnectBanner — render markup", () => {
  it("idle → 空 string (= 何も render しない)", () => {
    const html = renderToStaticMarkup(
      <CalendarConnectBanner status={{ kind: "idle" }} />,
    );
    expect(html).toBe("");
  });

  it("success → role='status' + 「繋がりました」 + dismiss button", () => {
    const html = renderToStaticMarkup(
      <CalendarConnectBanner status={{ kind: "success", partial: false }} />,
    );
    expect(html).toContain('data-testid="calendar-connect-banner-success"');
    expect(html).toContain('role="status"');
    expect(html).toContain("繋がりました");
    expect(html).toContain('data-testid="calendar-connect-banner-dismiss"');
  });

  it("success+partial → 「次回再試行」 補足文", () => {
    const html = renderToStaticMarkup(
      <CalendarConnectBanner status={{ kind: "success", partial: true }} />,
    );
    expect(html).toContain("次回再試行");
  });

  it("canceled → role='status' + 「やめました」", () => {
    const html = renderToStaticMarkup(
      <CalendarConnectBanner status={{ kind: "canceled" }} />,
    );
    expect(html).toContain('data-testid="calendar-connect-banner-canceled"');
    expect(html).toContain('role="status"');
    expect(html).toContain("やめました");
  });

  it("error retryable + onRetry あり → role='alert' + retry button + data-error-code", () => {
    const html = renderToStaticMarkup(
      <CalendarConnectBanner
        status={{ kind: "error", code: "token_invalid_grant" }}
        onRetry={() => {}}
      />,
    );
    expect(html).toContain('data-testid="calendar-connect-banner-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('data-error-code="token_invalid_grant"');
    expect(html).toContain('data-testid="calendar-connect-banner-retry"');
    expect(html).toContain("有効期限");
  });

  it("error non-retryable (= not_configured) → retry button なし", () => {
    const html = renderToStaticMarkup(
      <CalendarConnectBanner
        status={{ kind: "error", code: "not_configured" }}
        onRetry={() => {}}
      />,
    );
    expect(html).toContain('data-testid="calendar-connect-banner-error"');
    expect(html).not.toContain('data-testid="calendar-connect-banner-retry"');
  });

  it("error retryable でも onRetry 未指定 → retry button 出ない", () => {
    const html = renderToStaticMarkup(
      <CalendarConnectBanner
        status={{ kind: "error", code: "state_mismatch" }}
      />,
    );
    expect(html).not.toContain('data-testid="calendar-connect-banner-retry"');
  });

  it("error + googleError → Google: <code> 表示", () => {
    const html = renderToStaticMarkup(
      <CalendarConnectBanner
        status={{ kind: "error", code: "canceled", googleError: "access_denied" }}
      />,
    );
    expect(html).toContain("Google:");
    expect(html).toContain("access_denied");
  });

  it("error → dismiss button (= 共通) も含む", () => {
    const html = renderToStaticMarkup(
      <CalendarConnectBanner status={{ kind: "error", code: "token_network" }} />,
    );
    expect(html).toContain('data-testid="calendar-connect-banner-dismiss"');
  });
});
