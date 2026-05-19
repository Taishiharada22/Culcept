# Alter Plan Home Swipe — Full Plan Pane **Phase 1 完了** 結果整理

**作成日**: 2026-05-20
**Status**: Phase 1 UI 統合 PASS、W1-Z apply 待ち
**関連**:
  - `docs/alter-plan-home-swipe-full-plan-pane-mini-design.md` (Phase 1 設計)
  - `docs/alter-plan-w1z-production-migration-apply-runbook.md` (本 PR の対、W1-Z apply 手順)
  - `docs/alter-plan-home-swipe-visual-smoke.md` (smoke runbook、Phase 1 更新済)
**branch**: `docs/alter-plan-phase1-close-and-w1z-runbook`

---

## 0. 結論

| 項目 | 状態 |
|------|------|
| **Phase 1 UI 統合** | **PASS** (CEO 視覚 smoke 2026-05-20 確認) |
| **Plan data layer** | **未稼働** (W1-Z production migration apply 待ち) |
| **次の最短 path** | W1-Z apply (本 PR 対の runbook 参照) → 再 smoke で 500 → 200 確認 |

---

## 1. 達成事項 (Phase 1 PASS 認定 部分)

### 1.1 構造完成 (CEO 完成形「Home → swipe → Plan 本体」直接到達)

| 項目 | 結果 | PR |
|------|------|-----|
| HomeSwipeContainer の wrapper 構造 | ✅ | #212 (initial) |
| Pane isolation (CSS containing block 修正) | ✅ | #214 |
| Graceful degradation (HomePlanPane summary fetch fail → empty) | ✅ (Phase 1 で削除) | #216 |
| **PlanClient displayMode prop (route / pane)** | ✅ | **#219 (Phase 1 C1)** |
| **Home wrapper を PlanClient(pane) に置換** | ✅ | **#219 (Phase 1 C1)** |
| **HomePlanPane / home-plan-summary 削除** | ✅ | **#219 (Phase 1 C1)** |
| **Tab UI を pill segmented control に refactor** | ✅ | **#219 (Phase 1 C2)** |
| **Tab label を "カレンダー / リスト / 地図" に変更** | ✅ | **#219 (Phase 1 C2)** |
| **Modal 開時の swipe / keyboard disable** | ✅ | **#219 (Phase 1 C3)** |
| visual smoke docs を Phase 1 完成形に更新 | ✅ | #219 (Phase 1 C3) |

### 1.2 CEO 視覚 smoke 観測結果 (2026-05-20)

CEO 確認済 (本 PR より前の smoke report):

- ✅ Home から横スワイプで Plan 本体 pane に移動できる
- ✅ summary pane ではなく、**PlanClient 本体** が表示されている
- ✅ Plan title が表示される
- ✅ カレンダー / リスト / 地図 tab が表示される
- ✅ "+ 教える" / "📋 教えた予定" が表示される
- ✅ 画面の埋め込みは成功している
- ❌ Plan pane 内で「読み込みに失敗しました / 500 Internal error」が表示される
  → これは **埋め込み失敗ではなく、Production Supabase に Plan tables 未 apply による API 失敗**

→ **UI 統合は完全 PASS**、data layer は W1-Z 待ち。

### 1.3 自立推論 Beyond 設計の振り返り

Phase 1 で組み込んだ beyond 設計の検証:

