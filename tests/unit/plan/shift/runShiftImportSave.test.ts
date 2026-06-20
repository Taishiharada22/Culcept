import { describe, it, expect } from "vitest";
import {
  runShiftImportSave,
  monthImportRange,
  isValidYearMonth,
  SHIFT_IMPORT_ACTION_MESSAGES,
  type RunShiftImportSaveDeps,
  type ShiftImportSaveActionInput,
} from "@/lib/plan/shift/runShiftImportSave";
import { HARADA_SPRIX_DICTIONARY } from "@/lib/plan/shift/shiftCodeDictionary";
import type {
  ShiftImportRepository,
  ShiftImportBundleInput,
  ShiftImportSaveResult,
} from "@/lib/plan/shift/shiftImportRepository";
import {
  STAGING_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
} from "@/lib/plan/shift/devFixtureHost";

const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const PRODUCTION_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;

const OK_RESULT: ShiftImportSaveResult = {
  ok: true,
  source: { id: "src-1", userId: "user-1", sourceType: "shift_image", capturedAt: "t" },
  anchors: [],
  dayIndicators: [],
  summary: {
    sourceId: "src-1",
    insertedAnchors: 1,
    deletedAnchors: 0,
    insertedIndicators: 1,
    deletedIndicators: 0,
    conflicts: [],
  },
};

/** 渡された bundle を記録しつつ、設定した result を返す fake repo。 */
function makeRepo(result: ShiftImportSaveResult): {
  repo: ShiftImportRepository;
  calls: { userId: string; input: ShiftImportBundleInput }[];
} {
  const calls: { userId: string; input: ShiftImportBundleInput }[] = [];
  const repo: ShiftImportRepository = {
    async saveShiftImportBundle(userId, input) {
      calls.push({ userId, input });
      return result;
    },
  };
  return { repo, calls };
}

function deps(over: Partial<RunShiftImportSaveDeps> = {}): RunShiftImportSaveDeps {
  return {
    getUserId: async () => "user-1",
    isEnabled: () => true,
    // S-save-0: 既定は staging 接続（guard 通過）。guard NG ケースは connection を上書きして検証。
    connection: {
      supabaseUrl: STAGING_URL,
      stagingRef: STAGING_PROJECT_REF,
      productionRef: PRODUCTION_PROJECT_REF,
    },
    repo: makeRepo(OK_RESULT).repo,
    dictionary: HARADA_SPRIX_DICTIONARY,
    ...over,
  };
}

const VALID_INPUT: ShiftImportSaveActionInput = {
  year: 2025,
  month: 7,
  cells: [
    { date: "2025-07-06", rawCode: "N" }, // 夜勤 → anchor
    { date: "2025-07-03", rawCode: "H" }, // 公休 → day_indicator(off)
  ],
};

describe("monthImportRange / isValidYearMonth", () => {
  it("半開区間 [start, endExclusive) を返す（7月 → [07-01, 08-01)）", () => {
    expect(monthImportRange(2025, 7)).toEqual({
      start: "2025-07-01",
      endExclusive: "2025-08-01",
    });
  });
  it("12月は翌年1月へ繰り上げ", () => {
    expect(monthImportRange(2025, 12)).toEqual({
      start: "2025-12-01",
      endExclusive: "2026-01-01",
    });
  });
  it("year/month 妥当性（1–12 / 整数 / 1970+）", () => {
    expect(isValidYearMonth(2025, 7)).toBe(true);
    expect(isValidYearMonth(2025, 0)).toBe(false);
    expect(isValidYearMonth(2025, 13)).toBe(false);
    expect(isValidYearMonth(2025, 7.5)).toBe(false);
    expect(isValidYearMonth(1969, 7)).toBe(false);
  });
});

