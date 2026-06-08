/**
 * A1-7-34 Second Self Read Mapper + Presenter + Reader — pure/mock tests（実 DB 0）。
 *   row→tendency（不正 skip）/ presenter が **断定しない・trait 語彙を出さない** / counter·stillPossible 併記 / certainty≤tentative /
 *   correctable copy（write しない）/ empty state / reader(mock client) owner-RLS read・fail-open。
 */
import { describe, it, expect } from "vitest";
import {
  prmModelEntryRowToTendency,
  prmModelEntryRowsToTendencies,
  PRM_MODEL_ENTRY_READ_COLUMNS,
  type PrmModelEntryReadRow,
  type SecondSelfTendency,
} from "@/lib/plan/reality/learning/prm-model-entry-read";
import { presentTendency, presentSecondSelf } from "@/lib/plan/reality/learning/second-self-presenter";
import {
  createSupabasePrmModelEntryReader,
  type PrmModelEntryReadClient,
} from "@/lib/plan/reality/learning/supabase-prm-model-entry-reader";

const USER = "99999999-9999-4999-8999-999999999999";
/** 断定・trait 語彙（出てはいけない）。 */
const ASSERTIVE_OR_TRAIT = /あなたは[^。]*です|性格|怠惰|だらしない|personality|trait|fixed_preference|always|never|いつも|決して/i;
const NO_RAW = /raw|seed_?ref|utterance/i;

function row(over: Partial<PrmModelEntryReadRow> = {}): PrmModelEntryReadRow {
  return { context_dimension: "band", context_value: "evening", tendency_direction: "non_adoption", favored_hypothesis: "not_now", still_possible: ["not_selected", "mismatch_unknown"], evidence_count: 6, counter_count: 1, certainty: "tentative", review_decision_id: "rid-0", user_correction: null, ...over };
}
function tendency(over: Partial<SecondSelfTendency> = {}): SecondSelfTendency {
  return prmModelEntryRowToTendency(row())! && { ...prmModelEntryRowToTendency(row())!, ...over };
}

describe("A1-7-34 prmModelEntryRowToTendency — read model", () => {
  it("row → tendency（reviewed=true・certainty≤tentative・stillPossible）", () => {
    const t = prmModelEntryRowToTendency(row())!;
    expect(t.tendencyDirection).toBe("non_adoption");
    expect(t.certainty).toBe("tentative");
    expect(t.reviewed).toBe(true);
    expect(t.stillPossible).toEqual(["not_selected", "mismatch_unknown"]);
  });
  it("不正 direction / certainty=high → skip（null）", () => {
    expect(prmModelEntryRowToTendency(row({ tendency_direction: "bogus" }))).toBeNull();
    expect(prmModelEntryRowToTendency(row({ certainty: "high" }))).toBeNull(); // 防御（DB CHECK 前提）
  });
  it("read columns に raw/seedRef/user_id/id/decay なし", () => {
    expect(PRM_MODEL_ENTRY_READ_COLUMNS).not.toMatch(/raw|seed_?ref|user_id|\bid\b|decay/);
    expect(PRM_MODEL_ENTRY_READ_COLUMNS).toContain("tendency_direction");
  });
});

describe("A1-7-34 presentTendency — 断定しない・trait 出さない・counter/stillPossible 併記", () => {
  it("non_adoption evening → 観察文（傾向が見えています・断定/trait なし）", () => {
    const c = presentTendency(tendency());
    expect(c.observation).toContain("夜の予定");
    expect(c.observation).toContain("見送りやすい");
    expect(c.observation).toContain("傾向が見えています"); // 観測 tone
    expect(c.observation).not.toMatch(ASSERTIVE_OR_TRAIT); // 断定/trait なし
    expect(JSON.stringify(c)).not.toMatch(ASSERTIVE_OR_TRAIT);
    expect(JSON.stringify(c)).not.toMatch(NO_RAW);
  });
  it("counter / stillPossible が併記される", () => {
    const c = presentTendency(tendency());
    expect(c.counterNote).toContain("1 件は違う"); // counter 併記
    expect(c.stillPossibleNote).toContain("別の見方も 2 件"); // stillPossible 併記
  });
  it("counter 0 / stillPossible 0 → note null", () => {
    const c = presentTendency(tendency({ counterCount: 0, stillPossible: [] }));
    expect(c.counterNote).toBeNull();
    expect(c.stillPossibleNote).toBeNull();
  });
  it("certainty は ≤tentative の note・provenance は reviewed・correctable copy あり（write しない）", () => {
    const c = presentTendency(tendency());
    expect(c.certaintyNote).toMatch(/ゆるやか|手がかり/);
    expect(c.provenanceNote).toContain("確認した観測");
    expect(c.correctable).toContain("直せます"); // 共同編集導線（copy のみ）
  });
  it("全 direction で断定/trait なし", () => {
    for (const d of ["adoption", "non_adoption", "deferral"] as const) {
      const c = presentTendency(tendency({ tendencyDirection: d }));
      expect(c.observation).toContain("傾向が見えています");
      expect(c.observation).not.toMatch(ASSERTIVE_OR_TRAIT);
    }
  });
  it("userCorrection → correctionState 表示", () => {
    expect(presentTendency(tendency({ userCorrection: "rejected" })).correctionState).toContain("違う");
  });
});

