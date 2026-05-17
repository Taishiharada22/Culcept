/**
 * CoAlter AOO Phase B B-2 — `readMirrorModeContext` invariant test
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §5 / §9.2
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2.2 / §6
 *
 * 北極星 (CEO 2026-05-17):
 *   > Mirror が話す前に、そもそも今どの Presence Mode なのかを
 *   > 安全に・副作用なく・誤読せずに読めるようにする。
 *
 * test 範囲 (CEO 必須 10 + autonomous 5 = 15 case):
 *   CEO 1-3: normal / daily / travel → known / canProceed true
 *   CEO 4: null → unknown / canProceed false
 *   CEO 5: undefined → unknown / canProceed false
 *   CEO 6: invalid string → unknown / canProceed false
 *   CEO 7: source missing → unknown source 扱い
 *   CEO 8: raw text / message id / user id を受け取らない (型レベル enforcement)
 *   CEO 9: 関数が副作用を持たない (input mutation なし, deterministic)
 *   CEO 10: B-1 strict flag parser regression (別 file で再実行)
 *
 *   autonomous 11: status / mode / canProceed triple-equivalence invariant
 *   autonomous 12: 出力 shape (4 fields のみ、extra leak なし)
 *   autonomous 13: input mutation なし (input object が unchanged)
 *   autonomous 14: idempotent (同一入力で同一出力)
 *   autonomous 15: case sensitivity (大文字 / whitespace → unknown)
 */

import { describe, it, expect } from "vitest";
import { readMirrorModeContext } from "@/lib/coalter/mirror/modeContextReader";
import type {
  MirrorModeContextInput,
  MirrorModeContextResult,
} from "@/lib/coalter/mirror/types";

