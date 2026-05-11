/**
 * D-2-b adjacencyTable 構造 invariant テスト。
 *
 * 検証軸 (mainstream plan §3.3 元 D-3-b / D-2 設計レビュー §3.2):
 *   1. 50 駅収録 (CEO 採用 A1: 主要 50 駅で開始)
 *   2. region 区分: 関東 30 / 関西 15 / 名古屋 5
 *   3. STATION_REGION key set = ADJACENCY_TABLE key set
 *   4. 各駅 neighbors 数: 2-5 (上下限、過剰隣接防止 + min 2)
 *   5. 自己参照禁止 (駅 X の neighbors に X 自身は含まれない)
 *   6. **対称性**: A の neighbors に B が含まれれば、B の neighbors にも A が含まれる
 *   7. **完全 closure**: 各 neighbor が ADJACENCY_TABLE key として存在 (孤立参照禁止)
 *   8. getAdjacentAreas / getAllAreas helper の正確性
 *
 * 注: min neighbors 制約は **2** (元設計案では 3-5、実際の地理 adjacency で
 * 2 個になる駅が 6 駅: 豊洲・阿倍野・四条河原町・元町・高槻・大曽根。これらは
 * 端 cluster で 2 個 closure が妥当、現実性 + 50 駅厳守の両立判断)。
 */

import { describe, it, expect } from "vitest";
import {
  ADJACENCY_TABLE,
  STATION_REGION,
  getAdjacentAreas,
  getAllAreas,
} from "@/lib/coalter/movie/adjacencyTable";

// ═══════════════════════════════════════════════════════════════════════════
// 1. 50 駅収録 (CEO 採用 A1)
// ═══════════════════════════════════════════════════════════════════════════

