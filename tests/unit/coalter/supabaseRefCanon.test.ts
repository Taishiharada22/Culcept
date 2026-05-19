/**
 * CoAlter — Supabase Project Ref Canon Consistency Tests (Phase D-3-α)
 *
 * 正本: docs/coalter-supabase-ref-canon.md (§1 machine-readable JSON block)
 *
 * 目的:
 *   Supabase project ref の role 表現が、本 canon と以下の参照先で**完全一致**することを
 *   構造的に保証する。drift が発生した PR は本 test で fail する。
 *
 * 検証対象 (drift detection):
 *   1. canon JSON 自身の self-consistency (hardcoded role assertions、defense layer 2)
 *   2. .canary-trigger.json の expected/forbidden が canon と一致
 *   3. .github/PULL_REQUEST_TEMPLATE/canary-smoke.md の expected/forbidden 表記が canon と一致
 *   4. docs/coalter-aoo-canary-deploy-anti-patterns.md §4 の verify_canary_supabase の expected/forbidden が canon と一致
 *   5. tests/unit/coalter/verifyCanaryDeploy.test.ts の fixture (expected/forbidden) が canon と一致
 *   6. tests/unit/coalter/canaryTriggerIgnoreCommand.test.ts の expected/forbidden assertion が canon と一致
 *
 * Safety invariants (本 test が永続的に block する誤編集):
 *   - hjcrvndumgiovyfdacwc が Mirror canary expected 側に入る (= C-4 BLOCKED と同型事故)
 *   - aljavfujeqcwnqryjmhl が Alter staging 扱いされる (= Production 移管の誤情報)
 *   - canon の hardcoded role が緩む (= test が canon を二重 lock している意味の喪失)
 *
 * 不可侵境界:
 *   - runtime app code 0 diff (本 test は file read のみ)
 *   - env touch 0 / Supabase touch 0
 *   - 本 test 自体は新規 ref を追加しない。canon に追加されたら同 PR で本 test 更新必須 (canon §4.2)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// =============================================================================
// Canon loading
// =============================================================================

const REPO_ROOT = join(__dirname, "..", "..", "..");
const CANON_PATH = join(REPO_ROOT, "docs", "coalter-supabase-ref-canon.md");

interface CanonRefMeta {
  readonly role: string;
  readonly display_name: string;
  readonly host: string;
  readonly origin: string;
  readonly mirror_canary_role: string;
  readonly vercel_env_scope_normal: string;
  readonly mirror_canary_data_use_note: string;
}

interface Canon {
  readonly version: number;
  readonly updated_at: string;
  readonly refs: Record<string, CanonRefMeta>;
  readonly mirror_canary: {
    readonly expected_ref: string;
    readonly forbidden_refs: readonly string[];
  };
}

/**
 * Canon doc から §1 の machine-readable JSON block (最初の ```json ... ``` fenced block) を抽出 + parse する。
 * 本関数は test 専用 (pure)。Canon doc の §1 fence が変更された場合は本 regex の修正が必要。
 */
function loadCanon(): Canon {
  const md = readFileSync(CANON_PATH, "utf8");
  const m = md.match(/```json\n([\s\S]*?)\n```/);
  if (!m) {
    throw new Error(
      `[CanonLoader] docs/coalter-supabase-ref-canon.md に machine-readable JSON block が見つかりません。canon §1 を確認してください。`,
    );
  }
  const json = JSON.parse(m[1]) as Canon;
  return json;
}

const canon = loadCanon();

// =============================================================================
// §0. Canon doc 存在 + 構造
// =============================================================================

