/**
 * Phase E-0.5 smoke — TravelRepository（fixture）境界の単体検証
 *
 * 検証:
 *   - FixtureTravelRepository.getTripDay: 旅行期間内は fixture day を返し、日付ラベルが
 *     クリック日に上書きされる（「正しい day が出るか」の repository 層保証）
 *   - 期間外（前後）は null（「期間判定が壊れていないか」の repository 層保証）
 *   - 境界（startDate / endDate）両端は inclusive で非 null
 *   - getTravelRepository(): flag OFF（既定）で FixtureTravelRepository を返す
 *   - SupabaseTravelRepository.getTripDay: skeleton ＝ NotImplemented を throw（実DB接続なし）
 *
 * すべて pure（node・DOM 不要）。
 */
import { describe, it, expect } from "vitest";
import { SAMPLE_KYOTO_TRIP } from "@/app/(culcept)/calendar/_lib/travel/sampleTrip";
import { FixtureTravelRepository } from "@/app/(culcept)/calendar/_lib/travel/repository/fixtureTravelRepository";
import { SupabaseTravelRepository } from "@/app/(culcept)/calendar/_lib/travel/repository/supabaseTravelRepository";
import {
  getTravelRepository,
  TravelRepositoryNotImplementedError,
} from "@/app/(culcept)/calendar/_lib/travel/repository";

describe("FixtureTravelRepository.getTripDay", () => {
  const repo = new FixtureTravelRepository();

  it("期間内の日付は fixture day を返し、日付ラベルがクリック日に上書きされる", async () => {
    const result = await repo.getTripDay("2026-06-25");
    expect(result).not.toBeNull();
    expect(result!.day.date).toBe("2026-06-25");
    expect(result!.day.monthDayLabel).toBe("6/25");
    // 2026-06-25 の実曜日は木（動的 override が正・fixture の dateRangeLabel "火〜木" は stale な別問題）
    expect(result!.day.weekdayLabel).toBe("木");
    expect(result!.trip.id).toBe(SAMPLE_KYOTO_TRIP.id);
  });

  it("境界（startDate / endDate）両端は inclusive で非 null", async () => {
    expect(await repo.getTripDay(SAMPLE_KYOTO_TRIP.startDate)).not.toBeNull(); // 6/24
    expect(await repo.getTripDay(SAMPLE_KYOTO_TRIP.endDate)).not.toBeNull(); // 6/26
  });

  it("期間より前は null", async () => {
    expect(await repo.getTripDay("2026-06-23")).toBeNull();
  });

  it("期間より後は null", async () => {
    expect(await repo.getTripDay("2026-06-27")).toBeNull();
  });
});

describe("getTravelRepository() factory", () => {
  it("flag OFF（既定）で FixtureTravelRepository を返す", () => {
    // NEXT_PUBLIC_PLAN_TRAVEL_SUPABASE_REPO_ENABLED 未設定＝OFF
    expect(getTravelRepository()).toBeInstanceOf(FixtureTravelRepository);
  });

  it("既定 repository は期間内で day を返す（consumer から見た契約）", async () => {
    const result = await getTravelRepository().getTripDay("2026-06-24");
    expect(result).not.toBeNull();
    expect(result!.day.date).toBe("2026-06-24");
  });
});

describe("SupabaseTravelRepository（skeleton）", () => {
  it("getTripDay は NotImplemented を throw（実DB接続なし）", async () => {
    const repo = new SupabaseTravelRepository();
    await expect(repo.getTripDay("2026-06-24")).rejects.toBeInstanceOf(
      TravelRepositoryNotImplementedError
    );
  });
});
