import { describe, it, expect } from "vitest";

import { classifyActivityIconKey } from "@/lib/plan/compose/activityIcon";

describe("classifyActivityIconKey（内容別アイコン推定）", () => {
  it("keyword で分類", () => {
    expect(classifyActivityIconKey("クライアントミーティング")).toBe("meeting");
    expect(classifyActivityIconKey("チームスタンドアップ")).toBe("meeting");
    expect(classifyActivityIconKey("ランチ")).toBe("food");
    expect(classifyActivityIconKey("ディナー会食")).toBe("food");
    expect(classifyActivityIconKey("ジムでトレーニング")).toBe("fitness");
    expect(classifyActivityIconKey("成田へ移動")).toBe("travel");
    expect(classifyActivityIconKey("企画書の作業")).toBe("work");
  });

  it("未判定・空は generic", () => {
    expect(classifyActivityIconKey("")).toBe("generic");
    expect(classifyActivityIconKey("   ")).toBe("generic");
    expect(classifyActivityIconKey("ねこ")).toBe("generic");
  });
});
