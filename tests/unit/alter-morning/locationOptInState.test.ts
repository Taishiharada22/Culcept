/**
 * locationOptIn helper unit test (PR B-2d-b Commit 5)
 *
 * CEO/GPT 2026-05-02 PR B-2d-b 規律:
 *   - 4 状態 (not_asked / granted / snoozed / declined) の遷移確認
 *   - SSR-safe (window/localStorage 不在時の defensive default)
 *   - JSON parse 失敗 / schema 不正 → default record fallback
 *   - snoozed expiry (= 7 日後 → not_asked 自動降格)
 *   - localStorage 例外 (quota / private mode) → 黙って無視
 *
 * 14 ケース構成:
 *   #1: SSR (window 不在) → readLocationOptIn() = default not_asked
 *   #2: localStorage 空 → default not_asked
 *   #3: JSON parse 失敗 → default not_asked (defensive)
 *   #4: schema 不正 (state が知らない値) → default
 *   #5: snoozed のとき snoozeUntil 未指定 → default (defensive)
 *   #6: 正常な granted record の round-trip
 *   #7: snoozed 期限内 → effective state = "snoozed"
 *   #8: snoozed 期限切れ → effective state = "not_asked" (降格)
 *   #9: snoozed だが snoozeUntil parse 不能 → "not_asked" (defensive)
 *   #10: markGranted → state="granted" + grantedAt 設定
 *   #11: markDeclined → state="declined"
 *   #12: markSnoozed → state="snoozed" + snoozeUntil = now + 7d
 *   #13: SNOOZE_DURATION_MS = 7 * 24 * 60 * 60 * 1000 (= 7 日)
 *   #14: resetLocationOptIn → localStorage 削除
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// localStorage mock (existing safeLocalStorage.test.ts と同じパターン)
function createMockStorage() {
  const store: Record<string, string> = {};
  return {
    _store: store,
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach((k) => delete store[k]);
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
}

function stubWindow(storage?: ReturnType<typeof createMockStorage>) {
  if (typeof globalThis.window === "undefined") {
    // @ts-expect-error テスト用 stub
    globalThis.window = globalThis;
  }
  if (storage) {
    globalThis.localStorage = storage;
  }
}

function unstubWindow() {
  // @ts-expect-error
  delete globalThis.window;
  // @ts-expect-error
  delete globalThis.localStorage;
}

// fresh import (module cache reset)
async function importFresh() {
  vi.resetModules();
  return await import("@/lib/alter-morning/journey/locationOptIn");
}

beforeEach(() => {
  unstubWindow();
});

afterEach(() => {
  unstubWindow();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #1: SSR (window 不在) → default
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#1] SSR (window/localStorage 不在) → default not_asked", () => {
  it("readLocationOptIn() は SSR 環境で default を返す", async () => {
    // window/localStorage を stub せずに直接 import
    const { readLocationOptIn } = await importFresh();
    const record = readLocationOptIn();
    expect(record.state).toBe("not_asked");
    expect(record.snoozeUntil).toBeUndefined();
  });

  it("writeLocationOptIn() は SSR 環境で何もしない (例外 throw もしない)", async () => {
    const { writeLocationOptIn } = await importFresh();
    expect(() =>
      writeLocationOptIn({ state: "granted" }),
    ).not.toThrow();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #2: localStorage 空 → default
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#2] localStorage 空 → default not_asked", () => {
  it("空の localStorage から読むと default", async () => {
    const storage = createMockStorage();
    stubWindow(storage);
    const { readLocationOptIn } = await importFresh();
    const record = readLocationOptIn();
    expect(record.state).toBe("not_asked");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #3: JSON parse 失敗 → default
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#3] JSON parse 失敗 → default (defensive)", () => {
  it("不正な JSON が保存されている場合、default を返す", async () => {
    const storage = createMockStorage();
    storage._store["aneurasync.location-opt-in.v1"] = "{not valid json";
    stubWindow(storage);
    const { readLocationOptIn } = await importFresh();
    const record = readLocationOptIn();
    expect(record.state).toBe("not_asked");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #4: schema 不正 → default
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#4] schema 不正 (state が知らない値) → default", () => {
  it("state が無効な値だと default を返す", async () => {
    const storage = createMockStorage();
    storage._store["aneurasync.location-opt-in.v1"] = JSON.stringify({
      state: "unknown_state",
      updatedAt: new Date().toISOString(),
    });
    stubWindow(storage);
    const { readLocationOptIn } = await importFresh();
    const record = readLocationOptIn();
    expect(record.state).toBe("not_asked");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #5: snoozed のとき snoozeUntil 未指定 → default
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#5] snoozed state なのに snoozeUntil 未指定 → default (defensive)", () => {
  it("snoozed state で snoozeUntil 不在 → default", async () => {
    const storage = createMockStorage();
    storage._store["aneurasync.location-opt-in.v1"] = JSON.stringify({
      state: "snoozed",
      // snoozeUntil なし
      updatedAt: new Date().toISOString(),
    });
    stubWindow(storage);
    const { readLocationOptIn } = await importFresh();
    const record = readLocationOptIn();
    expect(record.state).toBe("not_asked");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #6: 正常な granted record の round-trip
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#6] 正常な granted record の round-trip (write → read)", () => {
  it("write した内容が read で復元される", async () => {
    const storage = createMockStorage();
    stubWindow(storage);
    const { writeLocationOptIn, readLocationOptIn } = await importFresh();

    writeLocationOptIn({
      state: "granted",
      grantedAt: "2026-05-02T00:00:00.000Z",
    });

    const read = readLocationOptIn();
    expect(read.state).toBe("granted");
    expect(read.grantedAt).toBe("2026-05-02T00:00:00.000Z");
    // updatedAt は writeLocationOptIn で自動上書き
    expect(typeof read.updatedAt).toBe("string");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #7-#9: getEffectiveOptInState (snooze expiry)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#7] snoozed 期限内 → effective state = snoozed", () => {
  it("now < snoozeUntil なら snoozed のまま", async () => {
    const { getEffectiveOptInState } = await importFresh();
    const now = Date.parse("2026-05-02T00:00:00.000Z");
    const snoozeUntil = "2026-05-09T00:00:00.000Z"; // +7d
    const effective = getEffectiveOptInState(
      {
        state: "snoozed",
        snoozeUntil,
        updatedAt: "2026-05-02T00:00:00.000Z",
      },
      now,
    );
    expect(effective).toBe("snoozed");
  });
});

describe("[#8] snoozed 期限切れ → effective state = not_asked (降格)", () => {
  it("now >= snoozeUntil なら not_asked に降格", async () => {
    const { getEffectiveOptInState } = await importFresh();
    const snoozeUntil = "2026-05-02T00:00:00.000Z";
    const nowAfter = Date.parse("2026-05-09T00:00:01.000Z"); // 7d + 1s 後
    const effective = getEffectiveOptInState(
      {
        state: "snoozed",
        snoozeUntil,
        updatedAt: "2026-05-02T00:00:00.000Z",
      },
      nowAfter,
    );
    expect(effective).toBe("not_asked");
  });
});

describe("[#9] snoozed だが snoozeUntil parse 不能 → not_asked (defensive)", () => {
  it("snoozeUntil が不正な ISO string → not_asked", async () => {
    const { getEffectiveOptInState } = await importFresh();
    const effective = getEffectiveOptInState({
      state: "snoozed",
      snoozeUntil: "not a valid date",
      updatedAt: "2026-05-02T00:00:00.000Z",
    });
    expect(effective).toBe("not_asked");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #10-#12: state transition helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#10] markGranted → state=granted + grantedAt 設定", () => {
  it("「使う」成功時の遷移", async () => {
    const storage = createMockStorage();
    stubWindow(storage);
    const { markGranted, readLocationOptIn } = await importFresh();
    const now = Date.parse("2026-05-02T12:00:00.000Z");
    markGranted(now);
    const record = readLocationOptIn();
    expect(record.state).toBe("granted");
    expect(record.grantedAt).toBe("2026-05-02T12:00:00.000Z");
  });
});

describe("[#11] markDeclined → state=declined", () => {
  it("PERMISSION_DENIED 時の遷移", async () => {
    const storage = createMockStorage();
    stubWindow(storage);
    const { markDeclined, readLocationOptIn } = await importFresh();
    markDeclined();
    const record = readLocationOptIn();
    expect(record.state).toBe("declined");
  });
});

describe("[#12] markSnoozed → state=snoozed + snoozeUntil = now + 7d", () => {
  it("「あとで」押下時の遷移", async () => {
    const storage = createMockStorage();
    stubWindow(storage);
    const { markSnoozed, readLocationOptIn, SNOOZE_DURATION_MS } =
      await importFresh();
    const now = Date.parse("2026-05-02T00:00:00.000Z");
    markSnoozed(now);
    const record = readLocationOptIn();
    expect(record.state).toBe("snoozed");
    const snoozeUntilMs = Date.parse(record.snoozeUntil!);
    expect(snoozeUntilMs - now).toBe(SNOOZE_DURATION_MS);
    // = 7 日後 = 2026-05-09T00:00:00.000Z
    expect(record.snoozeUntil).toBe("2026-05-09T00:00:00.000Z");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #13: SNOOZE_DURATION_MS = 7 days
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#13] SNOOZE_DURATION_MS = 7 * 24 * 60 * 60 * 1000", () => {
  it("snooze 期間が 7 日固定", async () => {
    const { SNOOZE_DURATION_MS } = await importFresh();
    expect(SNOOZE_DURATION_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #14: resetLocationOptIn
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#14] resetLocationOptIn → localStorage 削除", () => {
  it("reset 後は default に戻る", async () => {
    const storage = createMockStorage();
    stubWindow(storage);
    const { markGranted, resetLocationOptIn, readLocationOptIn } =
      await importFresh();
    markGranted();
    expect(readLocationOptIn().state).toBe("granted");
    resetLocationOptIn();
    expect(readLocationOptIn().state).toBe("not_asked");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 状態遷移統合 (CEO 規律の核): not_asked → granted → snoozed → declined
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[統合] CEO 規律の状態遷移シーケンス", () => {
  it("not_asked → granted → declined (= browser permission revoke 経路)", async () => {
    const storage = createMockStorage();
    stubWindow(storage);
    const {
      readLocationOptIn,
      markGranted,
      markDeclined,
    } = await importFresh();

    expect(readLocationOptIn().state).toBe("not_asked");
    markGranted();
    expect(readLocationOptIn().state).toBe("granted");
    markDeclined();
    expect(readLocationOptIn().state).toBe("declined");
  });

  it("not_asked →「あとで」→ snoozed → 7d 経過 → not_asked (effective)", async () => {
    const storage = createMockStorage();
    stubWindow(storage);
    const {
      readLocationOptIn,
      markSnoozed,
      getEffectiveOptInState,
    } = await importFresh();

    const now = Date.parse("2026-05-02T00:00:00.000Z");
    markSnoozed(now);
    const record = readLocationOptIn();
    expect(record.state).toBe("snoozed");

    // 期限内 (1日後): snoozed のまま
    const day1 = now + 24 * 60 * 60 * 1000;
    expect(getEffectiveOptInState(record, day1)).toBe("snoozed");

    // 期限切れ (8日後): not_asked に降格
    const day8 = now + 8 * 24 * 60 * 60 * 1000;
    expect(getEffectiveOptInState(record, day8)).toBe("not_asked");
  });
});
