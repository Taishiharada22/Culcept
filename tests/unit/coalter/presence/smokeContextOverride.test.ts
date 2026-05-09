/**
 * Stage 2.4-B B-3 Phase 2 残作業 — smoke-only context flag injection harness test
 *
 * 正本:
 *   - decision-log [2026-05-09] (Stage 2.4-B Gap 3/4 構造的 blocker + B-3 設計提示)
 *   - docs/coalter-stage24-b-smoke-procedure.md Appendix D
 *   - CEO/GPT 確定 2026-05-09 Phase 2 条件付き GO
 *   - lib/coalter/presence/smokeContextOverride.ts
 *
 * 役割の明確化 (CEO 厳守、本 test の意味論):
 *
 *   本 test は **Preview env 限定の smoke harness** の動作を検証する。
 *   `selectPattern` / `setPatternContext` 経由で `Partial<PatternContext>` を
 *   URL query から人工注入できることを確認する。
 *
 *   **「Gap 4 解消」の証明ではない**。production-side context flag detector
 *   (executor watcher / heuristic) は **未実装のまま別 phase**。本 hook を使った
 *   結果は production reachability PASS とは呼ばない (CEO/GPT 補正)。
 *
 * test 戦略:
 *   - 関数 invoke のみ (CEO 既往判断、`@testing-library/react` 不要)
 *   - render は不要、pure helpers + env gate を直接 invoke
 *   - production safety を構造的に確認:
 *     * env exact "true" のみ accept (fail-closed)
 *     * whitelist 違反 flag を絶対 accept しない
 *     * prototype pollution / 任意 key 注入を構造的に排除
 *
 * 不変 (CEO 厳守):
 *   - 新規 dep 追加禁止 (`@testing-library/react` 等)
 *   - reducer / signalAdapter / signalClassifier / selectPattern / speech 系 / speech route /
 *     model / max_tokens / timeout / Production env は touch しない
 *   - production-side context flag detector は本 module で実装しない (別 phase)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  isSmokeContextOverrideEnabled,
  parseSmokeContextFlags,
  ALLOWED_SMOKE_FLAGS,
  type AllowedSmokeFlag,
} from "@/lib/coalter/presence/smokeContextOverride";

const ENV_KEY = "NEXT_PUBLIC_COALTER_PRESENCE_SMOKE_CONTEXT";
let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalEnv;
});

// ─────────────────────────────────────────────
// 1. env gate (fail-closed): "true" exact match のみ accept
// ─────────────────────────────────────────────

describe("isSmokeContextOverrideEnabled — env gate (fail-closed)", () => {
  it("env 未設定 → false (production 不変、default fail-closed)", () => {
    delete process.env[ENV_KEY];
    expect(isSmokeContextOverrideEnabled()).toBe(false);
  });

  it("env='true' → true (Preview smoke 用 ON 状態)", () => {
    process.env[ENV_KEY] = "true";
    expect(isSmokeContextOverrideEnabled()).toBe(true);
  });

  it("env='false' → false (明示的 OFF)", () => {
    process.env[ENV_KEY] = "false";
    expect(isSmokeContextOverrideEnabled()).toBe(false);
  });

  it("env=空文字 → false", () => {
    process.env[ENV_KEY] = "";
    expect(isSmokeContextOverrideEnabled()).toBe(false);
  });

  it("env='1' → false (truthy 文字列だが exact match 不成立、fail-closed)", () => {
    process.env[ENV_KEY] = "1";
    expect(isSmokeContextOverrideEnabled()).toBe(false);
  });

  it("env='0' → false", () => {
    process.env[ENV_KEY] = "0";
    expect(isSmokeContextOverrideEnabled()).toBe(false);
  });

  it("env='yes' / 'on' / 'enable' 等の口語 → false (exact 'true' のみ accept)", () => {
    for (const variant of ["yes", "on", "enable", "enabled", "ok"]) {
      process.env[ENV_KEY] = variant;
      expect(isSmokeContextOverrideEnabled()).toBe(false);
    }
  });

  it("env='TRUE' / 'True' / 'tRue' (大文字) → false (case-sensitive)", () => {
    for (const variant of ["TRUE", "True", "tRue", "trUE"]) {
      process.env[ENV_KEY] = variant;
      expect(isSmokeContextOverrideEnabled()).toBe(false);
    }
  });

  it("env='true ' (末尾 space) → false (exact match)", () => {
    process.env[ENV_KEY] = "true ";
    expect(isSmokeContextOverrideEnabled()).toBe(false);
  });

  it("env=' true' (先頭 space) → false (exact match)", () => {
    process.env[ENV_KEY] = " true";
    expect(isSmokeContextOverrideEnabled()).toBe(false);
  });
});

// ─────────────────────────────────────────────
// 2. parseSmokeContextFlags — 基本動作 (whitelist + unknown 無視)
// ─────────────────────────────────────────────

describe("parseSmokeContextFlags — basic", () => {
  it("query 未指定 → 空 object", () => {
    const sp = new URLSearchParams("");
    expect(parseSmokeContextFlags(sp)).toStrictEqual({});
  });

  it("coalter_smoke_flag 不在 → 空 object", () => {
    const sp = new URLSearchParams("other=value&another=val2");
    expect(parseSmokeContextFlags(sp)).toStrictEqual({});
  });

  it("coalter_smoke_flag 空文字 → 空 object", () => {
    const sp = new URLSearchParams("coalter_smoke_flag=");
    expect(parseSmokeContextFlags(sp)).toStrictEqual({});
  });

  it("単一 allowed flag → flag を true に設定", () => {
    const sp = new URLSearchParams("coalter_smoke_flag=needFraming");
    expect(parseSmokeContextFlags(sp)).toStrictEqual({ needFraming: true });
  });

  it("複数 allowed flag (CSV) → 全て true", () => {
    const sp = new URLSearchParams(
      "coalter_smoke_flag=needFraming,uncertaintyHigh",
    );
    expect(parseSmokeContextFlags(sp)).toStrictEqual({
      needFraming: true,
      uncertaintyHigh: true,
    });
  });

  it("trim: 各 entry の前後 whitespace を削除", () => {
    const sp = new URLSearchParams(
      "coalter_smoke_flag=  needFraming  ,  uncertaintyHigh  ",
    );
    expect(parseSmokeContextFlags(sp)).toStrictEqual({
      needFraming: true,
      uncertaintyHigh: true,
    });
  });

  it("空 entry を含む CSV → 空 entry は無視", () => {
    const sp = new URLSearchParams(
      "coalter_smoke_flag=needFraming,,uncertaintyHigh,,,",
    );
    expect(parseSmokeContextFlags(sp)).toStrictEqual({
      needFraming: true,
      uncertaintyHigh: true,
    });
  });

  it("重複 flag は冪等 (1 回設定と同じ)", () => {
    const sp = new URLSearchParams(
      "coalter_smoke_flag=needFraming,needFraming,needFraming",
    );
    expect(parseSmokeContextFlags(sp)).toStrictEqual({ needFraming: true });
  });
});

// ─────────────────────────────────────────────
// 3. parseSmokeContextFlags — fail-closed (whitelist 違反は absolute reject)
// ─────────────────────────────────────────────

describe("parseSmokeContextFlags — fail-closed (whitelist 違反 reject)", () => {
  it("unknown flag は無視", () => {
    const sp = new URLSearchParams("coalter_smoke_flag=unknownFlag");
    expect(parseSmokeContextFlags(sp)).toStrictEqual({});
  });

  it("mixed allowed + unknown → allowed のみ accept", () => {
    const sp = new URLSearchParams(
      "coalter_smoke_flag=needFraming,unknownFlag,uncertaintyHigh,anotherUnknown",
    );
    expect(parseSmokeContextFlags(sp)).toStrictEqual({
      needFraming: true,
      uncertaintyHigh: true,
    });
  });

  it("case-sensitivity: 大文字小文字混在の allowed flag は unknown 扱い", () => {
    // PatternContext field 名は camelCase 厳守
    for (const variant of [
      "NeedFraming", // 先頭大文字
      "needframing", // 全小文字 (camel 違反)
      "NEED_FRAMING", // snake_case
      "Needframing",
    ]) {
      const sp = new URLSearchParams(`coalter_smoke_flag=${variant}`);
      expect(parseSmokeContextFlags(sp)).toStrictEqual({});
    }
  });

  it("prototype pollution 攻撃: __proto__ / constructor / toString 等は absolute reject", () => {
    const sp = new URLSearchParams(
      "coalter_smoke_flag=__proto__,constructor,toString,hasOwnProperty,isPrototypeOf,propertyIsEnumerable,valueOf",
    );
    expect(parseSmokeContextFlags(sp)).toStrictEqual({});
  });

  it("特殊文字を含む flag は reject", () => {
    const sp = new URLSearchParams(
      "coalter_smoke_flag=needFraming;rm -rf,uncertain%20High,need-Framing",
    );
    expect(parseSmokeContextFlags(sp)).toStrictEqual({});
  });

  it("空白だけの entry は無視", () => {
    const sp = new URLSearchParams("coalter_smoke_flag=   ,   ,    ");
    expect(parseSmokeContextFlags(sp)).toStrictEqual({});
  });
});

// ─────────────────────────────────────────────
// 4. parseSmokeContextFlags — 全 allowed flags 確認
// ─────────────────────────────────────────────

describe("parseSmokeContextFlags — 全 7 allowed flag 受け入れ確認", () => {
  it("全 7 allowed flag を一括指定可能", () => {
    const allFlags = ALLOWED_SMOKE_FLAGS.join(",");
    const sp = new URLSearchParams(`coalter_smoke_flag=${allFlags}`);
    const result = parseSmokeContextFlags(sp);

    // 全 7 flag が true に設定されていることを確認
    expect(Object.keys(result).length).toBe(ALLOWED_SMOKE_FLAGS.length);
    for (const flag of ALLOWED_SMOKE_FLAGS) {
      expect(result[flag]).toBe(true);
    }
  });

  it.each(ALLOWED_SMOKE_FLAGS)(
    "allowed flag '%s' を単独で受け入れる",
    (flag: AllowedSmokeFlag) => {
      const sp = new URLSearchParams(`coalter_smoke_flag=${flag}`);
      const result = parseSmokeContextFlags(sp);
      expect(result[flag]).toBe(true);
      expect(Object.keys(result)).toStrictEqual([flag]);
    },
  );

  it("ALLOWED_SMOKE_FLAGS は正確に 7 個 (PatternContext field と一致)", () => {
    // PatternContext の 7 field (本書 §3.1):
    //   infoMissing, uncertaintyHigh, needFraming, oneSidedFatigue,
    //   needTranslation, relationshipSignalsClear, relationshipNoiseHigh
    expect(ALLOWED_SMOKE_FLAGS.length).toBe(7);
    expect(new Set(ALLOWED_SMOKE_FLAGS)).toStrictEqual(
      new Set([
        "infoMissing",
        "uncertaintyHigh",
        "needFraming",
        "oneSidedFatigue",
        "needTranslation",
        "relationshipSignalsClear",
        "relationshipNoiseHigh",
      ]),
    );
  });
});

// ─────────────────────────────────────────────
// 5. CEO 厳守の構造的不変性 (production safety)
// ─────────────────────────────────────────────

describe("Smoke harness 不可侵境界 (CEO/GPT 補正、production safety)", () => {
  it("env exact 'true' のみ accept、他全て false (production 不変原則)", () => {
    // production env で誤って "1" / "yes" / "TRUE" 等が設定されても false 返却
    for (const variant of [
      "",
      " ",
      "0",
      "1",
      "yes",
      "no",
      "on",
      "off",
      "TRUE",
      "True",
      "false",
      "False",
      "enable",
      "disabled",
      "null",
      "undefined",
    ]) {
      process.env[ENV_KEY] = variant;
      expect(isSmokeContextOverrideEnabled()).toBe(false);
    }
    // exact "true" のみ true
    process.env[ENV_KEY] = "true";
    expect(isSmokeContextOverrideEnabled()).toBe(true);
  });

  it("parseSmokeContextFlags は許可 flag 以外を構造的に absolute reject (whitelist + 任意 key 排除)", () => {
    // 任意 key が結果 object に混入しないことを構造的に確認
    const sp = new URLSearchParams(
      "coalter_smoke_flag=__proto__,constructor,prototype,a,b,c,foo,bar,baz",
    );
    const result = parseSmokeContextFlags(sp);
    expect(Object.keys(result)).toStrictEqual([]);
    // hasOwnProperty 経由でも 0 件であることを確認
    expect(Object.getOwnPropertyNames(result)).toStrictEqual([]);
  });

  it("parseSmokeContextFlags の戻り値は plain object、prototype 汚染なし", () => {
    const sp = new URLSearchParams("coalter_smoke_flag=needFraming");
    const result = parseSmokeContextFlags(sp);
    // Object.prototype.toString は標準どおり
    expect(Object.prototype.toString.call(result)).toBe("[object Object]");
    // 結果に意図しない prototype が混入していない
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  });
});

// ─────────────────────────────────────────────
// 6. 役割の明確化 (CEO/GPT 補正準拠、Gap 4 解消ではない)
// ─────────────────────────────────────────────

describe("smoke harness の役割 (CEO/GPT 確定 2026-05-09)", () => {
  it("本 module は smoke-only context flag injection harness であり、Gap 4 production logic 解消ではない", () => {
    // 本 test は意味論的注記。コードコメント (smokeContextOverride.ts header) と
    // decision-log [2026-05-09] entry に明記されている通り、本 module を使った
    // 結果を production reachability PASS とは呼ばない。
    // この test 自体は構造的検証のみ (typeof / 関数存在確認)。
    expect(typeof isSmokeContextOverrideEnabled).toBe("function");
    expect(typeof parseSmokeContextFlags).toBe("function");
    expect(Array.isArray(ALLOWED_SMOKE_FLAGS)).toBe(true);
  });

  it("env 未設定が default = production 不変 (env-gated fail-closed)", () => {
    // 本 hook は env=true でのみ機能。Production env には絶対設定しない (CEO 厳守)。
    delete process.env[ENV_KEY];
    expect(isSmokeContextOverrideEnabled()).toBe(false);
  });
});
