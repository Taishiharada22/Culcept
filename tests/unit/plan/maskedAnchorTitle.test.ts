import { describe, expect, it } from "vitest";

import { maskedAnchorTitle } from "@/app/(culcept)/plan/tabs/_helpers";

describe("maskedAnchorTitle (Slice 1: sensitive title mask)", () => {
  it("sensitiveCategory あり → [ラベル]・生 title を漏らさない", () => {
    expect(maskedAnchorTitle({ sensitiveCategory: "medical", title: "○○クリニック 受診" })).toBe("[医療]");
    expect(maskedAnchorTitle({ sensitiveCategory: "legal", title: "弁護士 面談" })).toBe("[法務]");
    expect(maskedAnchorTitle({ sensitiveCategory: "exam", title: "資格試験 本番" })).toBe("[試験]");
    expect(maskedAnchorTitle({ sensitiveCategory: "other", title: "内緒の用事" })).toBe("[敏感]");
  });
  it("sensitiveCategory なし → 生 title", () => {
    expect(maskedAnchorTitle({ sensitiveCategory: null, title: "ランチ" })).toBe("ランチ");
    expect(maskedAnchorTitle({ title: "カフェ" })).toBe("カフェ");
  });
});
