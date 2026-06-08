/**
 * Reality Control OS — A1-7-14 Fake PRM Learning Event Repository（**in-memory・NOT actual persistence**・test/dev support）
 *
 * 設計: docs/prm-learning-event-insert-path-design.md（A1-7-13・slice ②）/ §10.14
 *
 * 役割: `PrmLearningEventRepository` の **in-memory 実装**。実 DB / Supabase に **書かない**。
 *   保存契約（insert / idempotency / 失敗時の挙動）を **実 DB なしで検証**するための fake。
 *   `persisted: false` / `kind` marker で **本物の永続化でない**ことを明示。
 *
 * 厳守:
 *   - **no DB / no Supabase client / no network / no Date.now / no LLM**。
 *   - idempotency: key=(handle, action, acted_at) で dedup（A1-7-13 §6・将来 UNIQUE 相当を fake で再現）。
 *   - 失敗 simulation（`setFailNext`）は **throw でなく `{ ok:false }`** を返す → 呼び出し側 fail-open を検証可能。
 */

import type {
  PrmLearningEventInsertResult,
  PrmLearningEventInsertRow,
  PrmLearningEventRepository,
} from "./prm-learning-event-insert";

/** dedup key（A1-7-13 §6: handle + action + acted_at が action を一意識別）。 */
export function insertRowIdempotencyKey(row: PrmLearningEventInsertRow): string {
  return `${row.handle}::${row.action}::${row.acted_at}`;
}

export class FakePrmLearningEventRepository implements PrmLearningEventRepository {
  /** marker: **本物の永続化でない**（dev/test 専用）。 */
  readonly kind = "fake_prm_learning_event_repository" as const;
  readonly persisted = false as const;

  private readonly seen = new Map<string, PrmLearningEventInsertRow>();
  private failNextCount = 0;

  /** 次 N 回の insert を **graceful 失敗**（throw でなく ok:false）にする。fail-open 検証用。 */
  setFailNext(times = 1): void {
    this.failNextCount = Math.max(0, times);
  }

  async insert(rows: readonly PrmLearningEventInsertRow[]): Promise<PrmLearningEventInsertResult> {
    if (this.failNextCount > 0) {
      this.failNextCount -= 1;
      return { ok: false, inserted: 0 }; // throw しない（呼び出し側が fail-open で握れる）
    }
    let inserted = 0;
    for (const row of rows) {
      const key = insertRowIdempotencyKey(row);
      if (!this.seen.has(key)) {
        this.seen.set(key, row);
        inserted += 1; // dedup: 既知 key は skip（idempotent）
      }
    }
    return { ok: true, inserted };
  }

  /** 検証用: 保存された row（dedup 後・順序は挿入順）。 */
  get rows(): readonly PrmLearningEventInsertRow[] {
    return Array.from(this.seen.values());
  }

  /** 検証用: 件数。 */
  get count(): number {
    return this.seen.size;
  }
}
