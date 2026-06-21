// tests/unit/plan/candidateLens/purposeQueryExpansion.test.ts
// Candidate Lens P5-a: 目的別 secondary query 生成（pure）の検証。
//   - purpose 別に query が変わる / duplicate を出さない / empty・unknown で no-op /
//     primary を壊さない / 日本語英語混在で安全 / 設備語を fact として扱わない / 外部 API・network・DB なし
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  PURPOSE_QUERY_EXPANSION_ENABLED,
  isPurposeQueryExpansionEnabled,
  PURPOSE_QUERY_KEYWORDS,
  MAX_KEYWORDS,
  MAX_SECONDARY_QUERIES,
  purposeQueryKeywords,
  buildSecondaryQueries,
  type SecondaryQueryResult,
} from "@/lib/plan/candidateLens/purposeQueryExpansion";
import type { PurposeLens } from "@/lib/plan/candidateLens/purposeLens";

afterEach(() => vi.unstubAllEnvs());

describe("flag — dormant / default OFF / production hard block", () => {
  it("★定数は OFF（dormant・route 未接続・実 fetch なし）", () => {
    expect(PURPOSE_QUERY_EXPANSION_ENABLED).toBe(false);
  });
  it("★dev でも OFF（const false ゆえ）", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isPurposeQueryExpansionEnabled()).toBe(false);
  });
  it("★production でも OFF（NODE_ENV hard block）", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isPurposeQueryExpansionEnabled()).toBe(false);
  });
});

describe("buildSecondaryQueries — purpose 別に query が変わる", () => {
  it("★meeting_prep / focus_work / conversation で異なる secondary を生成", () => {
    const primary = "成田美郷台 カフェ";
    const meeting = buildSecondaryQueries({ lens: "meeting_prep", primaryQuery: primary });
    const focus = buildSecondaryQueries({ lens: "focus_work", primaryQuery: primary });
    const conv = buildSecondaryQueries({ lens: "conversation", primaryQuery: primary });
    expect(meeting.queries).toHaveLength(1);
    expect(focus.queries).toHaveLength(1);
    expect(conv.queries).toHaveLength(1);
    // 目的で keyword 集合が変わる → query 文字列も変わる
    expect(meeting.queries[0]).not.toBe(conv.queries[0]);
    expect(focus.queries[0]).not.toBe(conv.queries[0]);
    // conversation は設備語でなく会話系
    expect(conv.keywords).toContain("会話");
    expect(conv.keywords).not.toContain("電源");
  });
  it("★secondary は primary を prefix に保ち、設備語を後置する", () => {
    const r = buildSecondaryQueries({ lens: "focus_work", primaryQuery: "渋谷 カフェ" });
    expect(r.queries[0]!.startsWith("渋谷 カフェ ")).toBe(true);
    for (const kw of r.keywords) expect(r.queries[0]).toContain(kw);
  });
});

describe("duplicate query を出さない（dedupe / primary 既出語 除外 / 上限）", () => {
  it("★MAX_KEYWORDS を超えて設備語を詰めない", () => {
    const r = buildSecondaryQueries({ lens: "meeting_prep", primaryQuery: "新宿 カフェ" });
    expect(r.keywords.length).toBeLessThanOrEqual(MAX_KEYWORDS);
  });
  it("★MAX_SECONDARY_QUERIES 本までしか生成しない", () => {
    const r = buildSecondaryQueries({ lens: "meeting_prep", primaryQuery: "新宿 カフェ" });
    expect(r.queries.length).toBeLessThanOrEqual(MAX_SECONDARY_QUERIES);
  });
  it("★primary に既出の設備語は足さない（重複検索語を増やさない）", () => {
    // primary に「電源」を含めると、その語は secondary に重複追加されない
    const r = buildSecondaryQueries({ lens: "focus_work", primaryQuery: "新宿 カフェ 電源" });
    expect(r.keywords).not.toContain("電源");
    // 「電源」は1回だけ（primary 由来）
    const count = (r.queries[0] ?? "").split("電源").length - 1;
    expect(count).toBeLessThanOrEqual(1);
  });
  it("★keywords に重複なし", () => {
    const r = buildSecondaryQueries({ lens: "meeting_prep", primaryQuery: "新宿 カフェ" });
    expect(new Set(r.keywords).size).toBe(r.keywords.length);
  });
});

