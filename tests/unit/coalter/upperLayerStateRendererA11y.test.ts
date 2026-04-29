/**
 * Stage 4 L4-k — UpperLayerStateRenderer a11y / StateAriaWrapper 統合 test
 *
 * CEO 必須項目 (2026-04-30):
 *   #6 StateAriaWrapper が state component を wrap
 *   #7 aria-live は polite 固定 (UrgentLayer assertive と分離、二重通知回避)
 *   #8 UpperLayerShell から二重 role="region" を削除
 *
 * test strategy:
 *   - 関数 invoke 方式 (UpperLayerStateRenderer を直接呼んで戻り値の React element 検査)
 *   - 構造 invariant grep で UpperLayerShell / Renderer の状態を確認
 *   - 新規 dep ゼロ
 */

import { describe, it, expect } from "vitest";

import UpperLayerStateRenderer from "@/app/components/chat/states/UpperLayerStateRenderer";
import StateAriaWrapper from "@/app/components/chat/states/StateAriaWrapper";

const NOOP = () => {};

describe("L4-k #6 — UpperLayerStateRenderer は StateAriaWrapper でラップ", () => {
  it("関数 invoke で root element の type が StateAriaWrapper", () => {
    const result = UpperLayerStateRenderer({
      state: "S0",
      mode: "normal",
      onSwitchMode: NOOP,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const elem = result as any;
    expect(elem).not.toBeNull();
    expect(elem.type).toBe(StateAriaWrapper);
  });

  it("StateAriaWrapper の props に state / mode が正しく渡る", () => {
    const result = UpperLayerStateRenderer({
      state: "S3",
      mode: "daily",
      onSwitchMode: NOOP,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const elem = result as any;
    expect(elem.props.state).toBe("S3");
    expect(elem.props.mode).toBe("daily");
  });

  it("StateAriaWrapper の children に state component (function component) が含まれる", () => {
    const result = UpperLayerStateRenderer({
      state: "S0",
      mode: "normal",
      onSwitchMode: NOOP,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const elem = result as any;
    expect(elem.props.children).not.toBeNull();
    expect(typeof elem.props.children.type).toBe("function");
    // 内部 child の props に mode / onSwitchMode が渡っている
    expect(elem.props.children.props.mode).toBe("normal");
    expect(elem.props.children.props.onSwitchMode).toBe(NOOP);
  });
});

describe("L4-k #7 — aria-live polite 固定 (isUrgent prop なし)", () => {
  it("StateAriaWrapper の isUrgent prop は undefined (= default false → polite)", () => {
    const result = UpperLayerStateRenderer({
      state: "S0",
      mode: "normal",
      onSwitchMode: NOOP,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const elem = result as any;
    expect(elem.props.isUrgent).toBeUndefined();
  });

  it("UpperLayerStateRenderer.tsx は isUrgent prop を渡していない (grep)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/states/UpperLayerStateRenderer.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // <StateAriaWrapper ... isUrgent={...}> の pattern が **存在しない**
    expect(content).not.toMatch(/isUrgent=\{/);
  });

  it("StateAriaWrapper は urgent 中以外 polite (default、StateAriaWrapper.tsx 仕様維持)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/states/StateAriaWrapper.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // isUrgent default false → aria-live = polite
    expect(content).toMatch(/isUrgent\s*=\s*false/);
    expect(content).toMatch(
      /isUrgent.*\?\s*["']assertive["']\s*:\s*["']polite["']/,
    );
  });
});

describe("L4-k #8 — UpperLayerShell から二重 role='region' 削除", () => {
  it("UpperLayerShell.tsx に role='region' / aria-label が含まれない", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/states/UpperLayerShell.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).not.toMatch(/role=["']region["']/);
    expect(content).not.toMatch(/aria-label="CoAlter 上部レイヤー"/);
    // data-testid は維持 (chunk grep で識別、smoke 確認用)
    expect(content).toMatch(/data-testid="coalter-upper-layer-mount"/);
  });
});

describe("L4-k 27 セル × 4 補助 = 108 ケース整合 (既存 chatClientFallbacks.test.ts と整合)", () => {
  it("9 state × 3 mode = 27 セルすべてで Renderer 関数 invoke 可能", async () => {
    const { PRESENCE_STATES, PRESENCE_MODES } = await import(
      "@/lib/coalter/presence/types"
    );
    let count = 0;
    for (const state of PRESENCE_STATES) {
      for (const mode of PRESENCE_MODES) {
        const result = UpperLayerStateRenderer({
          state,
          mode,
          onSwitchMode: NOOP,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const elem = result as any;
        expect(elem).not.toBeNull();
        expect(elem.type).toBe(StateAriaWrapper);
        expect(elem.props.state).toBe(state);
        expect(elem.props.mode).toBe(mode);
        count++;
      }
    }
    expect(count).toBe(27);
  });
});

describe("L4-k 構造 invariant — Renderer の StateAriaWrapper import", () => {
  it("UpperLayerStateRenderer.tsx は StateAriaWrapper を import", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/states/UpperLayerStateRenderer.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(
      /import\s+StateAriaWrapper\s+from\s+["']\.\/StateAriaWrapper["']/,
    );
    expect(content).toMatch(/<StateAriaWrapper\s/);
  });
});