describe("runShiftImportSave", () => {
  it("success: ok + summary。projection は server 側 / importRange は server 算出で repo へ", async () => {
    const { repo, calls } = makeRepo(OK_RESULT);
    const r = await runShiftImportSave(VALID_INPUT, deps({ repo }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary.insertedAnchors).toBe(1);
    // repo に渡った bundle: projection が server 側で実行され、importRange が算出されている
    expect(calls).toHaveLength(1);
    expect(calls[0].userId).toBe("user-1");
    expect(calls[0].input.importRange).toEqual({
      start: "2025-07-01",
      endExclusive: "2025-08-01",
    });
    expect(calls[0].input.anchors).toHaveLength(1); // N → anchor
    expect(calls[0].input.dayIndicators).toHaveLength(1); // H → indicator
  });

  it("manual_indicator_conflict → kind:conflict + dates（無保存）", async () => {
    const { repo } = makeRepo({
      ok: false,
      errors: [{ kind: "manual_indicator_conflict", dates: ["2025-07-15"] }],
    });
    const r = await runShiftImportSave(VALID_INPUT, deps({ repo }));
    expect(r.ok).toBe(false);
    if (r.ok || r.kind !== "conflict") return;
    expect(r.dates).toEqual(["2025-07-15"]);
    expect(r.message).toBe(SHIFT_IMPORT_ACTION_MESSAGES.conflict);
  });

  it("duplicate_import_date → kind:duplicate + dates", async () => {
    const { repo } = makeRepo({
      ok: false,
      errors: [{ kind: "duplicate_import_date", dates: ["2025-07-22"] }],
    });
    const r = await runShiftImportSave(VALID_INPUT, deps({ repo }));
    expect(r.ok).toBe(false);
    if (r.ok || r.kind !== "duplicate") return;
    expect(r.dates).toEqual(["2025-07-22"]);
  });

  it("persistence_failed → kind:error。raw message を UI result に絶対載せない", async () => {
    const RAW = "violates check constraint secret-stack-trace";
    const { repo } = makeRepo({
      ok: false,
      errors: [{ kind: "persistence_failed", message: RAW }],
    });
    const r = await runShiftImportSave(VALID_INPUT, deps({ repo }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("error");
    expect(r.message).toBe(SHIFT_IMPORT_ACTION_MESSAGES.error);
    // ★ raw が result のどこにも漏れない
    expect(JSON.stringify(r)).not.toContain("secret-stack-trace");
    expect(JSON.stringify(r)).not.toContain("check constraint");
  });

  it("forbidden / owner guard(42501): repo 層で persistence_failed 化 → safe error（raw 非漏洩）", async () => {
    // 実運用では RPC owner guard(42501) は wrapper で persistence_failed(safe message) になる（staging smoke 実証済）。
    const { repo } = makeRepo({
      ok: false,
      errors: [{ kind: "persistence_failed", message: "unauthorized 42501 raw" }],
    });
    const r = await runShiftImportSave(VALID_INPUT, deps({ repo }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("error");
    expect(r.message).toBe(SHIFT_IMPORT_ACTION_MESSAGES.error);
    expect(JSON.stringify(r)).not.toContain("unauthorized");
  });

  it("anchor/indicator invalid → kind:invalid（内部 validation 詳細を UI に出さない）", async () => {
    const { repo } = makeRepo({
      ok: false,
      errors: [
        {
          kind: "indicator_invalid",
          index: 0,
          errors: [{ field: "label", code: "required", message: "internal detail" }],
        },
      ],
    });
    const r = await runShiftImportSave(VALID_INPUT, deps({ repo }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("invalid");
    expect(JSON.stringify(r)).not.toContain("internal detail");
  });

  it("unauthenticated: getUserId が null → repo を呼ばない", async () => {
    const { repo, calls } = makeRepo(OK_RESULT);
    const r = await runShiftImportSave(
      VALID_INPUT,
      deps({ repo, getUserId: async () => null })
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("unauthenticated");
    expect(calls).toHaveLength(0); // ★ repo 未呼出
  });

  it("disabled: flag OFF → getUserId も repo も呼ばない（dormant）", async () => {
    const { repo, calls } = makeRepo(OK_RESULT);
    let getUserIdCalled = false;
    const r = await runShiftImportSave(
      VALID_INPUT,
      deps({
        repo,
        isEnabled: () => false,
        getUserId: async () => {
          getUserIdCalled = true;
          return "user-1";
        },
      })
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("disabled");
    expect(getUserIdCalled).toBe(false); // ★ auth も呼ばない
    expect(calls).toHaveLength(0); // ★ repo 未呼出
  });

  it("unresolved: 未知コードがあれば repo を呼ばず差し戻し（projection は server 側）", async () => {
    const { repo, calls } = makeRepo(OK_RESULT);
    const r = await runShiftImportSave(
      {
        year: 2025,
        month: 7,
        cells: [
          { date: "2025-07-06", rawCode: "N" },
          { date: "2025-07-09", rawCode: "???" }, // unknown → unresolved
        ],
      },
      deps({ repo })
    );
    expect(r.ok).toBe(false);
    if (r.ok || r.kind !== "unresolved") return;
    expect(r.skipped.length).toBeGreaterThanOrEqual(1);
    expect(calls).toHaveLength(0); // ★ repo 未呼出（無保存）
  });

  it("invalid year/month → kind:invalid、repo を呼ばない", async () => {
    const { repo, calls } = makeRepo(OK_RESULT);
    const r = await runShiftImportSave(
      { ...VALID_INPUT, month: 13 },
      deps({ repo })
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("invalid");
    expect(calls).toHaveLength(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// S-save-0: 接続先 guard（staging allowlist + production deny。fail-closed）
describe("runShiftImportSave — S-save-0 接続先 guard", () => {
  it("staging 接続（既定）→ guard 通過し保存成功（repo 呼出）", async () => {
    const { repo, calls } = makeRepo(OK_RESULT);
    const r = await runShiftImportSave(VALID_INPUT, deps({ repo }));
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("flag ON でも 接続先が production → disabled・auth(getUserId)/projection/repo 未到達", async () => {
    let getUserIdCalled = false;
    const { repo, calls } = makeRepo(OK_RESULT);
    const r = await runShiftImportSave(
      VALID_INPUT,
      deps({
        repo,
        isEnabled: () => true,
        getUserId: async () => {
          getUserIdCalled = true;
          return "user-1";
        },
        connection: {
          supabaseUrl: PRODUCTION_URL,
          stagingRef: STAGING_PROJECT_REF,
          productionRef: PRODUCTION_PROJECT_REF,
        },
      })
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("disabled");
    expect(r.message).toBe(SHIFT_IMPORT_ACTION_MESSAGES.disabled);
    expect(getUserIdCalled).toBe(false); // ★ guard NG で auth/projection 未到達
    expect(calls).toHaveLength(0); // ★ repo（RPC）未呼出
  });

  it("staging ref を含まない URL → disabled・repo 未呼出", async () => {
    const { repo, calls } = makeRepo(OK_RESULT);
    const r = await runShiftImportSave(
      VALID_INPUT,
      deps({
        repo,
        connection: {
          supabaseUrl: "https://other.supabase.co",
          stagingRef: STAGING_PROJECT_REF,
          productionRef: PRODUCTION_PROJECT_REF,
        },
      })
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("disabled");
    expect(calls).toHaveLength(0);
  });

  it("URL 未設定 → disabled・repo 未呼出（fail-closed）", async () => {
    const { repo, calls } = makeRepo(OK_RESULT);
    const r = await runShiftImportSave(
      VALID_INPUT,
      deps({
        repo,
        connection: {
          supabaseUrl: undefined,
          stagingRef: STAGING_PROJECT_REF,
          productionRef: PRODUCTION_PROJECT_REF,
        },
      })
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("disabled");
    expect(calls).toHaveLength(0);
  });

  it("flag OFF が guard より先（flag OFF なら接続先によらず disabled・repo 未呼出）", async () => {
    const { repo, calls } = makeRepo(OK_RESULT);
    const r = await runShiftImportSave(
      VALID_INPUT,
      deps({ repo, isEnabled: () => false })
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("disabled");
    expect(calls).toHaveLength(0);
  });

  it("safe error に raw URL / ref を出さない", async () => {
    const r = await runShiftImportSave(
      VALID_INPUT,
      deps({
        connection: {
          supabaseUrl: PRODUCTION_URL,
          stagingRef: STAGING_PROJECT_REF,
          productionRef: PRODUCTION_PROJECT_REF,
        },
      })
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).not.toContain(PRODUCTION_PROJECT_REF);
    expect(r.message).not.toContain("supabase");
    expect(r.message).not.toContain("https://");
  });
});
