/**
 * RPC-backed ShiftImportRepository — SR Step 6B
 *
 * ShiftImportRepository を、注入された ShiftImportRpcClient 越しに実装する薄い wrapper。
 * 真の atomic / range-scoped replace / conflict 検出は RPC（Postgres 関数）側が担う。
 * 本 repository は「入力 validate → RPC params に写像 → 呼び出し → 結果写像」だけを行う。
 *
 * 6B 範囲: 実 Supabase client は注入しない（fake client で契約検証）。
 *   実 client 接続は migration apply + database.types regen 後（6B-apply）。
 *
 * 不変原則:
 *   - 無効な anchor / indicator は RPC を呼ばずに即 reject（無駄な DB 呼び出しを避ける）。
 *   - importRange 必須（range-scoped replace の境界）。欠落時は呼ばずに reject。
 *   - RPC が conflict（手動印との衝突）を返したら manual_indicator_conflict として保存ブロック。
 */

import { validateCreateExternalAnchorInput } from "@/lib/plan/external-anchor-input";
import {
  validateShiftDayIndicatorInput,
  type ShiftImportRepository,
  type ShiftImportRepositoryDependencies,
  type ShiftImportBundleInput,
  type ShiftImportSaveResult,
  type ShiftImportSaveError,
  type SavedShiftAnchor,
  type SavedShiftDayIndicator,
} from "./shiftImportRepository";
import type {
  ShiftImportRpcClient,
  ShiftImportRpcAnchor,
  ShiftImportRpcIndicator,
} from "./shiftImportRpc";

export function createRpcShiftImportRepository(
  rpcClient: ShiftImportRpcClient,
  deps: ShiftImportRepositoryDependencies = {}
): ShiftImportRepository {
  const idFactory =
    deps.idFactory ?? (() => globalThis.crypto.randomUUID());
  const now = deps.now ?? (() => new Date().toISOString());

  return {
    async saveShiftImportBundle(
      userId: string,
      input: ShiftImportBundleInput
    ): Promise<ShiftImportSaveResult> {
      // ── 0. importRange 必須（range-scoped replace の境界）──
      if (!input.importRange) {
        return {
          ok: false,
          errors: [
            {
              kind: "persistence_failed",
              message: "importRange is required for RPC (range-scoped replace)",
            },
          ],
        };
      }

      // ── 1. validate（無駄な RPC 呼び出しを避ける）──
      const errors: ShiftImportSaveError[] = [];
      const rpcAnchors: ShiftImportRpcAnchor[] = [];
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
          return;
        }
        rpcAnchors.push({
          date: a.date,
          title: a.title,
          startTime: a.startTime,
          ...(a.endTime ? { endTime: a.endTime } : {}),
          rigidity: a.rigidity,
        });
      });

      const rpcIndicators: ShiftImportRpcIndicator[] = [];
      input.dayIndicators.forEach((ind, index) => {
        const indErrors = validateShiftDayIndicatorInput(ind);
        if (indErrors.length > 0) {
          errors.push({ kind: "indicator_invalid", index, errors: indErrors });
          return;
        }
        rpcIndicators.push({
          date: ind.date,
          kind: ind.kind,
          label: ind.label,
          countsAsPublicHoliday: ind.countsAsPublicHoliday,
          rawCode: ind.rawCode,
          semanticType: ind.semanticType,
        });
      });

      if (errors.length > 0) {
        return { ok: false, errors };
      }

      // ── 2. RPC 呼び出し（atomic / range-replace / conflict は関数側）──
      const result = await rpcClient.importShiftRoster({
        userId,
        importRange: input.importRange,
        source: { ...(input.source.originalFilename ? { originalFilename: input.source.originalFilename } : {}) },
        anchors: rpcAnchors,
        indicators: rpcIndicators,
      });

      // ── 3. 結果写像 ──
      if (result.status === "conflict") {
        return {
          ok: false,
          errors: [{ kind: "manual_indicator_conflict", dates: result.dates }],
        };
      }
      if (result.status === "error") {
        return {
          ok: false,
          errors: [{ kind: "persistence_failed", message: result.message }],
        };
      }

      // status === "ok": 保存された内容を input + 採番済 sourceId から再構成
      // （anchor / indicator の DB id は MVP では非公開。summary が count の正本）
      const sourceId = result.summary.sourceId;
      const savedAnchors: SavedShiftAnchor[] = input.anchors.map((a) => {
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
      const savedIndicators: SavedShiftDayIndicator[] = input.dayIndicators.map(
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

      return {
        ok: true,
        source: {
          id: sourceId,
          userId,
          sourceType: "shift_image",
          ...(input.source.originalFilename
            ? { originalFilename: input.source.originalFilename }
            : {}),
          capturedAt: now(),
        },
        anchors: savedAnchors,
        dayIndicators: savedIndicators,
        summary: result.summary,
      };
    },
  };
}
