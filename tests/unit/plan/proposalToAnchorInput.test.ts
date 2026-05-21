/**
 * Phase 3-J-6e-3: buildAnchorInputFromProposal unit tests
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-6 / J-6e-3 detailed plan
 *
 * 検証範囲:
 *   - 完全 draft → ok:true + 完全 CreateExternalAnchorInput
 *   - 必須 field 欠落 → ok:false + reason
 *   - sensitive 混入 → ok:false reason="sensitive_not_allowed" (= defensive 二重防御)
 *   - recurring → ok:false reason="unsupported_anchor_kind" (= MVP one_off only)
 *   - mutate なし
 */

import { describe, expect, it } from "vitest";

import { buildAnchorInputFromProposal } from "@/lib/plan/proposal/proposalToAnchorInput";
import type { ProposedAnchor } from "@/lib/plan/proposal/proposalTypes";

function proposal(draftOverride: Partial<ProposedAnchor["draft"]> = {}): ProposedAnchor {
  return {
    id: "proposal_test",
    reason: "pattern_repeat",
    direction: "continue_pattern",
    confidence: "medium",
    draft: {
      title: "カフェ",
      startTime: "14:00",
      rigidity: "soft",
      anchorKind: "one_off",
      date: "2026-05-22",
      ...draftOverride,
    },
    source: {
      signalType: "pattern_repeat",
      evidenceCount: 3,
      generatedAt: "2026-05-21T00:00:00.000Z",
    },
    createdAt: "2026-05-21T00:00:00.000Z",
  };
}

describe("buildAnchorInputFromProposal — ok cases", () => {
  it("完全 draft → ok:true + input 完全", () => {
    const r = buildAnchorInputFromProposal(proposal());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input.title).toBe("カフェ");
      expect(r.input.startTime).toBe("14:00");
      expect(r.input.rigidity).toBe("soft");
      expect(r.input.sourceType).toBe("manual");
      expect(r.input.anchorKind).toBe("one_off");
      if (r.input.anchorKind === "one_off") {
        expect(r.input.date).toBe("2026-05-22");
      }
    }
  });

  it("endTime / locationText / locationCategory 全 spread", () => {
    const r = buildAnchorInputFromProposal(
      proposal({
        endTime: "15:00",
        locationText: "新宿",
        locationCategory: "cafe",
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input.endTime).toBe("15:00");
      expect(r.input.locationText).toBe("新宿");
      expect(r.input.locationCategory).toBe("cafe");
    }
  });

  it("optional fields 欠落 → input に含めない", () => {
    const r = buildAnchorInputFromProposal(
      proposal({ endTime: undefined, locationText: undefined }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect("endTime" in r.input).toBe(false);
      expect("locationText" in r.input).toBe(false);
    }
  });
});

describe("buildAnchorInputFromProposal — defensive reject", () => {
  it("sensitive 混入 → ok:false reason='sensitive_not_allowed'", () => {
    const r = buildAnchorInputFromProposal(
      proposal({ sensitiveCategory: "medical" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("sensitive_not_allowed");
  });

  it("anchorKind='recurring' → unsupported_anchor_kind", () => {
    const r = buildAnchorInputFromProposal(
      proposal({ anchorKind: "recurring", date: undefined }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unsupported_anchor_kind");
  });

  it("anchorKind undefined → unsupported_anchor_kind", () => {
    const r = buildAnchorInputFromProposal(proposal({ anchorKind: undefined }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unsupported_anchor_kind");
  });
});

describe("buildAnchorInputFromProposal — missing required", () => {
  it("title 欠落", () => {
    const r = buildAnchorInputFromProposal(proposal({ title: undefined }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing_title");
  });

  it("title 空文字", () => {
    const r = buildAnchorInputFromProposal(proposal({ title: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing_title");
  });

  it("startTime 欠落", () => {
    const r = buildAnchorInputFromProposal(proposal({ startTime: undefined }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing_startTime");
  });

  it("rigidity 欠落", () => {
    const r = buildAnchorInputFromProposal(proposal({ rigidity: undefined }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing_rigidity");
  });

  it("date 欠落 (one_off)", () => {
    const r = buildAnchorInputFromProposal(proposal({ date: undefined }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing_date");
  });
});

describe("buildAnchorInputFromProposal — input mutation", () => {
  it("input proposal を mutate しない", () => {
    const p = proposal();
    const frozen = JSON.stringify(p);
    buildAnchorInputFromProposal(p);
    expect(JSON.stringify(p)).toBe(frozen);
  });
});
