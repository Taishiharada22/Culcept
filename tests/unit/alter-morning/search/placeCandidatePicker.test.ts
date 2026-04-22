/**
 * PlaceCandidatePicker — W3-PR-9 Commit 5b unit tests
 *
 * 検証観点:
 *   - handleCandidateClick: pending 中は onSelect を呼ばない（再クリック禁止）
 *   - handleCandidateClick: pending=false なら placeId のみを onSelect に渡す
 *   - formatDistance: 1000m 未満は m、以上は km
 *
 * Note:
 *   Component 自体の DOM レンダリング検証は jsdom 未導入のため行わない。
 *   代わりに click 動作と距離フォーマットの純関数だけ厳密に検証する。
 *   視覚レイアウトの regression は 5c の AlterClient 統合 + 手動確認でカバー。
 */

import { describe, expect, it, vi } from "vitest";
import {
  formatDistance,
  handleCandidateClick,
} from "@/components/alter-morning/PlaceCandidatePicker";

describe("handleCandidateClick", () => {
  it("pending=false: onSelect に placeId のみを渡す", () => {
    const onSelect = vi.fn();
    const result = handleCandidateClick("p_abc", {
      pending: false,
      onSelect,
    });

    expect(result).toEqual({ dispatched: true });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("p_abc");
  });

  it("pending=true: onSelect を呼ばない（再クリック禁止）", () => {
    const onSelect = vi.fn();
    const result = handleCandidateClick("p_abc", {
      pending: true,
      onSelect,
    });

    expect(result).toEqual({ dispatched: false });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("pending flag の切替で独立して動作する", () => {
    const onSelect = vi.fn();
    handleCandidateClick("p1", { pending: false, onSelect });
    handleCandidateClick("p2", { pending: true, onSelect });
    handleCandidateClick("p3", { pending: false, onSelect });

    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenNthCalledWith(1, "p1");
    expect(onSelect).toHaveBeenNthCalledWith(2, "p3");
  });
});

describe("formatDistance", () => {
  it("null → null", () => {
    expect(formatDistance(null)).toBe(null);
  });

  it("0m", () => {
    expect(formatDistance(0)).toBe("0m");
  });

  it("1000m 未満 → m 表記（四捨五入）", () => {
    expect(formatDistance(320)).toBe("320m");
    expect(formatDistance(999)).toBe("999m");
    expect(formatDistance(320.6)).toBe("321m");
  });

  it("1000m 以上 → km 表記（小数第1位）", () => {
    expect(formatDistance(1000)).toBe("1.0km");
    expect(formatDistance(1500)).toBe("1.5km");
    expect(formatDistance(12345)).toBe("12.3km");
  });
});
