/**
 * Pre-fill → Validation integration tests (W1-X3 Commit 3)
 *
 * 各 tab からの pre-fill (mergeInitialState 経由) が、ユーザーが残りの欄を
 * 埋めた後で buildAnchorInputFromForm を通して有効な input になるか、
 * 連結した整合性を deterministic に固定する。
 *
 * 目的: 「Calendar / Flow / Map からの pre-fill」と「modal の最終 submit」が
 * 矛盾なく繋がっていることの physical 検証。
 */

import { describe, it, expect } from "vitest";

import {
  type AnchorFormState,
  buildAnchorInputFromForm,
  emptyAnchorFormState,
  mergeInitialState,
} from "@/lib/plan/anchor-input-form";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** pre-fill 後にユーザーが必須を埋める想定で残り欄を補完 */
function fillRemainingMinimum(
  state: AnchorFormState,
  user: Partial<AnchorFormState> = {}
): AnchorFormState {
  return {
    ...state,
    title: user.title ?? "smoke title",
    startTime: user.startTime ?? state.startTime ?? "14:00",
    rigidity: user.rigidity ?? "hard",
    // recurring の必須補完
    selectedWeekdays:
      state.kind === "recurring" && state.selectedWeekdays.length === 0
        ? ["MO"]
        : state.selectedWeekdays,
    validFrom:
      state.kind === "recurring" && !state.validFrom
        ? user.validFrom ?? "2026-05-18"
        : state.validFrom,
    // one_off の必須補完
    date:
      state.kind === "one_off" && !state.date
        ? user.date ?? "2026-05-25"
        : state.date,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Calendar pre-fill → submit", () => {
  it("Calendar cell add (kind:one_off, date) → ユーザー残り欄補完 → valid", () => {
    const initial: Partial<AnchorFormState> = {
      kind: "one_off",
      date: "2026-05-25",
    };
    const prefilled = mergeInitialState(emptyAnchorFormState(), initial);
    expect(prefilled.kind).toBe("one_off");
    expect(prefilled.date).toBe("2026-05-25");

    const filled = fillRemainingMinimum(prefilled, { title: "歯科予約", startTime: "14:30" });
    const r = buildAnchorInputFromForm(filled);
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    if (r.input.anchorKind === "one_off") {
      expect(r.input.date).toBe("2026-05-25");
      expect(r.input.title).toBe("歯科予約");
      expect(r.input.startTime).toBe("14:30");
    }
  });

  it("Calendar pre-fill 後にユーザーが何も埋めない → 必須欠落 errors", () => {
    const initial: Partial<AnchorFormState> = {
      kind: "one_off",
      date: "2026-05-25",
    };
    const prefilled = mergeInitialState(emptyAnchorFormState(), initial);
    const r = buildAnchorInputFromForm(prefilled);
    expect(r.valid).toBe(false);
    if (!r.valid) {
      // title / startTime / rigidity が欠落
      const fields = r.errors.map((e) => e.field);
      expect(fields).toContain("title");
      expect(fields).toContain("startTime");
      expect(fields).toContain("rigidity");
      // date は pre-fill されているので欠落しない
      expect(fields).not.toContain("date");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Flow gap pre-fill → submit", () => {
  it("Flow gap add (kind:one_off, date, startTime) → 残り title/rigidity 補完 → valid", () => {
    const initial: Partial<AnchorFormState> = {
      kind: "one_off",
      date: "2026-05-20",
      startTime: "14:00",
    };
    const prefilled = mergeInitialState(emptyAnchorFormState(), initial);
    expect(prefilled.startTime).toBe("14:00");

    const filled = fillRemainingMinimum(prefilled, { title: "コーヒー休憩" });
    const r = buildAnchorInputFromForm(filled);
    expect(r.valid).toBe(true);
    if (r.valid && r.input.anchorKind === "one_off") {
      expect(r.input.startTime).toBe("14:00");
      expect(r.input.date).toBe("2026-05-20");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Map category pre-fill → submit", () => {
  it("Map category add (locationCategory only) → ユーザーが残りを埋める → valid", () => {
    const initial: Partial<AnchorFormState> = {
      locationCategory: "home",
    };
    const prefilled = mergeInitialState(emptyAnchorFormState(), initial);
    expect(prefilled.locationCategory).toBe("home");
    expect(prefilled.locationText).toBe(""); // CEO 補正 3: 自動入力なし
    expect(prefilled.kind).toBe("one_off"); // default

    const filled = fillRemainingMinimum(prefilled, {
      title: "家事",
      date: "2026-05-26",
      startTime: "10:00",
    });
    const r = buildAnchorInputFromForm(filled);
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.input.locationCategory).toBe("home");
      // locationText が undefined であることを確認（自動入力されてない）
      expect((r.input as unknown as Record<string, unknown>).locationText).toBeUndefined();
    }
  });

  it("Map category pre-fill 後に kind を recurring に切替 → category は維持", () => {
    const initial: Partial<AnchorFormState> = {
      locationCategory: "office",
    };
    const prefilled = mergeInitialState(emptyAnchorFormState(), initial);
    // ユーザーが繰り返しに切替（modal の switchKind で排他 field がクリアされる挙動を simulate）
    const switched: AnchorFormState = {
      ...prefilled,
      kind: "recurring",
      date: "", // one_off 排他をクリア
    };
    const filled = fillRemainingMinimum(switched, {
      title: "週次ミーティング",
      startTime: "10:00",
    });
    const r = buildAnchorInputFromForm(filled);
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.input.locationCategory).toBe("office");
      expect(r.input.anchorKind).toBe("recurring");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("integration purity", () => {
  it("mergeInitialState + buildAnchorInputFromForm を 2 回呼んでも同じ結果", () => {
    const initial: Partial<AnchorFormState> = {
      kind: "one_off",
      date: "2026-05-25",
    };
    const a = buildAnchorInputFromForm(
      fillRemainingMinimum(mergeInitialState(emptyAnchorFormState(), initial))
    );
    const b = buildAnchorInputFromForm(
      fillRemainingMinimum(mergeInitialState(emptyAnchorFormState(), initial))
    );
    expect(a).toEqual(b);
  });
});
