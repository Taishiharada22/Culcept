// tests/unit/plan/postVisit/postVisitCheck.test.ts
// 評価OS Stage 0: post-visit 答え合わせ器官（pure/local shadow）の検証。
//   shouldElicit の trigger/suppress・未回答=null・sensitive/日常移動では聞かない・
//   提案場所/重要予定では候補になる・local 保存に禁止情報が入らない・flag OFF で既存挙動不変・
//   観測の鏡は薄い時 null & 常に仮説トーン・SSR safe。
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  POST_VISIT_CHECK_ENABLED,
  isPostVisitCheckEnabled,
  buildPostVisitObservation,
  POST_VISIT_RESPONSES,
  REASON_CHIPS,
  type PostVisitObservation,
} from "@/lib/plan/postVisit/postVisitObservation";
import {
  shouldElicit,
  buildPostVisitPrompt,
  AFTER_SKIP_COOLDOWN_MS,
  RECENT_SAME_COOLDOWN_MS,
  type ElicitContext,
} from "@/lib/plan/postVisit/postVisitElicitation";
import { buildObservationMirror, MIRROR_MIN_OBSERVATIONS } from "@/lib/plan/postVisit/postVisitMirror";
import {
  redactForPersistence,
  loadPostVisitObservations,
  recordPostVisitObservation,
  POST_VISIT_OBS_KEY,
} from "@/lib/plan/postVisit/postVisitStore";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ── elicit context fixture（全 derived・suppress なし・lens_proposed trigger）──
function ctx(over: Partial<ElicitContext> = {}): ElicitContext {
  return {
    isLensProposed: true,
    isFirstVisit: false,
    isImportantPlan: false,
    isDiscoveryDomain: false,
    dwellSignal: null,
    isSensitive: false,
    isHomeOrWork: false,
    isHabitual: false,
    isHighFatigue: false,
    lastSkippedAt: null,
    lastSimilarElicitAt: null,
    now: 1_000_000_000_000,
    ...over,
  };
}

describe("flag — dormant / default OFF / production hard block", () => {
  it("★定数 OFF（dormant）", () => {
    expect(POST_VISIT_CHECK_ENABLED).toBe(false);
  });
  it("★dev でも OFF（const false）", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isPostVisitCheckEnabled()).toBe(false);
  });
  it("★production でも OFF（NODE_ENV hard block）", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isPostVisitCheckEnabled()).toBe(false);
  });
});

describe("shouldElicit — trigger（提案場所/重要予定 等で候補になる）", () => {
  it("★lens 提案場所 → elicit（trigger=lens_proposed）", () => {
    const d = shouldElicit(ctx({ isLensProposed: true }));
    expect(d.elicit).toBe(true);
    expect(d.trigger).toBe("lens_proposed");
  });
  it("★重要予定 → elicit（trigger=important_plan）", () => {
    const d = shouldElicit(ctx({ isLensProposed: false, isImportantPlan: true }));
    expect(d.elicit).toBe(true);
    expect(d.trigger).toBe("important_plan");
  });
  it("★早期離脱/長時間滞在の粗い signal → elicit", () => {
    expect(shouldElicit(ctx({ isLensProposed: false, dwellSignal: "early" })).trigger).toBe("early_leave");
    expect(shouldElicit(ctx({ isLensProposed: false, dwellSignal: "long" })).trigger).toBe("long_stay");
  });
  it("★初訪問 / discovery domain → elicit", () => {
    expect(shouldElicit(ctx({ isLensProposed: false, isFirstVisit: true })).trigger).toBe("first_visit");
    expect(shouldElicit(ctx({ isLensProposed: false, isDiscoveryDomain: true })).trigger).toBe("discovery_domain");
  });
  it("★trigger 何も無ければ沈黙（elicit=false・デフォルト沈黙）", () => {
    const d = shouldElicit(ctx({ isLensProposed: false }));
    expect(d.elicit).toBe(false);
    expect(d.trigger).toBeNull();
    expect(d.suppressedBy).toBeNull();
  });
});

