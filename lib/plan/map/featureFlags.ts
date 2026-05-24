/**
 * Phase 3-N Map impl sub-phase 9a-pre — Feature flags (= CEO 補正 #1、 list と分離した map module)
 *
 * 設計原則 (= CEO + GPT 合議 2026-05-24 readiness v2 補正 1):
 *   - **map に timeline 語混在禁止** (= List `LIST_NEW_TIMELINE_ENABLED` と語混在しない)
 *   - **list と分離した map module** (= 責務分離、 `lib/plan/list/featureFlags.ts` と別 file)
 *   - env 不使用 (= 規約 「DB / env / package / dependency 変更禁止」 文字通り遵守)
 *   - default は **OFF** (= 既存 MapTab 表示維持、 user 影響 0)
 *
 *   - 9a-impl: MapTab 内で本 flag check → flag ON で 新 BottomSheet / Pin / Route 表示 / flag OFF で既存表示
 *   - 9b: Legend / Controls / CategoryGrid 削除 / FAB 削除 (= 同 flag 制御)
 *   - 9c: 文字列統一 (= 同 flag 制御)
 *   - **9 closeout 後 flag 削除予定** (= 完全 migration)
 *
 * 二重表示防止 hard rule (= List 8a-impl pattern 流用):
 *   - flag ON の時は、 旧 SelectedAnchorCard / 旧 CategoryGrid / 旧 FAB を **同時に出さない**
 *   - 新 UI を足すのではなく、 **同じ責務の旧表示を差し替える**
 *
 * 設計書:
 *   - docs/alter-plan-map-redesign-impl-readiness.md v2 (= 3 点補正反映、 flag 名 + 場所)
 *   - app/(culcept)/plan/tabs/MapTab.tsx (= 9a-impl で本 flag check)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAP_NEW_SURFACE_ENABLED — sub-phase 9a/9b/9c の新 Map 表示 toggle
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 新 Map 表示 (= 「surface」) の有効化 flag (= sub-phase 9a/9b/9c 限定、 9 closeout 後削除予定)
 *
 * - **false (default)**: 既存 MapTab (= SelectedAnchorCard / CategoryGrid / FAB) 表示維持
 * - **true**: 新 MapBottomSheet + 新 MapPin + 抽象 route line + 削減 controls 表示 (= 旧表示は同責務範囲で消える、 二重表示防止)
 *
 * 「surface」 命名理由 (= CEO 補正 #1):
 *   - 「TIMELINE」 を避ける (= map に timeline 語混在禁止、 責務濁る)
 *   - 「SURFACE」 = map 上の 「面」 (= v3 spec §3 4 レイヤーの主体レイヤー B)
 *   - 新 Map 表示全体を 「surface」 として扱う
 *
 * **コード切替手順** (= dogfood / visual smoke 用):
 *   1. 本 const を `true` に変更
 *   2. `npm run dev` で実機確認
 *   3. 確認後 `false` に戻す or 9 closeout で本 const + 旧表示 code path 一括削除
 */
export const MAP_NEW_SURFACE_ENABLED: boolean = false;
