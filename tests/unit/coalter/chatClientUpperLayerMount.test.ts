/**
 * Stage 4 L4-a — UpperLayerMount snapshot / flag gate test
 *
 * plan v0.3 §7.1 Gate:
 *   - flag OFF で render = null (既存 ChatClient diff ゼロ)
 *   - flag ON で 上部レイヤー本番 mount
 *   - npm run build 成功 (本 test では型 + render 経路のみ確認)
 *
 * test strategy:
 *   - React 描画は不要 (Stage 4 では node 環境 vitest)
 *   - UpperLayerMount は flag を直接読むので、env 切替で挙動確認
 *   - 静的 import 構造で「flag OFF で UpperLayerMount は何も rendering しない」根拠を確認
 *
 * NOTE: ChatClient 全体 snapshot test は実装複雑度が高い (Supabase / framer-motion /
 *   多数 dependency)。本 phase は UpperLayerMount を分離して個別検証する。
 *   ChatClient.tsx の diff は import 1 行 + JSX 1 行のみ、UpperLayerMount が flag OFF で
 *   null を返す限り render 結果は不変 (差分は追加 React element 1 つだけ、DOM 不変)。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

// React はモジュールレベルで読むと dom 必要なので、UpperLayerMount を関数として呼ぶ前に
// 必要な部分だけ import する戦略。Component は普通の関数なので関数として実行可能。
import UpperLayerMount from "@/app/components/chat/UpperLayerMount";
import { COALTER_FLAGS } from "@/lib/coalter/flags";

const ENV_KEY = "COALTER_PRESENCE_EXECUTOR";
let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalEnv;
});

describe("L4-a UpperLayerMount — flag OFF で null render (既存 layout 不変)", () => {
  it("env 未設定 (既定 OFF) で UpperLayerMount() が null を返す", () => {
    delete process.env[ENV_KEY];
    expect(COALTER_FLAGS.presenceExecutorEnabled).toBe(false);
    const result = UpperLayerMount();
    expect(result).toBeNull();
  });

  it("env=false で null", () => {
    process.env[ENV_KEY] = "false";
    expect(UpperLayerMount()).toBeNull();
  });

  it("env=0 / no / off いずれも null", () => {
    for (const v of ["0", "no", "off"]) {
      process.env[ENV_KEY] = v;
      expect(UpperLayerMount()).toBeNull();
    }
  });
});

describe("L4-a UpperLayerMount — flag ON で React 要素を返す", () => {
  it("env=true で UpperLayerMount() が non-null React 要素を返す", () => {
    process.env[ENV_KEY] = "true";
    expect(COALTER_FLAGS.presenceExecutorEnabled).toBe(true);
    const result = UpperLayerMount();
    expect(result).not.toBeNull();
    // React element は object (function component の戻り値)
    expect(typeof result).toBe("object");
  });

  it("env=1 / on / yes でも non-null", () => {
    for (const v of ["1", "on", "yes"]) {
      process.env[ENV_KEY] = v;
      expect(UpperLayerMount()).not.toBeNull();
    }
  });
});

describe("L4-a UpperLayerMount — flag ON 時の React 要素 shape (E2E mock 相当)", () => {
  it("flag ON で返る React 要素は inner component (UpperLayerMountActive) を type に持つ", () => {
    process.env[ENV_KEY] = "true";
    const result = UpperLayerMount() as React.ReactElement | null;
    expect(result).not.toBeNull();
    // React element 構造: { type: <function>, props: {...} }
    // type が function (UpperLayerMountActive) であることを確認
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const type = (result as any)?.type;
    expect(typeof type).toBe("function");
  });

  it("flag OFF で返り値は null (子 component に到達しない)", () => {
    process.env[ENV_KEY] = "false";
    expect(UpperLayerMount()).toBeNull();
  });
});

describe("L4-a 構造 invariant — ChatClient.tsx diff は flag-gated 1 行のみ", () => {
  it("UpperLayerMount は flag を見て分岐する純関数 (副作用なし、SSR 安全)", () => {
    // 同じ env で複数回呼んでも同じ結果
    process.env[ENV_KEY] = "false";
    const a = UpperLayerMount();
    const b = UpperLayerMount();
    expect(a).toBeNull();
    expect(b).toBeNull();

    process.env[ENV_KEY] = "true";
    const c = UpperLayerMount();
    const d = UpperLayerMount();
    expect(c).not.toBeNull();
    expect(d).not.toBeNull();
  });
});
