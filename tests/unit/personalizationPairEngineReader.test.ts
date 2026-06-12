import { describe, it, expect } from "vitest";
import { getPairSnapshotsForEngine } from "@/lib/shared/personalization/pairEngineReader.server";
import { isEngineOnly, assertNoEngineOnlyLeak, EngineOnlyLeakError } from "@/lib/shared/personalization/engineOnly";

type ReadResult = { data: unknown[] | null; error: { message: string } | null };

// ─────────────────────────────────────────────────────────────────────────────
// fake userClient（consent 前置検査用・select chain のみ）
// ─────────────────────────────────────────────────────────────────────────────
function fakeUserClient(
  pairRow: Record<string, unknown> | null,
  opts: { error?: boolean; throwIt?: boolean } = {},
) {
  const methods: string[] = [];
  function chain() {
    const ch = {
      eq(_c: string, _v: string) {
        methods.push("eq");
        return ch;
      },
      then(resolve: (r: ReadResult) => unknown, reject?: (e: unknown) => unknown) {
        if (opts.throwIt) return Promise.reject(new Error("boom")).then(resolve, reject);
        const data = pairRow ? [pairRow] : [];
        const error = opts.error ? { message: "rls" } : null;
        return Promise.resolve({ data, error }).then(resolve, reject);
      },
    };
    return ch;
  }
  const client = {
    from(_t: string) {
      methods.push("from");
      return {
        select(_c: string) {
          methods.push("select");
          return chain();
        },
      };
    },
  };
  return { client, methods };
}

// ─────────────────────────────────────────────────────────────────────────────
// fake adminReadClient（M2-A getPersonalizationSnapshot 互換・user_id でデータ分岐）
// ─────────────────────────────────────────────────────────────────────────────
type UserData = { axes?: unknown[]; growth?: unknown[] };
function fakeAdminClient(perUser: Record<string, UserData>, opts: { errorUser?: string } = {}) {
  const fromCalls: string[] = [];
  function chain(table: string) {
    const filters: Record<string, string> = {};
    const ch = {
      eq(col: string, val: string) {
        filters[col] = val;
        return ch;
      },
      is(_c: string, _v: null) {
        return ch;
      },
      order(_c: string, _o: { ascending: boolean }) {
        return ch;
      },
      then(resolve: (r: ReadResult) => unknown, reject?: (e: unknown) => unknown) {
        const uid = filters["user_id"] ?? "";
        if (opts.errorUser && uid === opts.errorUser) {
          return Promise.resolve({ data: null, error: { message: "boom" } }).then(resolve, reject);
        }
        const bucket = perUser[uid] ?? {};
        const data =
          table === "stargazer_axis_snapshots" ? bucket.axes ?? [] : bucket.growth ?? [];
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return ch;
  }
  const client = {
    from(table: string) {
      fromCalls.push(table);
      return {
        select(_c: string) {
          return chain(table);
        },
      };
    },
  };
  return { client, fromCalls };
}

const axisRow = (axisId: string, score: number, confidence: number | null, createdAt: string) => ({
  axis_id: axisId,
  score,
  confidence,
  created_at: createdAt,
});

const pairRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "p1",
  user_a: "uA",
  user_b: "uB",
  state: "enabled",
  accepted_at: "2026-06-01T00:00:00Z",
  onboarded_at: "2026-06-01T00:00:00Z",
  ...over,
});

const ASOF = "2026-06-12T09:00:00Z";
const baseParams = (userClient: unknown, adminReadClient: unknown) => ({
  userClient,
  adminReadClient,
  pairStateId: "p1",
  callerUserId: "uA",
  asOf: ASOF,
});

describe("getPairSnapshotsForEngine — consent 前置検査の失敗（adminReadClient 未使用）", () => {
  it("pair 不可視（RLS / 不在）→ null・admin from 0 回", async () => {
    const u = fakeUserClient(null);
    const a = fakeAdminClient({});
    expect(await getPairSnapshotsForEngine(baseParams(u.client, a.client))).toBeNull();
    expect(a.fromCalls).toHaveLength(0);
  });

  it("state=disabled → null・admin 0 回", async () => {
    const u = fakeUserClient(pairRow({ state: "disabled" }));
    const a = fakeAdminClient({});
    expect(await getPairSnapshotsForEngine(baseParams(u.client, a.client))).toBeNull();
    expect(a.fromCalls).toHaveLength(0);
  });

  it("state=pending_consent → null・admin 0 回", async () => {
    const u = fakeUserClient(pairRow({ state: "pending_consent", accepted_at: null }));
    const a = fakeAdminClient({});
    expect(await getPairSnapshotsForEngine(baseParams(u.client, a.client))).toBeNull();
    expect(a.fromCalls).toHaveLength(0);
  });

  it("accepted_at が null → null・admin 0 回", async () => {
    const u = fakeUserClient(pairRow({ accepted_at: null }));
    const a = fakeAdminClient({});
    expect(await getPairSnapshotsForEngine(baseParams(u.client, a.client))).toBeNull();
    expect(a.fromCalls).toHaveLength(0);
  });

  it("onboarded_at が null → null・admin 0 回", async () => {
    const u = fakeUserClient(pairRow({ onboarded_at: null }));
    const a = fakeAdminClient({});
    expect(await getPairSnapshotsForEngine(baseParams(u.client, a.client))).toBeNull();
    expect(a.fromCalls).toHaveLength(0);
  });

  it("caller が pair の member でない（defense-in-depth）→ null・admin 0 回", async () => {
    const u = fakeUserClient(pairRow({ user_a: "uX", user_b: "uY" }));
    const a = fakeAdminClient({});
    expect(await getPairSnapshotsForEngine(baseParams(u.client, a.client))).toBeNull();
    expect(a.fromCalls).toHaveLength(0);
  });

  it("precheck の query error / 例外 → null・admin 0 回", async () => {
    const aErr = fakeAdminClient({});
    const uErr = fakeUserClient(null, { error: true });
    expect(await getPairSnapshotsForEngine(baseParams(uErr.client, aErr.client))).toBeNull();
    expect(aErr.fromCalls).toHaveLength(0);

    const aThrow = fakeAdminClient({});
    const uThrow = fakeUserClient(null, { throwIt: true });
    expect(await getPairSnapshotsForEngine(baseParams(uThrow.client, aThrow.client))).toBeNull();
    expect(aThrow.fromCalls).toHaveLength(0);
  });
});

