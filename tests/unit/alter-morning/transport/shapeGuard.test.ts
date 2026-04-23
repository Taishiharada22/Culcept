/**
 * validateTransportV2Shape — W3-PR-10 O5 shape guard 契約テスト
 *
 * カバレッジ（CEO 2026-04-23 承認範囲）:
 *   P-A: happy path — O2 / O3 / O4 の実 emit payload で violations=[]
 *   P-B: common required field 欠損で required_field_missing
 *   P-C: schema_version が "2026-04-24" でなければ schema_version_mismatch
 *   P-D: caller が enum 外なら caller_unexpected
 *   P-E: flag_source enum（O2/O3 では null 不可、O4 では null 許容）
 *   P-F: O2 sanity_violations 非空なら sanity_violations_non_empty
 *   P-G: O2 bin_distribution の 8 key いずれかが欠けたら bin_distribution_key_missing
 *   P-H: O3 fake_zero_travel_count > 0 なら fake_zero_travel_non_zero
 *   P-I: O4 required field 欠損で required_field_missing（session_id は key 存在のみ）
 *   P-J: pure / 決定論性 — 同一入力で同一 violations
 *   P-K: throw しない — 破損入力（non-object / 配列 / null）でも violations[] を返す
 *
 * 明示除外（CEO 除外項目 — 違反として出ない確認）:
 *   N-A: O4 travel_items_before/after/delta の値期待はしない（全0 でも fake_zero ではない）
 *   N-B: place_change の session_id: null は違反ではない
 *   N-C: O3 travel_rendered_count=0 は違反ではない（segment_count=0 と整合）
 */

import { describe, test, expect } from "vitest";

import {
  validateTransportV2Shape,
  __SHAPE_GUARD_FIXTURES,
  type ShapeViolation,
  type TransportV2Event,
} from "@/lib/alter-morning/transport/shapeGuard";
import type { TransportBinKey } from "@/lib/alter-morning/transport/telemetry";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures — 実 emit 側の shape と同期
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function goodO2Metadata(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: "2026-04-24",
    flag_source: "allowlist",
    session_id: "ms_xxx",
    plan_date: "2026-04-23",
    caller: "legacy_adapter",
    mode: "unknown",
    event_count: 3,
    eligible_pair_count: 0,
    segment_count: 0,
    duration_non_null_count: 0,
    duration_null_count: 0,
    sanity_violations: [],
    bin_distribution: {
      le_0_2km_null: 0,
      le_1km: 0,
      le_3km: 0,
      le_7km: 0,
      le_15km: 0,
      le_30km: 0,
      gt_30km: 0,
      invalid_null: 0,
    },
    ...overrides,
  };
}

function goodO3Metadata(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: "2026-04-24",
    flag_source: "allowlist",
    session_id: "ms_xxx",
    plan_date: "2026-04-23",
    caller: "legacy_adapter",
    segment_count: 0,
    travel_rendered_count: 0,
    skipped_null_count: 0,
    fake_zero_travel_count: 0,
    ...overrides,
  };
}

function goodO4Metadata(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: "2026-04-24",
    flag_source: "allowlist",
    session_id: "c253a630-2d10-4455-b68f-d6e1409fa852",
    plan_date: "2026-04-23",
    caller: "client_regenerate",
    canonical_present: true,
    transport_segments_count: 0,
    travel_items_before: 0,
    travel_items_after: 0,
    travel_items_delta: 0,
    edit_trigger: "place_change",
    ...overrides,
  };
}

function codesOf(violations: ShapeViolation[]): string[] {
  return violations.map((v) => v.code);
}

