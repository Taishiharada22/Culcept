import { describe, it, expect } from "vitest";
import { createRealSnapshotReader } from "@/lib/plan/travel/realSnapshotReader";
import { resolveRealSoftPersonalization } from "@/lib/plan/travel/realPersonalizationGate";
import { TRAIT_AXIS_KEYS } from "@/lib/stargazer/traitAxes";

/** PersonalizationReadClient 互換の fake（SelectChain: eq/is/order + PromiseLike）。 */
function chain(data: unknown[]) {
  const c = {
    eq: () => c,
    is: () => c,
    order: () => Promise.resolve({ data, error: null }),
    then: (onF: (v: { data: unknown[]; error: null }) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve({ data, error: null }).then(onF, onR),
  };
  return c;
}

function fakeClient(axes: unknown[], growth: unknown[], onFrom?: () => void) {
  return {
    from: (table: string) => {
      onFrom?.();
      return { select: () => chain(table === "stargazer_axis_snapshots" ? axes : growth) };
    },
  };
}

const GATE_ON = { flagEnabled: true, consentGranted: true, mode: "solo" as const };

describe("UX-6b-2b-1 real snapshot reader caller (staging axis なし→no-op)", () => {
  it("axis なし（staging 既定）→ descriptors 空 soft → adapter no-op（byte 等価・fixture fallback と同等）", async () => {
    const reader = createRealSnapshotReader(fakeClient([], []), "u-a", "2026-06-21T00:00:00Z");
    const soft = await resolveRealSoftPersonalization(GATE_ON, reader);
    // 空 snapshot → derive neutral → m2 は descriptors なし・pace なしの soft（visibility:private のみ）。
    // softPersonalization 注入されても enrich 内容ゼロ＝adapter byte 等価＝no-op（性格反映なし）。
    expect((soft?.descriptors ?? []).length).toBe(0);
    expect(soft?.pace).toBeUndefined();
  });

  it("gate false（consent OFF）→ snapshotReader 未実行（from 呼ばれない）", async () => {
    let fromCalled = false;
    const reader = createRealSnapshotReader(
      fakeClient([], [], () => {
        fromCalled = true;
      }),
      "u-a",
      "2026-06-21T00:00:00Z",
    );
    await resolveRealSoftPersonalization({ flagEnabled: true, consentGranted: false, mode: "solo" }, reader);
    expect(fromCalled).toBe(false); // gate false → reader.read() 不実行 → getPersonalizationSnapshot 未呼出
  });

  it("axis あり（全 trait 軸・高 confidence）→ snapshot→derive→m2→soft 非 null（流れる）", async () => {
    const axes = TRAIT_AXIS_KEYS.map((k, i) => ({
      axis_id: k,
      score: 0.7,
      confidence: 0.9,
      created_at: `2026-06-2${i % 9}T00:00:00Z`,
    }));
    const reader = createRealSnapshotReader(fakeClient(axes, []), "u-a", "2026-06-21T00:00:00Z");
    const soft = await resolveRealSoftPersonalization(GATE_ON, reader);
    expect(soft).not.toBeNull(); // axis あり → personalization が流れる
  });
});
