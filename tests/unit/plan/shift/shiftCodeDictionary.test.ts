import { describe, it, expect } from "vitest";
import {
  normalizeRawCode,
  lookupCode,
  buildCodeIndex,
  HARADA_SPRIX_DICTIONARY,
  type ShiftCodeEntry,
} from "@/lib/plan/shift/shiftCodeDictionary";

describe("normalizeRawCode", () => {
  it("trims and uppercases", () => {
    expect(normalizeRawCode("  n ")).toBe("N");
    expect(normalizeRawCode("e-18")).toBe("E-18");
    expect(normalizeRawCode("HReq")).toBe("HREQ");
  });

  it("empty / whitespace normalizes to empty string", () => {
    expect(normalizeRawCode("")).toBe("");
    expect(normalizeRawCode("   ")).toBe("");
  });
});

describe("lookupCode", () => {
  it("finds codes case-insensitively", () => {
    expect(lookupCode(HARADA_SPRIX_DICTIONARY, "h")?.semanticType).toBe(
      "holiday"
    );
    expect(lookupCode(HARADA_SPRIX_DICTIONARY, "E-18")?.semanticType).toBe(
      "early_long"
    );
  });

  it("returns null for unknown code", () => {
    expect(lookupCode(HARADA_SPRIX_DICTIONARY, "ZZ")).toBeNull();
  });
});

describe("buildCodeIndex", () => {
  it("indexes by normalized rawCode", () => {
    const entries: ShiftCodeEntry[] = [
      {
        rawCode: "x",
        displayLabel: "X",
        category: "work",
        semanticType: "x_work",
        roleTags: [],
        isOff: false,
        countsAsPublicHoliday: false,
        startTime: "09:00",
        endTime: "17:00",
        endsNextDay: false,
        projectMode: "timed_event",
      },
    ];
    const index = buildCodeIndex(entries);
    expect(index["X"]).toBeDefined();
    expect(index["x"]).toBeUndefined(); // キーは normalize 済み（大文字）
  });
});

describe("HARADA_SPRIX_DICTIONARY (bootstrap seed)", () => {
  it("has exactly 8 codes", () => {
    expect(Object.keys(HARADA_SPRIX_DICTIONARY.codes)).toHaveLength(8);
  });

  it("公休 = H のみ（CEO 訂正: 休み≠公休）", () => {
    const publicHolidayCodes = Object.values(HARADA_SPRIX_DICTIONARY.codes)
      .filter((c) => c.countsAsPublicHoliday)
      .map((c) => c.rawCode);
    expect(publicHolidayCodes).toEqual(["H"]);
  });

  it("休み系（H/HREQ/BD）は isOff=true だが公休は H のみ", () => {
    const { codes } = HARADA_SPRIX_DICTIONARY;
    expect(codes["H"].isOff).toBe(true);
    expect(codes["HREQ"].isOff).toBe(true);
    expect(codes["BD"].isOff).toBe(true);
    expect(codes["HREQ"].countsAsPublicHoliday).toBe(false);
    expect(codes["BD"].countsAsPublicHoliday).toBe(false);
  });

  it("休み系は projectMode が timed_event ではない（休みは枠を作らない）", () => {
    const { codes } = HARADA_SPRIX_DICTIONARY;
    expect(codes["H"].projectMode).toBe("day_indicator");
    expect(codes["BD"].projectMode).toBe("day_indicator");
    expect(codes["HREQ"].projectMode).toBe("candidate");
  });

  it("N（夜勤）は日跨ぎ 18:00→06:45", () => {
    const n = HARADA_SPRIX_DICTIONARY.codes["N"];
    expect(n.startTime).toBe("18:00");
    expect(n.endTime).toBe("06:45");
    expect(n.endsNextDay).toBe(true);
    expect(n.projectMode).toBe("timed_event");
  });

  it("勤務系は時刻を持ち、休み系は null", () => {
    const { codes } = HARADA_SPRIX_DICTIONARY;
    expect(codes["G"].startTime).toBe("09:00");
    expect(codes["G"].endTime).toBe("17:45");
    expect(codes["H"].startTime).toBeNull();
    expect(codes["BD"].startTime).toBeNull();
  });
});
