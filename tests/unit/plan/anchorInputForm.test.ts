/**
 * W1-X1 Anchor Input Form Helpers — pure 関数の unit tests
 *
 * UI (React) は対象外（testing-library 未導入）。
 * form state → CreateExternalAnchorInput の変換 + client-side validation を deterministic に固定する。
 */

import { describe, it, expect } from "vitest";

import {
  type AnchorFormState,
  buildAnchorInputFromForm,
  buildSourceInputFromForm,
  defaultSourceTypeForKind,
  detectWeekdayShortcut,
  emptyAnchorFormState,
  shortcutToWeekdays,
  toggleWeekday,
} from "@/lib/plan/anchor-input-form";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function oneOffComplete(overrides: Partial<AnchorFormState> = {}): AnchorFormState {
  return {
    ...emptyAnchorFormState(),
    kind: "one_off",
    title: "歯科予約",
    date: "2026-05-25",
    startTime: "14:30",
    rigidity: "hard",
    ...overrides,
  };
}

function recurringComplete(overrides: Partial<AnchorFormState> = {}): AnchorFormState {
  return {
    ...emptyAnchorFormState(),
    kind: "recurring",
    title: "週次ミーティング",
    validFrom: "2026-05-18",
    startTime: "10:00",
    rigidity: "soft",
    selectedWeekdays: ["MO", "WE", "FR"],
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("emptyAnchorFormState", () => {
  it("初期値は one_off / 全空文字 / 空配列", () => {
    const s = emptyAnchorFormState();
    expect(s.kind).toBe("one_off");
    expect(s.title).toBe("");
    expect(s.date).toBe("");
    expect(s.selectedWeekdays).toEqual([]);
    expect(s.rigidity).toBe("");
    expect(s.sourceType).toBe("");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("defaultSourceTypeForKind", () => {
  it("one_off → manual", () => {
    expect(defaultSourceTypeForKind("one_off")).toBe("manual");
  });
  it("recurring → template", () => {
    expect(defaultSourceTypeForKind("recurring")).toBe("template");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("weekday shortcuts", () => {
  it("detectWeekdayShortcut: 平日 5 件 → 'weekdays'", () => {
    expect(detectWeekdayShortcut(["MO", "TU", "WE", "TH", "FR"])).toBe("weekdays");
  });

  it("detectWeekdayShortcut: 週末 2 件 → 'weekend'", () => {
    expect(detectWeekdayShortcut(["SA", "SU"])).toBe("weekend");
  });

  it("detectWeekdayShortcut: 全 7 件 → 'everyday'", () => {
    expect(detectWeekdayShortcut(["MO", "TU", "WE", "TH", "FR", "SA", "SU"])).toBe(
      "everyday"
    );
  });

  it("detectWeekdayShortcut: 順不同 OK", () => {
    expect(detectWeekdayShortcut(["FR", "WE", "MO", "TH", "TU"])).toBe("weekdays");
  });

  it("detectWeekdayShortcut: 一部 → 'custom'", () => {
    expect(detectWeekdayShortcut(["MO", "WE", "FR"])).toBe("custom");
    expect(detectWeekdayShortcut(["MO"])).toBe("custom");
    expect(detectWeekdayShortcut([])).toBe("custom");
  });

  it("shortcutToWeekdays: 平日", () => {
    expect(shortcutToWeekdays("weekdays")).toEqual(["MO", "TU", "WE", "TH", "FR"]);
  });

  it("shortcutToWeekdays: 週末", () => {
    expect(shortcutToWeekdays("weekend")).toEqual(["SA", "SU"]);
  });

  it("shortcutToWeekdays: 毎日", () => {
    expect(shortcutToWeekdays("everyday")).toEqual([
      "MO",
      "TU",
      "WE",
      "TH",
      "FR",
      "SA",
      "SU",
    ]);
  });

  it("shortcutToWeekdays: custom → []", () => {
    expect(shortcutToWeekdays("custom")).toEqual([]);
  });

  it("toggleWeekday: 追加", () => {
    expect(toggleWeekday(["MO"], "WE")).toEqual(["MO", "WE"]);
  });

  it("toggleWeekday: 除去", () => {
    expect(toggleWeekday(["MO", "WE"], "MO")).toEqual(["WE"]);
  });

  it("toggleWeekday: canonical 化される", () => {
    expect(toggleWeekday(["FR"], "MO")).toEqual(["MO", "FR"]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildAnchorInputFromForm — one_off happy", () => {
  it("必須 4 欄だけ埋めた最小 input は valid", () => {
    const r = buildAnchorInputFromForm(oneOffComplete());
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.input.anchorKind).toBe("one_off");
    if (r.input.anchorKind === "one_off") {
      expect(r.input.date).toBe("2026-05-25");
      expect(r.input.title).toBe("歯科予約");
      expect(r.input.startTime).toBe("14:30");
      expect(r.input.rigidity).toBe("hard");
      expect(r.input.sourceType).toBe("manual"); // default
    }
  });

  it("title は trim される", () => {
    const r = buildAnchorInputFromForm(oneOffComplete({ title: "  歯科予約  " }));
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.input.title).toBe("歯科予約");
  });

  it("optional fields が全て載る", () => {
    const r = buildAnchorInputFromForm(
      oneOffComplete({
        endTime: "15:30",
        locationCategory: "public",
        locationText: "渋谷歯科クリニック",
        sensitiveCategory: "medical",
        sourceType: "manual",
      })
    );
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.input.endTime).toBe("15:30");
    expect(r.input.locationCategory).toBe("public");
    expect(r.input.locationText).toBe("渋谷歯科クリニック");
    expect(r.input.sensitiveCategory).toBe("medical");
  });

  it("空 locationText は undefined（空文字を送らない）", () => {
    const r = buildAnchorInputFromForm(oneOffComplete({ locationText: "   " }));
    expect(r.valid).toBe(true);
    if (r.valid)
      expect((r.input as Record<string, unknown>).locationText).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildAnchorInputFromForm — one_off validation", () => {
  it("title 空 → errors", () => {
    const r = buildAnchorInputFromForm(oneOffComplete({ title: "" }));
    expect(r.valid).toBe(false);
    if (!r.valid) {
      expect(r.errors.some((e) => e.field === "title")).toBe(true);
    }
  });

  it("startTime 空 → errors", () => {
    const r = buildAnchorInputFromForm(oneOffComplete({ startTime: "" }));
    expect(r.valid).toBe(false);
    if (!r.valid) {
      expect(r.errors.some((e) => e.field === "startTime")).toBe(true);
    }
  });

  it("rigidity 空 → errors", () => {
    const r = buildAnchorInputFromForm(oneOffComplete({ rigidity: "" }));
    expect(r.valid).toBe(false);
    if (!r.valid) {
      expect(r.errors.some((e) => e.field === "rigidity")).toBe(true);
    }
  });

  it("date 空 → errors", () => {
    const r = buildAnchorInputFromForm(oneOffComplete({ date: "" }));
    expect(r.valid).toBe(false);
    if (!r.valid) {
      expect(r.errors.some((e) => e.field === "date")).toBe(true);
    }
  });

  it("invalid date format → SoT validator が弾く", () => {
    const r = buildAnchorInputFromForm(oneOffComplete({ date: "2026/05/25" }));
    expect(r.valid).toBe(false);
  });

  it("invalid startTime format → SoT validator が弾く", () => {
    const r = buildAnchorInputFromForm(oneOffComplete({ startTime: "25:00" }));
    expect(r.valid).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildAnchorInputFromForm — recurring happy", () => {
  it("最小 5 欄で valid (kind/title/validFrom/startTime/rigidity + weekdays)", () => {
    const r = buildAnchorInputFromForm(recurringComplete());
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.input.anchorKind).toBe("recurring");
    if (r.input.anchorKind === "recurring") {
      expect(r.input.validFrom).toBe("2026-05-18");
      expect(r.input.recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR");
      expect(r.input.sourceType).toBe("template"); // default
    }
  });

  it("曜日 7 件 → BYDAY 全部", () => {
    const r = buildAnchorInputFromForm(
      recurringComplete({
        selectedWeekdays: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"],
      })
    );
    expect(r.valid).toBe(true);
    if (r.valid && r.input.anchorKind === "recurring") {
      expect(r.input.recurrenceRule).toBe(
        "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU"
      );
    }
  });

  it("validUntil 設定", () => {
    const r = buildAnchorInputFromForm(
      recurringComplete({ validUntil: "2026-08-31" })
    );
    expect(r.valid).toBe(true);
    if (r.valid && r.input.anchorKind === "recurring") {
      expect(r.input.validUntil).toBe("2026-08-31");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildAnchorInputFromForm — recurring validation", () => {
  it("validFrom 空 → errors", () => {
    const r = buildAnchorInputFromForm(recurringComplete({ validFrom: "" }));
    expect(r.valid).toBe(false);
    if (!r.valid) {
      expect(r.errors.some((e) => e.field === "validFrom")).toBe(true);
    }
  });

  it("曜日 0 件 → errors", () => {
    const r = buildAnchorInputFromForm(
      recurringComplete({ selectedWeekdays: [] })
    );
    expect(r.valid).toBe(false);
    if (!r.valid) {
      expect(r.errors.some((e) => e.field === "recurrenceRule")).toBe(true);
    }
  });

  it("validUntil < validFrom → SoT validator が弾く", () => {
    const r = buildAnchorInputFromForm(
      recurringComplete({
        validFrom: "2026-06-01",
        validUntil: "2026-05-01",
      })
    );
    expect(r.valid).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildSourceInputFromForm", () => {
  it("sourceType 未指定 + one_off → manual", () => {
    const s = buildSourceInputFromForm(oneOffComplete());
    expect(s.sourceType).toBe("manual");
  });

  it("sourceType 未指定 + recurring → template", () => {
    const s = buildSourceInputFromForm(recurringComplete());
    expect(s.sourceType).toBe("template");
  });

  it("sourceType 明示指定で override", () => {
    const s = buildSourceInputFromForm(
      oneOffComplete({ sourceType: "template" })
    );
    expect(s.sourceType).toBe("template");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildAnchorInputFromForm — purity", () => {
  it("入力を mutate しない", () => {
    const state = recurringComplete();
    const snapshot = JSON.parse(JSON.stringify(state));
    buildAnchorInputFromForm(state);
    expect(state).toEqual(snapshot);
  });

  it("複数回呼んでも同じ結果", () => {
    const state = oneOffComplete({
      endTime: "15:30",
      locationCategory: "public",
    });
    const a = buildAnchorInputFromForm(state);
    const b = buildAnchorInputFromForm(state);
    expect(a).toEqual(b);
  });
});
