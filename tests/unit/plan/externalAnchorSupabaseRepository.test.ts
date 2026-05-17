/**
 * SupabaseExternalAnchorRepository contract verification (A-2)
 *
 * Mock SupabaseClient で contract test を回し、memory 実装と同等の振る舞いを保証する。
 * 重点項目:
 *   1. validation path（pure validation が DB call 前に効く）
 *   2. happy path（INSERT → SELECT → 戻り値 shape）
 *   3. user scoping（listSources / listAnchors の .eq 'user_id' 発火）
 *   4. compensating delete（anchors INSERT 失敗時に source を消す）
 *   5. orphan source logging（compensating delete 自体が失敗）
 *   6. deleteSource の information leak prevention（user 不一致 = 不在）
 */

import { describe, it, expect, vi } from "vitest";

import type { CreateExternalAnchorInput } from "@/lib/plan/external-anchor-input";
import type {
  CreateExternalAnchorSourceInput,
  CreateSourceWithAnchorsInput,
} from "@/lib/plan/external-anchor-repository";
import {
  createSupabaseExternalAnchorRepository,
  type SupabaseRepoLogEvent,
} from "@/lib/plan/external-anchor-repository-supabase";
import { createMockSupabaseClient } from "@/tests/fixtures/mockSupabaseClient";

const USER_A = "00000000-0000-0000-0000-00000000000a";
const USER_B = "00000000-0000-0000-0000-00000000000b";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeOneOff(
  overrides: Partial<Extract<CreateExternalAnchorInput, { anchorKind: "one_off" }>> = {}
): CreateExternalAnchorInput {
  return {
    anchorKind: "one_off",
    title: "歯科予約",
    date: "2026-05-10",
    startTime: "14:30",
    rigidity: "hard",
    sourceType: "manual",
    ...overrides,
  };
}

function makeRecurring(
  overrides: Partial<Extract<CreateExternalAnchorInput, { anchorKind: "recurring" }>> = {}
): CreateExternalAnchorInput {
  return {
    anchorKind: "recurring",
    title: "週次ミーティング",
    validFrom: "2026-04-01",
    recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
    startTime: "10:00",
    rigidity: "soft",
    sourceType: "template",
    ...overrides,
  };
}

function manualSource(
  overrides: Partial<CreateExternalAnchorSourceInput> = {}
): CreateExternalAnchorSourceInput {
  return { sourceType: "manual", ...overrides };
}

function makeBundle(
  anchors: CreateExternalAnchorInput[],
  source: CreateExternalAnchorSourceInput = manualSource()
): CreateSourceWithAnchorsInput {
  return { source, anchors };
}