describe("shouldElicit — suppress（聞かない・suppress は trigger に優先）", () => {
  it("★sensitive → 聞かない（最優先）", () => {
    const d = shouldElicit(ctx({ isLensProposed: true, isSensitive: true }));
    expect(d.elicit).toBe(false);
    expect(d.suppressedBy).toBe("sensitive");
  });
  it("★自宅/職場 → 聞かない", () => {
    expect(shouldElicit(ctx({ isHomeOrWork: true })).suppressedBy).toBe("home_work");
  });
  it("★コンビニ/駅/日常移動（habitual）→ 聞かない", () => {
    const d = shouldElicit(ctx({ isHabitual: true }));
    expect(d.elicit).toBe(false);
    expect(d.suppressedBy).toBe("habitual");
  });
  it("★疲労が強い → 聞かない", () => {
    expect(shouldElicit(ctx({ isHighFatigue: true })).suppressedBy).toBe("high_fatigue");
  });
  it("★skip/拒否の直後（cooldown 内）→ 聞かない", () => {
    const now = 1_000_000_000_000;
    expect(shouldElicit(ctx({ now, lastSkippedAt: now - 1000 })).suppressedBy).toBe("after_skip");
    // cooldown を過ぎれば trigger が復活
    expect(shouldElicit(ctx({ now, lastSkippedAt: now - AFTER_SKIP_COOLDOWN_MS - 1 })).elicit).toBe(true);
  });
  it("★同型を直近に聞いた → 聞かない", () => {
    const now = 1_000_000_000_000;
    expect(shouldElicit(ctx({ now, lastSimilarElicitAt: now - 1000 })).suppressedBy).toBe("recent_same");
    expect(shouldElicit(ctx({ now, lastSimilarElicitAt: now - RECENT_SAME_COOLDOWN_MS - 1 })).elicit).toBe(true);
  });
  it("★suppress は trigger に優先（提案場所でも sensitive なら聞かない）", () => {
    const d = shouldElicit(ctx({ isLensProposed: true, isImportantPlan: true, isSensitive: true }));
    expect(d.elicit).toBe(false);
  });
});

describe("buildPostVisitObservation — 未回答=null / redaction / chip filter", () => {
  it("★未回答 → response=null（中立扱いしない）", () => {
    const o = buildPostVisitObservation({ placeDescriptor: "カフェA 東京都...", lens: "focus_work", trigger: "lens_proposed", at: 1 });
    expect(o.response).toBeNull();
  });
  it("★placeDescriptor は hash 化され原文が残らない（PII 遮断）", () => {
    const o = buildPostVisitObservation({ placeDescriptor: "スターバックス 渋谷区道玄坂1-2-3", lens: "meeting_prep", trigger: "lens_proposed", at: 1 });
    expect(o.placeKey).not.toContain("スターバックス");
    expect(o.placeKey).not.toContain("道玄坂");
    expect(JSON.stringify(o)).not.toContain("道玄坂");
  });
  it("★reasonChips は固定集合に filter（未知/自由語を捨てる）", () => {
    const o = buildPostVisitObservation({
      placeDescriptor: "x", lens: "conversation", trigger: "first_visit", at: 1,
      response: "conditional",
      reasonChips: ["calm", "自由入力テキスト" as never, "crowded"],
    });
    expect(o.reasonChips).toEqual(["calm", "crowded"]);
  });
});

describe("buildPostVisitPrompt — 星でなく記憶整理フレーム", () => {
  it("★4 択（また候補に残す/条件次第/今日は違った/もういい）", () => {
    const p = buildPostVisitPrompt("lens_proposed");
    expect(p.responses.map((r) => r.key)).toEqual([...POST_VISIT_RESPONSES]);
    expect(p.responses.map((r) => r.label)).toContain("また候補に残す");
  });
  it("★reason chips は固定集合・★星/評価語を含まない", () => {
    const p = buildPostVisitPrompt("important_plan");
    expect(p.reasonChips.map((c) => c.key)).toEqual([...REASON_CHIPS]);
    const blob = JSON.stringify(p);
    expect(blob).not.toMatch(/星|★|評価してください|レビュー投稿/);
    expect(p.framingNote).toContain("次の提案に覚えておきます");
  });
});

