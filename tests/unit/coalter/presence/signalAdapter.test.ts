/**
 * Stage 2 L2-b — signalAdapter 5 分類 + 構造的 import gate test
 *
 * plan §5.2 Gate:
 *   - signal 5 分類の test PASS
 *   - adapter 経由でない signal 投入 path が構造的に存在しない (import 構造レビュー)
 *   - executor event (`executor.understanding.*`) の直接購読コードが presence/** に存在しない
 *
 * 構造 gate (runtime §1.7-2 / 統合契約 §3.6-2):
 *   - presence/** は executor.understanding.* を import しない (grep で検証)
 *   - presence/** は executor watcher 内部型を直接受け取らない
 *     (adapter input 型が plain interface で構成されていることで担保)
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

import {
  adaptExplicit,
  adaptImplicit,
  adaptCritical,
  adaptModePromotion,
  adaptManualRestart,
} from "@/lib/coalter/presence/signalAdapter";

// ─────────────────────────────────────────────
// 5 分類の adapter 出力 (kind / strength / detectedAt / meta 透過)
// ─────────────────────────────────────────────

describe("L2-b signalAdapter — 5 分類の正確性", () => {
  it("adaptExplicit: kind=explicit / strength=strong / source 透過", () => {
    const sig = adaptExplicit({
      source: "free_text",
      detectedAt: 1000,
      meta: { msg: "今日の予定組みたい" },
    });
    expect(sig.kind).toBe("explicit");
    expect(sig.strength).toBe("strong");
    expect(sig.detectedAt).toBe(1000);
    expect(sig.meta?.source).toBe("free_text");
    expect(sig.meta?.msg).toBe("今日の予定組みたい");
  });

  it("adaptExplicit: chip_tap / mention / button_tap も同形", () => {
    for (const source of ["chip_tap", "mention", "button_tap"] as const) {
      const sig = adaptExplicit({ source, detectedAt: 1 });
      expect(sig.kind).toBe("explicit");
      expect(sig.strength).toBe("strong");
      expect(sig.meta?.source).toBe(source);
    }
  });

  it("adaptImplicit: score > 0 → strength=soft", () => {
    const sig = adaptImplicit({ softScore: 0.42, detectedAt: 2000 });
    expect(sig.kind).toBe("implicit");
    expect(sig.strength).toBe("soft");
    expect(sig.detectedAt).toBe(2000);
    expect(sig.meta?.softScore).toBe(0.42);
  });

  it("adaptImplicit: score = 0 → strength=none (signal なし扱い)", () => {
    const sig = adaptImplicit({ softScore: 0, detectedAt: 3 });
    expect(sig.kind).toBe("implicit");
    expect(sig.strength).toBe("none");
  });

  it("adaptCritical: kind=critical / strength=strong / trigger 透過 (v1.1 §8.4)", () => {
    const sig = adaptCritical({
      trigger: "heat_escalation",
      detectedAt: 4000,
    });
    expect(sig.kind).toBe("critical");
    expect(sig.strength).toBe("strong");
    expect(sig.meta?.trigger).toBe("heat_escalation");
  });

  it("adaptModePromotion: target / source 透過、strength=strong", () => {
    const sig = adaptModePromotion({
      target: "daily",
      source: "mode_tap",
      detectedAt: 5000,
    });
    expect(sig.kind).toBe("mode_promotion");
    expect(sig.strength).toBe("strong");
    expect(sig.meta?.target).toBe("daily");
    expect(sig.meta?.source).toBe("mode_tap");
  });

  it("adaptManualRestart: source 透過、strength=strong", () => {
    const sig = adaptManualRestart({
      source: "button_tap",
      detectedAt: 6000,
    });
    expect(sig.kind).toBe("manual_restart");
    expect(sig.strength).toBe("strong");
    expect(sig.meta?.source).toBe("button_tap");
  });

  it("全 adapter で detectedAt が透過される (順序判定で reducer が依存)", () => {
    expect(adaptExplicit({ source: "free_text", detectedAt: 100 }).detectedAt).toBe(100);
    expect(adaptImplicit({ softScore: 0.5, detectedAt: 200 }).detectedAt).toBe(200);
    expect(adaptCritical({ trigger: "x", detectedAt: 300 }).detectedAt).toBe(300);
    expect(
      adaptModePromotion({
        target: "travel",
        source: "free_text",
        detectedAt: 400,
      }).detectedAt,
    ).toBe(400);
    expect(adaptManualRestart({ source: "mention", detectedAt: 500 }).detectedAt).toBe(
      500,
    );
  });
});

// ─────────────────────────────────────────────
// 構造 gate: presence/** は executor.understanding.* を import しない
// ─────────────────────────────────────────────

const PRESENCE_DIR = resolve(__dirname, "../../../../lib/coalter/presence");

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("L2-b 構造 gate — runtime §1.7-2 / 統合契約 §3.6-2 不可侵", () => {
  it("presence/** が存在し、source ファイルが列挙できる", () => {
    const files = listTsFiles(PRESENCE_DIR);
    expect(files.length).toBeGreaterThan(0);
    // L2-a + L2-b で最低 4 file
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it("presence/** のどの source ファイルも executor.understanding.* / Stage 1 Understand を import しない", () => {
    const files = listTsFiles(PRESENCE_DIR);
    for (const path of files) {
      const content = readFileSync(path, "utf8");
      // 検査対象は import 文のみ (doc comment 中の「executor.understanding」言及は許可、
      // 実コードの import path に現れることを禁止)
      const importLines = content
        .split("\n")
        .filter((line) =>
          /^\s*(import\s|export\s+\{[^}]*\}\s+from\s|export\s+\*\s+from\s)/.test(line),
        );
      const importBlock = importLines.join("\n");
      // import path に "executor.understanding" / "executor/understanding" が含まれない
      expect(importBlock).not.toMatch(/executor\.understanding/);
      expect(importBlock).not.toMatch(/from\s+["'][^"']*executor\/understanding/);
      // Stage 1 Understand 関連 (signal source にならない、runtime §1.7-2 / Stage 1 関与禁止 §1.7-3)
      expect(importBlock).not.toMatch(/from\s+["'][^"']*\/understanding\/[^"']*["']/);
    }
  });

  it("presence/** が presence.state.* bus を direct subscribe しない (executor 逆方向結合禁止 §1.7-5)", () => {
    // presence/** 内のコードは bus そのものを subscribe しない (UI renderer が subscriber)
    // presence/** は signal を生成するだけで、bus 自体の publish/subscribe API は触らない
    const files = listTsFiles(PRESENCE_DIR);
    for (const path of files) {
      const content = readFileSync(path, "utf8");
      // presence.state.* を subscribe する形跡がないこと (.subscribe / addEventListener 等)
      // 本 L2-b 段階では bus 実装そのものが未存在のため、import 痕跡のみ確認
      expect(content).not.toMatch(/presence\.state\.[*\w]+\.subscribe/);
    }
  });

  it("presence/** が既存 lib/coalter ルート (coalterDispatch 等) を import しない (新サブディレクトリ独立性 / plan §5.1 配置)", () => {
    const files = listTsFiles(PRESENCE_DIR);
    for (const path of files) {
      const content = readFileSync(path, "utf8");
      // 既存 dispatch / orchestrator / engine を pull しない (新サブディレクトリは独立 build)
      expect(content).not.toMatch(/from\s+["']\.\.\/coalterDispatch/);
      expect(content).not.toMatch(/from\s+["']\.\.\/coalterOrchestrator/);
      expect(content).not.toMatch(/from\s+["']\.\.\/engine["']/);
    }
  });
});
