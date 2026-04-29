/**
 * Stage 4 B-2.3 — UpperLayerMount urgent + bus subscribe integration test
 *
 * CEO 要件 (2026-04-29):
 *   #1 implicit signal が bus → reducer に届く (subscribe + dispatch の chain)
 *   #5 unmount で unsubscribe される
 *   #6 flag OFF で既存通り no-op
 *
 * 加えて:
 *   - 構造 invariant (B-2 で wire した依存関係) を grep で確認
 *   - bus subscribe → publish → dispatch (mock) の chain を関数 invoke で確認
 *
 * test strategy:
 *   - usePresenceExecutor の useReducer 内部は React 環境なしで test 不可
 *   - 代替: subscribePresenceSignal を直接 invoke して bus → callback の chain 確認
 *   - UpperLayerMount は構造 invariant (file 内容) で確認
 *   - flag OFF / ON の behavior は既存 chatClientUpperLayerMount.test.ts でカバー
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  publishPresenceSignal,
  subscribePresenceSignal,
  __resetSignalBus,
} from "@/lib/coalter/presence/productionSignalBus";
import {
  adaptCritical,
  adaptImplicit,
} from "@/lib/coalter/presence/signalAdapter";
import type { PresenceSignal } from "@/lib/coalter/presence/types";
import UpperLayerMount, {
  URGENT_AUTO_REFIRE_BLOCK_MS,
} from "@/app/components/chat/UpperLayerMount";

const ENV_KEY = "NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR";
let originalEnv: string | undefined;

beforeEach(() => {
  __resetSignalBus();
  originalEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalEnv;
});

// ─────────────────────────────────────────────
// CEO 要件 #1: implicit signal が bus → callback (= reducer) に届く
// ─────────────────────────────────────────────

describe("B-2.3 要件 #1 — implicit signal が bus → reducer (callback) に届く", () => {
  it("subscribe → publish (implicit) → callback が signal を受信", () => {
    const received: PresenceSignal[] = [];
    const unsub = subscribePresenceSignal((s) => received.push(s));

    const sig = adaptImplicit({ softScore: 0.4, detectedAt: 0 });
    publishPresenceSignal(sig);

    expect(received).toHaveLength(1);
    expect(received[0].kind).toBe("implicit");
    expect(received[0].strength).toBe("soft");
    unsub();
  });

  it("複数 implicit publish で callback が順次呼ばれる (signal log の順序維持)", () => {
    const received: PresenceSignal[] = [];
    const unsub = subscribePresenceSignal((s) => received.push(s));

    publishPresenceSignal(adaptImplicit({ softScore: 0.3, detectedAt: 0 }));
    publishPresenceSignal(adaptImplicit({ softScore: 0.5, detectedAt: 1 }));
    publishPresenceSignal(adaptImplicit({ softScore: 0.7, detectedAt: 2 }));

    expect(received).toHaveLength(3);
    expect(received.map((s) => s.detectedAt)).toEqual([0, 1, 2]);
    unsub();
  });
});

// ─────────────────────────────────────────────
// CEO 要件 #5: unmount で unsubscribe される
// ─────────────────────────────────────────────

describe("B-2.3 要件 #5 — unsubscribe で callback が呼ばれなくなる", () => {
  it("subscribe → unsubscribe → publish で callback 呼ばれない", () => {
    const received: PresenceSignal[] = [];
    const unsub = subscribePresenceSignal((s) => received.push(s));

    publishPresenceSignal(adaptImplicit({ softScore: 0.4, detectedAt: 0 }));
    expect(received).toHaveLength(1);

    unsub();
    publishPresenceSignal(adaptImplicit({ softScore: 0.4, detectedAt: 1 }));
    expect(received).toHaveLength(1); // unsub 後は増えない
  });

  it("複数 subscriber でも個別に unsubscribe 可能 (memory leak ゼロ)", () => {
    const a: PresenceSignal[] = [];
    const b: PresenceSignal[] = [];
    const unsubA = subscribePresenceSignal((s) => a.push(s));
    const unsubB = subscribePresenceSignal((s) => b.push(s));

    publishPresenceSignal(adaptImplicit({ softScore: 0.4, detectedAt: 0 }));
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);

    unsubA();
    publishPresenceSignal(adaptImplicit({ softScore: 0.4, detectedAt: 1 }));
    expect(a).toHaveLength(1); // a は unsub 済
    expect(b).toHaveLength(2); // b は subscribe 中
    unsubB();
  });
});

// ─────────────────────────────────────────────
// CEO 要件 #6: flag OFF で既存通り no-op
// ─────────────────────────────────────────────

describe("B-2.3 要件 #6 — flag OFF で UpperLayerMount は null (回帰)", () => {
  it("flag OFF で UpperLayerMount() === null (B-2 で挙動不変)", () => {
    delete process.env[ENV_KEY];
    expect(UpperLayerMount()).toBeNull();
  });

  it("flag ON で UpperLayerMount() の type は function (UpperLayerMountActive)", () => {
    process.env[ENV_KEY] = "true";
    const result = UpperLayerMount() as React.ReactElement | null;
    expect(result).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const type = (result as any)?.type;
    expect(typeof type).toBe("function");
  });
});

// ─────────────────────────────────────────────
// CEO 要件 #2 + #3 — critical → urgent decision、non-critical → null
// (criticalKeywordDetector + urgentTrigger で個別カバー、本 test では
//  signal level の chain 確認)
// ─────────────────────────────────────────────

describe("B-2.3 要件 #2 + #3 — signal kind と urgent decision の chain", () => {
  it("critical signal が bus に流れる (chain 上流の確認)", () => {
    const received: PresenceSignal[] = [];
    const unsub = subscribePresenceSignal((s) => received.push(s));

    const critical = adaptCritical({
      trigger: "rupture_detected",
      detectedAt: 0,
    });
    publishPresenceSignal(critical);

    expect(received).toHaveLength(1);
    expect(received[0].kind).toBe("critical");
    expect(received[0].strength).toBe("strong");
    unsub();
  });

  it("implicit signal が bus に流れる (chain 上流の確認、urgent decision には届かない)", () => {
    const received: PresenceSignal[] = [];
    const unsub = subscribePresenceSignal((s) => received.push(s));

    const implicit = adaptImplicit({ softScore: 0.4, detectedAt: 0 });
    publishPresenceSignal(implicit);

    expect(received).toHaveLength(1);
    expect(received[0].kind).toBe("implicit");
    // urgent decision の判定は urgentTrigger.detectUrgent で行う (本 test では確認しない)
    // implicit signal は urgent には届かない (urgentTrigger.test.ts で検証済)
    unsub();
  });
});

// ─────────────────────────────────────────────
// 構造 invariant: B-2 で wire した依存関係を grep で確認
// ─────────────────────────────────────────────

describe("B-2.3 構造 invariant — usePresenceExecutor の bus subscribe wire", () => {
  it("usePresenceExecutor.ts は subscribePresenceSignal を import", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/usePresenceExecutor.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(
      /import\s+\{[^}]*subscribePresenceSignal[^}]*\}\s+from\s+["']@\/lib\/coalter\/presence\/productionSignalBus["']/,
    );
  });

  it("usePresenceExecutor.ts は useEffect 内で subscribe → unsubscribe return", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/usePresenceExecutor.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    // useEffect で subscribe → return された unsubscribe を React に返す pattern
    expect(content).toMatch(/useEffect\(/);
    expect(content).toMatch(/return\s+subscribePresenceSignal\(/);
  });
});

describe("B-2.3 構造 invariant — UpperLayerMount の UrgentLayer wire", () => {
  it("UpperLayerMount.tsx は UrgentLayer を import + mount", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/import\s+UrgentLayer\s+from\s+["']\.\/UrgentLayer["']/);
    expect(content).toMatch(/<UrgentLayer\s/);
  });

  it("UpperLayerMount.tsx は isUrgentAutoRefireBlocked を import + 使用", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/isUrgentAutoRefireBlocked/);
    // §8.5.4 60s block の定数
    expect(content).toContain("URGENT_AUTO_REFIRE_BLOCK_MS");
  });

  it("URGENT_AUTO_REFIRE_BLOCK_MS は 60_000 (UI spec §8.5.4)", () => {
    expect(URGENT_AUTO_REFIRE_BLOCK_MS).toBe(60_000);
  });

  it("UpperLayerMount.tsx は handleUrgentDismiss handler を持つ (dismiss 経路)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/handleUrgentDismiss/);
    expect(content).toMatch(/setLastRelease/);
    expect(content).toMatch(/path:\s*["']user_dismiss["']/);
  });
});

describe("B-2.3 構造 invariant — PresenceSignalWiring の critical detection wire", () => {
  it("PresenceSignalWiring.tsx は detectCriticalKeyword を import + 使用", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/PresenceSignalWiring.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(
      /import\s+\{\s*detectCriticalKeyword\s*\}\s+from\s+["']@\/lib\/coalter\/presence\/criticalKeywordDetector["']/,
    );
    expect(content).toMatch(/detectCriticalKeyword\(/);
  });

  it("PresenceSignalWiring.tsx は adaptCritical を import (critical signal 経路)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/PresenceSignalWiring.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/adaptCritical/);
  });

  it("ObservedMessage interface に optional body?: string 追加 (subtype 維持)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/PresenceSignalWiring.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // body は optional (TalkMessage subtype を破壊しない)
    expect(content).toMatch(/body\?:\s*string/);
  });

  it("flag check が useEffect 先頭に存在 (no-op invariant)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/PresenceSignalWiring.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // useEffect 先頭で flag check → false 時 early return (no-op invariant)
    expect(content).toMatch(/COALTER_FLAGS\.presenceExecutorEnabled[\s\S]{0,200}return/);
  });
});

describe("B-2.3 構造 invariant — ChatClient.tsx は B-2 で touch ゼロ", () => {
  it("ChatClient.tsx の PresenceSignalWiring mount は不変 (props は messages のみ)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/(culcept)/talk/[threadId]/ChatClient.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // PresenceSignalWiring が import + mount されている
    expect(content).toMatch(
      /import\s+PresenceSignalWiring\s+from\s+["']@\/app\/components\/chat\/PresenceSignalWiring["']/,
    );
    expect(content).toMatch(/<PresenceSignalWiring\s+messages=\{messages\}\s*\/>/);
  });
});
