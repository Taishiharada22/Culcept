/**
 * PresentationTarget helper test (PR B-3b Commit 2)
 *
 * CEO/GPT 2026-05-03 PR B-3b 規律:
 *   getPresentationTarget(ctx) backward compat helper の挙動を fix する。
 *   旧 session / 旧 payload (= target field なし) は targetEventId から
 *   event_where と推定される。新コード (= target 設定済み) は target を返す。
 *
 * 確認項目:
 *   - 新 ctx (= target 設定済み) → target がそのまま返る
 *   - 旧 ctx (= target なし) → { kind: "event_where", eventId: targetEventId }
 *   - 3 種類 target (event_where / journey_origin / journey_end) を正しく扱う
 */

import { describe, it, expect } from "vitest";
import {
  getPresentationTarget,
  type PresentationContext,
  type PresentationTarget,
} from "@/lib/alter-morning/dialog/types";

// fixture: PresentationContext の最小構成 (= target 関連だけ)
function makeCtx(overrides: {
  target?: PresentationTarget;
  targetEventId: string;
}): Pick<PresentationContext, "target" | "targetEventId"> {
  return overrides;
}

describe("[Part A] getPresentationTarget — 新 ctx (= target 設定済み)", () => {
  it("event_where target 設定済 → target がそのまま返る", () => {
    const ctx = makeCtx({
      target: { kind: "event_where", eventId: "event_xyz" },
      targetEventId: "event_xyz",
    });
    const result = getPresentationTarget(ctx);
    expect(result.kind).toBe("event_where");
    if (result.kind === "event_where") {
      expect(result.eventId).toBe("event_xyz");
    }
  });

  it("journey_origin target 設定済 → target がそのまま返る (= sentinel 無視)", () => {
    const ctx = makeCtx({
      target: { kind: "journey_origin" },
      targetEventId: "__plan_origin__", // sentinel
    });
    const result = getPresentationTarget(ctx);
    expect(result.kind).toBe("journey_origin");
  });

  it("journey_end target 設定済 → target がそのまま返る", () => {
    const ctx = makeCtx({
      target: { kind: "journey_end" },
      targetEventId: "__plan_end__",
    });
    const result = getPresentationTarget(ctx);
    expect(result.kind).toBe("journey_end");
  });
});

describe("[Part B] getPresentationTarget — 旧 ctx (= target field なし、backward compat)", () => {
  it("target なし + targetEventId → event_where と推定", () => {
    const ctx = makeCtx({ targetEventId: "event_legacy" });
    const result = getPresentationTarget(ctx);
    expect(result.kind).toBe("event_where");
    if (result.kind === "event_where") {
      expect(result.eventId).toBe("event_legacy");
    }
  });

  it("target undefined + targetEventId 空文字でも event_where (defensive)", () => {
    const ctx = makeCtx({ targetEventId: "" });
    const result = getPresentationTarget(ctx);
    expect(result.kind).toBe("event_where");
    if (result.kind === "event_where") {
      expect(result.eventId).toBe("");
    }
  });
});

describe("[Part C] backward compat 不変条件", () => {
  it("旧 session 互換: target なしでも crash しない", () => {
    const ctx: Pick<PresentationContext, "target" | "targetEventId"> = {
      targetEventId: "event_old_session",
    };
    expect(() => getPresentationTarget(ctx)).not.toThrow();
  });

  it("3 種 target すべて kind 値で discriminate できる", () => {
    const targets: PresentationTarget[] = [
      { kind: "event_where", eventId: "evt" },
      { kind: "journey_origin" },
      { kind: "journey_end" },
    ];
    const kinds = targets.map((t) => t.kind);
    expect(kinds).toEqual(["event_where", "journey_origin", "journey_end"]);
  });
});
