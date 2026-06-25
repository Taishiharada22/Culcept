# production vs local main clean-rebuild 監査（2026-06-24）

> read-only 監査（8-agent workflow `wf_ae49ad74-ce2`・worktree=local main `aa331c3d3`）。production は read-only link→table-stats→即 unlink で再取得（write/apply ゼロ）。
> 数値正本: **production = 397 table / staging = 280 / local main migration 定義 = 274 / production-only 真の gap = 146（全て migration 未定義）**。

## 0. 全体像（最重要認識）
- **production = 旧 fashion/e-commerce/live-shopping/collab-drop プロダクトの legacy 環境**。第二の自己/Stargazer/Plan への pivot 前の歴史的スキーマ。
- **local main = pivot 後の現プロダクト**（login/stargazer/alter/origin/calendar/plan/rendezvous + my-style 新スキーマ）。production の歴史的スキーマの**大半を持たない別系統**。
- → 「最新 staging を元に clean production を作り直す」は **そのままでは不可**。理由: 現コードが **15 table を能動 `.from()` 参照しているが、その 15 は staging にも local migration にも無い**（production のみ）。補完しないと clean rebuild で login/性格診断/stargazer/recommendation/calendar/genome/通報が破綻する。

## 1. 146 gap の status 別集計
| status | 件数 | 意味 | clean rebuild |
|---|---|---|---|
| **must_keep_genuine_gap** | **15** | 現コードが実 `.from()` 稼働だが migration 不在 | 🔴 **補完必須**（欠落で CEO 必須機能破綻） |
| superseded_renamed | 12 | 新スキーマへ rename 集約済（旧名は production 残骸） | ✅ 新名で再現済 |
| legacy_orphan | ~72 | 現コード参照ゼロ（旧 EC item/旧 dating/pc_*/logs） | 復元不要（production backup 保存） |
| deprecated_feature | ~44 | 旧製品機能（collab_drop_*/live_*/trend_*/community_*/stripe） | 復元不要（production backup 保存） |
| rendezvous_separate（旧 dating） | 3 | sg_*/date_fit 旧資産（現 rendezvous_* とは別物） | 移植対象 |

> 注: 現 **rendezvous は `rendezvous_*` namespace（prod 78 / migration 44）で 146 gap に非該当**＝clean rebuild で再現可能。gap 内の dating 残骸（sg_*/date_fit/proximity/handshake/user_seek）は旧 tinder 型で現 rendezvous と無関係。

## 2. must_keep_genuine_gap 全 15 件（clean rebuild で失われる CEO 必須機能）
### A. login / 性格診断 / stargazer コア（5・login flow 直撃）
- **`stargazer_star_maps`**（最優先・9 files）: `lib/baseline/requireBaseline.ts:29` が login 後の baseline ゲートで star_maps 有無を判定→**不在で login flow 破綻**。profile 主取得 / observations upsert `[CRITICAL]` / 匿名移管 / home 到達判定。`20260101000000_layer1_minimal_base.sql` は兄弟 6 table を再構築するのに star_maps だけ脱落。
- **`stargazer_personality_profile`**（3 files）: profile route / my-style bridge / mergeAnonymousData の直 query。
- **`personality_dimensions`**（8 files）: 確定観測の主ソース（45/11 軸）。talk/coalter/genome/avatar-fitting/genome-card が直 read。fallback=stargazer_axis_snapshots[staging有]。
- **`personality_insights`**（3 files）: stargazer insights API 等。
- **`personality_sync_level`**（4 files）: genome-card/genome 集約。

### B. recommendation / curated（4・/plan calendar・提案直撃）
- **`curated_cards`**（22 files・最広依存）: `lib/calendar/generator.ts:305`（**/plan calendar=保守対象**）/ recommendations 全 route / discover / stylist。
- **`recommendation_actions`**（14）/ **`recommendation_impressions`**（21）/ **`recommendation_ratings`**（16）: reco engine + calendar outfits + stargazer cross-sync。

### C. genome が consume する旧 dating イベント（3）
- **`swipe_events`**（3）/ **`pre_matches`**（1）/ **`match_feedback_events`**（1）: `lib/genome/assembleForUser.ts` 等が read（rendezvous 分離時も**本体に残す**）。