describe("empty / unknown purpose で安全に no-op", () => {
  it("★generic は語彙が空 → no-op（[]）", () => {
    const r = buildSecondaryQueries({ lens: "generic", primaryQuery: "新宿 カフェ" });
    expect(r.queries).toEqual([]);
    expect(r.keywords).toEqual([]);
  });
  it("★primary 空 / 空白のみ → no-op", () => {
    expect(buildSecondaryQueries({ lens: "meeting_prep", primaryQuery: "" }).queries).toEqual([]);
    expect(buildSecondaryQueries({ lens: "meeting_prep", primaryQuery: "   " }).queries).toEqual([]);
  });
  it("★足せる語が全て primary に既出 → no-op（secondary を作らない）", () => {
    const vocab = PURPOSE_QUERY_KEYWORDS.errand; // ["立ち寄り","近い"]
    const primary = `新宿 ${vocab.join(" ")}`;
    const r = buildSecondaryQueries({ lens: "errand", primaryQuery: primary });
    expect(r.queries).toEqual([]);
    expect(r.keywords).toEqual([]);
  });
});

describe("primary query を壊さない", () => {
  it("★入力 primaryQuery 文字列は変化しない（純関数・mutate なし）", () => {
    const primary = "成田美郷台 カフェ";
    const before = primary;
    buildSecondaryQueries({ lens: "meeting_prep", primaryQuery: primary });
    expect(primary).toBe(before);
  });
  it("★primary 自体は結果に「改変されず」prefix として現れる", () => {
    const primary = "京都 ブックカフェ";
    const r = buildSecondaryQueries({ lens: "focus_work", primaryQuery: primary });
    // primary を1文字も削らず prefix にしている
    expect(r.queries[0]!.indexOf(primary)).toBe(0);
  });
});

describe("日本語/英語の語彙が混ざってもクラッシュしない", () => {
  it("★Wi-Fi（英字+ハイフン）を含む語彙でも安全に処理", () => {
    const r = buildSecondaryQueries({ lens: "focus_work", primaryQuery: "Shibuya cafe" });
    expect(Array.isArray(r.queries)).toBe(true);
    expect(() => buildSecondaryQueries({ lens: "meeting_prep", primaryQuery: "wifi WIFI Wi-Fi" })).not.toThrow();
  });
  it("★大小文字違いの primary 既出も検出（小文字化比較）", () => {
    // primary に "wi-fi"（小文字）→ 語彙の "Wi-Fi" は重複として除外される
    const r = buildSecondaryQueries({ lens: "meeting_prep", primaryQuery: "shibuya cafe wi-fi" });
    expect(r.keywords).not.toContain("Wi-Fi");
  });
});

describe("設備語を evidence=fact として扱わない（honesty 境界）", () => {
  it("★結果に fact/evidence/confirmed の類のキーを持たない（検索語のみ）", () => {
    const r: SecondaryQueryResult = buildSecondaryQueries({ lens: "meeting_prep", primaryQuery: "新宿 カフェ" });
    expect(Object.keys(r).sort()).toEqual(["keywords", "queries"]);
    // keywords は「検索語」型（string[]）であって、確定属性オブジェクトではない
    for (const kw of r.keywords) expect(typeof kw).toBe("string");
  });
  it("★Wi-Fi/電源/静か は『検索語』としてのみ現れ、fact フラグは付かない", () => {
    const r = buildSecondaryQueries({ lens: "meeting_prep", primaryQuery: "新宿 カフェ" });
    // keywords は検索語の配列。confirmed/true 等の付帯はない（型上も string[]）。
    expect(r.keywords.every((k) => typeof k === "string")).toBe(true);
  });
});

describe("外部 API / network / DB を使わない（pure・決定論）", () => {
  it("★同一入力で常に同一出力（決定論・副作用なし）", () => {
    const input = { lens: "meeting_prep" as PurposeLens, primaryQuery: "新宿 カフェ" };
    const a = buildSecondaryQueries(input);
    const b = buildSecondaryQueries(input);
    expect(a).toEqual(b);
  });
  it("★fetch を一切呼ばない（network なし）", () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("network must not be called");
    });
    vi.stubGlobal("fetch", fetchSpy);
    buildSecondaryQueries({ lens: "focus_work", primaryQuery: "渋谷 カフェ" });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("★全 lens を網羅して例外なく結果を返す", () => {
    const lenses: PurposeLens[] = ["meeting_prep", "focus_work", "conversation", "errand", "generic"];
    for (const lens of lenses) {
      expect(() => buildSecondaryQueries({ lens, primaryQuery: "新宿 カフェ" })).not.toThrow();
    }
  });
  it("★purposeQueryKeywords: generic は []・meeting_prep は非空", () => {
    expect(purposeQueryKeywords("generic")).toEqual([]);
    expect(purposeQueryKeywords("meeting_prep").length).toBeGreaterThan(0);
  });
});
