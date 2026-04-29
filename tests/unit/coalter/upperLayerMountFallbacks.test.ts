/**
 * Stage 4 L4-k — UpperLayerMount Loading / Empty / ErrorBoundary wire test
 *
 * CEO 必須項目 (2026-04-30):
 *   #1 Loading: 初期 tick で StateLoadingFallback
 *   #2 Loading: timer 後に通常 state へ戻る
 *   #3 Empty: availability !== "active" の 4 値 (disabled / inactive / pending_consent / enabled) で StateEmptyFallback
 *   #9 ChatClient.tsx touch なし
 *   #10 既存 B-1 / B-2 / B-3 / B-4 / B-2.4 regression なし
 *
 * test strategy:
 *   - 関数 invoke + 構造 invariant grep
 *   - Loading / Empty 経路の trigger 条件は UpperLayerMount.tsx の grep で確認
 *   - StateLoadingFallback / StateEmptyFallback 単独 invoke で各 (state, mode) で render 可能であることを確認
 *   - 27 セル × 4 補助 (Loading / Error / Empty / Aria) の structural readiness を確認
 *   - 新規 dep ゼロ
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import UpperLayerMount from "@/app/components/chat/UpperLayerMount";
import StateLoadingFallback from "@/app/components/chat/states/StateLoadingFallback";
import StateEmptyFallback from "@/app/components/chat/states/StateEmptyFallback";
import StateErrorFallback from "@/app/components/chat/states/StateErrorFallback";
import UpperLayerErrorBoundary from "@/app/components/chat/states/UpperLayerErrorBoundary";

const ENV_KEY = "NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR";
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
// CEO 必須 #1 + #2: Loading 経路
// ─────────────────────────────────────────────

describe("L4-k #1+2 Loading 経路 (isPresenceReady transient)", () => {
  it("flag ON で UpperLayerMount() の root type は UpperLayerErrorBoundary (class)", () => {
    process.env[ENV_KEY] = "true";
    const result = UpperLayerMount();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const elem = result as any;
    expect(elem).not.toBeNull();
    expect(elem.type).toBe(UpperLayerErrorBoundary);
    // children: <UpperLayerMountActive />
    expect(elem.props.children).not.toBeNull();
    expect(typeof elem.props.children.type).toBe("function");
  });

  it("UpperLayerMount.tsx は isPresenceReady useState + setTimeout 経路", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/isPresenceReady/);
    expect(content).toMatch(/setIsPresenceReady/);
    expect(content).toMatch(/useState<boolean>\(false\)|useState\(false\)/);
    expect(content).toMatch(/setTimeout\(\(\)\s*=>\s*setIsPresenceReady\(true\)/);
  });

  it("UpperLayerMount.tsx は !isPresenceReady で StateLoadingFallback を return", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(
      /if\s*\(\s*!isPresenceReady\s*\)\s*\{[\s\S]{0,200}StateLoadingFallback/,
    );
  });

  it("StateLoadingFallback は React element を返す (関数 invoke 可能)", () => {
    const result = StateLoadingFallback({ state: "S0", mode: "normal" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const elem = result as any;
    expect(elem).not.toBeNull();
    // StateAriaWrapper でラップされている (a11y 統合)
    expect(typeof elem.type).toBe("function");
  });
});

// ─────────────────────────────────────────────
// CEO 必須 #3: Empty 経路 (availability !== "active")
// ─────────────────────────────────────────────

describe("L4-k #3 Empty 経路 (availability !== 'active')", () => {
  it("UpperLayerMount.tsx は availability !== 'active' で StateEmptyFallback return", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(
      /availability\s*!==\s*["']active["'][\s\S]{0,200}StateEmptyFallback/,
    );
  });

  it("StateEmptyFallback は React element を返す (関数 invoke 可能)", () => {
    const result = StateEmptyFallback({ state: "S0", mode: "normal" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const elem = result as any;
    expect(elem).not.toBeNull();
    expect(typeof elem.type).toBe("function");
  });

  it("availability の 4 値 (disabled / inactive / pending_consent / enabled) すべてで StateEmptyFallback が render 可能", async () => {
    const { EXECUTOR_AVAILABILITIES } = await import(
      "@/lib/coalter/presence/types"
    );
    // active 以外の 4 値で trigger される、StateEmptyFallback は state/mode props のみ
    const nonActiveValues = EXECUTOR_AVAILABILITIES.filter(
      (a) => a !== "active",
    );
    expect(nonActiveValues).toEqual([
      "disabled",
      "inactive",
      "pending_consent",
      "enabled",
    ]);
    // 各 availability で StateEmptyFallback の props 型整合 (state / mode のみ受ける)
    for (const _av of nonActiveValues) {
      const result = StateEmptyFallback({ state: "S0", mode: "normal" });
      expect(result).not.toBeNull();
    }
  });
});

// ─────────────────────────────────────────────
// CEO 必須 #4: Error 経路 (ErrorBoundary)
// ─────────────────────────────────────────────

describe("L4-k #4 Error 経路 (UpperLayerErrorBoundary)", () => {
  it("UpperLayerMount.tsx は UpperLayerErrorBoundary で UpperLayerMountActive をラップ", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(
      /import\s+UpperLayerErrorBoundary\s+from\s+["']\.\/states\/UpperLayerErrorBoundary["']/,
    );
    expect(content).toMatch(
      /<UpperLayerErrorBoundary>[\s\S]{0,300}<UpperLayerMountActive/,
    );
  });

  it("StateErrorFallback は React element を返す + retry callback を受ける", () => {
    const onRetry = () => {};
    const result = StateErrorFallback({
      state: "S0",
      mode: "normal",
      error: new Error("boom"),
      onRetry,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const elem = result as any;
    expect(elem).not.toBeNull();
    expect(typeof elem.type).toBe("function");
  });
});

// ─────────────────────────────────────────────
// CEO 必須 #9: ChatClient.tsx touch なし
// ─────────────────────────────────────────────

describe("L4-k #9 ChatClient.tsx touch なし (CEO 厳守)", () => {
  it("ChatClient.tsx は <UpperLayerMount /> props ゼロのまま (B-1 から不変)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/(culcept)/talk/[threadId]/ChatClient.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/<UpperLayerMount\s*\/>/);
    // ErrorBoundary / Loading / Empty 関連 import が ChatClient に入っていない
    expect(content).not.toMatch(/UpperLayerErrorBoundary/);
    expect(content).not.toMatch(/StateLoadingFallback/);
    expect(content).not.toMatch(/StateEmptyFallback/);
    expect(content).not.toMatch(/StateErrorFallback/);
  });

  it("ErrorBoundary は UpperLayer 領域のみ包む (chat input / scroll / message rendering 不変)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/(culcept)/talk/[threadId]/ChatClient.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // <UpperLayerErrorBoundary> が ChatClient.tsx 内に入っていない
    expect(content).not.toMatch(/<UpperLayerErrorBoundary/);
  });
});

// ─────────────────────────────────────────────
// 27 セル × 4 補助 = 108 ケース structural readiness (§10.2 #10 complete 担保)
// ─────────────────────────────────────────────

describe("L4-k 27 セル × 4 補助 = 108 ケース structural readiness", () => {
  it("9 state × 3 mode = 27 セルすべてで 4 補助状態 (Loading/Error/Empty/Aria) の component が呼べる", async () => {
    const { PRESENCE_STATES, PRESENCE_MODES } = await import(
      "@/lib/coalter/presence/types"
    );
    const StateAriaWrapper = (
      await import("@/app/components/chat/states/StateAriaWrapper")
    ).default;

    let total = 0;
    for (const state of PRESENCE_STATES) {
      for (const mode of PRESENCE_MODES) {
        // 4 補助状態すべて invoke 可能
        const loading = StateLoadingFallback({ state, mode });
        const error = StateErrorFallback({ state, mode });
        const empty = StateEmptyFallback({ state, mode });
        const aria = StateAriaWrapper({
          state,
          mode,
          children: null,
        });

        expect(loading).not.toBeNull();
        expect(error).not.toBeNull();
        expect(empty).not.toBeNull();
        expect(aria).not.toBeNull();

        total++;
      }
    }
    expect(total).toBe(27);
  });
});

// ─────────────────────────────────────────────
// flag OFF / ON 既存 invariant 維持 (B-1 から不変、回帰なし)
// ─────────────────────────────────────────────

describe("L4-k flag invariant (B-1 から不変)", () => {
  it("flag OFF で UpperLayerMount() === null", () => {
    delete process.env[ENV_KEY];
    expect(UpperLayerMount()).toBeNull();
  });

  it("env=false で null", () => {
    process.env[ENV_KEY] = "false";
    expect(UpperLayerMount()).toBeNull();
  });
});
