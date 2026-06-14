/**
 * placeCandidateAdapter（RD2b locationText/provider/confirmation → PlaceResolutionV0 写像・pure adapter）— CEO 必須 17 fixtures
 * 正本: docs/reality-place-candidate-adapter-rd2b-0.md / CEO RD2b 実装 GO
 *
 * 核: adapter は確信度を上げない（provenance が段階を決める）。confirmation のみ confirmed・selection は inferred・
 *   provider 候補は unknown（confidence high でも candidate 止まり）・provider 失敗で fake 候補を作らない・raw 不露出。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolvePlaceCandidate,
  placeAdapterOutputViolations,
  type PlaceAdapterInput,
  type PlaceCandidateProvider,
  type PlaceProviderCandidateResult,
} from "@/lib/plan/realityCore/placeCandidateAdapter";

const inp = (over: Partial<PlaceAdapterInput>): PlaceAdapterInput => ({
  subjectNodeId: "ern-1",
  locationText: null,
  selection: null,
  confirmation: null,
  ...over,
});

const provider = (over: Partial<PlaceProviderCandidateResult>): PlaceCandidateProvider => async () => ({
  status: "ok",
  candidateCount: 1,
  confidence: "moderate",
  competing: false,
  source: "places_api_candidate",
  opaqueRef: "opq-1",
  ...over,
});

describe("RD2b #1 locationText なし → missing_place", () => {
  it("locationText null → missing_place(unknown)", async () => {
    const p = await resolvePlaceCandidate(inp({ locationText: null }));
    expect(p.stage).toBe("missing_place");
    expect(p.certaintyStatus).toBe("unknown");
    expect(placeAdapterOutputViolations(p)).toEqual([]);
  });
});

describe("RD2b #2 locationText のみ → location_text_only", () => {
  it("locationText 有・provider 無 → location_text_only(unknown)", async () => {
    const p = await resolvePlaceCandidate(inp({ locationText: "渋谷" }));
    expect(p.stage).toBe("location_text_only");
    expect(p.certaintyStatus).toBe("unknown");
    expect(placeAdapterOutputViolations(p)).toEqual([]);
  });
});

describe("RD2b #3 provider 未注入 → location_text_only", () => {
  it("deps 空 → location_text_only", async () => {
    const p = await resolvePlaceCandidate(inp({ locationText: "渋谷" }), {});
    expect(p.stage).toBe("location_text_only");
  });
});

describe("RD2b #4 provider 候補 0 → location_text_only", () => {
  it("no_candidates → location_text_only", async () => {
    const p = await resolvePlaceCandidate(inp({ locationText: "x" }), { provider: provider({ status: "no_candidates", candidateCount: 0 }) });
    expect(p.stage).toBe("location_text_only");
  });
  it("candidateCount 0 → location_text_only", async () => {
    const p = await resolvePlaceCandidate(inp({ locationText: "x" }), { provider: provider({ candidateCount: 0 }) });
    expect(p.stage).toBe("location_text_only");
  });
});

describe("RD2b #5 provider 候補 1 → candidate_unresolved", () => {
  it("候補 1 → candidate_unresolved(unknown)", async () => {
    const p = await resolvePlaceCandidate(inp({ locationText: "渋谷駅" }), { provider: provider({ candidateCount: 1 }) });
    expect(p.stage).toBe("candidate_unresolved");
    expect(p.certaintyStatus).toBe("unknown");
    expect(placeAdapterOutputViolations(p)).toEqual([]);
  });
});

describe("RD2b #6 provider 候補複数/拮抗 → ambiguous_place", () => {
  it("候補 3・competing → ambiguous_place", async () => {
    const p = await resolvePlaceCandidate(inp({ locationText: "中央公園" }), { provider: provider({ candidateCount: 3, competing: true }) });
    expect(p.stage).toBe("ambiguous_place");
    expect(p.certaintyStatus).toBe("unknown");
    expect(p.candidateRef?.candidateCount).toBe(3);
    expect(placeAdapterOutputViolations(p)).toEqual([]);
  });
});

describe("RD2b #7 canonical selected → candidate_selected / inferred", () => {
  it("selection canonical_text → candidate_selected(inferred)", async () => {
    const p = await resolvePlaceCandidate(inp({ locationText: "渋谷", selection: { source: "canonical_text", opaqueRef: "opq-c" } }));
    expect(p.stage).toBe("candidate_selected");
    expect(p.certaintyStatus).toBe("inferred");
    expect(p.certaintyStatus).not.toBe("confirmed");
    expect(placeAdapterOutputViolations(p)).toEqual([]);
  });
});

describe("RD2b #8 provider confidence high でも exact_confirmed にならない", () => {
  it("confidence high・候補 1 → candidate_unresolved（confirmed でない）", async () => {
    const p = await resolvePlaceCandidate(inp({ locationText: "渋谷駅" }), { provider: provider({ candidateCount: 1, confidence: "high" }) });
    expect(p.stage).toBe("candidate_unresolved");
    expect(p.certaintyStatus).not.toBe("confirmed");
  });
});

describe("RD2b #9 confirmation event ありのみ exact_confirmed", () => {
  it("confirmation(user_confirmed + evidence) → exact_confirmed(confirmed)", async () => {
    const p = await resolvePlaceCandidate(
      inp({ locationText: "渋谷", confirmation: { source: "user_confirmed", evidenceCodes: ["explicit_confirmation"], opaqueRef: "opq-x" } }),
    );
    expect(p.stage).toBe("exact_confirmed");
    expect(p.certaintyStatus).toBe("confirmed");
    expect(p.confidence).toBe("high");
    expect(placeAdapterOutputViolations(p)).toEqual([]);
  });
  it("confirmation だが evidence 空 → confirmed に上げない（degrade）", async () => {
    const p = await resolvePlaceCandidate(
      inp({ locationText: "渋谷", confirmation: { source: "user_confirmed", evidenceCodes: [], opaqueRef: null } }),
    );
    expect(p.stage).not.toBe("exact_confirmed");
    expect(p.certaintyStatus).not.toBe("confirmed");
  });
});

describe("RD2b #10 non-confirmed source から exact_confirmed を作れない", () => {
  it("selection(canonical_text/places_api_candidate/municipality) は confirmed に到達しない", async () => {
    for (const source of ["canonical_text", "places_api_candidate", "municipality_coords"] as const) {
      const p = await resolvePlaceCandidate(inp({ locationText: "渋谷", selection: { source, opaqueRef: null } }));
      expect(p.certaintyStatus).not.toBe("confirmed");
      expect(p.stage).toBe("candidate_selected");
    }
    // 型: PlaceConfirmationInput.source は ConfirmedPlaceSource のみ → canonical_text は TS 上 confirmation に入れられない
  });
});

describe("RD2b #11 provider failure で fake 候補を作らない", () => {
  it("status failed → location_text_only・candidateRef null（候補捏造なし）", async () => {
    const p = await resolvePlaceCandidate(inp({ locationText: "渋谷" }), { provider: provider({ status: "failed", candidateCount: 5 }) });
    expect(p.stage).toBe("location_text_only");
    expect(p.candidateRef).toBeNull();
    expect(placeAdapterOutputViolations(p)).toEqual([]);
  });
});

describe("RD2b #12 raw lat/lng/placeId/address/locationText が output に出ない", () => {
  it("正常 output に raw token なし + 偽造混入を検出", async () => {
    const p = await resolvePlaceCandidate(inp({ locationText: "渋谷" }), { provider: provider({ candidateCount: 1 }) });
    const json = JSON.stringify(p).toLowerCase();
    for (const t of ["latitude", "longitude", "placeid", "address", "coordinates", "geometry", "locationtext"]) {
      expect(json.includes(t)).toBe(false);
    }
    const forged = { ...p, lat: 35.68950, lng: 139.70060, placeId: "ChIJ" } as unknown as typeof p;
    const v = placeAdapterOutputViolations(forged);
    expect(v.length).toBeGreaterThan(0);
    expect(v.some((m) => m.includes("placeid") || m.includes("coordinate") || m.includes("raw"))).toBe(true);
  });
});

describe("RD2b #13 candidateRef は opaque", () => {
  it("candidate_unresolved の candidateRef は count + opaqueRef のみ", async () => {
    const p = await resolvePlaceCandidate(inp({ locationText: "渋谷駅" }), { provider: provider({ candidateCount: 2, opaqueRef: "opq-z" }) });
    expect(Object.keys(p.candidateRef!).sort()).toEqual(["candidateCount", "opaqueRef"]);
    expect(p.candidateRef!.opaqueRef).toBe("opq-z");
  });
});

describe("RD2b #14 route/ETA/leaveBy/movementRequired field がない", () => {
  it("出力 key に mobility field なし", async () => {
    const p = await resolvePlaceCandidate(inp({ locationText: "渋谷" }), { provider: provider({ candidateCount: 1 }) });
    const keys = Object.keys(p).map((k) => k.toLowerCase());
    for (const f of ["route", "eta", "leaveby", "movementrequired", "routeknown", "etaknown", "departure"]) {
      expect(keys.includes(f)).toBe(false);
    }
  });
});

describe("RD2b #15 placeResolver/geocode/currentLocation/external API import なし（source-scan）", () => {
  it("placeCandidateAdapter.ts に provider 実装/API/location import なし", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/placeCandidateAdapter.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of [
      "placeResolver",
      "alter-morning",
      "geocode",
      "currentLocation",
      "geolocation",
      "navigator",
      "googleapis",
      "maps.googleapis",
      "supabase",
      "localStorage",
      "fetch(",
    ]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

describe("RD2b #16 IO source-scan green", () => {
  it("placeCandidateAdapter.ts に write/notification/時刻/乱数なし", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/placeCandidateAdapter.ts"), "utf8");
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

describe("RD2b #17 全 stage 出力が violations green（baseline integrity）", () => {
  it("missing/text_only/unresolved/ambiguous/selected/confirmed すべて健全", async () => {
    const outs = await Promise.all([
      resolvePlaceCandidate(inp({ locationText: null })),
      resolvePlaceCandidate(inp({ locationText: "渋谷" })),
      resolvePlaceCandidate(inp({ locationText: "渋谷" }), { provider: provider({ candidateCount: 1 }) }),
      resolvePlaceCandidate(inp({ locationText: "渋谷" }), { provider: provider({ candidateCount: 3, competing: true }) }),
      resolvePlaceCandidate(inp({ locationText: "渋谷", selection: { source: "canonical_text", opaqueRef: null } })),
      resolvePlaceCandidate(inp({ locationText: "渋谷", confirmation: { source: "user_selected", evidenceCodes: ["sel"], opaqueRef: null } })),
    ]);
    for (const p of outs) expect(placeAdapterOutputViolations(p)).toEqual([]);
    expect(outs.map((p) => p.stage)).toEqual([
      "missing_place",
      "location_text_only",
      "candidate_unresolved",
      "ambiguous_place",
      "candidate_selected",
      "exact_confirmed",
    ]);
  });
});
