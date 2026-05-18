/**
 * CoAlter AOO Phase B B-5a + B-5b — useMirrorEngine structural test
 *
 * 正本: hooks/useMirrorEngine.ts
 *
 * Hook 実体 (React state / effect) は jsdom 不在のため direct render しない。
 * 静的検査で:
 *   - 4-layer defense L4 (flag OFF early return) が source に書かれているか
 *   - shadow mode (decideMirror + diagnostic) を維持
 *   - B-5b visible candidate evaluation 経路 (evaluateVisibleMirror) が追加されているか
 *   - 禁止 API (fetch / LLM / storage / timer) が使われていないか
 *
 * 動的 logic は visibleMirrorEvaluator.test.ts で完全 cover。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE_PATH = resolve(
  __dirname,
  "../../../../hooks/useMirrorEngine.ts",
);
const SOURCE = readFileSync(SOURCE_PATH, "utf-8");

describe("B-5a + B-5b useMirrorEngine — 4-layer flag gating defense L4", () => {
  it("flag OFF → early return (L4 defense)", () => {
    // useEffect 内で flag check → return
    expect(SOURCE).toMatch(/COALTER_FLAGS\.mirrorChannelEnabled/);
    expect(SOURCE).toMatch(/if\s*\(\s*!COALTER_FLAGS\.mirrorChannelEnabled\s*\)/);
  });

  it("debug global install 経路", () => {
    expect(SOURCE).toMatch(/installDiagnosticDebugGlobalIfEnabled/);
  });
});

describe("B-5a useMirrorEngine — shadow mode path (B-5a 維持)", () => {
  it("decideMirror() 呼び出し", () => {
    expect(SOURCE).toMatch(/decideMirror\(/);
  });

  it("diagnostic snapshot push", () => {
    expect(SOURCE).toMatch(/pushDiagnosticEntry/);
  });

  it("channelLock 取得 / 解放", () => {
    expect(SOURCE).toMatch(/tryAcquireMirrorLock/);
    expect(SOURCE).toMatch(/releaseMirrorLock/);
  });

  it("engineInvoked / candidateCount counter", () => {
    expect(SOURCE).toMatch(/incrementEngineInvoked/);
    expect(SOURCE).toMatch(/incrementCandidateCount/);
  });
});

describe("C-2 useMirrorEngine — presenceMirrorBridge lifecycle", () => {
  it("initializeBridgeOnce import + 呼出", () => {
    expect(SOURCE).toMatch(/initializeBridgeOnce/);
  });
  it("disposeBridge import + cleanup での呼出", () => {
    expect(SOURCE).toMatch(/disposeBridge/);
  });
  it("bridge initialize / dispose は separate useEffect (engine effect と独立)", () => {
    const useEffectCount = (SOURCE.match(/useEffect\(/g) || []).length;
    expect(useEffectCount).toBeGreaterThanOrEqual(2);
  });
  it("bridge initialize 経路に flag check (mirrorChannelEnabled) が存在", () => {
    expect(SOURCE).toMatch(/mirrorChannelEnabled/);
  });
});

describe("B-5b useMirrorEngine — visible candidate evaluation 経路", () => {
  it("evaluateVisibleMirror import + 呼出", () => {
    expect(SOURCE).toMatch(/evaluateVisibleMirror/);
  });

  it("incrementVisibleSpeak 呼び出し (visible に出した時のみ)", () => {
    expect(SOURCE).toMatch(/incrementVisibleSpeak/);
  });

  it("isVisibleCapReached (cap check)", () => {
    expect(SOURCE).toMatch(/isVisibleCapReached/);
  });

  it("sleepStore getSleep / setSleep (sleep handlers)", () => {
    expect(SOURCE).toMatch(/getSleep/);
    expect(SOURCE).toMatch(/setSleep/);
  });

  it("React state (visible / sleepOn) 管理", () => {
    expect(SOURCE).toMatch(/useState/);
    expect(SOURCE).toMatch(/useRef/);
  });

  it("handler を返す (onDismiss / onSleepRequest / onSleepResume)", () => {
    expect(SOURCE).toMatch(/onDismiss/);
    expect(SOURCE).toMatch(/onSleepRequest/);
    expect(SOURCE).toMatch(/onSleepResume/);
  });

  it("UseMirrorEngineResult interface export (visible / sleepOn / handlers)", () => {
    expect(SOURCE).toMatch(/UseMirrorEngineResult/);
  });
});

describe("B-5a + B-5b useMirrorEngine — 禁止 API (No-Effect Contract)", () => {
  it("fetch / XMLHttpRequest / axios 一切なし", () => {
    expect(SOURCE).not.toMatch(/\bfetch\(/);
    expect(SOURCE).not.toMatch(/XMLHttpRequest/);
    expect(SOURCE).not.toMatch(/axios/);
  });

  it("LLM / external service 一切なし", () => {
    expect(SOURCE).not.toMatch(/openai/i);
    expect(SOURCE).not.toMatch(/anthropic/i);
    expect(SOURCE).not.toMatch(/supabase/i);
    expect(SOURCE).not.toMatch(/sentry/i);
  });

  it("setTimeout / setInterval 一切なし", () => {
    expect(SOURCE).not.toMatch(/setTimeout\(/);
    expect(SOURCE).not.toMatch(/setInterval\(/);
  });

  it("localStorage / sessionStorage / cookie / IndexedDB 一切なし", () => {
    expect(SOURCE).not.toMatch(/localStorage/);
    expect(SOURCE).not.toMatch(/sessionStorage/);
    expect(SOURCE).not.toMatch(/document\.cookie/);
    expect(SOURCE).not.toMatch(/indexedDB/i);
  });

  it("console output 一切なし", () => {
    expect(SOURCE).not.toMatch(/console\.(log|info|warn|error|debug)/);
  });

  it("chat layer / presence layer / observer layer touch なし (import 経路)", () => {
    expect(SOURCE).not.toMatch(/@\/lib\/coalter\/presence/);
    expect(SOURCE).not.toMatch(/@\/lib\/coalter\/observer/);
    expect(SOURCE).not.toMatch(/@\/components\/chat/);
    expect(SOURCE).not.toMatch(/@\/app\/components\/chat/);
  });
});
