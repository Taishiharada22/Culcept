/**
 * [CEO lock 2026-04-20 M0-6A 追加lock2]
 *
 * Gate E-6 / E-7 の機械的検証。
 *
 *   E-6: `prompt` / `rawOutput` / `rawRationale` の識別子が
 *        `lib/coalter/understanding/` 配下のコードにプロパティとして出現しない。
 *        （コメント内の言及 / `_ForbiddenKeys` union 宣言は検知しない）
 *
 *   E-7: `implicitIntent` が diagnostics / comparison / console / analytics
 *        出力経路に載らない。TodayReading.implicitIntent は narration public
 *        field として許容するため、禁止対象ファイルを限定してチェックする。
 *        加えて、runtime で runUnderstanding shadow 実行時の diagnostics を
 *        JSON.stringify した結果に 4 識別子のいずれも出現しないことを検証する。
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runUnderstanding } from "@/lib/coalter/understanding";
import { buildSyntheticBundle, buildBootstrapMatrix } from "@/lib/coalter/understanding/__testkit__/syntheticPairs";
import { makeStubClient } from "@/lib/coalter/understanding/__testkit__/adversarialStubs";
import { createRealApiAdapter } from "@/lib/coalter/understanding/realApiAdapter";

const UNDERSTANDING_DIR = path.resolve(__dirname, "../../../../lib/coalter/understanding");

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const abs = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        // __testkit__ も監査対象に含める（stub 側から漏れないことも保証）
        stack.push(abs);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        out.push(abs);
      }
    }
  }
  return out;
}

/**
 * コメント行と `_ForbiddenKeys` union の string literal 列挙行を除外する。
 * 残った「実コード」の中で `name` がプロパティアクセス / 定義として
 * 使われていないかを判定する。
 */
