/**
 * CoAlter AOO Phase B B-5a — diagnosticSnapshot invariant test
 *
 * 正本: lib/coalter/mirror/diagnosticSnapshot.ts
 *
 * test 範囲:
 *   - push / get / clear 基本動作
 *   - MAX_ENTRIES 超過時の FIFO drop
 *   - copy returned (caller mutation 不可、内部 store 不変)
 *   - PII firewall (型レベル + entry 構造)
 *   - 初期 state は空
 *   - test isolation via __resetForTest
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  pushDiagnosticEntry,
  getDiagnosticSnapshot,
  getDiagnosticSize,
  clearDiagnostic,
  __resetForTest,
  __getMaxEntriesForTest,
} from "@/lib/coalter/mirror/diagnosticSnapshot";
import { MIRROR_STAY_SILENT_REASON } from "@/lib/coalter/mirror/decisionConstants";
import type { MirrorDiagnosticEntry } from "@/lib/coalter/mirror/types";

function makeEntry(overrides: Partial<MirrorDiagnosticEntry> = {}): MirrorDiagnosticEntry {
  return {
    decision: "STAY_SILENT",
    reason: MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_MODE_CONTEXT,
    ervScore: undefined,
    modeContextStatus: "unknown",
    mode: null,
    alignmentBucket: "unknown",
    uncertaintyBucket: "unknown",
    silenceBudgetBucket: "unknown",
    patternCategoryBucket: "unknown_category",
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("B-5a diagnosticSnapshot — 基本動作", () => {
  beforeEach(() => __resetForTest());

  it("初期 state は空", () => {
    expect(getDiagnosticSize()).toBe(0);
    expect(getDiagnosticSnapshot()).toEqual([]);
  });

  it("push 1 件 → size 1, snapshot に entry 含む", () => {
    const entry = makeEntry();
    pushDiagnosticEntry(entry);
    expect(getDiagnosticSize()).toBe(1);
    const snap = getDiagnosticSnapshot();
    expect(snap.length).toBe(1);
    expect(snap[0]).toEqual(entry);
  });

  it("push 複数 → 順序保持", () => {
    pushDiagnosticEntry(makeEntry({ timestamp: 100 }));
    pushDiagnosticEntry(makeEntry({ timestamp: 200 }));
    pushDiagnosticEntry(makeEntry({ timestamp: 300 }));
    const snap = getDiagnosticSnapshot();
    expect(snap.length).toBe(3);
    expect(snap.map((e) => e.timestamp)).toEqual([100, 200, 300]);
  });

  it("clearDiagnostic で空になる", () => {
    pushDiagnosticEntry(makeEntry());
    pushDiagnosticEntry(makeEntry());
    expect(getDiagnosticSize()).toBe(2);
    clearDiagnostic();
    expect(getDiagnosticSize()).toBe(0);
    expect(getDiagnosticSnapshot()).toEqual([]);
  });
});

describe("B-5a diagnosticSnapshot — FIFO overflow guard (MAX_ENTRIES)", () => {
  beforeEach(() => __resetForTest());

  it("MAX_ENTRIES 超過時に先頭から drop (FIFO)", () => {
    const max = __getMaxEntriesForTest();
    // max + 5 件 push
    for (let i = 0; i < max + 5; i++) {
      pushDiagnosticEntry(makeEntry({ timestamp: i }));
    }
    const snap = getDiagnosticSnapshot();
    expect(snap.length).toBe(max);
    // 古い 5 件 (timestamp 0..4) は drop されている
    expect(snap[0].timestamp).toBe(5);
    expect(snap[snap.length - 1].timestamp).toBe(max + 4);
  });

  it("MAX_ENTRIES ぴったりで drop なし", () => {
    const max = __getMaxEntriesForTest();
    for (let i = 0; i < max; i++) {
      pushDiagnosticEntry(makeEntry({ timestamp: i }));
    }
    expect(getDiagnosticSize()).toBe(max);
  });
});

describe("B-5a diagnosticSnapshot — getSnapshotCopy mutation guard", () => {
  beforeEach(() => __resetForTest());

  it("getSnapshot で返される array は新規 (caller mutation で store 不変)", () => {
    pushDiagnosticEntry(makeEntry({ timestamp: 100 }));
    const snap1 = getDiagnosticSnapshot();
    // caller が配列を変更しようとする (TypeScript では readonly なので runtime のみ)
    (snap1 as MirrorDiagnosticEntry[]).push(makeEntry({ timestamp: 999 }));
    // 内部 store には影響なし → 次の getSnapshot は元の 1 件のみ
    const snap2 = getDiagnosticSnapshot();
    expect(snap2.length).toBe(1);
    expect(snap2[0].timestamp).toBe(100);
  });

  it("push 後に caller が元の entry object を mutate しても store 内 entry は不変", () => {
    const entry = makeEntry({ timestamp: 100 });
    pushDiagnosticEntry(entry);
    // caller が元 entry を mutate (shallow)
    (entry as unknown as { timestamp: number }).timestamp = 999;
    // 内部 store の entry は元の値を保持
    const snap = getDiagnosticSnapshot();
    expect(snap[0].timestamp).toBe(100);
  });
});

describe("B-5a diagnosticSnapshot — PII firewall", () => {
  beforeEach(() => __resetForTest());

  it("PII を含む extra fields を inject しても output に leak しない", () => {
    const entry = makeEntry({ timestamp: 100 });
    // PII inject (cast 経由、型レベルでは存在しない)
    const entryWithPII = {
      ...entry,
      rawText: "user message leak",
      messageId: "msg_pii",
      userId: "user_pii",
      pairStateId: "pair_pii",
      sessionId: "session_pii",
    } as unknown as MirrorDiagnosticEntry;
    pushDiagnosticEntry(entryWithPII);

    const snap = getDiagnosticSnapshot();
    const json = JSON.stringify(snap);
    for (const sentinel of [
      "user message leak",
      "msg_pii",
      "user_pii",
      "pair_pii",
      "session_pii",
      "rawText",
      "messageId",
      "userId",
      "pairStateId",
      "sessionId",
    ]) {
      expect(json).not.toContain(sentinel);
    }
  });

  it("snapshot entry 出力 shape は 10 field strict", () => {
    pushDiagnosticEntry(makeEntry({ timestamp: 100 }));
    const snap = getDiagnosticSnapshot();
    expect(snap.length).toBe(1);
    const keys = Object.keys(snap[0]).sort();
    expect(keys).toEqual([
      "alignmentBucket",
      "decision",
      "ervScore",
      "mode",
      "modeContextStatus",
      "patternCategoryBucket",
      "reason",
      "silenceBudgetBucket",
      "timestamp",
      "uncertaintyBucket",
    ]);
  });
});

describe("B-5a diagnosticSnapshot — MIRROR_CANDIDATE entry", () => {
  beforeEach(() => __resetForTest());

  it("MIRROR_CANDIDATE entry の ervScore は number", () => {
    pushDiagnosticEntry(
      makeEntry({
        decision: "MIRROR_CANDIDATE",
        reason: "speak_passed",
        ervScore: 0.9,
        modeContextStatus: "known",
        mode: "normal",
        alignmentBucket: "strongly_positive",
        uncertaintyBucket: "low_0_to_30",
        silenceBudgetBucket: "low_0_to_30",
        patternCategoryBucket: "null_pattern",
      }),
    );
    const snap = getDiagnosticSnapshot();
    expect(snap[0].decision).toBe("MIRROR_CANDIDATE");
    expect(snap[0].reason).toBe("speak_passed");
    expect(snap[0].ervScore).toBe(0.9);
  });

  it("STAY_SILENT entry の ervScore は undefined", () => {
    pushDiagnosticEntry(makeEntry({ ervScore: undefined }));
    expect(getDiagnosticSnapshot()[0].ervScore).toBeUndefined();
  });
});
