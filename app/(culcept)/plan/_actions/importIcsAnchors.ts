"use server";

/**
 * P3 W3-4 — .ics anchor import server action (= 本実装、 W2 stub 置換)
 *
 * 設計書: docs/alter-plan-p3-ics-import-readiness.md §2 W3 (= CEO + GPT 4 補正)
 *
 * 役割:
 *   - IcsImportModal から 承認済 IcsAnchorDraft[] を受領
 *   - supabase.auth.getUser() で authenticated userId 取得 (= server-side authn)
 *   - 既存 anchors を listAnchors で取得 → externalUid Set で dedup
 *   - 残った draft を CreateExternalAnchorInput[] に変換 (= sourceType='ics'、 externalUid 注入)
 *   - repository.createSourceWithAnchors で source + anchors を一括 INSERT
 *   - 返却: imported / skipped 件数 (= UI で 「N 件取り込みました / M 件 重複でスキップ」 表示用)
 *
 * 不変原則 (= CEO + GPT 4 補正):
 *   1. rigidity は draft の値をそのまま保存 (= W2 preview で user 選択済、 hard 強制なし)
 *   2. authority='import_locked' は adapter 層の責務 (= sourceType='ics' から adapter が import_locked 化)
 *      本 action は authority を直接 set しない (= ExternalAnchor 型に authority field なし)
 *   3. dedup は **同 userId 内 externalUid 完全一致** で判定 (= 他 user の anchor とは衝突しない、 RLS 保証)
 *   4. **全 draft が重複** の場合 → source row も INSERT しない (= source 一覧汚染防止)
 *   5. auth 失敗 → ok:false、 「ログインが必要です」 (= 情報漏洩なし)
 *
 * W3 範囲外 (= W4 以降):
 *   - 既存 UID の update path (= 現在は skip のみ、 update は W4 検討)
 *   - originalFilename の永続化 (= 現在は notes に固定文言、 client から filename 渡す改修は W4)
 *   - 大量 INSERT の chunking (= 100 件以内想定、 超過対応は W4)
 *
 * 設計参考:
 *   - lib/plan/ics/icsToAnchorMapper.ts (= IcsAnchorDraft)
 *   - lib/plan/external-anchor-repository-supabase.ts (= createSourceWithAnchors / listAnchors)
 *   - app/(culcept)/plan/_actions/enhanceAlterNotes.ts (= supabaseServer + getUser pattern)
 */

import type { CreateExternalAnchorInput } from "@/lib/plan/external-anchor-input";
import type { CreateSourceWithAnchorsInput } from "@/lib/plan/external-anchor-repository";
import { createSupabaseExternalAnchorRepository } from "@/lib/plan/external-anchor-repository-supabase";
import {
  draftToAnchorInput,
  partitionDraftsByExistingUids,
} from "@/lib/plan/ics/importIcsAnchorsHelpers";
import type { IcsAnchorDraft } from "@/lib/plan/ics/icsToAnchorMapper";
import { supabaseServer } from "@/lib/supabase/server";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Result type (= W3 で client render contract 確定)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ImportIcsAnchorsResult =
  | { readonly ok: true; readonly imported: number; readonly skipped: number }
  | { readonly ok: false; readonly error: string };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main action
// (pure helpers は lib/plan/ics/importIcsAnchorsHelpers.ts に分離、 単体 test 用)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 承認済 .ics anchor draft 配列を永続化 (= W3 本実装)
 *
 * 手順:
 *   1. supabase.auth.getUser() → userId 取得 (= 失敗時 ok:false)
 *   2. repository.listAnchors(userId) → 既存 anchor の externalUid Set 構築 (= dedup base)
 *   3. drafts.partition({ kept, skipped }) by externalUid in Set
 *   4. kept.length === 0 → source も INSERT せず ok:true、 skipped 全件 return
 *   5. kept → CreateExternalAnchorInput[] 変換 + sourceType='ics' source 構築
 *   6. repository.createSourceWithAnchors → bundle 永続化 (= source + anchors atomic best-effort)
 *   7. error → ok:false + 1 行 message、 success → ok:true + imported / skipped 件数
 */
