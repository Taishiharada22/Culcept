/**
 * describeAnchorBlock — JourneyAnchorBlock UI 描画判断の純粋関数 unit test
 * (PR B-1 Commit 4 GPT (1) 補強)
 *
 * CEO/GPT 2026-05-02 規律:
 *   MorningPlanCard の JourneyAnchorBlock JSX が分岐する 4 variant を
 *   純粋関数 describeAnchorBlock として抽出し、Vitest で UI 決定を assert する。
 *   RTL / jsdom 不要 (環境追加なし、PR scope 維持)。
 *
 * 検証 4 variant:
 *   - exact_confirmed: known_exact + 通常 source (current/registered_home/user_override 等)
 *   - exact_assumed:   known_exact + source="default_round_trip" (assumed end)
 *   - label_only:      known_label_only (coords なし)
 *   - unknown:         unknown (silent fail 排除)
 *
 * GPT 必須証明:
 *   - origin (source=current) → variant="exact_confirmed"、secondaryText なし
 *   - end (source=default_round_trip) → variant="exact_assumed"、secondaryText="(推定)"
 *   - origin unknown → variant="unknown"、primaryText="起点未確定"
 *   - end unknown → variant="unknown"、primaryText="終点未確定"
 */

import { describe, it, expect } from "vitest";
import {
  describeAnchorBlock,
  type JourneyAnchorState,
} from "@/lib/alter-morning/journey/anchorState";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// exact_confirmed (known_exact + 通常 source)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("describeAnchorBlock — exact_confirmed (通常 source)", () => {
  it("origin source=current → variant=exact_confirmed + primaryText=現在地 + secondaryText なし", () => {
    const anchor: JourneyAnchorState = {
      kind: "known_exact",
      label: "現在地",
      lat: 35.6,
      lng: 139.7,
      source: "current",
    };
    const desc = describeAnchorBlock(anchor, {
      roleLabel: "起点",
      unknownLabel: "起点未確定",
    });
    expect(desc.variant).toBe("exact_confirmed");
    expect(desc.primaryText).toBe("現在地");
    expect(desc.secondaryText).toBeUndefined();
    expect(desc.roleLabel).toBe("起点");
  });

  it("origin source=registered_home → variant=exact_confirmed + 自宅", () => {
    const anchor: JourneyAnchorState = {
      kind: "known_exact",
      label: "自宅",
      lat: 35.6,
      lng: 139.7,
      source: "registered_home",
    };
    const desc = describeAnchorBlock(anchor, {
      roleLabel: "起点",
      unknownLabel: "起点未確定",
    });
    expect(desc.variant).toBe("exact_confirmed");
    expect(desc.primaryText).toBe("自宅");
    expect(desc.secondaryText).toBeUndefined();
  });

  it("end source=user_override → variant=exact_confirmed (PR B-2 で user 確定済 = confirmed)", () => {
    const anchor: JourneyAnchorState = {
      kind: "known_exact",
      label: "ホテル",
      lat: 35.6,
      lng: 139.7,
      source: "user_override",
    };
    const desc = describeAnchorBlock(anchor, {
      roleLabel: "終点",
      unknownLabel: "終点未確定",
    });
    expect(desc.variant).toBe("exact_confirmed");
    expect(desc.secondaryText).toBeUndefined();
  });

  it("end source=comprehension_explicit → variant=exact_confirmed (発話で明示済 = confirmed)", () => {
    const anchor: JourneyAnchorState = {
      kind: "known_exact",
      label: "友達の家",
      lat: 35.6,
      lng: 139.7,
      source: "comprehension_explicit",
    };
    const desc = describeAnchorBlock(anchor, {
      roleLabel: "終点",
      unknownLabel: "終点未確定",
    });
    expect(desc.variant).toBe("exact_confirmed");
    expect(desc.secondaryText).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// exact_assumed (GPT 必須証明: default_round_trip)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("describeAnchorBlock — exact_assumed (GPT 必須証明)", () => {
  it("end source=default_round_trip → variant=exact_assumed + secondaryText=(推定)", () => {
    const anchor: JourneyAnchorState = {
      kind: "known_exact",
      label: "帰宅",
      lat: 35.6,
      lng: 139.7,
      source: "default_round_trip",
    };
    const desc = describeAnchorBlock(anchor, {
      roleLabel: "終点",
      unknownLabel: "終点未確定",
    });
    expect(desc.variant).toBe("exact_assumed");
    expect(desc.primaryText).toBe("帰宅");
    expect(desc.secondaryText).toBe("(推定)");
    expect(desc.roleLabel).toBe("終点");
  });

  it("UI 区別の根拠: assumed と confirmed で variant が異なる (GPT 規律 (b))", () => {
    const assumed: JourneyAnchorState = {
      kind: "known_exact",
      label: "帰宅",
      lat: 35.6,
      lng: 139.7,
      source: "default_round_trip",
    };
    const confirmed: JourneyAnchorState = {
      kind: "known_exact",
      label: "ホテル",
      lat: 35.6,
      lng: 139.7,
      source: "user_override",
    };
    const descA = describeAnchorBlock(assumed, {
      roleLabel: "終点",
      unknownLabel: "終点未確定",
    });
    const descC = describeAnchorBlock(confirmed, {
      roleLabel: "終点",
      unknownLabel: "終点未確定",
    });
    expect(descA.variant).not.toBe(descC.variant);
    expect(descA.secondaryText).toBeDefined(); // (推定)
    expect(descC.secondaryText).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// label_only (coords なし)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("describeAnchorBlock — label_only", () => {
  it("kind=known_label_only → variant=label_only + secondaryText=(場所未確定)", () => {
    const anchor: JourneyAnchorState = {
      kind: "known_label_only",
      label: "ホテル",
      source: "comprehension_explicit",
    };
    const desc = describeAnchorBlock(anchor, {
      roleLabel: "終点",
      unknownLabel: "終点未確定",
    });
    expect(desc.variant).toBe("label_only");
    expect(desc.primaryText).toBe("ホテル");
    expect(desc.secondaryText).toBe("(場所未確定)");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// unknown (silent fail 排除の核心)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("describeAnchorBlock — unknown (silent fail 排除)", () => {
  it("origin unknown → variant=unknown + primaryText=起点未確定", () => {
    const anchor: JourneyAnchorState = { kind: "unknown", reason: "no_baseline" };
    const desc = describeAnchorBlock(anchor, {
      roleLabel: "起点",
      unknownLabel: "起点未確定",
    });
    expect(desc.variant).toBe("unknown");
    expect(desc.primaryText).toBe("起点未確定");
    expect(desc.roleLabel).toBe("起点");
  });

  it("end unknown → variant=unknown + primaryText=終点未確定", () => {
    const anchor: JourneyAnchorState = {
      kind: "unknown",
      reason: "no_endpoint_signal",
    };
    const desc = describeAnchorBlock(anchor, {
      roleLabel: "終点",
      unknownLabel: "終点未確定",
    });
    expect(desc.variant).toBe("unknown");
    expect(desc.primaryText).toBe("終点未確定");
  });

  it("unknown は reason に依存しない (UI は 1 行表示で統一)", () => {
    const reasons = ["denied", "unrequested", "no_baseline", "no_endpoint_signal"] as const;
    for (const reason of reasons) {
      const anchor: JourneyAnchorState = { kind: "unknown", reason };
      const desc = describeAnchorBlock(anchor, {
        roleLabel: "起点",
        unknownLabel: "起点未確定",
      });
      expect(desc.variant).toBe("unknown");
      expect(desc.primaryText).toBe("起点未確定");
    }
  });
});
