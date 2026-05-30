/**
 * In-memory ShiftImportRepository — SR Step 6A
 *
 * atomic bundle 契約（source + anchors + day_indicators の all-or-nothing 保存）を
 * メモリ上で実装し、**transaction / rollback を test で実証する**ための test double。
 * 実 DB write はしない（実 Supabase/RPC 実装は 6B）。
 *
 * atomic 実装方針（既存 createSourceWithAnchors と同思想）:
 *   1. 全 anchor / indicator を validate。1 件でも invalid → errors 集約して即 reject（無書込）。
 *   2. failDuringCommit（test 注入）が true → 全 valid でも persistence_failed で reject（無書込 = rollback）。
 *   3. それ以外 → staged レコードを一括 commit（source-first で sourceId 注入）。
 *
 * 不変原則: store への書き込みは「全件成功」時のみ。途中状態を残さない。
 */

import {
  validateCreateExternalAnchorInput,
} from "@/lib/plan/external-anchor-input";
import {
  validateShiftDayIndicatorInput,
  type ShiftImportRepository,
  type ShiftImportRepositoryDependencies,
  type ShiftImportBundleInput,
  type ShiftImportSaveResult,
  type ShiftImportSaveError,
  type SavedShiftImportSource,
  type SavedShiftAnchor,
  type SavedShiftDayIndicator,
} from "./shiftImportRepository";

export interface InMemoryShiftImportRepositoryOptions
  extends ShiftImportRepositoryDependencies {
  /**
   * test 用: validate 通過後の commit 段で失敗を注入し、rollback（無書込）を検証する。
   * 実運用の「DB error で全体 rollback」を模す。
   */
  failDuringCommit?: boolean;
}

export interface InMemoryShiftImportRepository extends ShiftImportRepository {
  /** test 用 read: 保存済 source（他 user 含む全件、検証用） */
  _allSources(): SavedShiftImportSource[];
  _allAnchors(): SavedShiftAnchor[];
  _allDayIndicators(): SavedShiftDayIndicator[];
  /** 何も保存されていないか（rollback 検証用） */
  _isEmpty(): boolean;
}

let __seq = 0;

export function createInMemoryShiftImportRepository(
  options: InMemoryShiftImportRepositoryOptions = {}
): InMemoryShiftImportRepository {
  // 決定論的でない値を test に持ち込まないよう、未指定時は連番 / 固定時刻にする
  const idFactory =
    options.idFactory ?? (() => `mem-${(__seq += 1).toString().padStart(4, "0")}`);
  const now = options.now ?? (() => "2025-07-15T00:00:00.000Z");
  const failDuringCommit = options.failDuringCommit ?? false;

  const sources: SavedShiftImportSource[] = [];
  const anchors: SavedShiftAnchor[] = [];
  const dayIndicators: SavedShiftDayIndicator[] = [];

  return {
    async saveShiftImportBundle(
      userId: string,
      input: ShiftImportBundleInput
    ): Promise<ShiftImportSaveResult> {
      const errors: ShiftImportSaveError[] = [];

      // ── 1. validate（無書込で全件検査）──
      input.anchors.forEach((a, index) => {
        const r = validateCreateExternalAnchorInput(a);
        if (!r.valid) {
          errors.push({ kind: "anchor_invalid", index, errors: r.errors });
          return;
        }
        if (a.anchorKind !== "one_off") {
          errors.push({
            kind: "anchor_invalid",
            index,
            errors: [
              {
                field: "anchorKind",
                code: "not_allowed_value",
                message: "shift anchors must be one_off",
              },
            ],
          });
        }
      });

      input.dayIndicators.forEach((ind, index) => {
        const indErrors = validateShiftDayIndicatorInput(ind);
        if (indErrors.length > 0) {
          errors.push({ kind: "indicator_invalid", index, errors: indErrors });
        }
      });

      if (errors.length > 0) {
        return { ok: false, errors };
      }

      // ── 2. commit 段の失敗注入（rollback 検証）──
      if (failDuringCommit) {
        return {
          ok: false,
          errors: [
            {
              kind: "persistence_failed",
              message: "injected commit failure (atomic rollback)",
            },
          ],
        };
      }

      // ── 3. staged build（source-first）→ 一括 commit ──
      const sourceId = idFactory();
      const capturedAt = now();
      const stagedSource: SavedShiftImportSource = {
        id: sourceId,
        userId,
        sourceType: "shift_image",
        ...(input.source.originalFilename
          ? { originalFilename: input.source.originalFilename }
          : {}),
        capturedAt,
      };

      const stagedAnchors: SavedShiftAnchor[] = input.anchors.map((a) => {
        // 上の validate で one_off 確定
        const one = a as Extract<typeof a, { anchorKind: "one_off" }>;
        return {
          id: idFactory(),
          userId,
          sourceId,
          date: one.date,
          title: one.title,
          startTime: one.startTime,
          ...(one.endTime ? { endTime: one.endTime } : {}),
          rigidity: one.rigidity,
          confirmedAt: now(),
        };
      });

      const stagedIndicators: SavedShiftDayIndicator[] = input.dayIndicators.map(
        (ind) => {
          const ts = now();
          return {
            id: idFactory(),
            userId,
            sourceId,
            date: ind.date,
            kind: ind.kind,
            label: ind.label,
            countsAsPublicHoliday: ind.countsAsPublicHoliday,
            rawCode: ind.rawCode,
            semanticType: ind.semanticType,
            sourceType: "shift_image",
            createdAt: ts,
            updatedAt: ts,
          };
        }
      );

      // 全件成功 — まとめて commit
      sources.push(stagedSource);
      anchors.push(...stagedAnchors);
      dayIndicators.push(...stagedIndicators);

      return {
        ok: true,
        source: stagedSource,
        anchors: stagedAnchors,
        dayIndicators: stagedIndicators,
      };
    },

    _allSources: () => [...sources],
    _allAnchors: () => [...anchors],
    _allDayIndicators: () => [...dayIndicators],
    _isEmpty: () =>
      sources.length === 0 && anchors.length === 0 && dayIndicators.length === 0,
  };
}
