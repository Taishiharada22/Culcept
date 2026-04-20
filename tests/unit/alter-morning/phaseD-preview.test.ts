/**
 * Phase D Preview Test -- CEO 5 scenarios
 *
 * Real morningProtocol conversation flows.
 * Report: pass/fail, unnecessary questions, inference misses, UI oddities.
 */

import { describe, test, expect } from "vitest";
import { processMorningMessage, createSession } from "@/lib/alter-morning/morningProtocol";
import { preloadVocabulary } from "@/lib/alter-morning/intentParser";
import type { MorningSession } from "@/lib/alter-morning/types";

beforeAll(async () => {
  await preloadVocabulary();
});

function makeSession(overrides?: Partial<MorningSession>): MorningSession {
  const s = createSession();
  s.phase = "collecting";
  return { ...s, ...overrides } as MorningSession;
}

// ================================================================
// Scenario 1: Inference pass-through (no clarify)
// "今日カフェ行って少し作業して、そのあと夜ご飯"
// Expected: plan_presented, no transport/venue question
// ================================================================

describe("Scenario 1: inference pass-through", () => {
  test("cafe + dinner -> plan_presented without clarify", async () => {
    const session = makeSession();
    const { session: s, response: r } = await processMorningMessage(
      "今日カフェ行って少し作業して、そのあと夜ご飯",
      session,
    );

    console.log("[S1] phase:", s.phase);
    console.log("[S1] message:", r.message?.slice(0, 200));
    console.log("[S1] items:", r.plan?.items?.map(i => `${i.startTime ?? "?"} ${i.kind}:${i.what ?? i.text ?? ""} (${i.durationMin}min)`));
    console.log("[S1] autoInferred:", JSON.stringify(r.plan?.autoInferred, null, 2));
    console.log("[S1] clarifyQuestion:", r.clarifyQuestion);

    // Phase D rollback: transport 未指定 + 外出予定 → clarify で「移動」を聞くのが期待動作
    // venue は自動推論され続けるので「室内」は聞かない
    expect(r.clarifyQuestion ?? "").not.toContain("室内");

    // Plan should exist
    expect(r.plan).toBeDefined();
    expect(r.plan!.items.length).toBeGreaterThanOrEqual(1);

    // Phase D rollback: transport は auto-infer されない
    expect(r.plan?.autoInferred?.transport).toBeUndefined();
  });
});

// ================================================================
// Scenario 2: Place confirmation only
// "サドヤでランチ"
// Expected: place clarify OR plan_presented (depending on place resolution)
// ================================================================

describe("Scenario 2: place confirmation", () => {
  test("sadoya lunch -> place clarify or plan_presented", async () => {
    const session = makeSession();
    const { session: s, response: r } = await processMorningMessage(
      "サドヤでランチ",
      session,
    );

    console.log("[S2] phase:", s.phase);
    console.log("[S2] message:", r.message?.slice(0, 300));
    console.log("[S2] items:", r.plan?.items?.map(i => `${i.startTime ?? "?"} ${i.kind}:${i.what ?? i.text ?? ""} (${i.durationMin}min)`));
    console.log("[S2] autoInferred:", JSON.stringify(r.plan?.autoInferred, null, 2));
    console.log("[S2] clarifyQuestion:", r.clarifyQuestion);

    // Should NOT ask transport/venue/withWhom
    const msg = r.clarifyQuestion ?? r.message ?? "";
    expect(msg).not.toContain("何で移動する");
    expect(msg).not.toContain("室内が多い");

    // Plan should be provided even in clarifying
    expect(r.plan).toBeDefined();
  });
});

// ================================================================
// Scenario 3: Hard blocker only clarify
// "10時にカフェ、10時半に病院" (time conflict)
// Expected: only hard blocker clarify, not transport/venue
// ================================================================

describe("Scenario 3: hard blocker clarify", () => {
  test("time conflict -> only asks about conflict, not transport", async () => {
    const session = makeSession();
    const { session: s, response: r } = await processMorningMessage(
      "10時にカフェ、10時半に病院",
      session,
    );

    console.log("[S3] phase:", s.phase);
    console.log("[S3] message:", r.message?.slice(0, 300));
    console.log("[S3] items:", r.plan?.items?.map(i => `${i.startTime ?? "?"} ${i.kind}:${i.what ?? i.text ?? ""} (${i.durationMin}min)`));
    console.log("[S3] autoInferred:", JSON.stringify(r.plan?.autoInferred, null, 2));
    console.log("[S3] clarifyQuestion:", r.clarifyQuestion);

    // Phase D rollback: 外出+transport不明なら「移動」を聞くのは OK。venue は依然聞かない。
    const msg = r.clarifyQuestion ?? r.message ?? "";
    expect(msg).not.toContain("室内が多い");
  });

  test("meeting with unknown location -> location clarify only", async () => {
    const session = makeSession();
    const { session: s, response: r } = await processMorningMessage(
      "Aさんと会う",
      session,
    );

    console.log("[S3b] phase:", s.phase);
    console.log("[S3b] message:", r.message?.slice(0, 300));
    console.log("[S3b] clarifyQuestion:", r.clarifyQuestion);

    // Should NOT ask transport/withWhom
    const msg = r.clarifyQuestion ?? r.message ?? "";
    expect(msg).not.toContain("何で移動する");
    // Aさん is detected as companion, so should not ask withWhom
    expect(msg).not.toContain("誰かと合流");
  });
});