describe("D-3-α canon doc — 存在 + 構造 + version", () => {
  it("docs/coalter-supabase-ref-canon.md が repo root に存在", () => {
    const content = readFileSync(CANON_PATH, "utf8");
    expect(content.length).toBeGreaterThan(0);
  });

  it("canon JSON: version は 1 (初版)", () => {
    expect(canon.version).toBe(1);
  });

  it("canon JSON: updated_at は string で存在", () => {
    expect(canon.updated_at).toBeTypeOf("string");
    expect(canon.updated_at.length).toBeGreaterThan(0);
  });

  it("canon JSON: refs は object で存在", () => {
    expect(canon.refs).toBeTypeOf("object");
    expect(Object.keys(canon.refs).length).toBeGreaterThanOrEqual(2);
  });

  it("canon JSON: mirror_canary.expected_ref / forbidden_refs が存在", () => {
    expect(canon.mirror_canary.expected_ref).toBeTypeOf("string");
    expect(Array.isArray(canon.mirror_canary.forbidden_refs)).toBe(true);
    expect(canon.mirror_canary.forbidden_refs.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// §1. Defense layer 2 — hardcoded role assertions
//   (canon を編集して role を swap したら、ここで永続的に fail する)
// =============================================================================

describe("D-3-α canon — hardcoded role assertions (defense layer 2)", () => {
  it("aljavfujeqcwnqryjmhl は role=production であること", () => {
    expect(canon.refs["aljavfujeqcwnqryjmhl"]).toBeDefined();
    expect(canon.refs["aljavfujeqcwnqryjmhl"].role).toBe("production");
  });

  it("aljavfujeqcwnqryjmhl の host は aljavfujeqcwnqryjmhl.supabase.co であること", () => {
    expect(canon.refs["aljavfujeqcwnqryjmhl"].host).toBe(
      "aljavfujeqcwnqryjmhl.supabase.co",
    );
  });

  it("aljavfujeqcwnqryjmhl の display_name は 'Aneurasync Production Supabase' であること", () => {
    expect(canon.refs["aljavfujeqcwnqryjmhl"].display_name).toBe(
      "Aneurasync Production Supabase",
    );
  });

  it("aljavfujeqcwnqryjmhl の mirror_canary_role は expected であること", () => {
    expect(canon.refs["aljavfujeqcwnqryjmhl"].mirror_canary_role).toBe(
      "expected",
    );
  });

  it("hjcrvndumgiovyfdacwc は role=alter_staging であること", () => {
    expect(canon.refs["hjcrvndumgiovyfdacwc"]).toBeDefined();
    expect(canon.refs["hjcrvndumgiovyfdacwc"].role).toBe("alter_staging");
  });

  it("hjcrvndumgiovyfdacwc の host は hjcrvndumgiovyfdacwc.supabase.co であること", () => {
    expect(canon.refs["hjcrvndumgiovyfdacwc"].host).toBe(
      "hjcrvndumgiovyfdacwc.supabase.co",
    );
  });

  it("hjcrvndumgiovyfdacwc の display_name は 'Alter staging Supabase' であること", () => {
    expect(canon.refs["hjcrvndumgiovyfdacwc"].display_name).toBe(
      "Alter staging Supabase",
    );
  });

  it("hjcrvndumgiovyfdacwc の mirror_canary_role は forbidden であること", () => {
    expect(canon.refs["hjcrvndumgiovyfdacwc"].mirror_canary_role).toBe(
      "forbidden",
    );
  });

  it("canon.mirror_canary.expected_ref は aljavfujeqcwnqryjmhl であること", () => {
    expect(canon.mirror_canary.expected_ref).toBe("aljavfujeqcwnqryjmhl");
  });

  it("canon.mirror_canary.forbidden_refs は ['hjcrvndumgiovyfdacwc'] を含むこと", () => {
    expect(canon.mirror_canary.forbidden_refs).toContain(
      "hjcrvndumgiovyfdacwc",
    );
  });
});

// =============================================================================
// §2. Safety invariants — 構造的な role mix-up 検出
//   (CEO 補正 2026-05-19: hjcrvndumgiovyfdacwc を expected 側に置く誤編集を block)
// =============================================================================

describe("D-3-α canon — safety invariants (role mix-up detection)", () => {
  it("alter_staging ref が Mirror canary expected 側に入ったら FAIL", () => {
    for (const [ref, meta] of Object.entries(canon.refs)) {
      if (meta.role === "alter_staging") {
        expect(meta.mirror_canary_role).not.toBe("expected");
        expect(canon.mirror_canary.expected_ref).not.toBe(ref);
      }
    }
  });

  it("production ref が alter_staging 扱いされたら FAIL", () => {
    for (const [, meta] of Object.entries(canon.refs)) {
      if (meta.role === "production") {
        expect(meta.role).not.toBe("alter_staging");
      }
    }
  });

  it("expected_ref が role=production を指すこと (Mirror canary は production-equivalent 必須)", () => {
    const expectedRef = canon.mirror_canary.expected_ref;
    const expectedMeta = canon.refs[expectedRef];
    expect(expectedMeta).toBeDefined();
    // role は 'production' (D-0 Option C-prime) または将来の 'mirror_canary_dedicated' (D-0 Option A) のみ許容
    expect(["production", "mirror_canary_dedicated"]).toContain(
      expectedMeta.role,
    );
  });

  it("forbidden_refs が role=alter_staging を含むこと (C-4 BLOCKED 再発防止)", () => {
    const hasAlterStaging = canon.mirror_canary.forbidden_refs.some((r) => {
      const meta = canon.refs[r];
      return meta?.role === "alter_staging";
    });
    expect(hasAlterStaging).toBe(true);
  });

  it("expected_ref と forbidden_refs が重複しないこと", () => {
    expect(canon.mirror_canary.forbidden_refs).not.toContain(
      canon.mirror_canary.expected_ref,
    );
  });

  it("各 ref が 20 文字小文字英数の正規 Supabase ref 形式であること", () => {
    for (const ref of Object.keys(canon.refs)) {
      expect(ref).toMatch(/^[a-z0-9]{20}$/);
    }
  });
});

// =============================================================================
// §3. .canary-trigger.json の expected/forbidden が canon と一致
// =============================================================================

describe("D-3-α .canary-trigger.json — canon との一致", () => {
  const triggerPath = join(REPO_ROOT, ".canary-trigger.json");
  const trigger = JSON.parse(readFileSync(triggerPath, "utf8")) as Record<
    string,
    unknown
  >;

  it(".canary-trigger.json file は repo root に存在", () => {
    expect(trigger).toBeTypeOf("object");
  });

  it("expected_supabase_ref が canon.mirror_canary.expected_ref と一致", () => {
    expect(trigger.expected_supabase_ref).toBe(
      canon.mirror_canary.expected_ref,
    );
  });

  it("forbidden_supabase_ref が canon.mirror_canary.forbidden_refs[0] と一致", () => {
    expect(trigger.forbidden_supabase_ref).toBe(
      canon.mirror_canary.forbidden_refs[0],
    );
  });
});

// =============================================================================
// §4. canary-smoke PR template の expected/forbidden 表記が canon と一致
// =============================================================================

describe("D-3-α canary-smoke PR template — canon との一致", () => {
  const tmplPath = join(
    REPO_ROOT,
    ".github",
    "PULL_REQUEST_TEMPLATE",
    "canary-smoke.md",
  );
  const tmpl = readFileSync(tmplPath, "utf8");

  it("template に canon expected ref が出現する", () => {
    expect(tmpl).toContain(canon.mirror_canary.expected_ref);
  });

  it("template に canon expected ref の display_name が出現する (e.g., 'Aneurasync Production Supabase')", () => {
    const expectedMeta = canon.refs[canon.mirror_canary.expected_ref];
    expect(tmpl).toContain(expectedMeta.display_name);
  });

  it("template に canon forbidden ref が出現する", () => {
    expect(tmpl).toContain(canon.mirror_canary.forbidden_refs[0]);
  });

  it("template の D-1 invoke 例に --expected-supabase=<canon expected> が出現する", () => {
    expect(tmpl).toContain(
      `--expected-supabase=${canon.mirror_canary.expected_ref}`,
    );
  });

  it("template の D-1 invoke 例に --forbidden-supabase=<canon forbidden> が出現する", () => {
    expect(tmpl).toContain(
      `--forbidden-supabase=${canon.mirror_canary.forbidden_refs[0]}`,
    );
  });

  it("template に canon doc へのリンクが含まれる (drift 防止導線)", () => {
    expect(tmpl).toContain("docs/coalter-supabase-ref-canon.md");
  });
});

// =============================================================================
// §5. anti-patterns doc の expected/forbidden 表記が canon と一致
// =============================================================================

describe("D-3-α anti-patterns doc — canon との一致", () => {
  const docPath = join(
    REPO_ROOT,
    "docs",
    "coalter-aoo-canary-deploy-anti-patterns.md",
  );
  const doc = readFileSync(docPath, "utf8");

  it("doc に canon expected ref が出現する", () => {
    expect(doc).toContain(canon.mirror_canary.expected_ref);
  });

  it("doc に canon forbidden ref が出現する", () => {
    expect(doc).toContain(canon.mirror_canary.forbidden_refs[0]);
  });

  it("doc §4 verify_canary_supabase snippet 内に expected ref + 'Production' label が同 line もしくは近接", () => {
    // bash snippet 内: local expected_ref=$2  # e.g., "aljavfujeqcwnqryjmhl" (Production)
    const expected = canon.mirror_canary.expected_ref;
    const re = new RegExp(`${expected}[\\s\\S]{0,80}Production`);
    expect(doc).toMatch(re);
  });

  it("doc §4 verify_canary_supabase snippet 内に forbidden ref + 'Alter staging' label が同 line もしくは近接", () => {
    const forbidden = canon.mirror_canary.forbidden_refs[0];
    const re = new RegExp(`${forbidden}[\\s\\S]{0,120}Alter staging`);
    expect(doc).toMatch(re);
  });

  it("doc に canon doc へのリンクが含まれる (drift 防止導線)", () => {
    expect(doc).toContain("docs/coalter-supabase-ref-canon.md");
  });
});

// =============================================================================
// §6. D-1 verifyCanaryDeploy test fixtures が canon と一致
// =============================================================================

describe("D-3-α D-1 verifyCanaryDeploy fixtures — canon との一致", () => {
  const testPath = join(
    REPO_ROOT,
    "tests",
    "unit",
    "coalter",
    "verifyCanaryDeploy.test.ts",
  );
  const test = readFileSync(testPath, "utf8");

  it("fixture: const expected = '<canon expected_ref>' が存在", () => {
    expect(test).toContain(
      `const expected = "${canon.mirror_canary.expected_ref}"`,
    );
  });

  it("fixture: const forbidden = '<canon forbidden>' が存在", () => {
    expect(test).toContain(
      `const forbidden = "${canon.mirror_canary.forbidden_refs[0]}"`,
    );
  });

  it("fixture: validateCliArgs --expected-supabase 値が canon と一致", () => {
    expect(test).toContain(
      `"expected-supabase": "${canon.mirror_canary.expected_ref}"`,
    );
  });

  it("fixture: validateCliArgs --forbidden-supabase 値が canon と一致", () => {
    expect(test).toContain(
      `"forbidden-supabase": "${canon.mirror_canary.forbidden_refs[0]}"`,
    );
  });
});

// =============================================================================
// §7. D-2 canaryTriggerIgnoreCommand test の expected/forbidden assertion が canon と一致
// =============================================================================

describe("D-3-α D-2 canaryTriggerIgnoreCommand assertion — canon との一致", () => {
  const testPath = join(
    REPO_ROOT,
    "tests",
    "unit",
    "coalter",
    "canaryTriggerIgnoreCommand.test.ts",
  );
  const test = readFileSync(testPath, "utf8");

  it("assertion: expected_supabase_ref が canon expected_ref と一致", () => {
    expect(test).toContain(
      `expect(json.expected_supabase_ref).toBe("${canon.mirror_canary.expected_ref}")`,
    );
  });

  it("assertion: forbidden_supabase_ref が canon forbidden_refs[0] と一致", () => {
    expect(test).toContain(
      `expect(json.forbidden_supabase_ref).toBe("${canon.mirror_canary.forbidden_refs[0]}")`,
    );
  });
});

// =============================================================================
// §8. Production env vs Production data 区別 — canon §2.3 で扱われていることを確認
// =============================================================================

describe("D-3-α canon §2.3 — Production env vs Production data 区別", () => {
  const md = readFileSync(CANON_PATH, "utf8");

  it("canon に「Production env vs Production data」の見出しが存在", () => {
    expect(md).toMatch(/Production env\s+vs\s+Production data/);
  });

  it("canon に「Production env (Vercel env scope) は touch 0」相当の正例言明が存在", () => {
    // §6.1 正例
    expect(md).toMatch(/Production env.{0,50}touch\s*0/);
  });

  it("canon に「Production Supabase data は使う」相当の正例言明が存在", () => {
    expect(md).toMatch(/Production Supabase data.{0,30}使う/);
  });

  it("canon に「production-equivalent smoke の定義」言明が存在 (data を使うことが定義)", () => {
    expect(md).toContain("production-equivalent");
  });
});