describe("A1-7-34 presentSecondSelf — view + empty state", () => {
  it("tendencies → cards・非空", () => {
    const v = presentSecondSelf([tendency(), tendency({ tendencyDirection: "adoption" })]);
    expect(v.cards).toHaveLength(2);
    expect(v.isEmpty).toBe(false);
  });
  it("0 件 → empty state（非断定の空 copy）", () => {
    const v = presentSecondSelf([]);
    expect(v.isEmpty).toBe(true);
    expect(v.emptyNote).toContain("まだ");
    expect(v.emptyNote).not.toMatch(ASSERTIVE_OR_TRAIT);
  });
});

describe("A1-7-34 createSupabasePrmModelEntryReader — owner-RLS read・fail-open", () => {
  function mock(mode: { rows?: readonly PrmModelEntryReadRow[]; error?: { message: string }; nullData?: boolean } = {}) {
    const calls: { table: string; cols: string; eqs: [string, string | boolean][]; isNull: string[] }[] = [];
    const client: PrmModelEntryReadClient = {
      from(table) {
        const q = { table, cols: "", eqs: [] as [string, string | boolean][], isNull: [] as string[] };
        calls.push(q);
        const data = (mode.nullData ? null : (mode.rows ?? [])) as unknown as readonly Record<string, unknown>[] | null;
        const chain = {
          eq(c: string, v: string | boolean) { q.eqs.push([c, v]); return chain; },
          is(c: string, _v: null) { q.isNull.push(c); return chain; },
          order() { return chain; },
          limit() { return Promise.resolve({ data, error: mode.error ?? null }); },
        };
        return { select(cols: string) { q.cols = cols; return chain; } };
      },
    };
    return { client, calls };
  }
  it("rows → tendencies・table/cols/eq(user_id,user_visible)/is(retracted_at)", async () => {
    const { client, calls } = mock({ rows: [row(), row({ tendency_direction: "adoption" })] });
    const ts = await createSupabasePrmModelEntryReader(client, USER).readSecondSelfTendencies();
    expect(ts.map((t) => t.tendencyDirection)).toEqual(["non_adoption", "adoption"]);
    expect(calls[0]!.table).toBe("prm_model_entries");
    expect(calls[0]!.cols).toBe(PRM_MODEL_ENTRY_READ_COLUMNS);
    expect(calls[0]!.eqs).toContainEqual(["user_id", USER]);
    expect(calls[0]!.eqs).toContainEqual(["user_visible", true]);
    expect(calls[0]!.isNull).toContain("retracted_at");
  });
  it("error → []・null → []（fail-open）", async () => {
    expect(await createSupabasePrmModelEntryReader(mock({ error: { message: "x" } }).client, USER).readSecondSelfTendencies()).toEqual([]);
    expect(await createSupabasePrmModelEntryReader(mock({ nullData: true }).client, USER).readSecondSelfTendencies()).toEqual([]);
  });
});

// prmModelEntryRowsToTendencies 経路（不正 skip）
describe("A1-7-34 prmModelEntryRowsToTendencies", () => {
  it("不正 row skip", () => {
    expect(prmModelEntryRowsToTendencies([row(), row({ tendency_direction: "x" }), row({ tendency_direction: "deferral" })]).map((t) => t.tendencyDirection)).toEqual(["non_adoption", "deferral"]);
  });
});