function fieldsOf(violations: ShapeViolation[]): string[] {
  return violations.map((v) => v.field ?? "").filter(Boolean);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P-A: Happy path
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateTransportV2Shape / P-A happy path", () => {
  test("O2 0-shape: violations=[]", () => {
    expect(
      validateTransportV2Shape("transport_v2_segments_built", goodO2Metadata()),
    ).toEqual([]);
  });

  test("O2 happy with selection_route caller", () => {
    expect(
      validateTransportV2Shape(
        "transport_v2_segments_built",
        goodO2Metadata({ caller: "selection_route" }),
      ),
    ).toEqual([]);
  });

  test("O3 0-shape: violations=[]", () => {
    expect(
      validateTransportV2Shape(
        "transport_v2_display_rendered",
        goodO3Metadata(),
      ),
    ).toEqual([]);
  });

  test("O4 canonical_present=true happy path", () => {
    expect(
      validateTransportV2Shape(
        "transport_v2_edit_regression",
        goodO4Metadata(),
      ),
    ).toEqual([]);
  });

  test("O4 canonical_present=false (legacy fallback) allows flag_source=null", () => {
    expect(
      validateTransportV2Shape(
        "transport_v2_edit_regression",
        goodO4Metadata({
          canonical_present: false,
          flag_source: null,
        }),
      ),
    ).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P-B: common required field missing
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateTransportV2Shape / P-B common required field missing", () => {
  const cases: Array<[TransportV2Event, string]> = [
    ["transport_v2_segments_built", "schema_version"],
    ["transport_v2_segments_built", "flag_source"],
    ["transport_v2_segments_built", "plan_date"],
    ["transport_v2_segments_built", "caller"],
    ["transport_v2_display_rendered", "schema_version"],
    ["transport_v2_display_rendered", "plan_date"],
    ["transport_v2_edit_regression", "schema_version"],
    ["transport_v2_edit_regression", "caller"],
  ];
  for (const [evt, field] of cases) {
    test(`${evt}: ${field} 削除 → required_field_missing`, () => {
      const base =
        evt === "transport_v2_segments_built"
          ? goodO2Metadata()
          : evt === "transport_v2_display_rendered"
            ? goodO3Metadata()
            : goodO4Metadata();
      const broken = { ...base };
      delete broken[field];
      const violations = validateTransportV2Shape(evt, broken);
      expect(codesOf(violations)).toContain("required_field_missing");
      expect(fieldsOf(violations)).toContain(field);
    });
  }

  test("metadata=undefined → required_field_missing (metadata 自体)", () => {
    const violations = validateTransportV2Shape(
      "transport_v2_segments_built",
      undefined,
    );
    expect(codesOf(violations)).toContain("required_field_missing");
    expect(fieldsOf(violations)).toContain("metadata");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P-C: schema_version_mismatch
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateTransportV2Shape / P-C schema_version_mismatch", () => {
  test("O2: 旧 schema_version 値 → schema_version_mismatch", () => {
    const violations = validateTransportV2Shape(
      "transport_v2_segments_built",
      goodO2Metadata({ schema_version: "2026-04-20" }),
    );
    expect(codesOf(violations)).toContain("schema_version_mismatch");
  });

  test("O4: schema_version=999 (数値) → schema_version_mismatch", () => {
    const violations = validateTransportV2Shape(
      "transport_v2_edit_regression",
      goodO4Metadata({ schema_version: 999 }),
    );
    expect(codesOf(violations)).toContain("schema_version_mismatch");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P-D: caller_unexpected
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateTransportV2Shape / P-D caller_unexpected", () => {
  test("caller='server_regenerate' → caller_unexpected", () => {
    const violations = validateTransportV2Shape(
      "transport_v2_segments_built",
      goodO2Metadata({ caller: "server_regenerate" }),
    );
    expect(codesOf(violations)).toContain("caller_unexpected");
  });

  test("caller=null → caller_unexpected", () => {
    const violations = validateTransportV2Shape(
      "transport_v2_display_rendered",
      goodO3Metadata({ caller: null }),
    );
    expect(codesOf(violations)).toContain("caller_unexpected");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P-E: flag_source enum
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateTransportV2Shape / P-E flag_source enum", () => {
  test("O2: flag_source=null → flag_source_unexpected", () => {
    const violations = validateTransportV2Shape(
      "transport_v2_segments_built",
      goodO2Metadata({ flag_source: null }),
    );
    expect(codesOf(violations)).toContain("flag_source_unexpected");
  });

  test("O3: flag_source='unknown' → flag_source_unexpected", () => {
    const violations = validateTransportV2Shape(
      "transport_v2_display_rendered",
      goodO3Metadata({ flag_source: "unknown" }),
    );
    expect(codesOf(violations)).toContain("flag_source_unexpected");
  });

  test("O4: flag_source='experimental' → flag_source_unexpected", () => {
    const violations = validateTransportV2Shape(
      "transport_v2_edit_regression",
      goodO4Metadata({ flag_source: "experimental" }),
    );
    expect(codesOf(violations)).toContain("flag_source_unexpected");
  });

  test("O2: flag_source='global' は許容（non-null enum 内）", () => {
    expect(
      validateTransportV2Shape(
        "transport_v2_segments_built",
        goodO2Metadata({ flag_source: "global" }),
      ),
    ).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P-F: sanity_violations_non_empty (O2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateTransportV2Shape / P-F sanity_violations", () => {
  test("sanity_violations=['S4'] → sanity_violations_non_empty", () => {
    const violations = validateTransportV2Shape(
      "transport_v2_segments_built",
      goodO2Metadata({ sanity_violations: ["S4"] }),
    );
    expect(codesOf(violations)).toContain("sanity_violations_non_empty");
  });

  test("sanity_violations=['S1','S3'] → sanity_violations_non_empty 1 件（配列 1 違反）", () => {
    const violations = validateTransportV2Shape(
      "transport_v2_segments_built",
      goodO2Metadata({ sanity_violations: ["S1", "S3"] }),
    );
    const nonEmpty = violations.filter((v) => v.code === "sanity_violations_non_empty");
    expect(nonEmpty).toHaveLength(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P-G: bin_distribution_key_missing
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateTransportV2Shape / P-G bin_distribution 8-key invariant", () => {
  const ALL_KEYS: TransportBinKey[] = [
    "le_0_2km_null",
    "le_1km",
    "le_3km",
    "le_7km",
    "le_15km",
    "le_30km",
    "gt_30km",
    "invalid_null",
  ];

  for (const missingKey of ALL_KEYS) {
    test(`bin_distribution から ${missingKey} を落とす → bin_distribution_key_missing`, () => {
      const bd: Record<string, number> = {};
      for (const k of ALL_KEYS) {
        if (k !== missingKey) bd[k] = 0;
      }
      const violations = validateTransportV2Shape(
        "transport_v2_segments_built",
        goodO2Metadata({ bin_distribution: bd }),
      );
      expect(codesOf(violations)).toContain("bin_distribution_key_missing");
      expect(fieldsOf(violations)).toContain(`bin_distribution.${missingKey}`);
    });
  }

  test("bin_distribution が object でない → required_field_missing (bin_distribution)", () => {
    const violations = validateTransportV2Shape(
      "transport_v2_segments_built",
      goodO2Metadata({ bin_distribution: "not-an-object" }),
    );
    expect(codesOf(violations)).toContain("required_field_missing");
    expect(fieldsOf(violations)).toContain("bin_distribution");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P-H: fake_zero_travel_non_zero (O3)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateTransportV2Shape / P-H fake_zero_travel_non_zero", () => {
  test("fake_zero_travel_count=1 → fake_zero_travel_non_zero", () => {
    const violations = validateTransportV2Shape(
      "transport_v2_display_rendered",
      goodO3Metadata({ fake_zero_travel_count: 1 }),
    );
    expect(codesOf(violations)).toContain("fake_zero_travel_non_zero");
  });

  test("fake_zero_travel_count=0 は許容", () => {
    const violations = validateTransportV2Shape(
      "transport_v2_display_rendered",
      goodO3Metadata({ fake_zero_travel_count: 0 }),
    );
    expect(violations).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P-I: O4 required field (session_id は key 存在のみ)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateTransportV2Shape / P-I O4 required field", () => {
  test("session_id=null は許容（key 存在のみ要求）", () => {
    expect(
      validateTransportV2Shape(
        "transport_v2_edit_regression",
        goodO4Metadata({ session_id: null }),
      ),
    ).toEqual([]);
  });

  test("session_id key 自体なし → required_field_missing", () => {
    const broken = goodO4Metadata();
    delete broken.session_id;
    const violations = validateTransportV2Shape(
      "transport_v2_edit_regression",
      broken,
    );
    expect(codesOf(violations)).toContain("required_field_missing");
    expect(fieldsOf(violations)).toContain("session_id");
  });

  test("edit_trigger=undefined → required_field_missing", () => {
    const broken = goodO4Metadata();
    delete broken.edit_trigger;
    const violations = validateTransportV2Shape(
      "transport_v2_edit_regression",
      broken,
    );
    expect(codesOf(violations)).toContain("required_field_missing");
    expect(fieldsOf(violations)).toContain("edit_trigger");
  });

  test("travel_items_delta=undefined → required_field_missing", () => {
    const broken = goodO4Metadata();
    delete broken.travel_items_delta;
    const violations = validateTransportV2Shape(
      "transport_v2_edit_regression",
      broken,
    );
    expect(codesOf(violations)).toContain("required_field_missing");
    expect(fieldsOf(violations)).toContain("travel_items_delta");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P-J: pure / 決定論性
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateTransportV2Shape / P-J pure & deterministic", () => {
  test("同一入力で同一 violations", () => {
    const md = goodO2Metadata({ schema_version: "bad", caller: "invalid" });
    const a = validateTransportV2Shape("transport_v2_segments_built", md);
    const b = validateTransportV2Shape("transport_v2_segments_built", md);
    expect(a).toEqual(b);
  });

  test("入力を変更しない", () => {
    const md = goodO2Metadata();
    const frozen = JSON.parse(JSON.stringify(md));
    validateTransportV2Shape("transport_v2_segments_built", md);
    expect(md).toEqual(frozen);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P-K: throw しない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateTransportV2Shape / P-K never throws", () => {
  const garbage: unknown[] = [null, undefined, 42, "string", [], [1, 2, 3]];
  for (const g of garbage) {
    test(`metadata=${JSON.stringify(g)} → throw せず violations[] を返す`, () => {
      expect(() =>
        validateTransportV2Shape("transport_v2_segments_built", g),
      ).not.toThrow();
      const violations = validateTransportV2Shape(
        "transport_v2_segments_built",
        g,
      );
      expect(Array.isArray(violations)).toBe(true);
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// N-A〜N-C: 明示除外の non-violation 確認
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateTransportV2Shape / N-* explicitly excluded from alerts", () => {
  test("N-A: travel_items_before/after/delta が全 0 でも violations=[]", () => {
    // canonical edit での drop は仕様なので alert しない
    const violations = validateTransportV2Shape(
      "transport_v2_edit_regression",
      goodO4Metadata({
        travel_items_before: 0,
        travel_items_after: 0,
        travel_items_delta: 0,
      }),
    );
    expect(violations).toEqual([]);
  });

  test("N-B: place_change で session_id=null でも violations=[]", () => {
    const violations = validateTransportV2Shape(
      "transport_v2_edit_regression",
      goodO4Metadata({
        edit_trigger: "place_change",
        session_id: null,
      }),
    );
    expect(violations).toEqual([]);
  });

  test("N-C: O3 travel_rendered_count=0 / segment_count=0 は violations=[]", () => {
    const violations = validateTransportV2Shape(
      "transport_v2_display_rendered",
      goodO3Metadata({ travel_rendered_count: 0, segment_count: 0 }),
    );
    expect(violations).toEqual([]);
  });

  test("N-D: travel_items_delta!=after-before でも違反にしない（値期待は対象外）", () => {
    const violations = validateTransportV2Shape(
      "transport_v2_edit_regression",
      goodO4Metadata({
        travel_items_before: 0,
        travel_items_after: 0,
        travel_items_delta: 99,
      }),
    );
    expect(violations).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// fixtures の同期 — emit site の hard-code と一致していることを保証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("__SHAPE_GUARD_FIXTURES sync", () => {
  test("EXPECTED_SCHEMA_VERSION は emit site と同値", () => {
    // trackClient.ts と legacyAdapter.ts / selection/route.ts は全部 "2026-04-24" で固定
    expect(__SHAPE_GUARD_FIXTURES.EXPECTED_SCHEMA_VERSION).toBe("2026-04-24");
  });

  test("ALLOWED_CALLERS は emit 元の 3 値", () => {
    expect([...__SHAPE_GUARD_FIXTURES.ALLOWED_CALLERS].sort()).toEqual([
      "client_regenerate",
      "legacy_adapter",
      "selection_route",
    ]);
  });

  test("ALLOWED_FLAG_SOURCES_NON_NULL は allowlist と global の 2 値", () => {
    expect([...__SHAPE_GUARD_FIXTURES.ALLOWED_FLAG_SOURCES_NON_NULL].sort()).toEqual([
      "allowlist",
      "global",
    ]);
  });

  test("BIN_KEYS は telemetry.ts の 8 key と一致", () => {
    expect([...__SHAPE_GUARD_FIXTURES.BIN_KEYS].sort()).toEqual(
      (
        [
          "gt_30km",
          "invalid_null",
          "le_0_2km_null",
          "le_15km",
          "le_1km",
          "le_30km",
          "le_3km",
          "le_7km",
        ] as TransportBinKey[]
      ).sort(),
    );
  });
});
