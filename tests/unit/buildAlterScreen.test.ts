/**
 * buildAlterScreen（W6-smoke-fix）— container ロジックの fixture 検証
 *  FAIL 1: 補正タップ → 水位(meterPct)・source が即時に変わる（コールドスタート含む）
 *  FAIL 2: JST 23 時台 → Night Check 主問が出る（時刻ソース統一）
 * 正本: docs/day-state-w3-w6-closeout.md / docs/day-state-w3-execution-plan.md
 */
import {
  buildAlterScreen,
  type BuildAlterScreenInputs,
} from "@/app/(culcept)/plan/tabs/buildAlterScreen";
import { buildAlterDayInput, toJstWallClock } from "@/lib/plan/alterTab/adapter";
import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { UserCorrection } from "@/lib/plan/dayState/dayStateTypes";

function anchor(id: string, startTime: string, endTime: string): ExternalAnchor {
  return {
    anchorKind: "one_off",
    id,
    sourceId: "src-manual",
    title: "予定",
    date: "2026-06-12",
    startTime,
    endTime,
    rigidity: "fixed",
    confirmedAt: "2026-06-01T00:00:00.000Z",
  } as unknown as ExternalAnchor;
}

/** 予定はあるが本人入力ゼロ = energy/focus/emotional すべて unknown（コールドスタート） */
function coldStartInputs(jstNow: Date, corrections: UserCorrection[] = []): BuildAlterScreenInputs {
  const graphResult = buildDayGraph({ anchors: [anchor("a1", "10:00", "11:00")], date: "2026-06-12" });
  const dayInput = buildAlterDayInput({ now: jstNow, graphResult });
  return {
    jstNow,
    dayInput,
    weather: null,
    hints: {},
    corrections,
    nightAnswer: null,
    hydrated: null,
  };
}

describe("FAIL 1: 補正 → 水位・source の即時反映（コールドスタート全 unknown から）", () => {
  // 朝 08:00 JST（Night Check 窓外）で水位だけを見る
  const jst8 = toJstWallClock(new Date(Date.UTC(2026, 5, 11, 23, 0))); // UTC 23:00 = JST 08:00

  it("補正なし: body は unknown（meterPct.body=null・source 見立て）", () => {
    const r = buildAlterScreen(coldStartInputs(jst8));
    expect(r.screen.base.battery.body.band).toBe("unknown");
    expect(r.screen.meterPct.body).toBeNull();
    expect(r.screen.base.battery.body.source).toBe("見立て");
  });

  it("body を『もっと高い』補正 → unknown から medium へ・meterPct 数値化・source 本人", () => {
    const r = buildAlterScreen(
      coldStartInputs(jst8, [{ at: "08:05", field: "energyLevel", direction: "higher" }]),
    );
    expect(r.screen.base.battery.body.band).toBe("medium");
    expect(r.screen.meterPct.body).not.toBeNull();
    expect(r.screen.meterPct.body).toBeGreaterThan(0);
    expect(r.screen.base.battery.body.source).toBe("本人");
  });

  it("brain / heart も同様に補正で変わる（3 系統）", () => {
    const r = buildAlterScreen(
      coldStartInputs(jst8, [
        { at: "08:05", field: "focusReserve", direction: "higher" },
        { at: "08:06", field: "emotionalReserve", direction: "match" },
      ]),
    );
    expect(r.screen.meterPct.brain).not.toBeNull();
    expect(r.screen.base.battery.brain.source).toBe("本人");
    expect(r.screen.meterPct.heart).not.toBeNull();
    expect(r.screen.base.battery.heart.source).toBe("本人");
  });

  it("連続補正は積み上がる（medium → high）", () => {
    const r = buildAlterScreen(
      coldStartInputs(jst8, [
        { at: "08:05", field: "energyLevel", direction: "higher" }, // unknown→medium
        { at: "08:06", field: "energyLevel", direction: "higher" }, // medium→high
      ]),
    );
    expect(r.screen.base.battery.body.band).toBe("high");
  });

  it("W4 hydrated.frozen を当てても estimates（補正）は遮断されない（CEO 懸念点）", () => {
    const base = coldStartInputs(jst8, [{ at: "08:05", field: "energyLevel", direction: "higher" }]);
    const frozenUnknown = buildAlterScreen(coldStartInputs(jst8)).record.estimatesFrozen; // 全 unknown の凍結
    const r = buildAlterScreen({
      ...base,
      hydrated: { frozen: frozenUnknown, yesterday: null, revealAlreadySeen: false },
    });
    // 凍結が unknown でも、補正後 estimates = medium が band/source に反映される
    expect(r.screen.base.battery.body.band).toBe("medium");
    expect(r.screen.base.battery.body.source).toBe("本人");
  });
});

describe("FAIL 2: JST 時刻で Night Check 窓が開く（ブラウザ TZ 非依存）", () => {
  it("JST 23:17 → nightCheck.state = main（チャートと同じ JST ソース）", () => {
    // UTC 14:17 = JST 23:17。素の getHours() なら 14（afternoon）= バグ再現値
    const jst2317 = toJstWallClock(new Date(Date.UTC(2026, 5, 12, 14, 17)));
    expect(jst2317.getHours()).toBe(23); // JST 壁時計
    const r = buildAlterScreen(coldStartInputs(jst2317));
    expect(r.screen.base.nightCheck.state).toBe("main");
    expect(r.screen.base.nightCheck.question).toContain("余力");
  });

  it("JST 21:00 → main / JST 13:00 → hidden（夜以外は出さない）", () => {
    const jst21 = toJstWallClock(new Date(Date.UTC(2026, 5, 12, 12, 0))); // UTC 12:00 = JST 21:00
    const jst13 = toJstWallClock(new Date(Date.UTC(2026, 5, 12, 4, 0))); // UTC 04:00 = JST 13:00
    expect(buildAlterScreen(coldStartInputs(jst21)).screen.base.nightCheck.state).toBe("main");
    expect(buildAlterScreen(coldStartInputs(jst13)).screen.base.nightCheck.state).toBe("hidden");
  });

  it("Night Check 回答 → state は followup（予定あり日）・採点が走る", () => {
    const jst2317 = toJstWallClock(new Date(Date.UTC(2026, 5, 12, 14, 17)));
    const base = coldStartInputs(jst2317);
    const r = buildAlterScreen({
      ...base,
      nightAnswer: { dayFelt: 3, answeredAt: "23:17" },
    });
    expect(r.nightGrade).not.toBeNull();
    expect(r.screen.base.nightCheck.state).toBe("followup"); // 予定 1 件 = anchorCount>0
  });

  it("深夜 JST 02:00 も late_night で main（subjective date は前日キー）", () => {
    // UTC 17:00(6/12) = JST 02:00(6/13)
    const jst0200 = toJstWallClock(new Date(Date.UTC(2026, 5, 12, 17, 0)));
    expect(jst0200.getHours()).toBe(2);
    const r = buildAlterScreen(coldStartInputs(jst0200));
    expect(r.screen.base.nightCheck.state).toBe("main");
  });
});
