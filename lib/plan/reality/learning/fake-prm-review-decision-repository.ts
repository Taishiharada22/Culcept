/**
 * Reality Control OS — A1-7-30 Fake M2 Review Decision Repository（**in-memory・NOT actual persistence**・test support）
 *   保存契約（insert / id 返却 / fail-open）を実 DB なしで検証。`persisted:false` marker。
 */
import type {
  PrmReviewDecisionInsertResult,
  PrmReviewDecisionInsertRow,
  PrmReviewDecisionRepository,
} from "./prm-review-decision-write";

export class FakePrmReviewDecisionRepository implements PrmReviewDecisionRepository {
  readonly kind = "fake_prm_review_decision_repository" as const;
  readonly persisted = false as const;
  private readonly store: PrmReviewDecisionInsertRow[] = [];
  private failNextCount = 0;

  setFailNext(times = 1): void {
    this.failNextCount = Math.max(0, times);
  }

  async insert(rows: readonly PrmReviewDecisionInsertRow[]): Promise<PrmReviewDecisionInsertResult> {
    if (this.failNextCount > 0) {
      this.failNextCount -= 1;
      return { ok: false, inserted: 0, ids: [] };
    }
    const ids = rows.map((_, i) => `fake-review-${this.store.length + i}`); // M3 FK 用 fake id
    this.store.push(...rows);
    return { ok: true, inserted: rows.length, ids };
  }

  get rows(): readonly PrmReviewDecisionInsertRow[] {
    return this.store;
  }
  get count(): number {
    return this.store.length;
  }
}
