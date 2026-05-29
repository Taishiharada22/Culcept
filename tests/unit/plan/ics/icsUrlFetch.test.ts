/**
 * ICS URL Import (Track A) A-1 — icsUrlFetch unit test
 *
 * 検証範囲 (= readiness §3 SSRF / §6 負例必須):
 *   - normalizeIcsUrl: scheme / webcal / userinfo / port
 *   - isBlockedIp: IPv4 / IPv6 / IPv4-mapped / 表記回避
 *   - fetchIcsText: blocked (literal / resolved) / redirect 再検証 / size / body / timeout / http_error
 *     (= DI mock で network なし、 fail-closed を証明)
 */

import { describe, expect, it, vi } from "vitest";

import {
  fetchIcsText,
  isBlockedIp,
  normalizeIcsUrl,
} from "@/lib/plan/ics/icsUrlFetch";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mock helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeRes(opts: {
  status?: number;
  headers?: Record<string, string>;
  text?: string;
  bodyChunks?: Uint8Array[];
}): Response {
  const status = opts.status ?? 200;
  const headers = new Headers(opts.headers ?? {});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = {
    status,
    ok: status >= 200 && status < 300,
    headers,
    text: async () => opts.text ?? "",
    body: undefined,
  };
  if (opts.bodyChunks) {
    let i = 0;
    res.body = {
      getReader: () => ({
        read: async () =>
          i < opts.bodyChunks!.length
            ? { done: false, value: opts.bodyChunks![i++] }
            : { done: true, value: undefined },
        cancel: async () => {},
      }),
    };
  }
  return res as Response;
}

const ICS_BODY = "BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR\n";
const PUBLIC_IP = "93.184.216.34";

/** 公開 IP に解決する lookup */
const publicLookup = vi.fn(async () => [PUBLIC_IP]);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// normalizeIcsUrl
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("normalizeIcsUrl", () => {
  it("https → ok", () => {
    const r = normalizeIcsUrl("https://cal.example.com/feed.ics");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url.protocol).toBe("https:");
  });

  it("webcal:// → https:// に rewrite", () => {
    const r = normalizeIcsUrl("webcal://cal.example.com/feed.ics");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url.protocol).toBe("https:");
      expect(r.url.hostname).toBe("cal.example.com");
    }
  });

  it("http:// → scheme_not_https", () => {
    const r = normalizeIcsUrl("http://cal.example.com/feed.ics");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("scheme_not_https");
  });

  it("ftp:// / file:// → scheme_not_https", () => {
    expect(normalizeIcsUrl("ftp://h/x").ok).toBe(false);
    const f = normalizeIcsUrl("file:///etc/passwd");
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.reason).toBe("scheme_not_https");
  });

  it("userinfo (user:pass@) → userinfo_not_allowed", () => {
    const r = normalizeIcsUrl("https://user:pass@cal.example.com/feed.ics");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("userinfo_not_allowed");
  });

  it("非標準ポート → port_not_allowed", () => {
    const r = normalizeIcsUrl("https://cal.example.com:8443/feed.ics");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("port_not_allowed");
  });

  it("明示 443 → ok (= URL が default 化)", () => {
    expect(normalizeIcsUrl("https://cal.example.com:443/feed.ics").ok).toBe(true);
  });

  it("空 / 不正文字列 → invalid_url", () => {
    expect(normalizeIcsUrl("").ok).toBe(false);
    expect(normalizeIcsUrl("   ").ok).toBe(false);
    const g = normalizeIcsUrl("not a url");
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.reason).toBe("invalid_url");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// isBlockedIp
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isBlockedIp (IPv4)", () => {
  it("private / loopback / link-local / 特殊 → blocked", () => {
    for (const ip of [
      "0.0.0.0",
      "10.0.0.1",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254", // ← cloud metadata、 最重要
      "172.16.0.1",
      "172.31.255.255",
      "192.0.0.1",
      "192.0.2.5",
      "192.168.1.1",
      "198.18.0.1",
      "198.51.100.5",
      "203.0.113.5",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isBlockedIp(ip), `${ip} should be blocked`).toBe(true);
    }
  });

  it("public unicast → allowed (= 過剰遮断しない)", () => {
    for (const ip of [
      "8.8.8.8",
      "1.1.1.1",
      "93.184.216.34",
      "172.15.0.1", // 172.16/12 の外
      "172.32.0.1",
      "100.63.0.1", // CGNAT の外
      "100.128.0.1",
      "192.167.0.1",
      "192.169.0.1",
      "192.0.66.1", // 公開 (Automattic 等)
    ]) {
      expect(isBlockedIp(ip), `${ip} should be allowed`).toBe(false);
    }
  });
});

