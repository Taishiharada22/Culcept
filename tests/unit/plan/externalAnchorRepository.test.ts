import { describe, it, expect } from "vitest";

import type {
  CreateExternalAnchorInput,
  CreateOneOffAnchorInput,
  CreateRecurringAnchorInput,
} from "@/lib/plan/external-anchor-input";
import type {
  CreateExternalAnchorSourceInput,
  CreateSourceWithAnchorsInput,
} from "@/lib/plan/external-anchor-repository";
import { createMemoryExternalAnchorRepository } from "@/lib/plan/external-anchor-repository-memory";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const FIXED_NOW = "2026-04-30T12:00:00.000Z";

function makeIdSequence(prefix = "id"): () => string {
  let i = 0;
  return () => `${prefix}-${++i}`;
}

function makeManualSource(
  overrides: Partial<CreateExternalAnchorSourceInput> = {}
): CreateExternalAnchorSourceInput {
  return {
    sourceType: "manual",
    ...overrides,
  };
}

function makeTemplateSource(
  overrides: Partial<CreateExternalAnchorSourceInput> = {}
): CreateExternalAnchorSourceInput {
  return {
    sourceType: "template",
    ...overrides,
  };
}

function makeOneOff(
  overrides: Partial<CreateOneOffAnchorInput> = {}
): CreateOneOffAnchorInput {
  return {
    anchorKind: "one_off",
    title: "歯科予約",
    date: "2026-05-10",
    startTime: "14:30",
    rigidity: "hard",
    sourceType: "manual",
    ...overrides,
  };
}

function makeRecurring(
  overrides: Partial<CreateRecurringAnchorInput> = {}
): CreateRecurringAnchorInput {
  return {
    anchorKind: "recurring",
    title: "週次ミーティング",
    validFrom: "2026-04-01",
    recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
    startTime: "10:00",
    rigidity: "soft",
    sourceType: "template",
    ...overrides,
  };
}

