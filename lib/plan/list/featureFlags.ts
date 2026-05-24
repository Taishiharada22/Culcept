/**
 * Phase 3-N List impl sub-phase 8a-pre — Feature flags (= CEO 案 1b、 コード内 const)
 *
 * 設計原則 (= CEO + GPT 合議 2026-05-24 案 1b 採用):
 *   - env 不使用 (= 規約 「DB / env / package / dependency 変更禁止」 文字通り遵守)
 *   - コード内 const のみ (= source code 変更で切替、 build deterministic)
 *   - default は **OFF** (= 既存 FlowTab 表示維持、 user 影響 0)
 *
 *   - 8a-impl: FlowTab 内で本 flag check → flag ON で 新 TimelineSpine 表示 / flag OFF で既存 FlowDaySection 表示
 *   - 8b: SourceIndicator / ExecutionLayerChip 統合 (= 同 flag 制御)
 *   - 8c: SummaryFooter の箱 (= 同 flag 制御)
 *   - **8c 完了後 closeout audit で flag 削除予定** (= 完全 migration)
 *
 * 二重表示防止 hard rule (= GPT 明示):
 *   - flag ON の時は、 旧 anchor list / 旧 inline empty / 旧 transition 表示を **同時に出さない**
 *   - 新 UI を足すのではなく、 **同じ責務の旧表示を差し替える**
 *
 * 設計書:
 *   - decision-log (= sub-phase 8 8a/8b/8c 分割方針 + 案 1b 採用)
 *   - app/(culcept)/plan/tabs/FlowTab.tsx (= 8a-impl で本 flag check)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LIST_NEW_TIMELINE_ENABLED — sub-phase 8a/8b/8c の新 List 表示 toggle
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 新 List 表示の有効化 flag (= sub-phase 8a/8b/8c 限定、 8c 完了後削除予定)
 *
 * - **false (default)**: 既存 FlowDaySection / AnchorRow / DayGraphTimeline transition 表示維持
 * - **true**: 新 TimelineSpine + EventCard + TransitionChip + EmptyDayEntry 表示 (= 旧表示は同責務範囲で消える、 二重表示防止)
 *
 * **コード切替手順** (= dogfood / visual smoke 用):
 *   1. 本 const を `true` に変更
 *   2. `npm run dev` で実機確認
 *   3. 確認後 `false` に戻す or 8c で本 const + 旧表示 code path 一括削除
 */
export const LIST_NEW_TIMELINE_ENABLED: boolean = false;