describe("ADJACENCY_TABLE — 50 駅収録 (CEO 採用 A1)", () => {
  it("ADJACENCY_TABLE key 数 = 50 (主要 50 駅で開始)", () => {
    expect(Object.keys(ADJACENCY_TABLE)).toHaveLength(50);
  });

  it("STATION_REGION key 数 = 50", () => {
    expect(Object.keys(STATION_REGION)).toHaveLength(50);
  });

  it("STATION_REGION key set = ADJACENCY_TABLE key set", () => {
    const adjKeys = new Set(Object.keys(ADJACENCY_TABLE));
    const regionKeys = new Set(Object.keys(STATION_REGION));
    expect(adjKeys).toEqual(regionKeys);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. region 区分 (関東 30 / 関西 15 / 名古屋 5)
// ═══════════════════════════════════════════════════════════════════════════

describe("STATION_REGION — region 区分", () => {
  it("関東 (kanto) = 30 駅", () => {
    const kantoCount = Object.values(STATION_REGION).filter(
      (r) => r === "kanto",
    ).length;
    expect(kantoCount).toBe(30);
  });

  it("関西 (kansai) = 15 駅", () => {
    const kansaiCount = Object.values(STATION_REGION).filter(
      (r) => r === "kansai",
    ).length;
    expect(kansaiCount).toBe(15);
  });

  it("名古屋 (nagoya) = 5 駅", () => {
    const nagoyaCount = Object.values(STATION_REGION).filter(
      (r) => r === "nagoya",
    ).length;
    expect(nagoyaCount).toBe(5);
  });

  it("3 region の合計 = 50", () => {
    const total = Object.values(STATION_REGION).length;
    expect(total).toBe(50);
  });

  it("各 region 値は 'kanto' / 'kansai' / 'nagoya' のみ", () => {
    const validRegions = new Set(["kanto", "kansai", "nagoya"]);
    for (const r of Object.values(STATION_REGION)) {
      expect(validRegions.has(r)).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. 各駅 neighbors 数 (2-5、上下限)
// ═══════════════════════════════════════════════════════════════════════════

describe("ADJACENCY_TABLE — 各駅 neighbors 数 (2-5)", () => {
  it("各駅 neighbors >= 2 (min 制約)", () => {
    for (const [area, neighbors] of Object.entries(ADJACENCY_TABLE)) {
      expect(
        neighbors.length,
        `${area} has only ${neighbors.length} neighbors (min 2 required)`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("各駅 neighbors <= 5 (max 制約、過剰隣接防止)", () => {
    for (const [area, neighbors] of Object.entries(ADJACENCY_TABLE)) {
      expect(
        neighbors.length,
        `${area} has ${neighbors.length} neighbors (max 5)`,
      ).toBeLessThanOrEqual(5);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. 自己参照禁止
// ═══════════════════════════════════════════════════════════════════════════

describe("ADJACENCY_TABLE — 自己参照禁止", () => {
  it("駅 X の neighbors に X 自身が含まれない", () => {
    for (const [area, neighbors] of Object.entries(ADJACENCY_TABLE)) {
      expect(neighbors).not.toContain(area);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. 対称性 (A→B ⟺ B→A)
// ═══════════════════════════════════════════════════════════════════════════

describe("ADJACENCY_TABLE — 対称性 (A→B ⟺ B→A)", () => {
  it("A の neighbors に B が含まれれば、B の neighbors にも A が含まれる", () => {
    const violations: Array<{ from: string; to: string }> = [];
    for (const [from, neighbors] of Object.entries(ADJACENCY_TABLE)) {
      for (const to of neighbors) {
        const reverseNeighbors = ADJACENCY_TABLE[to];
        if (!reverseNeighbors || !reverseNeighbors.includes(from)) {
          violations.push({ from, to });
        }
      }
    }
    expect(
      violations,
      `対称性違反: ${violations.map((v) => `${v.from}→${v.to} (逆方向欠落)`).join(", ")}`,
    ).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. 完全 closure (孤立参照禁止)
// ═══════════════════════════════════════════════════════════════════════════

describe("ADJACENCY_TABLE — 完全 closure (50 駅内に閉じる)", () => {
  it("各 neighbor が ADJACENCY_TABLE の key として存在", () => {
    const allKeys = new Set(Object.keys(ADJACENCY_TABLE));
    const orphans: Array<{ from: string; orphan: string }> = [];
    for (const [from, neighbors] of Object.entries(ADJACENCY_TABLE)) {
      for (const to of neighbors) {
        if (!allKeys.has(to)) {
          orphans.push({ from, orphan: to });
        }
      }
    }
    expect(
      orphans,
      `孤立参照: ${orphans.map((o) => `${o.from}→${o.orphan}`).join(", ")}`,
    ).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. 重複 neighbors 禁止 (同一駅内の neighbors に重複なし)
// ═══════════════════════════════════════════════════════════════════════════

describe("ADJACENCY_TABLE — 各駅 neighbors 重複禁止", () => {
  it("同一駅内の neighbors に重複がない", () => {
    for (const [area, neighbors] of Object.entries(ADJACENCY_TABLE)) {
      const unique = new Set(neighbors);
      expect(unique.size, `${area} に neighbors 重複`).toBe(neighbors.length);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. getAdjacentAreas helper
// ═══════════════════════════════════════════════════════════════════════════

describe("getAdjacentAreas — helper 関数", () => {
  it("存在する area で隣接駅一覧を返す", () => {
    const result = getAdjacentAreas("渋谷");
    expect(result).toEqual(ADJACENCY_TABLE.渋谷);
  });

  it("存在しない area で空配列を返す", () => {
    expect(getAdjacentAreas("存在しない駅")).toEqual([]);
  });

  it("空文字で空配列を返す", () => {
    expect(getAdjacentAreas("")).toEqual([]);
  });

  it("全 50 駅で non-empty array を返す", () => {
    for (const area of Object.keys(ADJACENCY_TABLE)) {
      expect(getAdjacentAreas(area).length).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. getAllAreas helper
// ═══════════════════════════════════════════════════════════════════════════

describe("getAllAreas — helper 関数", () => {
  it("50 駅全部を返す", () => {
    expect(getAllAreas()).toHaveLength(50);
  });

  it("ADJACENCY_TABLE key set と一致", () => {
    expect(new Set(getAllAreas())).toEqual(new Set(Object.keys(ADJACENCY_TABLE)));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. 主要 hub 駅 sanity check (代表的駅の存在確認)
// ═══════════════════════════════════════════════════════════════════════════

describe("ADJACENCY_TABLE — 主要 hub 駅 sanity", () => {
  const requiredKanto = ["渋谷", "新宿", "池袋", "東京", "横浜"];
  const requiredKansai = ["梅田", "難波", "京都", "三宮"];
  const requiredNagoya = ["名古屋"];

  it.each(requiredKanto)("関東 hub: %s が含まれる", (area) => {
    expect(ADJACENCY_TABLE).toHaveProperty(area);
    expect(STATION_REGION[area]).toBe("kanto");
  });

  it.each(requiredKansai)("関西 hub: %s が含まれる", (area) => {
    expect(ADJACENCY_TABLE).toHaveProperty(area);
    expect(STATION_REGION[area]).toBe("kansai");
  });

  it.each(requiredNagoya)("名古屋 hub: %s が含まれる", (area) => {
    expect(ADJACENCY_TABLE).toHaveProperty(area);
    expect(STATION_REGION[area]).toBe("nagoya");
  });
});
