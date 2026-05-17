/**
 * ExternalAnchor Integration-Style Flow Tests (Wave 1 / W1-4pre-4)
 *
 * 既存部品の接続確認 — 新規本体実装はゼロ。
 *   - W1-4pre-1: validateCreateExternalAnchorInput
 *   - W1-4pre-2: buildCreateRecurringAnchorFromTemplate
 *   - W1-4pre-3 + 3b: createMemoryExternalAnchorRepository
 *
 * 単体 unit test では検出できない「接続部の問題」を見つけるための
 * integration-style テスト。実用ユーザー物語として書き、後の開発者が
 * Plan 仕様を test だけから読み解けるようにする。
 *
 * 設計書: docs/alter-plan-foundation-design.md §2.0, §2.1, §4, §11, §12
 *
 * 含めない（W1-4pre-4 範囲外）:
 *   - 新規本体実装（実装を増やすなら別 commit で W1-4pre-3 漏れとして戻す）
 *   - API route / Supabase client / DB insert / UI
 *   - Plan 画面接続 / Home 変更 / localStorage / Document Import
 *   - production env 参照
 */

import { describe, it, expect } from "vitest";

import { validateCreateExternalAnchorInput } from "@/lib/plan/external-anchor-input";
import { buildCreateRecurringAnchorFromTemplate } from "@/lib/plan/weekday-template";
import { createMemoryExternalAnchorRepository } from "@/lib/plan/external-anchor-repository-memory";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Shared deterministic clock / id factory
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const FIXED_NOW = "2026-04-30T12:00:00.000Z";

function makeIdSequence(prefix = "id"): () => string {
  let i = 0;
  return () => `${prefix}-${++i}`;
}

