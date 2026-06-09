/**
 * Life Ops Deadline Engine（期限もの・pure）— 期日逆算で事務を候補化。
 *   within_lead/overdue のみ候補化・not_yet/unknown skip・断定しない・now 注入・横非接続。
 */
import { describe, it, expect } from "vitest";
import {
  getDeadlineSpec,
  listMvpDeadlines,
  computeDeadlineStatus,
  generateDeadlineCandidates,
  type DeadlineObservation,
} from "@/lib/lifeops/deadline-engine";

const NOW = "2026-06-12T00:00:00Z";
const license = getDeadlineSpec("license_renewal")!; // leadDays 30

describe("Deadline spec", () => {
  it("MVP は 3 件（免許/パスポート/税）", () => {
    expect(listMvpDeadlines().map((s) => s.categoryId).sort()).toEqual(["license_renewal", "passport_renewal", "tax_filing"]);
  });
  it("leadDays: 免許30/パスポート60/税21", () => {
    expect(getDeadlineSpec("license_renewal")!.leadDays).toBe(30);
    expect(getDeadlineSpec("passport_renewal")!.leadDays).toBe(60);
    expect(getDeadlineSpec("tax_filing")!.leadDays).toBe(21);
  });
  it("未知 → undefined", () => expect(getDeadlineSpec("unknown_xyz")).toBeUndefined());
});

describe("computeDeadlineStatus — 段階（断定しない・unknown 優先）", () => {
  it("期日 null / 不正 ISO → unknown", () => {
    expect(computeDeadlineStatus(license, null, NOW).phase).toBe("unknown");
    expect(computeDeadlineStatus(license, "broken", NOW).phase).toBe("unknown");
  });
  it("超過（過去）→ overdue", () => {
    expect(computeDeadlineStatus(license, "2026-06-01", NOW).phase).toBe("overdue"); // -11日
  });
  it("leadDays 以内 → within_lead", () => {
    expect(computeDeadlineStatus(license, "2026-06-25", NOW).phase).toBe("within_lead"); // 13日 ≤30
    expect(computeDeadlineStatus(license, "2026-07-12", NOW).phase).toBe("within_lead"); // 30日 ちょうど
  });
  it("leadDays より先 → not_yet", () => {
    expect(computeDeadlineStatus(license, "2026-08-01", NOW).phase).toBe("not_yet"); // 50日 >30
  });
  it("daysUntilDeadline は事実を保持", () => {
    expect(computeDeadlineStatus(license, "2026-06-25", NOW).daysUntilDeadline).toBe(13);
  });
});

describe("generateDeadlineCandidates", () => {
  it("within_lead / overdue を候補化（not_yet/unknown は出さない）", () => {
    const out = generateDeadlineCandidates(
      [
        { categoryId: "license_renewal", deadlineISO: "2026-06-25" }, // 13日 within_lead
        { categoryId: "passport_renewal", deadlineISO: "2026-12-01" }, // 172日 not_yet
        { categoryId: "tax_filing", deadlineISO: "2026-06-05" }, // -7日 overdue
      ],
      NOW,
    );
    expect(out.map((c) => c.category).sort()).toEqual(["license_renewal", "tax_filing"]);
  });
  it("候補内容: deadline dueReason・L1・menu null・placeQuery null", () => {
    const [c] = generateDeadlineCandidates([{ categoryId: "license_renewal", deadlineISO: "2026-06-25" }], NOW);
    expect(c.category).toBe("license_renewal");
    expect(c.menu).toBeNull();
    expect(c.placeQuery).toBeNull();
    expect(c.permissionLevelHint).toBe("L1");
    expect(c.dueReason.kind).toBe("deadline");
    if (c.dueReason.kind === "deadline") {
      expect(c.dueReason.daysUntilDeadline).toBe(13);
      expect(c.dueReason.leadDays).toBe(30);
      expect(c.dueReason.overdue).toBe(false);
    }
  });
  it("overdue は overdue=true・差し迫った順（overdue が最前）", () => {
    const out = generateDeadlineCandidates(
      [
        { categoryId: "license_renewal", deadlineISO: "2026-06-25" }, // 13日
        { categoryId: "tax_filing", deadlineISO: "2026-06-05" }, // -7日 overdue
      ],
      NOW,
    );
    expect(out[0].category).toBe("tax_filing"); // -7 < 13
    if (out[0].dueReason.kind === "deadline") expect(out[0].dueReason.overdue).toBe(true);
  });
  it("MVP外/期日不明 → 出さない・空入力→空", () => {
    expect(generateDeadlineCandidates([{ categoryId: "rent", deadlineISO: "2026-06-13" }], NOW)).toEqual([]); // recurring 未対応
    expect(generateDeadlineCandidates([{ categoryId: "license_renewal", deadlineISO: null }], NOW)).toEqual([]);
    expect(generateDeadlineCandidates([], NOW)).toEqual([]);
  });
  it("同入力は同出力（pure・deterministic）", () => {
    const o: DeadlineObservation[] = [{ categoryId: "license_renewal", deadlineISO: "2026-06-25" }];
    expect(generateDeadlineCandidates(o, NOW)).toEqual(generateDeadlineCandidates(o, NOW));
  });
});
