import { describe, it, expect } from "vitest";

import {
  resolveApplyDraft,
  cutoutDraftToItemFields,
  skippedDraft,
} from "@/app/(immersive)/my-style/_lib/cutoutBrowser";

const CUT = "data:image/png;base64,CUT";

describe("C1L-4c-b1 — resolveApplyDraft（適用時の draft 決定）", () => {
  it("① auto success をそのまま適用 → success / heuristic_v1 / dataUrl", () => {
    const d = resolveApplyDraft({ edited: false, v1Status: "success", currentDataUrl: CUT, confidence: 0.8 });
    expect(d).toEqual({ dataUrl: CUT, status: "success", method: "heuristic_v1", confidence: 0.8 });
  });

  it("② needs_review を確認してそのまま適用 → success 昇格 / heuristic_v1 / dataUrl", () => {
    const d = resolveApplyDraft({ edited: false, v1Status: "needs_review", currentDataUrl: CUT, confidence: 0.62 });
    expect(d.status).toBe("success"); // needs_review のまま残さない
    expect(d.method).toBe("heuristic_v1");
    expect(d.dataUrl).toBe(CUT);
  });

  it("③ 消しゴム編集後に適用 → success / manual / 編集結果 dataUrl", () => {
    const d = resolveApplyDraft({ edited: true, v1Status: "needs_review", currentDataUrl: CUT, confidence: 0.62 });
    expect(d.status).toBe("success");
    expect(d.method).toBe("manual"); // 編集したら manual
    expect(d.dataUrl).toBe(CUT);
  });

  it("④ V1 failed で無編集適用 → cutout なし（dataUrl 無し・failed・none）", () => {
    const d = resolveApplyDraft({ edited: false, v1Status: "failed", currentDataUrl: null, confidence: 0.1 });
    expect(d.dataUrl).toBeUndefined();
    expect(d.status).toBe("failed");
    expect(d.method).toBe("none");
  });

  it("⑤ edited=true でも currentDataUrl が無ければ manual にしない（防御）", () => {
    const d = resolveApplyDraft({ edited: true, v1Status: "skipped", currentDataUrl: null, confidence: 0 });
    expect(d.dataUrl).toBeUndefined();
    expect(d.method).toBe("none");
    expect(d.status).toBe("skipped");
  });
});

describe("C1L-4c-b1 — cutoutDraftToItemFields（draft → 保存フィールド）", () => {
  it("① success draft → cutoutUrl / success / heuristic_v1 / confidence", () => {
    const f = cutoutDraftToItemFields({ dataUrl: CUT, status: "success", method: "heuristic_v1", confidence: 0.8 });
    expect(f.cutoutUrl).toBe(CUT);
    expect(f.cutoutStatus).toBe("success");
    expect(f.cutoutMethod).toBe("heuristic_v1");
    expect(f.cutoutConfidence).toBeCloseTo(0.8);
  });

  it("③ manual draft → cutoutUrl / success / manual", () => {
    const f = cutoutDraftToItemFields({ dataUrl: CUT, status: "success", method: "manual", confidence: 0.62 });
    expect(f.cutoutUrl).toBe(CUT);
    expect(f.cutoutMethod).toBe("manual");
  });

  it("④ skip（skippedDraft）→ cutoutUrl なし / skipped / none", () => {
    const f = cutoutDraftToItemFields(skippedDraft());
    expect(f.cutoutUrl).toBeUndefined();
    expect(f.cutoutStatus).toBe("skipped");
    expect(f.cutoutMethod).toBe("none");
    expect(f.cutoutConfidence).toBe(0); // confidence 欠落時は 0
  });

  it("⑦ failed draft → cutoutUrl なし / failed / none（登録は継続可能なフィールド）", () => {
    const f = cutoutDraftToItemFields({ status: "failed", method: "none", confidence: 0.1 });
    expect(f.cutoutUrl).toBeUndefined();
    expect(f.cutoutStatus).toBe("failed");
    expect(f.cutoutMethod).toBe("none");
  });
});
