/**
 * typicalDuration unit tests — CEO 2026-04-29 PR #44 endTime 推論
 */
import { describe, it, expect } from "vitest";
import {
  inferTypicalDurationMin,
  addMinutesToHHmm,
  inferEndTimeFromActivity,
} from "@/lib/alter-morning/planning/typicalDuration";

describe("inferTypicalDurationMin", () => {
  it("コーヒー → 30 分 high confidence", () => {
    const r = inferTypicalDurationMin("コーヒー");
    expect(r.typical).toBe(30);
    expect(r.confidence).toBe("high");
  });

  it("ランチ → 60 分 high confidence", () => {
    const r = inferTypicalDurationMin("ランチ");
    expect(r.typical).toBe(60);
    expect(r.confidence).toBe("high");
  });

  it("夕食 → 90 分 high confidence", () => {
    const r = inferTypicalDurationMin("夕食");
    expect(r.typical).toBe(90);
    expect(r.confidence).toBe("high");
  });

  it("ミーティング → 60 分 medium confidence", () => {
    const r = inferTypicalDurationMin("ミーティング");
    expect(r.typical).toBe(60);
    expect(r.confidence).toBe("medium");
  });

  it("打ち合わせ → 60 分 medium confidence", () => {
    const r = inferTypicalDurationMin("打ち合わせ");
    expect(r.typical).toBe(60);
    expect(r.confidence).toBe("medium");
  });

  it("仕事 → 60 分 low confidence (clarify 候補)", () => {
    const r = inferTypicalDurationMin("仕事");
    expect(r.typical).toBe(60);
    expect(r.confidence).toBe("low");
  });

  it("不明 activity → default 60 分 low confidence", () => {
    const r = inferTypicalDurationMin("XXXX");
    expect(r.typical).toBe(60);
    expect(r.confidence).toBe("low");
  });

  it("空文字 → default 60 分 low confidence", () => {
    const r = inferTypicalDurationMin("");
    expect(r.typical).toBe(60);
    expect(r.confidence).toBe("low");
  });

  it("null → default 60 分 low confidence", () => {
    const r = inferTypicalDurationMin(null);
    expect(r.typical).toBe(60);
    expect(r.confidence).toBe("low");
  });
});

describe("addMinutesToHHmm", () => {
  it("09:00 + 30 分 → 09:30", () => {
    expect(addMinutesToHHmm("09:00", 30)).toBe("09:30");
  });

  it("09:00 + 60 分 → 10:00", () => {
    expect(addMinutesToHHmm("09:00", 60)).toBe("10:00");
  });

  it("23:30 + 60 分 → 00:30 (24h wrap)", () => {
    expect(addMinutesToHHmm("23:30", 60)).toBe("00:30");
  });

  it("invalid format → null", () => {
    expect(addMinutesToHHmm("9時", 30)).toBeNull();
    expect(addMinutesToHHmm("25:00", 30)).toBeNull();
    expect(addMinutesToHHmm("12:99", 30)).toBeNull();
  });
});

describe("inferEndTimeFromActivity", () => {
  it("[CEO] 9:00 コーヒー → endTime=9:30 high (聞かない)", () => {
    const r = inferEndTimeFromActivity({
      startTime: "09:00",
      activity: "コーヒー",
    });
    expect(r.endTime).toBe("09:30");
    expect(r.confidence).toBe("high");
  });

  it("[CEO] 9:00 打ち合わせ → endTime=10:00 medium (推論で OK、必要なら clarify)", () => {
    const r = inferEndTimeFromActivity({
      startTime: "09:00",
      activity: "打ち合わせ",
    });
    expect(r.endTime).toBe("10:00");
    expect(r.confidence).toBe("medium");
  });

  it("[CEO] 9:00 仕事 (varied) → endTime=null low (clarify 候補)", () => {
    const r = inferEndTimeFromActivity({
      startTime: "09:00",
      activity: "仕事",
    });
    expect(r.endTime).toBeNull();
    expect(r.confidence).toBe("low");
  });

  it("startTime null → null low", () => {
    const r = inferEndTimeFromActivity({
      startTime: null,
      activity: "コーヒー",
    });
    expect(r.endTime).toBeNull();
    expect(r.confidence).toBe("low");
  });

  it("12:00 ランチ → endTime=13:00 high", () => {
    const r = inferEndTimeFromActivity({
      startTime: "12:00",
      activity: "ランチ",
    });
    expect(r.endTime).toBe("13:00");
    expect(r.confidence).toBe("high");
  });
});
