/**
 * RD3c-P3a — operator duration seed write path（pure・repository 注入・no-DB/Supabase/route/UI）（2026-06-16）
 * 正本設計: docs/reality-duration-confirmation-storage-rd3-c-p2-p3-0.md §6/§9
 *
 * 核: operator が dogfood/staging 用に seed を書く最小 write path。**server が governance を固定**
 *   （operator_seed / actor=operator / learningEligible=false / productionEligible=false / env は production reject）。
 *   client 入力を信用しない・validation bypass 不可・物理 delete しない（supersede）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createOperatorDurationSeed,
  type OperatorDurationSeedRequestV0,
  type OperatorDurationSeedRepositoryV0,
  type OperatorDurationSeedDepsV0,
} from "@/lib/plan/realityCore/operatorDurationSeedWrite";
import type { DurationConfirmationInsertV0, DurationConfirmationScopeV0 } from "@/lib/plan/realityCore/durationConfirmation";

const scope = (over: Partial<DurationConfirmationScopeV0> = {}): DurationConfirmationScopeV0 => ({
  targetNodeId: "ern:2026-06-12:a1",
  originRef: "opaque-o1",
  destinationRef: "opaque-d1",
  transportMode: "transit",
  timeBand: null,
  subjectiveDate: "2026-06-12",
  temporalScopeRef: "tsr-1",
  routeEtaSupplyId: null,
  providerVersion: "v1",
  ...over,
});
const request = (over: Partial<OperatorDurationSeedRequestV0> = {}): OperatorDurationSeedRequestV0 => ({
  userId: "user-1",
  sourceAnchorRef: null,
  scope: scope(),
  durationUpperBoundMinutes: 20,
  durationLowerBoundMinutes: null,
  durationBasis: "user_confirmed",
  confirmedBy: "operator-1",
  sourceRefs: ["opaque-src"],
  evidenceRefs: ["opaque-ev"],
  freshnessStatus: "fresh",
  validUntil: null,
  ...over,
});

// in-memory fake repository（insert された row を捕捉・supersede 記録）。
function fakeRepo(existing: ReadonlyArray<{ id: string }> = []) {
  const inserted: DurationConfirmationInsertV0[] = [];
  const superseded: Array<{ id: string; by: string | null }> = [];
  let n = 0;
  const repository: OperatorDurationSeedRepositoryV0 = {
    findActiveByScope: async () => existing,
    markSuperseded: async (id, by) => { superseded.push({ id, by }); },
    insert: async (row) => { inserted.push(row); n += 1; return { id: `new-${n}` }; },
  };
  return { repository, inserted, superseded };
}
const deps = (over: Partial<OperatorDurationSeedDepsV0> = {}, repo = fakeRepo()): OperatorDurationSeedDepsV0 => ({
  isOperator: true,
  resolvedEnvironment: "staging",
  nowIso: "2026-06-12T08:00:00+09:00",
  repository: repo.repository,
  ...over,
});

describe("RD3c-P3a #1-#9 server-side provenance 固定（client を信用しない）", () => {
  it("#1/#2/#3/#6/#7 valid operator seed → insert・governance 全固定", async () => {
    const repo = fakeRepo();
    const r = await createOperatorDurationSeed(request(), deps({}, repo));
    expect(r.ok).toBe(true);
    expect(repo.inserted.length).toBe(1);
    const g = repo.inserted[0].governance;
    expect(g.provenanceKind).toBe("operator_seed"); // #3 固定
    expect(g.actorType).toBe("operator"); // #2 固定
    expect(g.learningEligible).toBe(false); // #6 固定
    expect(g.productionEligible).toBe(false); // #7 固定
    expect(g.environment).toBe("staging");
    expect(g.createdBySlice).toBe("RD3c-P3a");
  });
  it("#4/#5 environment は dogfood/staging のみ・production は reject（insert なし）", async () => {
    const repoD = fakeRepo();
    expect((await createOperatorDurationSeed(request(), deps({ resolvedEnvironment: "dogfood" }, repoD))).ok).toBe(true);
    const repoP = fakeRepo();
    const rp = await createOperatorDurationSeed(request(), deps({ resolvedEnvironment: "production" }, repoP));
    expect(rp.ok).toBe(false);
    expect((rp as { rejectedReason: string }).rejectedReason).toBe("environment_production_not_allowed");
    expect(repoP.inserted.length).toBe(0);
  });
  it("#8/#9 general_user_confirmed / user actor を operator path で作れない（request に field が存在しない・常に operator_seed）", async () => {
    // request 型に provenanceKind/actorType が無いため、cast で無理に渡しても無視される
    const sneaky = { ...request(), provenanceKind: "general_user_confirmed", actorType: "user", learningEligible: true } as unknown as OperatorDurationSeedRequestV0;
    const repo = fakeRepo();
    const r = await createOperatorDurationSeed(sneaky, deps({}, repo));
    expect(r.ok).toBe(true);
    expect(repo.inserted[0].governance.provenanceKind).toBe("operator_seed"); // 無視され固定
    expect(repo.inserted[0].governance.actorType).toBe("operator");
    expect(repo.inserted[0].governance.learningEligible).toBe(false);
  });
});

describe("RD3c-P3a #10-#16 validation（bypass 不可）・operator gate", () => {
  const expectReject = async (req: OperatorDurationSeedRequestV0, d = deps()) => {
    const repo = fakeRepo();
    const r = await createOperatorDurationSeed(req, { ...d, repository: repo.repository });
    expect(r.ok).toBe(false);
    expect(repo.inserted.length).toBe(0); // insert されない
    return r;
  };
  it("#10 scope missing targetNodeId → reject", async () => {
    await expectReject(request({ scope: scope({ targetNodeId: "" }) }));
  });
  it("#11 scope missing origin/destination → reject", async () => {
    await expectReject(request({ scope: scope({ originRef: "" }) }));
    await expectReject(request({ scope: scope({ destinationRef: "" }) }));
  });
  it("#12 upper not multiple of 5 → reject", async () => {
    await expectReject(request({ durationUpperBoundMinutes: 23 }));
  });
  it("#13 heuristic basis → reject", async () => {
    await expectReject(request({ durationBasis: "heuristic" as OperatorDurationSeedRequestV0["durationBasis"] }));
  });
  it("#14 raw coordinate / polyline / placeId / route response → reject", async () => {
    await expectReject(request({ scope: scope({ originRef: "35.6586,139.7454" }) }));
    await expectReject(request({ sourceRefs: ["overview_polyline:abc"] }));
    await expectReject(request({ evidenceRefs: ["place_id:ChIJ"] }));
    await expectReject(request({ scope: scope({ providerVersion: '{"legs":[{}]}' }) }));
  });
  it("#15 raw title/locationText 風（座標 leak）→ reject", async () => {
    await expectReject(request({ sourceRefs: ["lat:35.6, lng:139.7"] }));
  });
  it("#16 non-operator → reject（insert なし）", async () => {
    const repo = fakeRepo();
    const r = await createOperatorDurationSeed(request(), deps({ isOperator: false }, repo));
    expect(r.ok).toBe(false);
    expect((r as { rejectedReason: string }).rejectedReason).toBe("not_operator");
    expect(repo.inserted.length).toBe(0);
  });
  it("#21 validation bypass 不可（bad bounds は insert に到達しない）", async () => {
    const repo = fakeRepo();
    const r = await createOperatorDurationSeed(request({ durationUpperBoundMinutes: -5 }), deps({}, repo));
    expect(r.ok).toBe(false);
    expect(repo.inserted.length).toBe(0);
  });
});

describe("RD3c-P3a supersede / duplicate（物理 delete しない・audit chain）", () => {
  it("同一 scope の既存 active → supersede（markSuperseded 呼ばれ・新 id に結ぶ）・insert 1", async () => {
    const repo = fakeRepo([{ id: "old-1" }, { id: "old-2" }]);
    const r = await createOperatorDurationSeed(request(), deps({}, repo));
    expect(r.ok).toBe(true);
    expect(repo.inserted.length).toBe(1); // insert は 1（既存は物理 delete でなく supersede）
    // old-1/old-2 が supersede され、最終的に新 id に結ばれる
    expect(repo.superseded.some((s) => s.id === "old-1")).toBe(true);
    expect(repo.superseded.some((s) => s.id === "old-2")).toBe(true);
    expect(repo.superseded.some((s) => s.by === "new-1")).toBe(true); // audit chain
  });
  it("既存なし → supersede なし・insert 1", async () => {
    const repo = fakeRepo([]);
    await createOperatorDurationSeed(request(), deps({}, repo));
    expect(repo.superseded.length).toBe(0);
    expect(repo.inserted.length).toBe(1);
  });
});

describe("RD3c-P3a #17-#20 service_role/UI/route/notification 不使用（source-scan）", () => {
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const code = stripComments(readFileSync(join(process.cwd(), "lib/plan/realityCore/operatorDurationSeedWrite.ts"), "utf8")).toLowerCase();
  it("#17 service_role を使わない", () => {
    expect(code.includes("service_role")).toBe(false);
  });
  it("#18 UI / client component を持たない（react/jsx/use client なし）", () => {
    for (const t of ["react", "use client", "jsx", "tsx", "next/"]) expect(code.includes(t)).toBe(false);
  });
  it("#19 product route / Alter / supabase を直接 import しない（repository 注入）", () => {
    for (const t of ["supabase", "alttab", "buildalterscreen", "/plan/page", "createclient"]) expect(code.includes(t)).toBe(false);
  });
  it("#20 notification / external communication / IO を持たない", () => {
    for (const t of ["notification", "fetch(", "pushnotification", "email", "webhook", "new date(", "date.now", "math.random", "localstorage"]) {
      expect(code.includes(t)).toBe(false);
    }
  });
});
