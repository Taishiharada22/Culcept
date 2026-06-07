import { describe, it, expect } from "vitest";
import { presentCaptureCandidate, friendlyDateLabel, actionResultText } from "@/components/home/morning/captureCandidatePresenter";
import type { CandidateSurfaceDTO } from "@/lib/plan/reality/integration/candidate-surface";

function dto(p: Partial<CandidateSurfaceDTO> = {}): CandidateSurfaceDTO {
  return {
    hasCandidate: true,
    candidateCount: 1,
    status: "has_candidate",
    items: [{ durationMin: 60, evidenceSource: "seed_explicit", date: null, band: "morning", confidenceBand: "high" }],
    ...p,
  };
}

describe("A1-5-7-6 presentCaptureCandidate — absent → null（既存 UI 不変）", () => {
  it("undefined → null", () => {
    expect(presentCaptureCandidate(undefined)).toBeNull();
  });
  it("null → null", () => {
    expect(presentCaptureCandidate(null)).toBeNull();
  });
  it("hasCandidate=false → null", () => {
    expect(presentCaptureCandidate(dto({ hasCandidate: false, status: "none", items: [] }))).toBeNull();
  });
});

describe("A1-5-7-6 presentCaptureCandidate — present → 控えめ表示モデル", () => {
  it("candidate → heading「候補があります」+ duration「約60分」+ 友好 sourceLabel + bandLabel", () => {
    const d = presentCaptureCandidate(dto());
    expect(d?.heading).toBe("候補があります");
    expect(d?.note).toContain("候補");
    expect(d?.items).toHaveLength(1);
    expect(d?.items[0]).toEqual({ durationText: "約60分", sourceLabel: "あなたが話した内容から", bandLabel: "午前", dateLabel: null, handle: null });
  });
  it("A1-6-8: item.handle を display に通す（opaque handle あり→保持・無→null）", () => {
    const H = "c1:" + "f".repeat(64);
    expect(presentCaptureCandidate(dto())?.items[0].handle).toBeNull(); // dto item に handle なし → null
    const withHandle = presentCaptureCandidate(dto({ items: [{ durationMin: 60, evidenceSource: "seed_explicit", date: null, band: "morning", confidenceBand: "high", handle: H }] }));
    expect(withHandle?.items[0].handle).toBe(H);
  });
  it("correction → sourceLabel「これまでの調整から」", () => {
    expect(presentCaptureCandidate(dto({ items: [{ durationMin: 30, evidenceSource: "correction", date: null, band: null, confidenceBand: "medium" }] }))?.items[0].sourceLabel).toBe("これまでの調整から");
  });
  it("band 無 → bandLabel null", () => {
    expect(presentCaptureCandidate(dto({ items: [{ durationMin: 45, evidenceSource: "seed_explicit", date: null, band: null, confidenceBand: "high" }] }))?.items[0].bandLabel).toBeNull();
  });
  it("A1-6-10: band label を reflection と一致（午後/夜）+ note に「なぜ」（やり取り由来）", () => {
    expect(presentCaptureCandidate(dto())?.note).toContain("やり取り"); // なぜ出たかを一言で
    expect(presentCaptureCandidate(dto({ items: [{ durationMin: 60, evidenceSource: "seed_explicit", date: null, band: "afternoon", confidenceBand: "high" }] }))?.items[0].bandLabel).toBe("午後");
    expect(presentCaptureCandidate(dto({ items: [{ durationMin: 60, evidenceSource: "seed_explicit", date: null, band: "evening", confidenceBand: "high" }] }))?.items[0].bandLabel).toBe("夜");
  });
  it("durationMin 不正 → 「予定」", () => {
    expect(presentCaptureCandidate(dto({ items: [{ durationMin: 0, evidenceSource: "seed_explicit", date: null, band: null, confidenceBand: "low" }] }))?.items[0].durationText).toBe("予定");
  });
  it("hasCandidate=true + items 空 → heading のみ（items 空）", () => {
    const d = presentCaptureCandidate(dto({ items: [] }));
    expect(d?.heading).toBe("候補があります");
    expect(d?.items).toEqual([]);
  });
});

describe("A1-5-7-6 presentCaptureCandidate — 技術名/raw/UUID 非露出", () => {
  it("evidenceSource の技術名（seed_explicit/correction）を出力に出さない", () => {
    const json = JSON.stringify(presentCaptureCandidate(dto()));
    for (const leak of ["seed_explicit", "correction", "evidenceSource", "hasCandidate", "candidateCount"]) {
      expect(json).not.toContain(leak);
    }
  });
  it("source_ref / UUID / band 技術名（morning）は表示モデルに残るが友好ラベルへ写る", () => {
    const json = JSON.stringify(presentCaptureCandidate(dto({ items: [{ durationMin: 60, evidenceSource: "seed_explicit", date: "2026-06-07", band: "morning", confidenceBand: "high" }] })));
    expect(json).not.toContain("source_ref");
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(json).not.toContain('"band":"morning"'); // 技術名でなく友好ラベル「午前」（A1-6-10: reflection と一致）
    expect(json).toContain("午前");
  });
});

describe("A1-6-11 friendlyDateLabel — 希望日の controlled friendly 表示（deterministic・LLM 不使用・today 注入）", () => {
  const TODAY = "2026-06-10";
  it("今日 / 明日 / 明後日 / 昨日（相対）", () => {
    expect(friendlyDateLabel("2026-06-10", TODAY)).toBe("今日");
    expect(friendlyDateLabel("2026-06-11", TODAY)).toBe("明日");
    expect(friendlyDateLabel("2026-06-12", TODAY)).toBe("明後日");
    expect(friendlyDateLabel("2026-06-09", TODAY)).toBe("昨日");
  });
  it("それ以外は M/D", () => {
    expect(friendlyDateLabel("2026-06-15", TODAY)).toBe("6/15");
    expect(friendlyDateLabel("2026-12-31", TODAY)).toBe("12/31");
  });
  it("date / today 欠落 / 不正 → null（捏造しない）", () => {
    expect(friendlyDateLabel(null, TODAY)).toBeNull();
    expect(friendlyDateLabel("2026-06-15", undefined)).toBeNull();
    expect(friendlyDateLabel("2026-06-15", null)).toBeNull();
    expect(friendlyDateLabel("not-a-date", TODAY)).toBeNull();
  });
});

describe("A1-6-11 actionResultText — action → 固定確認文（controlled formatter・LLM 不使用）", () => {
  it("accept / dismiss / later", () => {
    expect(actionResultText("accept")).toBe("予定に入れました");
    expect(actionResultText("dismiss")).toBe("今回は見送りました");
    expect(actionResultText("later")).toBe("あとで確認できます");
  });
});

describe("A1-6-11 presentCaptureCandidate — todayISO 注入で dateLabel", () => {
  it("today 注入 + date → friendly dateLabel（明日）", () => {
    const d = presentCaptureCandidate(
      dto({ items: [{ durationMin: 60, evidenceSource: "seed_explicit", date: "2026-06-11", band: "afternoon", confidenceBand: "high" }] }),
      "2026-06-10"
    );
    expect(d?.items[0].dateLabel).toBe("明日");
  });
  it("today 未注入 → dateLabel null（後方互換）", () => {
    expect(presentCaptureCandidate(dto())?.items[0].dateLabel).toBeNull();
  });
});