function makeRepo() {
  return createMemoryExternalAnchorRepository({
    idFactory: makeIdSequence(),
    now: () => FIXED_NOW,
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenario 1: 学生が「歯科予約」を手動入力して保存できる
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Scenario 1 — manual one_off flow（手動入力フロー）", () => {
  it("学生が歯科予約 5/10 14:30 を手動入力 → validate → 保存 → list で取得できる", async () => {
    const repo = makeRepo();
    const userId = "user-student";

    // Step 1: 手動入力（API 層から渡される unknown 想定）
    const rawInput = {
      anchorKind: "one_off",
      title: "歯科予約",
      date: "2026-05-10",
      startTime: "14:30",
      endTime: "15:30",
      locationText: "○○歯科",
      rigidity: "hard",
      sourceType: "manual",
    };

    // Step 2: validation
    const validated = validateCreateExternalAnchorInput(rawInput);
    expect(validated.valid).toBe(true);
    if (!validated.valid) return;

    // Step 3: bundle 保存
    const saved = await repo.createSourceWithAnchors(userId, {
      source: { sourceType: "manual" },
      anchors: [validated.input],
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    // Step 4: 補完された field の確認
    expect(saved.source.sourceType).toBe("manual");
    expect(saved.source.userId).toBe(userId);
    expect(saved.source.capturedAt).toBe(FIXED_NOW);
    expect(saved.source.rawRetention).toBe("discarded");
    expect(saved.anchors).toHaveLength(1);
    expect(saved.anchors[0].anchorKind).toBe("one_off");
    expect(saved.anchors[0].sourceId).toBe(saved.source.id);
    expect(saved.anchors[0].confirmedAt).toBe(FIXED_NOW);

    // Step 5: list で取得
    const anchors = await repo.listAnchors(userId);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].title).toBe("歯科予約");
    if (anchors[0].anchorKind === "one_off") {
      // discriminated union が list 結果まで narrow される
      expect(anchors[0].date).toBe("2026-05-10");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenario 2: 「平日 9-18 仕事」を weekday template で保存
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Scenario 2 — weekday template recurring flow（平日テンプレート）", () => {
  it("『平日 9-18 仕事』が template → RRULE → recurring anchor として保存される", async () => {
    const repo = makeRepo();
    const userId = "user-worker";

    // Step 1: template input
    const rawTemplate = {
      days: ["MO", "TU", "WE", "TH", "FR"],
      title: "仕事",
      startTime: "09:00",
      endTime: "18:00",
      validFrom: "2026-04-01",
      rigidity: "hard" as const,
    };

    // Step 2: template builder（内部で W1-4pre-1 の validate も呼ばれる）
    const built = buildCreateRecurringAnchorFromTemplate(rawTemplate);
    expect(built.valid).toBe(true);
    if (!built.valid) return;

    expect(built.input.recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");

    // Step 3: bundle 保存（source は template 由来）
    const saved = await repo.createSourceWithAnchors(userId, {
      source: { sourceType: "template" },
      anchors: [built.input],
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    // Step 4: 保存結果の検証
    expect(saved.source.sourceType).toBe("template");
    expect(saved.anchors[0].anchorKind).toBe("recurring");
    if (saved.anchors[0].anchorKind === "recurring") {
      expect(saved.anchors[0].recurrenceRule).toBe(
        "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
      );
      expect(saved.anchors[0].validFrom).toBe("2026-04-01");
    }
    // RRULE に時刻は埋め込まれない（startTime/endTime は別 field 管理）
    if (saved.anchors[0].anchorKind === "recurring") {
      expect(saved.anchors[0].recurrenceRule).not.toContain("BYHOUR");
      expect(saved.anchors[0].recurrenceRule).not.toContain("BYMINUTE");
      expect(saved.anchors[0].recurrenceRule).not.toContain("UNTIL");
    }
    expect(saved.anchors[0].startTime).toBe("09:00");
    expect(saved.anchors[0].endTime).toBe("18:00");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenario 3: source 1 件から複数 anchors を作る（PDF / 時間割の将来用途）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Scenario 3 — source + multiple anchors bundle", () => {
  it("1 source（manual）から 3 個の anchors が同一 sourceId で保存される", async () => {
    const repo = makeRepo();
    const userId = "user-multi";

    const saved = await repo.createSourceWithAnchors(userId, {
      source: { sourceType: "manual" },
      anchors: [
        {
          anchorKind: "one_off",
          title: "予約 A",
          date: "2026-05-10",
          startTime: "10:00",
          rigidity: "hard",
          sourceType: "manual",
        },
        {
          anchorKind: "one_off",
          title: "予約 B",
          date: "2026-05-11",
          startTime: "11:00",
          rigidity: "hard",
          sourceType: "manual",
        },
        {
          anchorKind: "one_off",
          title: "予約 C",
          date: "2026-05-12",
          startTime: "12:00",
          rigidity: "hard",
          sourceType: "manual",
        },
      ],
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    expect(saved.anchors).toHaveLength(3);

    // 全 anchor が同じ source を参照
    for (const a of saved.anchors) {
      expect(a.sourceId).toBe(saved.source.id);
      expect(a.userId).toBe(userId);
    }

    expect(await repo.listSources(userId)).toHaveLength(1);
    expect(await repo.listAnchors(userId)).toHaveLength(3);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenario 4: invalid bundle atomic reject（DB transaction の代替）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Scenario 4 — invalid bundle atomic reject", () => {
  it("bundle 内 1 件 invalid → 全体未投入（source も anchor も list 空）", async () => {
    const repo = makeRepo();
    const userId = "user-atomic";

    const saved = await repo.createSourceWithAnchors(userId, {
      source: { sourceType: "manual" },
      anchors: [
        {
          anchorKind: "one_off",
          title: "valid 1",
          date: "2026-05-10",
          startTime: "09:00",
          rigidity: "hard",
          sourceType: "manual",
        },
        {
          anchorKind: "one_off",
          title: "", // invalid: title 空
          date: "2026-05-11",
          startTime: "10:00",
          rigidity: "hard",
          sourceType: "manual",
        },
        {
          anchorKind: "one_off",
          title: "valid 2",
          date: "2026-05-12",
          startTime: "11:00",
          rigidity: "hard",
          sourceType: "manual",
        },
      ],
    });
    expect(saved.ok).toBe(false);

    // 1 件 invalid なら全体 reject、store は空のまま
    expect(await repo.listSources(userId)).toEqual([]);
    expect(await repo.listAnchors(userId)).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenario 5: delete cascade（source 削除 → anchors も消える）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Scenario 5 — delete cascade", () => {
  it("manual one_off bundle 作成 → deleteSource → source も anchor も消える", async () => {
    const repo = makeRepo();
    const userId = "user-delete";

    const saved = await repo.createSourceWithAnchors(userId, {
      source: { sourceType: "manual" },
      anchors: [
        {
          anchorKind: "one_off",
          title: "歯科予約",
          date: "2026-05-10",
          startTime: "14:30",
          rigidity: "hard",
          sourceType: "manual",
        },
      ],
    });
    if (!saved.ok) throw new Error("expected ok");

    const result = await repo.deleteSource(userId, saved.source.id);
    expect(result.deletedSource).toBe(true);
    expect(result.deletedAnchors).toBe(1);

    expect(await repo.listSources(userId)).toEqual([]);
    expect(await repo.listAnchors(userId)).toEqual([]);
  });

  it("他 user および存在しない sourceId は同一の no-op 戻り値", async () => {
    const repo = makeRepo();
    const saved = await repo.createSourceWithAnchors("user-A", {
      source: { sourceType: "manual" },
      anchors: [
        {
          anchorKind: "one_off",
          title: "予約",
          date: "2026-05-10",
          startTime: "10:00",
          rigidity: "hard",
          sourceType: "manual",
        },
      ],
    });
    if (!saved.ok) throw new Error("expected ok");

    const fromMismatchedUser = await repo.deleteSource(
      "user-B",
      saved.source.id
    );
    const fromNonExistent = await repo.deleteSource("user-B", "bogus-id");
    expect(fromMismatchedUser).toEqual(fromNonExistent);
    expect(fromMismatchedUser).toEqual({
      deletedSource: false,
      deletedAnchors: 0,
    });
    // user-A のデータは無影響
    expect(await repo.listSources("user-A")).toHaveLength(1);
    expect(await repo.listAnchors("user-A")).toHaveLength(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenario 6: User 分離（cross-user isolation）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Scenario 6 — user 分離（cross-user isolation）", () => {
  it("user-A と user-B が同一 repo 上で独立に持ち、互いに見えない", async () => {
    const repo = makeRepo();

    await repo.createSourceWithAnchors("user-A", {
      source: { sourceType: "manual" },
      anchors: [
        {
          anchorKind: "one_off",
          title: "A の予約",
          date: "2026-05-10",
          startTime: "09:00",
          rigidity: "hard",
          sourceType: "manual",
        },
      ],
    });
    await repo.createSourceWithAnchors("user-B", {
      source: { sourceType: "template" },
      anchors: [
        {
          anchorKind: "recurring",
          title: "B の仕事",
          validFrom: "2026-04-01",
          recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
          startTime: "10:00",
          rigidity: "hard",
          sourceType: "template",
        },
      ],
    });

    const aSources = await repo.listSources("user-A");
    const bSources = await repo.listSources("user-B");
    const aAnchors = await repo.listAnchors("user-A");
    const bAnchors = await repo.listAnchors("user-B");

    expect(aSources).toHaveLength(1);
    expect(bSources).toHaveLength(1);
    expect(aAnchors).toHaveLength(1);
    expect(bAnchors).toHaveLength(1);
    expect(aAnchors[0].title).toBe("A の予約");
    expect(bAnchors[0].title).toBe("B の仕事");
  });

  it("user-A の delete 操作が user-B のデータに影響しない", async () => {
    const repo = makeRepo();
    const aSaved = await repo.createSourceWithAnchors("user-A", {
      source: { sourceType: "manual" },
      anchors: [
        {
          anchorKind: "one_off",
          title: "A",
          date: "2026-05-10",
          startTime: "10:00",
          rigidity: "hard",
          sourceType: "manual",
        },
      ],
    });
    await repo.createSourceWithAnchors("user-B", {
      source: { sourceType: "manual" },
      anchors: [
        {
          anchorKind: "one_off",
          title: "B",
          date: "2026-05-11",
          startTime: "11:00",
          rigidity: "hard",
          sourceType: "manual",
        },
      ],
    });
    if (!aSaved.ok) throw new Error("expected ok");

    await repo.deleteSource("user-A", aSaved.source.id);

    expect(await repo.listAnchors("user-A")).toEqual([]);
    expect(await repo.listAnchors("user-B")).toHaveLength(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenario 7: manual + template mixed catalog
// （自立推論で追加 — discriminated union が list 結果まで narrow される）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Scenario 7 — manual one_off と template recurring の混在カタログ", () => {
  it("同一 user が両方を持ち、list 結果でも discriminated union が narrow される", async () => {
    const repo = makeRepo();
    const userId = "user-mixed";

    // manual one_off
    await repo.createSourceWithAnchors(userId, {
      source: { sourceType: "manual" },
      anchors: [
        {
          anchorKind: "one_off",
          title: "予約",
          date: "2026-05-10",
          startTime: "10:00",
          rigidity: "hard",
          sourceType: "manual",
        },
      ],
    });

    // template recurring
    const built = buildCreateRecurringAnchorFromTemplate({
      days: ["MO", "WE", "FR"],
      title: "ジム",
      startTime: "07:00",
      endTime: "08:00",
      validFrom: "2026-04-01",
      rigidity: "soft",
    });
    if (!built.valid) throw new Error("expected valid template");
    await repo.createSourceWithAnchors(userId, {
      source: { sourceType: "template" },
      anchors: [built.input],
    });

    const anchors = await repo.listAnchors(userId);
    expect(anchors).toHaveLength(2);

    // 各 anchor が discriminated union として正しく narrow される
    const oneOffs = anchors.filter((a) => a.anchorKind === "one_off");
    const recurrings = anchors.filter((a) => a.anchorKind === "recurring");
    expect(oneOffs).toHaveLength(1);
    expect(recurrings).toHaveLength(1);
    if (oneOffs[0].anchorKind === "one_off") {
      expect(oneOffs[0].date).toBe("2026-05-10");
    }
    if (recurrings[0].anchorKind === "recurring") {
      expect(recurrings[0].recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenario 8: canonical 化が repository まで届く
// （W1-4pre-2 の出力が W1-4pre-3 で乱されない確認）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Scenario 8 — weekday template の canonical 化が保存層まで保たれる", () => {
  it("入力 ['FR','MO','WE'] → 保存後 recurrenceRule は 'FREQ=WEEKLY;BYDAY=MO,WE,FR'", async () => {
    const repo = makeRepo();
    const userId = "user-canonical";

    const built = buildCreateRecurringAnchorFromTemplate({
      days: ["FR", "MO", "WE"], // 入力は不順
      title: "勉強会",
      startTime: "19:00",
      validFrom: "2026-04-01",
      rigidity: "soft",
    });
    if (!built.valid) throw new Error("expected valid");

    const saved = await repo.createSourceWithAnchors(userId, {
      source: { sourceType: "template" },
      anchors: [built.input],
    });
    if (!saved.ok) throw new Error("expected ok");

    const anchors = await repo.listAnchors(userId);
    expect(anchors).toHaveLength(1);
    if (anchors[0].anchorKind === "recurring") {
      // canonical 順（月曜始まり）で保存されている
      expect(anchors[0].recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR");
    }
  });

  it("重複曜日 ['MO','MO','TU'] → 保存後は 'BYDAY=MO,TU' に正規化", async () => {
    const repo = makeRepo();
    const built = buildCreateRecurringAnchorFromTemplate({
      days: ["MO", "MO", "TU"],
      title: "重複テスト",
      startTime: "09:00",
      validFrom: "2026-04-01",
      rigidity: "soft",
    });
    if (!built.valid) throw new Error("expected valid");

    const saved = await repo.createSourceWithAnchors("user-X", {
      source: { sourceType: "template" },
      anchors: [built.input],
    });
    if (!saved.ok) throw new Error("expected ok");

    const [anchor] = await repo.listAnchors("user-X");
    if (anchor.anchorKind === "recurring") {
      expect(anchor.recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=MO,TU");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenario 9: Full lifecycle（create → list → delete → list = empty）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Scenario 9 — full lifecycle（使い切り）", () => {
  it("create → list（1 件）→ deleteSource → list（空）の完全ループ", async () => {
    const repo = makeRepo();
    const userId = "user-lifecycle";

    // create
    const saved = await repo.createSourceWithAnchors(userId, {
      source: { sourceType: "manual" },
      anchors: [
        {
          anchorKind: "one_off",
          title: "予約",
          date: "2026-05-10",
          startTime: "10:00",
          rigidity: "hard",
          sourceType: "manual",
        },
      ],
    });
    if (!saved.ok) throw new Error("expected ok");

    // list (1 件)
    expect(await repo.listSources(userId)).toHaveLength(1);
    expect(await repo.listAnchors(userId)).toHaveLength(1);

    // delete
    const del = await repo.deleteSource(userId, saved.source.id);
    expect(del.deletedSource).toBe(true);
    expect(del.deletedAnchors).toBe(1);

    // list (空)
    expect(await repo.listSources(userId)).toEqual([]);
    expect(await repo.listAnchors(userId)).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenario 10: Multi-user atomic isolation
// （自立推論で追加 — 一方の bundle invalid が他方に影響しない）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Scenario 10 — multi-user atomic isolation", () => {
  it("user-A の bundle が invalid でも user-B の既存データに影響しない", async () => {
    const repo = makeRepo();

    // user-B が先に valid bundle を保存
    await repo.createSourceWithAnchors("user-B", {
      source: { sourceType: "manual" },
      anchors: [
        {
          anchorKind: "one_off",
          title: "B の予約",
          date: "2026-05-10",
          startTime: "10:00",
          rigidity: "hard",
          sourceType: "manual",
        },
      ],
    });

    // user-A が invalid bundle を投げる（atomic で reject）
    const aResult = await repo.createSourceWithAnchors("user-A", {
      source: { sourceType: "manual" },
      anchors: [
        {
          anchorKind: "one_off",
          title: "", // invalid
          date: "2026-05-11",
          startTime: "10:00",
          rigidity: "hard",
          sourceType: "manual",
        },
      ],
    });
    expect(aResult.ok).toBe(false);

    // user-B のデータは無影響
    expect(await repo.listAnchors("user-B")).toHaveLength(1);
    // user-A は何もない
    expect(await repo.listAnchors("user-A")).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenario 11: 重複登録の許容（W1-3 で「業務判断」とした未解決論点の仕様化）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Scenario 11 — 同一 anchor の重複登録は許容される（unique constraint なし）", () => {
  it("同じ title + date を 2 つの bundle で保存しても両方独立に存在する", async () => {
    const repo = makeRepo();
    const userId = "user-dup";

    const anchor1 = {
      anchorKind: "one_off" as const,
      title: "同じタイトル",
      date: "2026-05-10",
      startTime: "10:00",
      rigidity: "hard" as const,
      sourceType: "manual" as const,
    };
    const anchor2 = { ...anchor1 }; // 完全に同じ内容

    const r1 = await repo.createSourceWithAnchors(userId, {
      source: { sourceType: "manual" },
      anchors: [anchor1],
    });
    const r2 = await repo.createSourceWithAnchors(userId, {
      source: { sourceType: "manual" },
      anchors: [anchor2],
    });

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;

    // 別 source / 別 anchor として 2 件存在
    expect(r1.source.id).not.toBe(r2.source.id);
    expect(r1.anchors[0].id).not.toBe(r2.anchors[0].id);

    expect(await repo.listSources(userId)).toHaveLength(2);
    expect(await repo.listAnchors(userId)).toHaveLength(2);

    // 仕様: 重複検出は API / UI 層で「業務判断」として行う（DB 物理層では許容）
  });
});
