/**
 * applyAnchorFallback — chat route anchor continuity unit test (PR B-2a Commit 1)
 *
 * CEO/GPT 2026-05-02 PR B-2a 規律:
 *   chat turn を跨いでも journeyOrigin / journeyEnd を失わない。
 *   ただし、新しい低品質情報で高品質 anchor を落とさず、日付が変わった
 *   stale current/default_round_trip を雑に引き継がない。
 *
 * 10 ケース決定表:
 *   #1: fresh known_exact + prior 不問 → fresh
 *   #2: fresh known_label_only + prior known_exact → prior (coords 維持)
 *   #3: fresh known_label_only + prior unknown/undefined → fresh
 *   #4: fresh unknown + prior known_exact (STALE source) + samePlanDate=false → fresh
 *   #5: fresh unknown + prior known_exact (STALE source) + samePlanDate=true → prior
 *   #6: fresh unknown + prior known_exact (非 STALE source) → prior
 *   #7: fresh unknown + prior known_label_only → prior (label 維持)
 *   #8: fresh unknown + prior unknown → fresh
 *   #9: fresh unknown + prior undefined → fresh
 *   #10 [GPT 必須証明]: source=default_round_trip (assumed) も STALE 扱い (samePlanDate=false で継承拒否)
 */

import { describe, it, expect } from "vitest";
import {
  applyAnchorFallback,
  type JourneyAnchorState,
} from "@/lib/alter-morning/journey/anchorState";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const exactCurrent: JourneyAnchorState = {
  kind: "known_exact",
  label: "現在地",
  lat: 35.6595,
  lng: 139.7004,
  source: "current",
};

const exactRegisteredHome: JourneyAnchorState = {
  kind: "known_exact",
  label: "自宅",
  lat: 35.69,
  lng: 139.7,
  source: "registered_home",
};

const exactRoundTrip: JourneyAnchorState = {
  kind: "known_exact",
  label: "帰宅",
  lat: 35.6595,
  lng: 139.7004,
  source: "default_round_trip",
};

const exactUserOverride: JourneyAnchorState = {
  kind: "known_exact",
  label: "ホテル",
  lat: 35.65,
  lng: 139.7,
  source: "user_override",
};

const labelOnly: JourneyAnchorState = {
  kind: "known_label_only",
  label: "ホテル",
  source: "comprehension_explicit",
};

const unknownNoBaseline: JourneyAnchorState = {
  kind: "unknown",
  reason: "no_baseline",
};

