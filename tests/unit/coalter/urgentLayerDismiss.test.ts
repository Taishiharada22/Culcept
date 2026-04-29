/**
 * Stage 4 B-2.4 — UrgentLayer dismiss UX visibility fix test
 *
 * CEO 必須 7 項目 (2026-04-30):
 *   1. dominant_card に dismiss button が存在し、white 背景上で視認可能 style
 *   2. overlay_banner の dismiss button が維持
 *   3. inline_cue に dismiss button が追加
 *   4. 全 variant で aria-label「緊急表示を閉じる」に統一
 *   5. onDismiss が呼ばれる
 *   6. 既存の 60s autoRefire block test が回帰しない
 *   7. 既存 B-1/B-2/B-3/B-4 tests が回帰しない (Full vitest で確認、本 test では grep 維持)
 *
 * test strategy (CEO 指示「grep だけに寄りすぎず、可能なら既存 test pattern で
 * component / callback 挙動も確認、新規 dependency 追加は不要」):
 *   - 関数 invoke 方式: UrgentLayer / UrgentRelease を関数として呼んで戻り値の
 *     React.ReactElement を inspect (props.onClick / aria-label / type 等)
 *   - structure invariant grep: file 内容で style / aria-label / button 存在を確認
 *   - 新規 dep ゼロ (@testing-library/react 不要)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import UrgentLayer from "@/app/components/chat/UrgentLayer";
import UrgentRelease from "@/app/components/chat/UrgentRelease";
import type {
  UrgentDecision,
  UrgentForm,
} from "@/lib/coalter/presence/urgentTrigger";

// ─────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────

function makeDecision(form: UrgentForm): UrgentDecision {
  return {
    category: "rupture_detected",
    form,
    memoryFallback: "compact",
  };
}

/**
 * React element tree から最初に hit する `<button>` を返す (children を flat に走査)。
 * function component (例: UrgentRelease) は invoke して内部を walk する。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findButton(node: any): any {
  if (node == null) return null;
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return null;
  }
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findButton(n);
      if (r) return r;
    }
    return null;
  }
  // function component: invoke して結果を walk
  if (typeof node.type === "function") {
    const inner = node.type(node.props);
    return findButton(inner);
  }
  // host element の type === "button"
  if (node.type === "button") return node;
  // children を recurse
  const children = node.props?.children;
  if (children !== undefined) {
    return findButton(children);
  }
  return null;
}

// ─────────────────────────────────────────────
// CEO 必須 #1: dominant_card に dismiss button、white 背景 visible style
// ─────────────────────────────────────────────

describe("B-2.4 #1 — dominant_card dismiss button (white 背景 visible)", () => {
  let dismissMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dismissMock = vi.fn();
  });

  it("dominant_card render で button が tree 内に存在", () => {
    const elem = UrgentLayer({
      decision: makeDecision("dominant_card"),
      message: "test",
      onDismiss: dismissMock,
    });
    const button = findButton(elem);
    expect(button).not.toBeNull();
  });

  it("dominant_card の button は UrgentRelease 経由で onDismiss を持つ", () => {
    const elem = UrgentLayer({
      decision: makeDecision("dominant_card"),
      message: "test",
      onDismiss: dismissMock,
    });
    const button = findButton(elem);
    expect(button.props.onClick).toBe(dismissMock);
  });

  it("UrgentRelease 単体: white 背景 + indigo border + dark text の visible style", () => {
    const elem = UrgentRelease({ onDismiss: dismissMock });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const button = elem as any;
    expect(button.type).toBe("button");
    expect(button.props.style.background).toBe("#ffffff");
    expect(button.props.style.border).toBe("1px solid #6366F1");
    expect(button.props.style.color).toBe("#1e1b4b");
    // 修正前の半透明白 style が削除されている
    expect(button.props.style.background).not.toBe("transparent");
  });
});

// ─────────────────────────────────────────────
// CEO 必須 #2: overlay_banner dismiss button 維持
// ─────────────────────────────────────────────

describe("B-2.4 #2 — overlay_banner dismiss button 維持", () => {
  let dismissMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dismissMock = vi.fn();
  });

  it("overlay_banner render で button が tree 内に存在", () => {
    const elem = UrgentLayer({
      decision: makeDecision("overlay_banner"),
      message: "test",
      onDismiss: dismissMock,
    });
    const button = findButton(elem);
    expect(button).not.toBeNull();
  });

  it("overlay_banner button の data-testid は coalter-urgent-banner-dismiss", () => {
    const elem = UrgentLayer({
      decision: makeDecision("overlay_banner"),
      message: "test",
      onDismiss: dismissMock,
    });
    const button = findButton(elem);
    expect(button.props["data-testid"]).toBe("coalter-urgent-banner-dismiss");
  });

  it("overlay_banner button onClick で onDismiss が呼ばれる", () => {
    const elem = UrgentLayer({
      decision: makeDecision("overlay_banner"),
      message: "test",
      onDismiss: dismissMock,
    });
    const button = findButton(elem);
    button.props.onClick();
    expect(dismissMock).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────
// CEO 必須 #3: inline_cue に dismiss button 追加
// ─────────────────────────────────────────────

describe("B-2.4 #3 — inline_cue に dismiss button 追加", () => {
  let dismissMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dismissMock = vi.fn();
  });

  it("inline_cue render で button が tree 内に存在 (新規追加)", () => {
    const elem = UrgentLayer({
      decision: makeDecision("inline_cue"),
      message: "test",
      onDismiss: dismissMock,
    });
    const button = findButton(elem);
    expect(button).not.toBeNull();
  });

  it("inline_cue button の data-testid は coalter-urgent-inline-dismiss", () => {
    const elem = UrgentLayer({
      decision: makeDecision("inline_cue"),
      message: "test",
      onDismiss: dismissMock,
    });
    const button = findButton(elem);
    expect(button.props["data-testid"]).toBe("coalter-urgent-inline-dismiss");
  });

  it("inline_cue button onClick で onDismiss が呼ばれる", () => {
    const elem = UrgentLayer({
      decision: makeDecision("inline_cue"),
      message: "test",
      onDismiss: dismissMock,
    });
    const button = findButton(elem);
    button.props.onClick();
    expect(dismissMock).toHaveBeenCalledTimes(1);
  });

  it("inline_cue button は absolute position (右上)", () => {
    const elem = UrgentLayer({
      decision: makeDecision("inline_cue"),
      message: "test",
      onDismiss: dismissMock,
    });
    const button = findButton(elem);
    expect(button.props.style.position).toBe("absolute");
    expect(typeof button.props.style.top).toBe("number");
    expect(typeof button.props.style.right).toBe("number");
  });
});

// ─────────────────────────────────────────────
// CEO 必須 #4: 全 variant で aria-label「緊急表示を閉じる」統一
// ─────────────────────────────────────────────

describe("B-2.4 #4 — 全 variant で aria-label「緊急表示を閉じる」統一", () => {
  let dismissMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dismissMock = vi.fn();
  });

  const FORMS: UrgentForm[] = ["dominant_card", "overlay_banner", "inline_cue"];

  for (const form of FORMS) {
    it(`${form} の button aria-label === "緊急表示を閉じる"`, () => {
      const elem = UrgentLayer({
        decision: makeDecision(form),
        message: "test",
        onDismiss: dismissMock,
      });
      const button = findButton(elem);
      expect(button).not.toBeNull();
      expect(button.props["aria-label"]).toBe("緊急表示を閉じる");
    });
  }
});

// ─────────────────────────────────────────────
// CEO 必須 #5: onDismiss が呼ばれる (各 variant 統合確認)
// ─────────────────────────────────────────────

describe("B-2.4 #5 — onDismiss callback が全 variant で呼ばれる", () => {
  const FORMS: UrgentForm[] = ["dominant_card", "overlay_banner", "inline_cue"];

  for (const form of FORMS) {
    it(`${form}: button.onClick → onDismiss invoke`, () => {
      const dismiss = vi.fn();
      const elem = UrgentLayer({
        decision: makeDecision(form),
        message: "test",
        onDismiss: dismiss,
      });
      const button = findButton(elem);
      button.props.onClick();
      expect(dismiss).toHaveBeenCalledTimes(1);
    });
  }

  it("decision === null では何も render しない (button も存在しない)", () => {
    const dismiss = vi.fn();
    const elem = UrgentLayer({
      decision: null,
      message: "test",
      onDismiss: dismiss,
    });
    expect(elem).toBeNull();
  });
});

// ─────────────────────────────────────────────
// CEO 必須 #6: 既存 60s autoRefire block test が回帰しない
// ─────────────────────────────────────────────

describe("B-2.4 #6 — 既存 60s autoRefire block 維持 (構造的回帰確認)", () => {
  it("UpperLayerMount.tsx の URGENT_AUTO_REFIRE_BLOCK_MS = 60_000 不変", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/URGENT_AUTO_REFIRE_BLOCK_MS\s*=\s*60_000/);
    expect(content).toMatch(/isUrgentAutoRefireBlocked/);
    expect(content).toMatch(/handleUrgentDismiss/);
  });

  it("urgentReleaseLogic.isUrgentAutoRefireBlocked のロジックは touch されていない", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../lib/coalter/presence/urgentReleaseLogic.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/isUrgentAutoRefireBlocked/);
    // §8.5.4 60s block 仕様 (B-2.1 から不変)
    expect(content).toMatch(/blockMs:\s*number\s*=\s*60_000/);
  });
});

// ─────────────────────────────────────────────
// 構造 invariant grep (CEO 必須 #1-#4 の補強)
// ─────────────────────────────────────────────

describe("B-2.4 構造 invariant — file 内容の grep", () => {
  it("UrgentRelease.tsx は white 背景前提 style", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UrgentRelease.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/background:\s*["']#ffffff["']/);
    expect(content).toMatch(/border:\s*["']1px solid #6366F1["']/);
    expect(content).toMatch(/color:\s*["']#1e1b4b["']/);
    // 修正前の半透明白 / transparent が削除済
    expect(content).not.toMatch(/background:\s*["']transparent["']/);
    expect(content).not.toMatch(/rgba\(255,\s*255,\s*255/);
  });

  it("UrgentRelease.tsx の aria-label = 緊急表示を閉じる", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UrgentRelease.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/aria-label="緊急表示を閉じる"/);
    // 旧 wording が削除済
    expect(content).not.toMatch(/緊急介入を閉じる/);
  });

  it("UrgentLayer.tsx inline_cue case に position: relative + dismiss button", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UrgentLayer.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/coalter-urgent-inline-dismiss/);
    // inline_cue case 内に position: relative
    expect(content).toMatch(
      /case\s+["']inline_cue["'][\s\S]{0,1500}position:\s*["']relative["']/,
    );
    // inline_cue case 内に onClick={onDismiss}
    expect(content).toMatch(
      /case\s+["']inline_cue["'][\s\S]{0,2000}onClick=\{onDismiss\}/,
    );
  });

  it("UrgentLayer.tsx 全 aria-label = 緊急表示を閉じる (overlay_banner + inline_cue で 2 箇所以上)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UrgentLayer.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    const matches = content.match(/緊急表示を閉じる/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    // 旧 wording が削除済
    expect(content).not.toMatch(/緊急介入を閉じる/);
  });
});

// ─────────────────────────────────────────────
// CEO 厳守: ChatClient 不可侵 (B-2.4 でも維持)
// ─────────────────────────────────────────────

describe("B-2.4 ChatClient.tsx に touch していない (B-2.4 でも維持)", () => {
  it("UpperLayerMount は props ゼロで mount (B-1 から不変)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/(culcept)/talk/[threadId]/ChatClient.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/<UpperLayerMount\s*\/>/);
    expect(content).not.toMatch(/<UpperLayerMount[^/]*onDismiss/);
    expect(content).not.toMatch(/<UpperLayerMount[^/]*urgent/);
  });
});
