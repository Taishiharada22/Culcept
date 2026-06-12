/**
 * buildAlterBatteryViewModel — band↔visualFill 整合・unknown 規律・Morning Reveal・禁止語 regression
 */
import {
  buildAlterBatteryViewModel,
  BAND_FILL,
  ADJUSTMENT_NOTE_PRE_B1,
  DAYFELT_TO_BAND,
} from "@/lib/plan/dayState/buildAlterBatteryViewModel";
import { buildDayStateRecord } from "@/lib/plan/dayState/buildDayStateRecord";
import { deriveMomentState } from "@/lib/plan/dayState/deriveMomentState";
import { gradeNightCheck } from "@/lib/plan/dayState/gradeNightCheck";
import type {
  AlterBatteryViewModel,
  DayStateBuildInput,
  DayStateRecordV0,
} from "@/lib/plan/dayState/dayStateTypes";

function input(over: Partial<DayStateBuildInput> = {}): DayStateBuildInput {
  return {
    date: "2026-06-11",
    nowHHMM: "07:00",
    segments: [
      { kind: "event", startHHMM: "10:00", endHHMM: "11:30", durationMin: 90, timeBucket: "morning" },
      { kind: "gap", startHHMM: "20:30", endHHMM: "23:00", durationMin: 150, timeBucket: "night" },
    ],
    shift: { kind: "work", startTime: "22:00", endTime: "06:00" },
    weather: { condition: "rainy", pop: 70 },
    ...over,
  };
}

function vm(over: Partial<DayStateBuildInput> = {}, nowHHMM = "08:00", yesterday?: DayStateRecordV0 | null) {
  const record = buildDayStateRecord(input(over));
  const moment = deriveMomentState({ nowHHMM, segments: input(over).segments });
  return buildAlterBatteryViewModel(record, moment, yesterday);
}

function yesterdayAnswered(dayFelt: 1 | 2 | 3 | 4 | 5): DayStateRecordV0 {
  // 凍結 energy = low（夜勤）の前日レコードに Night Check 回答を付ける
  const rec = buildDayStateRecord(input({ date: "2026-06-10" }));
  const grade = gradeNightCheck(rec, { dayFelt, answeredAt: "21:30" });
  return {
    ...rec,
    nightCheck: {
      answeredAt: "21:30",
      answeredFor: "2026-06-10",
      dayFelt,
      verdicts: grade.verdicts,
    },
    carryOverOut: grade.carryOverOut,
  };
}

describe("band ↔ visualFill の整合（contract violation 検出）", () => {
  it("全 zone で visualFill が band の凍結値と一致する", () => {
    const v = vm();
    for (const zone of [v.battery.brain, v.battery.heart, v.battery.body]) {
      expect(zone.visualFill).toBe(BAND_FILL[zone.band]);
    }
  });
  it("夜勤日: body = low 帯（energy low）で fill 0.32・「見立て」バッジ", () => {
    const v = vm();
    expect(v.battery.body.band).toBe("low");
    expect(v.battery.body.visualFill).toBe(BAND_FILL.low);
    expect(v.battery.body.source).toBe("見立て");
  });
  it("本人タップ日: source = 本人", () => {
    const v = vm({ moodCode: "tired" });
    expect(v.battery.body.source).toBe("本人");
  });
  it("unknown zone は fill 0", () => {
    const v = vm({ shift: { kind: "none" }, weather: null });
    expect(v.battery.heart.band).toBe("unknown");
    expect(v.battery.heart.visualFill).toBe(0);
  });
});

describe("sleep / recoveryQuality の unknown 規律（偽データの型縛り）", () => {
  it("sleepQuality 未入力 → source unknown / band unknown / 「まだ読めていません」", () => {
    const v = vm();
    expect(v.contextCards.sleep.source).toBe("unknown");
    expect(v.contextCards.sleep.band).toBe("unknown");
    expect(v.contextCards.sleep.text).toBe("まだ読めていません");
  });
  it("sleepQuality 入力あり → user_reported / band 確定", () => {
    const v = vm({ sleepQuality: "short" });
    expect(v.contextCards.sleep.source).toBe("user_reported");
    expect(v.contextCards.sleep.band).toBe("low");
  });
  it("recoveryQuality: 前日 Night Check なし → unknown", () => {
    const v = vm();
    expect(v.contextCards.recoveryQuality.source).toBe("unknown");
    expect(v.contextCards.recoveryQuality.band).toBe("unknown");
  });
  it("recoveryQuality: 前日回答あり → night_check_derived（felt4 → debt none → high）", () => {
    const v = vm({}, "08:00", yesterdayAnswered(4));
    expect(v.contextCards.recoveryQuality.source).toBe("night_check_derived");
    expect(v.contextCards.recoveryQuality.band).toBe("high");
  });
});

