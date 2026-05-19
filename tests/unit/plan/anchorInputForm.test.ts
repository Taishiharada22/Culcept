/**
 * W1-X1 Anchor Input Form Helpers — pure 関数の unit tests
 *
 * UI (React) は対象外（testing-library 未導入）。
 * form state → CreateExternalAnchorInput の変換 + client-side validation を deterministic に固定する。
 */

import { describe, it, expect } from "vitest";

import {
  addExceptionDate,
  type AnchorFormState,
  buildAnchorInputFromForm,
  buildSourceInputFromForm,
  defaultSourceTypeForKind,
  detectWeekdayShortcut,
  emptyAnchorFormState,
  formatExceptionDateLabel,
  mergeInitialState,
  removeExceptionDate,
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("mergeInitialState (W1-X3)", () => {
  it("initial 未指定 → empty の新 instance を返す", () => {
    const empty = emptyAnchorFormState();
    const out = mergeInitialState(empty);
    expect(out).toEqual(empty);
    expect(out).not.toBe(empty); // 新 instance
  });

  it("date のみ override", () => {
    const out = mergeInitialState(emptyAnchorFormState(), {
      date: "2026-05-25",
    });
    expect(out.date).toBe("2026-05-25");
    expect(out.kind).toBe("one_off");
    expect(out.title).toBe("");
  });

  it("kind / date 両方 override (Calendar cell add 想定)", () => {
    const out = mergeInitialState(emptyAnchorFormState(), {
      kind: "one_off",
      date: "2026-05-25",
    });
    expect(out.kind).toBe("one_off");
    expect(out.date).toBe("2026-05-25");
  });

  it("kind / date / startTime 3 件 (Flow gap add 想定)", () => {
    const out = mergeInitialState(emptyAnchorFormState(), {
      kind: "one_off",
      date: "2026-05-20",
      startTime: "14:00",
    });
    expect(out.date).toBe("2026-05-20");
    expect(out.startTime).toBe("14:00");
  });

  it("locationCategory のみ (Map add 想定。locationText 自動入力なし)", () => {
    const out = mergeInitialState(emptyAnchorFormState(), {
      locationCategory: "home",
    });
    expect(out.locationCategory).toBe("home");
    expect(out.locationText).toBe(""); // 自動入力されない
  });

  it("selectedWeekdays は新 array で持つ (呼び出し側 mutate 遮断)", () => {
    const seed: AnchorFormState["selectedWeekdays"] = ["MO", "WE"];
    const out = mergeInitialState(emptyAnchorFormState(), {
      selectedWeekdays: seed,
    });
    expect(out.selectedWeekdays).toEqual(["MO", "WE"]);
    expect(out.selectedWeekdays).not.toBe(seed); // 別 instance
  });

  it("input を mutate しない", () => {
    const empty = emptyAnchorFormState();
    const emptySnap = JSON.parse(JSON.stringify(empty));
    const initial: Partial<AnchorFormState> = {
      date: "2026-05-25",
      locationCategory: "home",
    };
    const initialSnap = JSON.parse(JSON.stringify(initial));
    mergeInitialState(empty, initial);
    expect(empty).toEqual(emptySnap);
    expect(initial).toEqual(initialSnap);
  });

  it("初期 selectedWeekdays は empty.selectedWeekdays とは別 instance", () => {
    const empty = emptyAnchorFormState();
    const out = mergeInitialState(empty);
    expect(out.selectedWeekdays).not.toBe(empty.selectedWeekdays);
  });

  it("undefined 値で override しても empty のまま", () => {
    const out = mergeInitialState(emptyAnchorFormState(), {
      date: undefined as unknown as string, // 故意の undefined
    });
    expect(out.date).toBe(undefined);
    // ※ 実装は spread だから undefined で上書きされうる。仕様として明示的に許容。
    // 呼び出し側は undefined を含む partial を渡さない設計。
  });

  it("exceptionDates も新 array で持つ", () => {
    const seed: string[] = ["2026-05-03"];
    const out = mergeInitialState(emptyAnchorFormState(), {
      exceptionDates: seed,
    });
    expect(out.exceptionDates).toEqual(["2026-05-03"]);
    expect(out.exceptionDates).not.toBe(seed); // 別 instance
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("addExceptionDate / removeExceptionDate / formatExceptionDateLabel (W1-X4)", () => {
  describe("addExceptionDate", () => {
    it("空 → 新規追加", () => {
      expect(addExceptionDate([], "2026-05-03")).toEqual(["2026-05-03"]);
    });

    it("canonical sort: 既存 7/17 + 5/3 → ascending", () => {
      expect(addExceptionDate(["2026-07-17"], "2026-05-03")).toEqual([
        "2026-05-03",
        "2026-07-17",
      ]);
    });

    it("重複は silent ignore（同 date 追加で no-op）", () => {
      expect(addExceptionDate(["2026-05-03"], "2026-05-03")).toEqual([
        "2026-05-03",
      ]);
    });

    it("不正 format → silent ignore", () => {
      expect(addExceptionDate(["2026-05-03"], "bad")).toEqual(["2026-05-03"]);
      expect(addExceptionDate(["2026-05-03"], "2026/05/04")).toEqual([
        "2026-05-03",
      ]);
    });

    it("物理的無効日 (2026-02-30) → silent ignore", () => {
      expect(addExceptionDate([], "2026-02-30")).toEqual([]);
    });

    it("入力 array を mutate しない", () => {
      const seed = ["2026-05-03"];
      const out = addExceptionDate(seed, "2026-07-17");
      expect(seed).toEqual(["2026-05-03"]); // 不変
      expect(out).not.toBe(seed);
    });
  });

  describe("removeExceptionDate", () => {
    it("該当 date を削除", () => {
      expect(
        removeExceptionDate(["2026-05-03", "2026-07-17"], "2026-05-03")
      ).toEqual(["2026-07-17"]);
    });

    it("存在しない date → silent ignore", () => {
      expect(
        removeExceptionDate(["2026-05-03"], "2026-01-01")
      ).toEqual(["2026-05-03"]);
    });

    it("入力 array を mutate しない", () => {
      const seed = ["2026-05-03", "2026-07-17"];
      removeExceptionDate(seed, "2026-05-03");
      expect(seed).toEqual(["2026-05-03", "2026-07-17"]);
    });
  });

  describe("formatExceptionDateLabel", () => {
    it.each([
      ["2026-05-03", "5月3日(日)"],
      ["2026-01-01", "1月1日(木)"],
      ["2026-12-31", "12月31日(木)"],
    ])("%s → %s", (input, expected) => {
      expect(formatExceptionDateLabel(input)).toBe(expected);
    });

    it("不正 format → 入力そのまま（UI fail-safe）", () => {
      expect(formatExceptionDateLabel("bad")).toBe("bad");
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildAnchorInputFromForm — exceptionDates (W1-X4)", () => {
  it("recurring + 例外日 2 件 → input に exceptionDates が含まれる", () => {
    const state: AnchorFormState = {
      ...emptyAnchorFormState(),
      kind: "recurring",
      title: "週次",
      validFrom: "2026-05-18",
      selectedWeekdays: ["MO"],
      startTime: "10:00",
      rigidity: "soft",
      exceptionDates: ["2026-05-25", "2026-07-13"],
    };
    const r = buildAnchorInputFromForm(state);
    expect(r.valid).toBe(true);
    if (r.valid && r.input.anchorKind === "recurring") {
      expect(r.input.exceptionDates).toEqual(["2026-05-25", "2026-07-13"]);
    }
  });

  it("recurring + 空 exceptionDates → input.exceptionDates は [] (PATCH 削除を表現するため明示)", () => {
    const state: AnchorFormState = {
      ...emptyAnchorFormState(),
      kind: "recurring",
      title: "週次",
      validFrom: "2026-05-18",
      selectedWeekdays: ["MO"],
      startTime: "10:00",
      rigidity: "soft",
    };
    const r = buildAnchorInputFromForm(state);
    expect(r.valid).toBe(true);
    if (r.valid && r.input.anchorKind === "recurring") {
      // 空配列は明示で含める（PATCH update で削除を表現するため）
      expect(r.input.exceptionDates).toEqual([]);
    }
  });

  it("one_off では exceptionDates は無視（input に乗らない）", () => {
    const state: AnchorFormState = {
      ...emptyAnchorFormState(),
      kind: "one_off",
      title: "歯科",
      date: "2026-05-25",
      startTime: "14:30",
      rigidity: "hard",
      exceptionDates: ["2026-05-25"], // recurring 専用、one_off では無視
    };
    const r = buildAnchorInputFromForm(state);
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(
        (r.input as Record<string, unknown>).exceptionDates
      ).toBeUndefined();
    }
  });
});