const unknownDenied: JourneyAnchorState = {
  kind: "unknown",
  reason: "denied",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Case 1: fresh known_exact は常に fresh
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyAnchorFallback Case #1 — fresh known_exact 優先", () => {
  it("fresh known_exact + prior known_exact → fresh", () => {
    const result = applyAnchorFallback(exactCurrent, exactRegisteredHome, {
      samePlanDate: true,
    });
    expect(result).toEqual(exactCurrent);
  });

  it("fresh known_exact + prior unknown → fresh", () => {
    const result = applyAnchorFallback(exactCurrent, unknownNoBaseline, {
      samePlanDate: true,
    });
    expect(result).toEqual(exactCurrent);
  });

  it("fresh known_exact + prior undefined → fresh", () => {
    const result = applyAnchorFallback(exactCurrent, undefined, {
      samePlanDate: true,
    });
    expect(result).toEqual(exactCurrent);
  });

  it("fresh known_exact + samePlanDate=false → fresh (新情報なので date 比較不要)", () => {
    const result = applyAnchorFallback(exactCurrent, exactRegisteredHome, {
      samePlanDate: false,
    });
    expect(result).toEqual(exactCurrent);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Case 2: fresh known_label_only + prior known_exact → prior (coords 落とさない)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyAnchorFallback Case #2 — label_only で coords 落とさない (GPT 必須)", () => {
  it("fresh known_label_only + prior known_exact (current) → prior 維持", () => {
    const result = applyAnchorFallback(labelOnly, exactCurrent, {
      samePlanDate: true,
    });
    expect(result).toEqual(exactCurrent);
  });

  it("fresh known_label_only + prior known_exact (registered_home) → prior 維持", () => {
    const result = applyAnchorFallback(labelOnly, exactRegisteredHome, {
      samePlanDate: true,
    });
    expect(result).toEqual(exactRegisteredHome);
  });

  it("samePlanDate=false でも prior known_exact は維持 (label_only より coords 優先)", () => {
    const result = applyAnchorFallback(labelOnly, exactRegisteredHome, {
      samePlanDate: false,
    });
    expect(result).toEqual(exactRegisteredHome);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Case 3: fresh known_label_only + prior unknown/undefined → fresh
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyAnchorFallback Case #3 — label_only fresh が unknown より優先", () => {
  it("fresh known_label_only + prior unknown → fresh (label 取得)", () => {
    const result = applyAnchorFallback(labelOnly, unknownNoBaseline, {
      samePlanDate: true,
    });
    expect(result).toEqual(labelOnly);
  });

  it("fresh known_label_only + prior undefined → fresh", () => {
    const result = applyAnchorFallback(labelOnly, undefined, {
      samePlanDate: true,
    });
    expect(result).toEqual(labelOnly);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Case 4: fresh unknown + prior STALE source + samePlanDate=false → fresh
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyAnchorFallback Case #4 — STALE source + samePlanDate=false で継承拒否", () => {
  it("fresh unknown + prior current + samePlanDate=false → fresh (=unknown)", () => {
    const result = applyAnchorFallback(unknownNoBaseline, exactCurrent, {
      samePlanDate: false,
    });
    expect(result).toEqual(unknownNoBaseline);
  });

  it("fresh unknown + prior default_round_trip + samePlanDate=false → fresh (GPT 修正 2)", () => {
    const result = applyAnchorFallback(unknownNoBaseline, exactRoundTrip, {
      samePlanDate: false,
    });
    expect(result).toEqual(unknownNoBaseline);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Case 5: fresh unknown + prior STALE source + samePlanDate=true → prior
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyAnchorFallback Case #5 — STALE source + samePlanDate=true で継承 OK", () => {
  it("fresh unknown + prior current + samePlanDate=true → prior", () => {
    const result = applyAnchorFallback(unknownNoBaseline, exactCurrent, {
      samePlanDate: true,
    });
    expect(result).toEqual(exactCurrent);
  });

  it("fresh unknown + prior default_round_trip + samePlanDate=true → prior", () => {
    const result = applyAnchorFallback(unknownNoBaseline, exactRoundTrip, {
      samePlanDate: true,
    });
    expect(result).toEqual(exactRoundTrip);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Case 6: fresh unknown + prior 非 STALE source → prior (時刻非依存)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyAnchorFallback Case #6 — 非 STALE source は時刻非依存で継承", () => {
  it("fresh unknown + prior registered_home + samePlanDate=false → prior", () => {
    const result = applyAnchorFallback(unknownNoBaseline, exactRegisteredHome, {
      samePlanDate: false,
    });
    expect(result).toEqual(exactRegisteredHome);
  });

  it("fresh unknown + prior user_override + samePlanDate=false → prior (PR B-2e で意味発生)", () => {
    const result = applyAnchorFallback(unknownNoBaseline, exactUserOverride, {
      samePlanDate: false,
    });
    expect(result).toEqual(exactUserOverride);
  });

  it("fresh unknown + prior registered_home + samePlanDate=true → prior", () => {
    const result = applyAnchorFallback(unknownNoBaseline, exactRegisteredHome, {
      samePlanDate: true,
    });
    expect(result).toEqual(exactRegisteredHome);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Case 7: fresh unknown + prior known_label_only → prior (label 維持)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyAnchorFallback Case #7 — label_only も継承 (travel は不生成、PR B-1 と整合)", () => {
  it("fresh unknown + prior known_label_only → prior 維持", () => {
    const result = applyAnchorFallback(unknownNoBaseline, labelOnly, {
      samePlanDate: true,
    });
    expect(result).toEqual(labelOnly);
  });

  it("samePlanDate=false でも label_only は継承 (時刻に依存しない explicit label)", () => {
    const result = applyAnchorFallback(unknownNoBaseline, labelOnly, {
      samePlanDate: false,
    });
    expect(result).toEqual(labelOnly);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Case 8-9: fresh unknown + prior unknown/undefined → fresh
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyAnchorFallback Case #8-9 — 両方 unknown は再 resolve 機会維持", () => {
  it("fresh unknown + prior unknown → fresh (再 resolve 機会維持)", () => {
    const result = applyAnchorFallback(unknownDenied, unknownNoBaseline, {
      samePlanDate: true,
    });
    // fresh の reason を維持 (prior の reason は捨てる)
    expect(result).toEqual(unknownDenied);
  });

  it("fresh unknown + prior undefined → fresh", () => {
    const result = applyAnchorFallback(unknownNoBaseline, undefined, {
      samePlanDate: true,
    });
    expect(result).toEqual(unknownNoBaseline);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Case 10 [GPT 必須証明]: assumed end (default_round_trip) を STALE 扱いとして識別
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyAnchorFallback Case #10 [GPT 必須証明] — default_round_trip も STALE", () => {
  it("default_round_trip は samePlanDate=false で継承拒否 (current 由来 round-trip の stale 防止)", () => {
    const result = applyAnchorFallback(unknownNoBaseline, exactRoundTrip, {
      samePlanDate: false,
    });
    expect(result.kind).toBe("unknown"); // fresh が採用される
  });

  it("default_round_trip は samePlanDate=true なら継承 OK (同日内)", () => {
    const result = applyAnchorFallback(unknownNoBaseline, exactRoundTrip, {
      samePlanDate: true,
    });
    expect(result).toEqual(exactRoundTrip);
  });

  it("registered_home と default_round_trip は samePlanDate=false で挙動が異なる (STALE 区別)", () => {
    const homeResult = applyAnchorFallback(
      unknownNoBaseline,
      exactRegisteredHome,
      { samePlanDate: false },
    );
    const tripResult = applyAnchorFallback(
      unknownNoBaseline,
      exactRoundTrip,
      { samePlanDate: false },
    );
    // registered_home は時刻非依存で継承
    expect(homeResult).toEqual(exactRegisteredHome);
    // default_round_trip は STALE 扱いで継承拒否
    expect(tripResult.kind).toBe("unknown");
  });
});