function makeRepo() {
  return createMemoryExternalAnchorRepository({
    idFactory: makeIdSequence(),
    now: () => FIXED_NOW,
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// happy paths
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("createSourceWithAnchors — happy paths", () => {
  it("manual + one_off の bundle を保存できる", async () => {
    const repo = makeRepo();
    const r = await repo.createSourceWithAnchors("user-A", {
      source: makeManualSource(),
      anchors: [makeOneOff()],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source.sourceType).toBe("manual");
      expect(r.anchors).toHaveLength(1);
      expect(r.anchors[0].anchorKind).toBe("one_off");
    }
  });

  it("template + recurring の bundle を保存できる", async () => {
    const repo = makeRepo();
    const r = await repo.createSourceWithAnchors("user-A", {
      source: makeTemplateSource(),
      anchors: [makeRecurring()],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source.sourceType).toBe("template");
      expect(r.anchors).toHaveLength(1);
      expect(r.anchors[0].anchorKind).toBe("recurring");
    }
  });

  it("1 source から 複数 anchor を保存できる", async () => {
    const repo = makeRepo();
    const r = await repo.createSourceWithAnchors("user-A", {
      source: makeManualSource(),
      anchors: [
        makeOneOff({ title: "予約1", date: "2026-05-10" }),
        makeOneOff({ title: "予約2", date: "2026-05-11" }),
        makeOneOff({ title: "予約3", date: "2026-05-12" }),
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.anchors).toHaveLength(3);
      // 全 anchor が同じ source を参照
      for (const a of r.anchors) {
        expect(a.sourceId).toBe(r.source.id);
      }
    }
  });

  it("anchors 空配列でも source 単独で保存できる", async () => {
    const repo = makeRepo();
    const r = await repo.createSourceWithAnchors("user-A", {
      source: makeManualSource(),
      anchors: [],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.anchors).toHaveLength(0);
    }
    const sources = await repo.listSources("user-A");
    expect(sources).toHaveLength(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Field 補完
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Field 補完", () => {
  it("id / userId / sourceId / confirmedAt / capturedAt が補完される", async () => {
    const repo = createMemoryExternalAnchorRepository({
      idFactory: makeIdSequence("u-A"),
      now: () => FIXED_NOW,
    });
    const r = await repo.createSourceWithAnchors("user-A", {
      source: makeManualSource(),
      anchors: [makeOneOff()],
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.source.id).toBe("u-A-1");
    expect(r.source.userId).toBe("user-A");
    expect(r.source.capturedAt).toBe(FIXED_NOW);
    expect(r.anchors[0].id).toBe("u-A-2");
    expect(r.anchors[0].userId).toBe("user-A");
    expect(r.anchors[0].sourceId).toBe("u-A-1");
    expect(r.anchors[0].confirmedAt).toBe(FIXED_NOW);
  });

  it("rawRetention default は 'discarded'", async () => {
    const repo = makeRepo();
    const r = await repo.createSourceWithAnchors("user-A", {
      source: makeManualSource(),
      anchors: [makeOneOff()],
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.source.rawRetention).toBe("discarded");
  });

  it("rawRetention='stored' + path/expiresAt 指定で stored になる", async () => {
    const repo = makeRepo();
    const r = await repo.createSourceWithAnchors("user-A", {
      source: makeManualSource({
        rawRetention: "stored",
        rawStoragePath: "user-A/abc.pdf",
        rawExpiresAt: "2026-06-01T00:00:00.000Z",
      }),
      anchors: [],
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.source.rawRetention).toBe("stored");
    expect(r.source.rawStoragePath).toBe("user-A/abc.pdf");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Atomicity（最重要）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Atomicity — 1 件でも invalid なら全体 reject、store に書き込まない", () => {
  it("anchor 1 件 invalid なら全体 reject + sources / anchors 未投入", async () => {
    const repo = makeRepo();
    const bundle: CreateSourceWithAnchorsInput = {
      source: makeManualSource(),
      anchors: [
        makeOneOff({ title: "valid" }),
        makeOneOff({ title: "" } as CreateOneOffAnchorInput), // invalid
        makeOneOff({ title: "valid2" }),
      ],
    };
    const r = await repo.createSourceWithAnchors("user-A", bundle);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const anchorErr = r.errors.find(
        (e) => e.kind === "anchor_invalid" && e.index === 1
      );
      expect(anchorErr).toBeDefined();
    }
    // store に何も入っていない
    expect(await repo.listSources("user-A")).toEqual([]);
    expect(await repo.listAnchors("user-A")).toEqual([]);
  });

  it("anchor 複数件 invalid なら全部 errors に含まれる", async () => {
    const repo = makeRepo();
    const r = await repo.createSourceWithAnchors("user-A", {
      source: makeManualSource(),
      anchors: [
        makeOneOff({ title: "" } as CreateOneOffAnchorInput),
        makeOneOff({ date: "bad" }),
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("source sourceType 不正なら source_invalid", async () => {
    const repo = makeRepo();
    const r = await repo.createSourceWithAnchors("user-A", {
      source: {
        sourceType: "invalid" as CreateExternalAnchorSourceInput["sourceType"],
      },
      anchors: [makeOneOff()],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const srcErr = r.errors.find((e) => e.kind === "source_invalid");
      expect(srcErr).toBeDefined();
    }
    expect(await repo.listSources("user-A")).toEqual([]);
  });

  it("source rawRetention='stored' で path 欠落なら source_invalid", async () => {
    const repo = makeRepo();
    const r = await repo.createSourceWithAnchors("user-A", {
      source: makeManualSource({ rawRetention: "stored" }),
      anchors: [],
    });
    expect(r.ok).toBe(false);
  });

  it("source rawRetention='discarded' なのに path 指定は source_invalid", async () => {
    const repo = makeRepo();
    const r = await repo.createSourceWithAnchors("user-A", {
      source: makeManualSource({
        rawRetention: "discarded",
        rawStoragePath: "should-not-be-here",
      }),
      anchors: [],
    });
    expect(r.ok).toBe(false);
  });

  it("source も anchor も invalid なら両方 errors", async () => {
    const repo = makeRepo();
    const r = await repo.createSourceWithAnchors("user-A", {
      source: {
        sourceType: "bad" as CreateExternalAnchorSourceInput["sourceType"],
      },
      anchors: [makeOneOff({ title: "" } as CreateOneOffAnchorInput)],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const hasSource = r.errors.some((e) => e.kind === "source_invalid");
      const hasAnchor = r.errors.some((e) => e.kind === "anchor_invalid");
      expect(hasSource).toBe(true);
      expect(hasAnchor).toBe(true);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// User 分離
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("User 分離 — 越境アクセス禁止", () => {
  it("listSources は他 user の source を見せない", async () => {
    const repo = makeRepo();
    await repo.createSourceWithAnchors("user-A", {
      source: makeManualSource(),
      anchors: [makeOneOff()],
    });
    await repo.createSourceWithAnchors("user-B", {
      source: makeManualSource(),
      anchors: [makeOneOff()],
    });
    const aSources = await repo.listSources("user-A");
    const bSources = await repo.listSources("user-B");
    expect(aSources).toHaveLength(1);
    expect(bSources).toHaveLength(1);
    expect(aSources[0].userId).toBe("user-A");
    expect(bSources[0].userId).toBe("user-B");
  });

  it("listAnchors は他 user の anchor を見せない", async () => {
    const repo = makeRepo();
    await repo.createSourceWithAnchors("user-A", {
      source: makeManualSource(),
      anchors: [makeOneOff(), makeOneOff({ date: "2026-05-11" })],
    });
    await repo.createSourceWithAnchors("user-B", {
      source: makeManualSource(),
      anchors: [makeOneOff()],
    });
    const aAnchors = await repo.listAnchors("user-A");
    const bAnchors = await repo.listAnchors("user-B");
    expect(aAnchors).toHaveLength(2);
    expect(bAnchors).toHaveLength(1);
    aAnchors.forEach((a) => expect(a.userId).toBe("user-A"));
    bAnchors.forEach((a) => expect(a.userId).toBe("user-B"));
  });

  it("無関係な userId からは何も見えない", async () => {
    const repo = makeRepo();
    await repo.createSourceWithAnchors("user-A", {
      source: makeManualSource(),
      anchors: [makeOneOff()],
    });
    const otherSources = await repo.listSources("user-X");
    const otherAnchors = await repo.listAnchors("user-X");
    expect(otherSources).toEqual([]);
    expect(otherAnchors).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cascade delete
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("deleteSource — cascade", () => {
  it("source 削除で関連 anchors も消える", async () => {
    const repo = makeRepo();
    const created = await repo.createSourceWithAnchors("user-A", {
      source: makeManualSource(),
      anchors: [
        makeOneOff({ date: "2026-05-10" }),
        makeOneOff({ date: "2026-05-11" }),
        makeOneOff({ date: "2026-05-12" }),
      ],
    });
    if (!created.ok) throw new Error("expected ok");
    const sourceId = created.source.id;

    const { deleted } = await repo.deleteSource("user-A", sourceId);
    expect(deleted).toBe(3);

    expect(await repo.listSources("user-A")).toEqual([]);
    expect(await repo.listAnchors("user-A")).toEqual([]);
  });

  it("削除された anchors の数を正確に返す（anchors 0 のとき deleted=0）", async () => {
    const repo = makeRepo();
    const created = await repo.createSourceWithAnchors("user-A", {
      source: makeManualSource(),
      anchors: [],
    });
    if (!created.ok) throw new Error("expected ok");
    const { deleted } = await repo.deleteSource("user-A", created.source.id);
    expect(deleted).toBe(0);
    expect(await repo.listSources("user-A")).toEqual([]);
  });

  it("他 user の source は削除できない（no-op）", async () => {
    const repo = makeRepo();
    const created = await repo.createSourceWithAnchors("user-A", {
      source: makeManualSource(),
      anchors: [makeOneOff()],
    });
    if (!created.ok) throw new Error("expected ok");

    const { deleted } = await repo.deleteSource("user-B", created.source.id);
    expect(deleted).toBe(0);
    // user-A のデータは残っている
    expect(await repo.listSources("user-A")).toHaveLength(1);
    expect(await repo.listAnchors("user-A")).toHaveLength(1);
  });

  it("不在 sourceId は no-op", async () => {
    const repo = makeRepo();
    const { deleted } = await repo.deleteSource("user-A", "non-existent-id");
    expect(deleted).toBe(0);
  });

  it("複数 source のうち 1 つを削除しても他 source の anchors は残る", async () => {
    const repo = makeRepo();
    const s1 = await repo.createSourceWithAnchors("user-A", {
      source: makeManualSource(),
      anchors: [makeOneOff({ date: "2026-05-10" })],
    });
    const s2 = await repo.createSourceWithAnchors("user-A", {
      source: makeManualSource(),
      anchors: [makeOneOff({ date: "2026-05-11" })],
    });
    if (!s1.ok || !s2.ok) throw new Error("expected ok");

    await repo.deleteSource("user-A", s1.source.id);
    const remainingAnchors = await repo.listAnchors("user-A");
    expect(remainingAnchors).toHaveLength(1);
    expect(remainingAnchors[0].sourceId).toBe(s2.source.id);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// instance 独立性（global singleton 禁止）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Instance 独立性 — global singleton 禁止", () => {
  it("2 つの instance は state を共有しない", async () => {
    const repoA = makeRepo();
    const repoB = makeRepo();

    await repoA.createSourceWithAnchors("user-A", {
      source: makeManualSource(),
      anchors: [makeOneOff()],
    });

    // repoB には何もない
    expect(await repoB.listSources("user-A")).toEqual([]);
    expect(await repoB.listAnchors("user-A")).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 不変条件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("不変条件: throw しない / 入力 mutate しない", () => {
  it("invalid 入力でも throw しない", async () => {
    const repo = makeRepo();
    await expect(
      repo.createSourceWithAnchors("user-A", {
        source: {
          sourceType:
            "bad" as CreateExternalAnchorSourceInput["sourceType"],
        },
        anchors: [makeOneOff({ title: "" } as CreateOneOffAnchorInput)],
      })
    ).resolves.toBeDefined();
  });

  it("入力 source object を mutate しない", async () => {
    const repo = makeRepo();
    const source = makeManualSource();
    const snapshot = JSON.stringify(source);
    await repo.createSourceWithAnchors("user-A", {
      source,
      anchors: [makeOneOff()],
    });
    expect(JSON.stringify(source)).toBe(snapshot);
  });

  it("入力 anchors 配列を mutate しない", async () => {
    const repo = makeRepo();
    const anchors: CreateExternalAnchorInput[] = [makeOneOff()];
    const snapshot = JSON.stringify(anchors);
    await repo.createSourceWithAnchors("user-A", {
      source: makeManualSource(),
      anchors,
    });
    expect(JSON.stringify(anchors)).toBe(snapshot);
  });
});
