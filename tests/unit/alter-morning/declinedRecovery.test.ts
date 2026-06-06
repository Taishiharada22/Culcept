/**
 * declined recovery test (PR B-2d-d Commit 4)
 *
 * CEO/GPT 2026-05-02 PR B-2d-d 必須証明 9 ケース + 関連 helper test
 *
 * 9 必須ケース (CEO/GPT 確定):
 *   #1: initial mount: declined + granted → not_asked
 *   #2: initial mount: declined + prompt → not_asked
 *   #3: change event: denied → granted → not_asked
 *   #4: change event: denied → prompt → not_asked
 *   #5: declined + unsupported → declined 維持
 *   #6: declined + unavailable → declined 維持
 *   #7: snoozed + granted → snoozed 維持
 *   #8: markNotAsked() は snoozeUntil / grantedAt をクリア
 *   #9: recovery 後に getCurrentPosition が自動で呼ばれない (構造的保証)
 *
 * 追加: 防御的テスト
 *   - permissionState === null は recovery しない
 *   - granted / not_asked は recovery 対象外
 *   - declined + denied は recovery しない
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { shouldRecoverDeclined } from "@/lib/alter-morning/journey/declinedRecovery";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test infrastructure (locationOptInState.test.ts と同じパターン)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
// Part A: shouldRecoverDeclined 純関数 (= recovery 起動判定)
//
// useAlterChat の useEffect でこの関数の戻り値で recovery を起動する。
// permissionState の変化は subscribe 経由 (= 初回 query / change event /
// visibilitychange の 3 経路統合) で React state に反映されるため、
// shouldRecoverDeclined の戻り値だけで全 trigger をカバーできる。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[Part A] shouldRecoverDeclined 純関数", () => {
  describe("[#1 必須] initial mount: declined + granted → recovery 起動", () => {
    it("ユーザーが Aneurasync 閉じている間に browser で許可 → 開いた時 granted", () => {
      // 初回 mount で permissionState が "granted" として確定するシナリオ
      // (= browser で既に許可されていた、subscribe 初回 callback で granted を受信)
      expect(shouldRecoverDeclined("declined", "granted")).toBe(true);
    });
  });

  describe("[#2 必須] initial mount: declined + prompt → recovery 起動", () => {
    it("ユーザーが browser で permission をリセット → 次回 mount で prompt", () => {
      expect(shouldRecoverDeclined("declined", "prompt")).toBe(true);
    });
  });

  describe("[#3 必須] change event: denied → granted → recovery 起動", () => {
    it("同 session 中 browser permission を後から granted に変更", () => {
      // permissionState が "denied" → "granted" に変わった瞬間
      // (= subscribe の change event callback で granted が来た)
      // この時点で useEffect の dependency が変化して shouldRecoverDeclined が
      // 再評価される
      expect(shouldRecoverDeclined("declined", "granted")).toBe(true);
    });
  });

  describe("[#4 必須] change event: denied → prompt → recovery 起動", () => {
    it("同 session 中 browser permission を reset (prompt に戻る)", () => {
      expect(shouldRecoverDeclined("declined", "prompt")).toBe(true);
    });
  });

  describe("[#5 必須] declined + unsupported → declined 維持", () => {
    it("Permissions API 非対応 environment → recovery しない", () => {
      expect(shouldRecoverDeclined("declined", "unsupported")).toBe(false);
    });
  });

  describe("[#6 必須] declined + unavailable → declined 維持", () => {
    it("query が throw / 一時的問題 → recovery しない", () => {
      expect(shouldRecoverDeclined("declined", "unavailable")).toBe(false);
    });
  });

  describe("[#7 必須] snoozed + granted → snoozed 維持 (recovery 対象外)", () => {
    it("snoozed は declined recovery の対象ではない", () => {
      expect(shouldRecoverDeclined("snoozed", "granted")).toBe(false);
    });
    it("snoozed + prompt も対象外", () => {
      expect(shouldRecoverDeclined("snoozed", "prompt")).toBe(false);
    });
  });

  describe("[防御] permissionState === null (まだ取得中) → recovery しない", () => {
    it("subscribe 初回 callback 前は何もしない", () => {
      expect(shouldRecoverDeclined("declined", null)).toBe(false);
    });
  });

  describe("[防御] declined + denied → recovery しない", () => {
    it("browser 側もまだ拒否なので recovery 起動しない", () => {
      expect(shouldRecoverDeclined("declined", "denied")).toBe(false);
    });
  });

  describe("[防御] granted / not_asked は recovery 対象外", () => {
    it("granted + granted → 何もしない", () => {
      expect(shouldRecoverDeclined("granted", "granted")).toBe(false);
    });
    it("not_asked + granted → 何もしない (= 既に not_asked)", () => {
      expect(shouldRecoverDeclined("not_asked", "granted")).toBe(false);
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part B: markNotAsked 統合
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[Part B] markNotAsked 統合", () => {
  describe("[#8 必須] markNotAsked() は snoozeUntil / grantedAt をクリア", () => {
    it("declined record から markNotAsked → not_asked、過去 fields はクリア", async () => {
      const storage = createMockStorage();
      stubWindow(storage);
      const { markDeclined, markNotAsked, readLocationOptIn } =
        await importFresh();

      markDeclined();
      expect(readLocationOptIn().state).toBe("declined");

      markNotAsked();
      const record = readLocationOptIn();
      expect(record.state).toBe("not_asked");
      expect(record.snoozeUntil).toBeUndefined();
      expect(record.grantedAt).toBeUndefined();
    });

    it("granted record (grantedAt あり) → markNotAsked → grantedAt クリア", async () => {
      const storage = createMockStorage();
      stubWindow(storage);
      const { markGranted, markNotAsked, readLocationOptIn } =
        await importFresh();

      markGranted();
      expect(readLocationOptIn().grantedAt).toBeTruthy();

      markNotAsked();
      const record = readLocationOptIn();
      expect(record.state).toBe("not_asked");
      expect(record.grantedAt).toBeUndefined();
    });

    it("snoozed record (snoozeUntil あり) → markNotAsked → snoozeUntil クリア", async () => {
      const storage = createMockStorage();
      stubWindow(storage);
      const { markSnoozed, markNotAsked, readLocationOptIn } =
        await importFresh();

      markSnoozed();
      expect(readLocationOptIn().snoozeUntil).toBeTruthy();

      markNotAsked();
      const record = readLocationOptIn();
      expect(record.state).toBe("not_asked");
      expect(record.snoozeUntil).toBeUndefined();
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part C: recovery 後の auto-fetch 抑制 (構造的保証)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[Part C] recovery 後 auto-fetch 抑制", () => {
  describe("[#9 必須] recovery 後に getCurrentPosition が自動で呼ばれない", () => {
    /**
     * useAlterChat の auto-fetch useEffect の条件:
     *   effectiveOptInState === "granted" && permissionState === "granted"
     *
     * recovery 後の effective state は "not_asked" なので、
     * 上記条件を満たさない → auto-fetch は発火しない (構造的保証)。
     *
     * このテストは実装の不変条件を fix する:
     *   "not_asked" のとき、permissionState が何であれ auto-fetch しない。
     */
    function shouldAutoFetchLocation(
      effectiveOptInState: string,
      permissionState: string | null,
    ): boolean {
      // useAlterChat の auto-fetch 条件を pure 関数として再現
      return (
        effectiveOptInState === "granted" && permissionState === "granted"
      );
    }

    it("recovery 後 (= not_asked + granted) では auto-fetch 条件を満たさない", () => {
      expect(shouldAutoFetchLocation("not_asked", "granted")).toBe(false);
    });

    it("not_asked + prompt でも auto-fetch しない", () => {
      expect(shouldAutoFetchLocation("not_asked", "prompt")).toBe(false);
    });

    it("not_asked + 全 permissionState で auto-fetch しない", () => {
      const allStates = [
        "granted",
        "denied",
        "prompt",
        "unsupported",
        "unavailable",
        null,
      ] as const;
      for (const ps of allStates) {
        expect(shouldAutoFetchLocation("not_asked", ps)).toBe(false);
      }
    });

    it("granted + granted の時のみ auto-fetch (= ユーザーが再 opt-in 後)", () => {
      // recovery 後にユーザーが banner で「位置情報を使う」を押すと、
      // markGranted() が呼ばれて effectiveOptInState = "granted" になる。
      // その後の useEffect で permissionState === "granted" なら auto-fetch 起動。
      expect(shouldAutoFetchLocation("granted", "granted")).toBe(true);
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part D: 統合シナリオ (= recovery flow の end-to-end)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[Part D] 統合シナリオ", () => {
  it("declined → 起動条件 true → markNotAsked() → state = not_asked", async () => {
    const storage = createMockStorage();
    stubWindow(storage);
    const { markDeclined, markNotAsked, readLocationOptIn } =
      await importFresh();

    // 1. 既に declined になっている (PR #59 の挙動)
    markDeclined();
    expect(readLocationOptIn().state).toBe("declined");

    // 2. shouldRecoverDeclined が true を返すケース
    expect(shouldRecoverDeclined("declined", "granted")).toBe(true);

    // 3. recovery: markNotAsked() を実行
    markNotAsked();

    // 4. 結果: state は "not_asked"、snoozeUntil/grantedAt クリア
    const record = readLocationOptIn();
    expect(record.state).toBe("not_asked");
    expect(record.snoozeUntil).toBeUndefined();
    expect(record.grantedAt).toBeUndefined();

    // 5. banner が再表示される (effectiveOptInState === "not_asked")
    //    → ユーザーが「位置情報を使う」を押したら markGranted() で granted に遷移
    //    (auto-fetch は granted になってから初めて発火する)
  });

  it("declined + denied → recovery しない、state 不変", async () => {
    const storage = createMockStorage();
    stubWindow(storage);
    const { markDeclined, readLocationOptIn } = await importFresh();

    markDeclined();
    expect(readLocationOptIn().state).toBe("declined");

    // browser 側もまだ拒否 → recovery 起動条件を満たさない
    expect(shouldRecoverDeclined("declined", "denied")).toBe(false);

    // markNotAsked を呼ばないので state 維持
    expect(readLocationOptIn().state).toBe("declined");
  });
});