describe("B-2 readMirrorModeContext — CEO 必須 10 case", () => {
  // CEO 1-3: 正常系
  it("CEO-1: normal → known / canProceedToMirrorDecision === true", () => {
    const result = readMirrorModeContext({ presenceMode: "normal", source: "presence_state" });
    expect(result.status).toBe("known");
    expect(result.mode).toBe("normal");
    expect(result.source).toBe("presence_state");
    expect(result.canProceedToMirrorDecision).toBe(true);
  });

  it("CEO-2: daily → known / canProceedToMirrorDecision === true", () => {
    const result = readMirrorModeContext({ presenceMode: "daily", source: "presence_state" });
    expect(result.status).toBe("known");
    expect(result.mode).toBe("daily");
    expect(result.source).toBe("presence_state");
    expect(result.canProceedToMirrorDecision).toBe(true);
  });

  it("CEO-3: travel → known / canProceedToMirrorDecision === true", () => {
    const result = readMirrorModeContext({ presenceMode: "travel", source: "explicit_input" });
    expect(result.status).toBe("known");
    expect(result.mode).toBe("travel");
    expect(result.source).toBe("explicit_input");
    expect(result.canProceedToMirrorDecision).toBe(true);
  });

  // CEO 4-6: unknown 系
  it("CEO-4: presenceMode === null → unknown / canProceedToMirrorDecision === false", () => {
    const result = readMirrorModeContext({ presenceMode: null, source: "presence_state" });
    expect(result.status).toBe("unknown");
    expect(result.mode).toBeNull();
    expect(result.canProceedToMirrorDecision).toBe(false);
  });

  it("CEO-5: presenceMode === undefined → unknown / canProceedToMirrorDecision === false", () => {
    const result = readMirrorModeContext({ presenceMode: undefined, source: "presence_state" });
    expect(result.status).toBe("unknown");
    expect(result.mode).toBeNull();
    expect(result.canProceedToMirrorDecision).toBe(false);
  });

  it("CEO-6: invalid string → unknown / canProceedToMirrorDecision === false", () => {
    // type assertion で runtime に「型外」の値を渡しても reader は safe に reject
    const input = { presenceMode: "lunch" as unknown as MirrorModeContextInput["presenceMode"], source: "presence_state" } as const;
    const result = readMirrorModeContext(input);
    expect(result.status).toBe("unknown");
    expect(result.mode).toBeNull();
    expect(result.canProceedToMirrorDecision).toBe(false);
  });

  it("CEO-7: source 未指定 / 不明値 → source === 'missing' に正規化", () => {
    const r1 = readMirrorModeContext({ presenceMode: "normal" });
    expect(r1.source).toBe("missing");

    // 不明値 (runtime に型外の値を渡す)
    const r2 = readMirrorModeContext({
      presenceMode: "normal",
      source: "bogus_source" as unknown as MirrorModeContextInput["source"],
    });
    expect(r2.source).toBe("missing");

    // input そのものが空
    const r3 = readMirrorModeContext({});
    expect(r3.status).toBe("unknown");
    expect(r3.source).toBe("missing");
  });

  it("CEO-8: 入力型は presenceMode + source のみ (raw text / message id / user id を受け取らない)", () => {
    // 型レベル enforcement の証明: MirrorModeContextInput には presenceMode と source のみ存在
    // この test は **compile time** で保証されるべきなので、runtime には extra field を入れても
    // ignore されることを確認する (型は readonly で別 field を持たない)
    const inputWithExtra = {
      presenceMode: "normal" as const,
      source: "presence_state" as const,
      // 以下は ALL extra (型に存在しないため compile error にはなる、runtime にも leak しないことを確認)
      rawText: "this is a user message that should not leak",
      messageId: "msg_dangerous_id",
      userId: "user_pii",
      sessionId: "session_pii",
    } as unknown as MirrorModeContextInput;

    const result = readMirrorModeContext(inputWithExtra);
    // 出力 shape が定義通り (4 fields のみ) であることを確認
    const expectedKeys = ["status", "mode", "source", "canProceedToMirrorDecision"];
    const actualKeys = Object.keys(result).sort();
    expect(actualKeys).toEqual(expectedKeys.sort());

    // raw text / message id / user id / session id 等が **出力に leak しない**ことを確認
    const resultJson = JSON.stringify(result);
    expect(resultJson).not.toContain("rawText");
    expect(resultJson).not.toContain("messageId");
    expect(resultJson).not.toContain("userId");
    expect(resultJson).not.toContain("sessionId");
    expect(resultJson).not.toContain("user_pii");
    expect(resultJson).not.toContain("session_pii");
    expect(resultJson).not.toContain("msg_dangerous_id");
    expect(resultJson).not.toContain("this is a user message that should not leak");
  });

  it("CEO-9: 関数は副作用を持たない (input mutation なし)", () => {
    const input = { presenceMode: "normal" as const, source: "presence_state" as const };
    const inputSnapshot = JSON.stringify(input);
    readMirrorModeContext(input);
    readMirrorModeContext(input);
    readMirrorModeContext(input);
    expect(JSON.stringify(input)).toBe(inputSnapshot);
  });
});