describe("isBlockedIp (IPv6 + mapped)", () => {
  it("loopback / ULA / link-local / multicast → blocked", () => {
    for (const ip of ["::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1"]) {
      expect(isBlockedIp(ip), `${ip} should be blocked`).toBe(true);
    }
  });

  it("IPv4-mapped/compat で内部 IP を偽装 → blocked", () => {
    expect(isBlockedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIp("::ffff:169.254.169.254")).toBe(true);
    expect(isBlockedIp("::ffff:10.0.0.1")).toBe(true);
  });

  it("public IPv6 → allowed", () => {
    expect(isBlockedIp("2606:4700:4700::1111")).toBe(false); // cloudflare
    expect(isBlockedIp("2404:6800:4003::1")).toBe(false); // google
    expect(isBlockedIp("::ffff:8.8.8.8")).toBe(false); // mapped public
  });

  it("非 IP 文字列 → blocked (fail-closed)", () => {
    expect(isBlockedIp("notanip")).toBe(true);
    expect(isBlockedIp("")).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// fetchIcsText — happy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("fetchIcsText — happy path", () => {
  it("公開 host → 200 + BEGIN:VCALENDAR → ok", async () => {
    const fetchImpl = vi.fn(async () => makeRes({ status: 200, text: ICS_BODY }));
    const lookup = vi.fn(async () => [PUBLIC_IP]);
    const r = await fetchIcsText("https://cal.example.com/feed.ics", { lookup, fetchImpl });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.icsText).toContain("BEGIN:VCALENDAR");
      expect(r.finalHost).toBe("cal.example.com");
    }
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("webcal:// 入力でも取得できる", async () => {
    let calledUrl = "";
    const fetchImpl = vi.fn(async (u: Parameters<typeof fetch>[0]) => {
      calledUrl = String(u);
      return makeRes({ status: 200, text: ICS_BODY });
    });
    const r = await fetchIcsText("webcal://cal.example.com/feed.ics", {
      lookup: async () => [PUBLIC_IP],
      fetchImpl,
    });
    expect(r.ok).toBe(true);
    // fetch は https URL で呼ばれる (= webcal→https 変換の証跡)
    expect(calledUrl).toMatch(/^https:\/\//);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// fetchIcsText — SSRF 遮断 (= 負例、 fail-closed)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("fetchIcsText — SSRF blocked (= fetch しない)", () => {
  it("hostname が private に解決 → blocked_address (= fetch 呼ばれない)", async () => {
    const fetchImpl = vi.fn(async () => makeRes({ text: ICS_BODY }));
    const lookup = vi.fn(async () => ["10.0.0.5"]);
    const r = await fetchIcsText("https://evil.example.com/feed.ics", { lookup, fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("blocked_address");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("IP literal metadata 169.254.169.254 → blocked (= lookup も fetch も呼ばれない)", async () => {
    const fetchImpl = vi.fn(async () => makeRes({ text: ICS_BODY }));
    const lookup = vi.fn(async () => [PUBLIC_IP]);
    const r = await fetchIcsText("https://169.254.169.254/latest/meta-data/", { lookup, fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("blocked_address");
      expect(r.detail).toBe("ip_literal");
    }
    expect(lookup).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("10進表記 loopback (2130706433) → URL canonical 化で blocked", async () => {
    const fetchImpl = vi.fn(async () => makeRes({ text: ICS_BODY }));
    const r = await fetchIcsText("https://2130706433/feed.ics", {
      lookup: publicLookup,
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("blocked_address");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("16進表記 loopback (0x7f000001) → blocked", async () => {
    const fetchImpl = vi.fn(async () => makeRes({ text: ICS_BODY }));
    const r = await fetchIcsText("https://0x7f000001/feed.ics", {
      lookup: publicLookup,
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("blocked_address");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("http scheme → scheme_not_https (= fetch しない)", async () => {
    const fetchImpl = vi.fn(async () => makeRes({ text: ICS_BODY }));
    const r = await fetchIcsText("http://cal.example.com/feed.ics", {
      lookup: publicLookup,
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("scheme_not_https");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("DNS 解決失敗 → dns_resolution_failed", async () => {
    const r1 = await fetchIcsText("https://nx.example.com/feed.ics", {
      lookup: async () => {
        throw new Error("ENOTFOUND");
      },
      fetchImpl: vi.fn(async () => makeRes({ text: ICS_BODY })),
    });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.reason).toBe("dns_resolution_failed");

    const r2 = await fetchIcsText("https://empty.example.com/feed.ics", {
      lookup: async () => [],
      fetchImpl: vi.fn(async () => makeRes({ text: ICS_BODY })),
    });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe("dns_resolution_failed");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// fetchIcsText — redirect 再検証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("fetchIcsText — redirect", () => {
  it("redirect 先が internal → blocked (= 2 回目 fetch しない)", async () => {
    const fetchImpl = vi.fn(async () =>
      makeRes({ status: 302, headers: { location: "https://169.254.169.254/x" } }),
    );
    const r = await fetchIcsText("https://cal.example.com/feed.ics", {
      lookup: publicLookup,
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("blocked_address");
    expect(fetchImpl).toHaveBeenCalledTimes(1); // redirect 1 回のみ、 内部へは飛ばない
  });

  it("redirect 先が public → 追従して ok", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      return call === 1
        ? makeRes({ status: 302, headers: { location: "https://cdn.example.com/real.ics" } })
        : makeRes({ status: 200, text: ICS_BODY });
    });
    const r = await fetchIcsText("https://cal.example.com/feed.ics", {
      lookup: async () => [PUBLIC_IP],
      fetchImpl,
    });
    expect(r.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("redirect 過多 → too_many_redirects", async () => {
    const fetchImpl = vi.fn(async () =>
      makeRes({ status: 302, headers: { location: "https://loop.example.com/next.ics" } }),
    );
    const r = await fetchIcsText("https://cal.example.com/feed.ics", {
      lookup: async () => [PUBLIC_IP],
      fetchImpl,
      maxRedirects: 2,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too_many_redirects");
  });

  it("redirect で Location 無し → redirect_no_location", async () => {
    const fetchImpl = vi.fn(async () => makeRes({ status: 302 }));
    const r = await fetchIcsText("https://cal.example.com/feed.ics", {
      lookup: async () => [PUBLIC_IP],
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("redirect_no_location");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// fetchIcsText — body / size / http / timeout
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("fetchIcsText — body / size / http / timeout", () => {
  it("HTML 本文 (BEGIN:VCALENDAR なし) → not_calendar_body", async () => {
    const fetchImpl = vi.fn(async () => makeRes({ status: 200, text: "<html>not ics</html>" }));
    const r = await fetchIcsText("https://cal.example.com/feed.ics", {
      lookup: async () => [PUBLIC_IP],
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_calendar_body");
  });

  it("Content-Length が上限超 → too_large", async () => {
    const fetchImpl = vi.fn(async () =>
      makeRes({ status: 200, headers: { "content-length": "9999999" }, text: ICS_BODY }),
    );
    const r = await fetchIcsText("https://cal.example.com/feed.ics", {
      lookup: async () => [PUBLIC_IP],
      fetchImpl,
      maxBytes: 1024,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too_large");
  });

  it("body stream が上限超 → too_large", async () => {
    const big = new Uint8Array(2000);
    const fetchImpl = vi.fn(async () =>
      makeRes({ status: 200, bodyChunks: [big, big] }),
    );
    const r = await fetchIcsText("https://cal.example.com/feed.ics", {
      lookup: async () => [PUBLIC_IP],
      fetchImpl,
      maxBytes: 1024,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too_large");
  });

  it("非 2xx → http_error + status detail", async () => {
    const fetchImpl = vi.fn(async () => makeRes({ status: 404, text: "" }));
    const r = await fetchIcsText("https://cal.example.com/feed.ics", {
      lookup: async () => [PUBLIC_IP],
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("http_error");
      expect(r.detail).toBe("404");
    }
  });

  it("AbortError → timeout", async () => {
    const fetchImpl = vi.fn(async () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    });
    const r = await fetchIcsText("https://cal.example.com/feed.ics", {
      lookup: async () => [PUBLIC_IP],
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("timeout");
  });

  it("一般 fetch 例外 → fetch_failed", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const r = await fetchIcsText("https://cal.example.com/feed.ics", {
      lookup: async () => [PUBLIC_IP],
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("fetch_failed");
  });
});
