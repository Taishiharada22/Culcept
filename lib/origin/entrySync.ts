// lib/origin/entrySync.ts
// Entry Records の同期・マージロジック（純粋関数、テスト可能）

import type { EntryRecord } from "./entryContract";

// ---------------------------------------------------------------------------
// Merge logic — pure function, no side effects
// ---------------------------------------------------------------------------

export type MergeResult = {
  /** マージ後の全レコード（date降順） */
  merged: EntryRecord[];
  /** サーバーにアップロードすべきレコード（ローカルにしかない or ローカルが新しい） */
  toUpload: EntryRecord[];
  /** ローカルを更新すべきか（サーバー側が新しいレコードがあった） */
  localUpdated: boolean;
};

/**
 * ローカルとサーバーのレコードをマージする。
 * - 同一日は recordedAt が新しい方を採用
 * - ローカルにしかないレコードは toUpload に含める
 * - サーバーにしかないレコードはローカルに追加
 */
export function mergeEntryRecords(
  local: EntryRecord[],
  server: EntryRecord[],
): MergeResult {
  const map = new Map<string, EntryRecord>();
  const localMap = new Map<string, EntryRecord>();

  // まずローカルを基盤に
  for (const r of local) {
    map.set(r.date, r);
    localMap.set(r.date, r);
  }

  let localUpdated = false;
  const serverDates = new Set<string>();

  // サーバーレコードでマージ
  for (const r of server) {
    serverDates.add(r.date);
    const existing = map.get(r.date);
    if (!existing) {
      // サーバーにしかない → ローカルに追加
      map.set(r.date, r);
      localUpdated = true;
    } else if (r.recordedAt > existing.recordedAt) {
      // サーバーが新しい → サーバー側を採用
      map.set(r.date, r);
      localUpdated = true;
    }
    // ローカルが新しい or 同じ → そのまま
  }

  // ローカルにしかない or ローカルが新しいレコード → アップロード対象
  const toUpload: EntryRecord[] = [];
  for (const r of local) {
    if (!serverDates.has(r.date)) {
      // サーバーにない
      toUpload.push(r);
    } else {
      const serverRecord = server.find((s) => s.date === r.date);
      if (serverRecord && r.recordedAt > serverRecord.recordedAt) {
        // ローカルが新しい
        toUpload.push(r);
      }
    }
  }

  const merged = Array.from(map.values()).sort((a, b) =>
    b.date.localeCompare(a.date),
  );

  return { merged, toUpload, localUpdated };
}

/**
 * 90日以内のレコードだけを保持する
 */
export function trimToWindow(
  records: EntryRecord[],
  days: number = 90,
): EntryRecord[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return records.filter((r) => r.date >= cutoffStr);
}
