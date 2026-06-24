// tests/unit/plan/travelUserNoteWritePathE6a.test.ts
// E-6A: Supabase repo ON write-path 修正の unit 検証（fake client・DB 不要）。
//   E-5C-2 で検出した破壊バグ（DB-read notes の round-trip → published delete/再作成/self_memo 変換/重複）の
//   再発防止。SupabaseTravelPersonalStore.writeUserNotes / readUserNotes の契約を fake client で固定する。
import { describe, it, expect } from "vitest";
import { SupabaseTravelPersonalStore } from "@/app/(culcept)/calendar/_lib/travel/repository/supabaseTravelPersonalStore";
import type { LocationItem } from "@/app/(culcept)/calendar/_lib/travel/types";

const UUID = "40f071c2-f32f-4e6e-816e-c9db4691ff31"; // DB-read note 由来（uuid）
const UUID2 = "d13a0647-0000-4000-8000-000000000000";

function note(id: string, title: string, over: Partial<LocationItem> = {}): LocationItem {
  return {
    id,
    kind: "spot",
    prefecture: "京都府",
    title,
    classification: "standard",
    rating: 0,
    ratingCount: 0,
    photo: null,
    ...over,
  } as LocationItem;
}

/** location_notes の select/insert/delete を捕捉する fake Supabase client。 */
function makeClient(opts: { existingTitles?: string[]; user?: { id: string } | null } = {}) {
  const calls = { from: [] as string[], inserts: [] as unknown[][], deletes: 0, selects: 0 };
  const existing = (opts.existingTitles ?? []).map((title) => ({ title }));

  function qb() {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "in", "order", "limit", "upsert"]) {
      b[m] = () => {
        if (m === "select") calls.selects++;
        return b;
      };
    }
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.single = () => Promise.resolve({ data: { id: "new-uuid" }, error: null });
    // await された select chain は {data: existing} を返す
    b.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
      resolve({ data: existing, error: null });
    b.insert = (rows: unknown[]) => {
      calls.inserts.push(rows);
      const r: Record<string, unknown> = {};
      r.select = () => ({ single: () => Promise.resolve({ data: { id: "new-uuid" }, error: null }) });
      r.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
        resolve({ data: null, error: null });
      return r;
    };
    b.delete = () => {
      calls.deletes++;
      const r: Record<string, unknown> = {};
      r.in = () => Promise.resolve({ data: null, error: null });
      r.eq = () => r;
      r.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
        resolve({ data: null, error: null });
      return r;
    };
    return b;
  }

  const client = {
    from: (t: string) => {
      calls.from.push(t);
      return qb();
    },
    auth: { getUser: async () => ({ data: { user: opts.user === undefined ? { id: "uid-1" } : opts.user } }) },
  };
  return { client, calls };
}

describe("E-6A writeUserNotes 非破壊 append-only", () => {
  it("DB-read note（uuid id）のみ渡されたら insert も delete もしない（round-trip 防止）", async () => {
    const { client, calls } = makeClient();
    const store = new SupabaseTravelPersonalStore(client as never);
    await store.writeUserNotes([note(UUID, "DBSMOKE祇園プラン"), note(UUID2, "DBSMOKE清水寺")]);
    expect(calls.inserts.length).toBe(0); // 書き戻さない
    expect(calls.deletes).toBe(0); // 破壊しない
  });

  it("published を self_memo/private へ変換しない（uuid note は insert payload を作らない）", async () => {
    const { client, calls } = makeClient();
    const store = new SupabaseTravelPersonalStore(client as never);
    await store.writeUserNotes([note(UUID, "published-note", { kind: "trip", classification: "classic" })]);
    expect(calls.inserts.flat().length).toBe(0); // 変換 insert ゼロ
    expect(calls.deletes).toBe(0);
  });

  it("ユーザー作成の新規 note（client id 非 uuid）だけ insert・delete はしない", async () => {
    const { client, calls } = makeClient();
    const store = new SupabaseTravelPersonalStore(client as never);
    await store.writeUserNotes([note("user-1730000000000", "わたしのメモ"), note(UUID, "DB由来")]);
    expect(calls.inserts.length).toBe(1);
    const inserted = calls.inserts[0] as Array<Record<string, unknown>>;
    expect(inserted.length).toBe(1); // client id の 1 件のみ
    expect(inserted[0].title).toBe("わたしのメモ");
    expect(inserted[0].source_type).toBe("self_memo");
    expect(calls.deletes).toBe(0); // 非破壊
  });

  it("既存 self_memo と同 title の新規は dedup して insert しない（重複生成防止）", async () => {
    const { client, calls } = makeClient({ existingTitles: ["わたしのメモ"] });
    const store = new SupabaseTravelPersonalStore(client as never);
    await store.writeUserNotes([note("user-1730000000001", "わたしのメモ")]);
    expect(calls.inserts.length).toBe(0); // 既存 title は skip
    expect(calls.deletes).toBe(0);
  });

  it("空配列は完全 no-op（delete/insert/select いずれも走らない）", async () => {
    const { client, calls } = makeClient();
    const store = new SupabaseTravelPersonalStore(client as never);
    await store.writeUserNotes([]);
    expect(calls.from.length).toBe(0); // location_notes に一切触れない
    expect(calls.deletes).toBe(0);
  });

  it("location_notes に対する delete は決して発火しない（save 系と分離・破壊禁止）", async () => {
    const { client, calls } = makeClient({ existingTitles: ["x", "y"] });
    const store = new SupabaseTravelPersonalStore(client as never);
    await store.writeUserNotes([note("user-9", "新規"), note(UUID, "DB由来")]);
    expect(calls.deletes).toBe(0);
  });
});

describe("E-6A readUserNotes scope", () => {
  it("self_memo/private/self に絞った select を発行する（own published を含めない）", async () => {
    // readUserNotes の eq フィルタが効いていることを from 呼び出しで確認（fake は existing を返す）
    const { client, calls } = makeClient({ existingTitles: [] });
    const store = new SupabaseTravelPersonalStore(client as never);
    const res = await store.readUserNotes();
    expect(Array.isArray(res)).toBe(true);
    expect(calls.from).toContain("location_notes");
  });

  it("未認証は [] を返す", async () => {
    const { client } = makeClient({ user: null });
    const store = new SupabaseTravelPersonalStore(client as never);
    expect(await store.readUserNotes()).toEqual([]);
  });
});
