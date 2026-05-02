/**
 * Layer 2 (previous day endpoint inheritance) helper unit test (PR B-2c Commit 2)
 *
 * CEO/GPT 2026-05-02 PR B-2c 規律:
 *   previousEndToOrigin / preserveStrongPriorOrigin / isAssumedAnchor() 拡張の
 *   挙動を厳格に固定。route-level final journeyOrigin の確認は Commit 5。
 */

import { describe, it, expect } from "vitest";
import {
  previousEndToOrigin,
  preserveStrongPriorOrigin,
  isAssumedAnchor,
  type JourneyAnchorState,
  type AnchorSource,
} from "@/lib/alter-morning/journey/anchorState";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SHIBUYA = { lat: 35.6595, lng: 139.7004 };

function exactEnd(source: AnchorSource, label: string = "ホテル"): JourneyAnchorState {
  return {
    kind: "known_exact",
    label,
    lat: SHIBUYA.lat,
    lng: SHIBUYA.lng,
    source,
  };
}

function labelOnlyEnd(source: AnchorSource, label: string = "ホテル"): JourneyAnchorState {
  return {
    kind: "known_label_only",
    label,
    source,
  };
}

const unknownAnchor: JourneyAnchorState = {
  kind: "unknown",
  reason: "no_baseline",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// previousEndToOrigin — 変換ルール + cascade guard
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("previousEndToOrigin — 変換ルール (assumed vs confirmed)", () => {
  it("default_round_trip → previous_day_assumed_endpoint (assumed)", () => {
    const result = previousEndToOrigin(exactEnd("default_round_trip", "帰宅"));
    expect(result?.kind).toBe("known_exact");
    if (result?.kind === "known_exact") {
      expect(result.source).toBe("previous_day_assumed_endpoint");
      expect(result.label).toBe("帰宅");
    }
  });

  it("user_explicit_endpoint → previous_day_endpoint (confirmed)", () => {
    const result = previousEndToOrigin(exactEnd("user_explicit_endpoint", "ホテル"));
    expect(result?.kind).toBe("known_exact");
    if (result?.kind === "known_exact") {
      expect(result.source).toBe("previous_day_endpoint");
      expect(result.label).toBe("ホテル");
    }
  });

  it("comprehension_explicit → previous_day_endpoint (confirmed、LLM 由来でも前日由来として扱う)", () => {
    const result = previousEndToOrigin(exactEnd("comprehension_explicit", "ホテル"));
    expect(result?.kind).toBe("known_exact");
    if (result?.kind === "known_exact") {
      expect(result.source).toBe("previous_day_endpoint");
    }
  });

  it("user_override → previous_day_endpoint (confirmed)", () => {
    const result = previousEndToOrigin(exactEnd("user_override", "ホテル"));
    expect(result?.kind).toBe("known_exact");
    if (result?.kind === "known_exact") {
      expect(result.source).toBe("previous_day_endpoint");
    }
  });

  it("known_label_only も source 変換 (識別性維持、travel 不生成は別途)", () => {
    const result = previousEndToOrigin(labelOnlyEnd("user_explicit_endpoint", "ホテル"));
    expect(result?.kind).toBe("known_label_only");
    if (result?.kind === "known_label_only") {
      expect(result.source).toBe("previous_day_endpoint");
      expect(result.label).toBe("ホテル");
    }
  });

  it("known_label_only + default_round_trip → previous_day_assumed_endpoint", () => {
    const result = previousEndToOrigin(labelOnlyEnd("default_round_trip", "帰宅"));
    expect(result?.kind).toBe("known_label_only");
    if (result?.kind === "known_label_only") {
      expect(result.source).toBe("previous_day_assumed_endpoint");
    }
  });

  it("座標は維持される (known_exact での lat/lng)", () => {
    const result = previousEndToOrigin(exactEnd("user_explicit_endpoint"));
    if (result?.kind === "known_exact") {
      expect(result.lat).toBe(SHIBUYA.lat);
      expect(result.lng).toBe(SHIBUYA.lng);
    }
  });
});

describe("previousEndToOrigin — guard (null を返すケース)", () => {
  it("undefined → null", () => {
    expect(previousEndToOrigin(undefined)).toBeNull();
  });

  it("kind === unknown → null (継承材料なし)", () => {
    expect(previousEndToOrigin(unknownAnchor)).toBeNull();
  });

  it("[GPT 修正 1] previous_day_endpoint が journeyEnd → null (cascade guard)", () => {
    // origin 専用 source が journeyEnd に出るのは型レベル不正状態
    expect(previousEndToOrigin(exactEnd("previous_day_endpoint"))).toBeNull();
  });

  it("[GPT 修正 1] previous_day_assumed_endpoint が journeyEnd → null (cascade guard)", () => {
    expect(previousEndToOrigin(exactEnd("previous_day_assumed_endpoint"))).toBeNull();
  });

  it("[GPT 修正 1] cascade 防止: 前日由来 origin を翌日に再継承しない", () => {
    // 前日 plan の journeyEnd に previous_day_* が入るのは異常状態
    // (本来は journeyOrigin 専用)。継承を止めることで「前日の前日の前日...」
    // という cascade 事故を構造的に防ぐ。
    const labelOnlyPrev = labelOnlyEnd("previous_day_endpoint");
    expect(previousEndToOrigin(labelOnlyPrev)).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// preserveStrongPriorOrigin — STRONG prior 守る判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function exactOrigin(source: AnchorSource, label: string = "現在地"): JourneyAnchorState {
  return {
    kind: "known_exact",
    label,
    lat: SHIBUYA.lat,
    lng: SHIBUYA.lng,
    source,
  };
}

describe("preserveStrongPriorOrigin — STRONG source 守る + samePlanDate 連動", () => {
  it("user_declared (STRONG) + samePlanDate=true → 守る", () => {
    const result = preserveStrongPriorOrigin(
      exactOrigin("user_declared", "ホテル"),
      { samePlanDate: true },
    );
    expect(result?.kind).toBe("known_exact");
    if (result?.kind === "known_exact") {
      expect(result.source).toBe("user_declared");
    }
  });

  it("previous_day_endpoint (STRONG) + samePlanDate=true → 守る", () => {
    const result = preserveStrongPriorOrigin(
      exactOrigin("previous_day_endpoint"),
      { samePlanDate: true },
    );
    expect(result?.kind).toBe("known_exact");
    if (result?.kind === "known_exact") {
      expect(result.source).toBe("previous_day_endpoint");
    }
  });

  it("previous_day_assumed_endpoint (STRONG) + samePlanDate=true → 守る", () => {
    const result = preserveStrongPriorOrigin(
      exactOrigin("previous_day_assumed_endpoint"),
      { samePlanDate: true },
    );
    expect(result?.source).toBe("previous_day_assumed_endpoint");
  });

  it("[CEO/GPT 規律] user_override (現時点 endpoint 専用) → 守らない (null)", () => {
    // CEO/GPT 2026-05-02: user_override は現時点 endpoint 専用 (PR B-1 で定義)。
    // origin clarify (PR B-2e) で origin 用に拡張されるまでは STRONG に含めない。
    const result = preserveStrongPriorOrigin(
      exactOrigin("user_override"),
      { samePlanDate: true },
    );
    expect(result).toBeNull();
  });

  it("registered_home (weak) → 守らない (Layer 2 で上書き対象)", () => {
    const result = preserveStrongPriorOrigin(
      exactOrigin("registered_home", "自宅"),
      { samePlanDate: true },
    );
    expect(result).toBeNull();
  });

  it("current (weak) → 守らない (time-dependent fallback)", () => {
    const result = preserveStrongPriorOrigin(
      exactOrigin("current"),
      { samePlanDate: true },
    );
    expect(result).toBeNull();
  });
});

describe("preserveStrongPriorOrigin — samePlanDate=false で守らない", () => {
  it("STRONG + samePlanDate=false → 守らない (新 plan では prior は弱い fallback)", () => {
    const result = preserveStrongPriorOrigin(
      exactOrigin("user_declared"),
      { samePlanDate: false },
    );
    expect(result).toBeNull();
  });

  it("previous_day_endpoint + samePlanDate=false → 守らない", () => {
    const result = preserveStrongPriorOrigin(
      exactOrigin("previous_day_endpoint"),
      { samePlanDate: false },
    );
    expect(result).toBeNull();
  });
});

describe("preserveStrongPriorOrigin — エッジケース", () => {
  it("undefined → null", () => {
    expect(preserveStrongPriorOrigin(undefined, { samePlanDate: true })).toBeNull();
  });

  it("unknown kind → null", () => {
    expect(
      preserveStrongPriorOrigin(unknownAnchor, { samePlanDate: true }),
    ).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// isAssumedAnchor 拡張 (PR B-2c)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isAssumedAnchor 拡張 (PR B-2c)", () => {
  it("default_round_trip → true (既存挙動)", () => {
    expect(isAssumedAnchor(exactOrigin("default_round_trip"))).toBe(true);
  });

  it("[CEO/GPT 必須] previous_day_assumed_endpoint → true (PR B-2c で追加)", () => {
    expect(isAssumedAnchor(exactOrigin("previous_day_assumed_endpoint"))).toBe(true);
  });

  it("previous_day_endpoint (confirmed) → false (assumed ではない)", () => {
    expect(isAssumedAnchor(exactOrigin("previous_day_endpoint"))).toBe(false);
  });

  it("user_declared → false (confirmed)", () => {
    expect(isAssumedAnchor(exactOrigin("user_declared"))).toBe(false);
  });

  it("registered_home → false", () => {
    expect(isAssumedAnchor(exactOrigin("registered_home"))).toBe(false);
  });

  it("kind === unknown → false (= assumed/confirmed の判定対象外)", () => {
    expect(isAssumedAnchor(unknownAnchor)).toBe(false);
  });

  it("kind === known_label_only + default_round_trip → false (kind が known_exact 必須)", () => {
    expect(isAssumedAnchor(labelOnlyEnd("default_round_trip"))).toBe(false);
  });

  it("kind === known_label_only + previous_day_assumed_endpoint → false (同上)", () => {
    expect(isAssumedAnchor(labelOnlyEnd("previous_day_assumed_endpoint"))).toBe(false);
  });
});
