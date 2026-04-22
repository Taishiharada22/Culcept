/**
 * normalizePlanItem tests — W3-PR-8 Strict Confirmation
 *
 * 設計書: docs/alter-morning-strict-confirmation-design.md §3.4
 *
 * カバレッジ:
 *   - PR-8 追加フィールドが欠損している旧 item → provisional / missing に倒れる
 *   - vague なのに whereVagueSubKind 未指定 → "undecided"（最保守フォールバック）
 *   - fixed / missing の場合は whereVagueSubKind = undefined（null shape は避ける）
 *   - 既存フィールド（id / text / kind / durationMin 等）は保持される
 *   - 明示的な confirmationState / sharpness は尊重される
 */

import { describe, test, expect } from "vitest";

import { normalizePlanItem } from "@/lib/alter-morning/normalizedPlanItem";
import type { PlanItem } from "@/lib/alter-morning/types";

function mkRawItem(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: "ev_1",
    kind: "todo",
    text: "テスト",
    what: "テスト",
    durationMin: 45,
    fixedStart: false,
    orderHint: 0,
    sourceTurnIndex: 0,
    completed: false,
    ...overrides,
  };
}

describe("normalizePlanItem — 欠損時フォールバック", () => {
  test("PR-8 フィールド全欠損 → provisional / missing で埋まる", () => {
    const normalized = normalizePlanItem(mkRawItem());
    expect(normalized.confirmationState).toBe("provisional");
    expect(normalized.whenSharpness).toBe("missing");
    expect(normalized.whereSharpness).toBe("missing");
    expect(normalized.whatSharpness).toBe("missing");
    expect(normalized.whereVagueSubKind).toBeUndefined();
  });

  test("whereSharpness=vague だが whereVagueSubKind 未指定 → 'undecided' にフォールバック", () => {
    const normalized = normalizePlanItem(
      mkRawItem({
        whenSharpness: "fixed",
        whereSharpness: "vague",
        whatSharpness: "fixed",
        // whereVagueSubKind は意図的に未指定
      }),
    );
    expect(normalized.whereVagueSubKind).toBe("undecided");
  });

  test("whereSharpness=fixed → whereVagueSubKind は undefined（vague 以外では値を持たない）", () => {
    const normalized = normalizePlanItem(
      mkRawItem({
        whenSharpness: "fixed",
        whereSharpness: "fixed",
        whatSharpness: "fixed",
        whereVagueSubKind: "anchor", // 不正な組み合わせだが defensive に undefined に倒す
      }),
    );
    expect(normalized.whereVagueSubKind).toBeUndefined();
  });

  test("whereSharpness=missing → whereVagueSubKind は undefined", () => {
    const normalized = normalizePlanItem(
      mkRawItem({
        whereSharpness: "missing",
      }),
    );
    expect(normalized.whereVagueSubKind).toBeUndefined();
  });
});

describe("normalizePlanItem — 明示値の尊重", () => {
  test("confirmationState を明示していれば保持", () => {
    const normalized = normalizePlanItem(
      mkRawItem({
        confirmationState: "confirmed",
        whenSharpness: "fixed",
        whereSharpness: "fixed",
        whatSharpness: "fixed",
      }),
    );
    expect(normalized.confirmationState).toBe("confirmed");
  });

  test("needs_answer を明示していれば保持", () => {
    const normalized = normalizePlanItem(
      mkRawItem({
        confirmationState: "needs_answer",
        whenSharpness: "missing",
      }),
    );
    expect(normalized.confirmationState).toBe("needs_answer");
    expect(normalized.whenSharpness).toBe("missing");
  });

  test("vague + 明示 sub-kind は保持される", () => {
    const normalized = normalizePlanItem(
      mkRawItem({
        whereSharpness: "vague",
        whereVagueSubKind: "anchor",
      }),
    );
    expect(normalized.whereVagueSubKind).toBe("anchor");
  });

  test("category_chain sub-kind が保持される", () => {
    const normalized = normalizePlanItem(
      mkRawItem({
        whereSharpness: "vague",
        whereVagueSubKind: "category_chain",
      }),
    );
    expect(normalized.whereVagueSubKind).toBe("category_chain");
  });
});

describe("normalizePlanItem — 既存フィールド保持", () => {
  test("id / text / kind / durationMin 等は素通り", () => {
    const normalized = normalizePlanItem(
      mkRawItem({
        id: "event_42",
        kind: "fixed",
        text: "09:00 スタバ コーヒー",
        what: "コーヒー",
        startTime: "09:00",
        durationMin: 60,
        fixedStart: true,
        orderHint: 3,
        sourceTurnIndex: 1,
      }),
    );
    expect(normalized.id).toBe("event_42");
    expect(normalized.kind).toBe("fixed");
    expect(normalized.text).toBe("09:00 スタバ コーヒー");
    expect(normalized.what).toBe("コーヒー");
    expect(normalized.startTime).toBe("09:00");
    expect(normalized.durationMin).toBe(60);
    expect(normalized.fixedStart).toBe(true);
  });
});