describe("Morning Reveal（開示面）", () => {
  it("朝 + 前日回答済み → 表示。dayFelt=4 × 凍結 low = under（§4.3 対応表どおり）", () => {
    const v = vm({}, "08:00", yesterdayAnswered(4));
    expect(v.morningReveal).not.toBeNull();
    const item = v.morningReveal!.items[0];
    expect(item.label).toBe("からだの余力");
    expect(item.estimatedBand).toBe("low");
    expect(item.actualBand).toBe(DAYFELT_TO_BAND[4]); // high
    expect(item.verdict).toBe("under");
    expect(v.morningReveal!.adjustmentNote).toBe(ADJUSTMENT_NOTE_PRE_B1); // B1 前は「記録した」系固定
    expect(item.actualAnchor).toBe("少し余った"); // C-4: dayFelt=4 のアンカー語（設計 §3.5'）
  });
  it("null 一本化: 前日なし / 前日未回答 / 朝以外 → null", () => {
    expect(vm({}, "08:00", null).morningReveal).toBeNull();
    const unanswered = buildDayStateRecord(input({ date: "2026-06-10" }));
    expect(vm({}, "08:00", unanswered).morningReveal).toBeNull();
    expect(vm({}, "13:00", yesterdayAnswered(4)).morningReveal).toBeNull();
  });
});

describe("Night Check 表示状態", () => {
  it("夜（21:00）未回答 → main / 朝 + 前日未回答 → carried_over（きのうの設問）", () => {
    expect(vm({}, "21:00").nightCheck.state).toBe("main");
    const unanswered = buildDayStateRecord(input({ date: "2026-06-10" }));
    const morning = vm({}, "08:00", unanswered);
    expect(morning.nightCheck.state).toBe("carried_over");
    expect(morning.nightCheck.question).toContain("きのう");
  });
  it("昼 + 前日回答済み → hidden", () => {
    expect(vm({}, "13:00", yesterdayAnswered(3)).nightCheck.state).toBe("hidden");
  });

  // C-3: 主問回答済み → followup（予定あり日）/ answered（予定なし日 or followup 回答済み）
  function todayWith(partial: { dayFelt: 1 | 2 | 3 | 4 | 5; planVerdict?: "as_seen" | "partial_drift" | "major_drift" }, over: Partial<DayStateBuildInput> = {}) {
    const record = buildDayStateRecord(input(over));
    const withNc: DayStateRecordV0 = {
      ...record,
      nightCheck: { answeredAt: "21:30", answeredFor: "2026-06-11", dayFelt: partial.dayFelt, planVerdict: partial.planVerdict, verdicts: {} },
    };
    return buildAlterBatteryViewModel(withNc, deriveMomentState({ nowHHMM: "21:30", segments: input(over).segments }), null);
  }
  it("主問回答済み・予定あり・followup 未回答 → followup（設問が予定の問い）", () => {
    const v = todayWith({ dayFelt: 3 }); // input() は event 1 件 = anchorCount 1
    expect(v.nightCheck.state).toBe("followup");
    expect(v.nightCheck.question).toContain("予定");
    expect(v.nightCheck.chips).toEqual(["だいたい通り", "一部ずれた", "大きくずれた"]);
  });
  it("followup 回答済み（planVerdict あり）→ answered", () => {
    expect(todayWith({ dayFelt: 3, planVerdict: "as_seen" }).nightCheck.state).toBe("answered");
  });
  it("予定なしの日（anchorCount 0）→ followup を出さず answered", () => {
    expect(todayWith({ dayFelt: 3 }, { segments: [] }).nightCheck.state).toBe("answered");
  });
});

describe("表示文字列の規律 regression（N-3 禁止語・数値非表示・断定回避）", () => {
  const BANNED = ["おすすめ", "これをした方がいい", "最適", "推奨", "改善", "警告", "危険", "注意", "リスク", "%", "今日の開始残量"];

  function collectStrings(v: AlterBatteryViewModel): string[] {
    const out: string[] = [];
    const walk = (x: unknown): void => {
      if (typeof x === "string") out.push(x);
      else if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === "object") Object.values(x).forEach(walk);
    };
    walk(v);
    return out;
  }

  it("生成される全文字列に禁止語が含まれない", () => {
    const variants = [
      vm({}, "08:00", yesterdayAnswered(1)),
      vm({ moodCode: "tired", sleepQuality: "shallow" }, "21:00"),
      vm({ shift: { kind: "none" }, weather: null }, "13:00"),
    ];
    for (const v of variants) {
      for (const s of collectStrings(v)) {
        for (const banned of BANNED) {
          expect(s).not.toContain(banned);
        }
      }
    }
  });

  it("夜の余白は事実由来の時間表示のみ可（'2.5h 確保できそう' 形式）", () => {
    const v = vm();
    expect(v.contextCards.eveningSlack.text).toBe("2.5h 確保できそう");
  });

  it("dayFeasibility の表示文は固定テーブル（断定なし・proxy 抑制トーン）", () => {
    const v = vm();
    expect([
      "今日の流れは大きく崩れにくそうです",
      "今日の流れはややゆらぎそうです",
      "今日の流れは崩れやすそうです",
      "まだ読めていません",
    ]).toContain(v.contextCards.feasibility.text);
  });
});
