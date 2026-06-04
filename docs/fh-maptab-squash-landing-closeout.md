# FH MapTab 復元 — ローカル main squash 着地 closeout

> 2026-06-05 / セッション `claude/nifty-turing-128e67` / 承認: CEO（視覚 smoke OK でフェーズ closeout）

## 概要
frosty-hellman セッションで完成した MapTab モビリティ体験を、**ローカル main へ squash 着地**。CEO の main 合流後 MapTab 視覚 smoke が OK となり、MapTab 復元フェーズを closeout する。

## 着地
- **squash commit: `d4db3c97`**（単一親 `f82666aa`）= main HEAD
- source: `claude/plan-maptab-reconcile`（`39afdce2`・15 commit の完全履歴）
- 範囲: **21 files / +1927 −37**（`MapTab.tsx` / `tabs/_helpers.ts` / `components/plan/map/MobilityLegCard.tsx` / `lib/plan/map/{directionsService,legState,routeMode,routeStyle,selectedModeStore}.ts` / tests 14本）
- 衝突面 **0**（main の Reality Control OS `lib/plan/reality/*` と完全分離・`git merge-tree` exit 0）

## CEO 決定（固定・§11.4）
1. **transportMode 正本語彙 = RouteTransportMode**（FH MapTab 9語）
2. **表示哲学**: timeline / movementDisplayContract = 「移動 約N分」保守表示を維持 ／ MapTab `MobilityLegCard` = per-mode 比較を「おすすめでなく判断材料」として progressive disclosure 表示
3. **正本の置き場所**: `lib/plan/transport` を据え置き（`lib/shared/mobility.ts` は将来の共有化候補）
4. **MapTab アーキ**: nifty/main の薄い+hooks 基盤を採用（frosty monolith を丸ごと merge/cherry-pick しない）。FH で画面上にあった体験は復元済として今後壊さない

## 検証（squash 用 zero-loss・全 PASS）
- **diff-equivalence**: FH footprint で `main` == `claude/plan-maptab-reconcile` 差分ゼロ（squash でも成果は source と完全一致）
- **tsc**: FH footprint（MapTab/lib/plan/map/MobilityLegCard）= **0 errors**。総数 1114 は main 既存 baseline（decision-log「tsc source baseline 1112」相当）。FH に global 宣言なし＝**着地 tsc-neutral**
- **test**: 838/841 files passed。3 failed は**負荷 flake**（単独再実行で 3 files / 85 tests 全 PASS・全て FH footprint 外・既知 flake #207）
- **dangling**: A2 server Routes 残骸ゼロ（`app/api/plan/leg-durations/route.ts` 不在 ／ `NEXT_PUBLIC_PLAN_LEG_DURATIONS` 参照なし ／ `plan/leg-durations` 参照なし）
- **実機 smoke**: CEO 視覚確認 **OK**（main 合流後）

## backup / safety（保持・削除しない）
- tag `safety/main-pre-fh-landing`（f82666aa）／ `safety/fh-maptab-restore-source`（39afdce2）
- source branch `claude/plan-maptab-reconcile`
- repo 外 bundle `/Users/haradataishi/Culcept-backups/fh-maptab-restore-39afdce2.bundle`（complete history・verify OK）

## 制約遵守
- **push / PR / GitHub 操作なし**（ローカル main のみ。origin/main は 5a0c0f7e のまま）

## 次フェーズ
モビリティ深化（第二の自己化する地図 / 移動レパートリー学習 / selected↔actual 観測 / scrutability / 天候・荷物・疲労・急ぎ）。
**いきなり実装せず、deep research → 進め方ブラッシュアップ → mini design → CEO 判断で実装**、の順で進める。
