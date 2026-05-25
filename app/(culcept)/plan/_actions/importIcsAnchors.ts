"use server";

/**
 * P3 W2-3 — .ics anchor import server action **stub** (= W3 で本実装)
 *
 * 設計書: docs/alter-plan-p3-ics-import-readiness.md §2 W2 (= GPT 補正 3)
 *
 * 役割 (= W2 stub):
 *   - IcsImportModal から 承認済 draft 配列を受領
 *   - **本 stub では永続化しない** (= server log で 受領内容観測のみ、 success: true return)
 *   - W3 で 完全 dedup (= UID 一致 update/skip) + authority="import_locked" + repository persist
 *
 * 不変原則:
 *   - W2: 副作用なし (= DB 書き込み 0)
 *   - W3 で stub 本体実装 (= 同 signature 維持、 client 側 IcsImportModal は不触)
 *   - return shape は client が永続化結果を render するための contract (= success / count / error)
 *
 * 設計参考:
 *   - lib/plan/ics/icsToAnchorMapper.ts (= IcsAnchorDraft)
 *   - app/(culcept)/plan/_actions/enhanceAlterNotes.ts (= server action pattern)
 */

import type { IcsAnchorDraft } from "@/lib/plan/ics/icsToAnchorMapper";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Result type (= W3 まで shape 固定、 client の render contract)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ImportIcsAnchorsResult =
  | { readonly ok: true; readonly imported: number; readonly skipped: number }
  | { readonly ok: false; readonly error: string };

/**
 * 承認済 .ics anchor draft 配列を server に送信 (= W2 stub、 永続化なし)
 *
 * **W2 stub の挙動**:
 *   - 受領内容を server log で観測 (= `[plan/ics] import_stub`)
 *   - 即時 success return (= imported = drafts.length、 skipped = 0)
 *   - DB / repository への書き込み **なし**
 *
 * **W3 本実装で追加されるもの**:
 *   - supabase.auth.getUser で userId 取得
 *   - external_anchor_sources INSERT (= source_type='ics')
 *   - 各 draft の UID で既存 anchor 検索 → dedup (= skip / update)
 *   - external_anchors INSERT (= confirmed_at = NOW())
 *   - authority="import_locked" を sourceProvenance 経由設定
 *   - error 時 ok=false + reason
 */
export async function importIcsAnchorsAction(
  drafts: IcsAnchorDraft[],
): Promise<ImportIcsAnchorsResult> {
  // W2 stub: 受領内容観測のみ
  if (process.env.NODE_ENV !== "production") {
    console.info("[plan/ics] import_stub", {
      draftsCount: drafts.length,
      anchorKinds: drafts.map((d) => d.anchorKind),
      titlePreview: drafts.slice(0, 3).map((d) => d.title),
    });
  }

  // W2 では即時成功 return (= imported = drafts.length、 skipped = 0)
  // W3 で 実 persist + dedup logic 追加
  return {
    ok: true,
    imported: drafts.length,
    skipped: 0,
  };
}