describe("観測の鏡 — 薄い時は沈黙 / 常に仮説トーン / 件数同伴", () => {
  function obs(over: Partial<PostVisitObservation> = {}): PostVisitObservation {
    return { v: 1, placeKey: "k", lens: "focus_work", trigger: "lens_proposed", response: null, reasonChips: [], dwellSignal: null, at: 1, ...over };
  }
  it("★観測 < 最小数 → null（捏造より沈黙）", () => {
    expect(buildObservationMirror([obs(), obs()])).toBeNull();
    expect(MIRROR_MIN_OBSERVATIONS).toBeGreaterThanOrEqual(3);
  });
  it("★回答傾向が support 以上 → 仮説トーン＋件数", () => {
    const r = buildObservationMirror([obs({ response: "keep" }), obs({ response: "keep" }), obs({ response: "not_today" })]);
    expect(r).not.toBeNull();
    expect(r!.tentative).toBe(true);
    expect(r!.text).toContain("仮説");
    expect(r!.observationCount).toBeGreaterThanOrEqual(2);
  });
  it("★頻出 reason chip → 仮説トーン（その他は鏡に使わない）", () => {
    const r = buildObservationMirror([obs({ reasonChips: ["calm"] }), obs({ reasonChips: ["calm"] }), obs({ reasonChips: ["other"] })]);
    expect(r).not.toBeNull();
    expect(r!.basis).toBe("reason");
    expect(r!.text).toContain("仮説");
  });
  it("★断定形を作らない（text は必ず『仮説』を含む）", () => {
    const r = buildObservationMirror(Array.from({ length: 4 }, () => obs({ response: "keep" })));
    expect(r!.text).toContain("仮説");
  });
});

describe("store — redaction（禁止情報が保存されない）", () => {
  it("★生 GPS/住所/場所名/notes/正確な滞在分は redact で除去（whitelist のみ）", () => {
    const dirty = {
      v: 1, placeKey: "k", lens: "focus_work", trigger: "lens_proposed", response: "keep",
      reasonChips: ["calm"], dwellSignal: "long", at: 1,
      // ↓ 禁止情報（万一渡っても保存されてはならない）
      lat: 35.6, lng: 139.7, address: "東京都渋谷区道玄坂1-2-3", placeName: "スターバックス渋谷",
      notes: "ユーザーの自由メモ原文", dwellMinutes: 73, rawTitle: "クライアントと打ち合わせ",
    };
    const clean = redactForPersistence(dirty);
    expect(clean).not.toBeNull();
    const blob = JSON.stringify(clean);
    for (const forbidden of ["35.6", "139.7", "道玄坂", "スターバックス", "自由メモ", "73", "打ち合わせ", "lat", "lng", "address", "placeName", "notes", "dwellMinutes", "rawTitle"]) {
      expect(blob).not.toContain(forbidden);
    }
    expect(Object.keys(clean!).sort()).toEqual(["at", "dwellSignal", "lens", "placeKey", "reasonChips", "response", "trigger", "v"]);
  });
  it("★不正/壊れ入力 → null", () => {
    expect(redactForPersistence(null)).toBeNull();
    expect(redactForPersistence({ placeKey: 1 })).toBeNull();
    expect(redactForPersistence({ placeKey: "k", lens: "x", trigger: "BAD", at: 1 })).toBeNull();
  });
});

describe("UI 配線 import smoke（module 解決・mount 可能）", () => {
  it("★PostVisitCheckCard が解決・export される", async () => {
    const mod = await import("@/app/(culcept)/plan/components/PostVisitCheckCard");
    expect(typeof mod.PostVisitCheckCard).toBe("function");
  });
  it("★LocationDetailSheet が解決（PostVisitCheckCard import を含む）", async () => {
    const mod = await import("@/app/(culcept)/calendar/_components/travel/locationNotes/LocationDetailSheet");
    expect(typeof mod.LocationDetailSheet).toBe("function");
  });
});

describe("store — flag OFF で既存挙動不変 / SSR safe", () => {
  function mockLS() {
    const store: Record<string, string> = {};
    return {
      _store: store,
      getItem: (k: string) => (k in store ? store[k]! : null),
      setItem: vi.fn((k: string, v: string) => { store[k] = v; }),
      removeItem: (k: string) => { delete store[k]; },
    };
  }
  it("★flag OFF: load は []・record は書き込まない", () => {
    const ls = mockLS();
    vi.stubGlobal("window", { localStorage: ls });
    expect(loadPostVisitObservations()).toEqual([]);
    recordPostVisitObservation({ v: 1, placeKey: "k", lens: "focus_work", trigger: "lens_proposed", response: "keep", reasonChips: [], dwellSignal: null, at: 1 });
    expect(ls.setItem).not.toHaveBeenCalled(); // flag OFF → 一切書かない＝既存挙動不変
    expect(ls._store[POST_VISIT_OBS_KEY]).toBeUndefined();
  });
  it("★SSR（window なし）: load=[] / record no-op・throw しない", () => {
    vi.stubGlobal("window", undefined);
    expect(loadPostVisitObservations()).toEqual([]);
    expect(() => recordPostVisitObservation({ v: 1, placeKey: "k", lens: "focus_work", trigger: "lens_proposed", response: null, reasonChips: [], dwellSignal: null, at: 1 })).not.toThrow();
  });
});
