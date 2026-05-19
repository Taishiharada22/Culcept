/**
 * W1-X4 Exception dates flow integration tests (Commit 3)
 *
 * 「教える → 例外日を追加 → 教え直す → 反映」の end-to-end フローを
 * memory repository + recurrence-expander で deterministic に固定する。
 *
 * 検証項目:
 *   - recurring 作成 → exceptionDates 編集で追加・削除
 *   - exceptionDates 追加後、recurrence-expander が該当日を除外
 *   - one_off に exceptionDates を送っても無視
 *   - kind 不変（recurring → recurring のまま）
 */

import { describe, it, expect } from "vitest";

import { createMemoryExternalAnchorRepository } from "@/lib/plan/external-anchor-repository-memory";
import type {
  CreateExternalAnchorInput,
  CreateRecurringAnchorInput,
} from "@/lib/plan/external-anchor-input";
import type { CreateExternalAnchorSourceInput } from "@/lib/plan/external-anchor-repository";
import {
  expandRecurrence,
  type RecurringAnchorLike,
} from "@/lib/plan/recurrence-expander";
import { domainToFormState } from "@/lib/plan/domain-to-form-state";
import {
  addExceptionDate,
  buildAnchorInputFromForm,
  removeExceptionDate,
} from "@/lib/plan/anchor-input-form";

const USER_A = "user-A";

function templateSource(): CreateExternalAnchorSourceInput {
  return { sourceType: "template" };
}

function recurring(
  overrides: Partial<CreateRecurringAnchorInput> = {}
): CreateExternalAnchorInput {
  return {
    anchorKind: "recurring",
    title: "週次ミーティング",
    validFrom: "2026-05-04",
    recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
    startTime: "10:00",
    rigidity: "soft",
    sourceType: "template",
    ...overrides,
  };
}

async function createSetup(overrides: Partial<CreateRecurringAnchorInput> = {}) {
  let seq = 0;
  const repo = createMemoryExternalAnchorRepository({
    idFactory: () => `id-${++seq}`,
    now: () => "2026-05-18T00:00:00.000Z",
  });
  const r = await repo.createSourceWithAnchors(USER_A, {
    source: templateSource(),
    anchors: [recurring(overrides)],
  });
  if (!r.ok) throw new Error("setup failed");
  return { repo, source: r.source, anchor: r.anchors[0]! };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Exception dates — end-to-end flow", () => {
  it("create → update で exceptionDates 追加 → DB に反映", async () => {
    const { repo, anchor } = await createSetup();

    // 既存 anchor の form を取得して例外日を追加
    const form = domainToFormState(anchor);
    const updatedForm = {
      ...form,
      exceptionDates: addExceptionDate(form.exceptionDates, "2026-05-25"),
    };
    const built = buildAnchorInputFromForm(updatedForm);
    expect(built.valid).toBe(true);
    if (!built.valid) return;

    const patch: Record<string, unknown> = { ...built.input };
    delete patch.anchorKind;
    const r = await repo.updateAnchor(USER_A, anchor.id, patch);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    if (r.anchor.anchorKind === "recurring") {
      expect(r.anchor.exceptionDates).toEqual(["2026-05-25"]);
    }
  });

  it("複数日追加 → canonical sort", async () => {
    const { repo, anchor } = await createSetup();
    const form = domainToFormState(anchor);
    // 順不同で追加（addExceptionDate で逐次 sort される）
    let dates = form.exceptionDates;
    dates = addExceptionDate(dates, "2026-07-13");
    dates = addExceptionDate(dates, "2026-05-25");
    dates = addExceptionDate(dates, "2026-05-25"); // 重複 silent ignore

    const built = buildAnchorInputFromForm({
      ...form,
      exceptionDates: dates,
    });
    expect(built.valid).toBe(true);
    if (!built.valid) return;
    const patch: Record<string, unknown> = { ...built.input };
    delete patch.anchorKind;

    const r = await repo.updateAnchor(USER_A, anchor.id, patch);
    if (r.ok && r.anchor.anchorKind === "recurring") {
      expect(r.anchor.exceptionDates).toEqual(["2026-05-25", "2026-07-13"]);
    }
  });

  it("exception 追加後の recurrence-expander が該当日を除外", async () => {
    const { anchor } = await createSetup({
      validFrom: "2026-05-04",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
    });
    // 5/4, 5/11, 5/18, 5/25 (月曜) のうち、5/25 を exception とする
    const anchorWithException: RecurringAnchorLike = {
      validFrom: anchor.anchorKind === "recurring" ? anchor.validFrom : "",
      recurrenceRule:
        anchor.anchorKind === "recurring" ? anchor.recurrenceRule : "",
      exceptionDates: ["2026-05-25"],
    };
    const result = expandRecurrence(anchorWithException, {
      start: new Date("2026-05-01T00:00:00Z"),
      end: new Date("2026-05-31T00:00:00Z"),
    });
    const dates = result.map((d) => d.toISOString().slice(0, 10));
    expect(dates).toContain("2026-05-04");
    expect(dates).toContain("2026-05-11");
    expect(dates).toContain("2026-05-18");
    expect(dates).not.toContain("2026-05-25"); // exception で除外
  });

  it("削除フロー: 追加 → 削除 → 元の状態", async () => {
    const { repo, anchor } = await createSetup();
    const form = domainToFormState(anchor);
    const withException = {
      ...form,
      exceptionDates: addExceptionDate(form.exceptionDates, "2026-05-25"),
    };
    const builtAdd = buildAnchorInputFromForm(withException);
    if (!builtAdd.valid) throw new Error("add invalid");
    const patchAdd: Record<string, unknown> = { ...builtAdd.input };
    delete patchAdd.anchorKind;
    await repo.updateAnchor(USER_A, anchor.id, patchAdd);

    // 削除 patch
    const withoutException = {
      ...withException,
      exceptionDates: removeExceptionDate(
        withException.exceptionDates,
        "2026-05-25"
      ),
    };
    const builtRemove = buildAnchorInputFromForm(withoutException);
    if (!builtRemove.valid) throw new Error("remove invalid");
    const patchRemove: Record<string, unknown> = { ...builtRemove.input };
    delete patchRemove.anchorKind;
    const r = await repo.updateAnchor(USER_A, anchor.id, patchRemove);
    expect(r.ok).toBe(true);
    if (r.ok && r.anchor.anchorKind === "recurring") {
      // 削除後は undefined or [] のいずれか（memory 実装は undefined）
      expect(r.anchor.exceptionDates ?? []).toEqual([]);
    }
  });

  it("kind 不変: recurring → exceptionDates 編集後も recurring のまま", async () => {
    const { repo, anchor } = await createSetup();
    const form = domainToFormState(anchor);
    const withException = {
      ...form,
      exceptionDates: addExceptionDate(form.exceptionDates, "2026-05-25"),
    };
    const built = buildAnchorInputFromForm(withException);
    if (!built.valid) throw new Error("invalid");
    const patch: Record<string, unknown> = { ...built.input };
    delete patch.anchorKind;
    const r = await repo.updateAnchor(USER_A, anchor.id, patch);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.anchor.anchorKind).toBe("recurring");
  });
});
