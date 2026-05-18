/**
 * W1-X2 Edit flow integration tests (Commit 3)
 *
 * 「教える → 教え直す」の end-to-end フローを memory repository で deterministic に固定する。
 *
 * 検証項目:
 *   - 作成 → 更新 → 取得で変更が反映
 *   - 連続編集（複数 update）が正しく重なる
 *   - kind 不変
 *   - 編集中 anchor が他の anchor を巻き込まない
 */

import { describe, it, expect } from "vitest";

import { createMemoryExternalAnchorRepository } from "@/lib/plan/external-anchor-repository-memory";
import type {
  CreateExternalAnchorInput,
  CreateOneOffAnchorInput,
} from "@/lib/plan/external-anchor-input";
import type { CreateExternalAnchorSourceInput } from "@/lib/plan/external-anchor-repository";

const USER_A = "user-A";
const USER_B = "user-B";

function manualSource(): CreateExternalAnchorSourceInput {
  return { sourceType: "manual" };
}

function oneOff(overrides: Partial<CreateOneOffAnchorInput> = {}): CreateExternalAnchorInput {
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

async function createSetup() {
  let seq = 0;
  const repo = createMemoryExternalAnchorRepository({
    idFactory: () => `id-${++seq}`,
    now: () => "2026-05-18T00:00:00.000Z",
  });
  const r = await repo.createSourceWithAnchors(USER_A, {
    source: manualSource(),
    anchors: [
      oneOff({ title: "歯科予約", date: "2026-05-25" }),
      oneOff({ title: "歯医者の検診", date: "2026-06-10" }),
    ],
  });
  if (!r.ok) throw new Error("setup failed");
  return { repo, source: r.source, anchors: r.anchors };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Edit flow — end-to-end", () => {
  it("create → update → list で変更が反映", async () => {
    const { repo, anchors } = await createSetup();
    const target = anchors[0]!;

    const u = await repo.updateAnchor(USER_A, target.id, {
      title: "歯科クリニック",
    });
    expect(u.ok).toBe(true);
    if (u.ok) {
      expect(u.anchor.title).toBe("歯科クリニック");
    }

    const list = await repo.listAnchors(USER_A);
    const found = list.find((a) => a.id === target.id);
    expect(found?.title).toBe("歯科クリニック");
  });

  it("連続編集 (2 回 update) が累積で反映", async () => {
    const { repo, anchors } = await createSetup();
    const target = anchors[0]!;

    await repo.updateAnchor(USER_A, target.id, { title: "A" });
    await repo.updateAnchor(USER_A, target.id, { title: "B", startTime: "16:00" });

    const list = await repo.listAnchors(USER_A);
    const found = list.find((a) => a.id === target.id);
    expect(found?.title).toBe("B");
    expect(found?.startTime).toBe("16:00");
  });

  it("編集対象の anchor 以外は影響を受けない", async () => {
    const { repo, anchors } = await createSetup();
    const target = anchors[0]!;
    const other = anchors[1]!;

    await repo.updateAnchor(USER_A, target.id, { title: "modified" });

    const list = await repo.listAnchors(USER_A);
    const otherFound = list.find((a) => a.id === other.id);
    expect(otherFound?.title).toBe(other.title); // 元のまま
    expect(otherFound?.date).toBe(other.date);
  });

  it("他 user の anchor は更新できない（list でも見えない）", async () => {
    const { repo, anchors } = await createSetup();
    const target = anchors[0]!;

    const u = await repo.updateAnchor(USER_B, target.id, { title: "STEAL" });
    expect(u).toEqual({ ok: false, kind: "not_found" });

    // user A の list で title は元のまま
    const list = await repo.listAnchors(USER_A);
    const found = list.find((a) => a.id === target.id);
    expect(found?.title).toBe("歯科予約");
  });

  it("kind を recurring に変更しようとしても one_off のまま", async () => {
    const { repo, anchors } = await createSetup();
    const target = anchors[0]!;
    expect(target.anchorKind).toBe("one_off");

    const u = await repo.updateAnchor(USER_A, target.id, {
      anchorKind: "recurring",
      validFrom: "2026-06-01",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
    } as Parameters<typeof repo.updateAnchor>[2]);
    expect(u.ok).toBe(true);
    if (u.ok) {
      expect(u.anchor.anchorKind).toBe("one_off");
    }
  });

  it("更新後 source 単位削除でも cascade", async () => {
    const { repo, source, anchors } = await createSetup();
    await repo.updateAnchor(USER_A, anchors[0]!.id, { title: "edited" });

    const del = await repo.deleteSource(USER_A, source.id);
    expect(del.deletedSource).toBe(true);
    expect(del.deletedAnchors).toBe(2);

    const list = await repo.listAnchors(USER_A);
    expect(list).toHaveLength(0);
  });
});
