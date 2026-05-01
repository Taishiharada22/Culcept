/**
 * journeyAnchorState — converter / helper unit tests (PR B-1 Commit 4)
 *
 * CEO/GPT 2026-05-02 規律: chat 経路 (legacyAdapter) と selection 経路の両方が
 * 同じ converter (toOriginState / toEndState) を呼ぶため、converter 自体を
 * unit test することで両経路の挙動一致を保証する。
 *
 * 検証対象:
 *   - toOriginState: HomeAnchor | null → JourneyAnchorState
 *   - toEndState: JourneyEndAnchor | null → JourneyAnchorState
 *   - isAssumedAnchor: source="default_round_trip" のみ true (GPT 必須証明)
 *   - hasResolvedCoordinates: kind="known_exact" のみ true
 */

import { describe, it, expect } from "vitest";
import {
  toOriginState,
  toEndState,
  isAssumedAnchor,
  hasResolvedCoordinates,
  type JourneyAnchorState,
} from "@/lib/alter-morning/journey/anchorState";
import type {
  HomeAnchor,
  JourneyEndAnchor,
} from "@/lib/alter-morning/planning/transportContext";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// toOriginState
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("toOriginState — HomeAnchor → JourneyAnchorState", () => {
  it("source=current: kind=known_exact + source=current + coords/label 維持", () => {
    const anchor: HomeAnchor = {
      lat: 35.6595,
      lng: 139.7004,
      label: "現在地",
      source: "current",
    };
    const state = toOriginState(anchor, "no_baseline");
    expect(state.kind).toBe("known_exact");
    if (state.kind === "known_exact") {
      expect(state.source).toBe("current");
      expect(state.label).toBe("現在地");
      expect(state.lat).toBe(35.6595);
      expect(state.lng).toBe(139.7004);
    }
  });

  it("source=registered_home: kind=known_exact + source=registered_home", () => {
    const anchor: HomeAnchor = {
      lat: 35.69,
      lng: 139.7,
      label: "自宅",
      source: "registered_home",
    };
    const state = toOriginState(anchor, "no_baseline");
    expect(state.kind).toBe("known_exact");
    if (state.kind === "known_exact") {
      expect(state.source).toBe("registered_home");
      expect(state.label).toBe("自宅");
    }
  });

  it("anchor=null + reason=no_baseline: kind=unknown + reason=no_baseline", () => {
    const state = toOriginState(null, "no_baseline");
    expect(state.kind).toBe("unknown");
    if (state.kind === "unknown") {
      expect(state.reason).toBe("no_baseline");
    }
  });

  it("anchor=null + reason=denied: kind=unknown + reason=denied (GPT (d) 規律: state は細かく)", () => {
    const state = toOriginState(null, "denied");
    expect(state.kind).toBe("unknown");
    if (state.kind === "unknown") {
      expect(state.reason).toBe("denied");
    }
  });

  it("anchor=null + reason=unrequested: kind=unknown + reason=unrequested", () => {
    const state = toOriginState(null, "unrequested");
    expect(state.kind).toBe("unknown");
    if (state.kind === "unknown") {
      expect(state.reason).toBe("unrequested");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// toEndState
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("toEndState — JourneyEndAnchor → JourneyAnchorState", () => {
  it("source=default_round_trip: kind=known_exact + source 維持 (assumed end)", () => {
    const anchor: JourneyEndAnchor = {
      lat: 35.6595,
      lng: 139.7004,
      label: "帰宅",
      source: "default_round_trip",
    };
    const state = toEndState(anchor, "no_endpoint_signal");
    expect(state.kind).toBe("known_exact");
    if (state.kind === "known_exact") {
      expect(state.source).toBe("default_round_trip");
      expect(state.label).toBe("帰宅");
    }
  });

  it("source=comprehension_explicit: kind=known_exact + source=comprehension_explicit (PR B-3 拡張用)", () => {
    const anchor: JourneyEndAnchor = {
      lat: 35.65,
      lng: 139.7,
      label: "ホテル",
      source: "comprehension_explicit",
    };
    const state = toEndState(anchor, "no_endpoint_signal");
    expect(state.kind).toBe("known_exact");
    if (state.kind === "known_exact") {
      expect(state.source).toBe("comprehension_explicit");
    }
  });

  it("anchor=null + reason=no_endpoint_signal: kind=unknown + reason 維持", () => {
    const state = toEndState(null, "no_endpoint_signal");
    expect(state.kind).toBe("unknown");
    if (state.kind === "unknown") {
      expect(state.reason).toBe("no_endpoint_signal");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// isAssumedAnchor (GPT 必須証明)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isAssumedAnchor — assumed end 識別 (GPT 必須証明)", () => {
  it("source=default_round_trip + kind=known_exact: true (assumed)", () => {
    const state: JourneyAnchorState = {
      kind: "known_exact",
      label: "帰宅",
      lat: 35.6,
      lng: 139.7,
      source: "default_round_trip",
    };
    expect(isAssumedAnchor(state)).toBe(true);
  });

  it("source=current: false (confirmed origin)", () => {
    const state: JourneyAnchorState = {
      kind: "known_exact",
      label: "現在地",
      lat: 35.6,
      lng: 139.7,
      source: "current",
    };
    expect(isAssumedAnchor(state)).toBe(false);
  });

  it("source=registered_home: false (confirmed home)", () => {
    const state: JourneyAnchorState = {
      kind: "known_exact",
      label: "自宅",
      lat: 35.6,
      lng: 139.7,
      source: "registered_home",
    };
    expect(isAssumedAnchor(state)).toBe(false);
  });

  it("source=user_override: false (PR B-2 で user 確定済 = confirmed)", () => {
    const state: JourneyAnchorState = {
      kind: "known_exact",
      label: "ホテル",
      lat: 35.6,
      lng: 139.7,
      source: "user_override",
    };
    expect(isAssumedAnchor(state)).toBe(false);
  });

  it("source=comprehension_explicit: false (発話で明示済 = confirmed)", () => {
    const state: JourneyAnchorState = {
      kind: "known_exact",
      label: "友達の家",
      lat: 35.6,
      lng: 139.7,
      source: "comprehension_explicit",
    };
    expect(isAssumedAnchor(state)).toBe(false);
  });

  it("kind=unknown: false (不明な anchor は assumed でも confirmed でもない)", () => {
    const state: JourneyAnchorState = { kind: "unknown", reason: "no_baseline" };
    expect(isAssumedAnchor(state)).toBe(false);
  });

  it("kind=known_label_only: false (coords なしは assumed 判定 scope 外)", () => {
    const state: JourneyAnchorState = {
      kind: "known_label_only",
      label: "ホテル",
      source: "comprehension_explicit",
    };
    expect(isAssumedAnchor(state)).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// hasResolvedCoordinates (travel item 生成可否)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("hasResolvedCoordinates — travel 生成可否判定", () => {
  it("kind=known_exact: true (travel 生成可)", () => {
    const state: JourneyAnchorState = {
      kind: "known_exact",
      label: "現在地",
      lat: 35.6,
      lng: 139.7,
      source: "current",
    };
    expect(hasResolvedCoordinates(state)).toBe(true);
  });

  it("kind=known_label_only: false (coords なし、travel 不生成)", () => {
    const state: JourneyAnchorState = {
      kind: "known_label_only",
      label: "ホテル",
      source: "comprehension_explicit",
    };
    expect(hasResolvedCoordinates(state)).toBe(false);
  });

  it("kind=unknown: false (travel 不生成)", () => {
    const state: JourneyAnchorState = { kind: "unknown", reason: "no_baseline" };
    expect(hasResolvedCoordinates(state)).toBe(false);
  });

  it("undefined: false (resolver 未起動 = travel 不生成)", () => {
    expect(hasResolvedCoordinates(undefined)).toBe(false);
  });
});