### D. ops / 通報基盤（3）
- **`reports`**（3・通報モデレーション）/ **`ops_action_logs`**（1）/ **`product_analytics`**（1・drops 分離なら deprecated 化候補）。

> **⚠ writer 不在の注意（R2）**: personality_dimensions/insights/sync_level/stargazer_personality_profile は local main に `.select` のみで **writer が無い**（production の観測 pipeline が populate していた前提）。table 作成だけでは「読めるが空」→ 性格診断確定値の **populate 経路の有無を別途確認要**。

## 3. clean-production path 評価 + CEO 3 案の再評価
**推奨 = ② staging 昇格（+ 15 gap 補完）**
| 案 | 評価 | 根拠 |
|---|---|---|
| ① repair + selective apply | △ | production legacy drift（history drift＋真の未適用混在）・`db push` 禁止・人力工数大 |
| **② staging 昇格** | **◎ 推奨** | staging(280) は migration(274) と整合する clean canonical。ただし staging も 15 gap が無い→**②＋15 gap を migration 化→staging 先行 apply→昇格** が現実解。drift 回避・project 移行リスク回避 |
| ③ 新 project clean 再構築 | ○ | 最もクリーンだが 15 gap migration 化が同じく前提 + project 採番/env/storage/auth 移行 + cutover リスク最大 |

**②の手順**: (1) 15 table を production からスキーマ抽出→冪等 `create table if not exists` migration 新規追加（local main/staging 両系）(2) staging 先行 apply→full suite + login/baseline/profile/calendar/recommendation E2E 検証（tsc55維持）(3) populate pipeline 確認 (4) CEO GO + DB owner 同席で staging を新 production canonical に昇格。
理由: 15 gap 補完はどの案でも必須なので ②の追加コストは相対最小。

## 4. rendezvous 分離骨子（CEO ①）
- 現 rendezvous は `rendezvous_*` namespace で自己完結（prod 78 / migration 44 / **code 572 files**: components/rendezvous 146・lib/rendezvous 122・app/(immersive)/rendezvous 28route・app/api/rendezvous 160+）。146 gap に非該当（migration で再現される）。
- 分離単位: rendezvous_* core + orbiter_*（関係判断 engine・lib/orbiter 38 files）+ encounter_events/tribe_memberships + avatar Anima（avatar_conversations 等）。
- **境界注意**: pre_matches/swipe_events/match_feedback_events は genome/avatar が read＝**本体に残す**。conversations/messages は drops DM で rendezvous_chats とは別物。
- 移植（削除せず）→ 別 project で保守。

## 5. production 資産で保全（消さない・CEO「資産いらないわけでない」）
- **data backup（cutover 前に dump）**: 15 must-keep の実データ（特に personality_dimensions/stargazer_star_maps/curated_cards/recommendation_*＝再生成困難）・rendezvous_*/orbiter_* 観測ログ・orders/stripe_events（法務/会計）・reports・aneurasync_*_logs（AI 監査証跡）。
- **移植**: rendezvous 一式→別 project / 15 gap→migration 化して canonical 昇格 / writer 不在 4 table の populate pipeline 特定。
- **削除しないが canonical 復元せず**: deprecated 44 + legacy_orphan 72（drops/shops の「生きてるが導線外」コードは将来 route 整理対象・即削除しない）。

## 6. 残リスク / 次アクション（CEO 判断待ち）
- **R1 15 gap の migration 化（最大 blocker）**: production からスキーマ抽出→冪等 migration（CEO GO）。
- **R2 populate pipeline の所在**（writer 不在 4 件）: 観測 pipeline writer を read-only 特定（別タスク）。
- **R3 B-7 production drift**（既知・`docs/b7-production-migration-rehabilitation-plan.md`）: 推奨②は staging 経由で回避。
- **R4 drops 分離時の reports/product_analytics 再分類** / **R5 rendezvous 移植 GO** / **R6 ①②③ 確定（②推奨）** / **R7 CLI link 二重確認**。

**結論**: clean-production は技術的に可能だが **15 must_keep_genuine_gap の migration 化がどの案でも必須前提**。最小リスク = **② staging 昇格 + 15 gap 補完**。rendezvous 分離は gap 復旧と独立（namespace 自己完結でクリーン）。production 実体は全 backup 保存・削除しない。