function makeRepo(loggerSpy?: (e: SupabaseRepoLogEvent) => void) {
  const client = createMockSupabaseClient({ idPrefix: "row" });
  const repo = createSupabaseExternalAnchorRepository(client.asSupabaseClient(), {
    ...(loggerSpy ? { logger: loggerSpy } : {}),
  });
  return { client, repo };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("SupabaseExternalAnchorRepository — contract", () => {
  // ── happy paths ──

  describe("createSourceWithAnchors — happy", () => {
    it("one_off 1 件を保存し、DB 補完値（id / capturedAt / confirmedAt）を返す", async () => {
      const { repo, client } = makeRepo();
      const r = await repo.createSourceWithAnchors(USER_A, makeBundle([makeOneOff()]));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.source.id).toMatch(/^row-/);
      expect(r.source.userId).toBe(USER_A);
      expect(r.source.sourceType).toBe("manual");
      expect(r.source.rawRetention).toBe("discarded");
      expect(r.source.capturedAt).toBe("2026-05-01T00:00:00.000Z");
      expect(r.anchors).toHaveLength(1);
      const a = r.anchors[0]!;
      expect(a.userId).toBe(USER_A);
      expect(a.sourceId).toBe(r.source.id);
      expect(a.confirmedAt).toBe("2026-05-01T00:00:00.000Z");
      if (a.anchorKind === "one_off") {
        expect(a.date).toBe("2026-05-10");
      }
      // store に書き込まれている
      expect(client.inspect("external_anchor_sources")).toHaveLength(1);
      expect(client.inspect("external_anchors")).toHaveLength(1);
    });

    it("recurring 1 件を保存し、recurring 専用 field のみが anchor に乗る", async () => {
      const { repo } = makeRepo();
      const r = await repo.createSourceWithAnchors(
        USER_A,
        makeBundle([makeRecurring()], manualSource({ sourceType: "template" }))
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const a = r.anchors[0]!;
      if (a.anchorKind === "recurring") {
        expect(a.validFrom).toBe("2026-04-01");
        expect(a.recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=MO");
        // one_off 専用 field は乗らない
        expect((a as Record<string, unknown>).date).toBeUndefined();
      } else {
        throw new Error("expected recurring");
      }
    });

    it("one_off + recurring を混在保存できる", async () => {
      const { repo } = makeRepo();
      const r = await repo.createSourceWithAnchors(
        USER_A,
        makeBundle([makeOneOff(), makeRecurring()])
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.anchors).toHaveLength(2);
      expect(r.anchors[0]!.anchorKind).toBe("one_off");
      expect(r.anchors[1]!.anchorKind).toBe("recurring");
    });

    it("anchors が空 → source-only で保存（memory と一致）", async () => {
      const { repo, client } = makeRepo();
      const r = await repo.createSourceWithAnchors(USER_A, makeBundle([]));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.anchors).toHaveLength(0);
      expect(client.inspect("external_anchor_sources")).toHaveLength(1);
      expect(client.inspect("external_anchors")).toHaveLength(0);
    });

    it("source の optional field を保存・復元できる", async () => {
      const { repo } = makeRepo();
      const r = await repo.createSourceWithAnchors(
        USER_A,
        makeBundle(
          [makeOneOff()],
          manualSource({
            notes: "PDF 1 枚から抽出",
            extractedAt: "2026-04-29T10:00:00Z",
            originalFilename: "exam-schedule.pdf",
            sourceType: "pdf",
            rawRetention: "stored",
            rawStoragePath: "/raw/exam.pdf",
            rawExpiresAt: "2026-05-29T00:00:00Z",
          })
        )
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.source.notes).toBe("PDF 1 枚から抽出");
      expect(r.source.originalFilename).toBe("exam-schedule.pdf");
      expect(r.source.sourceType).toBe("pdf");
      expect(r.source.rawRetention).toBe("stored");
      expect(r.source.rawStoragePath).toBe("/raw/exam.pdf");
    });
  });

  // ── validation path ──

  describe("createSourceWithAnchors — validation", () => {
    it("source 無効 → DB call せず errors を返す", async () => {
      const { repo, client } = makeRepo();
      const r = await repo.createSourceWithAnchors(
        USER_A,
        makeBundle([makeOneOff()], {
          sourceType: "bogus" as unknown as CreateExternalAnchorSourceInput["sourceType"],
        })
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.errors).toEqual([
        expect.objectContaining({ kind: "source_invalid" }),
      ]);
      // 副作用なし
      expect(client.inspect("external_anchor_sources")).toHaveLength(0);
      expect(client.inspect("external_anchors")).toHaveLength(0);
    });

    it("anchor の 1 件が無効 → 全体 reject、副作用なし", async () => {
      const { repo, client } = makeRepo();
      const r = await repo.createSourceWithAnchors(
        USER_A,
        makeBundle([makeOneOff(), makeOneOff({ date: "9999-99-99" })])
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.errors).toEqual([
        expect.objectContaining({ kind: "anchor_invalid", index: 1 }),
      ]);
      expect(client.inspect("external_anchor_sources")).toHaveLength(0);
      expect(client.inspect("external_anchors")).toHaveLength(0);
    });

    it("複数 invalid → すべて errors に集約（fail-fast にしない）", async () => {
      const { repo } = makeRepo();
      const r = await repo.createSourceWithAnchors(
        USER_A,
        makeBundle(
          [
            makeOneOff({ date: "bad" }),
            makeRecurring({ recurrenceRule: "" }),
          ],
          { sourceType: "bogus" as unknown as CreateExternalAnchorSourceInput["sourceType"] }
        )
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      const kinds = r.errors.map((e) => e.kind);
      expect(kinds).toContain("source_invalid");
      expect(kinds.filter((k) => k === "anchor_invalid")).toHaveLength(2);
    });
  });

  // ── DB error path ──

  describe("createSourceWithAnchors — DB error / atomicity", () => {
    it("source INSERT が DB error → source_invalid を返し、anchors INSERT は走らない", async () => {
      const { repo, client } = makeRepo();
      client.failNext("insert", "external_anchor_sources", {
        code: "23514",
        message: "check_violation",
      });
      const r = await repo.createSourceWithAnchors(USER_A, makeBundle([makeOneOff()]));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.errors[0]!.kind).toBe("source_invalid");
      expect(client.inspect("external_anchor_sources")).toHaveLength(0);
      expect(client.inspect("external_anchors")).toHaveLength(0);
    });

    it("anchors batch INSERT が DB error → compensating delete で source が消える", async () => {
      const logger = vi.fn();
      const { repo, client } = makeRepo(logger);
      client.failNext("insert", "external_anchors", {
        code: "23514",
        message: "check_violation",
      });
      const r = await repo.createSourceWithAnchors(USER_A, makeBundle([makeOneOff()]));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.errors[0]!.kind).toBe("anchor_invalid");
      // compensating delete で source は消えている
      expect(client.inspect("external_anchor_sources")).toHaveLength(0);
      expect(client.inspect("external_anchors")).toHaveLength(0);
      // logger に compensating_delete_attempted が記録
      const events = logger.mock.calls.map((c) => c[0] as SupabaseRepoLogEvent);
      expect(events.find((e) => e.kind === "compensating_delete_attempted")).toBeDefined();
    });

    it("compensating delete も失敗 → orphan_source が logger に記録される", async () => {
      const logger = vi.fn();
      const { repo, client } = makeRepo(logger);
      client.failNext("insert", "external_anchors", {
        code: "23514",
        message: "check_violation",
      });
      // 続けて compensating delete も失敗させる
      client.failNext("delete", "external_anchor_sources", {
        code: "42501",
        message: "permission denied",
      });
      const r = await repo.createSourceWithAnchors(USER_A, makeBundle([makeOneOff()]));
      expect(r.ok).toBe(false);
      // source は残ったまま
      expect(client.inspect("external_anchor_sources")).toHaveLength(1);
      // logger に orphan_source が記録
      const events = logger.mock.calls.map((c) => c[0] as SupabaseRepoLogEvent);
      const orphan = events.find((e) => e.kind === "orphan_source");
      expect(orphan).toBeDefined();
      if (orphan && orphan.kind === "orphan_source") {
        expect(orphan.userId).toBe(USER_A);
        expect(orphan.sourceId).toMatch(/^row-/);
      }
    });
  });

  // ── listSources / listAnchors ──

  describe("listSources / listAnchors — user scoping", () => {
    it("自分の source / anchors のみが返る（他人のは見えない）", async () => {
      const { repo } = makeRepo();
      await repo.createSourceWithAnchors(USER_A, makeBundle([makeOneOff()]));
      await repo.createSourceWithAnchors(USER_B, makeBundle([makeOneOff({ title: "B 用" })]));

      const sourcesA = await repo.listSources(USER_A);
      expect(sourcesA).toHaveLength(1);
      expect(sourcesA[0]!.userId).toBe(USER_A);

      const anchorsA = await repo.listAnchors(USER_A);
      expect(anchorsA).toHaveLength(1);
      expect(anchorsA[0]!.userId).toBe(USER_A);

      const sourcesB = await repo.listSources(USER_B);
      expect(sourcesB).toHaveLength(1);
      expect(sourcesB[0]!.userId).toBe(USER_B);
    });

    it("該当 0 件 → 空配列（throw しない）", async () => {
      const { repo } = makeRepo();
      const s = await repo.listSources(USER_A);
      const a = await repo.listAnchors(USER_A);
      expect(s).toEqual([]);
      expect(a).toEqual([]);
    });

    it("DB error → throw", async () => {
      const { repo, client } = makeRepo();
      client.failNext("select", "external_anchor_sources", {
        code: "MOCK_ERROR",
        message: "boom",
      });
      await expect(repo.listSources(USER_A)).rejects.toThrow(/listSources failed/);
    });
  });

  // ── deleteSource ──

  describe("deleteSource", () => {
    it("自分の source を削除 → deletedAnchors に anchors 件数が返る", async () => {
      const { repo } = makeRepo();
      const created = await repo.createSourceWithAnchors(
        USER_A,
        makeBundle([makeOneOff(), makeRecurring()])
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const sourceId = created.source.id;

      const result = await repo.deleteSource(USER_A, sourceId);
      expect(result.deletedSource).toBe(true);
      expect(result.deletedAnchors).toBe(2);
    });

    it("user 不一致 → { deletedSource: false, deletedAnchors: 0 }（情報漏洩防止）", async () => {
      const { repo, client } = makeRepo();
      const created = await repo.createSourceWithAnchors(USER_A, makeBundle([makeOneOff()]));
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const sourceId = created.source.id;

      const result = await repo.deleteSource(USER_B, sourceId);
      expect(result).toEqual({ deletedSource: false, deletedAnchors: 0 });
      // A の source は残っている
      expect(client.inspect("external_anchor_sources")).toHaveLength(1);
    });

    it("source 不在 → { deletedSource: false, deletedAnchors: 0 }（user 不一致と同一）", async () => {
      const { repo } = makeRepo();
      const result = await repo.deleteSource(USER_A, "nonexistent-source-id");
      expect(result).toEqual({ deletedSource: false, deletedAnchors: 0 });
    });
  });
});