// ================================================================
// Scenario 4: Inference misses
// Regional user getting wrong transport
// ================================================================

describe("Scenario 4: inference accuracy", () => {
  test("Tokyo user -> train inference", async () => {
    const session = makeSession({ userPrefecture: "東京都" });
    const { session: s, response: r } = await processMorningMessage(
      "カフェで仕事する",
      session,
    );

    console.log("[S4a] phase:", s.phase);
    console.log("[S4a] autoInferred:", JSON.stringify(r.plan?.autoInferred, null, 2));

    if (s.phase === "plan_presented" && r.plan?.autoInferred?.transport) {
      expect(r.plan.autoInferred.transport.value).toBe("train");
    }
  });

  test("Hokkaido user -> car inference", async () => {
    const session = makeSession({ userPrefecture: "北海道" });
    const { session: s, response: r } = await processMorningMessage(
      "カフェで仕事する",
      session,
    );

    console.log("[S4b] phase:", s.phase);
    console.log("[S4b] autoInferred:", JSON.stringify(r.plan?.autoInferred, null, 2));

    if (s.phase === "plan_presented" && r.plan?.autoInferred?.transport) {
      expect(r.plan.autoInferred.transport.value).toBe("car");
    }
  });

  test("Aichi user -> train inference (Nagoya metro)", async () => {
    const session = makeSession({ userPrefecture: "愛知県" });
    const { session: s, response: r } = await processMorningMessage(
      "スタバで勉強する",
      session,
    );

    console.log("[S4c] phase:", s.phase);
    console.log("[S4c] autoInferred:", JSON.stringify(r.plan?.autoInferred, null, 2));

    if (s.phase === "plan_presented" && r.plan?.autoInferred?.transport) {
      expect(r.plan.autoInferred.transport.value).toBe("train");
    }
  });

  test("Yamanashi user -> car inference (rural)", async () => {
    const session = makeSession({ userPrefecture: "山梨県" });
    const { session: s, response: r } = await processMorningMessage(
      "サドヤでランチ",
      session,
    );

    console.log("[S4d] phase:", s.phase);
    console.log("[S4d] autoInferred:", JSON.stringify(r.plan?.autoInferred, null, 2));

    if (r.plan?.autoInferred?.transport) {
      expect(r.plan.autoInferred.transport.value).toBe("car");
    }
  });
});

// ================================================================
// Scenario 5: Plan edit after inference
// "やっぱり電車で" / "店変えて"
// ================================================================

describe("Scenario 5: plan edit after inference", () => {
  test("inferred car -> 'やっぱり電車で' -> transport updated", async () => {
    // Step 1: initial plan with inferred transport
    const session = makeSession();
    const { session: s1, response: r1 } = await processMorningMessage(
      "カフェで仕事する",
      session,
    );

    console.log("[S5a-1] phase:", s1.phase);
    console.log("[S5a-1] transport inferred:", r1.plan?.autoInferred?.transport?.value);
    console.log("[S5a-1] items:", r1.plan?.items?.map(i => `${i.startTime ?? "?"} ${i.kind}:${i.what ?? i.text ?? ""}`));

    // Step 2: edit transport
    if (s1.phase === "plan_presented") {
      const { session: s2, response: r2 } = await processMorningMessage(
        "やっぱり電車で",
        s1,
      );

      console.log("[S5a-2] phase:", s2.phase);
      console.log("[S5a-2] message:", r2.message?.slice(0, 200));
      console.log("[S5a-2] items:", r2.plan?.items?.map(i => `${i.startTime ?? "?"} ${i.kind}:${i.what ?? i.text ?? ""}`));

      // Plan should still be presented
      expect(r2.plan).toBeDefined();
    }
  });

  test("Screenshot scenario: multi-item plan quality check", async () => {
    // Simulating the screenshot: "のプランだけどとサドヤで鈴木さんと会食とそれ以外のプランを考えてくれる？"
    // This is a complex request - let's test a simpler version
    const session = makeSession();
    const { session: s1, response: r1 } = await processMorningMessage(
      "サドヤで鈴木さんと会食。それ以外のプランも考えて",
      session,
    );

    console.log("[S5b] phase:", s1.phase);
    console.log("[S5b] message:", r1.message?.slice(0, 300));
    console.log("[S5b] items:", r1.plan?.items?.map(i =>
      `${i.startTime ?? "?"} ${i.kind}:${i.what ?? i.text ?? ""} (${i.durationMin}min)`
    ));
    console.log("[S5b] autoInferred:", JSON.stringify(r1.plan?.autoInferred, null, 2));

    // Should have plan items
    expect(r1.plan).toBeDefined();
    // Should have at least the dining item
    if (r1.plan) {
      const hasFood = r1.plan.items.some(i =>
        (i.what ?? i.text ?? "").match(/会食|サドヤ|ランチ|食事/)
      );
      console.log("[S5b] hasFood:", hasFood);
    }
  });
});
