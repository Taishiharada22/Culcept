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
      const range = input.importRange; // const に束ね closure 内でも narrow 保持

      // ── 1. validate（無駄な RPC 呼び出しを避ける）──
      // hardening①: 全 date が importRange[start, endExclusive) 内（範囲外は孤児化するため reject）。
      //   ISO 文字列（YYYY-MM-DD）は辞書順比較で日付順に一致。
      const inRange = (date: string): boolean =>
        date >= range.start && date < range.endExclusive;
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
        if (!inRange(a.date)) {
          errors.push({
            kind: "anchor_invalid",
            index,
            errors: [
              {
                field: "date",
                code: "out_of_range",
                message: `date must be within importRange [${range.start}, ${range.endExclusive})`,
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
        if (!inRange(ind.date)) {
          errors.push({
            kind: "indicator_invalid",
            index,
            errors: [
              {
                field: "date",
                code: "out_of_range",
                message: `date must be within importRange [${range.start}, ${range.endExclusive})`,
              },
            ],
          });
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

      // hardening⑤: 同日重複防御（1 日 = 勤務 anchor か day_indicator のどちらか一方）。
      // anchors 内 / indicators 内 / anchors∩indicators の重複を一括検出（全 date を数えて >1）。
      const dateCount = new Map<string, number>();
      for (const d of [
        ...rpcAnchors.map((a) => a.date),
        ...rpcIndicators.map((i) => i.date),
      ]) {
        dateCount.set(d, (dateCount.get(d) ?? 0) + 1);
      }
      const dupDates = [...dateCount.entries()]
        .filter(([, c]) => c > 1)
        .map(([d]) => d)
        .sort();
      if (dupDates.length > 0) {
        errors.push({ kind: "duplicate_import_date", dates: dupDates });
      }

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
