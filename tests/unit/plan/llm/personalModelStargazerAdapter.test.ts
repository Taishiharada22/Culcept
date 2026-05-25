/**
 * Phase 3-N Plan P2 Step 3 Stage A — Real Stargazer adapter scaffold test
 *
 * 設計書: docs/alter-plan-p2-step3-real-pm-readiness.md
 *
 * 検証範囲 (= Step 3 Stage A = scaffold + safe fallback):
 *   - 空 userId → meta-only Phase 0 (= deterministic 等価)
 *   - 通常 userId + 全 WIRE_* false → meta-only Phase 0
 *   - Stable / Recent / Contextual の各 layer が undefined であること
 *   - Per-field try/catch が fail-open すること (= 例外時も entry 落ちない)
 *
 * 注: Stage B 以降 (= WIRE_JUDGMENT_MODE 等 = true) になったら、
 *     対応する wire 経路の test を追加する。 本 file は Stage A scaffold 用。
 *
 * 用語:
 *   - HDM Phase: PersonalModelMeta.hdmPhase (= 0-5、 readout level gating)
 *   - readiness doc Phase: workflow 全体 Phase 1-6 (= branch / 実装 / test / smoke / commit / canary)
 *   - Stage A-D: adapter file 内の wire enablement sub-stage (= readiness Phase 2 内の段階)
 *
 * 不変原則:
 *   - server-only module を mock (= vitest 環境で import 可能)
 *   - 実 Stargazer module への access 0 (= Stage A では WIRE_* 全 false なので発生しない)
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { extractPersonalModelFromStargazer } from "@/lib/plan/llm/personalModelStargazerAdapter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// extractPersonalModelFromStargazer (= public entry、 Stage A = safe fallback)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractPersonalModelFromStargazer (= Stage A scaffold)", () => {
  it("空 userId → meta-only Phase 0 (= deterministic 等価)", async () => {
    const pm = await extractPersonalModelFromStargazer("");

    expect(pm.meta).toBeDefined();
    expect(pm.meta.hdmPhase).toBe(0);
    expect(pm.meta.trustLevel).toBe(0);
    expect(pm.meta.observationCompleteness).toBe(0);
    expect(pm.stable).toBeUndefined();
    expect(pm.recent).toBeUndefined();
    expect(pm.contextual).toBeUndefined();
  });

  it("通常 userId + 全 WIRE_* false → meta-only Phase 0 (= 既存 stub と同 挙動)", async () => {
    const pm = await extractPersonalModelFromStargazer("user-test-001");

    expect(pm.meta).toBeDefined();
    expect(pm.meta.hdmPhase).toBe(0);
    expect(pm.meta.trustLevel).toBe(0);
    expect(pm.meta.observationCompleteness).toBe(0);
    // Phase < 2 なので layer 全部 undefined
    expect(pm.stable).toBeUndefined();
    expect(pm.recent).toBeUndefined();
    expect(pm.contextual).toBeUndefined();
  });

  it("UUID 形式 userId でも safe fallback (= 形式不問)", async () => {
    const pm = await extractPersonalModelFromStargazer(
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    );

    expect(pm.meta.hdmPhase).toBe(0);
    expect(pm.stable).toBeUndefined();
    expect(pm.recent).toBeUndefined();
    expect(pm.contextual).toBeUndefined();
  });

  it("複数呼出が独立 (= mutate なし、 並列安全)", async () => {
    const [pm1, pm2, pm3] = await Promise.all([
      extractPersonalModelFromStargazer("user-a"),
      extractPersonalModelFromStargazer("user-b"),
      extractPersonalModelFromStargazer(""),
    ]);

    expect(pm1.meta.hdmPhase).toBe(0);
    expect(pm2.meta.hdmPhase).toBe(0);
    expect(pm3.meta.hdmPhase).toBe(0);
    // 別 instance であること (= reference shared 禁止)
    expect(pm1).not.toBe(pm2);
    expect(pm1.meta).not.toBe(pm2.meta);
  });

  it("PersonalModelV2 shape を満たす (= meta required)", async () => {
    const pm = await extractPersonalModelFromStargazer("user-shape-check");

    // meta は必須 field
    expect(pm).toHaveProperty("meta");
    expect(typeof pm.meta.hdmPhase).toBe("number");
    expect(typeof pm.meta.trustLevel).toBe("number");
    expect(typeof pm.meta.observationCompleteness).toBe("number");
  });
});
