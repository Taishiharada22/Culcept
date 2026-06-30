// tests/unit/plan/postVisit/honestyFirewall.test.ts
// 評価OS ②-7: honesty firewall（pure preflight guard）の検証。
//   件数なしスコア禁止・insufficient で強制 null・文脈欠落で条件付き不可・raw PII 検出・preflight 集約。
import { describe, it, expect } from "vitest";
import {
  checkScoreHasEvidence,
  enforceInsufficientNull,
  checkConditionalHasContext,
  detectRawPii,
  assertAllowedKeys,
  preflightHonesty,
} from "@/lib/plan/postVisit/honestyFirewall";

describe("checkScoreHasEvidence — 件数なしスコア禁止", () => {
  it("★スコアあり×evidence0 → violation", () => {
    expect(checkScoreHasEvidence({ hasScore: true, evidenceCount: 0 })?.rule).toBe("score_without_evidence");
  });
  it("★スコアあり×evidence>0 → OK(null)", () => {
    expect(checkScoreHasEvidence({ hasScore: true, evidenceCount: 3 })).toBeNull();
  });
  it("★スコアなし → OK", () => {
    expect(checkScoreHasEvidence({ hasScore: false, evidenceCount: 0 })).toBeNull();
  });
});

describe("enforceInsufficientNull — insufficient で強制 null", () => {
  it("★insufficient → null（断定させない）", () => {
    expect(enforceInsufficientNull("insufficient", 82)).toBeNull();
  });
  it("★observed/tentative → 値そのまま", () => {
    expect(enforceInsufficientNull("observed", 82)).toBe(82);
    expect(enforceInsufficientNull("tentative", 0.6)).toBe(0.6);
  });
});

describe("checkConditionalHasContext — 文脈欠落で条件付き不可", () => {
  it("★条件付き×文脈なし → violation", () => {
    expect(checkConditionalHasContext({ isConditional: true, hasContext: false })?.rule).toBe("conditional_without_context");
  });
  it("★条件付き×文脈あり → OK", () => {
    expect(checkConditionalHasContext({ isConditional: true, hasContext: true })).toBeNull();
  });
});

describe("detectRawPii — raw PII/exact 検出", () => {
  it("★禁止キー（address/locationText/companions/lat/gapMinutes）を検出", () => {
    const v = detectRawPii({ address: "x", locationText: "y", companions: ["田中"], lat: 35.6, gapMinutes: 42, placeKey: "pabc" });
    const rules = v.map((x) => x.rule);
    expect(rules).toContain("raw_pii_key");
    expect(v.length).toBeGreaterThanOrEqual(5); // address/locationText/companions/lat/gapMinutes
  });
  it("★住所原文/郵便番号らしき文字列を検出", () => {
    expect(detectRawPii("東京都江東区古込1番地").some((x) => x.rule === "raw_pii_address")).toBe(true);
    expect(detectRawPii("〒286-0013").some((x) => x.rule === "raw_pii_postal")).toBe(true);
  });
  it("★clean payload（opaque key + bucket のみ）→ 違反ゼロ", () => {
    const clean = { placeKey: "pabc123", gapBucket: "under_30", companion: "solo", state: "observed", evidenceCount: 3 };
    expect(detectRawPii(clean)).toEqual([]);
  });
});

describe("preflightHonesty — ③前の集約 guard", () => {
  it("★全 OK → ok=true", () => {
    const r = preflightHonesty({
      score: { hasScore: true, evidenceCount: 3 },
      conditional: { isConditional: true, hasContext: true },
      payload: { placeKey: "pabc", gapBucket: "under_30" },
    });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });
  it("★違反あり → ok=false・違反列挙（ranking に渡してはいけない）", () => {
    const r = preflightHonesty({
      score: { hasScore: true, evidenceCount: 0 },           // 件数なしスコア
      conditional: { isConditional: true, hasContext: false }, // 文脈欠落
      payload: { address: "東京都..." },                       // raw PII
    });
    expect(r.ok).toBe(false);
    expect(r.violations.length).toBeGreaterThanOrEqual(3);
  });
});

describe("detectRawPii — 追加 PII RE（電話/メール/URL/生座標）", () => {
  it("★電話/メール/URL/生座標ペアを検出", () => {
    expect(detectRawPii("090-1234-5678").some((v) => v.rule === "raw_pii_phone")).toBe(true);
    expect(detectRawPii("taro@example.com").some((v) => v.rule === "raw_pii_email")).toBe(true);
    expect(detectRawPii("https://maps.google.com/x").some((v) => v.rule === "raw_pii_url")).toBe(true);
    expect(detectRawPii("35.659, 139.700").some((v) => v.rule === "raw_pii_latlng")).toBe(true);
  });
  it("★clean な opaque key + bucket は誤検出しない", () => {
    expect(detectRawPii({ placeKey: "pabc123", gapBucket: "under_30", state: "observed" })).toEqual([]);
  });
});

describe("assertAllowedKeys — allowlist 反転（privacy-by-design）", () => {
  const allowed = new Set(["placeKey", "state", "evidenceCount"]);
  it("★許可キーのみ → 違反ゼロ", () => {
    expect(assertAllowedKeys({ placeKey: "p", state: "observed", evidenceCount: 3 }, allowed)).toEqual([]);
  });
  it("★allowlist 外のキー（denylist に無い未知キーでも）→ unexpected_key", () => {
    const v = assertAllowedKeys({ placeKey: "p", futureField: "x" }, allowed);
    expect(v.some((x) => x.rule === "unexpected_key")).toBe(true);
  });
  it("★allowed 空 set は無効化（後方互換）", () => {
    expect(assertAllowedKeys({ anything: 1 }, new Set())).toEqual([]);
  });
});

describe("preflightHonesty — allowlist 連携", () => {
  it("★allowedKeys 指定で denylist に無い許可外キーも ok=false", () => {
    const r = preflightHonesty({ payload: { placeKey: "p", futureField: "x" }, allowedKeys: new Set(["placeKey"]) });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.rule === "unexpected_key")).toBe(true);
  });
  it("★allowedKeys 未指定なら従来どおり（denylist のみ）", () => {
    const r = preflightHonesty({ payload: { placeKey: "p", futureField: "x" } });
    expect(r.ok).toBe(true); // futureField は denylist 非該当ゆえ素通り（allowlist 未指定）
  });
});