| 設計 | 効果 |
|------|------|
| CSS containing block 修正 (PR #214) | AneurasyncHome の `fixed inset-0` を pane に閉じ込め、Plan pane の z-stacking 確保 |
| Modal Swipe Lock (module-level counter + useSyncExternalStore) | 4 modal すべてに 1 行追加で透過的に lock 統合、idempotent release で robust |
| PlanClient displayMode prop | route mode と pane mode で chrome のみ差分、fetch / Modal / tab logic は完全共通、bug surface 最小 |
| Tab UI pill segmented | 両 mode (route / pane) で共通の UI、CEO mock 整合 |
| graceful degradation の段階廃止 | Phase 0 で導入した HomePlanPane の error handling は Phase 1 で不要化、PlanClient の既存 ErrorState に統合 |

---

## 2. 未達成 / 未着手事項 (Phase 2 / 3 / W1-Z 預け)

### 2.1 W1-Z production migration apply (最優先、別 wave)

**現状**:
- Production Supabase に Plan tables 不在 (`external_anchor_sources` / `external_anchors`)
- Production Supabase に W1-Y RPC 関数不在 (`create_external_anchor_bundle`)
- `/api/plan/anchors` GET → 500 Internal error → PlanClient ErrorState

**解決方法**: 本 PR の対 `docs/alter-plan-w1z-production-migration-apply-runbook.md` に従い CEO が apply (約 5 分)。

### 2.2 Phase 2: tab 内部 UI を CEO mock 寄せ (別 wave)

| Phase | 内容 | 優先度 |
|-------|------|--------|
| **Phase 2-A** | CalendarTab を週ビュー → **月ビュー** に refactor | 高 (mock 中央 UI) |
| **Phase 2-B** | FlowTab を timeline → **image thumbnail リスト** に refactor | 中 (mock 表現整合) |
| **Phase 2-C** | MapTab に **Google Maps integration** + route 描画 | 大 (API key + 地理計算 + route logic) |

### 2.3 Phase 3: 空き日 → ALTER 提案 flow (別 wave)

- 予定なし日タップ → ALTER 自然質問
- 提案チップ → おすすめ提案 (タイトル + 画像) → 1tap で予定作成
- Stargazer / Alter engine 接続が必要 (大型設計)

### 2.4 W1-Z+ (post-W1-Z cleanup)

W1-Z apply 完了 + 1 週間観測で `rpc_fallback` 0 確認後、別 wave で:
- `lib/plan/external-anchor-repository-supabase.ts` の sequential fallback path 削除
- `SupabaseRepoLogEvent.orphan_source` / `compensating_delete_attempted` 型削除
- `lib/plan/supabase-error-mapping.ts` の `shouldFallbackFromRpcError` 削除
- 関連 test cleanup

---

## 3. observability / 監視項目 (Phase 1 後の運用)

### 3.1 Sentry / 構造化 log 観測 (CEO daily check 推奨)

| 観測対象 | 期待値 | 異常時 action |
|----------|--------|---------------|
| `[HomeSwipeContainer]` 系 error | 0 | DevTools console 確認 + 再現条件記録 |
| `[Plan]` 系 critical | 通常運用範囲 | 多発なら root cause investigation |
| `rpc_fallback` 発火 (W1-Z apply 前) | 通常 (Plan tables 不在のため) | apply 後 0 に減ること期待 |
| `rpc_fallback` 発火 (W1-Z apply 後) | 0 に近づく | 持続発火なら function / RLS 確認 |
| `/api/plan/anchors` 500 率 (W1-Z apply 前) | 100% (tables 不在) | apply 後 0% に変わること期待 |
| `/api/plan/anchors` 500 率 (W1-Z apply 後) | 0% | 残れば schema / RLS / index 確認 |

### 3.2 user 体験 metric (Phase 1 PASS 後)

| metric | 取得方法 | 観測理由 |
|--------|---------|----------|
| Home → 左 swipe → Plan pane 遷移率 | Sentry breadcrumb (今後) | direct access UX の検証 |
| Plan pane 内 CRUD 完走率 | API log (POST/DELETE 200) | Modal 動作の実利用検証 |
| Modal 開時の swipe 誤発火 0 | Sentry: pane 切替時 modal open count | swipe lock の実効性検証 |

---

## 4. 残課題と次 wave の順序

### 推奨 sequence

```
[Phase 1 PASS (UI 統合) — 2026-05-20]
          ↓
[本 PR 対の W1-Z apply runbook 整備] ← 本 PR
          ↓
[W1-Z apply (CEO 操作、約 5 分)]
          ↓
[再 smoke で 500 → 200 確認]
          ↓
[Phase 1 完全 PASS 認定]
          ↓
[Phase 2-A: CalendarTab 月ビュー化 (大きい UI 変更、別 mini design 起票)]
          ↓
[Phase 2-B / 2-C / Phase 3: CEO 判断による順序]
          ↓
[W1-Z+ cleanup (W1-Z 後 1 週間観測後、別 wave)]
```

### 並列可能な選択肢

- **W1-Z apply** と **Phase 2-A 設計起票** は独立で並列可能
- ただし Phase 2 実装着手前に W1-Z apply 完了が望ましい (UI 開発時に実データで検証可能になる)

---

## 5. CEO 判断点 (本 PR merge 後)

| # | 判断 | 選択肢 |
|---|------|--------|
| 1 | **W1-Z apply の timing** | A. 即時 / B. β user 招待前 / C. Phase 2 着手前 / D. 永続 fallback (apply しない) |
| 2 | **Phase 2 着手順序** | 2-A → 2-B → 2-C / 2-A のみ / 全部保留 |
| 3 | **Phase 3 (空き日 → ALTER flow) の優先度** | Phase 2 完了後 / Stargazer 観測完了後 / 別 wave |
| 4 | **W1-Z+ cleanup の timing** | apply + 1 週観測後 / 必要性が確認できたら |

### 推奨 default route

**最短 PMF path**:

1. **W1-Z apply** (本 PR の対 runbook、約 5 分) ← **最優先**
2. **再 smoke** で Plan pane 500 → 200 確認、Phase 1 完全 PASS 認定
3. **Phase 2-A 設計起票** (CalendarTab 月ビュー、mini design docs)
4. CEO 判断後 Phase 2-A 実装着手

---

## 6. 制約遵守 (本 PR の docs only スコープ)

- ✅ コード変更なし (docs only)
- ✅ CoAlter / Mirror / /talk / D-* 不触
- ✅ Production / all-Preview env 不触
- ✅ Production migration apply は本 PR で行わない (CEO 操作、本 PR の対 runbook 参照)
- ✅ migration / service_role / DB password / connection string 不使用
- ✅ DraftPlan / W1-6 不触
- ✅ AneurasyncHome.tsx / lib/plan/external-anchor-* / lib/plan/anchor-fetch.ts 完全不変方針継続
- ✅ /plan 直 URL 互換維持 (route mode で従来表示)

---

## 7. References

- PR #212 (Phase 0 initial)
- PR #214 (pane isolation fix)
- PR #216 (graceful degradation)
- PR #218 (Phase 1 mini design)
- PR #219 (Phase 1 C1-C3 実装)
- `docs/alter-plan-home-swipe-full-plan-pane-mini-design.md`
- `docs/alter-plan-home-swipe-visual-smoke.md` (Phase 1 対応版)
- `docs/alter-plan-w1z-production-migration-apply-runbook.md` (本 PR の対)
- `docs/alter-plan-w1z-production-migration-decision.md` (W1-Z 判断資料)
- `docs/alter-plan-a2-atomicity-tradeoff.md` (A-2 / W1-Y 軌跡)

---

## 8. 変更履歴

| 日付 | 変更 | 承認 |
|------|------|------|
| 2026-05-20 | Phase 1 UI 統合 PASS 認定 + W1-Z apply 起票準備 | CEO smoke 確認 (2026-05-20) |

---

**End of Phase 1 Closure**. 本 PR merge 後、CEO は対の `alter-plan-w1z-production-migration-apply-runbook.md` に従い W1-Z apply を実施 (約 5 分)。