export async function importIcsAnchorsAction(
  drafts: IcsAnchorDraft[],
): Promise<ImportIcsAnchorsResult> {
  // ── 0. empty input 早期 return (= 余計な auth call 回避) ──
  if (drafts.length === 0) {
    return { ok: true, imported: 0, skipped: 0 };
  }

  // ── 1. authenticated userId 取得 (= server-side authn、 client 信頼しない) ──
  let userId: string | undefined;
  let client: Awaited<ReturnType<typeof supabaseServer>>;
  try {
    client = await supabaseServer();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user?.id) {
      return { ok: false, error: "ログインが必要です。" };
    }
    userId = data.user.id;
  } catch {
    return { ok: false, error: "認証に失敗しました。" };
  }

  // ── 2. repository + 既存 anchors 取得 (= dedup base) ──
  const repository = createSupabaseExternalAnchorRepository(client);
  let existingAnchors: Awaited<ReturnType<typeof repository.listAnchors>>;
  try {
    existingAnchors = await repository.listAnchors(userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    if (process.env.NODE_ENV !== "production") {
      console.warn("[plan/ics] listAnchors failed", { userId, msg });
    }
    return { ok: false, error: "既存予定の取得に失敗しました。" };
  }

  // ── 3. dedup partition (= externalUid 完全一致で skip、 pure helper) ──
  const { kept, skipped } = partitionDraftsByExistingUids(drafts, existingAnchors);

  // ── 4. 全件重複 → source 作らず early return (= source 一覧汚染防止) ──
  if (kept.length === 0) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[plan/ics] all_skipped", {
        userId,
        skipped,
      });
    }
    return { ok: true, imported: 0, skipped };
  }

  // ── 5. CreateSourceWithAnchorsInput 構築 ──
  let anchorInputs: CreateExternalAnchorInput[];
  try {
    anchorInputs = kept.map(draftToAnchorInput);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    if (process.env.NODE_ENV !== "production") {
      console.warn("[plan/ics] draftToAnchorInput failed", { msg });
    }
    return { ok: false, error: "予定の形式変換に失敗しました。" };
  }

  const bundle: CreateSourceWithAnchorsInput = {
    source: {
      sourceType: "ics",
      rawRetention: "discarded",
      notes: "iCalendar (.ics) から取り込み",
    },
    anchors: anchorInputs,
  };

  // ── 6. atomic persist (= RPC + fallback、 best-effort atomicity 内包) ──
  // P3 Phase A debug (= 2026-05-27 staging smoke 失敗解析用):
  // bundle payload の実値を log で確認 (= source_type / anchor 数 / 各 anchor の source_type 引きずり等)
  if (process.env.NODE_ENV !== "production") {
    console.info("[plan/ics] before createSourceWithAnchors", {
      userId,
      source: bundle.source,
      anchorCount: bundle.anchors.length,
      firstAnchor: bundle.anchors[0]
        ? {
            anchorKind: bundle.anchors[0].anchorKind,
            sourceType: bundle.anchors[0].sourceType,
            externalUid: bundle.anchors[0].externalUid,
            title: bundle.anchors[0].title,
          }
        : null,
    });
  }
  let result: Awaited<ReturnType<typeof repository.createSourceWithAnchors>>;
  try {
    result = await repository.createSourceWithAnchors(userId, bundle);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    if (process.env.NODE_ENV !== "production") {
      console.warn("[plan/ics] createSourceWithAnchors threw", { userId, msg });
    }
    return { ok: false, error: "予定の保存中にエラーが発生しました。" };
  }

  if (!result.ok) {
    // BundleError 配列の 1 件目を 1 行 message 化 (= UI 表示用、 詳細は server log)
    const firstError = result.errors[0];
    const detailMsg =
      firstError !== undefined
        ? firstError.kind === "source_invalid"
          ? `source 不正: ${firstError.errors[0]?.message ?? "詳細不明"}`
          : `anchor[${firstError.index}] 不正: ${firstError.errors[0]?.message ?? "詳細不明"}`
        : "詳細不明";
    if (process.env.NODE_ENV !== "production") {
      console.warn("[plan/ics] bundle insert rejected", {
        userId,
        errors: result.errors,
      });
    }
    return { ok: false, error: `予定の保存に失敗しました (${detailMsg})。` };
  }

  // ── 7. success ──
  if (process.env.NODE_ENV !== "production") {
    console.info("[plan/ics] import_success", {
      userId,
      imported: result.anchors.length,
      skipped,
      sourceId: result.source.id,
    });
  }

  return {
    ok: true,
    imported: result.anchors.length,
    skipped,
  };
}