describe("B-2 readMirrorModeContext — autonomous 5 invariant", () => {
  it("11: status / mode / canProceedToMirrorDecision の triple-equivalence", () => {
    // known 経路: status === "known" ⇔ mode !== null ⇔ canProceed === true
    const knownInputs: MirrorModeContextInput[] = [
      { presenceMode: "normal", source: "presence_state" },
      { presenceMode: "daily", source: "explicit_input" },
      { presenceMode: "travel", source: "missing" },
    ];
    for (const input of knownInputs) {
      const r = readMirrorModeContext(input);
      const knownByStatus = r.status === "known";
      const knownByMode = r.mode !== null;
      const knownByProceed = r.canProceedToMirrorDecision === true;
      expect(knownByStatus).toBe(knownByMode);
      expect(knownByMode).toBe(knownByProceed);
      expect(knownByStatus).toBe(knownByProceed);
    }

    // unknown 経路: status === "unknown" ⇔ mode === null ⇔ canProceed === false
    const unknownInputs: MirrorModeContextInput[] = [
      {},
      { presenceMode: null, source: "presence_state" },
      { presenceMode: undefined, source: "explicit_input" },
      { presenceMode: "invalid" as unknown as MirrorModeContextInput["presenceMode"] },
    ];
    for (const input of unknownInputs) {
      const r = readMirrorModeContext(input);
      const unknownByStatus = r.status === "unknown";
      const unknownByMode = r.mode === null;
      const unknownByProceed = r.canProceedToMirrorDecision === false;
      expect(unknownByStatus).toBe(unknownByMode);
      expect(unknownByMode).toBe(unknownByProceed);
      expect(unknownByStatus).toBe(unknownByProceed);
    }
  });

  it("12: 出力 shape は厳密 4 fields (status / mode / source / canProceedToMirrorDecision)", () => {
    const inputs: MirrorModeContextInput[] = [
      { presenceMode: "normal", source: "presence_state" },
      { presenceMode: null, source: "presence_state" },
      {},
    ];
    for (const input of inputs) {
      const r = readMirrorModeContext(input);
      const keys = Object.keys(r).sort();
      expect(keys).toEqual(["canProceedToMirrorDecision", "mode", "source", "status"]);
    }
  });

  it("13: input object に対する mutation 一切なし", () => {
    const input: MirrorModeContextInput = { presenceMode: "normal", source: "presence_state" };
    const originalKeys = Object.keys(input);
    const originalPresenceMode = input.presenceMode;
    const originalSource = input.source;

    readMirrorModeContext(input);

    // input の keys / value すべて unchanged
    expect(Object.keys(input)).toEqual(originalKeys);
    expect(input.presenceMode).toBe(originalPresenceMode);
    expect(input.source).toBe(originalSource);
  });

  it("14: idempotent — 同一入力で同一出力 (構造的等価)", () => {
    const input: MirrorModeContextInput = { presenceMode: "daily", source: "presence_state" };
    const r1 = readMirrorModeContext(input);
    const r2 = readMirrorModeContext(input);
    const r3 = readMirrorModeContext(input);
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);

    // unknown 経路も idempotent
    const inputUnknown: MirrorModeContextInput = { presenceMode: null };
    const u1 = readMirrorModeContext(inputUnknown);
    const u2 = readMirrorModeContext(inputUnknown);
    expect(u1).toEqual(u2);
  });

  it("15: 厳密 string match — case / whitespace / 部分一致は unknown", () => {
    const rejectInputs: Array<MirrorModeContextInput["presenceMode"]> = [
      "Normal" as unknown as MirrorModeContextInput["presenceMode"],
      "DAILY" as unknown as MirrorModeContextInput["presenceMode"],
      " travel " as unknown as MirrorModeContextInput["presenceMode"],
      "normal " as unknown as MirrorModeContextInput["presenceMode"],
      " normal" as unknown as MirrorModeContextInput["presenceMode"],
      "" as unknown as MirrorModeContextInput["presenceMode"],
      "normal,daily" as unknown as MirrorModeContextInput["presenceMode"],
      "norma" as unknown as MirrorModeContextInput["presenceMode"],
      "travels" as unknown as MirrorModeContextInput["presenceMode"],
    ];
    for (const presenceMode of rejectInputs) {
      const r = readMirrorModeContext({ presenceMode, source: "presence_state" });
      expect(r.status).toBe("unknown");
      expect(r.mode).toBeNull();
      expect(r.canProceedToMirrorDecision).toBe(false);
    }
  });
});

describe("B-2 readMirrorModeContext — discriminated union narrowing 確認 (型レベル invariant)", () => {
  it("status === 'known' で TypeScript narrowing が機能する (mode が non-null literal type に)", () => {
    const r: MirrorModeContextResult = readMirrorModeContext({
      presenceMode: "normal",
      source: "presence_state",
    });

    if (r.status === "known") {
      // narrowing 後: r.mode は MirrorPresenceMode (non-null) として扱える
      const mode: "normal" | "daily" | "travel" = r.mode;
      expect(mode).toBe("normal");
      // canProceedToMirrorDecision も true literal として narrowing される
      const flag: true = r.canProceedToMirrorDecision;
      expect(flag).toBe(true);
    } else {
      // ここに来てはいけない
      throw new Error("Expected known but got unknown");
    }
  });

  it("status === 'unknown' で mode === null / canProceedToMirrorDecision === false が型保証される", () => {
    const r: MirrorModeContextResult = readMirrorModeContext({
      presenceMode: null,
      source: "presence_state",
    });

    if (r.status === "unknown") {
      const mode: null = r.mode;
      expect(mode).toBeNull();
      const flag: false = r.canProceedToMirrorDecision;
      expect(flag).toBe(false);
    } else {
      throw new Error("Expected unknown but got known");
    }
  });
});
