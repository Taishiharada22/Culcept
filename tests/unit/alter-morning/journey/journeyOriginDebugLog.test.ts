/**
 * journeyOriginDebugLog unit tests (CEO 2026-05-03 PII 規律 = A 案 verify)
 *
 * 検証:
 *   1. ALTER_MORNING_DEBUG_RAW_LABELS 未設定 / "false" 時: rawLabel / labelHash が出ない
 *   2. = "true" 時: rawLabel + labelHash 出る (= debug only)
 *   3. logJourneyOriginIntent (generated/skipped) 両 path 検証
 *   4. logJourneyOriginResolved (kind=known_label_only/known_exact/unknown) 全 path 検証
 *   5. PII 漏洩なし production log: kind / source / classification / labelLen のみ
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  logJourneyOriginResolved,
  logJourneyOriginIntent,
  logMorningProtocolDetect,
} from "@/lib/alter-morning/journey/journeyOriginDebugLog";
import type { JourneyAnchorState } from "@/lib/alter-morning/journey/anchorState";

// ─── env / console mock ───
const ORIGINAL_DEBUG_FLAG = process.env.ALTER_MORNING_DEBUG_RAW_LABELS;
let infoSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  infoSpy.mockRestore();
  // restore env
  if (ORIGINAL_DEBUG_FLAG === undefined) {
    delete process.env.ALTER_MORNING_DEBUG_RAW_LABELS;
  } else {
    process.env.ALTER_MORNING_DEBUG_RAW_LABELS = ORIGINAL_DEBUG_FLAG;
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PII 規律 (= A 案 verify)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[PII] ALTER_MORNING_DEBUG_RAW_LABELS 未設定時 (= production)", () => {
  beforeEach(() => {
    delete process.env.ALTER_MORNING_DEBUG_RAW_LABELS;
  });

  it("logJourneyOriginResolved (known_label_only): rawLabel/labelHash 出ない", () => {
    const origin: JourneyAnchorState = {
      kind: "known_label_only",
      label: "東京駅",
      source: "user_declared",
    };
    logJourneyOriginResolved(origin, "test");
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const logged = infoSpy.mock.calls[0][0] as string;
    expect(logged).toContain("kind=known_label_only");
    expect(logged).toContain("source=user_declared");
    expect(logged).toContain("classification=public_poi_proper_noun");
    expect(logged).toContain("labelLen=3");
    // PII 漏洩なし
    expect(logged).not.toContain("東京駅");
    expect(logged).not.toContain("rawLabel");
    expect(logged).not.toContain("labelHash");
  });

  it("logJourneyOriginIntent (generated): rawLabel/labelHash 出ない", () => {
    logJourneyOriginIntent({
      generated: true,
      label: "東京駅",
      classification: "public_poi_proper_noun",
    });
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const logged = infoSpy.mock.calls[0][0] as string;
    expect(logged).toContain("generated=true");
    expect(logged).toContain("classification=public_poi_proper_noun");
    expect(logged).toContain("labelLen=3");
    expect(logged).not.toContain("東京駅");
    expect(logged).not.toContain("rawLabel");
    expect(logged).not.toContain("labelHash");
  });

  it("logJourneyOriginIntent (skipped): reason のみ", () => {
    logJourneyOriginIntent({ generated: false, reason: "kind_known_exact" });
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const logged = infoSpy.mock.calls[0][0] as string;
    expect(logged).toContain("generated=false");
    expect(logged).toContain("reason=kind_known_exact");
  });
});

describe('[PII] ALTER_MORNING_DEBUG_RAW_LABELS = "false" (= explicitly off)', () => {
  beforeEach(() => {
    process.env.ALTER_MORNING_DEBUG_RAW_LABELS = "false";
  });

  it("rawLabel/labelHash 出ない (= 文字列 'false' は disabled 扱い)", () => {
    const origin: JourneyAnchorState = {
      kind: "known_label_only",
      label: "東京駅",
      source: "user_declared",
    };
    logJourneyOriginResolved(origin, "test");
    const logged = infoSpy.mock.calls[0][0] as string;
    expect(logged).not.toContain("rawLabel");
    expect(logged).not.toContain("labelHash");
    expect(logged).not.toContain("東京駅");
  });
});

describe('[PII] ALTER_MORNING_DEBUG_RAW_LABELS = "true" (= debug preview)', () => {
  beforeEach(() => {
    process.env.ALTER_MORNING_DEBUG_RAW_LABELS = "true";
  });

  it("logJourneyOriginResolved (known_label_only): rawLabel + labelHash 出る (= async)", async () => {
    const origin: JourneyAnchorState = {
      kind: "known_label_only",
      label: "東京駅",
      source: "user_declared",
    };
    logJourneyOriginResolved(origin, "test");
    // hashLabelForDebug は lazy await import なので microtask 待ち
    await new Promise((r) => setTimeout(r, 50));
    const allLogs = infoSpy.mock.calls.map((c: unknown[]) => c[0] as string).join("\n");
    expect(allLogs).toContain("rawLabel=\"東京駅\"");
    expect(allLogs).toMatch(/labelHash=[a-f0-9]{8}/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 全 path 網羅 (= 既存 invariant)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[Path] logJourneyOriginResolved kind 別", () => {
  beforeEach(() => {
    delete process.env.ALTER_MORNING_DEBUG_RAW_LABELS;
  });

  it("known_exact: source 出る", () => {
    logJourneyOriginResolved(
      {
        kind: "known_exact",
        label: "現在地",
        lat: 35.0,
        lng: 139.0,
        source: "current",
      },
      "legacy_adapter",
    );
    const logged = infoSpy.mock.calls[0][0] as string;
    expect(logged).toContain("kind=known_exact");
    expect(logged).toContain("source=current");
    expect(logged).toContain("labelLen=3"); // 「現在地」 3 chars
    expect(logged).not.toContain("現在地");
  });

  it("unknown: source=unknown", () => {
    logJourneyOriginResolved(
      { kind: "unknown", reason: "no_baseline" },
      "legacy_adapter",
    );
    const logged = infoSpy.mock.calls[0][0] as string;
    expect(logged).toContain("kind=unknown");
    expect(logged).toContain("source=unknown");
    expect(logged).toContain("classification=n/a");
    expect(logged).toContain("labelLen=0");
  });

  it("null/undefined: origin=null log", () => {
    logJourneyOriginResolved(null, "test_caller");
    const logged = infoSpy.mock.calls[0][0] as string;
    expect(logged).toContain("origin=null");
    expect(logged).toContain("caller=test_caller");
  });
});

describe("[Path] logMorningProtocolDetect", () => {
  it("intent + messageLen 出る、message 自体は出ない", () => {
    logMorningProtocolDetect("strong", 25);
    const logged = infoSpy.mock.calls[0][0] as string;
    expect(logged).toBe("[morning-protocol:detect] intent=strong messageLen=25");
  });
});
