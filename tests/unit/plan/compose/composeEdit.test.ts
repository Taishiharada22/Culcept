import { describe, it, expect } from "vitest";

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { ComposeDraftState } from "@/lib/plan/compose/composeDraft";
import {
  anchorsToComposeEditable,
  buildEditPatch,
  splitDraftsForSave,
} from "@/lib/plan/compose/composeEdit";

function oneOff(over: Partial<ExternalAnchor> = {}): ExternalAnchor {
  return {
    id: "a1",
    userId: "u1",
    sourceId: "s1",
    title: "会議",
    startTime: "15:00",
    endTime: "16:30",
    rigidity: "hard",
    confirmedAt: "2026-01-01T00:00:00Z",
    anchorKind: "one_off",
    date: "2026-06-02",
    ...over,
  } as ExternalAnchor;
}

function placedEdit(
  over: Partial<ComposeDraftState> & { editingAnchorId?: string } = {},
): ComposeDraftState {
  return {
    id: "edit-a1",
    core: { title: "会議", locationText: "渋谷オフィス", rigidity: "hard" },
    time: { mode: "both", startMin: 900, endMin: 990 },
    placement: {
      status: "placed",
      startMin: 900,
      endMin: 990,
      crossesMidnight: false,
      edgeClamped: false,
    },
    ...over,
  };
}

describe("anchorsToComposeEditable", () => {
  it("anchor → 編集ロード用 {core, startMin, endMin}", () => {
    const m = anchorsToComposeEditable([
      oneOff({ locationText: "渋谷オフィス", locationCategory: "office" }),
    ]);
    expect(m["a1"]).toBeDefined();
    expect(m["a1"].core.title).toBe("会議");
    expect(m["a1"].core.locationText).toBe("渋谷オフィス");
    expect(m["a1"].core.locationCategory).toBe("office");
    expect(m["a1"].core.rigidity).toBe("hard");
    expect(m["a1"].startMin).toBe(900); // 15:00
    expect(m["a1"].endMin).toBe(990); // 16:30
  });

  it("end 無は既定長で補完、不正時刻はスキップ", () => {
    const m = anchorsToComposeEditable([
      oneOff({ id: "b", endTime: undefined as unknown as string, startTime: "09:00" }),
      oneOff({ id: "bad", startTime: "xx:yy" }),
    ]);
    expect(m["b"].endMin).toBe(600); // 09:00 + 60
    expect(m["bad"]).toBeUndefined();
  });
});

describe("buildEditPatch（PATCH partial・kind/date を含めない）", () => {
  it("編集可能フィールドだけの partial を作る", () => {
    const patch = buildEditPatch(
      placedEdit({
        core: {
          title: "面談",
          locationText: "新宿カフェ",
          rigidity: "soft",
          locationCategory: "cafe",
        },
        editingAnchorId: "a1",
      }),
    );
    expect(patch.title).toBe("面談");
    expect(patch.startTime).toBe("15:00");
    expect(patch.endTime).toBe("16:30");
    expect(patch.locationText).toBe("新宿カフェ");
    expect(patch.locationCategory).toBe("cafe");
    expect(patch.rigidity).toBe("soft");
    // anchorKind / date / sourceType / id は含めない（repo が既存値を保全）
    expect("anchorKind" in patch).toBe(false);
    expect("date" in patch).toBe(false);
    expect("sourceType" in patch).toBe(false);
  });

  it("rigidity 未選択は soft 既定", () => {
    const patch = buildEditPatch(
      placedEdit({ core: { title: "x", locationText: "y", rigidity: "" } }),
    );
    expect(patch.rigidity).toBe("soft");
  });
});

describe("splitDraftsForSave（保存契約安全の核）", () => {
  it("編集(editingAnchorId)= edits、新規= news、未配置は除外", () => {
    const edit = placedEdit({ id: "edit-a1", editingAnchorId: "a1" });
    const fresh = placedEdit({ id: "new-1" }); // editingAnchorId なし
    const unplaced: ComposeDraftState = {
      id: "u1",
      core: { title: "z", locationText: "w", rigidity: "soft" },
      time: { mode: "none" },
      placement: { status: "unplaced" },
    };
    const { edits, news } = splitDraftsForSave([edit, fresh, unplaced]);
    expect(edits.map((d) => d.id)).toEqual(["edit-a1"]);
    expect(news.map((d) => d.id)).toEqual(["new-1"]);
    // **編集 draft は news に絶対入らない**（= POST されない＝重複作成なし）
    expect(news.some((d) => d.editingAnchorId)).toBe(false);
  });

  it("編集 draft のみなら news は空（新規 POST は走らない）", () => {
    const { edits, news } = splitDraftsForSave([
      placedEdit({ editingAnchorId: "a1" }),
    ]);
    expect(edits).toHaveLength(1);
    expect(news).toHaveLength(0);
  });
});