function stripCommentsAndForbiddenUnion(source: string): string {
  // ブロックコメント除去
  let s = source.replace(/\/\*[\s\S]*?\*\//g, "");
  // 行コメント除去
  s = s
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
  // `_ForbiddenKeys` / `_Forbidden*Keys` の union 宣言内にある文字列リテラルは
  // **禁止宣言そのもの** なので検知対象から外す。
  // 形式: `type _ForbiddenXxxKeys = "a" | "b" | "c";` の `"..."` を除外。
  s = s.replace(
    /type\s+_Forbidden\w*\s*=\s*([^;]+);/g,
    (match) => match.replace(/"[^"]+"/g, '""'),
  );
  return s;
}

describe("Gate E-6: prompt / rawOutput / rawRationale の識別子出現禁止", () => {
  const TARGETS = ["prompt", "rawOutput", "rawRationale"] as const;

  it.each(TARGETS)(
    "lib/coalter/understanding/ 配下に `%s` プロパティが存在しない",
    (name) => {
      const files = listTsFiles(UNDERSTANDING_DIR);
      const hits: string[] = [];
      const propRe = new RegExp(
        // \.name\b   : プロパティアクセス
        // \bname\s*: : オブジェクトリテラル / 型プロパティ定義
        // name\?\s*: : optional 型プロパティ
        `(\\.${name}\\b|\\b${name}\\s*:|\\b${name}\\?\\s*:)`,
      );
      for (const f of files) {
        const raw = fs.readFileSync(f, "utf8");
        const stripped = stripCommentsAndForbiddenUnion(raw);
        const lines = stripped.split("\n");
        lines.forEach((line, idx) => {
          if (propRe.test(line)) {
            hits.push(`${path.relative(UNDERSTANDING_DIR, f)}:${idx + 1}: ${line.trim()}`);
          }
        });
      }
      expect(hits, `禁止識別子 \`${name}\` がプロパティとして出現:\n${hits.join("\n")}`).toEqual([]);
    },
  );
});

describe("Gate E-7: implicitIntent の経路限定（public field を除く）", () => {
  // narration/UI public field として allow list
  // adversarialStubs.ts は LLMReadingCandidate を構築する責務上、
  // `implicitIntent: ""` と明示的に空文字を設定する（漏洩防止のため）。
  // realApiAdapter.ts も同様に LLMReadingCandidate を LLM 応答から組み立てる
  // 定義経路であり、diagnostics/comparison/console 経路ではないため許可する。
  const ALLOWED_FILES = new Set([
    "todayReader.ts",
    "todayReaderLLM.ts",
    "types.ts",
    "adversarialStubs.ts",
    "realApiAdapter.ts",
  ]);

  it("diagnostics / comparison / index 経路に `implicitIntent` が現れない", () => {
    const files = listTsFiles(UNDERSTANDING_DIR);
    const hits: string[] = [];
    const propRe = /(\.implicitIntent\b|\bimplicitIntent\s*:|\bimplicitIntent\?\s*:)/;
    for (const f of files) {
      const rel = path.relative(UNDERSTANDING_DIR, f);
      const baseName = path.basename(f);
      if (ALLOWED_FILES.has(baseName)) continue;
      const raw = fs.readFileSync(f, "utf8");
      const stripped = stripCommentsAndForbiddenUnion(raw);
      const lines = stripped.split("\n");
      lines.forEach((line, idx) => {
        if (propRe.test(line)) {
          hits.push(`${rel}:${idx + 1}: ${line.trim()}`);
        }
      });
    }
    expect(
      hits,
      `implicitIntent が許可外ファイルで参照されています:\n${hits.join("\n")}`,
    ).toEqual([]);
  });

  it("runtime: shadow diagnostics に `prompt` / `rawOutput` / `rawRationale` / `implicitIntent` key が混入しない", async () => {
    const prev = {
      shadow: process.env.COALTER_UNDERSTANDING_LLM_SHADOW,
      diag: process.env.COALTER_UNDERSTANDING_DIAGNOSTICS,
    };
    process.env.COALTER_UNDERSTANDING_LLM_SHADOW = "1";
    process.env.COALTER_UNDERSTANDING_DIAGNOSTICS = "1";

    const captured: unknown[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      captured.push(args);
    };

    try {
      const bundle = buildSyntheticBundle(buildBootstrapMatrix()[0]);
      await runUnderstanding(bundle, "2026-04-20T12:00:00Z", "leak_audit_pair", {
        llmClient: makeStubClient("copycat"),
      });
    } finally {
      console.log = origLog;
      process.env.COALTER_UNDERSTANDING_LLM_SHADOW = prev.shadow;
      process.env.COALTER_UNDERSTANDING_DIAGNOSTICS = prev.diag;
    }

    const serialized = JSON.stringify(captured);
    // key として含まれないことを確認（文字列 token も key 文字列として表れるため double-check）
    for (const forbidden of ['"prompt"', '"rawOutput"', '"rawRationale"', '"implicitIntent"']) {
      expect(serialized.includes(forbidden), `diagnostics に ${forbidden} が混入`).toBe(false);
    }
  });
});

describe("adapter startup — 非 ZDR key で fail-fast (M0-6B)", () => {
  // [CEO lock 2026-04-20 M0-6B] docs/coalter-m0-6b-zdr-evidence.md §3 対応
  // ZDR enrollment が確認されていない key で adapter を起動したら throw すること。

  it("zdrVerified=false で createRealApiAdapter が throw する", () => {
    expect(() =>
      createRealApiAdapter({ apiKey: "sk-ant-test-key", zdrVerified: false }),
    ).toThrow(/zdr_unverified/);
  });

  it("apiKey='' で createRealApiAdapter が throw する", () => {
    expect(() =>
      createRealApiAdapter({ apiKey: "", zdrVerified: true }),
    ).toThrow(/api_key_missing/);
  });

  it("throw message に full key が含まれない（末尾 4 文字のみ）", () => {
    let caught: Error | null = null;
    try {
      createRealApiAdapter({
        apiKey: "sk-ant-supersecret-12ab",
        zdrVerified: false,
      });
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message.includes("sk-ant-supersecret")).toBe(false);
    expect(caught!.message.includes("12ab")).toBe(true);
  });

  it("zdrVerified=true + apiKey 設定時は throw しない", () => {
    expect(() =>
      createRealApiAdapter({ apiKey: "sk-ant-test-key", zdrVerified: true }),
    ).not.toThrow();
  });
});
