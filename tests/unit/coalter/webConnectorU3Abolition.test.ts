/**
 * U3 abolition flag 関数の API 契約テスト（Phase 3 以降は残置）。
 *
 * Bug-1 Phase 3（§4.4 actionable-only gate）の実装により、decideSearch は
 * `isU3AbolitionActive` flag を一切参照しなくなった（§6.3 Phase 1: 死コード化）。
 * 本ファイルで残っているのは flag function 自体の契約のみ。
 *
 *  方針:
 *   - flags.ts の `isU3AbolitionActive` / `__setU3AbolitionOverride` は
 *     Phase 2 で物理削除予定。削除時には本ファイルも合わせて廃止する。
 *   - webConnector の挙動（actionable-only gate）は
 *     decideSearchSystemA/B/C/Independence.test.ts でカバーする。
 *   - 旧 §7 Step B の U3 撤廃挙動テスト（flag=ON 時の decideSearch 分岐）は
 *     Phase 3 で dead code path となったため削除済み。
 */

import { describe, it, expect, afterEach } from "vitest";

import {
  __setU3AbolitionOverride,
  isU3AbolitionActive,
} from "@/lib/coalter/flags";

describe("flags: isU3AbolitionActive", () => {
  afterEach(() => {
    __setU3AbolitionOverride(null);
  });

  it("default（override なし）は全 theme false", () => {
    expect(isU3AbolitionActive("food")).toBe(false);
    expect(isU3AbolitionActive("movie")).toBe(false);
    expect(isU3AbolitionActive("travel")).toBe(false);
    expect(isU3AbolitionActive("activity")).toBe(false);
  });

  it("abolishable でない theme は override しても常に false", () => {
    __setU3AbolitionOverride({
      food: true,
      movie: true,
      travel: true,
      activity: true,
    });
    expect(isU3AbolitionActive("schedule")).toBe(false);
    expect(isU3AbolitionActive("gift")).toBe(false);
    expect(isU3AbolitionActive("general")).toBe(false);
    expect(isU3AbolitionActive("unknown")).toBe(false);
  });

  it("override は theme 単位で独立", () => {
    __setU3AbolitionOverride({ food: true });
    expect(isU3AbolitionActive("food")).toBe(true);
    expect(isU3AbolitionActive("movie")).toBe(false);
  });

  it("override=null で env fallback に戻る（default false）", () => {
    __setU3AbolitionOverride({ food: true });
    expect(isU3AbolitionActive("food")).toBe(true);
    __setU3AbolitionOverride(null);
    expect(isU3AbolitionActive("food")).toBe(false);
  });
});