describe("getPairSnapshotsForEngine — consent 合格後の特権 read", () => {
  it("enabled pair: 前置検査の後にのみ admin を呼び、両者 snapshot を返す（ブランド付き）", async () => {
    const u = fakeUserClient(pairRow());
    const a = fakeAdminClient({
      uA: { axes: [axisRow("cautious_vs_bold", -0.5, 0.8, "2026-06-10T00:00:00Z")] },
      uB: {
        axes: [axisRow("introvert_vs_extrovert", 0.6, 0.9, "2026-06-10T00:00:00Z")],
        growth: [{ hdm_phase_state: { currentPhase: 3 }, trust_level: 0.7, updated_at: "2026-06-10T00:00:00Z" }],
      },
    });
    // precheck が先（admin はまだ 0）であることを確認するため、user methods を観測
    const res = await getPairSnapshotsForEngine(baseParams(u.client, a.client));
    expect(res).not.toBeNull();
    expect(isEngineOnly(res)).toBe(true);
    expect(u.methods).toContain("from"); // precheck 実行済み
    // admin は self/partner × (axes+growth) = 4 回
    expect(a.fromCalls).toEqual([
      "stargazer_axis_snapshots",
      "stargazer_alter_growth",
      "stargazer_axis_snapshots",
      "stargazer_alter_growth",
    ]);
    expect(res!.selfUserId).toBe("uA");
    expect(res!.partnerUserId).toBe("uB");
    expect(res!.self.axes.cautious_vs_bold).toMatchObject({ score: -0.5 });
    expect(res!.partner.hdm).toEqual({ currentPhase: 3, trustLevelRaw: 0.7 });
    // ブランド付きなのでそのまま client へ出せない
    expect(() => assertNoEngineOnlyLeak(res)).toThrow(EngineOnlyLeakError);
  });

  it("caller=uB の場合 partner=uA に正しくラベリング", async () => {
    const u = fakeUserClient(pairRow());
    const a = fakeAdminClient({ uA: {}, uB: {} });
    const res = await getPairSnapshotsForEngine({ ...baseParams(u.client, a.client), callerUserId: "uB" });
    expect(res!.selfUserId).toBe("uB");
    expect(res!.partnerUserId).toBe("uA");
  });

  it("partner の観測ゼロは null-safe（空 axes / hdm null・全体は成立）", async () => {
    const u = fakeUserClient(pairRow());
    const a = fakeAdminClient({
      uA: { axes: [axisRow("cautious_vs_bold", 0.2, 0.5, "2026-06-10T00:00:00Z")] },
      uB: {}, // partner にデータなし
    });
    const res = await getPairSnapshotsForEngine(baseParams(u.client, a.client));
    expect(res).not.toBeNull();
    expect(res!.partner.axes).toEqual({});
    expect(res!.partner.hdm).toBeNull();
    expect(res!.self.axes.cautious_vs_bold).toBeDefined();
  });

  it("特権 read が query error（self / partner どちらでも）→ null（partial を返さない）", async () => {
    const uSelf = fakeUserClient(pairRow());
    const aSelf = fakeAdminClient({ uA: {}, uB: {} }, { errorUser: "uA" });
    expect(await getPairSnapshotsForEngine(baseParams(uSelf.client, aSelf.client))).toBeNull();

    const uPartner = fakeUserClient(pairRow());
    const aPartner = fakeAdminClient({ uA: {}, uB: {} }, { errorUser: "uB" });
    expect(await getPairSnapshotsForEngine(baseParams(uPartner.client, aPartner.client))).toBeNull();
  });
});

describe("注入 client は select chain のみ（write メソッド非露出）", () => {
  it("fake userClient / adminReadClient に insert/update/delete/upsert/rpc が存在しない", () => {
    const u = fakeUserClient(pairRow());
    const a = fakeAdminClient({ uA: {}, uB: {} });
    const uTable = u.client.from("coalter_pair_states");
    const aTable = a.client.from("stargazer_axis_snapshots");
    for (const t of [uTable, aTable]) {
      const keys = Object.keys(t);
      expect(keys).toEqual(["select"]);
      for (const forbidden of ["insert", "update", "delete", "upsert", "rpc"]) {
        expect((t as Record<string, unknown>)[forbidden]).toBeUndefined();
      }
    }
    // select チェーンにも write は無い
    const uChain = uTable.select("x") as unknown as Record<string, unknown>;
    expect(Object.keys(uChain).sort()).toEqual(["eq", "then"]);
    const aChain = aTable.select("x") as unknown as Record<string, unknown>;
    expect(Object.keys(aChain).sort()).toEqual(["eq", "is", "order", "then"]);
  });
});
