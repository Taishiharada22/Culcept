/**
 * placeResolution（RD2a 場所解決の段階・不変条件・pure type）— CEO 必須 14 fixtures
 * 正本: docs/reality-mobility-place-supply-rd2-0.md（§2 + §2.1 CEO 補正）/ CEO RD2a 実装 GO
 *
 * 核（CEO 補正）: 整形状態 ≠ 確認。exact_confirmed（confirmed）は確認 provenance のみ。
 *   locationText / Places 候補 / municipality・prefecture 座標 / canonical text だけでは confirmed にしない。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createMissingPlaceResolution,
  createLocationTextOnlyResolution,
  createCandidateUnresolvedResolution,
  createAmbiguousPlaceResolution,
  createCandidateSelectedResolution,
  createExactConfirmedResolution,
  placeResolutionViolations,
  CONFIRMED_PLACE_SOURCES,
  type PlaceResolutionV0,
  type PlaceResolutionSource,
} from "@/lib/plan/realityCore/placeResolution";

const cand = (n: number) => ({ candidateCount: n, opaqueRef: "opaque-h1" });

describe("RD2a #1 missing_place は unknown 扱い", () => {
  it("missing → certaintyStatus unknown・source none・place_missing", () => {
    const p = createMissingPlaceResolution("ern-1");
    expect(p.stage).toBe("missing_place");
    expect(p.certaintyStatus).toBe("unknown");
    expect(p.source).toBe("none");
    expect(p.missingInputs.some((m) => m.code === "place_missing")).toBe(true);
    expect(placeResolutionViolations(p)).toEqual([]);
  });
});

describe("RD2a #2 locationText only は exact_confirmed にならない", () => {
  it("location_text_only → unknown（confirmed でない）", () => {
    const p = createLocationTextOnlyResolution("ern-1");
    expect(p.stage).toBe("location_text_only");
    expect(p.certaintyStatus).toBe("unknown");
    expect(p.certaintyStatus).not.toBe("confirmed");
    expect(placeResolutionViolations(p)).toEqual([]);
  });
  it("偽造: location_text source で confirmed に上げる → violation", () => {
    const forged: PlaceResolutionV0 = { ...createLocationTextOnlyResolution("ern-1"), certaintyStatus: "confirmed" };
    expect(placeResolutionViolations(forged).length).toBeGreaterThan(0);
  });
});

describe("RD2a #3 Places候補のみでは exact_confirmed にならない", () => {
  it("candidate_unresolved(places_api_candidate) → unknown", () => {
    const p = createCandidateUnresolvedResolution("ern-1", cand(3), "places_api_candidate");
    expect(p.stage).toBe("candidate_unresolved");
    expect(p.certaintyStatus).toBe("unknown");
    expect(placeResolutionViolations(p)).toEqual([]);
  });
  it("偽造: places_api_candidate source で confirmed → violation", () => {
    const forged: PlaceResolutionV0 = {
      ...createCandidateUnresolvedResolution("ern-1", cand(1), "places_api_candidate"),
      stage: "exact_confirmed",
      certaintyStatus: "confirmed",
    };
    expect(placeResolutionViolations(forged).some((m) => m.includes("confirmation provenance"))).toBe(true);
  });
});

describe("RD2a #4 municipality / prefecture coords では exact_confirmed にならない", () => {
  it("municipality_coords / prefecture_coords candidate → unknown", () => {
    const m = createCandidateUnresolvedResolution("ern-1", cand(1), "municipality_coords");
    const pr = createCandidateUnresolvedResolution("ern-1", cand(1), "prefecture_coords");
    expect(m.certaintyStatus).toBe("unknown");
    expect(pr.certaintyStatus).toBe("unknown");
    expect(placeResolutionViolations(m)).toEqual([]);
    expect(placeResolutionViolations(pr)).toEqual([]);
  });
  it("偽造: municipality_coords で confirmed → violation", () => {
    const forged: PlaceResolutionV0 = {
      ...createCandidateUnresolvedResolution("ern-1", cand(1), "municipality_coords"),
      stage: "exact_confirmed",
      certaintyStatus: "confirmed",
    };
    expect(placeResolutionViolations(forged).length).toBeGreaterThan(0);
  });
});

describe("RD2a #5 canonical text だけでは exact_confirmed にならない", () => {
  it("canonical_text は candidate_selected(inferred) 止まり（CEO 補正核心）", () => {
    const p = createCandidateSelectedResolution("ern-1", "canonical_text", cand(1));
    expect(p.stage).toBe("candidate_selected");
    expect(p.certaintyStatus).toBe("inferred");
    expect(p.certaintyStatus).not.toBe("confirmed");
    expect(placeResolutionViolations(p)).toEqual([]);
  });
  it("偽造: canonical_text で confirmed → violation（整形状態 ≠ 確認）", () => {
    const forged: PlaceResolutionV0 = {
      ...createCandidateSelectedResolution("ern-1", "canonical_text", cand(1)),
      stage: "exact_confirmed",
      certaintyStatus: "confirmed",
    };
    expect(placeResolutionViolations(forged).some((m) => m.includes("confirmation provenance"))).toBe(true);
  });
});

describe("RD2a #6 candidate_unresolved は confirmed ではない", () => {
  it("candidate_unresolved → certaintyStatus !== confirmed", () => {
    const p = createCandidateUnresolvedResolution("ern-1", cand(2), "places_api_candidate");
    expect(p.certaintyStatus).not.toBe("confirmed");
    expect(p.missingInputs.some((m) => m.code === "candidate_not_selected")).toBe(true);
  });
});

describe("RD2a #7 ambiguous_place は confirmed ではない", () => {
  it("ambiguous → unknown・候補 ≥2", () => {
    const p = createAmbiguousPlaceResolution("ern-1", cand(3));
    expect(p.stage).toBe("ambiguous_place");
    expect(p.certaintyStatus).toBe("unknown");
    expect(placeResolutionViolations(p)).toEqual([]);
  });
  it("ambiguous で候補 1 → violation（拮抗していない）", () => {
    const p = createAmbiguousPlaceResolution("ern-1", cand(1));
    expect(placeResolutionViolations(p).some((m) => m.includes("candidateCount >= 2"))).toBe(true);
  });
});

describe("RD2a #8 candidate_selected は confirmed でなく inferred / selected 止まり", () => {
  it("candidate_selected → inferred（confirmed でない）", () => {
    const p = createCandidateSelectedResolution("ern-1", "places_api_candidate", cand(1));
    expect(p.certaintyStatus).toBe("inferred");
    expect(p.certaintyStatus).not.toBe("confirmed");
    expect(p.missingInputs.some((m) => m.code === "not_confirmed")).toBe(true);
    expect(placeResolutionViolations(p)).toEqual([]);
  });
});

describe("RD2a #9 exact_confirmed には explicit confirmation evidence が必須", () => {
  it("確認 provenance + evidence → confirmed・健全", () => {
    for (const src of CONFIRMED_PLACE_SOURCES) {
      const p = createExactConfirmedResolution("ern-1", src as "user_confirmed", ["explicit_confirmation"]);
      expect(p.certaintyStatus).toBe("confirmed");
      expect(p.confidence).toBe("high");
      expect(placeResolutionViolations(p)).toEqual([]);
    }
  });
  it("evidence 空 → violation", () => {
    const p = createExactConfirmedResolution("ern-1", "user_confirmed", []);
    expect(placeResolutionViolations(p).some((m) => m.includes("non-empty evidenceRefs"))).toBe(true);
  });
});

describe("RD2a #10 evidenceRefs / source / confidence が欠けたら violation", () => {
  it("confirmed で source が非確認 provenance → violation", () => {
    const forged: PlaceResolutionV0 = {
      ...createExactConfirmedResolution("ern-1", "user_confirmed", ["c"]),
      source: "canonical_text" as PlaceResolutionSource,
    };
    expect(placeResolutionViolations(forged).length).toBeGreaterThan(0);
  });
  it("confirmed で confidence none → violation", () => {
    const forged: PlaceResolutionV0 = { ...createExactConfirmedResolution("ern-1", "user_confirmed", ["c"]), confidence: "none" };
    expect(placeResolutionViolations(forged).some((m) => m.includes("confidence"))).toBe(true);
  });
  it("confirmed evidence の sourceKind が非確認 → violation", () => {
    const base = createExactConfirmedResolution("ern-1", "user_confirmed", ["c"]);
    const forged: PlaceResolutionV0 = { ...base, evidenceRefs: [{ code: "c", sourceKind: "location_text" }] };
    expect(placeResolutionViolations(forged).some((m) => m.includes("evidence sourceKind"))).toBe(true);
  });
});

describe("RD2a #11 raw lat/lng/placeId/locationText を consumer 前提 field に出さない", () => {
  it("型に raw field が無い + 偽造混入 → violation", () => {
    const p = createExactConfirmedResolution("ern-1", "user_selected", ["sel"]);
    const json = JSON.stringify(p).toLowerCase();
    for (const t of ["lat", "lng", "latitude", "longitude", "placeid", "locationtext", "address", "coordinates"]) {
      expect(json.includes(t)).toBe(false);
    }
    const forged = { ...p, lat: 35.6, lng: 139.7, placeId: "ChIJ" } as unknown as PlaceResolutionV0;
    const v = placeResolutionViolations(forged);
    expect(v.some((m) => m.includes("forbidden raw field"))).toBe(true);
  });
  it("candidateRef は opaque（raw を持たない・count + handle のみ）", () => {
    const p = createCandidateUnresolvedResolution("ern-1", cand(2), "places_api_candidate");
    expect(Object.keys(p.candidateRef!).sort()).toEqual(["candidateCount", "opaqueRef"]);
  });
});

describe("RD2a #12 route / ETA / leaveBy field が存在しない", () => {
  it("型に mobility field が無い + 偽造混入 → violation", () => {
    const p = createCandidateSelectedResolution("ern-1", "canonical_text", null);
    const keys = Object.keys(p).map((k) => k.toLowerCase());
    for (const f of ["route", "eta", "leaveby", "movementrequired", "routeknown", "etaknown"]) {
      expect(keys.includes(f)).toBe(false);
    }
    const forged = { ...p, leaveBy: "08:00", etaKnown: true } as unknown as PlaceResolutionV0;
    expect(placeResolutionViolations(forged).some((m) => m.includes("forbidden mobility field"))).toBe(true);
  });
});

describe("RD2a #13 currentLocation / external API import がない（source-scan）", () => {
  it("placeResolution.ts に provider/API/location/IO import なし", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/placeResolution.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of [
      "placeResolver",
      "geocode",
      "googleapis",
      "maps.googleapis",
      "currentLocation",
      "geolocation",
      "navigator",
      "fetch(",
      "supabase",
      "localStorage",
      "import",
    ]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

describe("RD2a #14 IO source-scan green（pure・write/notification/時刻/乱数なし）", () => {
  it("placeResolution.ts に IO / write / 非決定 API なし", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/placeResolution.ts"), "utf8");
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
