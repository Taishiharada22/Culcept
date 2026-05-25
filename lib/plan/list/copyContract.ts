/**
 * Phase 3-N List impl sub-phase 3 — List 専用 copy contract
 *
 * 設計原則 (= direction §11.5 確定 14 copy contract 継承):
 *   - 第 1+2+3 補正で確定 (= 3 件変更 / 11 件維持)
 *   - 自然な日本語維持 (= 過剰 framing 修正、 第 2 補正反省)
 *   - brand integration (= 「Alter Planning」 / 「Alter メモ」 / 「ALTER で見る」 統一)
 *
 * 禁止語 (= regression test で機械保証):
 *   `tests/unit/plan/list/copyContractRegression.test.ts` の FORBIDDEN_WORDS list 参照
 *   (= N-3a `lib/plan/emptyDayObservation.ts` 同 pattern、 lib file 内列挙は test file へ集約)
 *
 * 設計書:
 *   - docs/alter-plan-list-map-design-direction-audit.md §11.5
 *   - docs/alter-plan-list-redesign-spec-audit.md
 */

/**
 * List 専用 copy contract
 *
 * 構造:
 *   - Header / Navigation / Timeline / Source labels / CTA / Bottom tab / Empty day
 *
 * 各 copy は確定値、 regression test で禁止語不在 + 主要 copy 全文一致を機械保証。
 */
export const LIST_COPY_CONTRACT = {
  // Header (= layer 1、 direction §11.5 確定)
  sectionLabel: 'Alter Planning',
  headerTitle: '今日のプラン',
  listSubtitle: '時間の流れを把握して、 心地よい 1 日に。',

  // Navigation (= layer 2、 direction §11.5 確定)
  toggleMap: 'マップ',
  toggleList: 'リスト',

  // Timeline 関連 (= layer 3)
  acceptChipLabel: '受け入れる ›',
  acceptedHint: 'Alter 提案を受け入れ済',
  proposedChipLabel: '提案中',

  // Source state labels (= 第 7 補正 #1 多軸表現 状態ラベル、 FULL_VARIANT で表示)
  importedFromShift: 'シフト表から',
  importedFromTimetable: '時間割から',
  importedFromPdf: 'PDF から',

  // CTA (= 参考画像踏襲、 第 2 補正で revert 維持)
  detailButton: '詳細を見る',
  routeButton: 'ここへの経路',

  // Bottom tab (= direction §11.5 確定、 第 1 補正 + 第 3 補正)
  tabToday: '今日のプラン',
  tabInsight: 'インサイト',
  tabAlterMemo: 'Alter メモ',
  tabSettings: '設定',

  // Empty day (= N-3a `EMPTY_DAY_ENTRY_LABEL` と整合)
  emptyDayEntry: 'ALTER で見る ›',
} as const;

/** List copy contract type (= readonly literal) */
export type ListCopyContract = typeof LIST_COPY_CONTRACT;
