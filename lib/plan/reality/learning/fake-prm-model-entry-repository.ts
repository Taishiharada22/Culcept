/**
 * Reality Control OS — A1-7-30 Fake M3 Model Entry Repository（**in-memory・NOT actual persistence**・test support）
 *   保存契約（insert / fail-open）を実 DB なしで検証。`persisted:false` marker。
 */
import type {
  PrmModelEntryInsertResult,
  PrmModelEntryInsertRow,
  PrmModelEntryRepository,
} from "./prm-model-entry-write";

export class FakePrmModelEntryRepository implements PrmModelEntryRepository {
  readonly kind = "fake_prm_model_entry_repository" as const;
  readonly persisted = false as const;
  private readonly store: PrmModelEntryInsertRow[] = [];
  private failNextCount = 0;

  setFailNext(times = 1): void {
    this.failNextCount = Math.max(0, times);
  }

  async insert(rows: readonly PrmModelEntryInsertRow[]): Promise<PrmModelEntryInsertResult> {
    if (this.failNextCount > 0) {
      this.failNextCount -= 1;
      return { ok: false, inserted: 0 };
    }
    this.store.push(...rows);
    return { ok: true, inserted: rows.length };
  }

  get rows(): readonly PrmModelEntryInsertRow[] {
    return this.store;
  }
  get count(): number {
    return this.store.length;
  }
}
