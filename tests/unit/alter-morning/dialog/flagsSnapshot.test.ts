/**
 * Flag Snapshot tests — W3 Commit 16-T (runtime path 証明)
 *
 * 検証範囲:
 *   1. evaluateAlterMorningFlags が env / override / default_off の各経路で
 *      正しい source を返すこと。
 *   2. 既存 getter (ALTER_MORNING_FLAGS.dialogStateV2 / placesSearch) と
 *      snapshot の `enabled` / `rawEnabled` が完全に一致すること
 *      （single source of truth: 評価ロジックの divergence 検出）。
 *   3. placesSearch の AND gate（rawEnabled ∧ dialogStateV2.enabled）が
 *      effectiveEnabled / gatedByDialogStateV2 に正しく反映されること。
 *   4. allowlistChecked が常に false（本ブランチ未実装）。
 *   5. evaluatedAt は注入された nowIso をそのまま埋めること（Date.now 非依存）。
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
  ALTER_MORNING_FLAGS,
  __setDialogStateV2Override,
  __setPlacesSearchOverride,
  evaluateAlterMorningFlags,
} from "@/lib/alter-morning/dialog/flags";

const NOW = "2026-04-30T00:00:00.000Z";

beforeEach(() => {
  __setDialogStateV2Override(null);
  __setPlacesSearchOverride(null);
  delete process.env.ALTER_MORNING_DIALOG_STATE_V2;
  delete process.env.ALTER_MORNING_PLACES_SEARCH;
});

afterEach(() => {
  __setDialogStateV2Override(null);
  __setPlacesSearchOverride(null);
  delete process.env.ALTER_MORNING_DIALOG_STATE_V2;
  delete process.env.ALTER_MORNING_PLACES_SEARCH;
});

describe("evaluateAlterMorningFlags — source 判定", () => {
  test("env/override どちらも未設定 → source=default_off, enabled=false", () => {
    const snap = evaluateAlterMorningFlags({ nowIso: NOW });
    expect(snap.dialogStateV2.enabled).toBe(false);
    expect(snap.dialogStateV2.source).toBe("default_off");
    expect(snap.placesSearch.rawEnabled).toBe(false);
    expect(snap.placesSearch.source).toBe("default_off");
  });

  test("env=true → source=env, enabled=true", () => {
    process.env.ALTER_MORNING_DIALOG_STATE_V2 = "true";
    process.env.ALTER_MORNING_PLACES_SEARCH = "true";
    const snap = evaluateAlterMorningFlags({ nowIso: NOW });
    expect(snap.dialogStateV2.enabled).toBe(true);
    expect(snap.dialogStateV2.source).toBe("env");
    expect(snap.placesSearch.rawEnabled).toBe(true);
    expect(snap.placesSearch.source).toBe("env");
  });

  test("env=false → source=env, enabled=false", () => {
    process.env.ALTER_MORNING_DIALOG_STATE_V2 = "false";
    process.env.ALTER_MORNING_PLACES_SEARCH = "false";
    const snap = evaluateAlterMorningFlags({ nowIso: NOW });
    expect(snap.dialogStateV2.enabled).toBe(false);
    expect(snap.dialogStateV2.source).toBe("env");
    expect(snap.placesSearch.rawEnabled).toBe(false);
    expect(snap.placesSearch.source).toBe("env");
  });

  test("env=空文字 → source=env, enabled=true（既存 envBool 仕様）", () => {
    process.env.ALTER_MORNING_DIALOG_STATE_V2 = "";
    const snap = evaluateAlterMorningFlags({ nowIso: NOW });
    expect(snap.dialogStateV2.enabled).toBe(true);
    expect(snap.dialogStateV2.source).toBe("env");
  });

  test("env=未認識値 → source=default_off（既存 envBool fallback）", () => {
    process.env.ALTER_MORNING_DIALOG_STATE_V2 = "maybe";
    const snap = evaluateAlterMorningFlags({ nowIso: NOW });
    expect(snap.dialogStateV2.enabled).toBe(false);
    expect(snap.dialogStateV2.source).toBe("default_off");
  });

  test("override=true → source=override, enabled=true（env より優先）", () => {
    process.env.ALTER_MORNING_DIALOG_STATE_V2 = "false";
    __setDialogStateV2Override(true);
    const snap = evaluateAlterMorningFlags({ nowIso: NOW });
    expect(snap.dialogStateV2.enabled).toBe(true);
    expect(snap.dialogStateV2.source).toBe("override");
  });

  test("override=false → source=override, enabled=false（env より優先）", () => {
    process.env.ALTER_MORNING_DIALOG_STATE_V2 = "true";
    __setDialogStateV2Override(false);
    const snap = evaluateAlterMorningFlags({ nowIso: NOW });
    expect(snap.dialogStateV2.enabled).toBe(false);
    expect(snap.dialogStateV2.source).toBe("override");
  });
});

describe("evaluateAlterMorningFlags — 既存 getter と評価ロジック一致 (single source of truth)", () => {
  // 評価ロジックが getter / snapshot で divergence しないことを構造的に検証。
  // route が「getter を読んだ瞬間と snapshot を取った瞬間で違う値」になることを防ぐ。

  const cases: Array<{
    name: string;
    env: string | undefined;
    override: boolean | null;
    expected: boolean;
  }> = [
    { name: "all_unset", env: undefined, override: null, expected: false },
    { name: "env_true", env: "true", override: null, expected: true },
    { name: "env_false", env: "false", override: null, expected: false },
    { name: "env_empty", env: "", override: null, expected: true },
    { name: "env_unrecognized", env: "maybe", override: null, expected: false },
    { name: "override_true_overrules_env_false", env: "false", override: true, expected: true },
    { name: "override_false_overrules_env_true", env: "true", override: false, expected: false },
  ];

  for (const c of cases) {
    test(`dialogStateV2 / ${c.name}: getter と snapshot.enabled が一致`, () => {
      if (c.env !== undefined) process.env.ALTER_MORNING_DIALOG_STATE_V2 = c.env;
      __setDialogStateV2Override(c.override);

      const getterValue = ALTER_MORNING_FLAGS.dialogStateV2;
      const snap = evaluateAlterMorningFlags({ nowIso: NOW });

      expect(getterValue).toBe(c.expected);
      expect(snap.dialogStateV2.enabled).toBe(c.expected);
      expect(snap.dialogStateV2.enabled).toBe(getterValue);
    });

    test(`placesSearch / ${c.name}: getter と snapshot.rawEnabled が一致`, () => {
      if (c.env !== undefined) process.env.ALTER_MORNING_PLACES_SEARCH = c.env;
      __setPlacesSearchOverride(c.override);

      const getterValue = ALTER_MORNING_FLAGS.placesSearch;
      const snap = evaluateAlterMorningFlags({ nowIso: NOW });

      expect(getterValue).toBe(c.expected);
      expect(snap.placesSearch.rawEnabled).toBe(c.expected);
      expect(snap.placesSearch.rawEnabled).toBe(getterValue);
    });
  }
});

describe("evaluateAlterMorningFlags — placesSearch AND gate", () => {
  test("rawEnabled=false ∧ ds=false → effective=false, gated=false", () => {
    const snap = evaluateAlterMorningFlags({ nowIso: NOW });
    expect(snap.placesSearch.rawEnabled).toBe(false);
    expect(snap.dialogStateV2.enabled).toBe(false);
    expect(snap.placesSearch.effectiveEnabled).toBe(false);
    expect(snap.placesSearch.gatedByDialogStateV2).toBe(false);
  });

  test("rawEnabled=false ∧ ds=true → effective=false, gated=false", () => {
    process.env.ALTER_MORNING_DIALOG_STATE_V2 = "true";
    const snap = evaluateAlterMorningFlags({ nowIso: NOW });
    expect(snap.placesSearch.rawEnabled).toBe(false);
    expect(snap.dialogStateV2.enabled).toBe(true);
    expect(snap.placesSearch.effectiveEnabled).toBe(false);
    expect(snap.placesSearch.gatedByDialogStateV2).toBe(false);
  });

  test("rawEnabled=true ∧ ds=false → effective=false, gated=true（観測 key）", () => {
    process.env.ALTER_MORNING_PLACES_SEARCH = "true";
    process.env.ALTER_MORNING_DIALOG_STATE_V2 = "false";
    const snap = evaluateAlterMorningFlags({ nowIso: NOW });
    expect(snap.placesSearch.rawEnabled).toBe(true);
    expect(snap.dialogStateV2.enabled).toBe(false);
    expect(snap.placesSearch.effectiveEnabled).toBe(false);
    expect(snap.placesSearch.gatedByDialogStateV2).toBe(true);
  });

  test("rawEnabled=true ∧ ds=true → effective=true, gated=false", () => {
    process.env.ALTER_MORNING_PLACES_SEARCH = "true";
    process.env.ALTER_MORNING_DIALOG_STATE_V2 = "true";
    const snap = evaluateAlterMorningFlags({ nowIso: NOW });
    expect(snap.placesSearch.rawEnabled).toBe(true);
    expect(snap.dialogStateV2.enabled).toBe(true);
    expect(snap.placesSearch.effectiveEnabled).toBe(true);
    expect(snap.placesSearch.gatedByDialogStateV2).toBe(false);
  });

  test("override で rawEnabled=true, env で ds=false → gated=true（override 経路でも AND gate が効く）", () => {
    __setPlacesSearchOverride(true);
    process.env.ALTER_MORNING_DIALOG_STATE_V2 = "false";
    const snap = evaluateAlterMorningFlags({ nowIso: NOW });
    expect(snap.placesSearch.rawEnabled).toBe(true);
    expect(snap.placesSearch.source).toBe("override");
    expect(snap.dialogStateV2.enabled).toBe(false);
    expect(snap.placesSearch.effectiveEnabled).toBe(false);
    expect(snap.placesSearch.gatedByDialogStateV2).toBe(true);
  });
});

describe("evaluateAlterMorningFlags — メタ field", () => {
  test("allowlistChecked は常に false（本ブランチ allowlist 未実装）", () => {
    const snap = evaluateAlterMorningFlags({ nowIso: NOW });
    expect(snap.allowlistChecked).toBe(false);
  });

  test("evaluatedAt は注入された nowIso をそのまま埋める（Date.now 非依存）", () => {
    const customIso = "2099-12-31T23:59:59.999Z";
    const snap = evaluateAlterMorningFlags({ nowIso: customIso });
    expect(snap.evaluatedAt).toBe(customIso);
  });

  test("同 input で 2 回呼んでも結果が同一（pure 性）", () => {
    process.env.ALTER_MORNING_DIALOG_STATE_V2 = "true";
    process.env.ALTER_MORNING_PLACES_SEARCH = "true";
    const a = evaluateAlterMorningFlags({ nowIso: NOW });
    const b = evaluateAlterMorningFlags({ nowIso: NOW });
    expect(a).toEqual(b);
  });
});
