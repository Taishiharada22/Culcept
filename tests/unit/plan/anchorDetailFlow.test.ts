/**
 * W1-X5 Detail flow integration tests (Commit 3)
 *
 * 「anchor click → 詳細 modal → 教え直す or 登録元ごと忘れさせる」フローを
 * memory repository + helper の組合せで deterministic に固定する。
 *
 * 検証項目:
 *   - source 単位削除で同 source の他 anchor も消える (cascade)
 *   - 削除影響 summary が件数 + 代表タイトル + 残り件数を正しく算出
 *   - 他 source の anchor は影響を受けない (isolation)
 *   - 削除後、対象 source の anchor は memory に存在しない
 */

import { describe, it, expect } from "vitest";

import { createMemoryExternalAnchorRepository } from "@/lib/plan/external-anchor-repository-memory";
import { buildDeleteImpactSummary } from "@/lib/plan/anchor-detail-format";
import type {
  CreateExternalAnchorInput,
  CreateOneOffAnchorInput,
} from "@/lib/plan/external-anchor-input";
import type { CreateExternalAnchorSourceInput } from "@/lib/plan/external-anchor-repository";

const USER_A = "user-A";

function manualSource(): CreateExternalAnchorSourceInput {
  return { sourceType: "manual" };
}

function oneOff(
  overrides: Partial<CreateOneOffAnchorInput> = {}
): CreateExternalAnchorInput {
  return {
    anchorKind: "one_off",
    title: "歯科予約",
    date: "2026-05-25",
    startTime: "14:30",
    rigidity: "hard",
    sourceType: "manual",
    ...overrides,
  };
}

async function createTwoSources() {
  let seq = 0;
  const repo = createMemoryExternalAnchorRepository({
    idFactory: () => `id-${++seq}`,
    now: () => "2026-05-19T00:00:00.000Z",
  });
  // source-1: 歯科関係 3 件
  const s1 = await repo.createSourceWithAnchors(USER_A, {
    source: manualSource(),
    anchors: [
      oneOff({ title: "歯科予約", date: "2026-05-25" }),
      oneOff({ title: "歯科予約", date: "2026-06-10" }),
      oneOff({ title: "歯科の検診", date: "2026-07-15" }),
    ],
  });
  if (!s1.ok) throw new Error("setup s1 failed");
  // source-2: 別件 1 件
  const s2 = await repo.createSourceWithAnchors(USER_A, {
    source: manualSource(),
    anchors: [oneOff({ title: "美容院", date: "2026-08-01" })],
  });
  if (!s2.ok) throw new Error("setup s2 failed");
  return { repo, s1, s2 };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Detail → source 単位削除 — end-to-end", () => {
  it("source 単位削除で同 source の anchor 3 件が cascade で消える", async () => {
    const { repo, s1 } = await createTwoSources();

    const del = await repo.deleteSource(USER_A, s1.source.id);
    expect(del.deletedSource).toBe(true);
    expect(del.deletedAnchors).toBe(3);

    // 削除後の listAnchors で s1 の anchor 3 件は存在しない
    const remaining = await repo.listAnchors(USER_A);
    const sourceIds = remaining.map((a) => a.sourceId);
    expect(sourceIds).not.toContain(s1.source.id);
  });

  it("他 source の anchor は影響を受けない (isolation)", async () => {
    const { repo, s1, s2 } = await createTwoSources();

    await repo.deleteSource(USER_A, s1.source.id);
    const remaining = await repo.listAnchors(USER_A);

    // s2 の anchor は残っている
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.sourceId).toBe(s2.source.id);
    expect(remaining[0]?.title).toBe("美容院");
  });

  it("削除影響 summary: 件数 + 代表 unique titles + 残り 件数", async () => {
    const { s1 } = await createTwoSources();
    // 全 anchor を取得（実環境では PlanClient で list 全部を渡す）
    const allAnchors = [
      ...s1.anchors,
      // s2 は影響範囲外なので不要、s1 のみで build
    ];
    const summary = buildDeleteImpactSummary(allAnchors, s1.source.id);
    expect(summary.totalCount).toBe(3);
    expect(summary.representativeTitles).toEqual([
      "歯科予約", // 1 件目 (重複 silent dedup)
      "歯科の検診", // 2 件目
    ]);
    // 3 件中 representative limit 3 件まで表示可能だが unique=2 で remaining=1
    // 算出: max(0, totalCount - displayedAnchorCount) = max(0, 3 - 3) = 0
    expect(summary.remaining).toBe(0);
  });

  it("source 内 anchor 数 > REPRESENTATIVE_LIMIT (3) の場合の remaining", async () => {
    let seq = 0;
    const repo = createMemoryExternalAnchorRepository({
      idFactory: () => `id-${++seq}`,
      now: () => "2026-05-19T00:00:00.000Z",
    });
    const r = await repo.createSourceWithAnchors(USER_A, {
      source: manualSource(),
      anchors: [
        oneOff({ title: "A", date: "2026-05-01" }),
        oneOff({ title: "B", date: "2026-05-02" }),
        oneOff({ title: "C", date: "2026-05-03" }),
        oneOff({ title: "D", date: "2026-05-04" }),
        oneOff({ title: "E", date: "2026-05-05" }),
      ],
    });
    if (!r.ok) throw new Error("setup failed");

    const summary = buildDeleteImpactSummary(r.anchors, r.source.id);
    expect(summary.totalCount).toBe(5);
    // unique title 上限 3 = ["A", "B", "C"]
    expect(summary.representativeTitles).toEqual(["A", "B", "C"]);
    // 5 件中 3 件表示、残り 2 件
    expect(summary.remaining).toBe(2);
  });

  it("anchor が source に紐づかない (nonexistent sourceId) → summary 0 件", async () => {
    const { s1 } = await createTwoSources();
    const summary = buildDeleteImpactSummary(s1.anchors, "nonexistent");
    expect(summary.totalCount).toBe(0);
    expect(summary.representativeTitles).toEqual([]);
    expect(summary.remaining).toBe(0);
  });
});
