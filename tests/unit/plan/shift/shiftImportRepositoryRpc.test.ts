import { describe, it, expect } from "vitest";
import { createRpcShiftImportRepository } from "@/lib/plan/shift/shiftImportRepositoryRpc";
import type {
  ShiftImportRpcClient,
  ShiftImportRpcParams,
  ShiftImportRpcResult,
} from "@/lib/plan/shift/shiftImportRpc";
import type { ShiftImportBundleInput } from "@/lib/plan/shift/shiftImportRepository";
import type { CreateExternalAnchorInput } from "@/lib/plan/external-anchor-input";
import type { ShiftDayImportIndicator } from "@/lib/plan/shift/shiftImportAdapter";

function deps() {
  let n = 0;
  return {
    idFactory: () => `id-${(n += 1).toString().padStart(3, "0")}`,
    now: () => "2025-07-15T00:00:00.000Z",
  };
}

/** 呼び出しを記録し、固定結果を返す fake RPC client */
function fakeRpc(result: (p: ShiftImportRpcParams) => ShiftImportRpcResult) {
  const calls: ShiftImportRpcParams[] = [];
  const client: ShiftImportRpcClient = {
    async importShiftRoster(params) {
      calls.push(params);
      return result(params);
    },
  };
  return { client, calls };
}

const JULY: { start: string; endExclusive: string } = {
  start: "2025-07-01",
  endExclusive: "2025-08-01",
};

const ANCHORS: CreateExternalAnchorInput[] = [
  {
    anchorKind: "one_off",
    date: "2025-07-06",
    title: "夜勤",
    startTime: "18:00",
    endTime: "06:45",
    rigidity: "hard",
    sourceType: "shift_image",
  },
];
const INDICATORS: ShiftDayImportIndicator[] = [
  {
    date: "2025-07-03",
    kind: "off",
    label: "公休",
    countsAsPublicHoliday: true,
    rawCode: "H",
    semanticType: "public_holiday",
  },
];
const BUNDLE: ShiftImportBundleInput = {
  source: { originalFilename: "july.png" },
  anchors: ANCHORS,
  dayIndicators: INDICATORS,
  importRange: JULY,
};

describe("RPC ShiftImportRepository — conflict-safe replace contract", () => {
  it("ok: range-replace + insert 成功 → summary 透過、records は sourceId で再構成、params 正しい", async () => {
    const { client, calls } = fakeRpc((p) => ({
      status: "ok",
      summary: {
        sourceId: "src-1",
        insertedAnchors: p.anchors.length,
        deletedAnchors: 2, // 旧 shift_image を置換した想定
        insertedIndicators: p.indicators.length,
        deletedIndicators: 3,
        conflicts: [],
      },
    }));
    const repo = createRpcShiftImportRepository(client, deps());
    const r = await repo.saveShiftImportBundle("user-1", BUNDLE);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary.sourceId).toBe("src-1");
    expect(r.summary.deletedAnchors).toBe(2); // replace の削除数を summary が運ぶ
    expect(r.summary.deletedIndicators).toBe(3);
    expect(r.anchors.every((a) => a.sourceId === "src-1")).toBe(true);
    // RPC は importRange + 正しい件数で呼ばれた
    expect(calls).toHaveLength(1);
    expect(calls[0].importRange).toEqual(JULY);
    expect(calls[0].anchors).toHaveLength(1);
    expect(calls[0].indicators).toHaveLength(1);
  });

  it("conflict: 手動 day_indicator がある日 → manual_indicator_conflict で保存ブロック（CEO 補正）", async () => {
    const { client } = fakeRpc(() => ({
      status: "conflict",
      dates: ["2025-07-03"],
    }));
    const repo = createRpcShiftImportRepository(client, deps());
    const r = await repo.saveShiftImportBundle("user-1", BUNDLE);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    const conflict = r.errors.find(
      (e) => e.kind === "manual_indicator_conflict"
    );
    expect(conflict).toBeDefined();
    expect(conflict?.kind === "manual_indicator_conflict" && conflict.dates).toEqual([
      "2025-07-03",
    ]);
  });

  it("error: RPC 失敗 → persistence_failed（atomic rollback は関数側）", async () => {
    const { client } = fakeRpc(() => ({ status: "error", message: "db down" }));
    const repo = createRpcShiftImportRepository(client, deps());
    const r = await repo.saveShiftImportBundle("user-1", BUNDLE);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0].kind).toBe("persistence_failed");
  });

  it("invalid anchor → RPC を呼ばずに即 reject", async () => {
    const { client, calls } = fakeRpc(() => ({
      status: "ok",
      summary: {
        sourceId: "x",
        insertedAnchors: 0,
        deletedAnchors: 0,
        insertedIndicators: 0,
        deletedIndicators: 0,
        conflicts: [],
      },
    }));
    const repo = createRpcShiftImportRepository(client, deps());
    const bad: ShiftImportBundleInput = {
      ...BUNDLE,
      anchors: [{ ...ANCHORS[0], startTime: "99:99" } as CreateExternalAnchorInput],
    };
    const r = await repo.saveShiftImportBundle("user-1", bad);
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0); // ★ RPC 未呼び出し
  });

  it("importRange 欠落 → RPC を呼ばずに reject（range-replace の境界が無い）", async () => {
    const { client, calls } = fakeRpc(() => ({
      status: "ok",
      summary: {
        sourceId: "x",
        insertedAnchors: 0,
        deletedAnchors: 0,
        insertedIndicators: 0,
        deletedIndicators: 0,
        conflicts: [],
      },
    }));
    const repo = createRpcShiftImportRepository(client, deps());
    const noRange: ShiftImportBundleInput = {
      source: {},
      anchors: ANCHORS,
      dayIndicators: INDICATORS,
      // importRange なし
    };
    const r = await repo.saveShiftImportBundle("user-1", noRange);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0].kind).toBe("persistence_failed");
    expect(calls).toHaveLength(0);
  });
});
