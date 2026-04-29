/**
 * Stage 4 L4-k — UpperLayerErrorBoundary class component test
 *
 * CEO 必須項目 (2026-04-30):
 *   #4 child throw で StateErrorFallback mount
 *   #5 retry で children 復帰
 *
 * test strategy:
 *   - class component を直接 instantiate して method を invoke
 *   - getDerivedStateFromError は static method で test 容易
 *   - render は instance.render() で React element を取得
 *   - 新規 dependency 追加なし (CEO 厳守、@testing-library/react 不要)
 */

import { describe, it, expect, vi } from "vitest";

import UpperLayerErrorBoundary from "@/app/components/chat/states/UpperLayerErrorBoundary";
import StateErrorFallback from "@/app/components/chat/states/StateErrorFallback";

describe("L4-k UpperLayerErrorBoundary — getDerivedStateFromError", () => {
  it("error → state.error に保存 (static method)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (UpperLayerErrorBoundary as any).getDerivedStateFromError(
      new Error("boom"),
    );
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toBe("boom");
  });
});

describe("L4-k UpperLayerErrorBoundary — render", () => {
  it("error なし → children を返す", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = new (UpperLayerErrorBoundary as any)({
      children: "test child",
    });
    expect(instance.state.error).toBeNull();
    const result = instance.render();
    expect(result).toBe("test child");
  });

  it("error あり → StateErrorFallback を返す (CEO 必須 #4)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = new (UpperLayerErrorBoundary as any)({ children: null });
    instance.state = { error: new Error("boom") };
    const result = instance.render();
    // StateErrorFallback は function component
    expect(typeof result.type).toBe("function");
    expect(result.type).toBe(StateErrorFallback);
    expect(result.props.error).toBeInstanceOf(Error);
    expect(result.props.error.message).toBe("boom");
    expect(typeof result.props.onRetry).toBe("function");
    // state / mode は ErrorBoundary level の default 値 (S0 / normal)
    expect(result.props.state).toBe("S0");
    expect(result.props.mode).toBe("normal");
  });
});

describe("L4-k UpperLayerErrorBoundary — reset (CEO 必須 #5)", () => {
  it("reset で state.error が null に戻る (setState 経由)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = new (UpperLayerErrorBoundary as any)({ children: null });
    instance.state = { error: new Error("boom") };

    // setState mock: state を直接 mutation する代わりに updates を記録
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stateUpdates: any[] = [];
    instance.setState = (update: unknown) => {
      stateUpdates.push(update);
    };

    instance.reset();
    expect(stateUpdates).toEqual([{ error: null }]);
  });

  it("reset 後の render が children を返す (state.error = null 想定)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = new (UpperLayerErrorBoundary as any)({
      children: "after reset child",
    });
    instance.state = { error: null };
    const result = instance.render();
    expect(result).toBe("after reset child");
  });
});

describe("L4-k UpperLayerErrorBoundary — componentDidCatch (CEO 必須: telemetry 最小)", () => {
  it("console.error を呼ぶ (CEO 厳守: L4-j 衝突回避、Sentry breadcrumb なし)", () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = new (UpperLayerErrorBoundary as any)({ children: null });
    instance.componentDidCatch(new Error("boom"), {
      componentStack: "test stack",
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    const callArgs = consoleErrorSpy.mock.calls[0];
    expect(callArgs[0]).toBe("[UpperLayerErrorBoundary]");
    expect(callArgs[1]).toBeInstanceOf(Error);

    consoleErrorSpy.mockRestore();
  });
});

describe("L4-k UpperLayerErrorBoundary — 構造 invariant", () => {
  it("class component (= function with prototype)", () => {
    expect(typeof UpperLayerErrorBoundary).toBe("function");
    expect(UpperLayerErrorBoundary.prototype).toBeDefined();
    // class component の prototype.render が存在
    expect(
      typeof UpperLayerErrorBoundary.prototype.render,
    ).toBe("function");
  });

  it("getDerivedStateFromError は static method", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(typeof (UpperLayerErrorBoundary as any).getDerivedStateFromError).toBe(
      "function",
    );
  });

  it("file は class component で実装 + react-error-boundary を import しない (CEO 厳守: 新 dep なし)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/states/UpperLayerErrorBoundary.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/extends\s+Component/);
    expect(content).toMatch(/getDerivedStateFromError/);
    expect(content).toMatch(/componentDidCatch/);
    // 新 dep 不使用
    expect(content).not.toMatch(/from\s+["']react-error-boundary["']/);
    // Sentry / telemetry sink を本 file から呼ばない (L4-j 衝突回避)
    expect(content).not.toMatch(/captureException|addBreadcrumb|sentryTelemetry/);
  });
});
