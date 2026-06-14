/**
 * originInference（RD2c 出発地推定の段階・不変条件・pure type）— CEO 必須 13 fixtures
 * 正本: docs/reality-mobility-place-supply-rd2-0.md（§3 + §3.1）/ CEO RD2c 実装 GO
 *
 * 核: origin は「確定」でなく由来と信頼度を持つ推定段階。現在地でも confirmed にしない（confirmed は user 確認のみ）。
 *   home/work/previous_event/current_location は inferred 止まり。high confidence は confirmed に予約。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createUnknownOrigin,
  createPreviousEventEndOrigin,
  createHomeAssumedOrigin,
  createWorkAssumedOrigin,
  createCurrentLocationCandidateOrigin,
  createUserConfirmedOrigin,
  originInferenceViolations,
  type OriginInferenceV0,
  type OriginInferenceSource,
} from "@/lib/plan/realityCore/originInference";

const ref = (h: string) => ({ opaqueRef: h });

describe("RD2c #1 unknown_origin は unknown 扱い", () => {
  it("unknown → certaintyStatus unknown・source none・origin_unknown", () => {
    const o = createUnknownOrigin("ern-1");
    expect(o.stage).toBe("unknown_origin");
    expect(o.certaintyStatus).toBe("unknown");
    expect(o.source).toBe("none");
    expect(o.confidence).toBe("none");
    expect(o.missingInputs.some((m) => m.code === "origin_unknown")).toBe(true);
    expect(originInferenceViolations(o)).toEqual([]);
  });
});

describe("RD2c #2 home_assumed は confirmed にならない", () => {
  it("home_assumed → inferred(low)・confirmed でない", () => {
    const o = createHomeAssumedOrigin("ern-1", ref("opq-home"));
    expect(o.stage).toBe("home_assumed");
    expect(o.certaintyStatus).toBe("inferred");
    expect(o.certaintyStatus).not.toBe("confirmed");
    expect(o.confidence).toBe("low");
    expect(originInferenceViolations(o)).toEqual([]);
  });
  it("偽造: home_assumed を confirmed に → violation", () => {
    const forged: OriginInferenceV0 = { ...createHomeAssumedOrigin("ern-1", null), certaintyStatus: "confirmed" };
    expect(originInferenceViolations(forged).length).toBeGreaterThan(0);
  });
});

describe("RD2c #3 work_assumed は confirmed にならない", () => {
  it("work_assumed → inferred(low)・confirmed でない", () => {
    const o = createWorkAssumedOrigin("ern-1", ref("opq-work"));
    expect(o.certaintyStatus).toBe("inferred");
    expect(o.certaintyStatus).not.toBe("confirmed");
    expect(originInferenceViolations(o)).toEqual([]);
  });
});

describe("RD2c #4 previous_event_end は confirmed にならない", () => {
  it("previous_event_end → inferred(moderate)・confirmed でない", () => {
    const o = createPreviousEventEndOrigin("ern-1", ref("opq-prev"));
    expect(o.stage).toBe("previous_event_end");
    expect(o.certaintyStatus).toBe("inferred");
    expect(o.certaintyStatus).not.toBe("confirmed");
    expect(o.confidence).toBe("moderate");
    expect(originInferenceViolations(o)).toEqual([]);
  });
});

describe("RD2c #5 current_location_candidate は confirmed にならない", () => {
  it("current_location_candidate → inferred・confirmed でない（現在地でも candidate）", () => {
    const o = createCurrentLocationCandidateOrigin("ern-1", ["gate_passed:accuracy_ok:age_ok"], ref("opq-cur"));
    expect(o.stage).toBe("current_location_candidate");
    expect(o.certaintyStatus).toBe("inferred");
    expect(o.certaintyStatus).not.toBe("confirmed");
    expect(originInferenceViolations(o)).toEqual([]);
  });
  it("偽造: current_location_candidate を confirmed/high に → violation", () => {
    const forged: OriginInferenceV0 = {
      ...createCurrentLocationCandidateOrigin("ern-1", ["g"], null),
      certaintyStatus: "confirmed",
      confidence: "high",
    };
    expect(originInferenceViolations(forged).length).toBeGreaterThan(0);
  });
});

describe("RD2c #6 current_location_candidate は gate 済み evidence が必要", () => {
  it("gate evidence 空 → violation（gate 済み必須）", () => {
    const o = createCurrentLocationCandidateOrigin("ern-1", [], ref("opq-cur"));
    expect(originInferenceViolations(o).some((m) => m.includes("gated_current_location evidence"))).toBe(true);
  });
  it("gate evidence あり → 健全（sourceKind gated_current_location）", () => {
    const o = createCurrentLocationCandidateOrigin("ern-1", ["gate_passed"], null);
    expect(o.evidenceRefs.every((e) => e.sourceKind === "gated_current_location")).toBe(true);
    expect(originInferenceViolations(o)).toEqual([]);
  });
});

describe("RD2c #7 user_confirmed_origin のみ confirmed 候補", () => {
  it("user_confirmed → confirmed(high)・evidence・健全", () => {
    const o = createUserConfirmedOrigin("ern-1", ["explicit_origin_confirmation"], ref("opq-u"));
    expect(o.stage).toBe("user_confirmed_origin");
    expect(o.certaintyStatus).toBe("confirmed");
    expect(o.confidence).toBe("high");
    expect(o.source).toBe("user_confirmed");
    expect(originInferenceViolations(o)).toEqual([]);
  });
  it("confirmed で source が非 user_confirmed → violation", () => {
    const forged: OriginInferenceV0 = {
      ...createUserConfirmedOrigin("ern-1", ["c"]),
      source: "gated_current_location" as OriginInferenceSource,
    };
    expect(originInferenceViolations(forged).some((m) => m.includes("confirmation provenance"))).toBe(true);
  });
});

describe("RD2c #8 evidenceRefs / source / confidence が欠けたら violation", () => {
  it("confirmed で evidence 空 → violation", () => {
    const o = createUserConfirmedOrigin("ern-1", []);
    expect(originInferenceViolations(o).some((m) => m.includes("non-empty evidenceRefs"))).toBe(true);
  });
  it("confirmed evidence sourceKind が非確認 → violation", () => {
    const base = createUserConfirmedOrigin("ern-1", ["c"]);
    const forged: OriginInferenceV0 = { ...base, evidenceRefs: [{ code: "c", sourceKind: "home_profile" }] };
    expect(originInferenceViolations(forged).some((m) => m.includes("evidence sourceKind"))).toBe(true);
  });
  it("inferred で confidence high（予約違反）→ violation", () => {
    const forged: OriginInferenceV0 = { ...createHomeAssumedOrigin("ern-1", null), confidence: "high" };
    expect(originInferenceViolations(forged).some((m) => m.includes("high reserved for confirmed"))).toBe(true);
  });
});

describe("RD2c #9 raw lat/lng/address/location label を consumer 前提 field に出さない", () => {
  it("型に raw field なし + 偽造混入 → violation", () => {
    const o = createUserConfirmedOrigin("ern-1", ["c"], ref("opq"));
    const json = JSON.stringify(o).toLowerCase();
    for (const t of ["lat", "lng", "latitude", "longitude", "address", "coordinates", "locationlabel", "locationtext", "placeid"]) {
      expect(json.includes(t)).toBe(false);
    }
    const forged = { ...o, lat: 35.6895, lng: 139.7006, address: "渋谷" } as unknown as OriginInferenceV0;
    expect(originInferenceViolations(forged).some((m) => m.includes("forbidden raw field"))).toBe(true);
  });
  it("originRef は opaque（opaqueRef のみ）", () => {
    const o = createHomeAssumedOrigin("ern-1", ref("opq-h"));
    expect(Object.keys(o.originRef!)).toEqual(["opaqueRef"]);
  });
});

describe("RD2c #10 route / ETA / leaveBy field が存在しない", () => {
  it("型に mobility field なし + 偽造混入 → violation", () => {
    const o = createPreviousEventEndOrigin("ern-1", null);
    const keys = Object.keys(o).map((k) => k.toLowerCase());
    for (const f of ["route", "eta", "leaveby", "movementrequired", "routeknown", "etaknown", "departure"]) {
      expect(keys.includes(f)).toBe(false);
    }
    const forged = { ...o, leaveBy: "08:00", etaKnown: true } as unknown as OriginInferenceV0;
    expect(originInferenceViolations(forged).some((m) => m.includes("forbidden mobility field"))).toBe(true);
  });
});

describe("RD2c #11 currentLocation / geolocation / external API import がない（source-scan）", () => {
  it("originInference.ts に location 取得/API import なし", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/originInference.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of [
      "navigator",
      "geolocation",
      "getCurrentLocation",
      "currentLocation",
      "locationResolver",
      "captureLocation",
      "reverseGeocode",
      "googleapis",
      "fetch(",
      "supabase",
      "localStorage",
      "import",
    ]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

describe("RD2c #12 IO source-scan green（pure・write/時刻/乱数なし）", () => {
  it("originInference.ts に IO / write / 非決定 API なし", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/originInference.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of [
      ".insert(",
      ".update(",
      ".delete(",
      ".upsert(",
      "service_role",
      "notification",
      "push(",
      "Date.now",
      "Math.random",
      "new Date(",
      "writeFile",
      "process.env",
    ]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

describe("RD2c #13 全 stage 出力が violations green（baseline integrity）", () => {
  it("unknown/prev/home/work/current/confirmed すべて健全・stage 一覧確定", () => {
    const outs = [
      createUnknownOrigin("ern-1"),
      createPreviousEventEndOrigin("ern-1", ref("p")),
      createHomeAssumedOrigin("ern-1", ref("h")),
      createWorkAssumedOrigin("ern-1", ref("w")),
      createCurrentLocationCandidateOrigin("ern-1", ["gate_passed"], ref("c")),
      createUserConfirmedOrigin("ern-1", ["confirm"], ref("u")),
    ];
    for (const o of outs) expect(originInferenceViolations(o)).toEqual([]);
    expect(outs.map((o) => o.stage)).toEqual([
      "unknown_origin",
      "previous_event_end",
      "home_assumed",
      "work_assumed",
      "current_location_candidate",
      "user_confirmed_origin",
    ]);
    // confirmed は 1 つだけ（user_confirmed_origin のみ）
    expect(outs.filter((o) => o.certaintyStatus === "confirmed").map((o) => o.stage)).toEqual(["user_confirmed_origin"]);
  });
});
